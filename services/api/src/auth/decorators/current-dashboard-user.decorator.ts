import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { DashboardJwtUser } from '../dashboard-jwt-user';

export const CurrentDashboardUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): DashboardJwtUser => {
    const request = ctx.switchToHttp().getRequest<{ user: DashboardJwtUser }>();
    return request.user;
  },
);
