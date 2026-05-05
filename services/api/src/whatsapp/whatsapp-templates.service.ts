import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WhatsappTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const rows = await this.prisma.whatsAppTemplate.findMany({
      orderBy: { templateKey: 'asc' },
    });
    return { data: rows.map((r) => this.mapRow(r)) };
  }

  async create(dto: {
    name: string;
    templateKey: string;
    content: string;
    variables?: string[];
    isActive?: boolean;
  }) {
    const templateKey = dto.templateKey.trim();
    const variablesJson: Prisma.InputJsonValue =
      dto.variables !== undefined ? dto.variables : [];
    try {
      const created = await this.prisma.whatsAppTemplate.create({
        data: {
          name: dto.name.trim(),
          templateKey,
          content: dto.content,
          variables: variablesJson,
          isActive: dto.isActive ?? true,
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

  async patch(
    id: string,
    dto: {
      name?: string;
      content?: string;
      variables?: string[];
      isActive?: boolean;
    },
  ) {
    const existing = await this.prisma.whatsAppTemplate.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Template not found');
    }
    const data: Prisma.WhatsAppTemplateUpdateInput = {};
    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }
    if (dto.content !== undefined) {
      data.content = dto.content;
    }
    if (dto.variables !== undefined) {
      data.variables = dto.variables;
    }
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No fields to update');
    }
    const updated = await this.prisma.whatsAppTemplate.update({
      where: { id },
      data,
    });
    return this.mapRow(updated);
  }

  private mapRow(r: {
    id: string;
    name: string;
    templateKey: string;
    content: string;
    variables: Prisma.JsonValue;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: r.id,
      name: r.name,
      templateKey: r.templateKey,
      content: r.content,
      variables: r.variables,
      isActive: r.isActive,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}
