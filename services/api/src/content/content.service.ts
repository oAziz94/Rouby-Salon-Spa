import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ReviewStatus } from '@prisma/client';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  toPublicSiteContent,
  toPublicTestimonial,
} from './content.mapper';
import { CreateDashboardReviewDto } from './dto/dashboard-review-create.dto';
import { PatchDashboardReviewHomepageDto } from './dto/dashboard-review-homepage.dto';
import { PatchDashboardReviewDto } from './dto/dashboard-review-patch.dto';
import { ReorderDashboardReviewsDto } from './dto/dashboard-reviews-reorder.dto';
import { DashboardGalleryListQueryDto } from './dto/dashboard-gallery-list-query.dto';
import { DashboardReviewsListQueryDto } from './dto/dashboard-reviews-list-query.dto';
import {
  CreateGalleryItemDto,
  PatchGalleryItemDto,
  PatchGalleryStatusDto,
} from './dto/gallery.dto';
import { PatchSiteContentDto } from './dto/site-content.dto';
import { GalleryAdminService } from './gallery-admin.service';
import { WebsiteContentService } from './website-content.service';

const SITE_CONTENT_ID = '82000000-0000-4000-8000-000000000001';

const reviewDashboardInclude = {
  client: { select: { id: true, fullName: true } },
  booking: { select: { id: true, status: true } },
  branch: { select: { id: true, name: true } },
  createdByUser: { select: { id: true, name: true } },
  updatedByUser: { select: { id: true, name: true } },
} satisfies Prisma.ReviewInclude;

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

function displayClientName(
  row: Prisma.ReviewGetPayload<{ include: typeof reviewDashboardInclude }>,
): string {
  const n = row.clientName?.trim();
  if (n) return n;
  return row.client?.fullName?.trim() || 'Client';
}

