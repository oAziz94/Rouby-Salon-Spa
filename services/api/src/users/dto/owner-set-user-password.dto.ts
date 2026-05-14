import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class OwnerSetUserPasswordDto {
  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  newPassword!: string;
}
