import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ReviewStatus } from '@prisma/client';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { PrismaService } from '../prisma/prisma.service';
import {
  toPublicGalleryItem,
  toPublicSiteContent,
  toPublicTestimonial,
} from './content.mapper';
import { DashboardGalleryListQueryDto } from './dto/dashboard-gallery-list-query.dto';
import { DashboardReviewsListQueryDto } from './dto/dashboard-reviews-list-query.dto';
import {
  CreateGalleryItemDto,
  PatchGalleryItemDto,
  PatchGalleryStatusDto,
} from './dto/gallery.dto';
import { PatchReviewDto } from './dto/review.dto';
import { PatchSiteContentDto } from './dto/site-content.dto';

const SITE_CONTENT_ID = '82000000-0000-4000-8000-000000000001';

function toInputJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function buildListMeta(args: {
  page: number;
  pageSize: number;
  totalItems: number;
}) {
  const totalPages =
    args.totalItems === 0 ? 0 : Math.ceil(args.totalItems / args.pageSize);
  return {
    page: args.page,
    pageSize: args.pageSize,
    totalItems: args.totalItems,
    totalPages,
    hasNextPage: args.page < totalPages,
  };
}

@Injectable()
export class ContentService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublicGallery() {
    const rows = await this.prisma.galleryItem.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
    });
    return { data: rows.map(toPublicGalleryItem) };
  }

  async getPublicTestimonials() {
    const rows = await this.prisma.review.findMany({
      where: {
        status: ReviewStatus.APPROVED,
        displayOnWebsite: true,
      },
      include: {
        client: {
          select: { fullName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return { data: rows.map(toPublicTestimonial) };
  }

  async getPublicSiteContent() {
    const row = await this.prisma.siteContent.findUnique({
      where: { id: SITE_CONTENT_ID },
    });
    if (!row) {
      throw new NotFoundException('Site content not found');
    }
    return toPublicSiteContent(row);
  }

  async listDashboardGallery(query: DashboardGalleryListQueryDto) {
    const where: Prisma.GalleryItemWhereInput = {
      ...(query.category ? { category: query.category } : {}),
      ...(typeof query.isActive === 'boolean'
        ? { isActive: query.isActive }
        : {}),
    };
    const skip = (query.page - 1) * query.pageSize;
    const [totalItems, rows] = await Promise.all([
      this.prisma.galleryItem.count({ where }),
      this.prisma.galleryItem.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
      }),
    ]);
    return {
      data: rows,
      meta: buildListMeta({
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
      }),
    };
  }

  createGalleryItem(dto: CreateGalleryItemDto) {
    return this.prisma.galleryItem.create({
      data: {
        imageUrl: dto.imageUrl,
        title: dto.title ?? null,
        category: dto.category ?? null,
        description: dto.description ?? null,
        isFeatured: dto.isFeatured ?? false,
        displayOrder: dto.displayOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async patchGalleryItem(id: string, dto: PatchGalleryItemDto) {
    await this.ensureGalleryExists(id);
    return this.prisma.galleryItem.update({
      where: { id },
      data: {
        ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.isFeatured !== undefined ? { isFeatured: dto.isFeatured } : {}),
        ...(dto.displayOrder !== undefined
          ? { displayOrder: dto.displayOrder }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async patchGalleryStatus(id: string, dto: PatchGalleryStatusDto) {
    await this.ensureGalleryExists(id);
    return this.prisma.galleryItem.update({
      where: { id },
      data: { isActive: dto.isActive },
    });
  }

  async listDashboardReviews(query: DashboardReviewsListQueryDto) {
    const where: Prisma.ReviewWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(typeof query.displayOnWebsite === 'boolean'
        ? { displayOnWebsite: query.displayOnWebsite }
        : {}),
      ...(query.createdFrom || query.createdTo
        ? {
            createdAt: {
              ...(query.createdFrom
                ? { gte: new Date(query.createdFrom) }
                : {}),
              ...(query.createdTo ? { lte: new Date(query.createdTo) } : {}),
            },
          }
        : {}),
    };
    const skip = (query.page - 1) * query.pageSize;
    const [totalItems, rows] = await Promise.all([
      this.prisma.review.count({ where }),
      this.prisma.review.findMany({
        where,
        skip,
        take: query.pageSize,
        include: {
          client: { select: { id: true, fullName: true } },
          booking: { select: { id: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return {
      data: rows,
      meta: buildListMeta({
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
      }),
    };
  }

  async patchReview(id: string, dto: PatchReviewDto) {
    await this.ensureReviewExists(id);
    return this.prisma.review.update({
      where: { id },
      data: {
        ...(dto.rating !== undefined ? { rating: dto.rating } : {}),
        ...(dto.comment !== undefined ? { comment: dto.comment } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.displayOnWebsite !== undefined
          ? { displayOnWebsite: dto.displayOnWebsite }
          : {}),
      },
    });
  }

  async getDashboardSiteContent() {
    return this.ensureSiteContent();
  }

  async patchDashboardSiteContent(
    user: DashboardJwtUser,
    dto: PatchSiteContentDto,
  ) {
    await this.ensureSiteContent();
    return this.prisma.siteContent.update({
      where: { id: SITE_CONTENT_ID },
      data: {
        ...(dto.homeHero !== undefined
          ? { homeHero: toInputJson(dto.homeHero) }
          : {}),
        ...(dto.aboutSection !== undefined
          ? { aboutSection: toInputJson(dto.aboutSection) }
          : {}),
        ...(dto.contactSection !== undefined
          ? { contactSection: toInputJson(dto.contactSection) }
          : {}),
        ...(dto.footerSection !== undefined
          ? { footerSection: toInputJson(dto.footerSection) }
          : {}),
        ...(dto.socialLinks !== undefined
          ? { socialLinks: toInputJson(dto.socialLinks) }
          : {}),
        ...(dto.seoDefaults !== undefined
          ? { seoDefaults: toInputJson(dto.seoDefaults) }
          : {}),
        updatedByUserId: user.userId,
      },
    });
  }

  private async ensureGalleryExists(id: string) {
    const exists = await this.prisma.galleryItem.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('Gallery item not found');
    }
  }

  private async ensureReviewExists(id: string) {
    const exists = await this.prisma.review.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('Review not found');
    }
  }

  private async ensureSiteContent() {
    const row = await this.prisma.siteContent.findUnique({
      where: { id: SITE_CONTENT_ID },
    });
    if (!row) {
      throw new NotFoundException('Site content not found');
    }
    return row;
  }
}
