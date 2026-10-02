import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { PrismaService } from '../prisma/prisma.service';
import type { PatchCatalogSearchTermsDto } from './dto/catalog-search-terms.dto';

const decimal = (v: Prisma.Decimal | null | undefined): number | null =>
  v == null ? null : Number(v.toString());

export type PickerKind = 'service' | 'variant' | 'package' | 'enhancement';

/**
 * Everything the front-desk treatment picker needs in one request
 * (spec v2 §3a): active services + all their variants, categories,
 * packages and add-ons, with Arabic names and search aliases.
 */
@Injectable()
export class CatalogPickerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getPickerCatalog(branchId?: string) {
    const [categories, services, variants, packages, enhancements] =
      await Promise.all([
        this.prisma.serviceCategory.findMany({
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          select: { id: true, name: true, sortOrder: true },
        }),
        this.prisma.service.findMany({
          where: {
            isActive: true,
            ...(branchId ? { branches: { some: { branchId } } } : {}),
          },
          orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
          select: {
            id: true,
            categoryId: true,
            name: true,
            nameAr: true,
            searchAliases: true,
            priceDisplayType: true,
            basePrice: true,
            basePriceMax: true,
            durationMinutes: true,
            isFeatured: true,
            bookingAvailability: true,
            branches: { select: { branchId: true } },
          },
        }),
        this.prisma.serviceVariant.findMany({
          where: {
            isActive: true,
            service: {
              isActive: true,
              ...(branchId ? { branches: { some: { branchId } } } : {}),
            },
          },
          orderBy: [{ price: 'asc' }, { name: 'asc' }],
          select: {
            id: true,
            serviceId: true,
            name: true,
            nameAr: true,
            searchAliases: true,
            price: true,
            durationMinutes: true,
          },
        }),
        this.prisma.package.findMany({
          where: {
            isActive: true,
            ...(branchId ? { branches: { some: { branchId } } } : {}),
          },
          orderBy: [{ name: 'asc' }],
          select: {
            id: true,
            name: true,
            nameAr: true,
            searchAliases: true,
            packagePrice: true,
            durationMinutes: true,
            services: { select: { serviceId: true } },
          },
        }),
        this.prisma.serviceEnhancement.findMany({
          where: { isActive: true, price: { not: null } },
          orderBy: [{ displayOrder: 'asc' }, { title: 'asc' }],
          select: {
            id: true,
            title: true,
            nameAr: true,
            searchAliases: true,
            price: true,
            durationMinutes: true,
          },
        }),
      ]);

    return {
      branchId: branchId ?? null,
      generatedAt: new Date().toISOString(),
      categories,
      services: services.map((s) => ({
        id: s.id,
        categoryId: s.categoryId,
        name: s.name,
        nameAr: s.nameAr,
        searchAliases: s.searchAliases,
        priceDisplayType: s.priceDisplayType,
        basePrice: decimal(s.basePrice),
        basePriceMax: decimal(s.basePriceMax),
        durationMinutes: s.durationMinutes,
        isFeatured: s.isFeatured,
        bookingAvailability: s.bookingAvailability,
        branchIds: s.branches.map((b) => b.branchId),
      })),
      variants: variants.map((v) => ({
        id: v.id,
        serviceId: v.serviceId,
        name: v.name,
        nameAr: v.nameAr,
        searchAliases: v.searchAliases,
        price: Number(v.price.toString()),
        durationMinutes: v.durationMinutes,
      })),
      packages: packages.map((p) => ({
        id: p.id,
        name: p.name,
        nameAr: p.nameAr,
        searchAliases: p.searchAliases,
        price: Number(p.packagePrice.toString()),
        durationMinutes: p.durationMinutes,
        serviceIds: p.services.map((x) => x.serviceId),
      })),
      enhancements: enhancements.map((e) => ({
        id: e.id,
        name: e.title,
        nameAr: e.nameAr,
        searchAliases: e.searchAliases,
        price: decimal(e.price),
        durationMinutes: e.durationMinutes,
      })),
    };
  }

  /** Admin: set Arabic name + aliases on one catalog item (any kind). */
  async patchSearchTerms(
    user: DashboardJwtUser,
    kind: PickerKind,
    id: string,
    dto: PatchCatalogSearchTermsDto,
  ) {
    const data = {
      ...(dto.nameAr !== undefined
        ? { nameAr: dto.nameAr?.trim() || null }
        : {}),
      ...(dto.searchAliases !== undefined
        ? {
            searchAliases: Array.from(
              new Set(
                dto.searchAliases
                  .map((a) => a.trim())
                  .filter((a) => a.length > 0),
              ),
            ),
          }
        : {}),
    };
    const select = { id: true, nameAr: true, searchAliases: true };
    let before: { nameAr: string | null; searchAliases: string[] } | null;
    let after: { id: string; nameAr: string | null; searchAliases: string[] };
    switch (kind) {
      case 'service':
        before = await this.prisma.service.findUnique({
          where: { id },
          select,
        });
        if (!before) throw new NotFoundException('Service not found');
        after = await this.prisma.service.update({
          where: { id },
          data,
          select,
        });
        break;
      case 'variant':
        before = await this.prisma.serviceVariant.findUnique({
          where: { id },
          select,
        });
        if (!before) throw new NotFoundException('Variant not found');
        after = await this.prisma.serviceVariant.update({
          where: { id },
          data,
          select,
        });
        break;
      case 'package':
        before = await this.prisma.package.findUnique({
          where: { id },
          select,
        });
        if (!before) throw new NotFoundException('Package not found');
        after = await this.prisma.package.update({
          where: { id },
          data,
          select,
        });
        break;
      case 'enhancement':
        before = await this.prisma.serviceEnhancement.findUnique({
          where: { id },
          select,
        });
        if (!before) throw new NotFoundException('Add-on not found');
        after = await this.prisma.serviceEnhancement.update({
          where: { id },
          data,
          select,
        });
        break;
    }
    await this.audit.log({
      userId: user.userId,
      action: 'catalog.search_terms_updated',
      module: 'catalog',
      entityId: id,
      oldValue: { kind, ...before },
      newValue: { kind, ...after },
    });
    return { kind, ...after };
  }
}
