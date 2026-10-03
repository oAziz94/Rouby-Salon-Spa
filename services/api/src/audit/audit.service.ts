import { Injectable } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import {
  canAccessAllBranches,
  getEffectiveAllowedBranchIds,
} from '../billing/dashboard-branch-scope';
import { buildListMeta } from '../catalog/catalog.utils';
import {
  extractBookingIdSearchCompact,
  formatBookingReference,
} from '../common/booking-reference.util';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildChanges,
  buildSummary,
  categoryActionConditions,
  categoryFor,
  CRITICAL_ACTION_PREFIXES,
  deriveSeverity,
  extractReason,
  formatSlotWhen,
  isOverrideAction,
  parseAuditDateBound,
  titleFor,
  toRec,
  WARNING_ACTION_PREFIXES,
  type AuditSeverity,
  type NameLookup,
} from './audit-presenter';
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
  severity?: AuditSeverity;
  oldValue?: Prisma.InputJsonValue | null;
  newValue?: Prisma.InputJsonValue | null;
  ipAddress?: string | null;
};

type AuditRow = {
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
};

const SENSITIVE_KEY_RE =
  /(password|passwordHash|token|accessToken|refreshToken|inviteToken|resetToken|otp|secret|apiKey|authorization|cardNumber|cvv|pin)/i;
const MASKED_VALUE = '••••••';
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Max ids resolved from a search term, per kind (people, invoices, bookings). */
const SEARCH_ID_CAP = 50;
/** Max bookings pulled in for a `clientId` / `bookingId` filter. */
const ENTITY_FILTER_BOOKING_CAP = 200;
/** Max audit rows matched through references before the date filter and paging apply. */
const REF_MATCH_ROW_CAP = 5000;
/** JSON keys inside `newValue` that point at something the entry is about. */
const REFERENCE_JSON_KEYS = [
  'bookingId',
  'invoiceId',
  'paymentId',
  'queueEntryId',
  'clientId',
  'staffProfileId',
  'targetUserId',
];

type Links = {
  bookingId: string | null;
  clientId: string | null;
  invoiceId: string | null;
};

/** Everything looked up (in batch) for a page of audit rows. */
type Resolved = {
  users: Map<string, string>;
  staff: Map<string, string>;
  items: Map<string, string>;
  services: Map<string, string>;
  roles: Map<string, string>;
  branches: Map<string, string>;
  clients: Map<string, string>;
  bookings: Map<string, { clientId: string; slotWhen: string | null }>;
  invoices: Map<
    string,
    { number: string; bookingId: string; clientId: string }
  >;
  invoiceByBooking: Map<string, string>;
  payments: Map<string, { bookingId: string; clientId: string }>;
  queue: Map<
    string,
    { bookingId: string | null; clientId: string | null; clientName: string }
  >;
};

