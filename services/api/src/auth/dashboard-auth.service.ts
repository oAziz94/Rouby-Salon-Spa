import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { DASHBOARD_JWT_AUDIENCE } from './auth.constants';
import type { DashboardAccessTokenPayload } from './dashboard-jwt-payload.interface';
import type { ChangeDashboardPasswordDto } from './dto/change-dashboard-password.dto';
import type { DashboardLoginDto } from './dto/dashboard-login.dto';
import type { UpdateDashboardProfileDto } from './dto/update-dashboard-profile.dto';
import { invalidateDashboardUserCache } from './strategies/dashboard-jwt.strategy';

/** Where a login/refresh came from; stored on the refresh-token row. */
export type SessionContext = {
  userAgent?: string | null;
  ipAddress?: string | null;
};

export type DashboardLoginResult = {
  accessToken: string;
  /** Access-token lifetime in seconds. */
  expiresIn: number;
  refreshToken: string;
  /** Refresh-token lifetime in seconds (rotated and extended on each refresh). */
  refreshExpiresIn: number;
  user: {
    id: string;
    name: string;
    email: string;
    roleId: string;
    branchId: string | null;
  };
};

function hashRefreshToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

@Injectable()
export class DashboardAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async login(
    dto: DashboardLoginDto,
    ctx: SessionContext = {},
  ): Promise<DashboardLoginResult> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: { permission: true },
            },
          },
        },
      },
    });
    if (!user?.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await argon2.verify(user.passwordHash, dto.password);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const permissions = user.role.rolePermissions
      .map((rp) => rp.permission.key)
      .sort((a, b) => a.localeCompare(b));
    const { accessToken, expiresIn } = await this.signAccessToken({
      sub: user.id,
      email: user.email,
      roleId: user.roleId,
      branchId: user.branchId,
      permissions,
    });
    const refresh = await this.issueRefreshToken(user.id, randomUUID(), ctx);
    return {
      accessToken,
      expiresIn,
      refreshToken: refresh.token,
      refreshExpiresIn: refresh.expiresIn,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        roleId: user.roleId,
        branchId: user.branchId,
      },
    };
  }

  /**
   * Exchange a refresh token for a new access token. The refresh token is rotated: the
   * presented one is revoked and a new one in the same family is returned. Presenting an
   * already-rotated token means it leaked (or two tabs raced); the whole family is revoked
   * and the user has to sign in again.
   */
  async refresh(
    rawRefreshToken: string,
    ctx: SessionContext = {},
  ): Promise<DashboardLoginResult> {
    const tokenHash = hashRefreshToken(rawRefreshToken);
    const row = await this.prisma.dashboardRefreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            role: {
              include: { rolePermissions: { include: { permission: true } } },
            },
          },
        },
      },
    });
    if (!row) {
      throw new UnauthorizedException('Session expired. Please sign in again.');
    }
    const now = new Date();
    if (row.revokedAt) {
      await this.prisma.dashboardRefreshToken.updateMany({
        where: { familyId: row.familyId, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'reuse_detected' },
      });
      await this.audit.log({
        userId: row.userId,
        action: 'user.session_reuse_detected',
        module: 'users',
        entityId: row.userId,
        severity: 'CRITICAL',
        newValue: { familyId: row.familyId, ipAddress: ctx.ipAddress ?? null },
        ipAddress: ctx.ipAddress ?? null,
      });
      throw new UnauthorizedException('Session expired. Please sign in again.');
    }
    if (row.expiresAt <= now || !row.user.isActive) {
      throw new UnauthorizedException('Session expired. Please sign in again.');
    }
    const user = row.user;
    const permissions = user.role.rolePermissions
      .map((rp) => rp.permission.key)
      .sort((a, b) => a.localeCompare(b));
    const { accessToken, expiresIn } = await this.signAccessToken({
      sub: user.id,
      email: user.email,
      roleId: user.roleId,
      branchId: user.branchId,
      permissions,
    });
    // Claim + rotate atomically: a logout racing this refresh either revokes the family
    // before (claim fails → 401) or after (the new row is revoked with it).
    const next = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.dashboardRefreshToken.updateMany({
        where: { id: row.id, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'rotated', lastUsedAt: now },
      });
      if (claimed.count !== 1) {
        throw new UnauthorizedException(
          'Session expired. Please sign in again.',
        );
      }
      return this.issueRefreshToken(user.id, row.familyId, ctx, tx);
    });
    return {
      accessToken,
      expiresIn,
      refreshToken: next.token,
      refreshExpiresIn: next.expiresIn,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        roleId: user.roleId,
        branchId: user.branchId,
      },
    };
  }

  /** Logout: revoke the presented refresh token's family (this device/tab lineage). */
  async logout(userId: string, rawRefreshToken?: string | null): Promise<void> {
    if (!rawRefreshToken) return;
    const row = await this.prisma.dashboardRefreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(rawRefreshToken) },
      select: { familyId: true, userId: true },
    });
    if (!row || row.userId !== userId) return;
    await this.prisma.dashboardRefreshToken.updateMany({
      where: { familyId: row.familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'logout' },
    });
  }

  /** Revoke every session of a user (password change, deactivation, admin action). */
  async revokeAllSessions(userId: string, reason: string): Promise<number> {
    const res = await this.prisma.dashboardRefreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    invalidateDashboardUserCache(userId);
    return res.count;
  }

  private async signAccessToken(
    payload: DashboardAccessTokenPayload,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    const expiresIn = parseExpiresInToSeconds(
      this.config.get<string>('JWT_EXPIRES_IN', '30m'),
    );
    const accessToken = await this.jwtService.signAsync(payload, {
      audience: DASHBOARD_JWT_AUDIENCE,
      expiresIn,
    });
    return { accessToken, expiresIn };
  }

  private async issueRefreshToken(
    userId: string,
    familyId: string,
    ctx: SessionContext,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<{ token: string; expiresIn: number }> {
    const expiresIn = parseExpiresInToSeconds(
      this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '30d'),
    );
    const token = randomBytes(48).toString('base64url');
    await db.dashboardRefreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: hashRefreshToken(token),
        expiresAt: new Date(Date.now() + expiresIn * 1000),
        userAgent: ctx.userAgent?.slice(0, 300) ?? null,
        ipAddress: ctx.ipAddress ?? null,
      },
    });
    return { token, expiresIn };
  }

  async getMe(userId: string): Promise<{
    id: string;
    name: string;
    email: string;
    phone: string | null;
    roleId: string;
    roleName: string;
    branchId: string | null;
    staffId: null;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        roleId: true,
        branchId: true,
        role: { select: { name: true } },
      },
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      roleId: user.roleId,
      roleName: user.role.name,
      branchId: user.branchId,
      staffId: null,
    };
  }

  async updateMyProfile(userId: string, dto: UpdateDashboardProfileDto) {
    if (dto.fullName === undefined && dto.phone === undefined) {
      throw new BadRequestException('Provide fullName and/or phone to update.');
    }
    const data: { name?: string; phone?: string | null } = {};
    if (dto.fullName !== undefined) {
      data.name = dto.fullName.trim();
    }
    if (dto.phone !== undefined) {
      data.phone = dto.phone?.trim() ? dto.phone.trim() : null;
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        roleId: true,
        branchId: true,
        role: { select: { name: true } },
      },
    });
    await this.audit.log({
      userId,
      action: 'user.profile_updated_self',
      module: 'users',
      entityId: userId,
      newValue: { fullName: updated.name, phone: updated.phone },
    });
    return {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      phone: updated.phone,
      roleId: updated.roleId,
      roleName: updated.role.name,
      branchId: updated.branchId,
      staffId: null,
    };
  }

  async changeMyPassword(userId: string, dto: ChangeDashboardPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    const ok = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!ok) {
      throw new BadRequestException('Current password is incorrect.');
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        'New password must differ from the current password.',
      );
    }
    const passwordHash = await argon2.hash(dto.newPassword, {
      type: argon2.argon2id,
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    await this.revokeAllSessions(userId, 'password_changed');
    await this.audit.log({
      userId,
      action: 'user.password_changed_self',
      module: 'users',
      entityId: userId,
    });
    return { ok: true as const };
  }

  async getPermissions(userId: string): Promise<{ permissions: string[] }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: { permission: true },
            },
          },
        },
      },
    });
    if (!user?.isActive) {
      throw new UnauthorizedException();
    }
    const permissions = user.role.rolePermissions
      .map((rp) => rp.permission.key)
      .sort((a, b) => a.localeCompare(b));
    return { permissions };
  }
}

function parseExpiresInToSeconds(value: string): number {
  const v = value.trim();
  if (/^\d+$/.test(v)) {
    return Number(v);
  }
  const m = /^(\d+)(s|m|h|d)$/i.exec(v);
  if (!m) {
    return 3600;
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
      return 3600;
  }
}
