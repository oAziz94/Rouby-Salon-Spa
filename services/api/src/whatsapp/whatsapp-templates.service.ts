import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type WhatsAppTemplate } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { normalizeWhatsappDigits } from './wa-me-link';
import { substituteWhatsappTemplate } from './substitute-whatsapp-template';
import {
  WHATSAPP_TEMPLATE_DEFAULT_SAMPLE_DATA,
  WHATSAPP_TEMPLATE_DEFAULT_SAMPLE_DATA_AR,
  extractWhatsappTemplatePlaceholderKeys,
  findUnclosedBraceIssues,
  isKnownWhatsappTemplateVariable,
} from './whatsapp-template-variables';

type ListQuery = {
  search?: string;
  category?: string;
  language?: 'ar' | 'en' | 'all';
  isActive?: 'all' | 'true' | 'false';
  page?: number;
  limit?: number;
};

function asStringRecord(
  value: Prisma.JsonValue | null | undefined,
): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string') {
      out[k] = v;
    }
  }
  return out;
}

@Injectable()
export class WhatsappTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private async resolveWhatsappConfigured(): Promise<boolean> {
    const envDigits = normalizeWhatsappDigits(
      this.config.get<string>('WHATSAPP_DEFAULT_NUMBER') ?? '',
    );
    if (envDigits.length >= 8) {
      return true;
    }
    const settings = await this.prisma.systemSettings.findFirst({
      select: { whatsappNumber: true },
    });
    const salonDigits = normalizeWhatsappDigits(settings?.whatsappNumber ?? '');
    if (salonDigits.length >= 8) {
      return true;
    }
    const branch = await this.prisma.branch.findFirst({
      where: { whatsapp: { not: '' } },
      select: { id: true },
    });
    return Boolean(branch);
  }

  private mapRow(
    r: WhatsAppTemplate & {
      createdBy?: { name: string } | null;
      updatedBy?: { name: string } | null;
    },
  ) {
    return {
      id: r.id,
      name: r.name,
      templateKey: r.templateKey,
      body: r.content,
      category: r.category,
      language: r.language,
      description: r.description,
      sampleData: r.sampleData,
      variables: r.variables,
      isActive: r.isActive,
      metaTemplateName: r.metaTemplateName,
      metaTemplateStatus: r.metaTemplateStatus,
      requiresMetaApproval: r.requiresMetaApproval,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      createdBy: r.createdBy ? { name: r.createdBy.name } : null,
      updatedBy: r.updatedBy ? { name: r.updatedBy.name } : null,
    };
  }

  private buildWhere(query: ListQuery): Prisma.WhatsAppTemplateWhereInput {
    const and: Prisma.WhatsAppTemplateWhereInput[] = [];
    if (query.search?.trim()) {
      const s = query.search.trim();
      and.push({
        OR: [
          { name: { contains: s, mode: 'insensitive' } },
          { content: { contains: s, mode: 'insensitive' } },
          { templateKey: { contains: s, mode: 'insensitive' } },
          { description: { contains: s, mode: 'insensitive' } },
        ],
      });
    }
    if (query.category?.trim()) {
      and.push({ category: query.category.trim() });
    }
    if (query.language && query.language !== 'all') {
      and.push({ language: query.language });
    }
    if (query.isActive === 'true') {
      and.push({ isActive: true });
    } else if (query.isActive === 'false') {
      and.push({ isActive: false });
    }
    return and.length > 0 ? { AND: and } : {};
  }

  async list(query: ListQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;
    const where = this.buildWhere(query);

    const [
      rows,
      total,
      statsTotal,
      statsActive,
      statsArabic,
      statsInactive,
      whatsappConfigured,
    ] = await Promise.all([
      this.prisma.whatsAppTemplate.findMany({
        where,
        orderBy: [{ category: 'asc' }, { templateKey: 'asc' }],
        skip,
        take: limit,
        include: {
          updatedBy: { select: { name: true } },
          createdBy: { select: { name: true } },
        },
      }),
      this.prisma.whatsAppTemplate.count({ where }),
      this.prisma.whatsAppTemplate.count(),
      this.prisma.whatsAppTemplate.count({ where: { isActive: true } }),
      this.prisma.whatsAppTemplate.count({ where: { language: 'ar' } }),
      this.prisma.whatsAppTemplate.count({ where: { isActive: false } }),
      this.resolveWhatsappConfigured(),
    ]);

    return {
      data: rows.map((r) => this.mapRow(r)),
      meta: {
        page,
        limit,
        total,
        stats: {
          total: statsTotal,
          active: statsActive,
          arabic: statsArabic,
          inactive: statsInactive,
        },
        whatsappConfigured,
      },
    };
  }

  async getById(id: string) {
    const row = await this.prisma.whatsAppTemplate.findUnique({
      where: { id },
      include: {
        updatedBy: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
    });
    if (!row) {
      throw new NotFoundException('Template not found');
    }
    return this.mapRow(row);
  }

  mergeSampleData(
    row: Pick<WhatsAppTemplate, 'content' | 'sampleData' | 'language'>,
    override?: Record<string, string>,
  ): Record<string, string> {
    const base =
      row.language === 'ar'
        ? WHATSAPP_TEMPLATE_DEFAULT_SAMPLE_DATA_AR
        : WHATSAPP_TEMPLATE_DEFAULT_SAMPLE_DATA;
    return {
      ...base,
      ...asStringRecord(row.sampleData),
      ...(override ?? {}),
    };
  }

  buildPreviewResult(body: string, sample: Record<string, string>) {
    const previewText = substituteWhatsappTemplate(body, sample);
    const usedKeys = extractWhatsappTemplatePlaceholderKeys(body);
    const unknownVariables = usedKeys.filter(
      (k) => !isKnownWhatsappTemplateVariable(k),
    );
    const warnings: string[] = [];
    if (unknownVariables.length > 0) {
      warnings.push(
        `Unknown variables (not in built-in library): ${unknownVariables.join(', ')}`,
      );
    }
    warnings.push(...findUnclosedBraceIssues(body));
    return { previewText, unknownVariables, warnings };
  }

  async preview(
    id: string,
    sampleOverride?: Record<string, string>,
  ): Promise<{
    previewText: string;
    unknownVariables: string[];
    warnings: string[];
  }> {
    const row = await this.prisma.whatsAppTemplate.findUnique({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException('Template not found');
    }
    const sample = this.mergeSampleData(row, sampleOverride);
    return this.buildPreviewResult(row.content, sample);
  }

  async create(
    dto: {
      name: string;
      templateKey: string;
      body: string;
      category: string;
      language: 'ar' | 'en';
      description?: string | null;
      sampleData?: Record<string, string>;
      variables?: string[];
      isActive?: boolean;
      metaTemplateName?: string | null;
      metaTemplateStatus?: string | null;
      requiresMetaApproval?: boolean;
    },
    userId: string,
  ) {
    const templateKey = dto.templateKey.trim();
    const variablesJson: Prisma.InputJsonValue =
      dto.variables !== undefined ? dto.variables : [];
    const sampleJson: Prisma.InputJsonValue | undefined =
      dto.sampleData !== undefined ? dto.sampleData : undefined;

    if (dto.isActive !== false) {
      this.assertActivatable(dto.body);
    }

    try {
      const created = await this.prisma.whatsAppTemplate.create({
        data: {
          name: dto.name.trim(),
          templateKey,
          content: dto.body,
          category: dto.category,
          language: dto.language,
          description: dto.description?.trim() || null,
          ...(sampleJson !== undefined ? { sampleData: sampleJson } : {}),
          variables: variablesJson,
          isActive: dto.isActive ?? true,
          metaTemplateName: dto.metaTemplateName?.trim() || null,
          metaTemplateStatus: dto.metaTemplateStatus?.trim() || null,
          requiresMetaApproval: dto.requiresMetaApproval ?? false,
          createdBy: { connect: { id: userId } },
          updatedBy: { connect: { id: userId } },
        },
        include: {
          updatedBy: { select: { name: true } },
          createdBy: { select: { name: true } },
        },
      });
      await this.audit.log({
        userId,
        action: 'whatsappTemplate.created',
        module: 'whatsapp',
        entityType: 'WhatsAppTemplate',
        entityId: created.id,
        newValue: {
          templateKey: created.templateKey,
          name: created.name,
          category: created.category,
          language: created.language,
        },
      });
      return this.mapRow(created);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(
          'A template with this templateKey already exists',
        );
      }
      throw e;
    }
  }

  private assertActivatable(body: string) {
    if (!body || body.trim().length === 0) {
      throw new BadRequestException(
        'Cannot activate a template with an empty body',
      );
    }
  }

  async patch(
    id: string,
    dto: {
      name?: string;
      body?: string;
      category?: string;
      language?: 'ar' | 'en';
      description?: string | null;
      sampleData?: Record<string, string> | null;
      variables?: string[];
      isActive?: boolean;
      metaTemplateName?: string | null;
      metaTemplateStatus?: string | null;
      requiresMetaApproval?: boolean;
    },
    userId: string,
  ) {
    const existing = await this.prisma.whatsAppTemplate.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Template not found');
    }

    const nextBody = dto.body !== undefined ? dto.body : existing.content;
    const nextActive =
      dto.isActive !== undefined ? dto.isActive : existing.isActive;

    if (nextActive) {
      this.assertActivatable(nextBody);
    }

    const data: Prisma.WhatsAppTemplateUpdateInput = {};
    const changedKeys: string[] = [];

    if (dto.name !== undefined) {
      data.name = dto.name.trim();
      changedKeys.push('name');
    }
    if (dto.body !== undefined) {
      data.content = dto.body;
      changedKeys.push('body');
    }
    if (dto.category !== undefined) {
      data.category = dto.category;
      changedKeys.push('category');
    }
    if (dto.language !== undefined) {
      data.language = dto.language;
      changedKeys.push('language');
    }
    if (dto.description !== undefined) {
      data.description = dto.description?.trim() || null;
      changedKeys.push('description');
    }
    if (dto.sampleData !== undefined) {
      data.sampleData =
        dto.sampleData === null ? Prisma.DbNull : dto.sampleData;
      changedKeys.push('sampleData');
    }
    if (dto.variables !== undefined) {
      data.variables = dto.variables;
      changedKeys.push('variables');
    }
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
      changedKeys.push('isActive');
    }
    if (dto.metaTemplateName !== undefined) {
      data.metaTemplateName = dto.metaTemplateName?.trim() || null;
      changedKeys.push('metaTemplateName');
    }
    if (dto.metaTemplateStatus !== undefined) {
      data.metaTemplateStatus = dto.metaTemplateStatus?.trim() || null;
      changedKeys.push('metaTemplateStatus');
    }
    if (dto.requiresMetaApproval !== undefined) {
      data.requiresMetaApproval = dto.requiresMetaApproval;
      changedKeys.push('requiresMetaApproval');
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No fields to update');
    }

    data.updatedBy = { connect: { id: userId } };

    const updated = await this.prisma.whatsAppTemplate.update({
      where: { id },
      data,
      include: {
        updatedBy: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
    });

    await this.audit.log({
      userId,
      action: 'whatsappTemplate.updated',
      module: 'whatsapp',
      entityType: 'WhatsAppTemplate',
      entityId: id,
      oldValue: {
        templateKey: existing.templateKey,
        changedKeys,
        isActiveBefore: existing.isActive,
      },
      newValue: {
        templateKey: updated.templateKey,
        changedKeys,
        isActiveAfter: updated.isActive,
      },
      metadata: { templateName: updated.name },
    });

    return this.mapRow(updated);
  }

  async activate(id: string, userId: string) {
    const existing = await this.prisma.whatsAppTemplate.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Template not found');
    }
    this.assertActivatable(existing.content);
    const updated = await this.prisma.whatsAppTemplate.update({
      where: { id },
      data: { isActive: true, updatedBy: { connect: { id: userId } } },
      include: {
        updatedBy: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
    });
    await this.audit.log({
      userId,
      action: 'whatsappTemplate.activated',
      module: 'whatsapp',
      entityType: 'WhatsAppTemplate',
      entityId: id,
      newValue: { templateKey: updated.templateKey, name: updated.name },
    });
    return this.mapRow(updated);
  }

  async deactivate(id: string, userId: string) {
    const existing = await this.prisma.whatsAppTemplate.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Template not found');
    }
    const updated = await this.prisma.whatsAppTemplate.update({
      where: { id },
      data: { isActive: false, updatedBy: { connect: { id: userId } } },
      include: {
        updatedBy: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
    });
    await this.audit.log({
      userId,
      action: 'whatsappTemplate.deactivated',
      module: 'whatsapp',
      entityType: 'WhatsAppTemplate',
      entityId: id,
      newValue: { templateKey: updated.templateKey, name: updated.name },
    });
    return this.mapRow(updated);
  }
}