type RowIds = {
  bookingId: string | null;
  invoiceId: string | null;
  paymentId: string | null;
  queueId: string | null;
  clientId: string | null;
  staffId: string | null;
  itemId: string | null;
  targetUserId: string | null;
  serviceId: string | null;
  roleIds: string[];
  branchIds: string[];
};

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
    return toRec(value);
  }

  private str(value: unknown): string | null {
    return typeof value === 'string' && value ? value : null;
  }

  private explicitSeverity(newValue: unknown): AuditSeverity | undefined {
    const raw = this.toRecord(newValue).severity;
    return raw === 'INFO' || raw === 'WARNING' || raw === 'CRITICAL'
      ? raw
      : undefined;
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

  /**
   * Branch-restricted viewers only see entries stamped with one of their branches. Entries
   * without a branch (settings, users, catalog) are owner/admin material and stay hidden.
   */
  private branchScopeWhere(
    viewer: DashboardJwtUser | undefined,
  ): Prisma.AuditLogWhereInput[] {
    if (!viewer || canAccessAllBranches(viewer)) return [];
    const allowed = getEffectiveAllowedBranchIds(viewer);
    if (!allowed.length) return [{ id: { in: [] } }];
    return [
      {
        OR: allowed.flatMap((branchId) => [
          { newValue: { path: ['branchId'], equals: branchId } },
          { oldValue: { path: ['branchId'], equals: branchId } },
        ]),
      },
    ];
  }

  // -------------------------------------------------------------------------
  // Search and entity filters
  // -------------------------------------------------------------------------

  /** Audit row ids whose entity id or JSON references (`bookingId`, `invoiceId`…) hit `refs`. */
  private async auditIdsForRefs(refs: string[]): Promise<string[]> {
    const unique = Array.from(new Set(refs.filter(Boolean)));
    if (!unique.length) return [];
    const jsonMatches = REFERENCE_JSON_KEYS.map(
      (key) =>
        Prisma.sql`${Prisma.raw(`new_value->>'${key}'`)} = ANY(${unique}::text[])`,
    );
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id::text AS id
      FROM audit_logs
      WHERE entity_id = ANY(${unique}::text[])
         OR ${Prisma.join(jsonMatches, ' OR ')}
      ORDER BY created_at DESC
      LIMIT ${REF_MATCH_ROW_CAP}
    `);
    return rows.map((r) => r.id);
  }

  /** A booking's own id plus the ids of its invoices, payments, visits and change requests. */
  private async expandBookingRefs(bookingIds: string[]): Promise<string[]> {
    if (!bookingIds.length) return [];
    const where = { bookingId: { in: bookingIds } };
    const [invoices, payments, queue, requests] = await Promise.all([
      this.prisma.invoice.findMany({ where, select: { id: true } }),
      this.prisma.payment.findMany({ where, select: { id: true } }),
      this.prisma.queueEntry.findMany({ where, select: { id: true } }),
      this.prisma.bookingChangeRequest.findMany({
        where,
        select: { id: true },
      }),
    ]);
    return [
      ...bookingIds,
      ...invoices.map((r) => r.id),
      ...payments.map((r) => r.id),
      ...queue.map((r) => r.id),
      ...requests.map((r) => r.id),
    ];
  }

  private async expandClientRefs(
    clientIds: string[],
    bookingCap: number,
  ): Promise<string[]> {
    if (!clientIds.length) return [];
    const bookings = await this.prisma.booking.findMany({
      where: { clientId: { in: clientIds } },
      orderBy: { createdAt: 'desc' },
      take: bookingCap,
      select: { id: true },
    });
    const expanded = await this.expandBookingRefs(bookings.map((b) => b.id));
    return [...clientIds, ...expanded];
  }

  /**
   * Turns a typed term into ids first (people, clients, invoices, bookings), then the list is
   * filtered by those ids. Limits: each id list is capped, only a client's newest bookings are
   * followed, and at most REF_MATCH_ROW_CAP of the newest matching entries are considered.
   */
  private async searchConditions(
    term: string,
  ): Promise<Prisma.AuditLogWhereInput> {
    const t = term.trim().slice(0, 100);
    const underscored = t.replace(/\s+/g, '_');
    const digits = t.replace(/\D/g, '');
    const phoneNeedles = Array.from(
      new Set(
        [digits, digits.replace(/^0+/, ''), digits.replace(/^20/, '')].filter(
          (d) => d.length >= 3,
        ),
      ),
    );
    const bookingRefLike = /^rb[-\s]?/i.test(t) || /^[0-9a-f-]{6,36}$/i.test(t);
    const compactRef = bookingRefLike ? extractBookingIdSearchCompact(t) : null;

    const [users, staff, clients, invoices, bookingsByRef] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          OR: [
            { name: { contains: t, mode: 'insensitive' } },
            { email: { contains: t, mode: 'insensitive' } },
          ],
        },
        take: SEARCH_ID_CAP,
        select: { id: true },
      }),
      this.prisma.staffProfile.findMany({
        where: { displayName: { contains: t, mode: 'insensitive' } },
        take: SEARCH_ID_CAP,
        select: { id: true, userId: true },
      }),
      this.prisma.client.findMany({
        where: {
          OR: [
            { fullName: { contains: t, mode: 'insensitive' } },
            { email: { contains: t, mode: 'insensitive' } },
            ...phoneNeedles.map((p) => ({ phone: { contains: p } })),
          ],
        },
        take: SEARCH_ID_CAP,
        select: { id: true },
      }),
      this.prisma.invoice.findMany({
        where: { invoiceNumber: { contains: t, mode: 'insensitive' } },
        take: SEARCH_ID_CAP,
        select: { id: true, bookingId: true },
      }),
      compactRef
        ? this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            SELECT id::text AS id
            FROM bookings
            WHERE replace(id::text, '-', '') LIKE ${`%${compactRef}%`}
            LIMIT ${SEARCH_ID_CAP}
          `)
        : Promise.resolve([] as Array<{ id: string }>),
    ]);

    const actorIds = Array.from(
      new Set([...users.map((u) => u.id), ...staff.map((s) => s.userId)]),
    );
    const bookingIds = Array.from(
      new Set([
        ...invoices.map((i) => i.bookingId),
        ...bookingsByRef.map((b) => b.id),
      ]),
    );
    const [clientRefs, bookingRefs] = await Promise.all([
      this.expandClientRefs(
        clients.map((c) => c.id),
        SEARCH_ID_CAP,
      ),
      this.expandBookingRefs(bookingIds),
    ]);
    const refs = [
      ...users.map((u) => u.id),
      ...staff.map((s) => s.id),
      ...invoices.map((i) => i.id),
      ...clientRefs,
      ...bookingRefs,
    ];
    const matchedIds = await this.auditIdsForRefs(refs);

    const or: Prisma.AuditLogWhereInput[] = [
      { action: { contains: t, mode: 'insensitive' } },
      { module: { contains: t, mode: 'insensitive' } },
    ];
    if (underscored !== t) {
      or.push({ action: { contains: underscored, mode: 'insensitive' } });
    }
    if (actorIds.length) or.push({ userId: { in: actorIds } });
    if (matchedIds.length) or.push({ id: { in: matchedIds } });
    return { OR: or };
  }

  private async bookingFilterConditions(
    bookingId: string,
  ): Promise<Prisma.AuditLogWhereInput> {
    const refs = await this.expandBookingRefs([bookingId]);
    const ids = await this.auditIdsForRefs(refs);
    return { id: { in: ids } };
  }

  private async clientFilterConditions(
    clientId: string,
  ): Promise<Prisma.AuditLogWhereInput> {
    const refs = await this.expandClientRefs(
      [clientId],
      ENTITY_FILTER_BOOKING_CAP,
    );
    const ids = await this.auditIdsForRefs(refs);
    return { id: { in: ids } };
  }

  private severityConditions(
    severity: AuditSeverity,
  ): Prisma.AuditLogWhereInput {
    const criticalActions = CRITICAL_ACTION_PREFIXES.map((p) => ({
      action: { startsWith: p },
    }));
    const warningActions = WARNING_ACTION_PREFIXES.map((p) => ({
      action: { startsWith: p },
    }));
    if (severity === 'CRITICAL') {
      return {
        OR: [
          { newValue: { path: ['severity'], equals: 'CRITICAL' } },
          ...criticalActions,
        ],
      };
    }
    if (severity === 'WARNING') {
      return {
        OR: [
          { newValue: { path: ['severity'], equals: 'WARNING' } },
          ...warningActions,
        ],
        NOT: criticalActions,
      };
    }
    // INFO: whatever is not a warning or critical by its action code. A stored severity on
    // an otherwise quiet action is not taken into account here.
    return { NOT: [...criticalActions, ...warningActions] };
  }

  private async buildWhere(
    query: AuditLogListQueryDto,
    viewer?: DashboardJwtUser,
  ): Promise<Prisma.AuditLogWhereInput> {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.module ? { module: query.module } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
    };
    const and: Prisma.AuditLogWhereInput[] = [...this.branchScopeWhere(viewer)];
    if (query.search?.trim()) {
      and.push(await this.searchConditions(query.search));
    }
    if (query.bookingId) {
      and.push(await this.bookingFilterConditions(query.bookingId));
    }
    if (query.clientId) {
      and.push(await this.clientFilterConditions(query.clientId));
    }
    if (query.category) {
      and.push(categoryActionConditions(query.category));
    }
    if (query.overridesOnly) {
      and.push(categoryActionConditions('overrides'));
    }
    if (query.entityType) {
      and.push({
        OR: [
          { newValue: { path: ['entityType'], equals: query.entityType } },
          { oldValue: { path: ['entityType'], equals: query.entityType } },
        ],
      });
    }
    if (query.branchId) {
      and.push({
        OR: [
          { newValue: { path: ['branchId'], equals: query.branchId } },
          { oldValue: { path: ['branchId'], equals: query.branchId } },
        ],
      });
    }
    if (query.severity) {
      and.push(this.severityConditions(query.severity));
    }
    if (and.length > 0) {
      where.AND = and;
    }
    const from = query.dateFrom
      ? parseAuditDateBound(query.dateFrom, 'from')
      : null;
    const to = query.dateTo ? parseAuditDateBound(query.dateTo, 'to') : null;
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };
    }
    return where;
  }

  // -------------------------------------------------------------------------
  // Name resolution (one batch per page)
  // -------------------------------------------------------------------------

  private rowIds(row: AuditRow): RowIds {
    const n = this.toRecord(row.newValue);
    const o = this.toRecord(row.oldValue);
    const a = row.action;
    const e = row.entityId && UUID_RE.test(row.entityId) ? row.entityId : null;
    const isChangeRequest = a.startsWith('booking_change_request.');
    const isInvoiceOverride = a.startsWith('override.invoice_');
    const entityIsBooking =
      !isChangeRequest &&
      !isInvoiceOverride &&
      (a.startsWith('booking.') || a.startsWith('override.'));
    const entityIsInvoice = a.startsWith('invoice.') || isInvoiceOverride;
    const entityIsPayment =
      a.startsWith('payment.') && !a.startsWith('payment.policy.');
    const entityIsQueue = a.startsWith('queue.') || a.startsWith('visit.');
    const entityIsClient = a.startsWith('loyalty.');
    const entityIsUser = a.startsWith('user.');
    const entityIsService =
      a.startsWith('service.') || a.startsWith('catalog.');
    const entityIsBranch =
      a.startsWith('branch.') ||
      a.startsWith('slots.') ||
      a === 'settings.slot_generation.updated';

    const arr = (v: unknown): string[] =>
      Array.isArray(v)
        ? v.filter((x): x is string => typeof x === 'string')
        : [];
    const branchIds = [
      this.str(n.branchId),
      this.str(o.branchId),
      this.str(n.defaultBranchId),
      this.str(n.newDefaultBranchId),
      this.str(o.previousDefaultBranchId),
      ...arr(n.branchIds),
      ...arr(n.newBranchIds),
      ...arr(o.previousBranchIds),
      entityIsBranch ? e : null,
    ].filter((x): x is string => Boolean(x));
    return {
      bookingId: (entityIsBooking ? e : null) ?? this.str(n.bookingId),
      invoiceId: (entityIsInvoice ? e : null) ?? this.str(n.invoiceId),
      paymentId: (entityIsPayment ? e : null) ?? this.str(n.paymentId),
      queueId: (entityIsQueue ? e : null) ?? this.str(n.queueEntryId),
      clientId: (entityIsClient ? e : null) ?? this.str(n.clientId),
      staffId: this.str(n.staffProfileId),
      itemId: this.str(n.bookingItemId),
      targetUserId:
        (entityIsUser ? e : null) ??
        this.str(n.targetUserId) ??
        this.str(o.targetUserId),
      serviceId: entityIsService ? e : null,
      roleIds: [this.str(n.roleId), this.str(o.roleId)].filter(
        (x): x is string => Boolean(x),
      ),
      branchIds,
    };
  }

  private async resolve(rows: AuditRow[]): Promise<Resolved> {
    const ids = {
      users: new Set<string>(),
      staff: new Set<string>(),
      items: new Set<string>(),
      services: new Set<string>(),
      roles: new Set<string>(),
      branches: new Set<string>(),
      clients: new Set<string>(),
      bookings: new Set<string>(),
      invoices: new Set<string>(),
      payments: new Set<string>(),
      queue: new Set<string>(),
    };
    for (const row of rows) {
      const r = this.rowIds(row);
      if (row.userId) ids.users.add(row.userId);
      if (r.targetUserId) ids.users.add(r.targetUserId);
      if (r.staffId) ids.staff.add(r.staffId);
      if (r.itemId) ids.items.add(r.itemId);
      if (r.serviceId) ids.services.add(r.serviceId);
      r.roleIds.forEach((id) => ids.roles.add(id));
      r.branchIds.forEach((id) => ids.branches.add(id));
      if (r.clientId) ids.clients.add(r.clientId);
      if (r.bookingId) ids.bookings.add(r.bookingId);
      if (r.invoiceId) ids.invoices.add(r.invoiceId);
      if (r.paymentId) ids.payments.add(r.paymentId);
      if (r.queueId) ids.queue.add(r.queueId);
    }
    const list = (s: Set<string>) => Array.from(s);
    const inIds = (s: Set<string>) => ({ id: { in: list(s) } });

    const [
      users,
      staff,
      items,
      services,
      roles,
      branches,
      invoices,
      payments,
      queue,
    ] = await Promise.all([
      ids.users.size
        ? this.prisma.user.findMany({
            where: inIds(ids.users),
            select: { id: true, name: true, email: true },
          })
        : [],
      ids.staff.size
        ? this.prisma.staffProfile.findMany({
            where: inIds(ids.staff),
            select: { id: true, displayName: true },
          })
        : [],
      ids.items.size
        ? this.prisma.bookingItem.findMany({
            where: inIds(ids.items),
            select: { id: true, nameSnapshot: true },
          })
        : [],
      ids.services.size
        ? this.prisma.service.findMany({
            where: inIds(ids.services),
            select: { id: true, name: true },
          })
        : [],
      ids.roles.size
        ? this.prisma.role.findMany({
            where: inIds(ids.roles),
            select: { id: true, name: true },
          })
        : [],
      ids.branches.size
        ? this.prisma.branch.findMany({
            where: inIds(ids.branches),
            select: { id: true, name: true },
          })
        : [],
      ids.invoices.size
        ? this.prisma.invoice.findMany({
            where: inIds(ids.invoices),
            select: {
              id: true,
              invoiceNumber: true,
              bookingId: true,
              clientId: true,
            },
          })
        : [],
      ids.payments.size
        ? this.prisma.payment.findMany({
            where: inIds(ids.payments),
            select: { id: true, bookingId: true, clientId: true },
          })
        : [],
      ids.queue.size
        ? this.prisma.queueEntry.findMany({
            where: inIds(ids.queue),
            select: {
              id: true,
              bookingId: true,
              clientId: true,
              clientNameSnapshot: true,
            },
          })
        : [],
    ]);

    // Second hop: bookings, clients and invoices reached through the first lookups.
    for (const i of invoices) {
      ids.bookings.add(i.bookingId);
      ids.clients.add(i.clientId);
    }
    for (const p of payments) {
      ids.bookings.add(p.bookingId);
      ids.clients.add(p.clientId);
    }
    for (const q of queue) {
      if (q.bookingId) ids.bookings.add(q.bookingId);
      if (q.clientId) ids.clients.add(q.clientId);
    }
    const [bookings, invoicesByBooking] = await Promise.all([
      ids.bookings.size
        ? this.prisma.booking.findMany({
            where: inIds(ids.bookings),
            select: {
              id: true,
              clientId: true,
              slot: { select: { date: true, startTime: true } },
            },
          })
        : [],
      ids.bookings.size
        ? this.prisma.invoice.findMany({
            where: { bookingId: { in: list(ids.bookings) } },
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              invoiceNumber: true,
              bookingId: true,
              clientId: true,
            },
          })
        : [],
    ]);
    for (const b of bookings) ids.clients.add(b.clientId);
    const clients = ids.clients.size
      ? await this.prisma.client.findMany({
          where: inIds(ids.clients),
          select: { id: true, fullName: true },
        })
      : [];

    const invoiceMap = new Map<
      string,
      { number: string; bookingId: string; clientId: string }
    >();
    for (const i of [...invoices, ...invoicesByBooking]) {
      invoiceMap.set(i.id, {
        number: i.invoiceNumber,
        bookingId: i.bookingId,
        clientId: i.clientId,
      });
    }
    const invoiceByBooking = new Map<string, string>();
    for (const i of invoicesByBooking) {
      if (!invoiceByBooking.has(i.bookingId)) {
        invoiceByBooking.set(i.bookingId, i.id);
      }
    }
    return {
      users: new Map(users.map((u) => [u.id, u.name ?? u.email])),
      staff: new Map(staff.map((s) => [s.id, s.displayName])),
      items: new Map(items.map((i) => [i.id, i.nameSnapshot])),
      services: new Map(services.map((s) => [s.id, s.name])),
      roles: new Map(roles.map((r) => [r.id, r.name])),
      branches: new Map(branches.map((b) => [b.id, b.name])),
      clients: new Map(clients.map((c) => [c.id, c.fullName])),
      bookings: new Map(
        bookings.map((b) => [
          b.id,
          {
            clientId: b.clientId,
            slotWhen: b.slot
              ? formatSlotWhen(b.slot.date, b.slot.startTime)
              : null,
          },
        ]),
      ),
      invoices: invoiceMap,
      invoiceByBooking,
      payments: new Map(
        payments.map((p) => [
          p.id,
          { bookingId: p.bookingId, clientId: p.clientId },
        ]),
      ),
      queue: new Map(
        queue.map((q) => [
          q.id,
          {
            bookingId: q.bookingId,
            clientId: q.clientId,
            clientName: q.clientNameSnapshot,
          },
        ]),
      ),
    };
  }

  private lookupFor(resolved: Resolved): NameLookup {
    return {
      booking: (id) => formatBookingReference(id),
      invoice: (id) => resolved.invoices.get(id)?.number ?? null,
      client: (id) => resolved.clients.get(id) ?? null,
      staff: (id) => resolved.staff.get(id) ?? null,
      user: (id) => resolved.users.get(id) ?? null,
      role: (id) => resolved.roles.get(id) ?? null,
      branch: (id) => resolved.branches.get(id) ?? null,
      queue: () => null,
    };
  }

  private linksFor(row: AuditRow, resolved: Resolved): Links {
    const r = this.rowIds(row);
    const invoice = r.invoiceId
      ? resolved.invoices.get(r.invoiceId)
      : undefined;
    const payment = r.paymentId
      ? resolved.payments.get(r.paymentId)
      : undefined;
    const queue = r.queueId ? resolved.queue.get(r.queueId) : undefined;
    const bookingId =
      r.bookingId ??
      invoice?.bookingId ??
      payment?.bookingId ??
      queue?.bookingId ??
      null;
    const booking = bookingId ? resolved.bookings.get(bookingId) : undefined;
    const clientId =
      r.clientId ??
      booking?.clientId ??
      invoice?.clientId ??
      payment?.clientId ??
      queue?.clientId ??
      null;
    const invoiceId =
      r.invoiceId ??
      (bookingId ? (resolved.invoiceByBooking.get(bookingId) ?? null) : null);
    return { bookingId, clientId, invoiceId };
  }

  private present(row: AuditRow, resolved: Resolved) {
    const n = this.toRecord(row.newValue);
    const o = this.toRecord(row.oldValue);
    const r = this.rowIds(row);
    const links = this.linksFor(row, resolved);
    const module = this.deriveModule(row.action, row.module);
    const entityType = this.deriveEntityType(
      row.action,
      this.str(n.entityType) ?? this.str(o.entityType),
    );
    const branchId = this.str(n.branchId) ?? this.str(o.branchId);
    const branchName = branchId
      ? (resolved.branches.get(branchId) ?? null)
      : null;
    const severity = deriveSeverity(row.action, this.explicitSeverity(n));
    const actorName =
      row.user?.name ??
      (row.userId ? resolved.users.get(row.userId) : null) ??
      row.user?.email ??
      'System';
    const maskedOld = this.maskSensitive(row.oldValue);
    const maskedNew = this.maskSensitive(row.newValue);

    const booking = links.bookingId
      ? resolved.bookings.get(links.bookingId)
      : undefined;
    const queue = r.queueId ? resolved.queue.get(r.queueId) : undefined;
    const client =
      (links.clientId ? resolved.clients.get(links.clientId) : null) ??
      queue?.clientName ??
      this.str(n.clientName) ??
      null;
    const invoiceNumber = links.invoiceId
      ? (resolved.invoices.get(links.invoiceId)?.number ??
        this.str(n.invoiceNumber))
      : this.str(n.invoiceNumber);
    const bookingRef = links.bookingId
      ? formatBookingReference(links.bookingId)
      : null;
    const entityName = r.serviceId
      ? (resolved.services.get(r.serviceId) ?? null)
      : null;
    const roleBefore = this.str(o.roleId)
      ? (resolved.roles.get(this.str(o.roleId) as string) ?? null)
      : null;
    const roleAfter = this.str(n.roleId)
      ? (resolved.roles.get(this.str(n.roleId) as string) ?? null)
      : null;
    const branchNames = (v: unknown) =>
      (Array.isArray(v) ? v : [])
        .map((id) =>
          typeof id === 'string' ? resolved.branches.get(id) : null,
        )
        .filter((x): x is string => Boolean(x));

    const summaryOld = maskedOld;
    const summaryNew = maskedNew;
    const summary = buildSummary(row.action, {
      actorName: row.userId ? actorName : null,
      client,
      bookingRef,
      bookingWhen: booking?.slotWhen ?? null,
      invoiceNumber,
      staffName: r.staffId ? (resolved.staff.get(r.staffId) ?? null) : null,
      serviceName: r.itemId
        ? (resolved.items.get(r.itemId) ?? null)
        : (entityName ?? null),
      targetUser: r.targetUserId
        ? (resolved.users.get(r.targetUserId) ?? null)
        : null,
      branchName,
      entityName,
      roleBefore,
      roleAfter,
      branchNamesBefore: branchNames(o.previousBranchIds),
      branchNamesAfter: branchNames(n.newBranchIds),
      oldValue: summaryOld,
      newValue: summaryNew,
    });

    let entityLabel: string | null = null;
    if (row.entityId) {
      if (module === 'invoices') {
        entityLabel = resolved.invoices.get(row.entityId)?.number ?? null;
      } else if (module === 'clients') {
        entityLabel = resolved.clients.get(row.entityId) ?? null;
      } else if (module === 'bookings' && links.bookingId === row.entityId) {
        entityLabel = bookingRef;
      } else if (module === 'users') {
        entityLabel = resolved.users.get(row.entityId) ?? null;
      }
    }

    return {
      id: row.id,
      action: row.action,
      module,
      entityType,
      entityId: row.entityId,
      entityLabel: entityLabel ?? this.shortRef(row.entityId),
      branch: branchId ? { id: branchId, name: branchName } : null,
      actor: {
        id: row.userId,
        name: actorName,
        email: row.user?.email ?? null,
        isSystem: !row.userId,
      },
      severity,
      title: titleFor(row.action),
      summary,
      category: categoryFor(row.action, module),
      isOverride: isOverrideAction(row.action),
      reason: extractReason(maskedNew, maskedOld),
      links,
      previousValue: maskedOld,
      newValue: maskedNew,
      metadata: null,
      ipAddress: row.ipAddress,
      userAgent: null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  // -------------------------------------------------------------------------
  // Read API
  // -------------------------------------------------------------------------

  async list(query: AuditLogListQueryDto, viewer?: DashboardJwtUser) {
    const where = await this.buildWhere(query, viewer);
    const skip = (query.page - 1) * query.limit;
    const [totalItems, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
    ]);
    const resolved = await this.resolve(rows);
    return {
      data: rows.map((row) => this.present(row, resolved)),
      meta: buildListMeta({
        page: query.page,
        pageSize: query.limit,
        totalItems,
      }),
    };
  }

  async getById(id: string, viewer?: DashboardJwtUser) {
    const row = await this.prisma.auditLog.findUnique({
      where: { id },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    if (!row) return null;
    const n = this.toRecord(row.newValue);
    const o = this.toRecord(row.oldValue);
    const branchId = this.str(n.branchId) ?? this.str(o.branchId);
    if (viewer && !canAccessAllBranches(viewer)) {
      const allowed = getEffectiveAllowedBranchIds(viewer);
      if (!branchId || !allowed.includes(branchId)) return null;
    }
    const resolved = await this.resolve([row]);
    const item = this.present(row, resolved);
    const changes = buildChanges(
      item.previousValue,
      item.newValue,
      this.lookupFor(resolved),
    );
    return {
      ...item,
      changes,
      technical: {
        auditLogId: row.id,
        action: row.action,
        entityId: row.entityId,
        userId: row.userId,
        branchId,
        bookingId: item.links.bookingId,
        clientId: item.links.clientId,
        invoiceId: item.links.invoiceId,
      },
    };
  }

  async getFacets(viewer?: DashboardJwtUser) {
    const scope = this.branchScopeWhere(viewer);
    const scopedWhere: Prisma.AuditLogWhereInput =
      scope.length > 0 ? { AND: scope } : {};
    const allowedBranchIds =
      viewer && !canAccessAllBranches(viewer)
        ? getEffectiveAllowedBranchIds(viewer)
        : null;
    const [modules, actions, users, branches] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: scopedWhere,
        distinct: ['module'],
        select: { module: true },
        orderBy: { module: 'asc' },
      }),
      this.prisma.auditLog.findMany({
        where: scopedWhere,
        distinct: ['action'],
        select: { action: true },
        orderBy: { action: 'asc' },
      }),
      this.prisma.user.findMany({
        where: allowedBranchIds
          ? {
              OR: [
                { branchId: { in: allowedBranchIds } },
                {
                  branchAccesses: {
                    some: { branchId: { in: allowedBranchIds } },
                  },
                },
              ],
            }
          : {},
        orderBy: { name: 'asc' },
        select: { id: true, name: true, email: true },
      }),
      this.prisma.branch.findMany({
        where: allowedBranchIds ? { id: { in: allowedBranchIds } } : {},
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
