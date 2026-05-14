import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

class ReorderReviewItemDto {
  @IsUUID()
  id!: string;

  @IsInt()
  @Min(0)
  displayOrder!: number;
}

export class ReorderDashboardReviewsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReorderReviewItemDto)
  items!: ReorderReviewItemDto[];
}
