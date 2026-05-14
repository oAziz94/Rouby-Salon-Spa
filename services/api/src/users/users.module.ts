import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DashboardUsersController } from './dashboard-users.controller';
import { DashboardUsersService } from './dashboard-users.service';

@Module({
  imports: [AuditModule],
  controllers: [DashboardUsersController],
  providers: [DashboardUsersService],
})
export class UsersModule {}
