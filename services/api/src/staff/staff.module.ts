import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DashboardStaffController } from './dashboard-staff.controller';
import { StaffAvailabilityService } from './staff-availability.service';
import { StaffService } from './staff.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [DashboardStaffController],
  providers: [StaffService, StaffAvailabilityService],
  exports: [StaffService, StaffAvailabilityService],
})
export class StaffModule {}
