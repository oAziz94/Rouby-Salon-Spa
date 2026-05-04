import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class DashboardJwtAuthGuard extends AuthGuard('dashboard-jwt') {}
