import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class DashboardRefreshDto {
  @ApiProperty({
    description: 'Opaque refresh token returned by login/refresh',
  })
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  refreshToken!: string;
}

export class DashboardLogoutDto {
  @ApiPropertyOptional({
    description: 'Refresh token of this session, so it can be revoked',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  refreshToken?: string;
}
