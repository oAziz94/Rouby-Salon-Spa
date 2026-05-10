import type { PublicService } from "@/lib/api/public";
import { formatEgp } from "@/lib/format/currency";

/**
 * Display label for a public service respecting catalog `priceDisplayType`.
 * When a variant is selected, its price overrides base display where applicable.
 */
export function formatServicePriceLabel(
  service: PublicService,
  selectedVariantPrice: number | null | undefined,
): string {
  const variantPrice =
    typeof selectedVariantPrice === "number" && !Number.isNaN(selectedVariantPrice)
      ? selectedVariantPrice
      : null;

  switch (service.priceDisplayType) {
    case "CONTACT":
      return "Contact for price";
    case "HIDDEN":
      return "Price on request";
    case "STARTS_FROM": {
      const base = service.basePrice;
      if (variantPrice !== null) {
        return formatEgp(variantPrice);
      }
      if (typeof base === "number") {
        return `From ${formatEgp(base)}`;
      }
      return "Contact for price";
    }
    case "RANGE": {
      const min = service.basePrice;
      const max = service.basePriceMax;
      if (typeof min === "number" && typeof max === "number") {
        return `${formatEgp(min)} – ${formatEgp(max)}`;
      }
      if (typeof min === "number") {
        return formatEgp(min);
      }
      if (variantPrice !== null) {
        return formatEgp(variantPrice);
      }
      return "Contact for price";
    }
    case "FIXED":
    default: {
      if (variantPrice !== null) {
        return formatEgp(variantPrice);
      }
      return formatEgp(service.basePrice);
    }
  }
}
