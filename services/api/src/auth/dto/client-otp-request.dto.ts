import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { ClientOtpRequestIntent } from './client-otp-request-intent.enum';

export class ClientOtpRequestDto {
  @ApiProperty({ example: '+201001234567' })
  @IsString()
  @MinLength(3)
  phone!: string;

  @ApiPropertyOptional({
    enum: ClientOtpRequestIntent,
    description:
      'SIGN_IN / REGISTER for account pages; omit or LOGIN for legacy booking OTP.',
  })
  @IsOptional()
  @IsEnum(ClientOtpRequestIntent)
  intent?: ClientOtpRequestIntent;
}
