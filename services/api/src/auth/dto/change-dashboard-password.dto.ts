import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangeDashboardPasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  currentPassword!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  newPassword!: string;
}
