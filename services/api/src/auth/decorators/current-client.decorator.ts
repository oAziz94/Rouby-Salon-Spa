import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { ClientJwtUser } from '../client-jwt-user';

export const CurrentClient = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ClientJwtUser => {
    const request = ctx.switchToHttp().getRequest<{ user: ClientJwtUser }>();
    return request.user;
  },
);
