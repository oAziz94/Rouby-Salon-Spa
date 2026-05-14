import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class PatchReceiptSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  receiptTitle?: string;

  @ApiPropertyOptional({ enum: ['58mm', '80mm'] })
  @IsOptional()
  @IsIn(['58mm', '80mm'])
  receiptWidth?: '58mm' | '80mm';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  receiptFooterMessage?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showSalonPhoneOnReceipt?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showBranchAddressOnReceipt?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showVatBreakdown?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showPaymentBreakdown?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showCashierName?: boolean;
}
