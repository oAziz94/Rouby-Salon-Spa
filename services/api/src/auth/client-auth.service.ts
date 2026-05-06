import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ClientOtpPurpose } from '@prisma/client';
import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { CLIENT_JWT_AUDIENCE } from './auth.constants';
import type { ClientAccessTokenPayload } from './client-jwt-payload.interface';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePhoneToE164 } from '../common/phone/phone.util';

@Injectable()
export class ClientAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  private buildCodeHash(code: string): string {
    const secret = this.config.get<string>('OTP_CODE_SECRET', '');
    return createHash('sha256').update(`${code}:${secret}`).digest('hex');
  }

  private getOtpTtlSeconds(): number {
    return Number(this.config.get<string>('CLIENT_OTP_TTL_SECONDS', '300'));
  }

  private getOtpMaxAttempts(): number {
    return Number(this.config.get<string>('CLIENT_OTP_MAX_ATTEMPTS', '5'));
  }

  private getOtpRequestCooldownSeconds(): number {
    return Number(
      this.config.get<string>('CLIENT_OTP_REQUEST_COOLDOWN_SECONDS', '60'),
    );
  }

  private getNodeEnv(): string {
    return this.config.get<string>('NODE_ENV', 'development');
  }

  private verifyCode(expectedHash: string, submittedCode: string): boolean {
    const submittedHash = this.buildCodeHash(submittedCode.trim());
    return timingSafeEqual(
      Buffer.from(expectedHash, 'utf8'),
      Buffer.from(submittedHash, 'utf8'),
    );
  }

  private otpInvalidException(): UnauthorizedException {
    return new UnauthorizedException({
      statusCode: 401,
      message: 'OTP code is invalid.',
      error: 'Unauthorized',
      code: 'OTP_INVALID',
    });
  }

  async requestOtp(phoneInput: string): Promise<{
    success: true;
    expiresIn: number;
    phone: string;
    devCode?: string;
  }> {
    const phone = normalizePhoneToE164(phoneInput);
    const now = new Date();
    const cooldownWindowStart = new Date(
      now.getTime() - this.getOtpRequestCooldownSeconds() * 1000,
    );

    const recentRequest = await this.prisma.clientOtpCode.findFirst({
      where: {
        phone,
        purpose: ClientOtpPurpose.LOGIN,
        createdAt: { gte: cooldownWindowStart },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (recentRequest) {
      throw new HttpException(
        {
          statusCode: 429,
          message: 'Please wait before requesting another verification code.',
          error: 'Too Many Requests',
          code: 'OTP_RATE_LIMITED',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const expiresIn = this.getOtpTtlSeconds();
    const expiresAt = new Date(now.getTime() + expiresIn * 1000);
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = this.buildCodeHash(code);

    await this.prisma.clientOtpCode.create({
      data: {
        phone,
        codeHash,
        expiresAt,
        purpose: ClientOtpPurpose.LOGIN,
      },
    });

    const isNonProduction = this.getNodeEnv() !== 'production';
    return {
      success: true,
      expiresIn,
      phone,
      ...(isNonProduction ? { devCode: code } : {}),
    };
  }

  async verifyOtp(
    phoneInput: string,
    codeInput: string,
  ): Promise<{
    accessToken: string;
    expiresIn: number;
    client: {
      id: string;
      fullName: string;
      phone: string;
      email: string | null;
    };
  }> {
    const phone = normalizePhoneToE164(phoneInput);
    const now = new Date();
    const otp = await this.prisma.clientOtpCode.findFirst({
      where: {
        phone,
        purpose: ClientOtpPurpose.LOGIN,
        consumedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.expiresAt <= now) {
      throw this.otpInvalidException();
    }
    if (otp.attempts >= this.getOtpMaxAttempts()) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'OTP attempts exceeded. Request a new code.',
        error: 'Unauthorized',
        code: 'OTP_ATTEMPTS_EXCEEDED',
      });
    }
    if (!/^\d{4,8}$/.test(codeInput.trim())) {
      throw this.otpInvalidException();
    }
    if (!this.verifyCode(otp.codeHash, codeInput)) {
      await this.prisma.clientOtpCode.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw this.otpInvalidException();
    }

    await this.prisma.clientOtpCode.update({
      where: { id: otp.id },
      data: { consumedAt: now },
    });

    const existing = await this.prisma.client.findUnique({ where: { phone } });
    const client = existing
      ? await this.prisma.client.update({
          where: { id: existing.id },
          data: { phone },
          select: { id: true, fullName: true, phone: true, email: true },
        })
      : await this.prisma.client.create({
          data: {
            fullName: `Client ${phone.slice(-4)}`,
            phone,
            email: null,
          },
          select: { id: true, fullName: true, phone: true, email: true },
        });

    const expiresIn = parseExpiresInToSeconds(
      this.config.get<string>('CLIENT_JWT_EXPIRES_IN', '8h'),
    );
    const payload: ClientAccessTokenPayload = { sub: client.id };
    const accessToken = await this.jwtService.signAsync(payload, {
      audience: CLIENT_JWT_AUDIENCE,
      expiresIn,
    });

    return { accessToken, expiresIn, client };
  }

  async getMe(clientId: string): Promise<{
    id: string;
    fullName: string;
    phone: string;
    email: string | null;
    profileImageUrl: string | null;
    gender: string | null;
    birthDate: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }> {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        fullName: true,
        phone: true,
        email: true,
        profileImageUrl: true,
        gender: true,
        birthDate: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!client) {
      throw new UnauthorizedException('Client not found');
    }
    return client;
  }

  logout(): void {
    return;
  }
}

function parseExpiresInToSeconds(value: string): number {
  const v = value.trim();
  if (/^\d+$/.test(v)) {
    return Number(v);
  }
  const m = /^(\d+)(s|m|h|d)$/i.exec(v);
  if (!m) {
    return 8 * 3600;
  }
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  switch (unit) {
    case 's':
      return n;
    case 'm':
      return n * 60;
    case 'h':
      return n * 3600;
    case 'd':
      return n * 86400;
    default:
      return 8 * 3600;
  }
}
