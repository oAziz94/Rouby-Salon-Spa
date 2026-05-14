import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import {
  BookingItemType,
  BundleType,
  PriceDisplayType,
  Prisma,
  type SystemSettings,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SYSTEM_SETTINGS_ID } from '../settings/settings.constants';
import type { BookingItemInputDto } from './dto/booking-item-input.dto';

/** Controls catalog rules that exist for public/website booking parity. */
export type ResolveBookingLinesOptions = {
  /**
   * When true (default), services (and their variants) must have `bookingAvailability`.
   * Dashboard and walk-in flows set false so items hidden from the public booking catalog remain staff-bookable.
   */
  enforceOnlineCatalogRules?: boolean;
  /**
   * When true with `enforceOnlineCatalogRules: false`, staff may set `staffOverrideUnitPrice` / `staffOverrideDurationMinutes`
   * on service lines for contact/hidden/range-without-variant and similar catalog gaps.
   * Ignored when `enforceOnlineCatalogRules` is true (public safety).
   */
  allowStaffPriceOverrides?: boolean;
};

export type ResolvedBookingLine = {
  itemType: BookingItemType;
  serviceId: string | null;
  serviceVariantId: string | null;
  packageId: string | null;
  bundleId: string | null;
  serviceEnhancementId: string | null;
  nameSnapshot: string;
  priceSnapshot: Prisma.Decimal;
  durationMinutesSnapshot: number;
  quantity: number;
  isTaxable: boolean;
  lineMetadata: Prisma.JsonValue | null;
};

@Injectable()
export class BookingPricingService {
  constructor(private readonly prisma: PrismaService) {}

