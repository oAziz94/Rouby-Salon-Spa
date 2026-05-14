import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GalleryItemLibraryStatus, Prisma } from '@prisma/client';
import type { Express } from 'express';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { AuditService } from '../audit/audit.service';
import {
  expectedImageUrlForKey,
  parsePublicMediaBaseUrls,
  SERVICE_IMAGE_KEY_RE,
} from '../catalog/service-image-policy';
import { MediaUploadService } from '../media/media-upload.service';
import { PrismaService } from '../prisma/prisma.service';
import { toPublicGalleryItem } from './content.mapper';
import type { DashboardGalleryListQueryDto } from './dto/dashboard-gallery-list-query.dto';
import type { AttachGalleryAssetDto } from './dto/gallery-attach.dto';
import type { DashboardGalleryUploadFieldsDto } from './dto/gallery-upload-fields.dto';
import {
  CreateGalleryItemDto,
  PatchGalleryItemDto,
  PatchGalleryStatusDto,
} from './dto/gallery.dto';
import type { PatchDashboardGalleryAssetDto } from './dto/patch-dashboard-gallery-asset.dto';

const SITE_CONTENT_ID = '82000000-0000-4000-8000-000000000001';

export const GALLERY_USAGE = {
  SERVICE_IMAGE: 'SERVICE_IMAGE',
  HOMEPAGE_GALLERY: 'HOMEPAGE_GALLERY',
  HOMEPAGE_HERO: 'HOMEPAGE_HERO',
  HOMEPAGE_SECTION: 'HOMEPAGE_SECTION',
  ABOUT_SECTION: 'ABOUT_SECTION',
  VISIT_US_SECTION: 'VISIT_US_SECTION',
  /** Website Content module — `entityId` = website content section id, `sectionKey` = section key. */
  WEBSITE_SECTION: 'WEBSITE_SECTION',
} as const;

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

function parseTags(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,#]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 40);
}

