import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingSource,
  BookingStatus,
  InvoiceStatus,
  PaymentStatus,
  Prisma,
  QueueEntrySource,
  QueueEntryStatus,
} from '@prisma/client';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import {
  assertDashboardBranchAccess,
  canAccessAllBranches,
  getEffectiveAllowedBranchIds,
  resolveDashboardBranchFilter,
} from '../billing/dashboard-branch-scope';
import {
  cairoTodayYmd,
  cairoZonedDayUtcRange,
} from '../common/cairo-slot-time';
import { normalizePhoneToE164 } from '../common/phone/phone.util';
import { AuditService } from '../audit/audit.service';
import { BookingPricingService } from '../bookings/booking-pricing.service';
import type { ResolvedBookingLine } from '../bookings/booking-pricing.service';
import { BookingsService } from '../bookings/bookings.service';
import { DashboardClientsService } from '../clients/dashboard-clients.service';
import { PrismaService } from '../prisma/prisma.service';
import { SlotsService } from '../slots/slots.service';
import { InvoicesService } from '../billing/invoices.service';
import { PaymentsService } from '../billing/payments.service';
import { AppendQueueBookingItemsDto } from './dto/append-queue-booking-items.dto';
import type { CreateInvoicePaymentDto } from '../billing/dto/create-invoice-payment.dto';
import type { PatchQueueNotesDto } from './dto/patch-queue-notes.dto';
import type { QueueListQueryDto } from './dto/queue-list-query.dto';
import type { WalkInQueueDto } from './dto/walk-in-queue.dto';
import type { StartQueueEntryDto } from './dto/start-queue-entry.dto';

const ACTIVE_QUEUE_STATUSES: QueueEntryStatus[] = [
  QueueEntryStatus.WAITING,
  QueueEntryStatus.IN_SERVICE,
];

function parseDateOnlyUtc(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function summarizeLines(lines: ResolvedBookingLine[]): string {
  if (lines.length === 0) {
    return '—';
  }
  const first = lines[0].nameSnapshot;
  if (lines.length === 1) {
    return first;
  }
  return `${first} +${lines.length - 1} more`;
}

function summarizeBookingItems(
  items: Array<{ nameSnapshot: string; quantity: number }>,
): string {
  if (items.length === 0) {
    return '—';
  }
  const first = items[0].nameSnapshot;
  if (items.length === 1) {
    return first;
  }
  return `${first} +${items.length - 1} more`;
}

function deriveInvoicePaymentStatus(
  paidAmount: Prisma.Decimal,
  remainingAmount: Prisma.Decimal,
): 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' {
  if (remainingAmount.lessThanOrEqualTo(0)) {
    return 'PAID';
  }
  if (paidAmount.greaterThan(0)) {
    return 'PARTIALLY_PAID';
  }
  return 'UNPAID';
}

