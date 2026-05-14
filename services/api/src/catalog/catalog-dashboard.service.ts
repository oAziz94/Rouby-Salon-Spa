import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OfferAppliesTo,
  BundleType,
  OfferDiscountType,
  PriceDisplayType,
  Prisma,
  GalleryItemLibraryStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { buildListMeta, decimalToNumber, utcDateOnly } from './catalog.utils';
import { validateServicePricing } from './service-pricing.validation';
import type { CreateServiceCategoryDto } from './dto/service-category.dto';
import type { PatchServiceCategoryDto } from './dto/service-category.dto';
import type {
  CreateServiceDto,
  CreateServiceVariantDto,
  PatchServiceDto,
  PatchServiceVariantDto,
} from './dto/service.dto';
import type {
  CreateServiceEnhancementDto,
  PatchServiceEnhancementDto,
} from './dto/service-enhancement.dto';
import type { CreatePackageDto, PatchPackageDto } from './dto/package.dto';
import type { CreateBundleDto, PatchBundleDto } from './dto/bundle.dto';
import type { CreateOfferDto, PatchOfferDto } from './dto/offer.dto';
import {
  assertOnlineBookableRequiresImage,
  assertWritableServiceImagePair,
  expectedImageUrlForKey,
  parsePublicMediaBaseUrls,
  parseStorageKeyFromAllowedImageUrl,
  SERVICE_IMAGE_KEY_RE,
} from './service-image-policy';

const CURRENCY = 'EGP' as const;
const SERVICE_IMAGE_USAGE = 'SERVICE_IMAGE';

