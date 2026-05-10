import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ClientOtpVerifyDto {
  @ApiProperty({ example: '+201001234567' })
  @IsString()
  @MinLength(3)
  phone!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @MinLength(4)
  code!: string;

  @ApiPropertyOptional({
    example: 'Nour El-Din',
    description: 'Required when verifying a REGISTER OTP (new client name).',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName?: string;
}
