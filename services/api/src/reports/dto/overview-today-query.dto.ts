import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class OverviewTodayQueryDto {
  @ApiPropertyOptional({ description: 'Limit to one branch (optional).' })
  @IsOptional()
  @IsUUID('4')
  branchId?: string;
}
