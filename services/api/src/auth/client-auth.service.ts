import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { CLIENT_JWT_AUDIENCE } from './auth.constants';
import type { ClientAccessTokenPayload } from './client-jwt-payload.interface';
import type { ClientDevTokenDto } from './dto/client-dev-token.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ClientAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  private assertDevAuthEnabled(): void {
    const nodeEnv = this.config.get<string>('NODE_ENV', 'development');
    const flag = this.config.get<string>('CLIENT_DEV_AUTH_ENABLED', '');
    const enabled = nodeEnv !== 'production' || flag.toLowerCase() === 'true';
    if (!enabled) {
      throw new ForbiddenException(
        'Client dev token minting is disabled. Set NODE_ENV=development or CLIENT_DEV_AUTH_ENABLED=true.',
      );
    }
  }

  async mintDevToken(dto: ClientDevTokenDto): Promise<{
    accessToken: string;
    expiresIn: number;
    client: {
      id: string;
      fullName: string;
      phone: string;
      email: string | null;
    };
  }> {
    this.assertDevAuthEnabled();

    const phone = dto.phone.trim();
    const fullName = dto.fullName.trim();

    const existing = await this.prisma.client.findFirst({
      where: { phone },
    });

    const client = existing
      ? await this.prisma.client.update({
          where: { id: existing.id },
          data: {
            fullName,
            ...(dto.email !== undefined && { email: dto.email.trim() }),
          },
          select: { id: true, fullName: true, phone: true, email: true },
        })
      : await this.prisma.client.create({
          data: {
            fullName,
            phone,
            email: dto.email?.trim() ?? null,
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