@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly galleryAdmin: GalleryAdminService,
    private readonly websiteContent: WebsiteContentService,
  ) {}

  async getPublicGallery() {
    return this.galleryAdmin.getPublicGallery();
  }

  async getPublicTestimonials() {
    const row = await this.prisma.review.findFirst({
      where: {
        isActive: true,
        showOnHomepage: true,
      },
      include: {
        client: {
          select: { fullName: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return { data: row ? [toPublicTestimonial(row)] : [] };
  }

  async getPublicSiteContent() {
    const [row, websiteSections] = await Promise.all([
      this.prisma.siteContent.findUnique({
        where: { id: SITE_CONTENT_ID },
      }),
      this.websiteContent.getPublicWebsiteSectionPayload(),
    ]);
    if (!row) {
      return {
        homeHero: {},
        aboutSection: {},
        contactSection: {},
        footerSection: {},
        socialLinks: {},
        seoDefaults: {},
        websiteSections,
      };
    }
    return {
      ...toPublicSiteContent(row),
      websiteSections,
    };
  }

  async listDashboardGallery(query: DashboardGalleryListQueryDto) {
    return this.galleryAdmin.listDashboardGallery(query);
  }

  createGalleryItem(dto: CreateGalleryItemDto, user: DashboardJwtUser) {
    return this.galleryAdmin.createGalleryItem(dto, user);
  }

  async patchGalleryItem(id: string, dto: PatchGalleryItemDto, user: DashboardJwtUser) {
    return this.galleryAdmin.patchGalleryItem(id, dto, user);
  }

  async patchGalleryStatus(id: string, dto: PatchGalleryStatusDto) {
    return this.galleryAdmin.patchGalleryStatus(id, dto);
  }

  async getDashboardReviewsStats() {
    const [total, active, homepage, avgRow] = await Promise.all([
      this.prisma.review.count(),
      this.prisma.review.count({ where: { isActive: true } }),
      this.prisma.review.count({
        where: { isActive: true, showOnHomepage: true },
      }),
      this.prisma.review.aggregate({
        _avg: { rating: true },
        where: { isActive: true },
      }),
    ]);
    return {
      total,
      active,
      homepage,
      averageRating: avgRow._avg.rating ?? null,
    };
  }

  async listDashboardReviews(query: DashboardReviewsListQueryDto) {
    const pageSize = query.limit ?? query.pageSize;
    const ratingWhere: Prisma.IntFilter | undefined =
      typeof query.ratingLte === 'number'
        ? { lte: query.ratingLte }
        : typeof query.rating === 'number'
          ? { equals: query.rating }
          : undefined;

    const where: Prisma.ReviewWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(typeof query.isActive === 'boolean'
        ? { isActive: query.isActive }
        : {}),
      ...(typeof query.showOnHomepage === 'boolean'
        ? { showOnHomepage: query.showOnHomepage }
        : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(ratingWhere ? { rating: ratingWhere } : {}),
      ...(query.search?.trim()
        ? {
            OR: [
              {
                clientName: {
                  contains: query.search.trim(),
                  mode: 'insensitive',
                },
              },
              {
                comment: {
                  contains: query.search.trim(),
                  mode: 'insensitive',
                },
              },
              {
                client: {
                  fullName: {
                    contains: query.search.trim(),
                    mode: 'insensitive',
                  },
                },
              },
            ],
          }
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
    const skip = (query.page - 1) * pageSize;
    const [totalItems, rows] = await Promise.all([
      this.prisma.review.count({ where }),
      this.prisma.review.findMany({
        where,
        skip,
        take: pageSize,
        include: reviewDashboardInclude,
        orderBy: [{ displayOrder: 'asc' }, { updatedAt: 'desc' }],
      }),
    ]);
    return {
      data: rows.map((r) => this.toDashboardReviewDto(r)),
      meta: buildListMeta({
        page: query.page,
        pageSize,
        totalItems,
      }),
    };
  }

  async getDashboardReview(id: string) {
    const row = await this.prisma.review.findUnique({
      where: { id },
      include: reviewDashboardInclude,
    });
    if (!row) {
      throw new NotFoundException('Review not found');
    }
    return this.toDashboardReviewDto(row);
  }

  async createDashboardReview(user: DashboardJwtUser, dto: CreateDashboardReviewDto) {
    if (dto.branchId) {
      await this.ensureBranchExists(dto.branchId);
    }
    const row = await this.prisma.review.create({
      data: {
        clientName: dto.clientName.trim(),
        clientTitle: dto.clientTitle?.trim() || null,
        source: dto.source?.trim() || null,
        rating: dto.rating,
        comment: dto.quote.trim(),
        serviceName: dto.serviceName?.trim() || null,
        branchId: dto.branchId ?? null,
        status: ReviewStatus.APPROVED,
        isActive: dto.isActive ?? true,
        showOnHomepage: false,
        displayOrder: dto.displayOrder ?? 0,
        createdByUserId: user.userId,
        updatedByUserId: user.userId,
      },
      include: reviewDashboardInclude,
    });
    await this.audit.log({
      userId: user.userId,
      action: 'review.created',
      module: 'reviews',
      entityId: row.id,
      newValue: {
        reviewId: row.id,
        clientName: displayClientName(row),
        rating: row.rating,
        isActive: row.isActive,
        showOnHomepage: row.showOnHomepage,
        performedByUserId: user.userId,
      },
    });
    return this.toDashboardReviewDto(row);
  }

  async patchDashboardReview(
    user: DashboardJwtUser,
    id: string,
    dto: PatchDashboardReviewDto,
  ) {
    const before = await this.prisma.review.findUnique({
      where: { id },
      include: reviewDashboardInclude,
    });
    if (!before) {
      throw new NotFoundException('Review not found');
    }
    if (dto.branchId !== undefined && dto.branchId !== null) {
      await this.ensureBranchExists(dto.branchId);
    }
    const nextIsActive =
      dto.isActive !== undefined ? dto.isActive : before.isActive;
    const data: Prisma.ReviewUpdateInput = {
      ...(dto.clientName !== undefined
        ? { clientName: dto.clientName.trim() }
        : {}),
      ...(dto.clientTitle !== undefined
        ? { clientTitle: dto.clientTitle }
        : {}),
      ...(dto.source !== undefined ? { source: dto.source } : {}),
      ...(dto.rating !== undefined ? { rating: dto.rating } : {}),
      ...(dto.quote !== undefined ? { comment: dto.quote.trim() } : {}),
      ...(dto.serviceName !== undefined ? { serviceName: dto.serviceName } : {}),
      ...(dto.branchId !== undefined
        ? dto.branchId === null
          ? { branch: { disconnect: true } }
          : { branch: { connect: { id: dto.branchId } } }
        : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.displayOrder !== undefined
        ? { displayOrder: dto.displayOrder }
        : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      updatedByUser: { connect: { id: user.userId } },
    };
    if (!nextIsActive) {
      data.showOnHomepage = false;
    }
    const row = await this.prisma.review.update({
      where: { id },
      data,
      include: reviewDashboardInclude,
    });
    const touched =
      dto.clientName !== undefined ||
      dto.clientTitle !== undefined ||
      dto.source !== undefined ||
      dto.rating !== undefined ||
      dto.quote !== undefined ||
      dto.serviceName !== undefined ||
      dto.branchId !== undefined ||
      dto.status !== undefined ||
      dto.displayOrder !== undefined ||
      dto.isActive !== undefined;
    if (touched) {
      await this.audit.log({
        userId: user.userId,
        action: 'review.updated',
        module: 'reviews',
        entityId: row.id,
        oldValue: {
          reviewId: before.id,
          clientName: displayClientName(before),
          performedByUserId: user.userId,
        },
        newValue: {
          reviewId: row.id,
          clientName: displayClientName(row),
          performedByUserId: user.userId,
        },
      });
    }
    return this.toDashboardReviewDto(row);
  }

  async activateDashboardReview(user: DashboardJwtUser, id: string) {
    const existing = await this.prisma.review.findUnique({
      where: { id },
      include: reviewDashboardInclude,
    });
    if (!existing) {
      throw new NotFoundException('Review not found');
    }
    const row = await this.prisma.review.update({
      where: { id },
      data: { isActive: true, updatedByUser: { connect: { id: user.userId } } },
      include: reviewDashboardInclude,
    });
    await this.audit.log({
      userId: user.userId,
      action: 'review.activated',
      module: 'reviews',
      entityId: row.id,
      newValue: {
        reviewId: row.id,
        clientName: displayClientName(row),
        performedByUserId: user.userId,
      },
    });
    return this.toDashboardReviewDto(row);
  }

  async deactivateDashboardReview(user: DashboardJwtUser, id: string) {
    const before = await this.prisma.review.findUnique({
      where: { id },
      include: reviewDashboardInclude,
    });
    if (!before) {
      throw new NotFoundException('Review not found');
    }
    const row = await this.prisma.review.update({
      where: { id },
      data: {
        isActive: false,
        showOnHomepage: false,
        updatedByUser: { connect: { id: user.userId } },
      },
      include: reviewDashboardInclude,
    });
    await this.audit.log({
      userId: user.userId,
      action: 'review.deactivated',
      module: 'reviews',
      entityId: row.id,
      newValue: {
        reviewId: row.id,
        clientName: displayClientName(row),
        performedByUserId: user.userId,
      },
    });
    return this.toDashboardReviewDto(row);
  }

  async patchDashboardReviewHomepageVisibility(
    user: DashboardJwtUser,
    id: string,
    dto: PatchDashboardReviewHomepageDto,
  ) {
    const current = await this.prisma.review.findUnique({
      where: { id },
      include: reviewDashboardInclude,
    });
    if (!current) {
      throw new NotFoundException('Review not found');
    }
    if (dto.showOnHomepage) {
      if (!current.isActive) {
        throw new BadRequestException(
          'Activate this testimonial before showing it on the homepage.',
        );
      }
      const prior = await this.prisma.review.findFirst({
        where: { showOnHomepage: true },
        select: { id: true },
      });
      const previousHomepageReviewId =
        prior && prior.id !== id ? prior.id : null;
      const row = await this.prisma.$transaction(async (tx) => {
        await tx.review.updateMany({
          data: { showOnHomepage: false, updatedByUserId: user.userId },
          where: { showOnHomepage: true },
        });
        return tx.review.update({
          where: { id },
          data: {
            showOnHomepage: true,
            updatedByUser: { connect: { id: user.userId } },
          },
          include: reviewDashboardInclude,
        });
      });
      await this.audit.log({
        userId: user.userId,
        action: 'review.homepage_selected',
        module: 'reviews',
        entityId: row.id,
        newValue: {
          selectedReviewId: row.id,
          previousHomepageReviewId,
          clientName: displayClientName(row),
          performedByUserId: user.userId,
        },
      });
      await this.audit.log({
        userId: user.userId,
        action: 'review.homepage_visibility_updated',
        module: 'reviews',
        entityId: row.id,
        oldValue: {
          reviewId: current.id,
          showOnHomepage: current.showOnHomepage,
          performedByUserId: user.userId,
        },
        newValue: {
          reviewId: row.id,
          showOnHomepage: true,
          performedByUserId: user.userId,
        },
      });
      return this.toDashboardReviewDto(row);
    }
    const row = await this.prisma.review.update({
      where: { id },
      data: { showOnHomepage: false, updatedByUser: { connect: { id: user.userId } } },
      include: reviewDashboardInclude,
    });
    await this.audit.log({
      userId: user.userId,
      action: 'review.homepage_visibility_updated',
      module: 'reviews',
      entityId: row.id,
      oldValue: {
        reviewId: current.id,
        showOnHomepage: current.showOnHomepage,
        performedByUserId: user.userId,
      },
      newValue: {
        reviewId: row.id,
        showOnHomepage: false,
        performedByUserId: user.userId,
      },
    });
    return this.toDashboardReviewDto(row);
  }

  async reorderDashboardReviews(
    user: DashboardJwtUser,
    dto: ReorderDashboardReviewsDto,
  ) {
    await this.prisma.$transaction(async (tx) => {
      for (const item of dto.items) {
        await tx.review.update({
          where: { id: item.id },
          data: {
            displayOrder: item.displayOrder,
            updatedByUser: { connect: { id: user.userId } },
          },
        });
      }
    });
    await this.audit.log({
      userId: user.userId,
      action: 'review.reordered',
      module: 'reviews',
      entityId: null,
      newValue: {
        items: dto.items.map((i) => ({ id: i.id, displayOrder: i.displayOrder })),
        performedByUserId: user.userId,
      } as Prisma.InputJsonValue,
    });
    return { ok: true as const };
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

  private toDashboardReviewDto(
    row: Prisma.ReviewGetPayload<{ include: typeof reviewDashboardInclude }>,
  ) {
    return {
      id: row.id,
      clientId: row.clientId,
      bookingId: row.bookingId,
      relatedServiceId: row.relatedServiceId,
      clientName: row.clientName,
      clientTitle: row.clientTitle,
      serviceName: row.serviceName,
      branchId: row.branchId,
      branchName: row.branch?.name ?? null,
      displayClientName: displayClientName(row),
      rating: row.rating,
      quote: row.comment,
      status: row.status,
      isActive: row.isActive,
      showOnHomepage: row.showOnHomepage,
      displayOrder: row.displayOrder,
      source: row.source,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdByUserId: row.createdByUserId,
      updatedByUserId: row.updatedByUserId,
      createdByName: row.createdByUser?.name ?? null,
      updatedByName: row.updatedByUser?.name ?? null,
      client: row.client,
      booking: row.booking,
    };
  }

  private async ensureBranchExists(id: string) {
    const exists = await this.prisma.branch.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('Branch not found');
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
