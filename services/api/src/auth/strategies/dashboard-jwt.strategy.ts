import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { DashboardAccessTokenPayload } from '../dashboard-jwt-payload.interface';
import type { DashboardJwtUser } from '../dashboard-jwt-user';
import { DASHBOARD_JWT_AUDIENCE } from '../auth.constants';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Permissions are read from the database per request (roles can change without re-login).
 * A 20-second cache keeps that property while removing one 4-table join from every call
 * a busy front desk makes. Deactivating a user therefore takes effect within 20 seconds.
 */
const USER_CACHE_TTL_MS = 20_000;
const userCache = new Map<string, { until: number; user: DashboardJwtUser }>();

/** Drop a cached user (call after role/permission/branch/active changes for immediate effect). */
export function invalidateDashboardUserCache(userId?: string): void {
  if (userId) userCache.delete(userId);
  else userCache.clear();
}

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

  async validate(
    payload: DashboardAccessTokenPayload,
  ): Promise<DashboardJwtUser> {
    const cached = userCache.get(payload.sub);
    if (cached && cached.until > Date.now()) {
      return cached.user;
    }
    const dbUser = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        roleId: true,
        branchId: true,
        isActive: true,
        branchAccesses: { select: { branchId: true } },
        role: {
          select: {
            rolePermissions: {
              select: { permission: { select: { key: true } } },
            },
          },
        },
      },
    });
    if (!dbUser?.isActive) {
      throw new UnauthorizedException('User inactive or not found');
    }
    const permissions = dbUser.role.rolePermissions
      .map((rp) => rp.permission.key)
      .sort((a, b) => a.localeCompare(b));
    const user: DashboardJwtUser = {
      userId: dbUser.id,
      email: dbUser.email,
      roleId: dbUser.roleId,
      branchId: dbUser.branchId ?? null,
      allowedBranchIds: dbUser.branchAccesses.map((a) => a.branchId),
      permissions,
    };
    userCache.set(dbUser.id, { until: Date.now() + USER_CACHE_TTL_MS, user });
    if (userCache.size > 500) {
      const now = Date.now();
      for (const [k, v] of userCache) if (v.until <= now) userCache.delete(k);
    }
    return user;
  }
}
