import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { DASHBOARD_JWT_AUDIENCE } from './auth.constants';
import type { DashboardAccessTokenPayload } from './dashboard-jwt-payload.interface';
import type { ChangeDashboardPasswordDto } from './dto/change-dashboard-password.dto';
import type { DashboardLoginDto } from './dto/dashboard-login.dto';
import type { UpdateDashboardProfileDto } from './dto/update-dashboard-profile.dto';

@Injectable()
export class DashboardAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async login(dto: DashboardLoginDto): Promise<{
    accessToken: string;
    expiresIn: number;
    user: {
      id: string;
      name: string;
      email: string;
      roleId: string;
      branchId: string | null;
    };
  }> {
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
    const payload: DashboardAccessTokenPayload = {
      sub: user.id,
      email: user.email,
      roleId: user.roleId,
      branchId: user.branchId,
      permissions,
    };
    const expiresIn = parseExpiresInToSeconds(
      this.config.get<string>('JWT_EXPIRES_IN', '1h'),
    );
    const accessToken = await this.jwtService.signAsync(payload, {
      audience: DASHBOARD_JWT_AUDIENCE,
      expiresIn: expiresIn,
    });
    return {
      accessToken,
      expiresIn,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        roleId: user.roleId,
        branchId: user.branchId,
      },
    };
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
      throw new BadRequestException('New password must differ from the current password.');
    }
    const passwordHash = await argon2.hash(dto.newPassword, {
      type: argon2.argon2id,
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
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
