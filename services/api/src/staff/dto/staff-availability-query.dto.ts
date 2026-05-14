import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class StaffAvailabilityQueryDto {
  @ApiProperty()
  @IsUUID()
  branchId!: string;

  @ApiProperty()
  @IsUUID()
  serviceId!: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD in Cairo business sense' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @ApiPropertyOptional({
    description: 'HH:mm:ss wall clock (same projection as slots)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}:\d{2}$/)
  startTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}:\d{2}$/)
  endTime?: string;
}
