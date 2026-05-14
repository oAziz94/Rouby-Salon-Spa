import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class PatchDefaultBranchDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  defaultBranchId?: string | null;
}
