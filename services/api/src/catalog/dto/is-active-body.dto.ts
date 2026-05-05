import { IsBoolean } from 'class-validator';

export class IsActiveBodyDto {
  @IsBoolean()
  isActive!: boolean;
}