@Injectable()
export class QueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly bookings: BookingsService,
    private readonly pricing: BookingPricingService,
    private readonly clients: DashboardClientsService,
    private readonly slots: SlotsService,
    private readonly invoices: InvoicesService,
    private readonly payments: PaymentsService,
  ) {}

  private resolveBranchOrThrow(
    user: DashboardJwtUser,
    branchId?: string,
  ): string {
    const resolved = resolveDashboardBranchFilter(user, branchId);
    if (!resolved) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'branchId is required',
          error: 'Bad Request',
          code: 'BRANCH_ID_REQUIRED',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    assertDashboardBranchAccess(user, resolved);
    return resolved;
  }

  private assertBookingProgressForLinked(
    user: DashboardJwtUser,
    bookingId: string | null,
  ): void {
    if (!bookingId) {
      return;
    }
    if (!user.permissions.includes('bookings.status.progress')) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }

  private buildListWhere(
    user: DashboardJwtUser,
    query: QueueListQueryDto,
  ): Prisma.QueueEntryWhereInput {
    const dateStr = query.date ?? cairoTodayYmd();
    const branchId = this.resolveBranchOrThrow(user, query.branchId);
    const { start, endExclusive } = cairoZonedDayUtcRange(dateStr);

    const base: Prisma.QueueEntryWhereInput = { branchId };

    if (!query.status) {
      return {
        ...base,
        OR: [
          {
            status: {
              in: [QueueEntryStatus.WAITING, QueueEntryStatus.IN_SERVICE],
            },
          },
          {
            status: QueueEntryStatus.COMPLETED,
            completedAt: { gte: start, lt: endExclusive },
          },
        ],
      };
    }

    if (query.status === QueueEntryStatus.COMPLETED) {
      return {
        ...base,
        status: QueueEntryStatus.COMPLETED,
        completedAt: { gte: start, lt: endExclusive },
      };
    }

    if (query.status === QueueEntryStatus.CANCELLED) {
      return {
        ...base,
        status: QueueEntryStatus.CANCELLED,
        cancelledAt: { gte: start, lt: endExclusive },
      };
    }

    return {
      ...base,
      status: query.status,
    };
  }

  private mapQueueEntry(row: {
    id: string;
    branchId: string;
    bookingId: string | null;
    clientId: string | null;
    source: QueueEntrySource;
    status: QueueEntryStatus;
    clientNameSnapshot: string;
    clientPhoneSnapshot: string | null;
    serviceSummarySnapshot: string | null;
    itemsSnapshot: Prisma.JsonValue | null;
    notes: string | null;
    checkedInAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
    cancelledAt: Date | null;
    createdByUserId: string;
    updatedByUserId: string | null;
    createdAt: Date;
    updatedAt: Date;
    bookingTotalAmount?: Prisma.Decimal | null;
    invoice?: {
      id: string;
      invoiceNumber: string;
      status: InvoiceStatus;
      totalAmount: Prisma.Decimal;
      paidAmount: Prisma.Decimal;
      remainingAmount: Prisma.Decimal;
      createdAt: Date;
    } | null;
    lastPaidPayment?: {
      method: string;
      paidAt: Date | null;
    } | null;
  }) {
    const now = Date.now();
    let waitingDurationSeconds: number | null = null;
    let inServiceDurationSeconds: number | null = null;

    if (row.status === QueueEntryStatus.WAITING) {
      waitingDurationSeconds = Math.floor(
        (now - row.checkedInAt.getTime()) / 1000,
      );
    } else if (
      row.status === QueueEntryStatus.IN_SERVICE &&
      row.startedAt !== null
    ) {
      waitingDurationSeconds = Math.floor(
        (row.startedAt.getTime() - row.checkedInAt.getTime()) / 1000,
      );
      inServiceDurationSeconds = Math.floor(
        (now - row.startedAt.getTime()) / 1000,
      );
    } else if (
      row.status === QueueEntryStatus.COMPLETED &&
      row.completedAt !== null
    ) {
      if (row.startedAt !== null) {
        waitingDurationSeconds = Math.floor(
          (row.startedAt.getTime() - row.checkedInAt.getTime()) / 1000,
        );
        inServiceDurationSeconds = Math.floor(
          (row.completedAt.getTime() - row.startedAt.getTime()) / 1000,
        );
      } else {
        waitingDurationSeconds = Math.floor(
          (row.completedAt.getTime() - row.checkedInAt.getTime()) / 1000,
        );
      }
    }

    return {
      id: row.id,
      branchId: row.branchId,
      bookingId: row.bookingId,
      clientId: row.clientId,
      source: row.source,
      status: row.status,
      clientNameSnapshot: row.clientNameSnapshot,
      clientPhoneSnapshot: row.clientPhoneSnapshot,
      serviceSummarySnapshot: row.serviceSummarySnapshot,
      itemsSnapshot: row.itemsSnapshot,
      notes: row.notes,
      checkedInAt: row.checkedInAt.toISOString(),
      startedAt: row.startedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      createdByUserId: row.createdByUserId,
      updatedByUserId: row.updatedByUserId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      waitingDurationSeconds,
      inServiceDurationSeconds,
      bookingSummary:
        row.bookingTotalAmount === undefined
          ? null
          : {
              totalAmount:
                row.bookingTotalAmount === null
                  ? null
                  : Number(row.bookingTotalAmount.toString()),
            },
      hasFinalizedInvoice: Boolean(row.invoice),
      invoiceSummary: row.invoice
        ? {
            invoiceId: row.invoice.id,
            invoiceNumber: row.invoice.invoiceNumber,
            status: row.invoice.status,
            totalAmount: Number(row.invoice.totalAmount.toString()),
            paidAmount: Number(row.invoice.paidAmount.toString()),
            remainingAmount: Number(row.invoice.remainingAmount.toString()),
            paymentStatus: deriveInvoicePaymentStatus(
              row.invoice.paidAmount,
              row.invoice.remainingAmount,
            ),
            finalizedAt: row.invoice.createdAt.toISOString(),
          }
        : null,
      paymentSummary: row.invoice
        ? {
            isPaid: row.invoice.remainingAmount.lessThanOrEqualTo(0),
            remainingAmount: Number(row.invoice.remainingAmount.toString()),
            lastPaymentMethod: row.lastPaidPayment?.method ?? null,
            lastPaymentAt: row.lastPaidPayment?.paidAt?.toISOString() ?? null,
          }
        : null,
    };
  }

  private async attachFinancialState(
    rows: Array<{
      id: string;
      branchId: string;
      bookingId: string | null;
      clientId: string | null;
      source: QueueEntrySource;
      status: QueueEntryStatus;
      clientNameSnapshot: string;
      clientPhoneSnapshot: string | null;
      serviceSummarySnapshot: string | null;
      itemsSnapshot: Prisma.JsonValue | null;
      notes: string | null;
      checkedInAt: Date;
      startedAt: Date | null;
      completedAt: Date | null;
      cancelledAt: Date | null;
      createdByUserId: string;
      updatedByUserId: string | null;
      createdAt: Date;
      updatedAt: Date;
    }>,
  ) {
    const bookingIds = Array.from(
      new Set(
        rows.map((r) => r.bookingId).filter((id): id is string => Boolean(id)),
      ),
    );
    if (bookingIds.length === 0) {
      return rows.map((r) => this.mapQueueEntry(r));
    }

    const [bookings, invoices, paidPayments] = await Promise.all([
      this.prisma.booking.findMany({
        where: { id: { in: bookingIds } },
        select: { id: true, totalAmount: true },
      }),
      this.prisma.invoice.findMany({
        where: {
          bookingId: { in: bookingIds },
          status: InvoiceStatus.FINALIZED,
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          bookingId: true,
          invoiceNumber: true,
          status: true,
          totalAmount: true,
          paidAmount: true,
          remainingAmount: true,
          createdAt: true,
        },
      }),
      this.prisma.payment.findMany({
        where: { bookingId: { in: bookingIds }, status: PaymentStatus.PAID },
        orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
        select: {
          bookingId: true,
          method: true,
          paidAt: true,
          createdAt: true,
        },
      }),
    ]);

    const bookingById = new Map(bookings.map((b) => [b.id, b]));
    const invoiceByBookingId = new Map<string, (typeof invoices)[number]>();
    for (const inv of invoices) {
      if (!invoiceByBookingId.has(inv.bookingId)) {
        invoiceByBookingId.set(inv.bookingId, inv);
      }
    }
    const paymentByBookingId = new Map<string, (typeof paidPayments)[number]>();
    for (const p of paidPayments) {
      if (!paymentByBookingId.has(p.bookingId)) {
        paymentByBookingId.set(p.bookingId, p);
      }
    }

    return rows.map((row) => {
      const booking = row.bookingId
        ? bookingById.get(row.bookingId)
        : undefined;
      const invoice = row.bookingId
        ? (invoiceByBookingId.get(row.bookingId) ?? null)
        : null;
      const payment = row.bookingId
        ? (paymentByBookingId.get(row.bookingId) ?? null)
        : null;
      return this.mapQueueEntry({
        ...row,
        bookingTotalAmount: booking?.totalAmount ?? null,
        invoice,
        lastPaidPayment: payment
          ? {
              method: payment.method,
              paidAt: payment.paidAt ?? payment.createdAt,
            }
          : null,
      });
    });
  }

  private async getQueueEntryWithFinancialState(
    user: DashboardJwtUser,
    queueEntryId: string,
  ) {
    const entry = await this.requireQueueEntry(user, queueEntryId);
    const [mapped] = await this.attachFinancialState([entry]);
    return mapped;
  }

  async listDashboardQueue(user: DashboardJwtUser, query: QueueListQueryDto) {
    const where = this.buildListWhere(user, query);
    const rows = await this.prisma.queueEntry.findMany({
      where,
      orderBy: [{ checkedInAt: 'asc' }, { id: 'asc' }],
    });
    const data = await this.attachFinancialState(rows);
    return {
      data,
      meta: {
        date: query.date ?? cairoTodayYmd(),
      },
    };
  }

  async checkInFromBooking(user: DashboardJwtUser, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        client: true,
        items: true,
      },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    assertDashboardBranchAccess(user, booking.branchId);

    const eligible = new Set<BookingStatus>([
      BookingStatus.CONFIRMED,
      BookingStatus.RESCHEDULED,
      BookingStatus.ARRIVED,
    ]);
    if (!eligible.has(booking.status)) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message:
            'Booking must be CONFIRMED, RESCHEDULED, or ARRIVED to check in to the queue',
          error: 'Bad Request',
          code: 'BOOKING_NOT_ELIGIBLE_FOR_QUEUE',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const duplicate = await this.prisma.queueEntry.findFirst({
      where: {
        bookingId,
        status: { in: ACTIVE_QUEUE_STATUSES },
      },
    });
    if (duplicate) {
      throw new HttpException(
        {
          statusCode: HttpStatus.CONFLICT,
          message: 'An active queue entry already exists for this booking.',
          error: 'Conflict',
          code: 'QUEUE_ACTIVE_FOR_BOOKING',
        },
        HttpStatus.CONFLICT,
      );
    }

    const itemsSnapshot = booking.items.map((it) => ({
      itemType: it.itemType,
      nameSnapshot: it.nameSnapshot,
      quantity: it.quantity,
    }));
    const serviceSummarySnapshot = summarizeBookingItems(booking.items);

    const now = new Date();
    const entry = await this.prisma.queueEntry.create({
      data: {
        branchId: booking.branchId,
        bookingId: booking.id,
        clientId: booking.clientId,
        source: QueueEntrySource.BOOKING,
        status: QueueEntryStatus.WAITING,
        clientNameSnapshot: booking.client.fullName,
        clientPhoneSnapshot: booking.client.phone,
        serviceSummarySnapshot,
        itemsSnapshot,
        checkedInAt: now,
        createdByUserId: user.userId,
      },
    });

    await this.audit.log({
      userId: user.userId,
      action: 'queue.checked_in_from_booking',
      module: 'queue',
      entityId: entry.id,
      newValue: { bookingId, branchId: booking.branchId },
    });

    try {
      if (
        booking.status === BookingStatus.CONFIRMED ||
        booking.status === BookingStatus.RESCHEDULED
      ) {
        await this.bookings.markArrived(user, bookingId);
      }
    } catch (err) {
      await this.prisma.queueEntry.delete({ where: { id: entry.id } });
      throw err;
    }

    return this.getQueueEntryWithFinancialState(user, entry.id);
  }

  private async requireClientForWalkIn(
    user: DashboardJwtUser,
    clientId: string,
  ): Promise<{ id: string; fullName: string; phone: string }> {
    const row = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, fullName: true, phone: true },
    });
    if (!row) {
      throw new NotFoundException('Client not found');
    }
    if (canAccessAllBranches(user)) {
      return row;
    }
    const allowed = getEffectiveAllowedBranchIds(user);
    if (!allowed.length) {
      throw new ForbiddenException('Insufficient permissions');
    }
    const branchOr =
      allowed.length === 1
        ? {
            OR: [
              { preferredBranchId: allowed[0] },
              { bookings: { some: { branchId: allowed[0] } } },
            ],
          }
        : {
            OR: [
              { preferredBranchId: { in: allowed } },
              { bookings: { some: { branchId: { in: allowed } } } },
            ],
          };
    const visible = await this.prisma.client.count({
      where: {
        id: clientId,
        ...branchOr,
      },
    });
    if (visible === 0) {
      throw new NotFoundException('Client not found');
    }
    return row;
  }

  async createWalkIn(user: DashboardJwtUser, dto: WalkInQueueDto) {
    assertDashboardBranchAccess(user, dto.branchId);

    if (!dto.items?.length) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'At least one service or package line is required',
          error: 'Bad Request',
          code: 'WALK_IN_ITEMS_REQUIRED',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    let clientId: string | null = null;
    let clientPhoneSnapshot: string | null = null;
    let clientNameSnapshot: string;

    if (dto.clientId) {
      const linked = await this.requireClientForWalkIn(user, dto.clientId);
      clientId = linked.id;
      clientNameSnapshot = linked.fullName;
      clientPhoneSnapshot = linked.phone;
    } else {
      const name = dto.clientName?.trim();
      if (!name) {
        throw new HttpException(
          {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'clientName is required when clientId is omitted',
            error: 'Bad Request',
            code: 'CLIENT_NAME_REQUIRED',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      clientNameSnapshot = name;

      if (dto.phone?.trim()) {
        const normalized = normalizePhoneToE164(dto.phone.trim());
        clientPhoneSnapshot = normalized;
        const existing = await this.prisma.client.findUnique({
          where: { phone: normalized },
        });
        if (existing) {
          clientId = existing.id;
        } else if (user.permissions.includes('clients.create')) {
          const created = await this.clients.createClient(user, {
            fullName: clientNameSnapshot,
            phone: normalized,
            preferredBranchId: dto.branchId,
          });
          clientId = created.id;
        }
      }
    }

    if (!clientId) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message:
            'A CRM client is required for walk-in bookings. Select an existing client, or provide a phone number so the system can match or create a client (requires clients.create when the phone is new).',
          error: 'Bad Request',
          code: 'WALK_IN_CLIENT_UNRESOLVED',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const lines = await this.pricing.resolveLines(dto.branchId, dto.items, {
      enforceOnlineCatalogRules: false,
      allowStaffPriceOverrides: true,
    });
    const settings = await this.pricing.getSystemSettings();
    const totals = this.pricing.computeTotals(lines, settings, 0);
    const serviceSummarySnapshot = summarizeLines(lines);
    const itemsSnapshot: Prisma.InputJsonValue = lines.map((l) => ({
      itemType: l.itemType,
      nameSnapshot: l.nameSnapshot,
      quantity: l.quantity,
    }));

    const checkedInAt = new Date();
    const bucketDate = parseDateOnlyUtc(cairoTodayYmd());

    const { entry, booking } = await this.prisma.$transaction(
      async (tx) => {
        const bucket = await this.slots.ensureWalkInBucketSlotTx(tx, {
          branchId: dto.branchId,
          date: bucketDate,
        });
        const reserved = await this.slots.tryReserveOneSlotCapacityTx(
          tx,
          bucket.id,
        );
        if (!reserved) {
          throw new HttpException(
            {
              statusCode: HttpStatus.BAD_REQUEST,
              message: 'Walk-in capacity bucket is full',
              error: 'Bad Request',
              code: 'SLOT_AT_CAPACITY',
            },
            HttpStatus.BAD_REQUEST,
          );
        }

        const bookingRow = await this.bookings.createWalkInArrivedBookingTx(
          tx,
          {
            clientId,
            branchId: dto.branchId,
            slotId: bucket.id,
            createdByUserId: user.userId,
            lines,
            totals,
          },
        );

        await this.slots.syncBookingSlotFilledFromCapacityTx(tx, bucket.id);

        const entryRow = await tx.queueEntry.create({
          data: {
            branchId: dto.branchId,
            bookingId: bookingRow.id,
            clientId,
            source: QueueEntrySource.WALK_IN,
            status: QueueEntryStatus.WAITING,
            clientNameSnapshot,
            clientPhoneSnapshot,
            serviceSummarySnapshot,
            itemsSnapshot,
            notes: dto.notes?.trim() ? dto.notes.trim() : null,
            checkedInAt,
            createdByUserId: user.userId,
          },
        });

        return { entry: entryRow, booking: bookingRow };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 10_000,
      },
    );

    await this.audit.log({
      userId: user.userId,
      action: 'booking.created',
      module: 'bookings',
      entityId: booking.id,
      newValue: {
        branchId: dto.branchId,
        slotId: booking.slotId,
        status: booking.status,
        source: BookingSource.WALK_IN,
      },
    });

    await this.audit.log({
      userId: user.userId,
      action: 'queue.created',
      module: 'queue',
      entityId: entry.id,
      newValue: {
        source: QueueEntrySource.WALK_IN,
        branchId: dto.branchId,
        bookingId: booking.id,
      },
    });

    await this.audit.log({
      userId: user.userId,
      action: 'queue.walk_in_booking_created',
      module: 'queue',
      entityId: entry.id,
      newValue: {
        queueEntryId: entry.id,
        bookingId: booking.id,
        branchId: dto.branchId,
      },
    });

    return this.getQueueEntryWithFinancialState(user, entry.id);
  }

  async appendQueueEntryBookingItems(
    user: DashboardJwtUser,
    queueEntryId: string,
    dto: AppendQueueBookingItemsDto,
  ) {
    const entry = await this.requireQueueEntry(user, queueEntryId);
    if (!entry.bookingId) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Queue entry has no linked booking',
          error: 'Bad Request',
          code: 'QUEUE_ENTRY_NO_BOOKING',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (
      entry.status !== QueueEntryStatus.WAITING &&
      entry.status !== QueueEntryStatus.IN_SERVICE
    ) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message:
            'Items can only be added while the visit is WAITING or IN_SERVICE',
          error: 'Bad Request',
          code: 'INVALID_QUEUE_APPEND_STATUS',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const bookingDetail = await this.bookings.appendItemsAndReprice(
      user,
      entry.bookingId,
      dto.items,
    );

    const refreshed = await this.prisma.queueEntry.update({
      where: { id: queueEntryId },
      data:
        entry.status === QueueEntryStatus.IN_SERVICE
          ? {
              status: QueueEntryStatus.WAITING,
              updatedByUserId: user.userId,
            }
          : {
              updatedByUserId: user.userId,
            },
    });
    if (!refreshed) {
      throw new NotFoundException('Queue entry not found');
    }

    if (entry.status === QueueEntryStatus.IN_SERVICE) {
      await this.audit.log({
        userId: user.userId,
        action: 'queue.returned_to_waiting_after_items_added',
        module: 'queue',
        entityId: queueEntryId,
        newValue: {
          queueEntryId,
          bookingId: entry.bookingId,
          addedItems: dto.items.length,
        },
      });
    }

    return {
      queueEntry: await this.getQueueEntryWithFinancialState(
        user,
        refreshed.id,
      ),
      booking: {
        id: bookingDetail.id,
        subtotal: bookingDetail.subtotal,
        totalAmount: bookingDetail.totalAmount,
        itemCount: bookingDetail.items.length,
      },
    };
  }

  async finalizeInvoiceForQueueEntry(
    user: DashboardJwtUser,
    queueEntryId: string,
  ) {
    const entry = await this.requireQueueEntry(user, queueEntryId);
    if (!entry.bookingId) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Queue entry has no linked booking',
          error: 'Bad Request',
          code: 'QUEUE_ENTRY_NO_BOOKING',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (
      entry.status !== QueueEntryStatus.WAITING &&
      entry.status !== QueueEntryStatus.IN_SERVICE
    ) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message:
            'Invoice finalization is allowed only while WAITING or IN_SERVICE',
          error: 'Bad Request',
          code: 'INVALID_QUEUE_INVOICE_STATUS',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    const invoice = await this.invoices.createFinalizedForBooking(
      user,
      entry.bookingId,
    );
    await this.audit.log({
      userId: user.userId,
      action: 'invoice.finalized_from_queue',
      module: 'queue',
      entityId: queueEntryId,
      newValue: {
        queueEntryId,
        bookingId: entry.bookingId,
        invoiceId: invoice.id,
      },
    });

    return {
      queueEntry: await this.getQueueEntryWithFinancialState(
        user,
        queueEntryId,
      ),
      invoice,
    };
  }

  async recordPaymentForQueueEntry(
    user: DashboardJwtUser,
    queueEntryId: string,
    dto: CreateInvoicePaymentDto,
  ) {
    const entry = await this.requireQueueEntry(user, queueEntryId);
    if (!entry.bookingId) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Queue entry has no linked booking',
          error: 'Bad Request',
          code: 'QUEUE_ENTRY_NO_BOOKING',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    const finalizedInvoice = await this.prisma.invoice.findFirst({
      where: {
        bookingId: entry.bookingId,
        status: InvoiceStatus.FINALIZED,
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!finalizedInvoice) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Finalize invoice before collecting payment',
          error: 'Bad Request',
          code: 'INVOICE_REQUIRED',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const result = await this.payments.recordPaymentForInvoice(
      user,
      finalizedInvoice.id,
      dto,
      { fromQueue: true, queueEntryId },
    );
    return {
      queueEntry: await this.getQueueEntryWithFinancialState(
        user,
        queueEntryId,
      ),
      payment: result.payment,
      invoice: result.invoice,
    };
  }

  private async requireQueueEntry(
    user: DashboardJwtUser,
    queueEntryId: string,
  ) {
    const entry = await this.prisma.queueEntry.findUnique({
      where: { id: queueEntryId },
    });
    if (!entry) {
      throw new NotFoundException('Queue entry not found');
    }
    assertDashboardBranchAccess(user, entry.branchId);
    return entry;
  }

  async startQueueEntry(
    user: DashboardJwtUser,
    queueEntryId: string,
    dto: StartQueueEntryDto,
  ) {
    const entry = await this.requireQueueEntry(user, queueEntryId);
    if (entry.status !== QueueEntryStatus.WAITING) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Only WAITING entries can be started',
          error: 'Bad Request',
          code: 'INVALID_QUEUE_TRANSITION',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (entry.bookingId && dto.starts.length !== 1) {
      const empty = dto.starts.length === 0;
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: empty
            ? 'When a queue visit is linked to a booking, provide exactly one starts[] entry with staff for the service line you are beginning now'
            : 'Start one catalog service at a time — provide exactly one starts[] entry with staff for this visit',
          error: 'Bad Request',
          code: empty
            ? 'QUEUE_START_REQUIRES_SERVICE_STARTS'
            : 'QUEUE_START_SINGLE_SERVICE_ONLY',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    this.assertBookingProgressForLinked(user, entry.bookingId);
    if (entry.bookingId) {
      for (const s of dto.starts) {
        await this.bookings.startBookingServiceItem(
          user,
          entry.bookingId,
          s.bookingItemId,
          s.staffProfileId,
        );
      }
      await this.bookings.markInProgress(user, entry.bookingId);
    }

    const now = new Date();
    const updated = await this.prisma.queueEntry.update({
      where: { id: queueEntryId },
      data: {
        status: QueueEntryStatus.IN_SERVICE,
        startedAt: now,
        updatedByUserId: user.userId,
      },
    });

    await this.audit.log({
      userId: user.userId,
      action: 'queue.started',
      module: 'queue',
      entityId: queueEntryId,
      newValue: { bookingId: entry.bookingId, starts: dto.starts.length },
    });

    return this.getQueueEntryWithFinancialState(user, updated.id);
  }

  async completeQueueEntry(user: DashboardJwtUser, queueEntryId: string) {
    const entry = await this.requireQueueEntry(user, queueEntryId);
    if (
      entry.status !== QueueEntryStatus.WAITING &&
      entry.status !== QueueEntryStatus.IN_SERVICE
    ) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Only WAITING or IN_SERVICE entries can be completed',
          error: 'Bad Request',
          code: 'INVALID_QUEUE_TRANSITION',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    this.assertBookingProgressForLinked(user, entry.bookingId);
    if (entry.bookingId) {
      const finalizedInvoice = await this.prisma.invoice.findFirst({
        where: {
          bookingId: entry.bookingId,
          status: InvoiceStatus.FINALIZED,
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          paidAmount: true,
          remainingAmount: true,
        },
      });
      if (!finalizedInvoice) {
        await this.audit.log({
          userId: user.userId,
          action: 'queue.completion_blocked_invoice_required',
          module: 'queue',
          entityId: queueEntryId,
          newValue: {
            queueEntryId,
            bookingId: entry.bookingId,
          },
        });
        throw new HttpException(
          {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'Finalize invoice before completing visit',
            error: 'Bad Request',
            code: 'INVOICE_REQUIRED',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      if (finalizedInvoice.remainingAmount.greaterThan(0)) {
        await this.audit.log({
          userId: user.userId,
          action: 'queue.completion_blocked_payment_required',
          module: 'queue',
          entityId: queueEntryId,
          newValue: {
            queueEntryId,
            bookingId: entry.bookingId,
            invoiceId: finalizedInvoice.id,
            paidAmount: Number(finalizedInvoice.paidAmount.toString()),
            remainingAmount: Number(
              finalizedInvoice.remainingAmount.toString(),
            ),
          },
        });
        throw new HttpException(
          {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'Collect full payment before completing visit',
            error: 'Bad Request',
            code: 'PAYMENT_REQUIRED',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      await this.bookings.markCompleted(user, entry.bookingId);
    }

    const now = new Date();
    const updated = await this.prisma.queueEntry.update({
      where: { id: queueEntryId },
      data: {
        status: QueueEntryStatus.COMPLETED,
        ...(entry.startedAt === null ? { startedAt: now } : {}),
        completedAt: now,
        updatedByUserId: user.userId,
      },
    });

    await this.audit.log({
      userId: user.userId,
      action: 'queue.completed',
      module: 'queue',
      entityId: queueEntryId,
      newValue: { bookingId: entry.bookingId },
    });

    return this.getQueueEntryWithFinancialState(user, updated.id);
  }

  async cancelQueueEntry(user: DashboardJwtUser, queueEntryId: string) {
    const entry = await this.requireQueueEntry(user, queueEntryId);
    if (
      entry.status !== QueueEntryStatus.WAITING &&
      entry.status !== QueueEntryStatus.IN_SERVICE
    ) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Only WAITING or IN_SERVICE entries can be cancelled',
          error: 'Bad Request',
          code: 'INVALID_QUEUE_TRANSITION',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const now = new Date();
    const updated = await this.prisma.queueEntry.update({
      where: { id: queueEntryId },
      data: {
        status: QueueEntryStatus.CANCELLED,
        cancelledAt: now,
        updatedByUserId: user.userId,
      },
    });

    await this.audit.log({
      userId: user.userId,
      action: 'queue.cancelled',
      module: 'queue',
      entityId: queueEntryId,
      newValue: { bookingId: entry.bookingId },
    });

    return this.getQueueEntryWithFinancialState(user, updated.id);
  }

  async patchNotes(
    user: DashboardJwtUser,
    queueEntryId: string,
    dto: PatchQueueNotesDto,
  ) {
    await this.requireQueueEntry(user, queueEntryId);
    const updated = await this.prisma.queueEntry.update({
      where: { id: queueEntryId },
      data: {
        notes:
          dto.notes === undefined
            ? undefined
            : dto.notes === null
              ? null
              : dto.notes,
        updatedByUserId: user.userId,
      },
    });
    return this.getQueueEntryWithFinancialState(user, updated.id);
  }
}