@Injectable()
export class GalleryAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mediaUpload: MediaUploadService,
    private readonly config: ConfigService,
  ) {}

  private getMediaBases(): string[] {
    return parsePublicMediaBaseUrls(
      this.config.get<string>('PUBLIC_MEDIA_BASE_URL'),
    );
  }

  /** Public gallery: explicit HOMEPAGE_GALLERY usages win; otherwise legacy active rows. */
  async getPublicGallery() {
    const homepageIds = await this.prisma.mediaUsage.findMany({
      where: { usageType: GALLERY_USAGE.HOMEPAGE_GALLERY },
      select: { galleryItemId: true },
      distinct: ['galleryItemId'],
    });
    const idList = homepageIds.map((r) => r.galleryItemId);
    const where: Prisma.GalleryItemWhereInput =
      idList.length > 0
        ? {
            id: { in: idList },
            libraryStatus: GalleryItemLibraryStatus.ACTIVE,
            isActive: true,
          }
        : {
            isActive: true,
            libraryStatus: GalleryItemLibraryStatus.ACTIVE,
          };
    const rows = await this.prisma.galleryItem.findMany({
      where,
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
    });
    return { data: rows.map(toPublicGalleryItem) };
  }

  async listDashboardGallery(query: DashboardGalleryListQueryDto) {
    const pageSize = query.limit ?? query.pageSize;
    const page = query.page;

    const and: Prisma.GalleryItemWhereInput[] = [];

    if (query.category) {
      and.push({ category: query.category });
    }
    if (typeof query.isActive === 'boolean') {
      and.push({ isActive: query.isActive });
    }
    if (query.libraryStatus) {
      and.push({ libraryStatus: query.libraryStatus });
    }
    if (query.search?.trim()) {
      const s = query.search.trim();
      and.push({
        OR: [
          { title: { contains: s, mode: 'insensitive' } },
          { altText: { contains: s, mode: 'insensitive' } },
          { description: { contains: s, mode: 'insensitive' } },
          { originalName: { contains: s, mode: 'insensitive' } },
        ],
      });
    }
    if (query.tag?.trim()) {
      and.push({ tags: { has: query.tag.trim() } });
    }

    if (query.usageBucket === 'unused') {
      and.push({
        AND: [
          { mediaUsages: { none: {} } },
          { servicesAsPrimaryImage: { none: {} } },
        ],
      });
    } else if (query.usageBucket === 'services') {
      and.push({
        OR: [
          { mediaUsages: { some: { usageType: GALLERY_USAGE.SERVICE_IMAGE } } },
          { servicesAsPrimaryImage: { some: {} } },
        ],
      });
    } else if (query.usageBucket === 'homepage') {
      and.push({
        mediaUsages: {
          some: {
            usageType: {
              in: [
                GALLERY_USAGE.HOMEPAGE_GALLERY,
                GALLERY_USAGE.HOMEPAGE_HERO,
                GALLERY_USAGE.HOMEPAGE_SECTION,
              ],
            },
          },
        },
      });
    } else if (query.usageBucket === 'other_sections') {
      and.push({
        mediaUsages: {
          some: {
            usageType: {
              in: [
                GALLERY_USAGE.ABOUT_SECTION,
                GALLERY_USAGE.VISIT_US_SECTION,
                GALLERY_USAGE.WEBSITE_SECTION,
              ],
            },
          },
        },
      });
    }

    if (query.usageType) {
      and.push({
        mediaUsages: { some: { usageType: query.usageType } },
      });
    }

    const where: Prisma.GalleryItemWhereInput =
      and.length > 0 ? { AND: and } : {};

    const skip = (page - 1) * pageSize;
    const [totalItems, rows] = await Promise.all([
      this.prisma.galleryItem.count({ where }),
      this.prisma.galleryItem.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
        include: {
          uploadedBy: { select: { id: true, name: true } },
          mediaUsages: { select: { usageType: true, id: true } },
          _count: {
            select: {
              mediaUsages: true,
              servicesAsPrimaryImage: true,
            },
          },
        },
      }),
    ]);

    const data = rows.map((row) => this.toListRow(row));
    return {
      data,
      meta: buildListMeta({ page, pageSize, totalItems }),
    };
  }

  private toListRow(
    row: Prisma.GalleryItemGetPayload<{
      include: {
        uploadedBy: { select: { id: true; name: true } };
        mediaUsages: { select: { usageType: true; id: true } };
        _count: { select: { mediaUsages: true; servicesAsPrimaryImage: true } };
      };
    }>,
  ) {
    const hasServiceUsage = row.mediaUsages.some(
      (u) => u.usageType === GALLERY_USAGE.SERVICE_IMAGE,
    );
    const usageCount =
      row._count.mediaUsages +
      (row._count.servicesAsPrimaryImage > 0 && !hasServiceUsage ? 1 : 0);
    const hasService =
      row.mediaUsages.some((u) => u.usageType === GALLERY_USAGE.SERVICE_IMAGE) ||
      row._count.servicesAsPrimaryImage > 0;
    const homepageTypes = new Set<string>([
      GALLERY_USAGE.HOMEPAGE_GALLERY,
      GALLERY_USAGE.HOMEPAGE_HERO,
      GALLERY_USAGE.HOMEPAGE_SECTION,
    ]);
    const hasHomepage = row.mediaUsages.some((u) => homepageTypes.has(u.usageType));
    const summaryParts: string[] = [];
    if (hasService) summaryParts.push('SERVICE');
    if (hasHomepage) summaryParts.push('HOMEPAGE');
    const other = row.mediaUsages.some(
      (u) =>
        u.usageType === GALLERY_USAGE.ABOUT_SECTION ||
        u.usageType === GALLERY_USAGE.VISIT_US_SECTION ||
        u.usageType === GALLERY_USAGE.WEBSITE_SECTION,
    );
    if (other) summaryParts.push('SECTION');

    return {
      id: row.id,
      url: row.imageUrl,
      imageUrl: row.imageUrl,
      title: row.title,
      altText: row.altText,
      description: row.description,
      tags: row.tags,
      category: row.category,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      width: row.width,
      height: row.height,
      storageKey: row.storageKey,
      originalName: row.originalName,
      isFeatured: row.isFeatured,
      displayOrder: row.displayOrder,
      isActive: row.isActive,
      libraryStatus: row.libraryStatus,
      uploadedBy: row.uploadedBy
        ? { id: row.uploadedBy.id, name: row.uploadedBy.name }
        : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      usageSummary: {
        usageCount,
        isUsed: usageCount > 0,
        badges: summaryParts,
        hasAltText: Boolean(row.altText?.trim()),
      },
    };
  }

  async statsDashboardGallery() {
    const [
      total,
      usedMediaUsage,
      servicesWithImage,
      homepageUsages,
      serviceUsageRows,
    ] = await Promise.all([
      this.prisma.galleryItem.count(),
      this.prisma.mediaUsage.count(),
      this.prisma.service.count({ where: { imageMediaId: { not: null } } }),
      this.prisma.mediaUsage.count({
        where: {
          usageType: {
            in: [
              GALLERY_USAGE.HOMEPAGE_GALLERY,
              GALLERY_USAGE.HOMEPAGE_HERO,
              GALLERY_USAGE.HOMEPAGE_SECTION,
            ],
          },
        },
      }),
      this.prisma.mediaUsage.count({
        where: { usageType: GALLERY_USAGE.SERVICE_IMAGE },
      }),
    ]);
    const usedFromUsageDistinct = await this.prisma.mediaUsage.groupBy({
      by: ['galleryItemId'],
    });
    const serviceMediaIds = await this.prisma.service.findMany({
      where: { imageMediaId: { not: null } },
      select: { imageMediaId: true },
      distinct: ['imageMediaId'],
    });
    const usedSet = new Set([
      ...usedFromUsageDistinct.map((g) => g.galleryItemId),
      ...serviceMediaIds
        .map((s) => s.imageMediaId)
        .filter((x): x is string => Boolean(x)),
    ]);
    const usedImages = usedSet.size;
    const unusedImages = Math.max(0, total - usedImages);
    return {
      totalImages: total,
      usedImages,
      unusedImages,
      serviceImages: servicesWithImage,
      homepageImages: homepageUsages,
      mediaUsageRows: usedMediaUsage,
      serviceUsageAttachments: serviceUsageRows,
    };
  }

  async getDashboardGalleryAsset(id: string) {
    const row = await this.prisma.galleryItem.findUnique({
      where: { id },
      include: {
        uploadedBy: { select: { id: true, name: true, email: true } },
        mediaUsages: {
          orderBy: { createdAt: 'desc' },
        },
        servicesAsPrimaryImage: { select: { id: true, name: true } },
      },
    });
    if (!row) throw new NotFoundException('Gallery item not found');

    const usages = await this.buildUsageRows(row.id, row.mediaUsages, row.servicesAsPrimaryImage);
    return {
      asset: this.toListRow({
        ...row,
        mediaUsages: row.mediaUsages.map((u) => ({
          usageType: u.usageType,
          id: u.id,
        })),
        _count: {
          mediaUsages: row.mediaUsages.length,
          servicesAsPrimaryImage: row.servicesAsPrimaryImage.length,
        },
      }),
      usages,
    };
  }

  private async buildUsageRows(
    galleryItemId: string,
    mediaUsages: { id: string; usageType: string; entityType: string | null; entityId: string | null; sectionKey: string | null; isPrimary: boolean }[],
    servicesLinked: { id: string; name: string }[],
  ) {
    const out: Array<{
      id: string;
      usageType: string;
      label: string;
      entityType: string | null;
      entityId: string | null;
      sectionKey: string | null;
      isPrimary: boolean;
      routeHint: string | null;
    }> = [];

    for (const u of mediaUsages) {
      out.push({
        id: u.id,
        usageType: u.usageType,
        label: await this.describeUsage(u),
        entityType: u.entityType,
        entityId: u.entityId,
        sectionKey: u.sectionKey,
        isPrimary: u.isPrimary,
        routeHint: this.usageRouteHint(u),
      });
    }

    const coveredServiceIds = new Set(
      mediaUsages
        .filter((u) => u.usageType === GALLERY_USAGE.SERVICE_IMAGE && u.entityId)
        .map((u) => u.entityId as string),
    );
    for (const s of servicesLinked) {
      if (coveredServiceIds.has(s.id)) continue;
      out.push({
        id: `svc-${s.id}`,
        usageType: GALLERY_USAGE.SERVICE_IMAGE,
        label: `Service: ${s.name}`,
        entityType: 'Service',
        entityId: s.id,
        sectionKey: null,
        isPrimary: true,
        routeHint: '/dashboard/services',
      });
    }

    return out;
  }

  private usageRouteHint(u: {
    usageType: string;
    entityId: string | null;
  }): string | null {
    if (u.usageType === GALLERY_USAGE.SERVICE_IMAGE && u.entityId) {
      return '/dashboard/services';
    }
    if (
      u.usageType === GALLERY_USAGE.HOMEPAGE_HERO ||
      u.usageType === GALLERY_USAGE.HOMEPAGE_SECTION ||
      u.usageType === GALLERY_USAGE.ABOUT_SECTION ||
      u.usageType === GALLERY_USAGE.VISIT_US_SECTION ||
      u.usageType === GALLERY_USAGE.WEBSITE_SECTION
    ) {
      return '/dashboard/website-content';
    }
    return null;
  }

  private async describeUsage(u: {
    usageType: string;
    entityId: string | null;
    sectionKey: string | null;
  }): Promise<string> {
    if (u.usageType === GALLERY_USAGE.SERVICE_IMAGE && u.entityId) {
      const svc = await this.prisma.service.findUnique({
        where: { id: u.entityId },
        select: { name: true },
      });
      return `Service: ${svc?.name ?? 'Service'}`;
    }
    if (u.usageType === GALLERY_USAGE.HOMEPAGE_HERO) return 'Homepage: Hero';
    if (u.usageType === GALLERY_USAGE.HOMEPAGE_GALLERY) return 'Homepage: Gallery';
    if (u.usageType === GALLERY_USAGE.HOMEPAGE_SECTION) {
      return `Homepage section: ${u.sectionKey ?? 'section'}`;
    }
    if (u.usageType === GALLERY_USAGE.ABOUT_SECTION) return 'Website: About';
    if (u.usageType === GALLERY_USAGE.VISIT_US_SECTION) return 'Website: Visit Us';
    if (u.usageType === GALLERY_USAGE.WEBSITE_SECTION && u.entityId) {
      const sec = await this.prisma.websiteContentSection.findUnique({
        where: { id: u.entityId },
        select: { key: true, title: true, page: true },
      });
      const label =
        sec?.title?.trim() ||
        sec?.key?.replace(/\./g, ' · ') ||
        'Website section';
      return `Website Content: ${label}`;
    }
    return u.usageType;
  }

  async uploadDashboardGallery(
    file: Express.Multer.File | undefined,
    fields: DashboardGalleryUploadFieldsDto,
    user: DashboardJwtUser,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Missing file');
    }
    const saved = await this.mediaUpload.saveDashboardImage(file);
    const tags = fields.tags?.length
      ? fields.tags
      : parseTags(fields.tagsRaw);

    const row = await this.prisma.galleryItem.create({
      data: {
        imageUrl: saved.imageUrl,
        storageKey: saved.imageKey,
        originalName: saved.originalName,
        mimeType: saved.mimeType,
        sizeBytes: saved.size,
        title: fields.title?.trim() || null,
        altText: fields.altText?.trim() || null,
        description: fields.description?.trim() || null,
        category: fields.category?.trim() || null,
        tags,
        isFeatured: false,
        displayOrder: 0,
        isActive: true,
        libraryStatus: GalleryItemLibraryStatus.ACTIVE,
        uploadedByUserId: user.userId,
      },
      include: {
        uploadedBy: { select: { id: true, name: true } },
        mediaUsages: { select: { id: true, usageType: true } },
        _count: {
          select: { mediaUsages: true, servicesAsPrimaryImage: true },
        },
      },
    });

    await this.audit.log({
      userId: user.userId,
      action: 'gallery.image_uploaded',
      module: 'gallery',
      entityId: row.id,
      entityType: 'GalleryItem',
      newValue: {
        title: row.title,
        mediaAssetId: row.id,
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
      },
    });

    return this.toListRow(row);
  }

  async patchDashboardGalleryAsset(
    id: string,
    dto: PatchDashboardGalleryAssetDto,
    user: DashboardJwtUser,
  ) {
    await this.ensureGalleryExists(id);
    const row = await this.prisma.galleryItem.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.altText !== undefined ? { altText: dto.altText } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
        ...(dto.libraryStatus !== undefined
          ? { libraryStatus: dto.libraryStatus }
          : {}),
        ...(dto.isFeatured !== undefined ? { isFeatured: dto.isFeatured } : {}),
        ...(dto.displayOrder !== undefined ? { displayOrder: dto.displayOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: {
        uploadedBy: { select: { id: true, name: true } },
        mediaUsages: { select: { id: true, usageType: true } },
        _count: {
          select: { mediaUsages: true, servicesAsPrimaryImage: true },
        },
      },
    });

    await this.audit.log({
      userId: user.userId,
      action:
        dto.libraryStatus === GalleryItemLibraryStatus.ARCHIVED
          ? 'gallery.image_archived'
          : 'gallery.image_updated',
      module: 'gallery',
      entityId: id,
      entityType: 'GalleryItem',
      newValue: { title: row.title, mediaAssetId: id },
    });

    return this.toListRow(row);
  }

  /** Legacy patch (display order, featured, etc.) — image URL changes must match salon uploads. */
  async patchGalleryItem(id: string, dto: PatchGalleryItemDto, user: DashboardJwtUser) {
    await this.ensureGalleryExists(id);
    if (dto.imageUrl !== undefined) {
      const bases = this.getMediaBases();
      const url = dto.imageUrl.trim();
      const ok = bases.some((base) => url.startsWith(`${base}/uploads/`));
      if (!ok) {
        throw new BadRequestException(
          'Only images from this salon media store are allowed.',
        );
      }
    }
    const row = await this.prisma.galleryItem.update({
      where: { id },
      data: {
        ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.isFeatured !== undefined ? { isFeatured: dto.isFeatured } : {}),
        ...(dto.displayOrder !== undefined ? { displayOrder: dto.displayOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: {
        uploadedBy: { select: { id: true, name: true } },
        mediaUsages: { select: { id: true, usageType: true } },
        _count: {
          select: { mediaUsages: true, servicesAsPrimaryImage: true },
        },
      },
    });
    await this.audit.log({
      userId: user.userId,
      action: 'gallery.image_updated',
      module: 'gallery',
      entityId: id,
      entityType: 'GalleryItem',
      newValue: { title: row.title, mediaAssetId: id },
    });
    return this.toListRow(row);
  }

  async patchGalleryStatus(id: string, dto: PatchGalleryStatusDto) {
    await this.ensureGalleryExists(id);
    return this.prisma.galleryItem.update({
      where: { id },
      data: { isActive: dto.isActive },
    });
  }

  /** Legacy JSON create — only allows URLs from this deployment's media origins. */
  async createGalleryItem(dto: CreateGalleryItemDto, user: DashboardJwtUser) {
    const bases = this.getMediaBases();
    const allowed = new Set<string>();
    for (const b of bases) {
      allowed.add(b);
    }
    const url = dto.imageUrl.trim();
    const ok = [...allowed].some((base) => url.startsWith(`${base}/uploads/`));
    if (!ok) {
      throw new BadRequestException(
        'Only images uploaded to this salon media store are allowed. Use Upload from the Gallery.',
      );
    }
    const row = await this.prisma.galleryItem.create({
      data: {
        imageUrl: url,
        storageKey: null,
        title: dto.title ?? null,
        category: dto.category ?? null,
        description: dto.description ?? null,
        isFeatured: dto.isFeatured ?? false,
        displayOrder: dto.displayOrder ?? 0,
        isActive: dto.isActive ?? true,
        libraryStatus: GalleryItemLibraryStatus.ACTIVE,
        uploadedByUserId: user.userId,
      },
      include: {
        uploadedBy: { select: { id: true, name: true } },
        mediaUsages: { select: { id: true, usageType: true } },
        _count: {
          select: { mediaUsages: true, servicesAsPrimaryImage: true },
        },
      },
    });
    return this.toListRow(row);
  }

  async deleteDashboardGalleryAsset(id: string, user: DashboardJwtUser) {
    const row = await this.prisma.galleryItem.findUnique({
      where: { id },
      include: {
        _count: {
          select: { mediaUsages: true, servicesAsPrimaryImage: true },
        },
      },
    });
    if (!row) throw new NotFoundException('Gallery item not found');
    const inUse =
      row._count.mediaUsages > 0 || row._count.servicesAsPrimaryImage > 0;
    if (inUse) {
      throw new HttpException(
        {
          code: 'IMAGE_IN_USE',
          message:
            'This image is currently used in Services or the website. Remove it from those places before deleting.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (row.storageKey && SERVICE_IMAGE_KEY_RE.test(row.storageKey)) {
      await this.mediaUpload.deleteStoredImage(row.storageKey);
    }
    await this.prisma.galleryItem.delete({ where: { id } });
    await this.audit.log({
      userId: user.userId,
      action: 'gallery.image_deleted',
      module: 'gallery',
      entityId: id,
      entityType: 'GalleryItem',
      newValue: { mediaAssetId: id, title: row.title },
    });
  }

  async listUsages(id: string) {
    await this.ensureGalleryExists(id);
    const [mediaUsages, servicesLinked] = await Promise.all([
      this.prisma.mediaUsage.findMany({
        where: { galleryItemId: id },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.service.findMany({
        where: { imageMediaId: id },
        select: { id: true, name: true },
      }),
    ]);
    return {
      data: await this.buildUsageRows(id, mediaUsages, servicesLinked),
    };
  }

  async detachUsage(usageId: string, user: DashboardJwtUser) {
    if (usageId.startsWith('svc-')) {
      const serviceId = usageId.slice(4);
      if (!user.permissions.includes('services.manage')) {
        throw new ForbiddenException('Insufficient permissions');
      }
      await this.prisma.mediaUsage.deleteMany({
        where: {
          usageType: GALLERY_USAGE.SERVICE_IMAGE,
          entityId: serviceId,
        },
      });
      await this.prisma.service.updateMany({
        where: { id: serviceId },
        data: {
          imageMediaId: null,
          imageUrl: null,
          imageKey: null,
        },
      });
      await this.audit.log({
        userId: user.userId,
        action: 'gallery.image_detached',
        module: 'gallery',
        entityId: serviceId,
        entityType: 'Service',
        newValue: { syntheticUsageId: usageId },
      });
      return { ok: true };
    }
    const u = await this.prisma.mediaUsage.findUnique({
      where: { id: usageId },
      include: { galleryItem: true },
    });
    if (!u) throw new NotFoundException('Usage not found');

    if (u.usageType === GALLERY_USAGE.SERVICE_IMAGE && u.entityId) {
      if (!user.permissions.includes('services.manage')) {
        throw new ForbiddenException('Insufficient permissions');
      }
      await this.prisma.service.updateMany({
        where: { id: u.entityId, imageMediaId: u.galleryItemId },
        data: { imageMediaId: null, imageUrl: null, imageKey: null },
      });
    }

    await this.prisma.mediaUsage.delete({ where: { id: usageId } });
    await this.audit.log({
      userId: user.userId,
      action: 'gallery.image_detached',
      module: 'gallery',
      entityId: u.galleryItemId,
      entityType: 'GalleryItem',
      newValue: { usageType: u.usageType, usageId },
    });
    return { ok: true };
  }

  async attachGalleryAsset(
    galleryItemId: string,
    dto: AttachGalleryAssetDto,
    user: DashboardJwtUser,
  ) {
    const asset = await this.prisma.galleryItem.findUnique({
      where: { id: galleryItemId },
    });
    if (!asset) throw new NotFoundException('Gallery item not found');
    if (asset.libraryStatus !== GalleryItemLibraryStatus.ACTIVE) {
      throw new BadRequestException('Cannot attach an archived image');
    }

    if (dto.usageType === GALLERY_USAGE.SERVICE_IMAGE) {
      if (!user.permissions.includes('services.manage')) {
        throw new ForbiddenException('Insufficient permissions to attach to a service');
      }
      if (!dto.entityId) {
        throw new BadRequestException('entityId (service id) is required');
      }
      const svc = await this.prisma.service.findUnique({
        where: { id: dto.entityId },
      });
      if (!svc) throw new NotFoundException('Service not found');

      const bases = this.getMediaBases();
      const imageUrl =
        asset.storageKey && SERVICE_IMAGE_KEY_RE.test(asset.storageKey)
          ? (expectedImageUrlForKey(asset.storageKey, bases)[0] ?? asset.imageUrl)
          : asset.imageUrl;
      const imageKey = asset.storageKey ?? null;

      await this.prisma.$transaction(async (tx) => {
        await tx.mediaUsage.deleteMany({
          where: {
            usageType: GALLERY_USAGE.SERVICE_IMAGE,
            entityId: dto.entityId,
          },
        });
        await tx.mediaUsage.create({
          data: {
            galleryItemId,
            usageType: GALLERY_USAGE.SERVICE_IMAGE,
            entityType: 'Service',
            entityId: dto.entityId,
            isPrimary: dto.isPrimary ?? true,
          },
        });
        await tx.service.update({
          where: { id: dto.entityId },
          data: {
            imageMediaId: galleryItemId,
            imageUrl,
            imageKey,
            ...(dto.syncAltToService && asset.altText
              ? { imageAlt: asset.altText }
              : {}),
          },
        });
      });

      await this.audit.log({
        userId: user.userId,
        action: 'gallery.image_attached',
        module: 'gallery',
        entityId: galleryItemId,
        newValue: {
          usageType: dto.usageType,
          entityType: 'Service',
          entityId: dto.entityId,
          mediaAssetId: galleryItemId,
        },
      });
      await this.audit.log({
        userId: user.userId,
        action: 'service.image_attached',
        module: 'catalog',
        entityId: dto.entityId,
        entityType: 'Service',
        newValue: { mediaAssetId: galleryItemId, title: asset.title },
      });

      return { ok: true };
    }

    if (dto.usageType === GALLERY_USAGE.HOMEPAGE_GALLERY) {
      await this.prisma.mediaUsage.create({
        data: {
          galleryItemId,
          usageType: GALLERY_USAGE.HOMEPAGE_GALLERY,
          entityType: 'SiteContent',
          entityId: SITE_CONTENT_ID,
          sectionKey: 'gallery',
          isPrimary: false,
        },
      });
      await this.prisma.galleryItem.update({
        where: { id: galleryItemId },
        data: { isActive: true },
      });
      await this.audit.log({
        userId: user.userId,
        action: 'gallery.image_attached',
        module: 'gallery',
        entityId: galleryItemId,
        newValue: { usageType: dto.usageType },
      });
      return { ok: true };
    }

    if (dto.usageType === GALLERY_USAGE.HOMEPAGE_HERO) {
      const site = await this.ensureSiteContentRow();
      const hero = (site.homeHero as Record<string, unknown>) ?? {};
      const nextHero = {
        ...hero,
        heroImageUrl: asset.imageUrl,
      };
      await this.prisma.$transaction(async (tx) => {
        await tx.mediaUsage.deleteMany({
          where: { usageType: GALLERY_USAGE.HOMEPAGE_HERO },
        });
        await tx.mediaUsage.create({
          data: {
            galleryItemId,
            usageType: GALLERY_USAGE.HOMEPAGE_HERO,
            entityType: 'SiteContent',
            entityId: SITE_CONTENT_ID,
            sectionKey: 'hero',
            isPrimary: true,
          },
        });
        await tx.siteContent.update({
          where: { id: SITE_CONTENT_ID },
          data: { homeHero: nextHero as Prisma.InputJsonValue },
        });
      });
      await this.audit.log({
        userId: user.userId,
        action: 'gallery.image_attached',
        module: 'gallery',
        entityId: galleryItemId,
        newValue: { usageType: GALLERY_USAGE.HOMEPAGE_HERO },
      });
      return { ok: true };
    }

    if (dto.usageType === GALLERY_USAGE.HOMEPAGE_SECTION) {
      const key = dto.sectionKey?.trim() || 'custom';
      const slug = key.replace(/[^a-zA-Z0-9_-]/g, '') || 'section';
      const heroImageField = `${slug}ImageUrl`;
      await this.prisma.$transaction(async (tx) => {
        await tx.mediaUsage.create({
          data: {
            galleryItemId,
            usageType: GALLERY_USAGE.HOMEPAGE_SECTION,
            entityType: 'SiteContent',
            entityId: SITE_CONTENT_ID,
            sectionKey: key,
            isPrimary: dto.isPrimary ?? false,
          },
        });
        const site = await tx.siteContent.findUnique({
          where: { id: SITE_CONTENT_ID },
        });
        if (!site) throw new NotFoundException('Site content not found');
        const hero = (site.homeHero as Record<string, unknown>) ?? {};
        const nextHero = { ...hero, [heroImageField]: asset.imageUrl };
        await tx.siteContent.update({
          where: { id: SITE_CONTENT_ID },
          data: { homeHero: nextHero as Prisma.InputJsonValue },
        });
      });
      await this.audit.log({
        userId: user.userId,
        action: 'gallery.image_attached',
        module: 'gallery',
        entityId: galleryItemId,
        newValue: {
          usageType: dto.usageType,
          sectionKey: key,
          homeHeroField: heroImageField,
        },
      });
      return { ok: true };
    }

    if (dto.usageType === GALLERY_USAGE.ABOUT_SECTION) {
      const key = dto.sectionKey?.trim() || 'about';
      const normalized = key.toLowerCase();
      const aboutImageField =
        normalized === 'philosophy' ? 'philosophyImageUrl' : 'storyImageUrl';
      await this.prisma.$transaction(async (tx) => {
        await tx.mediaUsage.create({
          data: {
            galleryItemId,
            usageType: GALLERY_USAGE.ABOUT_SECTION,
            entityType: 'SiteContent',
            entityId: SITE_CONTENT_ID,
            sectionKey: key,
            isPrimary: dto.isPrimary ?? false,
          },
        });
        const site = await tx.siteContent.findUnique({
          where: { id: SITE_CONTENT_ID },
        });
        if (!site) throw new NotFoundException('Site content not found');
        const about = (site.aboutSection as Record<string, unknown>) ?? {};
        const nextAbout = { ...about, [aboutImageField]: asset.imageUrl };
        await tx.siteContent.update({
          where: { id: SITE_CONTENT_ID },
          data: { aboutSection: nextAbout as Prisma.InputJsonValue },
        });
      });
      await this.audit.log({
        userId: user.userId,
        action: 'gallery.image_attached',
        module: 'gallery',
        entityId: galleryItemId,
        newValue: {
          usageType: dto.usageType,
          sectionKey: key,
          aboutSectionField: aboutImageField,
        },
      });
      return { ok: true };
    }

    if (dto.usageType === GALLERY_USAGE.VISIT_US_SECTION) {
      const key = dto.sectionKey?.trim() || 'visit';
      await this.prisma.mediaUsage.create({
        data: {
          galleryItemId,
          usageType: GALLERY_USAGE.VISIT_US_SECTION,
          entityType: 'SiteContent',
          entityId: SITE_CONTENT_ID,
          sectionKey: key,
          isPrimary: dto.isPrimary ?? false,
        },
      });
      await this.audit.log({
        userId: user.userId,
        action: 'gallery.image_attached',
        module: 'gallery',
        entityId: galleryItemId,
        newValue: { usageType: dto.usageType, sectionKey: key },
      });
      return { ok: true };
    }

    throw new BadRequestException('Unsupported usageType');
  }

  private async ensureSiteContentRow() {
    const row = await this.prisma.siteContent.findUnique({
      where: { id: SITE_CONTENT_ID },
    });
    if (!row) throw new NotFoundException('Site content not found');
    return row;
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
}
