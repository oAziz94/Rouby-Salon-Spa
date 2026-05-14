import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, GalleryItemLibraryStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildListMeta, decimalToNumber, utcDateOnly } from './catalog.utils';

const CURRENCY = 'EGP' as const;

@Injectable()
export class CatalogPublicService {
  constructor(private readonly prisma: PrismaService) {}

  /** Services linked to at least one active branch (for unfiltered public list). */
  private servicePublicWhere(): Prisma.ServiceWhereInput {
    return {
      isActive: true,
      branches: {
        some: {
          branch: { isActive: true },
        },
      },
    };
  }

  private packageDateWhere(): Prisma.PackageWhereInput {
    const today = utcDateOnly(new Date());
    return {
      isActive: true,
      AND: [
        { OR: [{ startDate: null }, { startDate: { lte: today } }] },
        { OR: [{ endDate: null }, { endDate: { gte: today } }] },
      ],
    };
  }

  /** Public packages must be linked to at least one active branch when no branch filter. */
  private packageLinkedToActiveBranch(): Prisma.PackageWhereInput {
    return {
      branches: {
        some: { branch: { isActive: true } },
      },
    };
  }

  private bundleDateWhere(): Prisma.BundleWhereInput {
    const today = utcDateOnly(new Date());
    return {
      isActive: true,
      AND: [
        { OR: [{ startDate: null }, { startDate: { lte: today } }] },
        { OR: [{ endDate: null }, { endDate: { gte: today } }] },
      ],
    };
  }

  private offerDateWhere(): Prisma.OfferWhereInput {
    const today = utcDateOnly(new Date());
    return {
      isActive: true,
      startDate: { lte: today },
      endDate: { gte: today },
    };
  }

  async listCategories() {
    const rows = await this.prisma.serviceCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return { data: rows };
  }

