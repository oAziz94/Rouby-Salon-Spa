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
  entityType?: string | null;
  entityId?: string | null;
  branchId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';
  oldValue?: Prisma.InputJsonValue | null;
  newValue?: Prisma.InputJsonValue | null;
  ipAddress?: string | null;
};

type AuditSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

const SENSITIVE_KEY_RE =
  /(password|passwordHash|token|accessToken|refreshToken|inviteToken|resetToken|otp|secret|apiKey|authorization|cardNumber|cvv|pin)/i;
const MASKED_VALUE = '••••••';
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  private deriveEntityType(
    action: string,
    input?: string | null,
  ): string | null {
    if (input) return input;
    if (action.startsWith('booking')) return 'Booking';
    if (action.startsWith('queue')) return 'QueueEntry';
    if (action.startsWith('invoice')) return 'Invoice';
    if (action.startsWith('payment')) return 'Payment';
    if (action.startsWith('cashDrawer')) return 'CashDrawerSession';
    if (action.startsWith('dailyClosing')) return 'DailyClosing';
    if (action.startsWith('user')) return 'User';
    if (action.startsWith('branch')) return 'Branch';
    if (action.startsWith('service')) return 'Service';
    if (action.startsWith('package')) return 'Package';
    if (action.startsWith('addOn')) return 'AddOn';
    if (action.startsWith('settings')) return 'Settings';
    if (action.startsWith('slot')) return 'Slot';
    if (action.startsWith('whatsappTemplate')) return 'WhatsAppTemplate';
    if (action.startsWith('websiteContent')) return 'WebsiteContentSection';
    return null;
  }

  private deriveModule(action: string, module: string): string {
    if (module === 'billing' && action.startsWith('invoice')) return 'invoices';
    if (module === 'billing' && action.startsWith('payment')) return 'payments';
    if (action.startsWith('cashDrawer')) return 'cashDrawer';
    if (action.startsWith('dailyClosing')) return 'dailyClosing';
    return module;
  }

  private deriveSeverity(
    action: string,
    explicit?: AuditSeverity,
  ): AuditSeverity {
    if (explicit) return explicit;
    if (
      action.includes('deactivated') ||
      action.includes('reopened') ||
      action.includes('permission')
    ) {
      return 'CRITICAL';
    }
    if (
      action.startsWith('invoice.finalized') ||
      action.startsWith('payment.recorded') ||
      action.startsWith('cashDrawer.closed') ||
      action.startsWith('dailyClosing.closed') ||
      action.startsWith('user.role_changed') ||
      action.startsWith('user.branch_access_changed') ||
      action.startsWith('settings.')
    ) {
      return 'WARNING';
    }
    return 'INFO';
  }

  private maskSensitive(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.maskSensitive(item));
    }
    if (value && typeof value === 'object') {
      const next: Record<string, unknown> = {};
      for (const [key, raw] of Object.entries(
        value as Record<string, unknown>,
      )) {
        if (SENSITIVE_KEY_RE.test(key)) {
          next[key] = MASKED_VALUE;
        } else {
          next[key] = this.maskSensitive(raw);
        }
      }
      return next;
    }
    return value;
  }

  private safeJsonInput(value: Prisma.InputJsonValue | null | undefined) {
    if (value === undefined) return undefined;
    if (value === null) return Prisma.JsonNull;
    return this.maskSensitive(value) as Prisma.InputJsonValue;
  }

  private shortRef(value?: string | null): string | null {
    if (!value) return null;
    if (!UUID_RE.test(value)) return value;
    return `…${value.slice(-6).toUpperCase()}`;
  }

  private toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private asString(value: unknown): string | null {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return null;
  }

  private asNumber(value: unknown): number | null {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private diffChanges(previousValue: unknown, newValue: unknown) {
    const before = this.toRecord(previousValue);
    const after = this.toRecord(newValue);
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    return Array.from(keys)
      .map((field) => ({
        field,
        before: before[field] ?? null,
        after: after[field] ?? null,
      }))
      .filter(
        (row) => JSON.stringify(row.before) !== JSON.stringify(row.after),
      );
  }

  private makeSummary(log: {
    action: string;
    module: string;
    actorName: string;
    entityLabel: string | null;
    newValue: unknown;
    oldValue: unknown;
    branchName: string | null;
  }): string {
    const n = this.toRecord(log.newValue);
    const o = this.toRecord(log.oldValue);
    const targetName = this.asString(n.fullName) ?? log.entityLabel ?? 'user';
    const invoiceNumber =
      this.asString(n.invoiceNumber) ??
      this.shortRef(this.asString(n.invoiceId)) ??
      'record';
    const amount = this.asNumber(n.amount);
    const vatBefore = this.asNumber(o.vatRatePercent);
    const vatAfter = this.asNumber(n.vatRatePercent);
    const cashDiff = this.asNumber(n.cashDifference);
    if (log.action === 'user.created') {
      return `${log.actorName} created dashboard user ${targetName}.`;
    }
    if (log.action === 'user.role_changed') {
      return `${log.actorName} changed a user role.`;
    }
    if (log.action === 'user.branch_access_changed') {
      return `${log.actorName} updated branch access for a dashboard user.`;
    }
    if (log.action === 'queue.walk_in_booking_created') {
      return `${log.actorName} created a walk-in booking.`;
    }
    if (log.action === 'invoice.finalized_from_queue') {
      return `Invoice ${invoiceNumber} was finalized from queue visit.`;
    }
    if (log.action === 'payment.recorded_from_queue') {
      return `${log.actorName} recorded payment from queue${amount !== null ? ` (EGP ${amount})` : ''}.`;
    }
    if (
      log.action === 'settings.vat.updated' ||
      log.action === 'vat.settings.updated'
    ) {
      return `VAT settings were updated${vatBefore !== null && vatAfter !== null ? ` from ${vatBefore}% to ${vatAfter}%` : ''}.`;
    }
    if (log.action === 'cashDrawer.closed') {
      return `Cash drawer was closed${cashDiff !== null ? ` with EGP ${cashDiff} difference` : ''}.`;
    }
    if (log.action === 'dailyClosing.closed') {
      return `Daily closing was finalized${log.branchName ? ` for ${log.branchName}` : ''}.`;
    }
    return `${log.action} on ${log.module}`;
  }

  private normalizeForRead(
    row: {
      id: string;
      action: string;
      module: string;
      entityId: string | null;
      userId: string | null;
      oldValue: unknown;
      newValue: unknown;
      ipAddress: string | null;
      createdAt: Date;
      user?: { id: string; name: string | null; email: string } | null;
    },
    context: {
      branchNames: Map<string, string>;
      userNames: Map<string, string>;
      branchId: string | null;
      module: string;
      entityType: string | null;
      severity: AuditSeverity;
      entityLabel: string | null;
    },
  ) {
    const actorName =
      row.user?.name ??
      (row.userId ? context.userNames.get(row.userId) : null) ??
      'System';
    const actorEmail = row.user?.email ?? null;
    const branchName = context.branchId
      ? (context.branchNames.get(context.branchId) ?? null)
      : null;
    const maskedOld = this.maskSensitive(row.oldValue);
    const maskedNew = this.maskSensitive(row.newValue);
    const summary = this.makeSummary({
      action: row.action,
      module: context.module,
      actorName,
      entityLabel: context.entityLabel,
      newValue: maskedNew,
      oldValue: maskedOld,
      branchName,
    });
    return {
      id: row.id,
      action: row.action,
      module: context.module,
      entityType: context.entityType,
      entityId: row.entityId,
      entityLabel: context.entityLabel ?? this.shortRef(row.entityId),
      branch: context.branchId
        ? { id: context.branchId, name: branchName }
        : null,
      actor: {
        id: row.userId,
        name: actorName,
        email: actorEmail,
        isSystem: !row.userId,
      },
      severity: context.severity,
      summary,
      previousValue: maskedOld,
      newValue: maskedNew,
      metadata: null,
      ipAddress: row.ipAddress,
      userAgent: null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async log(input: AuditLogInput, tx?: AuditClient): Promise<void> {
    const client = tx ?? this.prisma;
    try {
      const normalizedModule = this.deriveModule(input.action, input.module);
      const metadata = this.toRecord(input.metadata);
      const mergedNewValue: Record<string, unknown> = {
        ...this.toRecord(input.newValue),
      };
      if (input.entityType) {
        mergedNewValue.entityType = input.entityType;
      }
      if (input.branchId) {
        mergedNewValue.branchId = input.branchId;
      }
      if (input.severity) {
        mergedNewValue.severity = input.severity;
      }
      if (Object.keys(metadata).length > 0) {
        mergedNewValue.metadata = metadata;
      }

      await client.auditLog.create({
        data: {
          userId: input.userId ?? null,
          action: input.action,
          module: normalizedModule,
          entityId: input.entityId ?? null,
          oldValue: this.safeJsonInput(input.oldValue),
          newValue:
            Object.keys(mergedNewValue).length > 0
              ? this.safeJsonInput(mergedNewValue as Prisma.InputJsonValue)
              : this.safeJsonInput(input.newValue),
          ipAddress: input.ipAddress ?? null,
        },
      });
    } catch (error) {
      // Audit trails should not break business operations in MVP.
      console.error('Failed to persist audit log entry', error);
    }
  }

  async list(query: AuditLogListQueryDto) {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.module ? { module: query.module } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
    };
    const and: Prisma.AuditLogWhereInput[] = [];
    if (query.search) {
      and.push({
        OR: [
          { action: { contains: query.search, mode: 'insensitive' } },
          { module: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }
    if (query.entityType) {
      and.push({
        OR: [
          {
            newValue: {
              path: ['entityType'],
              equals: query.entityType,
            },
          },
          {
            oldValue: {
              path: ['entityType'],
              equals: query.entityType,
            },
          },
        ],
      });
    }
    if (query.branchId) {
      and.push({
        OR: [
          {
            newValue: {
              path: ['branchId'],
              equals: query.branchId,
            },
          },
          {
            oldValue: {
              path: ['branchId'],
              equals: query.branchId,
            },
          },
        ],
      });
    }
    if (query.severity) {
      and.push({
        newValue: {
          path: ['severity'],
          equals: query.severity,
        },
      });
    }
    if (and.length > 0) {
      where.AND = and;
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

    const skip = (query.page - 1) * query.limit;
    const [totalItems, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
    ]);

    const branchIds = new Set<string>();
    const userIds = new Set<string>();
    const entityIdsByType = {
      invoice: new Set<string>(),
      booking: new Set<string>(),
      payment: new Set<string>(),
      client: new Set<string>(),
      user: new Set<string>(),
      dailyClosing: new Set<string>(),
      cashDrawer: new Set<string>(),
    };
    for (const row of rows) {
      if (row.userId) userIds.add(row.userId);
      const n = this.toRecord(row.newValue);
      const o = this.toRecord(row.oldValue);
      const branchId =
        (typeof n.branchId === 'string' ? n.branchId : null) ??
        (typeof o.branchId === 'string' ? o.branchId : null);
      if (branchId) branchIds.add(branchId);
      const module = this.deriveModule(row.action, row.module);
      if (row.entityId) {
        if (module === 'invoices') entityIdsByType.invoice.add(row.entityId);
        if (module === 'bookings') entityIdsByType.booking.add(row.entityId);
        if (module === 'payments') entityIdsByType.payment.add(row.entityId);
        if (module === 'clients') entityIdsByType.client.add(row.entityId);
        if (module === 'users') entityIdsByType.user.add(row.entityId);
        if (module === 'dailyClosing')
          entityIdsByType.dailyClosing.add(row.entityId);
        if (module === 'cashDrawer')
          entityIdsByType.cashDrawer.add(row.entityId);
      }
    }
    const [branches, users, invoices, clients] = await Promise.all([
      branchIds.size
        ? this.prisma.branch.findMany({
            where: { id: { in: Array.from(branchIds) } },
            select: { id: true, name: true },
          })
        : [],
      userIds.size
        ? this.prisma.user.findMany({
            where: { id: { in: Array.from(userIds) } },
            select: { id: true, name: true },
          })
        : [],
      entityIdsByType.invoice.size
        ? this.prisma.invoice.findMany({
            where: { id: { in: Array.from(entityIdsByType.invoice) } },
            select: { id: true, invoiceNumber: true },
          })
        : [],
      entityIdsByType.client.size
        ? this.prisma.client.findMany({
            where: { id: { in: Array.from(entityIdsByType.client) } },
            select: { id: true, fullName: true },
          })
        : [],
    ]);
    const branchNames = new Map(branches.map((b) => [b.id, b.name]));
    const userNames = new Map(users.map((u) => [u.id, u.name]));
    const invoiceLabels = new Map(invoices.map((i) => [i.id, i.invoiceNumber]));
    const clientLabels = new Map(clients.map((c) => [c.id, c.fullName]));

    return {
      data: rows.map((row) => {
        const n = this.toRecord(row.newValue);
        const o = this.toRecord(row.oldValue);
        const module = this.deriveModule(row.action, row.module);
        const entityType = this.deriveEntityType(
          row.action,
          (typeof n.entityType === 'string' ? n.entityType : null) ??
            (typeof o.entityType === 'string' ? o.entityType : null),
        );
        const branchId =
          (typeof n.branchId === 'string' ? n.branchId : null) ??
          (typeof o.branchId === 'string' ? o.branchId : null);
        const severity = this.deriveSeverity(
          row.action,
          typeof n.severity === 'string' &&
            ['INFO', 'WARNING', 'CRITICAL'].includes(n.severity)
            ? (n.severity as AuditSeverity)
            : undefined,
        );
        let entityLabel: string | null = null;
        if (row.entityId && module === 'invoices')
          entityLabel = invoiceLabels.get(row.entityId) ?? null;
        if (row.entityId && module === 'clients')
          entityLabel = clientLabels.get(row.entityId) ?? null;
        return this.normalizeForRead(row, {
          branchNames,
          userNames,
          branchId,
          entityType,
          severity,
          entityLabel,
          module,
        });
      }),
      meta: buildListMeta({
        page: query.page,
        pageSize: query.limit,
        totalItems,
      }),
    };
  }

  async getById(id: string) {
    const row = await this.prisma.auditLog.findUnique({
      where: { id },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    if (!row) return null;
    const n = this.toRecord(row.newValue);
    const o = this.toRecord(row.oldValue);
    const branchId =
      (typeof n.branchId === 'string' ? n.branchId : null) ??
      (typeof o.branchId === 'string' ? o.branchId : null);
    const [branch, actorUser] = await Promise.all([
      branchId
        ? this.prisma.branch.findUnique({
            where: { id: branchId },
            select: { id: true, name: true },
          })
        : null,
      row.userId
        ? this.prisma.user.findUnique({
            where: { id: row.userId },
            select: { id: true, name: true, email: true },
          })
        : null,
    ]);
    const module = this.deriveModule(row.action, row.module);
    const entityType = this.deriveEntityType(
      row.action,
      (typeof n.entityType === 'string' ? n.entityType : null) ??
        (typeof o.entityType === 'string' ? o.entityType : null),
    );
    const severity = this.deriveSeverity(
      row.action,
      typeof n.severity === 'string' &&
        ['INFO', 'WARNING', 'CRITICAL'].includes(n.severity)
        ? (n.severity as AuditSeverity)
        : undefined,
    );
    const normalized = this.normalizeForRead(row, {
      branchNames: new Map(branch ? [[branch.id, branch.name]] : []),
      userNames: new Map(actorUser ? [[actorUser.id, actorUser.name]] : []),
      branchId,
      entityType,
      severity,
      entityLabel: null,
      module,
    });
    const changes = this.diffChanges(
      normalized.previousValue,
      normalized.newValue,
    );
    return {
      ...normalized,
      changes,
      technical: {
        auditLogId: row.id,
        entityId: row.entityId,
        userId: row.userId,
        branchId,
      },
    };
  }

  async getFacets() {
    const [modules, actions, users, branches] = await Promise.all([
      this.prisma.auditLog.findMany({
        distinct: ['module'],
        select: { module: true },
        orderBy: { module: 'asc' },
      }),
      this.prisma.auditLog.findMany({
        distinct: ['action'],
        select: { action: true },
        orderBy: { action: 'asc' },
      }),
      this.prisma.user.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true, email: true },
      }),
      this.prisma.branch.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
    ]);
    return {
      modules: modules.map((m) => m.module).filter(Boolean),
      actions: actions.map((a) => a.action).filter(Boolean),
      users,
      branches,
      severities: ['INFO', 'WARNING', 'CRITICAL'] as AuditSeverity[],
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
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }
}
