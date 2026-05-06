import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ClientOtpVerifyDto {
  @ApiProperty({ example: '+201001234567' })
  @IsString()
  @MinLength(3)
  phone!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @MinLength(4)
  code!: string;
}
