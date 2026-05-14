import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsUUID, Min, ValidateNested } from 'class-validator';

export class ReorderWebsiteContentItemDto {
  @IsUUID()
  id!: string;

  @IsInt()
  @Min(0)
  displayOrder!: number;
}

export class ReorderWebsiteContentDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReorderWebsiteContentItemDto)
  items!: ReorderWebsiteContentItemDto[];
}
