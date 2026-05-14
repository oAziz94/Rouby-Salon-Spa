import { PartialType } from '@nestjs/swagger';
import { CreateDashboardUserDto } from './create-dashboard-user.dto';

export class UpdateDashboardUserDto extends PartialType(
  CreateDashboardUserDto,
) {}
