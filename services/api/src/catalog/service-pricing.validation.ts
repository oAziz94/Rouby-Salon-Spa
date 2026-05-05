import { BadRequestException } from '@nestjs/common';
import { PriceDisplayType } from '@prisma/client';

export function validateServicePricing(input: {
  priceDisplayType: PriceDisplayType;
  basePrice: number | null | undefined;
  basePriceMax: number | null | undefined;
}): void {
  const { priceDisplayType, basePrice, basePriceMax } = input;
  const hasMin = basePrice != null;
  const hasMax = basePriceMax != null;

  switch (priceDisplayType) {
    case PriceDisplayType.FIXED:
    case PriceDisplayType.STARTS_FROM:
      if (!hasMin) {
        throw new BadRequestException(
          'basePrice is required for FIXED and STARTS_FROM',
        );
      }
      if (hasMax) {
        throw new BadRequestException(
          'basePriceMax must be null for FIXED and STARTS_FROM',
        );
      }
      break;
    case PriceDisplayType.RANGE:
      if (!hasMin || !hasMax) {
        throw new BadRequestException(
          'basePrice (min) and basePriceMax (max) are required for RANGE',
        );
      }
      if (
        basePrice != null &&
        basePriceMax != null &&
        basePrice > basePriceMax
      ) {
        throw new BadRequestException(
          'basePrice must be less than or equal to basePriceMax for RANGE',
        );
      }
      break;
    case PriceDisplayType.CONTACT:
    case PriceDisplayType.HIDDEN:
      if (hasMin || hasMax) {
        throw new BadRequestException(
          'basePrice and basePriceMax must be null for CONTACT and HIDDEN',
        );
      }
      break;
    default:
      throw new BadRequestException('Invalid priceDisplayType');
  }
}
