import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';

export class PutStaffServicesDto {
  @ApiProperty({
    type: [String],
    description: 'Full replacement list of catalog service IDs (may be empty)',
  })
  @IsArray()
  @IsUUID('4', { each: true })
  serviceIds!: string[];
}
