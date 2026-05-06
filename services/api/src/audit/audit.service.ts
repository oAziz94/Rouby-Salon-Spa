import { Injectable } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import { buildListMeta } from '../catalog/catalog.utils';
import { PrismaService } from '../prisma/prisma.service';
import type { AuditLogListQueryDto } from './dto/audit-log-list-query.dto';

type AuditClient = PrismaService | Prisma.TransactionClient | PrismaClient;

type AuditLogInput = {
  userId?: string | null;
  action: string;
  module: string;
  entityId?: string | null;
  oldValue?: Prisma.InputJsonValue | null;
  newValue?: Prisma.InputJsonValue | null;
  ipAddress?: string | null;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: AuditLogInput, tx?: AuditClient): Promise<void> {
    const client = tx ?? this.prisma;
    await client.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        module: input.module,
        entityId: input.entityId ?? null,
        oldValue:
          input.oldValue === undefined
            ? undefined
            : input.oldValue === null
              ? Prisma.JsonNull
              : input.oldValue,
        newValue:
          input.newValue === undefined
            ? undefined
            : input.newValue === null
              ? Prisma.JsonNull
              : input.newValue,
        ipAddress: input.ipAddress ?? null,
      },
    });
  }

  async list(query: AuditLogListQueryDto) {
    const where: Prisma.AuditLogWhereInput = {};
    if (query.module) {
      where.module = query.module;
    }
    if (query.action) {
      where.action = query.action;
    }
    if (query.userId) {
      where.userId = query.userId;
    }
    if (query.entityId) {
      where.entityId = query.entityId;
    }
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) {
        where.createdAt.gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        where.createdAt.lte = new Date(query.dateTo);
      }
    }

    const skip = (query.page - 1) * query.pageSize;
    const [totalItems, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: query.pageSize,
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

  async listRecent(limit: number) {
    return this.prisma.auditLog.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userId: true,
        action: true,
        module: true,
        entityId: true,
        createdAt: true,
      },
    });
  }
}
