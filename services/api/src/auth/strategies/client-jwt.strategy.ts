import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { CLIENT_JWT_AUDIENCE } from '../auth.constants';
import type { ClientAccessTokenPayload } from '../client-jwt-payload.interface';
import type { ClientJwtUser } from '../client-jwt-user';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ClientJwtStrategy extends PassportStrategy(
  Strategy,
  'client-jwt',
) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
      audience: CLIENT_JWT_AUDIENCE,
    });
  }

  async validate(payload: ClientAccessTokenPayload): Promise<ClientJwtUser> {
    const client = await this.prisma.client.findUnique({
      where: { id: payload.sub },
      select: { id: true },
    });
    if (!client) {
      throw new UnauthorizedException('Client not found');
    }
    return { clientId: client.id };
  }
}
