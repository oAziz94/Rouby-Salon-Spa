import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ClientOtpRequestDto {
  @ApiProperty({ example: '+201001234567' })
  @IsString()
  @MinLength(3)
  phone!: string;
}
