import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateDashboardUserDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  fullName!: string;

  @ApiProperty()
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string | null;

  @ApiProperty()
  @IsUUID('4')
  roleId!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  branchIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  defaultBranchId?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
