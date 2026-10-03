import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  NotEquals,
} from 'class-validator';

export class RedeemLoyaltyPointsDto {
  @ApiPropertyOptional({
    description: 'How many redemption blocks to use (default 1).',
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  blocks = 1;
}

export class AdjustLoyaltyPointsDto {
  @ApiProperty({
    description: 'Points to add (positive) or remove (negative).',
  })
  @Type(() => Number)
  @IsInt()
  @NotEquals(0)
  @Min(-1_000_000)
  @Max(1_000_000)
  points!: number;

  @ApiProperty({ description: 'Why the balance is being changed.' })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  note!: string;
}

export class PatchLoyaltySettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'Points earned per 1 EGP paid.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  pointsPerEgp?: number;

  @ApiPropertyOptional({ description: 'Points in one redemption block.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  redeemPoints?: number;

  @ApiPropertyOptional({ description: 'EGP value of one redemption block.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  @Max(100_000)
  redeemValue?: number;

  @ApiPropertyOptional({ description: 'Completed visits per free reward.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  visitsForReward?: number;

  @ApiPropertyOptional({
    description: 'Service given free as the visit reward.',
  })
  @IsOptional()
  @IsUUID('4')
  rewardServiceId?: string | null;
}
