import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class DashboardUserListQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  roleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  branchId?: string;

  @ApiPropertyOptional({ enum: ['all', 'active', 'inactive'] })
  @IsOptional()
  @IsIn(['all', 'active', 'inactive'])
  status?: 'all' | 'active' | 'inactive';
}
