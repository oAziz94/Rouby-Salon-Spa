import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class DashboardLoginDto {
  @ApiProperty({ example: 'owner@alrouby.local' })
  @IsEmail()
  email!: string;

  @ApiProperty({ format: 'password', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'password must be at least 8 characters' })
  password!: string;
}