@Injectable()
export class CatalogDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private getMediaBases(): string[] {
    return parsePublicMediaBaseUrls(
      this.config.get<string>('PUBLIC_MEDIA_BASE_URL'),
    );
  }

  private validateResolvedServiceImage(
    bookingAvailability: boolean,
    imageUrl: string | null,
    imageKey: string | null,
  ): void {
    const bases = this.getMediaBases();
    assertWritableServiceImagePair(imageUrl, imageKey, bases);
    assertOnlineBookableRequiresImage(bookingAvailability, imageUrl);
  }

  private async resolveGalleryImageForService(imageMediaId: string): Promise<{
    imageMediaId: string;
    imageUrl: string;
    imageKey: string | null;
  }> {
    const item = await this.prisma.galleryItem.findFirst({
      where: {
        id: imageMediaId,
        libraryStatus: GalleryItemLibraryStatus.ACTIVE,
      },
    });
    if (!item) {
      throw new BadRequestException('Invalid or inactive gallery image');
    }
    const bases = this.getMediaBases();
    const key =
      (item.storageKey && SERVICE_IMAGE_KEY_RE.test(item.storageKey)
        ? item.storageKey
        : null) ?? parseStorageKeyFromAllowedImageUrl(item.imageUrl, bases);
    if (!key || !SERVICE_IMAGE_KEY_RE.test(key)) {
      throw new BadRequestException(
        'Only salon-uploaded gallery images can be linked to services.',
      );
    }
    const imageUrl = expectedImageUrlForKey(key, bases)[0] ?? item.imageUrl;
    assertWritableServiceImagePair(imageUrl, key, bases);
    return { imageMediaId: item.id, imageUrl, imageKey: key };
  }

  private async syncServiceImageMediaUsage(
    tx: Prisma.TransactionClient,
    serviceId: string,
    galleryItemId: string | null,
  ) {
    await tx.mediaUsage.deleteMany({
      where: { usageType: SERVICE_IMAGE_USAGE, entityId: serviceId },
    });
    if (galleryItemId) {
      await tx.mediaUsage.create({
        data: {
          galleryItemId,
          usageType: SERVICE_IMAGE_USAGE,
          entityType: 'Service',
          entityId: serviceId,
          isPrimary: true,
        },
      });
    }
  }

  private validateServiceImageForCreate(
    bookingAvailability: boolean,
    imageUrl: string | null,
    imageKey: string | null,
  ): void {
    this.validateResolvedServiceImage(bookingAvailability, imageUrl, imageKey);
  }

  private validateServiceImageForPatch(
    bookingAvailability: boolean,
    imageUrl: string | null,
    imageKey: string | null,
  ): void {
    this.validateResolvedServiceImage(bookingAvailability, imageUrl, imageKey);
  }

  private async assertBranchesExist(branchIds: string[]): Promise<void> {
    if (branchIds.length === 0) {
      return;
    }
    const unique = [...new Set(branchIds)];
    const rows = await this.prisma.branch.findMany({
      where: { id: { in: unique } },
      select: { id: true },
    });
    if (rows.length !== unique.length) {
      throw new BadRequestException('One or more branchIds are invalid');
    }
  }

  private mapCategory(row: {
    id: string;
    name: string;
    description: string | null;
    imageUrl: string | null;
    sortOrder: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return { ...row, currency: CURRENCY };
  }

  private mapService(row: {
    id: string;
    categoryId: string;
    name: string;
    description: string | null;
    shortDescription: string | null;
    imageMediaId: string | null;
    imageUrl: string | null;
    imageKey: string | null;
    imageAlt: string | null;
    displayOrder: number;
    isFeatured: boolean;
    badgeLabel: string | null;
    priceDisplayType: PriceDisplayType;
    basePrice: Prisma.Decimal | null;
    basePriceMax: Prisma.Decimal | null;
    durationMinutes: number | null;
    isTaxable: boolean;
    bookingAvailability: boolean;
    preparationNotes: string | null;
    aftercareNotes: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    branches?: { branchId: string }[];
    imageMedia?: {
      id: string;
      imageUrl: string;
      title: string | null;
      altText: string | null;
    } | null;
    benefits?: Array<{
      id: string;
      label: string;
      displayOrder: number;
      isActive: boolean;
      createdAt: Date;
      updatedAt: Date;
    }>;
  }) {
    const branchIds = row.branches?.map((b) => b.branchId) ?? [];
    return {
      id: row.id,
      categoryId: row.categoryId,
      name: row.name,
      description: row.description,
      shortDescription: row.shortDescription,
      imageMediaId: row.imageMediaId ?? null,
      imageMedia: row.imageMedia
        ? {
            id: row.imageMedia.id,
            url: row.imageMedia.imageUrl,
            title: row.imageMedia.title,
            altText: row.imageMedia.altText,
          }
        : null,
      imageUrl: row.imageUrl,
      imageKey: row.imageKey,
      imageAlt: row.imageAlt,
      displayOrder: row.displayOrder,
      isFeatured: row.isFeatured,
      badgeLabel: row.badgeLabel,
      priceDisplayType: row.priceDisplayType,
      basePrice: decimalToNumber(row.basePrice),
      basePriceMax: decimalToNumber(row.basePriceMax),
      durationMinutes: row.durationMinutes,
      isTaxable: row.isTaxable,
      bookingAvailability: row.bookingAvailability,
      preparationNotes: row.preparationNotes,
      aftercareNotes: row.aftercareNotes,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      currency: CURRENCY,
      branchIds,
      benefits: (row.benefits ?? []).map((benefit) => ({
        id: benefit.id,
        label: benefit.label,
        displayOrder: benefit.displayOrder,
        isActive: benefit.isActive,
        createdAt: benefit.createdAt,
        updatedAt: benefit.updatedAt,
      })),
    };
  }

  private mapServiceEnhancement(row: {
    id: string;
    title: string;
    shortDescription: string | null;
    price: Prisma.Decimal | null;
    durationMinutes: number | null;
    imageUrl: string | null;
    displayOrder: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      title: row.title,
      shortDescription: row.shortDescription,
      price: decimalToNumber(row.price),
      durationMinutes: row.durationMinutes,
      imageUrl: row.imageUrl,
      displayOrder: row.displayOrder,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      currency: CURRENCY,
    };
  }

  private mapVariant(row: {
    id: string;
    serviceId: string;
    name: string;
    description: string | null;
    price: Prisma.Decimal;
    durationMinutes: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      ...row,
      price: decimalToNumber(row.price),
      currency: CURRENCY,
    };
  }

  /** Mirrors public catalog rules for package listing (no image requirement). */
  private packagePublicListingWhereInput(): Prisma.PackageWhereInput {
    const todayDate = utcDateOnly(new Date());
    return {
      isActive: true,
      durationMinutes: { not: null, gt: 0 },
      services: { some: {} },
      branches: { some: { branch: { isActive: true } } },
      AND: [
        { OR: [{ startDate: null }, { startDate: { lte: todayDate } }] },
        { OR: [{ endDate: null }, { endDate: { gte: todayDate } }] },
      ],
      packagePrice: { gt: 0 },
    };
  }

  private packageSatisfiesPublicListing(p: {
    isActive: boolean;
    startDate: Date | null;
    endDate: Date | null;
    durationMinutes: number | null;
    packagePrice: Prisma.Decimal;
    services: unknown[];
    branches: Array<{ branch: { isActive: boolean } }>;
  }): boolean {
    const todayDate = utcDateOnly(new Date());
    if (!p.isActive) return false;
    if (!p.services?.length) return false;
    if (p.durationMinutes == null || p.durationMinutes < 1) return false;
    const pkg = decimalToNumber(p.packagePrice);
    if (pkg === null || pkg <= 0) return false;
    if (p.startDate && utcDateOnly(p.startDate) > todayDate) return false;
    if (p.endDate && utcDateOnly(p.endDate) < todayDate) return false;
    return p.branches.some((b) => b.branch.isActive);
  }

  private mapPackage(p: {
    id: string;
    name: string;
    description: string | null;
    shortDescription: string | null;
    imageUrl: string | null;
    originalPrice: Prisma.Decimal;
    packagePrice: Prisma.Decimal;
    durationMinutes: number | null;
    startDate: Date | null;
    endDate: Date | null;
    isTaxable: boolean;
    isActive: boolean;
    isFeatured: boolean;
    badgeLabel: string | null;
    createdAt: Date;
    updatedAt: Date;
    features?: Array<{
      id: string;
      label: string;
      displayOrder: number;
      isActive: boolean;
    }>;
    services: Array<{ serviceId: string; sortOrder: number }>;
    branches: Array<{ branchId: string; branch: { isActive: boolean } }>;
  }) {
    const orderedServices = [...p.services].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    const serviceIds = orderedServices.map((s) => s.serviceId);
    const branchIds = p.branches.map((b) => b.branchId);
    const isPublicListingReady = this.packageSatisfiesPublicListing({
      isActive: p.isActive,
      startDate: p.startDate,
      endDate: p.endDate,
      durationMinutes: p.durationMinutes,
      packagePrice: p.packagePrice,
      services: p.services,
      branches: p.branches,
    });
    const features = (p.features ?? []).map((f) => ({
      id: f.id,
      label: f.label,
      displayOrder: f.displayOrder,
      isActive: f.isActive,
    }));
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      shortDescription: p.shortDescription,
      imageUrl: p.imageUrl,
      originalPrice: decimalToNumber(p.originalPrice),
      packagePrice: decimalToNumber(p.packagePrice),
      durationMinutes: p.durationMinutes,
      startDate: p.startDate,
      endDate: p.endDate,
      isTaxable: p.isTaxable,
      isActive: p.isActive,
      isFeatured: p.isFeatured,
      badgeLabel: p.badgeLabel,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      currency: CURRENCY,
      serviceIds,
      branchIds,
      features,
      isPublicListingReady,
    };
  }

  private mapBundle(
    row: {
      id: string;
      name: string;
      description: string | null;
      bundleType: BundleType;
      price: Prisma.Decimal;
      rules: Prisma.JsonValue;
      selectableCount: number;
      startDate: Date | null;
      endDate: Date | null;
      isActive: boolean;
      createdAt: Date;
      updatedAt: Date;
    },
    serviceIds: string[],
  ) {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      bundleType: row.bundleType,
      price: decimalToNumber(row.price),
      rules: row.rules,
      selectableCount: row.selectableCount,
      startDate: row.startDate,
      endDate: row.endDate,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      currency: CURRENCY,
      serviceIds,
    };
  }

  private mapOffer(row: {
    id: string;
    name: string;
    description: string | null;
    offerCode: string | null;
    discountType: OfferDiscountType;
    discountValue: Prisma.Decimal;
    startDate: Date;
    endDate: Date;
    usageLimit: number | null;
    perClientUsageLimit: number | null;
    minimumSpend: Prisma.Decimal | null;
    appliesTo: OfferAppliesTo;
    isActive: boolean;
    eligibilityRules: Prisma.JsonValue | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      ...row,
      discountValue: decimalToNumber(row.discountValue),
      minimumSpend: decimalToNumber(row.minimumSpend),
      eligibilityRules: row.eligibilityRules,
      currency: CURRENCY,
    };
  }

  private buildOfferEligibilityRules(input: {
    eligibilityRules?: Record<string, unknown> | null;
    serviceIds?: string[];
    packageIds?: string[];
  }): Prisma.InputJsonValue | undefined {
    const next: Record<string, unknown> = {
      ...(input.eligibilityRules ?? {}),
    };
    if (input.serviceIds !== undefined) {
      next.serviceIds = input.serviceIds;
    }
    if (input.packageIds !== undefined) {
      next.packageIds = input.packageIds;
    }
    return Object.keys(next).length
      ? (next as Prisma.InputJsonValue)
      : undefined;
  }

  private readEligibilityRulesObject(
    value: Prisma.JsonValue | null,
  ): Record<string, unknown> | null {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value;
    }
    return null;
  }

  // --- Categories ---

  async listCategories(query: { isActive?: boolean }) {
    const where =
      query.isActive === undefined ? {} : { isActive: query.isActive };
    const rows = await this.prisma.serviceCategory.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return { data: rows.map((r) => this.mapCategory(r)) };
  }

  async createCategory(dto: CreateServiceCategoryDto) {
    const row = await this.prisma.serviceCategory.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
        imageUrl: dto.imageUrl ?? null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
    return this.mapCategory(row);
  }

  async patchCategory(id: string, dto: PatchServiceCategoryDto) {
    try {
      const row = await this.prisma.serviceCategory.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && {
            description: dto.description,
          }),
          ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
          ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        },
      });
      return this.mapCategory(row);
    } catch {
      throw new NotFoundException('Category not found');
    }
  }

  // --- Services ---

  async listServices(query: {
    page: number;
    pageSize: number;
    categoryId?: string;
    isActive?: boolean;
  }) {
    const where: Prisma.ServiceWhereInput = {};
    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }
    const skip = (query.page - 1) * query.pageSize;
    const [totalItems, rows] = await Promise.all([
      this.prisma.service.count({ where }),
      this.prisma.service.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
        include: {
          branches: true,
          benefits: {
            orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
          },
          imageMedia: {
            select: { id: true, imageUrl: true, title: true, altText: true },
          },
        },
      }),
    ]);
    return {
      data: rows.map((r) => this.mapService(r)),
      meta: buildListMeta({
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
      }),
    };
  }

  async createService(dto: CreateServiceDto) {
    await this.assertBranchesExist(dto.branchIds);
    const uniqueBranches = [...new Set(dto.branchIds)];
    validateServicePricing({
      priceDisplayType: dto.priceDisplayType,
      basePrice: dto.basePrice ?? null,
      basePriceMax: dto.basePriceMax ?? null,
    });
    const cat = await this.prisma.serviceCategory.findUnique({
      where: { id: dto.categoryId },
    });
    if (!cat) {
      throw new BadRequestException('Invalid categoryId');
    }
    if (
      dto.imageMediaId &&
      (dto.imageUrl !== undefined || dto.imageKey !== undefined)
    ) {
      throw new BadRequestException(
        'Send either imageMediaId or imageUrl/imageKey, not both',
      );
    }
    let imageUrl = dto.imageUrl ?? null;
    let imageKey = dto.imageKey ?? null;
    let imageMediaId: string | null = dto.imageMediaId ?? null;
    if (dto.imageMediaId) {
      const resolved = await this.resolveGalleryImageForService(dto.imageMediaId);
      imageUrl = resolved.imageUrl;
      imageKey = resolved.imageKey;
      imageMediaId = resolved.imageMediaId;
    }
    this.validateServiceImageForCreate(
      dto.bookingAvailability ?? true,
      imageUrl,
      imageKey,
    );
    const row = await this.prisma.$transaction(async (tx) => {
      const s = await tx.service.create({
        data: {
          categoryId: dto.categoryId,
          name: dto.name,
          description: dto.description ?? null,
          shortDescription: dto.shortDescription ?? null,
          imageMediaId,
          imageUrl,
          imageKey,
          imageAlt: dto.imageAlt ?? null,
          displayOrder: dto.displayOrder ?? 0,
          isFeatured: dto.isFeatured ?? false,
          badgeLabel: dto.badgeLabel ?? null,
          priceDisplayType: dto.priceDisplayType,
          basePrice:
            dto.basePrice === null || dto.basePrice === undefined
              ? null
              : new Prisma.Decimal(dto.basePrice),
          basePriceMax:
            dto.basePriceMax === null || dto.basePriceMax === undefined
              ? null
              : new Prisma.Decimal(dto.basePriceMax),
          durationMinutes: dto.durationMinutes ?? null,
          isTaxable: dto.isTaxable ?? true,
          bookingAvailability: dto.bookingAvailability ?? true,
          preparationNotes: dto.preparationNotes ?? null,
          aftercareNotes: dto.aftercareNotes ?? null,
          isActive: dto.isActive ?? true,
          branches: {
            create: uniqueBranches.map((branchId) => ({ branchId })),
          },
          ...(dto.benefits?.length
            ? {
                benefits: {
                  create: dto.benefits.map((benefit, index) => ({
                    label: benefit.label.trim(),
                    displayOrder: benefit.displayOrder ?? index,
                    isActive: benefit.isActive ?? true,
                  })),
                },
              }
            : {}),
        },
        include: {
          branches: true,
          benefits: {
            orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
          },
          imageMedia: {
            select: { id: true, imageUrl: true, title: true, altText: true },
          },
        },
      });
      await this.syncServiceImageMediaUsage(tx, s.id, imageMediaId);
      return s;
    });
    return this.mapService(row);
  }

  async patchService(id: string, dto: PatchServiceDto) {
    const existing = await this.prisma.service.findUnique({
      where: { id },
      include: { branches: true, benefits: true },
    });
    if (!existing) {
      throw new NotFoundException('Service not found');
    }
    if (
      dto.imageMediaId &&
      (dto.imageUrl !== undefined || dto.imageKey !== undefined)
    ) {
      throw new BadRequestException(
        'Send either imageMediaId or imageUrl/imageKey, not both',
      );
    }

    let nextUrl = existing.imageUrl;
    let nextKey = existing.imageKey;
    let nextMediaId = existing.imageMediaId;

    if (dto.imageMediaId !== undefined) {
      if (dto.imageMediaId === null) {
        nextMediaId = null;
        if (dto.imageUrl !== undefined || dto.imageKey !== undefined) {
          if (dto.imageUrl === undefined || dto.imageKey === undefined) {
            throw new BadRequestException(
              'imageUrl and imageKey must be sent together when updating image fields',
            );
          }
          nextUrl = dto.imageUrl;
          nextKey = dto.imageKey;
        } else {
          nextUrl = null;
          nextKey = null;
        }
      } else {
        const resolved = await this.resolveGalleryImageForService(dto.imageMediaId);
        nextUrl = resolved.imageUrl;
        nextKey = resolved.imageKey;
        nextMediaId = resolved.imageMediaId;
      }
    } else if (dto.imageUrl !== undefined || dto.imageKey !== undefined) {
      if (dto.imageUrl === undefined || dto.imageKey === undefined) {
        throw new BadRequestException(
          'imageUrl and imageKey must be sent together when updating image fields',
        );
      }
      nextUrl = dto.imageUrl ?? null;
      nextKey = dto.imageKey ?? null;
      nextMediaId = null;
    }

    const nextBooking =
      dto.bookingAvailability !== undefined
        ? dto.bookingAvailability
        : existing.bookingAvailability;
    this.validateServiceImageForPatch(nextBooking, nextUrl, nextKey);

    const nextType = dto.priceDisplayType ?? existing.priceDisplayType;
    const nextMin =
      dto.basePrice !== undefined
        ? dto.basePrice
        : decimalToNumber(existing.basePrice);
    const nextMax =
      dto.basePriceMax !== undefined
        ? dto.basePriceMax
        : decimalToNumber(existing.basePriceMax);
    validateServicePricing({
      priceDisplayType: nextType,
      basePrice: nextMin,
      basePriceMax: nextMax,
    });
    if (dto.categoryId) {
      const cat = await this.prisma.serviceCategory.findUnique({
        where: { id: dto.categoryId },
      });
      if (!cat) {
        throw new BadRequestException('Invalid categoryId');
      }
    }
    if (dto.branchIds) {
      await this.assertBranchesExist(dto.branchIds);
    }
    const imageChanged =
      dto.imageMediaId !== undefined ||
      dto.imageUrl !== undefined ||
      dto.imageKey !== undefined;
    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.branchIds) {
        const uniqueBranches = [...new Set(dto.branchIds)];
        await tx.serviceBranch.deleteMany({ where: { serviceId: id } });
        if (uniqueBranches.length > 0) {
          await tx.serviceBranch.createMany({
            data: uniqueBranches.map((branchId) => ({
              serviceId: id,
              branchId,
            })),
          });
        }
      }
      if (dto.benefits !== undefined) {
        await tx.serviceBenefit.deleteMany({ where: { serviceId: id } });
        if (dto.benefits.length > 0) {
          await tx.serviceBenefit.createMany({
            data: dto.benefits.map((benefit, index) => ({
              serviceId: id,
              label: benefit.label.trim(),
              displayOrder: benefit.displayOrder ?? index,
              isActive: benefit.isActive ?? true,
            })),
          });
        }
      }
      const updated = await tx.service.update({
        where: { id },
        data: {
          ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && {
            description: dto.description,
          }),
          ...(dto.shortDescription !== undefined && {
            shortDescription: dto.shortDescription,
          }),
          ...(imageChanged && {
            imageMediaId: nextMediaId,
            imageUrl: nextUrl,
            imageKey: nextKey,
          }),
          ...(dto.imageAlt !== undefined && { imageAlt: dto.imageAlt }),
          ...(dto.displayOrder !== undefined && {
            displayOrder: dto.displayOrder,
          }),
          ...(dto.isFeatured !== undefined && { isFeatured: dto.isFeatured }),
          ...(dto.badgeLabel !== undefined && { badgeLabel: dto.badgeLabel }),
          ...(dto.priceDisplayType !== undefined && {
            priceDisplayType: dto.priceDisplayType,
          }),
          ...(dto.basePrice !== undefined && {
            basePrice:
              dto.basePrice === null ? null : new Prisma.Decimal(dto.basePrice),
          }),
          ...(dto.basePriceMax !== undefined && {
            basePriceMax:
              dto.basePriceMax === null
                ? null
                : new Prisma.Decimal(dto.basePriceMax),
          }),
          ...(dto.durationMinutes !== undefined && {
            durationMinutes: dto.durationMinutes,
          }),
          ...(dto.isTaxable !== undefined && { isTaxable: dto.isTaxable }),
          ...(dto.bookingAvailability !== undefined && {
            bookingAvailability: dto.bookingAvailability,
          }),
          ...(dto.preparationNotes !== undefined && {
            preparationNotes: dto.preparationNotes,
          }),
          ...(dto.aftercareNotes !== undefined && {
            aftercareNotes: dto.aftercareNotes,
          }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        },
        include: {
          branches: true,
          benefits: {
            orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
          },
          imageMedia: {
            select: { id: true, imageUrl: true, title: true, altText: true },
          },
        },
      });
      if (imageChanged) {
        await this.syncServiceImageMediaUsage(tx, id, nextMediaId);
      }
      return updated;
    });
    if (
      dto.basePrice !== undefined ||
      dto.basePriceMax !== undefined ||
      dto.priceDisplayType !== undefined
    ) {
      await this.audit.log({
        userId: null,
        action: 'service.price_changed',
        module: 'catalog',
        entityId: row.id,
        oldValue: {
          priceDisplayType: existing.priceDisplayType,
          basePrice: decimalToNumber(existing.basePrice),
          basePriceMax: decimalToNumber(existing.basePriceMax),
        },
        newValue: {
          priceDisplayType: row.priceDisplayType,
          basePrice: decimalToNumber(row.basePrice),
          basePriceMax: decimalToNumber(row.basePriceMax),
        },
      });
    }
    return this.mapService(row);
  }

  async patchServiceStatus(id: string, isActive: boolean) {
    try {
      const row = await this.prisma.service.update({
        where: { id },
        data: { isActive },
        include: {
          branches: true,
          benefits: {
            orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
          },
          imageMedia: {
            select: { id: true, imageUrl: true, title: true, altText: true },
          },
        },
      });
      return this.mapService(row);
    } catch {
      throw new NotFoundException('Service not found');
    }
  }

  // --- Variants ---

  async listVariants(serviceId: string) {
    const svc = await this.prisma.service.findUnique({
      where: { id: serviceId },
    });
    if (!svc) {
      throw new NotFoundException('Service not found');
    }
    const rows = await this.prisma.serviceVariant.findMany({
      where: { serviceId },
      orderBy: { name: 'asc' },
    });
    return { data: rows.map((r) => this.mapVariant(r)) };
  }

  async createVariant(serviceId: string, dto: CreateServiceVariantDto) {
    const svc = await this.prisma.service.findUnique({
      where: { id: serviceId },
    });
    if (!svc) {
      throw new NotFoundException('Service not found');
    }
    const row = await this.prisma.serviceVariant.create({
      data: {
        serviceId,
        name: dto.name,
        description: dto.description ?? null,
        price: new Prisma.Decimal(dto.price),
        durationMinutes: dto.durationMinutes,
        isActive: dto.isActive ?? true,
      },
    });
    return this.mapVariant(row);
  }

  async patchVariant(id: string, dto: PatchServiceVariantDto) {
    try {
      const row = await this.prisma.serviceVariant.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && {
            description: dto.description,
          }),
          ...(dto.price !== undefined && {
            price: new Prisma.Decimal(dto.price),
          }),
          ...(dto.durationMinutes !== undefined && {
            durationMinutes: dto.durationMinutes,
          }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        },
      });
      return this.mapVariant(row);
    } catch {
      throw new NotFoundException('Variant not found');
    }
  }

  async patchVariantStatus(id: string, isActive: boolean) {
    try {
      const row = await this.prisma.serviceVariant.update({
        where: { id },
        data: { isActive },
      });
      return this.mapVariant(row);
    } catch {
      throw new NotFoundException('Variant not found');
    }
  }

  // --- Packages ---

  private validatePackageDates(start: Date | null, end: Date | null) {
    if (start && end && end < start) {
      throw new BadRequestException('endDate must be on or after startDate');
    }
  }

  async listPackages(query: {
    page: number;
    pageSize: number;
    isActive?: boolean;
    search?: string;
    branchId?: string;
    publicListing?: boolean;
  }) {
    const parts: Prisma.PackageWhereInput[] = [];
    if (query.isActive !== undefined) {
      parts.push({ isActive: query.isActive });
    }
    const t = query.search?.trim();
    if (t) {
      parts.push({ name: { contains: t, mode: 'insensitive' } });
    }
    if (query.branchId) {
      parts.push({ branches: { some: { branchId: query.branchId } } });
    }
    if (query.publicListing === true) {
      parts.push(this.packagePublicListingWhereInput());
    } else if (query.publicListing === false) {
      parts.push({ NOT: this.packagePublicListingWhereInput() });
    }
    const where: Prisma.PackageWhereInput =
      parts.length === 0 ? {} : parts.length === 1 ? parts[0] : { AND: parts };
    const skip = (query.page - 1) * query.pageSize;
    const [totalItems, rows] = await Promise.all([
      this.prisma.package.count({ where }),
      this.prisma.package.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: { name: 'asc' },
        include: {
          services: { orderBy: { sortOrder: 'asc' } },
          branches: { include: { branch: true } },
          features: { orderBy: { displayOrder: 'asc' } },
        },
      }),
    ]);
    return {
      data: rows.map((p) =>
        this.mapPackage({
          ...p,
          branches: p.branches.map((b) => ({
            branchId: b.branchId,
            branch: { isActive: b.branch.isActive },
          })),
        }),
      ),
      meta: buildListMeta({
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
      }),
    };
  }

  async createPackage(dto: CreatePackageDto) {
    this.validatePackageDates(dto.startDate ?? null, dto.endDate ?? null);
    const uniqueServices = [...new Set(dto.serviceIds)];
    const uniqueBranches = [...new Set(dto.branchIds)];
    if (uniqueServices.length === 0) {
      throw new BadRequestException('serviceIds must not be empty');
    }
    if (uniqueBranches.length === 0) {
      throw new BadRequestException('branchIds must not be empty');
    }
    await this.assertBranchesExist(uniqueBranches);
    const svcCount = await this.prisma.service.count({
      where: { id: { in: uniqueServices } },
    });
    if (svcCount !== uniqueServices.length) {
      throw new BadRequestException('One or more serviceIds are invalid');
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const p = await tx.package.create({
        data: {
          name: dto.name,
          description: dto.description ?? null,
          shortDescription: dto.shortDescription ?? null,
          imageUrl: dto.imageUrl ?? null,
          originalPrice: new Prisma.Decimal(dto.originalPrice),
          packagePrice: new Prisma.Decimal(dto.packagePrice),
          durationMinutes: dto.durationMinutes ?? null,
          startDate: dto.startDate ?? null,
          endDate: dto.endDate ?? null,
          isTaxable: dto.isTaxable ?? true,
          isActive: dto.isActive ?? true,
          isFeatured: dto.isFeatured ?? false,
          badgeLabel: dto.badgeLabel ?? null,
          services: {
            create: uniqueServices.map((serviceId, i) => ({
              serviceId,
              sortOrder: i,
            })),
          },
          branches: {
            create: uniqueBranches.map((branchId) => ({ branchId })),
          },
          ...(dto.features?.length
            ? {
                features: {
                  create: dto.features.map((f, i) => ({
                    label: f.label.trim(),
                    displayOrder: f.displayOrder ?? i,
                    isActive: f.isActive ?? true,
                  })),
                },
              }
            : {}),
        },
        include: {
          services: { orderBy: { sortOrder: 'asc' } },
          branches: { include: { branch: true } },
          features: { orderBy: { displayOrder: 'asc' } },
        },
      });
      return p;
    });
    return this.mapPackage({
      ...row,
      branches: row.branches.map((b) => ({
        branchId: b.branchId,
        branch: { isActive: b.branch.isActive },
      })),
    });
  }

  async patchPackage(id: string, dto: PatchPackageDto) {
    const existing = await this.prisma.package.findUnique({
      where: { id },
      include: { services: true, branches: true },
    });
    if (!existing) {
      throw new NotFoundException('Package not found');
    }
    const nextStart =
      dto.startDate !== undefined ? dto.startDate : existing.startDate;
    const nextEnd = dto.endDate !== undefined ? dto.endDate : existing.endDate;
    this.validatePackageDates(nextStart, nextEnd);
    if (dto.branchIds) {
      await this.assertBranchesExist(dto.branchIds);
    }
    if (dto.serviceIds) {
      const uniqueServices = [...new Set(dto.serviceIds)];
      if (uniqueServices.length === 0) {
        throw new BadRequestException('serviceIds must not be empty');
      }
      const svcCount = await this.prisma.service.count({
        where: { id: { in: uniqueServices } },
      });
      if (svcCount !== uniqueServices.length) {
        throw new BadRequestException('One or more serviceIds are invalid');
      }
    }
    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.serviceIds) {
        const uniqueServices = [...new Set(dto.serviceIds)];
        await tx.packageService.deleteMany({ where: { packageId: id } });
        await tx.packageService.createMany({
          data: uniqueServices.map((serviceId, i) => ({
            packageId: id,
            serviceId,
            sortOrder: i,
          })),
        });
      }
      if (dto.branchIds) {
        const uniqueBranches = [...new Set(dto.branchIds)];
        if (uniqueBranches.length === 0) {
          throw new BadRequestException('branchIds must not be empty');
        }
        await tx.packageBranch.deleteMany({ where: { packageId: id } });
        await tx.packageBranch.createMany({
          data: uniqueBranches.map((branchId) => ({
            packageId: id,
            branchId,
          })),
        });
      }
      if (dto.features !== undefined) {
        await tx.packageFeature.deleteMany({ where: { packageId: id } });
        if (dto.features.length > 0) {
          await tx.packageFeature.createMany({
            data: dto.features.map((f, i) => ({
              packageId: id,
              label: f.label.trim(),
              displayOrder: f.displayOrder ?? i,
              isActive: f.isActive ?? true,
            })),
          });
        }
      }
      return tx.package.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && {
            description: dto.description,
          }),
          ...(dto.shortDescription !== undefined && {
            shortDescription: dto.shortDescription,
          }),
          ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
          ...(dto.originalPrice !== undefined && {
            originalPrice: new Prisma.Decimal(dto.originalPrice),
          }),
          ...(dto.packagePrice !== undefined && {
            packagePrice: new Prisma.Decimal(dto.packagePrice),
          }),
          ...(dto.durationMinutes !== undefined && {
            durationMinutes: dto.durationMinutes,
          }),
          ...(dto.startDate !== undefined && { startDate: dto.startDate }),
          ...(dto.endDate !== undefined && { endDate: dto.endDate }),
          ...(dto.isTaxable !== undefined && { isTaxable: dto.isTaxable }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
          ...(dto.isFeatured !== undefined && { isFeatured: dto.isFeatured }),
          ...(dto.badgeLabel !== undefined && { badgeLabel: dto.badgeLabel }),
        },
        include: {
          services: { orderBy: { sortOrder: 'asc' } },
          branches: { include: { branch: true } },
          features: { orderBy: { displayOrder: 'asc' } },
        },
      });
    });
    return this.mapPackage({
      ...row,
      branches: row.branches.map((b) => ({
        branchId: b.branchId,
        branch: { isActive: b.branch.isActive },
      })),
    });
  }

  async patchPackageStatus(id: string, isActive: boolean) {
    try {
      const row = await this.prisma.package.update({
        where: { id },
        data: { isActive },
        include: {
          services: { orderBy: { sortOrder: 'asc' } },
          branches: { include: { branch: true } },
          features: { orderBy: { displayOrder: 'asc' } },
        },
      });
      return this.mapPackage({
        ...row,
        branches: row.branches.map((b) => ({
          branchId: b.branchId,
          branch: { isActive: b.branch.isActive },
        })),
      });
    } catch {
      throw new NotFoundException('Package not found');
    }
  }

  // --- Bundles ---

  private validateBundle(
    bundleType: BundleType,
    serviceIds: string[],
    selectableCount: number,
  ) {
    if (serviceIds.length === 0) {
      throw new BadRequestException('serviceIds must not be empty');
    }
    if (selectableCount < 1) {
      throw new BadRequestException('selectableCount must be at least 1');
    }
    if (
      (bundleType === BundleType.FLEXIBLE ||
        bundleType === BundleType.QUANTITY) &&
      selectableCount > serviceIds.length
    ) {
      throw new BadRequestException(
        'selectableCount cannot exceed number of eligible services for this bundle type',
      );
    }
  }

  async listBundles(query: {
    page: number;
    pageSize: number;
    isActive?: boolean;
  }) {
    const where: Prisma.BundleWhereInput = {};
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }
    const skip = (query.page - 1) * query.pageSize;
    const [totalItems, rows] = await Promise.all([
      this.prisma.bundle.count({ where }),
      this.prisma.bundle.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: { name: 'asc' },
        include: { services: true },
      }),
    ]);
    return {
      data: rows.map((b) =>
        this.mapBundle(
          b,
          b.services.map((s) => s.serviceId),
        ),
      ),
      meta: buildListMeta({
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
      }),
    };
  }

  async createBundle(dto: CreateBundleDto) {
    const uniqueServices = [...new Set(dto.serviceIds)];
    this.validateBundle(dto.bundleType, uniqueServices, dto.selectableCount);
    const svcCount = await this.prisma.service.count({
      where: { id: { in: uniqueServices } },
    });
    if (svcCount !== uniqueServices.length) {
      throw new BadRequestException('One or more serviceIds are invalid');
    }
    const row = await this.prisma.$transaction(async (tx) => {
      return tx.bundle.create({
        data: {
          name: dto.name,
          description: dto.description ?? null,
          bundleType: dto.bundleType,
          price: new Prisma.Decimal(dto.price),
          ...(dto.rules !== undefined
            ? {
                rules:
                  dto.rules === null
                    ? Prisma.JsonNull
                    : (dto.rules as Prisma.InputJsonValue),
              }
            : {}),
          selectableCount: dto.selectableCount,
          startDate: dto.startDate ?? null,
          endDate: dto.endDate ?? null,
          isActive: dto.isActive ?? true,
          services: {
            create: uniqueServices.map((serviceId, i) => ({
              serviceId,
              sortOrder: i,
            })),
          },
        },
        include: { services: true },
      });
    });
    return this.mapBundle(
      row,
      row.services.map((s) => s.serviceId),
    );
  }

  async patchBundle(id: string, dto: PatchBundleDto) {
    const existing = await this.prisma.bundle.findUnique({
      where: { id },
      include: { services: true },
    });
    if (!existing) {
      throw new NotFoundException('Bundle not found');
    }
    const nextType = dto.bundleType ?? existing.bundleType;
    const nextIds = dto.serviceIds
      ? [...new Set(dto.serviceIds)]
      : existing.services.map((s) => s.serviceId);
    const nextSel = dto.selectableCount ?? existing.selectableCount;
    this.validateBundle(nextType, nextIds, nextSel);
    if (dto.serviceIds) {
      const svcCount = await this.prisma.service.count({
        where: { id: { in: nextIds } },
      });
      if (svcCount !== nextIds.length) {
        throw new BadRequestException('One or more serviceIds are invalid');
      }
    }
    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.serviceIds) {
        await tx.bundleService.deleteMany({ where: { bundleId: id } });
        await tx.bundleService.createMany({
          data: nextIds.map((serviceId, i) => ({
            bundleId: id,
            serviceId,
            sortOrder: i,
          })),
        });
      }
      return tx.bundle.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && {
            description: dto.description,
          }),
          ...(dto.bundleType !== undefined && { bundleType: dto.bundleType }),
          ...(dto.price !== undefined && {
            price: new Prisma.Decimal(dto.price),
          }),
          ...(dto.rules !== undefined && {
            rules:
              dto.rules === null
                ? Prisma.JsonNull
                : (dto.rules as Prisma.InputJsonValue),
          }),
          ...(dto.selectableCount !== undefined && {
            selectableCount: dto.selectableCount,
          }),
          ...(dto.startDate !== undefined && { startDate: dto.startDate }),
          ...(dto.endDate !== undefined && { endDate: dto.endDate }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        },
        include: { services: true },
      });
    });
    return this.mapBundle(
      row,
      row.services.map((s) => s.serviceId),
    );
  }

  async patchBundleStatus(id: string, isActive: boolean) {
    try {
      const row = await this.prisma.bundle.update({
        where: { id },
        data: { isActive },
        include: { services: true },
      });
      return this.mapBundle(
        row,
        row.services.map((s) => s.serviceId),
      );
    } catch {
      throw new NotFoundException('Bundle not found');
    }
  }

  // --- Offers ---

  private validateOffer(
    discountType: OfferDiscountType,
    discountValue: number,
    start: Date,
    end: Date,
  ) {
    if (end < start) {
      throw new BadRequestException('endDate must be on or after startDate');
    }
    if (discountType === OfferDiscountType.PERCENTAGE && discountValue > 100) {
      throw new BadRequestException(
        'discountValue for PERCENTAGE must be at most 100',
      );
    }
  }

  async listOffers(query: {
    page: number;
    pageSize: number;
    isActive?: boolean;
  }) {
    const where: Prisma.OfferWhereInput = {};
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }
    const skip = (query.page - 1) * query.pageSize;
    const [totalItems, rows] = await Promise.all([
      this.prisma.offer.count({ where }),
      this.prisma.offer.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: { startDate: 'desc' },
      }),
    ]);
    return {
      data: rows.map((o) => this.mapOffer(o)),
      meta: buildListMeta({
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
      }),
    };
  }

  async createOffer(dto: CreateOfferDto) {
    this.validateOffer(
      dto.discountType,
      dto.discountValue,
      dto.startDate,
      dto.endDate,
    );
    const offerCode =
      dto.offerCode === undefined || dto.offerCode === null
        ? null
        : dto.offerCode.trim() === ''
          ? null
          : dto.offerCode.trim();
    const row = await this.prisma.offer.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
        offerCode,
        discountType: dto.discountType,
        discountValue: new Prisma.Decimal(dto.discountValue),
        startDate: dto.startDate,
        endDate: dto.endDate,
        usageLimit: dto.usageLimit ?? null,
        perClientUsageLimit: dto.perClientUsageLimit ?? null,
        minimumSpend:
          dto.minimumSpend === undefined || dto.minimumSpend === null
            ? null
            : new Prisma.Decimal(dto.minimumSpend),
        appliesTo: dto.appliesTo ?? OfferAppliesTo.ALL,
        isActive: dto.isActive ?? true,
        ...(dto.eligibilityRules !== undefined ||
        dto.serviceIds !== undefined ||
        dto.packageIds !== undefined
          ? {
              eligibilityRules:
                this.buildOfferEligibilityRules({
                  eligibilityRules: dto.eligibilityRules,
                  serviceIds: dto.serviceIds,
                  packageIds: dto.packageIds,
                }) ?? Prisma.JsonNull,
            }
          : {}),
      },
    });
    return this.mapOffer(row);
  }

  async patchOffer(id: string, dto: PatchOfferDto) {
    const existing = await this.prisma.offer.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Offer not found');
    }
    const nextType = dto.discountType ?? existing.discountType;
    const existingDiscount = decimalToNumber(existing.discountValue);
    const nextVal =
      dto.discountValue ?? (existingDiscount != null ? existingDiscount : 0);
    const nextStart = dto.startDate ?? existing.startDate;
    const nextEnd = dto.endDate ?? existing.endDate;
    this.validateOffer(nextType, nextVal, nextStart, nextEnd);
    const normalizedCode =
      dto.offerCode === undefined
        ? undefined
        : dto.offerCode === null
          ? null
          : dto.offerCode.trim() === ''
            ? null
            : dto.offerCode.trim();
    try {
      const row = await this.prisma.offer.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && {
            description: dto.description,
          }),
          ...(dto.offerCode !== undefined && { offerCode: normalizedCode }),
          ...(dto.discountType !== undefined && {
            discountType: dto.discountType,
          }),
          ...(dto.discountValue !== undefined && {
            discountValue: new Prisma.Decimal(dto.discountValue),
          }),
          ...(dto.startDate !== undefined && { startDate: dto.startDate }),
          ...(dto.endDate !== undefined && { endDate: dto.endDate }),
          ...(dto.usageLimit !== undefined && { usageLimit: dto.usageLimit }),
          ...(dto.perClientUsageLimit !== undefined && {
            perClientUsageLimit: dto.perClientUsageLimit,
          }),
          ...(dto.minimumSpend !== undefined && {
            minimumSpend:
              dto.minimumSpend === null
                ? null
                : new Prisma.Decimal(dto.minimumSpend),
          }),
          ...(dto.appliesTo !== undefined && { appliesTo: dto.appliesTo }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
          ...((dto.eligibilityRules !== undefined ||
            dto.serviceIds !== undefined ||
            dto.packageIds !== undefined) && {
            eligibilityRules:
              this.buildOfferEligibilityRules({
                eligibilityRules:
                  dto.eligibilityRules === undefined
                    ? (this.readEligibilityRulesObject(
                        existing.eligibilityRules,
                      ) ?? null)
                    : dto.eligibilityRules,
                serviceIds: dto.serviceIds,
                packageIds: dto.packageIds,
              }) ?? Prisma.JsonNull,
          }),
        },
      });
      return this.mapOffer(row);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new BadRequestException('offerCode must be unique');
      }
      throw e;
    }
  }

  async patchOfferStatus(id: string, isActive: boolean) {
    try {
      const row = await this.prisma.offer.update({
        where: { id },
        data: { isActive },
      });
      return this.mapOffer(row);
    } catch {
      throw new NotFoundException('Offer not found');
    }
  }

  // --- Service Enhancements ---

  private buildServiceEnhancementBaseWhere(query: {
    search?: string;
    priceMin?: number;
    priceMax?: number;
    durationMin?: number;
    durationMax?: number;
  }): Prisma.ServiceEnhancementWhereInput {
    const where: Prisma.ServiceEnhancementWhereInput = {};
    const q = query.search?.trim();
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { shortDescription: { contains: q, mode: 'insensitive' } },
      ];
    }
    const priceFilter: Prisma.DecimalNullableFilter = {};
    if (query.priceMin !== undefined) {
      priceFilter.gte = new Prisma.Decimal(query.priceMin);
    }
    if (query.priceMax !== undefined) {
      priceFilter.lte = new Prisma.Decimal(query.priceMax);
    }
    if (Object.keys(priceFilter).length > 0) {
      where.price = priceFilter;
    }
    const durationFilter: Prisma.IntNullableFilter = {};
    if (query.durationMin !== undefined) {
      durationFilter.gte = query.durationMin;
    }
    if (query.durationMax !== undefined) {
      durationFilter.lte = query.durationMax;
    }
    if (Object.keys(durationFilter).length > 0) {
      where.durationMinutes = durationFilter;
    }
    return where;
  }

  async listServiceEnhancements(query: {
    page: number;
    pageSize: number;
    isActive?: boolean;
    search?: string;
    priceMin?: number;
    priceMax?: number;
    durationMin?: number;
    durationMax?: number;
  }) {
    const baseWhere = this.buildServiceEnhancementBaseWhere(query);
    const where: Prisma.ServiceEnhancementWhereInput = { ...baseWhere };
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }
    const skip = (query.page - 1) * query.pageSize;
    const [totalItems, rows, totalMatchingBase, activeMatchingBase, averages] =
      await Promise.all([
        this.prisma.serviceEnhancement.count({ where }),
        this.prisma.serviceEnhancement.findMany({
          where,
          skip,
          take: query.pageSize,
          orderBy: [{ displayOrder: 'asc' }, { title: 'asc' }],
        }),
        this.prisma.serviceEnhancement.count({ where: baseWhere }),
        this.prisma.serviceEnhancement.count({
          where: { ...baseWhere, isActive: true },
        }),
        this.prisma.serviceEnhancement.aggregate({
          where: baseWhere,
          _avg: { price: true, durationMinutes: true },
        }),
      ]);
    return {
      data: rows.map((row) => this.mapServiceEnhancement(row)),
      meta: {
        ...buildListMeta({
          page: query.page,
          pageSize: query.pageSize,
          totalItems,
        }),
        serviceEnhancementStats: {
          totalMatchingFilters: totalMatchingBase,
          activeMatchingFilters: activeMatchingBase,
          avgPrice: decimalToNumber(averages._avg.price),
          avgDurationMinutes:
            averages._avg.durationMinutes != null
              ? Number(averages._avg.durationMinutes)
              : null,
        },
      },
    };
  }

  async createServiceEnhancement(dto: CreateServiceEnhancementDto) {
    const row = await this.prisma.serviceEnhancement.create({
      data: {
        title: dto.title,
        shortDescription: dto.shortDescription ?? null,
        price:
          dto.price === null || dto.price === undefined
            ? null
            : new Prisma.Decimal(dto.price),
        durationMinutes: dto.durationMinutes ?? null,
        imageUrl: dto.imageUrl ?? null,
        displayOrder: dto.displayOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
    return this.mapServiceEnhancement(row);
  }

  async patchServiceEnhancement(id: string, dto: PatchServiceEnhancementDto) {
    try {
      const row = await this.prisma.serviceEnhancement.update({
        where: { id },
        data: {
          ...(dto.title !== undefined && { title: dto.title }),
          ...(dto.shortDescription !== undefined && {
            shortDescription: dto.shortDescription,
          }),
          ...(dto.price !== undefined && {
            price: dto.price === null ? null : new Prisma.Decimal(dto.price),
          }),
          ...(dto.durationMinutes !== undefined && {
            durationMinutes: dto.durationMinutes,
          }),
          ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
          ...(dto.displayOrder !== undefined && {
            displayOrder: dto.displayOrder,
          }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        },
      });
      return this.mapServiceEnhancement(row);
    } catch {
      throw new NotFoundException('Service enhancement not found');
    }
  }

  async patchServiceEnhancementStatus(id: string, isActive: boolean) {
    try {
      const row = await this.prisma.serviceEnhancement.update({
        where: { id },
        data: { isActive },
      });
      return this.mapServiceEnhancement(row);
    } catch {
      throw new NotFoundException('Service enhancement not found');
    }
  }
}
