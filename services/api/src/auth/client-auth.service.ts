import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ClientOtpPurpose } from '@prisma/client';
import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { CLIENT_JWT_AUDIENCE } from './auth.constants';
import type { ClientAccessTokenPayload } from './client-jwt-payload.interface';
import { ClientOtpRequestIntent } from './dto/client-otp-request-intent.enum';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePhoneToE164 } from '../common/phone/phone.util';
import { OTP_DELIVERY, type OtpProvider } from './otp/otp-provider.interface';

type ClientAuthProfile = {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
};

@Injectable()
export class ClientAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @Inject(OTP_DELIVERY) private readonly otpDelivery: OtpProvider,
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

  private resolveRequestPurpose(
    intent?: ClientOtpRequestIntent,
  ): ClientOtpPurpose {
    if (!intent || intent === ClientOtpRequestIntent.LOGIN) {
      return ClientOtpPurpose.LOGIN;
    }
    if (intent === ClientOtpRequestIntent.SIGN_IN) {
      return ClientOtpPurpose.SIGN_IN;
    }
    return ClientOtpPurpose.REGISTER;
  }

  async requestOtp(
    phoneInput: string,
    intent?: ClientOtpRequestIntent,
  ): Promise<{
    success: true;
    expiresIn: number;
    phone: string;
    devCode?: string;
  }> {
    const phone = normalizePhoneToE164(phoneInput);
    const purpose = this.resolveRequestPurpose(intent);
    const now = new Date();
    const cooldownWindowStart = new Date(
      now.getTime() - this.getOtpRequestCooldownSeconds() * 1000,
    );

    if (purpose === ClientOtpPurpose.SIGN_IN) {
      const client = await this.prisma.client.findUnique({ where: { phone } });
      if (!client) {
        throw new NotFoundException({
          statusCode: 404,
          message: 'No account found with this number.',
          error: 'Not Found',
          code: 'CLIENT_NOT_FOUND',
        });
      }
    }

    if (purpose === ClientOtpPurpose.REGISTER) {
      const client = await this.prisma.client.findUnique({ where: { phone } });
      if (client) {
        throw new ConflictException({
          statusCode: 409,
          message: 'An account already exists for this number.',
          error: 'Conflict',
          code: 'CLIENT_ALREADY_EXISTS',
        });
      }
    }

    const recentRequest = await this.prisma.clientOtpCode.findFirst({
      where: {
        phone,
        purpose,
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
        purpose,
      },
    });

    await this.otpDelivery.sendOtp(phone, code, purpose);

    const otpEnabled =
      this.config.get<string>('OTP_ENABLED', 'true').toLowerCase() !== 'false';
    const otpProvider = (
      this.config.get<string>('OTP_PROVIDER', 'dummy') ?? 'dummy'
    )
      .trim()
      .toLowerCase();
    const isProduction =
      this.config.get<string>('NODE_ENV', 'development') === 'production';
    const exposeDummyCode =
      otpEnabled &&
      otpProvider === 'dummy' &&
      !isProduction &&
      this.config.get<string>('OTP_DUMMY_EXPOSE_CODE', 'true').toLowerCase() !==
        'false';

    return {
      success: true,
      expiresIn,
      phone,
      ...(exposeDummyCode ? { devCode: code } : {}),
    };
  }

  async verifyOtp(
    phoneInput: string,
    codeInput: string,
    fullNameInput?: string,
  ): Promise<{
    accessToken: string;
    expiresIn: number;
    client: ClientAuthProfile;
  }> {
    const phone = normalizePhoneToE164(phoneInput);
    const now = new Date();
    const otp = await this.prisma.clientOtpCode.findFirst({
      where: {
        phone,
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

    const client = await this.resolveClientAfterOtpVerify(
      phone,
      otp.purpose,
      fullNameInput,
    );

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

  private async resolveClientAfterOtpVerify(
    phone: string,
    purpose: ClientOtpPurpose,
    fullNameInput?: string,
  ): Promise<ClientAuthProfile> {
    if (purpose === ClientOtpPurpose.LOGIN) {
      const existing = await this.prisma.client.findUnique({
        where: { phone },
      });
      const row = existing
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
      return row;
    }

    if (purpose === ClientOtpPurpose.SIGN_IN) {
      const existing = await this.prisma.client.findUnique({
        where: { phone },
      });
      if (!existing) {
        throw new NotFoundException({
          statusCode: 404,
          message: 'No account found with this number.',
          error: 'Not Found',
          code: 'CLIENT_NOT_FOUND',
        });
      }
      return await this.prisma.client.update({
        where: { id: existing.id },
        data: { phone },
        select: { id: true, fullName: true, phone: true, email: true },
      });
    }

    if (purpose === ClientOtpPurpose.REGISTER) {
      const name = fullNameInput?.trim();
      if (!name || name.length < 2) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'Full name is required to complete registration.',
          error: 'Bad Request',
          code: 'CLIENT_FULL_NAME_REQUIRED',
        });
      }
      const existing = await this.prisma.client.findUnique({
        where: { phone },
      });
      if (existing) {
        throw new ConflictException({
          statusCode: 409,
          message: 'An account already exists for this number.',
          error: 'Conflict',
          code: 'CLIENT_ALREADY_EXISTS',
        });
      }
      return await this.prisma.client.create({
        data: {
          fullName: name,
          phone,
          email: null,
        },
        select: { id: true, fullName: true, phone: true, email: true },
      });
    }

    throw this.otpInvalidException();
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
