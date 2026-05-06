import { IsObject, IsOptional } from 'class-validator';

export class PatchSiteContentDto {
  @IsOptional()
  @IsObject()
  homeHero?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  aboutSection?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  contactSection?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  footerSection?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  socialLinks?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  seoDefaults?: Record<string, unknown>;
}