  async getSystemSettings(): Promise<SystemSettings> {
    const row = await this.prisma.systemSettings.findUnique({
      where: { id: SYSTEM_SETTINGS_ID },
    });
    if (!row) {
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'System settings not initialized',
          error: 'Internal Server Error',
          code: 'SYSTEM_SETTINGS_MISSING',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return row;
  }

  computeTotals(
    lines: ResolvedBookingLine[],
    settings: SystemSettings,
    discountAmountInput: number,
  ): {
    subtotal: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
    vatRate: Prisma.Decimal;
    vatAmount: Prisma.Decimal;
    totalAmount: Prisma.Decimal;
  } {
    const rate = Number(settings.defaultVatRate.toString());
    const vatRateStored = settings.vatEnabled ? rate : 0;

    let taxableExclusive = 0;
    let nonTaxExclusive = 0;

    for (const line of lines) {
      const unit = Number(line.priceSnapshot.toString());
      const ext = unit * line.quantity;
      if (!line.isTaxable) {
        nonTaxExclusive += ext;
        continue;
      }
      if (!settings.vatEnabled) {
        // VAT disabled: treat taxable lines as non-VAT for totals.
        nonTaxExclusive += ext;
        continue;
      }
      if (!settings.pricesIncludeVat) {
        taxableExclusive += ext;
      } else {
        taxableExclusive += ext / (1 + rate);
      }
    }

    const exclusiveSubtotal = taxableExclusive + nonTaxExclusive;
    const rawDiscount = Math.max(0, discountAmountInput);
    const disc = Math.min(rawDiscount, exclusiveSubtotal);
    const discountAmount = new Prisma.Decimal(disc.toFixed(2));
    const subtotal = new Prisma.Decimal(exclusiveSubtotal.toFixed(2));

    const denom = exclusiveSubtotal > 0 ? exclusiveSubtotal : 0;
    const discountOnTaxable = denom > 0 ? disc * (taxableExclusive / denom) : 0;
    const taxableAfterDiscount = Math.max(
      0,
      taxableExclusive - discountOnTaxable,
    );

    const vatAmountNum =
      settings.vatEnabled && taxableAfterDiscount > 0
        ? taxableAfterDiscount * rate
        : 0;

    const totalNum = exclusiveSubtotal - disc + vatAmountNum;

    return {
      subtotal,
      discountAmount,
      vatRate: new Prisma.Decimal(vatRateStored.toFixed(5)),
      vatAmount: new Prisma.Decimal(vatAmountNum.toFixed(2)),
      totalAmount: new Prisma.Decimal(totalNum.toFixed(2)),
    };
  }

  lineExclusiveAmount(
    line: ResolvedBookingLine,
    settings: SystemSettings,
  ): number {
    const unit = Number(line.priceSnapshot.toString());
    const ext = unit * line.quantity;
    if (!line.isTaxable || !settings.vatEnabled) {
      return ext;
    }
    if (!settings.pricesIncludeVat) {
      return ext;
    }
    const rate = Number(settings.defaultVatRate.toString());
    return ext / (1 + rate);
  }

  async resolveLines(
    branchId: string,
    items: BookingItemInputDto[],
    options?: ResolveBookingLinesOptions,
  ): Promise<ResolvedBookingLine[]> {
    const enforceOnlineCatalogRules =
      options?.enforceOnlineCatalogRules ?? true;
    const allowStaffPriceOverrides =
      Boolean(options?.allowStaffPriceOverrides) && !enforceOnlineCatalogRules;
    const lines: ResolvedBookingLine[] = [];
    for (const item of items) {
      if (item.itemType === BookingItemType.PACKAGE) {
        lines.push(
          ...(await this.resolvePackageExpandedLines(
            branchId,
            item,
            enforceOnlineCatalogRules,
          )),
        );
      } else {
        lines.push(
          await this.resolveOneLine(
            branchId,
            item,
            enforceOnlineCatalogRules,
            allowStaffPriceOverrides,
          ),
        );
      }
    }
    return lines;
  }

  private async resolveOneLine(
    branchId: string,
    item: BookingItemInputDto,
    enforceOnlineCatalogRules: boolean,
    allowStaffPriceOverrides: boolean,
  ): Promise<ResolvedBookingLine> {
    const qty = item.quantity ?? 1;

    switch (item.itemType) {
      case BookingItemType.SERVICE:
      case BookingItemType.ADD_ON:
        return this.resolveServiceLine(
          branchId,
          item,
          qty,
          enforceOnlineCatalogRules,
          allowStaffPriceOverrides,
        );
      case BookingItemType.SERVICE_ENHANCEMENT:
        return this.resolveEnhancementLine(item, qty);
      case BookingItemType.SERVICE_VARIANT:
        return this.resolveVariantLine(
          branchId,
          item,
          qty,
          enforceOnlineCatalogRules,
        );
      case BookingItemType.BUNDLE:
        return this.resolveBundleLine(branchId, item, qty);
      default:
        throw new HttpException(
          {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'Unsupported booking item type',
            error: 'Bad Request',
            code: 'INVALID_ITEM_TYPE',
          },
          HttpStatus.BAD_REQUEST,
        );
    }
  }

  private async assertServiceAtBranch(serviceId: string, branchId: string) {
    const link = await this.prisma.serviceBranch.findUnique({
      where: {
        serviceId_branchId: { serviceId, branchId },
      },
    });
    if (!link) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Service is not available for this branch',
          error: 'Bad Request',
          code: 'SERVICE_NOT_AT_BRANCH',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private parseStaffCatalogOverride(
    item: BookingItemInputDto,
    allowStaffPriceOverrides: boolean,
  ): { unitPrice: number; durationMinutes?: number } | null {
    if (!allowStaffPriceOverrides) {
      return null;
    }
    const raw = item.staffOverrideUnitPrice;
    if (raw === undefined || raw === null) {
      return null;
    }
    const unitPrice = Number(raw);
    if (!Number.isFinite(unitPrice) || unitPrice < 0.01) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Staff override price must be a number ≥ 0.01',
          error: 'Bad Request',
          code: 'STAFF_OVERRIDE_PRICE_INVALID',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    let durationMinutes: number | undefined;
    if (
      item.staffOverrideDurationMinutes !== undefined &&
      item.staffOverrideDurationMinutes !== null
    ) {
      const d = Number(item.staffOverrideDurationMinutes);
      if (!Number.isInteger(d) || d < 1) {
        throw new HttpException(
          {
            statusCode: HttpStatus.BAD_REQUEST,
            message:
              'Staff override duration must be a whole number of minutes ≥ 1',
            error: 'Bad Request',
            code: 'STAFF_OVERRIDE_DURATION_INVALID',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      durationMinutes = d;
    }
    return { unitPrice, durationMinutes };
  }

  private async resolveServiceLine(
    branchId: string,
    item: BookingItemInputDto,
    quantity: number,
    enforceOnlineCatalogRules: boolean,
    allowStaffPriceOverrides: boolean,
  ): Promise<ResolvedBookingLine> {
    if (
      !item.serviceId ||
      item.serviceVariantId ||
      item.packageId ||
      item.bundleId ||
      item.serviceEnhancementId
    ) {
      this.throwInvalidItemShape();
    }
    const service = await this.prisma.service.findUnique({
      where: { id: item.serviceId },
    });
    if (!service?.isActive) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Service is not bookable',
          error: 'Bad Request',
          code: 'SERVICE_INACTIVE',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (enforceOnlineCatalogRules && !service.bookingAvailability) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Service is not bookable',
          error: 'Bad Request',
          code: 'SERVICE_INACTIVE',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.assertServiceAtBranch(service.id, branchId);

    const staffOv = this.parseStaffCatalogOverride(
      item,
      allowStaffPriceOverrides,
    );
    const displayType = service.priceDisplayType;
    const catalogBase = service.basePrice
      ? Number(service.basePrice.toString())
      : null;

    if (!allowStaffPriceOverrides) {
      if (
        displayType === PriceDisplayType.CONTACT ||
        displayType === PriceDisplayType.HIDDEN
      ) {
        throw new HttpException(
          {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'Service cannot be booked online (contact/hidden price)',
            error: 'Bad Request',
            code: 'SERVICE_NOT_PRICEABLE',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      if (displayType === PriceDisplayType.RANGE) {
        throw new HttpException(
          {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'This service requires a variant selection for booking',
            error: 'Bad Request',
            code: 'SERVICE_VARIANT_REQUIRED',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    if (allowStaffPriceOverrides) {
      const needsStaffPriceOrVariant =
        displayType === PriceDisplayType.CONTACT ||
        displayType === PriceDisplayType.HIDDEN ||
        displayType === PriceDisplayType.RANGE ||
        ((displayType === PriceDisplayType.FIXED ||
          displayType === PriceDisplayType.STARTS_FROM) &&
          catalogBase === null);
      if (needsStaffPriceOrVariant && !staffOv) {
        if (displayType === PriceDisplayType.RANGE) {
          throw new HttpException(
            {
              statusCode: HttpStatus.BAD_REQUEST,
              message:
                'This range-priced service needs a variant line, or enter a staff price and duration on the service line',
              error: 'Bad Request',
              code: 'SERVICE_VARIANT_REQUIRED',
            },
            HttpStatus.BAD_REQUEST,
          );
        }
        throw new HttpException(
          {
            statusCode: HttpStatus.BAD_REQUEST,
            message:
              'Enter a staff price (and optional duration) for this service — it is not priced for online booking',
            error: 'Bad Request',
            code: 'STAFF_PRICE_REQUIRED',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    let unitPrice: number | null = catalogBase;
    if (allowStaffPriceOverrides && staffOv) {
      unitPrice = staffOv.unitPrice;
    } else if (catalogBase === null) {
      // public path already failed CONTACT/HIDDEN/RANGE; staff without override for missing base:
      if (!allowStaffPriceOverrides || !staffOv) {
        throw new HttpException(
          {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'Service has no price for booking',
            error: 'Bad Request',
            code: 'SERVICE_NOT_PRICEABLE',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    if (unitPrice === null || !Number.isFinite(unitPrice)) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Service has no price for booking',
          error: 'Bad Request',
          code: 'SERVICE_NOT_PRICEABLE',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const durationMinutesSnapshot =
      allowStaffPriceOverrides && staffOv?.durationMinutes !== undefined
        ? staffOv.durationMinutes
        : (service.durationMinutes ?? 0);

    const lineMetadata: Prisma.JsonValue | null =
      allowStaffPriceOverrides && staffOv
        ? {
            staffCatalogOverride: {
              unitPrice,
              durationMinutes: durationMinutesSnapshot,
            },
          }
        : null;

    return {
      itemType: item.itemType,
      serviceId: service.id,
      serviceVariantId: null,
      packageId: null,
      bundleId: null,
      serviceEnhancementId: null,
      nameSnapshot: service.name,
      priceSnapshot: new Prisma.Decimal(unitPrice.toFixed(2)),
      durationMinutesSnapshot,
      quantity,
      isTaxable: service.isTaxable,
      lineMetadata,
    };
  }

  private async resolveVariantLine(
    branchId: string,
    item: BookingItemInputDto,
    quantity: number,
    enforceOnlineCatalogRules: boolean,
  ): Promise<ResolvedBookingLine> {
    if (
      !item.serviceId ||
      !item.serviceVariantId ||
      item.packageId ||
      item.bundleId ||
      item.serviceEnhancementId
    ) {
      this.throwInvalidItemShape();
    }
    const variant = await this.prisma.serviceVariant.findUnique({
      where: { id: item.serviceVariantId },
      include: { service: true },
    });
    if (!variant?.isActive || !variant.service.isActive) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Variant is not bookable',
          error: 'Bad Request',
          code: 'VARIANT_INACTIVE',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (enforceOnlineCatalogRules && !variant.service.bookingAvailability) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Variant is not bookable',
          error: 'Bad Request',
          code: 'VARIANT_INACTIVE',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (variant.serviceId !== item.serviceId) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Variant does not belong to the provided service',
          error: 'Bad Request',
          code: 'VARIANT_SERVICE_MISMATCH',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.assertServiceAtBranch(variant.serviceId, branchId);

    const price = Number(variant.price.toString());
    return {
      itemType: BookingItemType.SERVICE_VARIANT,
      serviceId: variant.serviceId,
      serviceVariantId: variant.id,
      packageId: null,
      bundleId: null,
      serviceEnhancementId: null,
      nameSnapshot: `${variant.service.name} — ${variant.name}`,
      priceSnapshot: new Prisma.Decimal(price.toFixed(2)),
      durationMinutesSnapshot: variant.durationMinutes,
      quantity,
      isTaxable: variant.service.isTaxable,
      lineMetadata: null,
    };
  }

  /**
   * Expands a catalog package into one booking line per contained service so queue / staff flows
   * can start and complete each service independently (same as standalone services).
   * The full package price is charged on the first line; sibling lines are priced at 0.
   */
  private async resolvePackageExpandedLines(
    branchId: string,
    item: BookingItemInputDto,
    enforceOnlineCatalogRules: boolean,
  ): Promise<ResolvedBookingLine[]> {
    const quantity = item.quantity ?? 1;
    if (
      !item.packageId ||
      item.serviceId ||
      item.serviceVariantId ||
      item.bundleId ||
      item.serviceEnhancementId
    ) {
      this.throwInvalidItemShape();
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Package quantity must be a whole number ≥ 1',
          error: 'Bad Request',
          code: 'INVALID_QUANTITY',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const pkg = await this.prisma.package.findUnique({
      where: { id: item.packageId },
      include: {
        services: {
          include: { service: true },
          orderBy: [{ sortOrder: 'asc' }, { serviceId: 'asc' }],
        },
      },
    });
    if (!pkg?.isActive) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Package is not bookable',
          error: 'Bad Request',
          code: 'PACKAGE_INACTIVE',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    const atBranch = await this.prisma.packageBranch.findUnique({
      where: {
        packageId_branchId: { packageId: pkg.id, branchId },
      },
    });
    if (!atBranch) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Package is not available for this branch',
          error: 'Bad Request',
          code: 'PACKAGE_NOT_AT_BRANCH',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    const today = new Date();
    if (pkg.startDate && today < pkg.startDate) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Package is not valid yet',
          error: 'Bad Request',
          code: 'PACKAGE_NOT_VALID',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (pkg.endDate && today > pkg.endDate) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Package is expired',
          error: 'Bad Request',
          code: 'PACKAGE_NOT_VALID',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (pkg.services.length === 0) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Package has no services',
          error: 'Bad Request',
          code: 'PACKAGE_EMPTY',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    for (const ps of pkg.services) {
      const svc = ps.service;
      if (!svc?.isActive) {
        throw new HttpException(
          {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'Package includes a service that is not bookable',
            error: 'Bad Request',
            code: 'SERVICE_INACTIVE',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      if (enforceOnlineCatalogRules && !svc.bookingAvailability) {
        throw new HttpException(
          {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'Package includes a service that is not bookable online',
            error: 'Bad Request',
            code: 'SERVICE_INACTIVE',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      await this.assertServiceAtBranch(svc.id, branchId);
    }

    const packageUnitPrice = Number(pkg.packagePrice.toString());
    const totalPrice = packageUnitPrice * quantity;
    const firstPrice = new Prisma.Decimal(totalPrice.toFixed(2));
    const zero = new Prisma.Decimal('0');

    const lines: ResolvedBookingLine[] = [];
    let isFirstLine = true;
    for (let copy = 0; copy < quantity; copy++) {
      for (const ps of pkg.services) {
        const svc = ps.service;
        lines.push({
          itemType: BookingItemType.SERVICE,
          serviceId: svc.id,
          serviceVariantId: null,
          packageId: pkg.id,
          bundleId: null,
          serviceEnhancementId: null,
          nameSnapshot: svc.name,
          priceSnapshot: isFirstLine ? firstPrice : zero,
          durationMinutesSnapshot: svc.durationMinutes ?? 0,
          quantity: 1,
          isTaxable: pkg.isTaxable,
          lineMetadata: { packageComponent: true },
        });
        isFirstLine = false;
      }
    }
    return lines;
  }

  private async resolveEnhancementLine(
    item: BookingItemInputDto,
    quantity: number,
  ): Promise<ResolvedBookingLine> {
    if (
      !item.serviceEnhancementId ||
      item.serviceId ||
      item.serviceVariantId ||
      item.packageId ||
      item.bundleId
    ) {
      this.throwInvalidItemShape();
    }
    const row = await this.prisma.serviceEnhancement.findUnique({
      where: { id: item.serviceEnhancementId },
    });
    if (!row?.isActive) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Enhancement is not bookable',
          error: 'Bad Request',
          code: 'ENHANCEMENT_INACTIVE',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    const priceNum = row.price !== null ? Number(row.price.toString()) : null;
    if (priceNum === null) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Enhancement has no price for booking',
          error: 'Bad Request',
          code: 'ENHANCEMENT_NOT_PRICEABLE',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    return {
      itemType: BookingItemType.SERVICE_ENHANCEMENT,
      serviceId: null,
      serviceVariantId: null,
      packageId: null,
      bundleId: null,
      serviceEnhancementId: row.id,
      nameSnapshot: row.title,
      priceSnapshot: new Prisma.Decimal(priceNum.toFixed(2)),
      durationMinutesSnapshot: row.durationMinutes ?? 0,
      quantity,
      isTaxable: true,
      lineMetadata: null,
    };
  }

  private async resolveBundleLine(
    branchId: string,
    item: BookingItemInputDto,
    quantity: number,
  ): Promise<ResolvedBookingLine> {
    if (
      !item.bundleId ||
      item.serviceId ||
      item.serviceVariantId ||
      item.packageId ||
      item.serviceEnhancementId
    ) {
      this.throwInvalidItemShape();
    }
    const bundle = await this.prisma.bundle.findUnique({
      where: { id: item.bundleId },
      include: { services: { include: { service: true } } },
    });
    if (!bundle?.isActive) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Bundle is not bookable',
          error: 'Bad Request',
          code: 'BUNDLE_INACTIVE',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    const today = new Date();
    if (bundle.startDate && today < bundle.startDate) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Bundle is not valid yet',
          error: 'Bad Request',
          code: 'BUNDLE_NOT_VALID',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (bundle.endDate && today > bundle.endDate) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Bundle is expired',
          error: 'Bad Request',
          code: 'BUNDLE_NOT_VALID',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const eligibleIds = new Set(bundle.services.map((s) => s.serviceId));
    for (const sid of bundle.services.map((s) => s.serviceId)) {
      await this.assertServiceAtBranch(sid, branchId);
    }

    let lineMetadata: Prisma.JsonValue | null = null;
    let durationMinutes = 0;

    if (bundle.bundleType === BundleType.FLEXIBLE) {
      const selected = item.selectedServiceIds ?? [];
      const unique = new Set(selected);
      if (unique.size !== selected.length) {
        throw new HttpException(
          {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'selectedServiceIds must be unique',
            error: 'Bad Request',
            code: 'BUNDLE_SELECTION_INVALID',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      if (selected.length !== bundle.selectableCount) {
        throw new HttpException(
          {
            statusCode: HttpStatus.BAD_REQUEST,
            message: `selectedServiceIds must contain exactly ${bundle.selectableCount} service id(s)`,
            error: 'Bad Request',
            code: 'BUNDLE_SELECTION_INVALID',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      for (const id of selected) {
        if (!eligibleIds.has(id)) {
          throw new HttpException(
            {
              statusCode: HttpStatus.BAD_REQUEST,
              message: 'selectedServiceIds must be eligible for this bundle',
              error: 'Bad Request',
              code: 'BUNDLE_SELECTION_INVALID',
            },
            HttpStatus.BAD_REQUEST,
          );
        }
      }
      const services = await this.prisma.service.findMany({
        where: { id: { in: selected } },
      });
      durationMinutes = services.reduce(
        (acc, s) => acc + (s.durationMinutes ?? 0),
        0,
      );
      lineMetadata = { selectedServiceIds: selected };
    } else {
      // FIXED / QUANTITY / MEMBERSHIP_STYLE: Sprint 5 uses all eligible services for duration estimate.
      const services = await this.prisma.service.findMany({
        where: { id: { in: [...eligibleIds] } },
      });
      durationMinutes = services.reduce(
        (acc, s) => acc + (s.durationMinutes ?? 0),
        0,
      );
    }

    const price = Number(bundle.price.toString());
    const taxable = bundle.services.some((s) => s.service.isTaxable);

    return {
      itemType: BookingItemType.BUNDLE,
      serviceId: null,
      serviceVariantId: null,
      packageId: null,
      bundleId: bundle.id,
      serviceEnhancementId: null,
      nameSnapshot: bundle.name,
      priceSnapshot: new Prisma.Decimal(price.toFixed(2)),
      durationMinutesSnapshot: durationMinutes,
      quantity,
      isTaxable: taxable,
      lineMetadata,
    };
  }

  private throwInvalidItemShape(): never {
    throw new HttpException(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Invalid item payload for itemType',
        error: 'Bad Request',
        code: 'INVALID_ITEM_SHAPE',
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
