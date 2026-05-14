import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class AttachGalleryAssetDto {
  @IsString()
  @MaxLength(80)
  usageType!: string;

  @IsOptional()
  @IsUUID()
  entityId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sectionKey?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsBoolean()
  syncAltToService?: boolean;
}
