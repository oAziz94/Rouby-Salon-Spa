import { ApiPropertyOptional } from '@nestjs/swagger';
import { QueueEntryStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID, Matches } from 'class-validator';

export class QueueListQueryDto {
  @ApiPropertyOptional({
    description:
      'Operational calendar day (UTC date boundary). Defaults to today.',
    example: '2026-05-10',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @ApiPropertyOptional({
    description: 'Required when the user can access all branches.',
  })
  @IsOptional()
  @IsUUID('4')
  branchId?: string;

  @ApiPropertyOptional({ enum: QueueEntryStatus })
  @IsOptional()
  @IsEnum(QueueEntryStatus)
  status?: QueueEntryStatus;
}
