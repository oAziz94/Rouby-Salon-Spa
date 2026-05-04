import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { DashboardAccessTokenPayload } from '../dashboard-jwt-payload.interface';
import type { DashboardJwtUser } from '../dashboard-jwt-user';
import { DASHBOARD_JWT_AUDIENCE } from '../auth.constants';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardJwtStrategy extends PassportStrategy(
  Strategy,
  'dashboard-jwt',
) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
      audience: DASHBOARD_JWT_AUDIENCE,
    });
  }

  async validate(payload: DashboardAccessTokenPayload): Promise<DashboardJwtUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, isActive: true },
    });
    if (!user?.isActive) {
      throw new UnauthorizedException('User inactive or not found');
    }
    return {
      userId: payload.sub,
      email: payload.email,
      roleId: payload.roleId,
      branchId: payload.branchId ?? null,
      permissions: payload.permissions ?? [],
    };
  }
}
