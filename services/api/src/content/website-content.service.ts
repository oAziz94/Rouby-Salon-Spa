import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { GALLERY_USAGE } from './gallery-admin.service';
import type { DashboardWebsiteContentListQueryDto } from './dto/dashboard-website-content-list-query.dto';
import type { PatchWebsiteContentSectionDto } from './dto/patch-website-content-section.dto';
import type { ReorderWebsiteContentDto } from './dto/reorder-website-content.dto';
import {
  WEBSITE_CONTENT_SECTION_SEEDS,
  websiteContentSectionCreateFromSeed,
} from './website-content-section-seeds';

const sectionInclude = {
  primaryGalleryItem: { select: { id: true, imageUrl: true, title: true } },
  secondaryGalleryItem: { select: { id: true, imageUrl: true, title: true } },
  updatedByUser: { select: { id: true, name: true } },
} satisfies Prisma.WebsiteContentSectionInclude;

type SectionRow = Prisma.WebsiteContentSectionGetPayload<{
  include: typeof sectionInclude;
}>;

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

@Injectable()
export class WebsiteContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async seedDefaultSections(_user: DashboardJwtUser | null) {
    for (const s of WEBSITE_CONTENT_SECTION_SEEDS) {
      await this.prisma.websiteContentSection.upsert({
        where: { key: s.key },
        create: websiteContentSectionCreateFromSeed(s, _user?.userId ?? null),
        update: {},
      });
    }
    return {
      ok: true as const,
      seededKeys: WEBSITE_CONTENT_SECTION_SEEDS.map((x) => x.key),
    };
  }

  async listDashboard(query: DashboardWebsiteContentListQueryDto) {
    const where: Prisma.WebsiteContentSectionWhereInput = {};
    if (query.page?.trim()) {
      where.page = query.page.trim();
    }
    if (typeof query.isVisible === 'boolean') {
      where.isVisible = query.isVisible;
    }
    const rows = await this.prisma.websiteContentSection.findMany({
      where,
      orderBy: [{ page: 'asc' }, { displayOrder: 'asc' }, { key: 'asc' }],
      include: sectionInclude,
    });
    const grouped: Record<
      string,
      ReturnType<typeof this.toDashboardSection>[]
    > = {};
    for (const row of rows) {
      const dto = this.toDashboardSection(row);
      if (!grouped[row.page]) grouped[row.page] = [];
      grouped[row.page].push(dto);
    }
    const stats = await this.computeStats(where);
    return {
      grouped,
      sections: rows.map((r) => this.toDashboardSection(r)),
      stats,
    };
  }

  private async computeStats(
    baseWhere: Prisma.WebsiteContentSectionWhereInput,
  ) {
    const [total, visible, hidden, rows] = await Promise.all([
      this.prisma.websiteContentSection.count({ where: baseWhere }),
      this.prisma.websiteContentSection.count({
        where: { ...baseWhere, isVisible: true },
      }),
      this.prisma.websiteContentSection.count({
        where: { ...baseWhere, isVisible: false },
      }),
      this.prisma.websiteContentSection.findMany({
        where: baseWhere,
        select: {
          id: true,
          sectionType: true,
          primaryGalleryItemId: true,
          updatedAt: true,
        },
      }),
    ]);
    const imageHungry = new Set(['hero', 'textImage']);
    const missingPrimaryImage = rows.filter(
      (r) => imageHungry.has(r.sectionType) && r.primaryGalleryItemId === null,
    ).length;
    const lastUpdatedAt =
      rows.length === 0
        ? null
        : rows.reduce(
            (max, r) => (r.updatedAt > max ? r.updatedAt : max),
            rows[0].updatedAt,
          );
    return {
      totalSections: total,
      visibleSections: visible,
      hiddenSections: hidden,
      sectionsMissingPrimaryImage: missingPrimaryImage,
      lastUpdatedAt: lastUpdatedAt?.toISOString() ?? null,
    };
  }

  async getDashboardSection(id: string) {
    const row = await this.prisma.websiteContentSection.findUnique({
      where: { id },
      include: sectionInclude,
    });
    if (!row) throw new NotFoundException('Website content section not found');
    return this.toDashboardSection(row);
  }

  private toDashboardSection(row: SectionRow) {
    return {
      id: row.id,
      key: row.key,
      page: row.page,
      sectionType: row.sectionType,
      title: row.title,
      subtitle: row.subtitle,
      body: row.body,
      eyebrow: row.eyebrow,
      ctaLabel: row.ctaLabel,
      ctaHref: row.ctaHref,
      secondaryCtaLabel: row.secondaryCtaLabel,
      secondaryCtaHref: row.secondaryCtaHref,
      primaryGalleryItemId: row.primaryGalleryItemId,
      secondaryGalleryItemId: row.secondaryGalleryItemId,
      primaryImagePreviewUrl: row.primaryGalleryItem?.imageUrl ?? null,
      secondaryImagePreviewUrl: row.secondaryGalleryItem?.imageUrl ?? null,
      primaryImageTitle: row.primaryGalleryItem?.title ?? null,
      secondaryImageTitle: row.secondaryGalleryItem?.title ?? null,
      content: row.content,
      isVisible: row.isVisible,
      displayOrder: row.displayOrder,
      isRequired: row.isRequired,
      updatedAt: row.updatedAt.toISOString(),
      updatedByName: row.updatedByUser?.name ?? null,
    };
  }

  async patchSection(
    user: DashboardJwtUser,
    id: string,
    dto: PatchWebsiteContentSectionDto,
  ) {
    const before = await this.prisma.websiteContentSection.findUnique({
      where: { id },
    });
    if (!before)
      throw new NotFoundException('Website content section not found');

    if (dto.isVisible === false && before.isRequired) {
      throw new BadRequestException(
        'This section is required and cannot be hidden.',
      );
    }

    if (dto.primaryGalleryItemId) {
      const gi = await this.prisma.galleryItem.findUnique({
        where: { id: dto.primaryGalleryItemId },
        select: { id: true },
      });
      if (!gi) throw new NotFoundException('Primary gallery image not found');
    }
    if (dto.secondaryGalleryItemId) {
      const gi = await this.prisma.galleryItem.findUnique({
        where: { id: dto.secondaryGalleryItemId },
        select: { id: true },
      });
      if (!gi) throw new NotFoundException('Secondary gallery image not found');
    }

    const data: Prisma.WebsiteContentSectionUpdateInput = {
      updatedByUser: { connect: { id: user.userId } },
    };
    const changed: string[] = [];
    const assign = <K extends keyof PatchWebsiteContentSectionDto>(
      key: K,
      field: keyof Prisma.WebsiteContentSectionUpdateInput,
    ) => {
      if (dto[key] === undefined) return;
      (data as Record<string, unknown>)[field as string] = dto[key];
      changed.push(String(field));
    };

    assign('title', 'title');
    assign('subtitle', 'subtitle');
    assign('body', 'body');
    assign('eyebrow', 'eyebrow');
    assign('ctaLabel', 'ctaLabel');
    assign('ctaHref', 'ctaHref');
    assign('secondaryCtaLabel', 'secondaryCtaLabel');
    assign('secondaryCtaHref', 'secondaryCtaHref');
    assign('isVisible', 'isVisible');
    assign('displayOrder', 'displayOrder');

    if (dto.primaryGalleryItemId !== undefined) {
      data.primaryGalleryItem =
        dto.primaryGalleryItemId === null
          ? { disconnect: true }
          : { connect: { id: dto.primaryGalleryItemId } };
      changed.push('primaryGalleryItemId');
    }
    if (dto.secondaryGalleryItemId !== undefined) {
      data.secondaryGalleryItem =
        dto.secondaryGalleryItemId === null
          ? { disconnect: true }
          : { connect: { id: dto.secondaryGalleryItemId } };
      changed.push('secondaryGalleryItemId');
    }
    if (dto.content !== undefined) {
      data.content = dto.content;
      changed.push('content');
    }

    const after = await this.prisma.websiteContentSection.update({
      where: { id },
      data,
      include: sectionInclude,
    });

    await this.syncWebsiteGalleryUsages(after);

    const visibilityChanged =
      dto.isVisible !== undefined && dto.isVisible !== before.isVisible;
    if (visibilityChanged) {
      await this.audit.log({
        userId: user.userId,
        action: 'websiteContent.section_visibility_changed',
        module: 'websiteContent',
        entityType: 'WebsiteContentSection',
        entityId: id,
        oldValue: { sectionKey: before.key, isVisible: before.isVisible },
        newValue: { sectionKey: after.key, isVisible: after.isVisible },
      });
    }

    const imageKeys: Array<{
      label: string;
      beforeId: string | null;
      afterId: string | null;
    }> = [
      {
        label: 'primary',
        beforeId: before.primaryGalleryItemId,
        afterId: after.primaryGalleryItemId,
      },
      {
        label: 'secondary',
        beforeId: before.secondaryGalleryItemId,
        afterId: after.secondaryGalleryItemId,
      },
    ];
    for (const img of imageKeys) {
      if (img.beforeId === img.afterId) continue;
      if (img.afterId && !img.beforeId) {
        await this.audit.log({
          userId: user.userId,
          action: 'websiteContent.image_attached',
          module: 'websiteContent',
          entityType: 'WebsiteContentSection',
          entityId: id,
          newValue: {
            sectionKey: after.key,
            slot: img.label,
            mediaAssetId: img.afterId,
          },
        });
      } else if (!img.afterId && img.beforeId) {
        await this.audit.log({
          userId: user.userId,
          action: 'websiteContent.image_removed',
          module: 'websiteContent',
          entityType: 'WebsiteContentSection',
          entityId: id,
          oldValue: {
            sectionKey: before.key,
            slot: img.label,
            mediaAssetId: img.beforeId,
          },
        });
      } else if (img.afterId && img.beforeId) {
        await this.audit.log({
          userId: user.userId,
          action: 'websiteContent.image_changed',
          module: 'websiteContent',
          entityType: 'WebsiteContentSection',
          entityId: id,
          oldValue: {
            sectionKey: before.key,
            slot: img.label,
            mediaAssetId: img.beforeId,
          },
          newValue: {
            sectionKey: after.key,
            slot: img.label,
            mediaAssetId: img.afterId,
          },
        });
      }
    }

    await this.audit.log({
      userId: user.userId,
      action: 'websiteContent.section_updated',
      module: 'websiteContent',
      entityType: 'WebsiteContentSection',
      entityId: id,
      metadata: {
        sectionKey: after.key,
        changedFields: changed,
        performedByUserId: user.userId,
      },
    });

    return this.toDashboardSection(after);
  }

  async reorder(user: DashboardJwtUser, dto: ReorderWebsiteContentDto) {
    const ids = dto.items.map((i) => i.id);
    const rows = await this.prisma.websiteContentSection.findMany({
      where: { id: { in: ids } },
      select: { id: true, key: true, displayOrder: true },
    });
    if (rows.length !== ids.length) {
      throw new BadRequestException('One or more section ids are invalid');
    }
    await this.prisma.$transaction(async (tx) => {
      for (const item of dto.items) {
        await tx.websiteContentSection.update({
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
      action: 'websiteContent.section_reordered',
      module: 'websiteContent',
      entityType: 'WebsiteContentSection',
      entityId: null,
      newValue: {
        items: dto.items.map((i) => ({
          id: i.id,
          displayOrder: i.displayOrder,
        })),
        performedByUserId: user.userId,
      },
    });
    return { ok: true as const };
  }

  /** Visible sections for the public site (no internal gallery ids). */
  async getPublicWebsiteSectionPayload() {
    const rows = await this.prisma.websiteContentSection.findMany({
      where: { isVisible: true },
      orderBy: [{ page: 'asc' }, { displayOrder: 'asc' }, { key: 'asc' }],
      include: {
        primaryGalleryItem: { select: { imageUrl: true } },
        secondaryGalleryItem: { select: { imageUrl: true } },
      },
    });
    return rows.map((row) => ({
      key: row.key,
      page: row.page,
      sectionType: row.sectionType,
      title: row.title,
      subtitle: row.subtitle,
      body: row.body,
      eyebrow: row.eyebrow,
      ctaLabel: row.ctaLabel,
      ctaHref: row.ctaHref,
      secondaryCtaLabel: row.secondaryCtaLabel,
      secondaryCtaHref: row.secondaryCtaHref,
      primaryImageUrl: row.primaryGalleryItem?.imageUrl ?? null,
      secondaryImageUrl: row.secondaryGalleryItem?.imageUrl ?? null,
      content: row.content === null ? null : asRecord(row.content),
      displayOrder: row.displayOrder,
    }));
  }

  private async syncWebsiteGalleryUsages(row: {
    id: string;
    key: string;
    primaryGalleryItemId: string | null;
    secondaryGalleryItemId: string | null;
  }) {
    await this.prisma.mediaUsage.deleteMany({
      where: {
        usageType: GALLERY_USAGE.WEBSITE_SECTION,
        entityId: row.id,
      },
    });
    const creates: Prisma.MediaUsageCreateManyInput[] = [];
    if (row.primaryGalleryItemId) {
      creates.push({
        galleryItemId: row.primaryGalleryItemId,
        usageType: GALLERY_USAGE.WEBSITE_SECTION,
        entityType: 'WebsiteContentSection',
        entityId: row.id,
        sectionKey: row.key,
        isPrimary: true,
      });
    }
    if (row.secondaryGalleryItemId) {
      creates.push({
        galleryItemId: row.secondaryGalleryItemId,
        usageType: GALLERY_USAGE.WEBSITE_SECTION,
        entityType: 'WebsiteContentSection',
        entityId: row.id,
        sectionKey: row.key,
        isPrimary: false,
      });
    }
    if (creates.length > 0) {
      await this.prisma.mediaUsage.createMany({ data: creates });
    }
  }
}
