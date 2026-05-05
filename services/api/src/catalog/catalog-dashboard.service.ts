import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BundleType,
  OfferDiscountType,
  PriceDisplayType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildListMeta, decimalToNumber } from './catalog.utils';
import { validateServicePricing } from './service-pricing.validation';
import type { CreateServiceCategoryDto } from './dto/service-category.dto';
import type { PatchServiceCategoryDto } from './dto/service-category.dto';
import type {
  CreateServiceDto,
  CreateServiceVariantDto,
  PatchServiceDto,
  PatchServiceVariantDto,
} from './dto/service.dto';
import type { CreatePackageDto, PatchPackageDto } from './dto/package.dto';
import type { CreateBundleDto, PatchBundleDto } from './dto/bundle.dto';
import type { CreateOfferDto, PatchOfferDto } from './dto/offer.dto';

const CURRENCY = 'EGP' as const;

@Injectable()
export class CatalogDashboardService {
  constructor(private readonly prisma: PrismaService) {}

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
    imageUrl: string | null;
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
  }) {
    const branchIds = row.branches?.map((b) => b.branchId) ?? [];
    return {
      id: row.id,
      categoryId: row.categoryId,
      name: row.name,
      description: row.description,
      imageUrl: row.imageUrl,
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

  private mapPackage(
    row: {
      id: string;
      name: string;
      description: string | null;
      imageUrl: string | null;
      originalPrice: Prisma.Decimal;
      packagePrice: Prisma.Decimal;
      durationMinutes: number;
      startDate: Date | null;
      endDate: Date | null;
      isTaxable: boolean;
      isActive: boolean;
      createdAt: Date;
      updatedAt: Date;
    },
    serviceIds: string[],
    branchIds: string[],
  ) {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      imageUrl: row.imageUrl,
      originalPrice: decimalToNumber(row.originalPrice),
      packagePrice: decimalToNumber(row.packagePrice),
      durationMinutes: row.durationMinutes,
      startDate: row.startDate,
      endDate: row.endDate,
      isTaxable: row.isTaxable,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      currency: CURRENCY,
      serviceIds,
      branchIds,
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
    offerCode: string | null;
    discountType: OfferDiscountType;
    discountValue: Prisma.Decimal;
    startDate: Date;
    endDate: Date;
    usageLimit: number | null;
    perClientUsageLimit: number | null;
    isActive: boolean;
    eligibilityRules: Prisma.JsonValue | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      ...row,
      discountValue: decimalToNumber(row.discountValue),
      eligibilityRules: row.eligibilityRules,
      currency: CURRENCY,
    };
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
        orderBy: { name: 'asc' },
        include: { branches: true },
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
    const row = await this.prisma.$transaction(async (tx) => {
      const s = await tx.service.create({
        data: {
          categoryId: dto.categoryId,
          name: dto.name,
          description: dto.description ?? null,
          imageUrl: dto.imageUrl ?? null,
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
        },
        include: { branches: true },
      });
      return s;
    });
    return this.mapService(row);
  }

  async patchService(id: string, dto: PatchServiceDto) {
    const existing = await this.prisma.service.findUnique({
      where: { id },
      include: { branches: true },
    });
    if (!existing) {
      throw new NotFoundException('Service not found');
    }
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
      return tx.service.update({
        where: { id },
        data: {
          ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && {
            description: dto.description,
          }),
          ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
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
        include: { branches: true },
      });
    });
    return this.mapService(row);
  }

  async patchServiceStatus(id: string, isActive: boolean) {
    try {
      const row = await this.prisma.service.update({
        where: { id },
        data: { isActive },
        include: { branches: true },
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
  }) {
    const where: Prisma.PackageWhereInput = {};
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }
    const skip = (query.page - 1) * query.pageSize;
    const [totalItems, rows] = await Promise.all([
      this.prisma.package.count({ where }),
      this.prisma.package.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: { name: 'asc' },
        include: {
          services: true,
          branches: true,
        },
      }),
    ]);
    return {
      data: rows.map((p) =>
        this.mapPackage(
          p,
          p.services.map((s) => s.serviceId),
          p.branches.map((b) => b.branchId),
        ),
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
          imageUrl: dto.imageUrl ?? null,
          originalPrice: new Prisma.Decimal(dto.originalPrice),
          packagePrice: new Prisma.Decimal(dto.packagePrice),
          durationMinutes: dto.durationMinutes,
          startDate: dto.startDate ?? null,
          endDate: dto.endDate ?? null,
          isTaxable: dto.isTaxable ?? true,
          isActive: dto.isActive ?? true,
          services: {
            create: uniqueServices.map((serviceId, i) => ({
              serviceId,
              sortOrder: i,
            })),
          },
          branches: {
            create: uniqueBranches.map((branchId) => ({ branchId })),
          },
        },
        include: { services: true, branches: true },
      });
      return p;
    });
    return this.mapPackage(
      row,
      row.services.map((s) => s.serviceId),
      row.branches.map((b) => b.branchId),
    );
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
      return tx.package.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && {
            description: dto.description,
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
        },
        include: { services: true, branches: true },
      });
    });
    return this.mapPackage(
      row,
      row.services.map((s) => s.serviceId),
      row.branches.map((b) => b.branchId),
    );
  }

  async patchPackageStatus(id: string, isActive: boolean) {
    try {
      const row = await this.prisma.package.update({
        where: { id },
        data: { isActive },
        include: { services: true, branches: true },
      });
      return this.mapPackage(
        row,
        row.services.map((s) => s.serviceId),
        row.branches.map((b) => b.branchId),
      );
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
        offerCode,
        discountType: dto.discountType,
        discountValue: new Prisma.Decimal(dto.discountValue),
        startDate: dto.startDate,
        endDate: dto.endDate,
        usageLimit: dto.usageLimit ?? null,
        perClientUsageLimit: dto.perClientUsageLimit ?? null,
        isActive: dto.isActive ?? true,
        ...(dto.eligibilityRules !== undefined
          ? {
              eligibilityRules:
                dto.eligibilityRules === null
                  ? Prisma.JsonNull
                  : (dto.eligibilityRules as Prisma.InputJsonValue),
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
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
          ...(dto.eligibilityRules !== undefined && {
            eligibilityRules:
              dto.eligibilityRules === null
                ? Prisma.JsonNull
                : (dto.eligibilityRules as Prisma.InputJsonValue),
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
}
