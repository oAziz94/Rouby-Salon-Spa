import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { DashboardJwtUser } from '../dashboard-jwt-user';
import { PERMISSIONS_KEY } from '../auth.constants';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) {
      return true;
    }
    const request = context.switchToHttp().getRequest<{ user?: DashboardJwtUser }>();
    const user = request.user;
    if (!user?.permissions?.length) {
      throw new ForbiddenException('Insufficient permissions');
    }
    const missing = required.filter((k) => !user.permissions.includes(k));
    if (missing.length > 0) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
