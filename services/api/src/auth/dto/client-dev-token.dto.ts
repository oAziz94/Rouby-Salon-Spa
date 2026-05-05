import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Development-only mint for a client JWT (no OAuth).
 * Not a security boundary — disable outside controlled environments.
 */
export class ClientDevTokenDto {
  @ApiProperty({ example: 'Test Client' })
  @IsString()
  @MinLength(1)
  fullName!: string;

  @ApiProperty({ example: '+201012345678' })
  @IsString()
  @MinLength(6)
  phone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;
}
