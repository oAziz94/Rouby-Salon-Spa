import { IsDateString } from 'class-validator';

export class PublicSlotsQueryDto {
  @IsDateString()
  date!: string;
}
