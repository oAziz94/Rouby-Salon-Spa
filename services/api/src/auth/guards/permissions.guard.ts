import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { DashboardJwtUser } from '../dashboard-jwt-user';
import { ANY_PERMISSIONS_KEY, PERMISSIONS_KEY } from '../auth.constants';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredAll = this.reflector.getAllAndOverride<string[] | undefined>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const requiredAny = this.reflector.getAllAndOverride<string[] | undefined>(
      ANY_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredAll?.length && !requiredAny?.length) {
      return true;
    }
    const request = context
      .switchToHttp()
      .getRequest<{ user?: DashboardJwtUser }>();
    const user = request.user;
    if (!user?.permissions?.length) {
      throw new ForbiddenException('Insufficient permissions');
    }
    if (requiredAll?.length) {
      const missing = requiredAll.filter((k) => !user.permissions.includes(k));
      if (missing.length > 0) {
        throw new ForbiddenException('Insufficient permissions');
      }
    }
    if (requiredAny?.length) {
      const ok = requiredAny.some((k) => user.permissions.includes(k));
      if (!ok) {
        throw new ForbiddenException('Insufficient permissions');
      }
    }
    return true;
  }
}
