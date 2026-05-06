import { PartialType } from '@nestjs/swagger';
import { CreateDashboardClientDto } from './create-dashboard-client.dto';

export class UpdateDashboardClientDto extends PartialType(
  CreateDashboardClientDto,
) {}