  async listServices(query: {
    page: number;
    pageSize: number;
    categoryId?: string;
    branchId?: string;
    isFeatured?: boolean;
  }) {
    const where: Prisma.ServiceWhereInput = {
      isActive: true,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.isFeatured === true ? { isFeatured: true } : {}),
    };
    if (query.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: query.branchId, isActive: true },
      });
      if (!branch) {
        return {
          data: [],
          meta: buildListMeta({
            page: query.page,
            pageSize: query.pageSize,
            totalItems: 0,
          }),
        };
      }
      where.branches = {
        some: { branchId: query.branchId },
      };
    } else {
      Object.assign(where, this.servicePublicWhere());
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
          branches: { include: { branch: true } },
          benefits: {
            where: { isActive: true },
            orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
            select: { id: true, label: true, displayOrder: true },
          },
          imageMedia: {
            where: { libraryStatus: GalleryItemLibraryStatus.ACTIVE },
            select: { imageUrl: true },
          },
        },
      }),
    ]);
    const data = rows.map((s) => ({
      id: s.id,
      categoryId: s.categoryId,
      name: s.name,
      description: s.description,
      shortDescription: s.shortDescription,
      imageUrl: s.imageMedia?.imageUrl ?? s.imageUrl,
      imageAlt: s.imageAlt,
      displayOrder: s.displayOrder,
      isFeatured: s.isFeatured,
      badgeLabel: s.badgeLabel,
      priceDisplayType: s.priceDisplayType,
      basePrice: decimalToNumber(s.basePrice),
      basePriceMax: decimalToNumber(s.basePriceMax),
      durationMinutes: s.durationMinutes,
      isTaxable: s.isTaxable,
      bookingAvailability: s.bookingAvailability,
      currency: CURRENCY,
      branchIds: s.branches.map((b) => b.branchId),
      benefits: s.benefits.map((benefit) => ({
        id: benefit.id,
        label: benefit.label,
        displayOrder: benefit.displayOrder,
      })),
    }));
    return {
      data,
      meta: buildListMeta({
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
      }),
    };
  }

  async getService(serviceId: string, branchId?: string) {
    const where: Prisma.ServiceWhereInput = {
      id: serviceId,
      isActive: true,
    };
    if (branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: branchId, isActive: true },
      });
      if (!branch) {
        throw new NotFoundException('Service not found');
      }
      where.branches = { some: { branchId } };
    } else {
      Object.assign(where, this.servicePublicWhere());
    }
    const row = await this.prisma.service.findFirst({
      where,
        include: {
          branches: { include: { branch: true } },
          category: true,
          benefits: {
            where: { isActive: true },
            orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
            select: { id: true, label: true, displayOrder: true },
          },
          imageMedia: {
            where: { libraryStatus: GalleryItemLibraryStatus.ACTIVE },
            select: { imageUrl: true },
          },
        },
    });
    if (!row) {
      throw new NotFoundException('Service not found');
    }
    const branches = row.branches
      .filter((b) => b.branch.isActive)
      .map((b) => ({
        branchId: b.branchId,
        name: b.branch.name,
        address: b.branch.address,
        phone: b.branch.phone,
      }));
    return {
      id: row.id,
      categoryId: row.categoryId,
      categoryName: row.category.name,
      name: row.name,
      description: row.description,
      shortDescription: row.shortDescription,
      imageUrl: row.imageMedia?.imageUrl ?? row.imageUrl,
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
      currency: CURRENCY,
      branches,
      benefits: row.benefits.map((benefit) => ({
        id: benefit.id,
        label: benefit.label,
        displayOrder: benefit.displayOrder,
      })),
    };
  }

  async listVariants(serviceId: string) {
    const svc = await this.prisma.service.findFirst({
      where: { id: serviceId, ...this.servicePublicWhere() },
    });
    if (!svc) {
      throw new NotFoundException('Service not found');
    }
    const rows = await this.prisma.serviceVariant.findMany({
      where: { serviceId, isActive: true },
      orderBy: { name: 'asc' },
    });
    return {
      data: rows.map((v) => ({
        id: v.id,
        serviceId: v.serviceId,
        name: v.name,
        description: v.description,
        price: decimalToNumber(v.price),
        durationMinutes: v.durationMinutes,
        currency: CURRENCY,
      })),
    };
  }

  async listPackages(query: {
    page: number;
    pageSize: number;
    branchId?: string;
  }) {
    let where: Prisma.PackageWhereInput;
    if (query.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: query.branchId, isActive: true },
      });
      if (!branch) {
        return {
          data: [],
          meta: buildListMeta({
            page: query.page,
            pageSize: query.pageSize,
            totalItems: 0,
          }),
        };
      }
      where = {
        ...this.packageDateWhere(),
        branches: { some: { branchId: query.branchId } },
      };
    } else {
      where = {
        ...this.packageDateWhere(),
        ...this.packageLinkedToActiveBranch(),
      };
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
          services: { include: { service: true } },
          branches: true,
          features: {
            where: { isActive: true },
            orderBy: { displayOrder: 'asc' },
            select: { id: true, label: true, displayOrder: true },
          },
        },
      }),
    ]);
    const data = rows.map((p) => ({
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
      isFeatured: p.isFeatured,
      badgeLabel: p.badgeLabel,
      currency: CURRENCY,
      features: p.features.map((f) => ({
        id: f.id,
        label: f.label,
        displayOrder: f.displayOrder,
      })),
      includedServices: p.services.map((ps) => ({
        serviceId: ps.serviceId,
        name: ps.service.name,
        sortOrder: ps.sortOrder,
      })),
      branchIds: p.branches.map((b) => b.branchId),
    }));
    return {
      data,
      meta: buildListMeta({
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
      }),
    };
  }

  async getPackage(packageId: string, branchId?: string) {
    const base: Prisma.PackageWhereInput = {
      id: packageId,
      ...this.packageDateWhere(),
    };
    let where: Prisma.PackageWhereInput;
    if (branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: branchId, isActive: true },
      });
      if (!branch) {
        throw new NotFoundException('Package not found');
      }
      where = { ...base, branches: { some: { branchId } } };
    } else {
      where = { ...base, ...this.packageLinkedToActiveBranch() };
    }
    const row = await this.prisma.package.findFirst({
      where,
      include: {
        services: { include: { service: true } },
        branches: true,
        features: {
          where: { isActive: true },
          orderBy: { displayOrder: 'asc' },
          select: { id: true, label: true, displayOrder: true },
        },
      },
    });
    if (!row) {
      throw new NotFoundException('Package not found');
    }
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      shortDescription: row.shortDescription,
      imageUrl: row.imageUrl,
      originalPrice: decimalToNumber(row.originalPrice),
      packagePrice: decimalToNumber(row.packagePrice),
      durationMinutes: row.durationMinutes,
      startDate: row.startDate,
      endDate: row.endDate,
      isTaxable: row.isTaxable,
      isFeatured: row.isFeatured,
      badgeLabel: row.badgeLabel,
      currency: CURRENCY,
      features: row.features.map((f) => ({
        id: f.id,
        label: f.label,
        displayOrder: f.displayOrder,
      })),
      includedServices: row.services.map((ps) => ({
        serviceId: ps.serviceId,
        name: ps.service.name,
        sortOrder: ps.sortOrder,
      })),
      branchIds: row.branches.map((b) => b.branchId),
    };
  }

  async listBundles(query: { page: number; pageSize: number }) {
    const where = this.bundleDateWhere();
    const skip = (query.page - 1) * query.pageSize;
    const [totalItems, rows] = await Promise.all([
      this.prisma.bundle.count({ where }),
      this.prisma.bundle.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: { name: 'asc' },
        include: { services: { include: { service: true } } },
      }),
    ]);
    const data = rows.map((b) => ({
      id: b.id,
      name: b.name,
      description: b.description,
      bundleType: b.bundleType,
      price: decimalToNumber(b.price),
      rules: b.rules,
      selectableCount: b.selectableCount,
      startDate: b.startDate,
      endDate: b.endDate,
      currency: CURRENCY,
      eligibleServices: b.services.map((bs) => ({
        serviceId: bs.serviceId,
        name: bs.service.name,
        sortOrder: bs.sortOrder,
      })),
    }));
    return {
      data,
      meta: buildListMeta({
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
      }),
    };
  }

  async getBundle(bundleId: string) {
    const row = await this.prisma.bundle.findFirst({
      where: { id: bundleId, ...this.bundleDateWhere() },
      include: { services: { include: { service: true } } },
    });
    if (!row) {
      throw new NotFoundException('Bundle not found');
    }
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
      currency: CURRENCY,
      eligibleServices: row.services.map((bs) => ({
        serviceId: bs.serviceId,
        name: bs.service.name,
        sortOrder: bs.sortOrder,
      })),
    };
  }

  async listOffers(query: { page: number; pageSize: number }) {
    const where = this.offerDateWhere();
    const skip = (query.page - 1) * query.pageSize;
    const [totalItems, rows] = await Promise.all([
      this.prisma.offer.count({ where }),
      this.prisma.offer.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: { name: 'asc' },
      }),
    ]);
    const data = rows.map((o) => ({
      id: o.id,
      name: o.name,
      description: o.description,
      offerCode: o.offerCode,
      discountType: o.discountType,
      discountValue: decimalToNumber(o.discountValue),
      startDate: o.startDate,
      endDate: o.endDate,
      minimumSpend: decimalToNumber(o.minimumSpend),
      appliesTo: o.appliesTo,
      currency: CURRENCY,
      eligibilityRules: o.eligibilityRules,
    }));
    return {
      data,
      meta: buildListMeta({
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
      }),
    };
  }

  async listServiceEnhancements() {
    const rows = await this.prisma.serviceEnhancement.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { title: 'asc' }],
    });
    return {
      data: rows.map((row) => ({
        id: row.id,
        title: row.title,
        shortDescription: row.shortDescription,
        price: decimalToNumber(row.price),
        durationMinutes: row.durationMinutes,
        imageUrl: row.imageUrl,
        displayOrder: row.displayOrder,
        isActive: row.isActive,
        currency: CURRENCY,
      })),
    };
  }
}
