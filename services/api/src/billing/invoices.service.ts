import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingItemLineStatus,
  BookingSource,
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  QueueEntrySource,
} from '@prisma/client';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { presentBookingSlot } from '../common/cairo-slot-time';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { buildListMeta } from '../catalog/catalog.utils';
import { INVOICE_NUMBER_SEQUENCE_ID } from './billing.constants';
import { SYSTEM_SETTINGS_ID } from '../settings/settings.constants';
import {
  assertDashboardBranchAccess,
  buildDashboardBookingBranchWhere,
} from './dashboard-branch-scope';
import { decimalMaxZero, sumPaidPayments } from './payment-ledger.util';
import type {
  InvoiceListQueryDto,
  InvoicePaymentStatusFilter,
} from './dto/invoice-list-query.dto';
import type { PatchInvoiceDto } from './dto/patch-invoice.dto';

type InvoicePaymentSummaryStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';

function deriveInvoicePaymentStatus(
  total: Prisma.Decimal,
  paid: Prisma.Decimal,
  remaining: Prisma.Decimal,
): InvoicePaymentSummaryStatus {
  if (remaining.lessThanOrEqualTo(0)) {
    return 'PAID';
  }
  if (paid.greaterThan(0) && paid.lessThan(total)) {
    return 'PARTIALLY_PAID';
  }
  return 'UNPAID';
}

function httpBusiness(
  status: HttpStatus,
  message: string,
  code: string,
): HttpException {
  return new HttpException(
    {
      statusCode: status,
      message,
      error: status === HttpStatus.NOT_FOUND ? 'Not Found' : 'Bad Request',
      code,
    },
    status,
  );
}

function formatBookingReference(bookingId: string): string {
  const tail = bookingId.replace(/-/g, '').slice(-8).toUpperCase();
  return `RB-${tail}`;
}

function extractBookingIdSearchCompact(raw: string): string | null {
  let s = raw.trim();
  if (/^rb-/i.test(s)) {
    s = s.slice(3).trim();
  }
  s = s.replace(/\s+/g, '').replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]+$/.test(s)) {
    return null;
  }
  if (s.length < 4 || s.length > 32) {
    return null;
  }
  return s;
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async syncInvoicePaymentTotalsForBooking(
    tx: Prisma.TransactionClient,
    bookingId: string,
  ): Promise<void> {
    const inv = await tx.invoice.findFirst({
      where: { bookingId, status: InvoiceStatus.FINALIZED },
    });
    if (!inv) {
      return;
    }
    const payments = await tx.payment.findMany({ where: { bookingId } });
    const paidSum = sumPaidPayments(payments);
    const remaining = decimalMaxZero(inv.totalAmount.minus(paidSum));
    await tx.invoice.update({
      where: { id: inv.id },
      data: { paidAmount: paidSum, remainingAmount: remaining },
    });
  }

  private async nextInvoiceNumber(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    try {
      const row = await tx.invoiceNumberSequence.update({
        where: { id: INVOICE_NUMBER_SEQUENCE_ID },
        data: { nextValue: { increment: 1 } },
        select: { nextValue: true },
      });
      const y = new Date().getUTCFullYear();
      return `INV-${y}-${String(row.nextValue).padStart(6, '0')}`;
    } catch {
      throw httpBusiness(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Invoice number sequence is not initialized (run db seed)',
        'INVOICE_SEQUENCE_MISSING',
      );
    }
  }

  async createFinalizedForBooking(user: DashboardJwtUser, bookingId: string) {
    const created = await this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: {
          items: {
            where: { lineStatus: { not: BookingItemLineStatus.CANCELLED } },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      if (!booking) {
        throw new NotFoundException('Booking not found');
      }
      assertDashboardBranchAccess(user, booking.branchId);

      const existingFinal = await tx.invoice.findFirst({
        where: { bookingId, status: InvoiceStatus.FINALIZED },
      });
      if (existingFinal) {
        throw new ConflictException(
          'A finalized invoice already exists for this booking',
        );
      }
      if (booking.items.length === 0) {
        throw httpBusiness(
          HttpStatus.BAD_REQUEST,
          'Booking must have at least one item before invoice finalization',
          'BOOKING_ITEMS_REQUIRED',
        );
      }

      const invoiceNumber = await this.nextInvoiceNumber(tx);
      const payments = await tx.payment.findMany({ where: { bookingId } });
      const paidSum = sumPaidPayments(payments);
      const remaining = decimalMaxZero(booking.totalAmount.minus(paidSum));

      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          bookingId: booking.id,
          clientId: booking.clientId,
          subtotal: booking.subtotal,
          discountAmount: booking.discountAmount,
          discountReason: booking.discountReason,
          vatRate: booking.vatRate,
          vatAmount: booking.vatAmount,
          totalAmount: booking.totalAmount,
          paidAmount: paidSum,
          remainingAmount: remaining,
          status: InvoiceStatus.FINALIZED,
          paymentMethod: null,
          createdByUserId: user.userId,
          lines: {
            create: booking.items.map((it, idx) => ({
              sortOrder: idx,
              bookingItemId: it.id,
              itemType: it.itemType,
              serviceId: it.serviceId,
              serviceVariantId: it.serviceVariantId,
              packageId: it.packageId,
              bundleId: it.bundleId,
              serviceEnhancementId: it.serviceEnhancementId,
              nameSnapshot: it.nameSnapshot,
              priceSnapshot: it.priceSnapshot,
              discountAmount: it.discountAmount,
              durationMinutesSnapshot: it.durationMinutesSnapshot,
              quantity: it.quantity,
              lineMetadata: it.lineMetadata ?? Prisma.JsonNull,
            })),
          },
        },
      });
      await this.audit.log(
        {
          userId: user.userId,
          action: 'invoice.generated',
          module: 'billing',
          entityId: invoice.id,
          newValue: {
            bookingId: invoice.bookingId,
            invoiceNumber: invoice.invoiceNumber,
            totalAmount: Number(invoice.totalAmount.toString()),
            status: invoice.status,
          },
        },
        tx,
      );

      return invoice;
    });

    return this.getDashboardOne(user, created.id);
  }

  /**
   * When booking line items are added after an invoice was finalized, append missing
   * invoice lines (matched by `bookingItemId`) and refresh monetary totals from the booking
   * while preserving `paidAmount`.
   */
  async syncFinalizedInvoiceWithBooking(
    user: DashboardJwtUser,
    bookingId: string,
  ): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        items: {
          where: { lineStatus: { not: BookingItemLineStatus.CANCELLED } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    assertDashboardBranchAccess(user, booking.branchId);

    const invoice = await this.prisma.invoice.findFirst({
      where: { bookingId, status: InvoiceStatus.FINALIZED },
      orderBy: { createdAt: 'desc' },
      include: { lines: true },
    });
    if (!invoice) {
      return;
    }

    let maxSort = invoice.lines.reduce((m, l) => Math.max(m, l.sortOrder), -1);
    const sortedLines = [...invoice.lines].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    const sortedItems = [...booking.items].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );

    await this.prisma.$transaction(async (tx) => {
      if (
        sortedLines.length > 0 &&
        sortedLines.every((l) => l.bookingItemId === null) &&
        sortedLines.length === sortedItems.length
      ) {
        for (let i = 0; i < sortedLines.length; i++) {
          const line = sortedLines[i];
          const item = sortedItems[i];
          await tx.invoiceLine.update({
            where: { id: line.id },
            data: { bookingItemId: item.id },
          });
        }
      }

      const refreshedLines = await tx.invoiceLine.findMany({
        where: { invoiceId: invoice.id },
      });
      const linked2 = new Set(
        refreshedLines
          .map((l) => l.bookingItemId)
          .filter((id): id is string => id !== null),
      );
      maxSort = refreshedLines.reduce((m, l) => Math.max(m, l.sortOrder), -1);
      const missing = sortedItems.filter((it) => !linked2.has(it.id));

      for (const it of missing) {
        maxSort += 1;
        await tx.invoiceLine.create({
          data: {
            invoiceId: invoice.id,
            sortOrder: maxSort,
            bookingItemId: it.id,
            itemType: it.itemType,
            serviceId: it.serviceId,
            serviceVariantId: it.serviceVariantId,
            packageId: it.packageId,
            bundleId: it.bundleId,
            serviceEnhancementId: it.serviceEnhancementId,
            nameSnapshot: it.nameSnapshot,
            priceSnapshot: it.priceSnapshot,
            discountAmount: it.discountAmount,
            durationMinutesSnapshot: it.durationMinutesSnapshot,
            quantity: it.quantity,
            lineMetadata: it.lineMetadata ?? Prisma.JsonNull,
          },
        });
      }

      const paidAmount = invoice.paidAmount;
      const remaining = decimalMaxZero(booking.totalAmount.minus(paidAmount));

      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          subtotal: booking.subtotal,
          discountAmount: booking.discountAmount,
          discountReason: booking.discountReason,
          vatRate: booking.vatRate,
          vatAmount: booking.vatAmount,
          totalAmount: booking.totalAmount,
          remainingAmount: remaining,
        },
      });
    });

    await this.audit.log({
      userId: user.userId,
      action: 'invoice.synced_from_booking_items',
      module: 'billing',
      entityId: invoice.id,
      newValue: {
        bookingId,
      },
    });
  }

  async listDashboard(user: DashboardJwtUser, query: InvoiceListQueryDto) {
    if (query.bookingId) {
      const b = await this.prisma.booking.findUnique({
        where: { id: query.bookingId },
        select: { branchId: true },
      });
      if (!b) {
        throw new NotFoundException('Booking not found');
      }
      assertDashboardBranchAccess(user, b.branchId);
    }

    const bookingBranchWhere = buildDashboardBookingBranchWhere(
      user,
      query.branchId,
    );
    const where: Prisma.InvoiceWhereInput = {};

    if (query.bookingId) {
      where.bookingId = query.bookingId;
    }
    if (query.clientId) {
      where.clientId = query.clientId;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) {
        where.createdAt.gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        const d = new Date(query.dateTo);
        d.setUTCHours(23, 59, 59, 999);
        where.createdAt.lte = d;
      }
    }

    if (Object.keys(bookingBranchWhere).length) {
      where.booking = { is: bookingBranchWhere };
    }

    if (query.paymentStatus) {
      const psFilter = this.buildPaymentStatusWhere(query.paymentStatus);
      if (psFilter) {
        Object.assign(where, psFilter);
      }
    }

    const search = query.search?.trim();
    if (search) {
      const ors: Prisma.InvoiceWhereInput[] = [];
      const compactBookingId = extractBookingIdSearchCompact(search);
      ors.push({
        invoiceNumber: { contains: search, mode: 'insensitive' },
      });
      ors.push({
        client: {
          fullName: { contains: search, mode: 'insensitive' },
        },
      });
      const phoneDigits = search.replace(/\D/g, '');
      if (phoneDigits.length >= 3) {
        ors.push({
          client: {
            phone: { contains: phoneDigits },
          },
        });
      }
      if (compactBookingId) {
        const dashed = this.tryDashedUuid(compactBookingId);
        if (dashed) {
          ors.push({ bookingId: dashed });
        }
      }
      where.AND = [
        ...((where.AND as Prisma.InvoiceWhereInput[]) ?? []),
        { OR: ors },
      ];
    }

    const skip = (query.page - 1) * query.pageSize;
    const [totalItems, rows, summaryRows] = await Promise.all([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          client: {
            select: {
              id: true,
              fullName: true,
              phone: true,
            },
          },
          booking: {
            select: {
              id: true,
              source: true,
              createdAt: true,
              branchId: true,
              branch: { select: { id: true, name: true } },
              slot: {
                select: {
                  date: true,
                  startTime: true,
                  endTime: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.invoice.aggregate({
        where,
        _sum: {
          totalAmount: true,
          paidAmount: true,
          remainingAmount: true,
        },
        _count: { _all: true },
      }),
    ]);

    const [paidCount, partialCount, unpaidCount] = await Promise.all([
      this.prisma.invoice.count({
        where: this.combineWhere(where, this.buildPaymentStatusWhere('PAID')),
      }),
      this.prisma.invoice.count({
        where: this.combineWhere(
          where,
          this.buildPaymentStatusWhere('PARTIALLY_PAID'),
        ),
      }),
      this.prisma.invoice.count({
        where: this.combineWhere(where, this.buildPaymentStatusWhere('UNPAID')),
      }),
    ]);

    return {
      data: rows.map((r) => this.mapEnrichedListRow(r)),
      meta: {
        ...buildListMeta({
          page: query.page,
          pageSize: query.pageSize,
          totalItems,
        }),
        invoiceSummary: {
          totalInvoices: summaryRows._count._all ?? 0,
          paidInvoices: paidCount,
          partiallyPaidInvoices: partialCount,
          unpaidInvoices: unpaidCount,
          totalRevenue: Number(
            (summaryRows._sum.totalAmount ?? new Prisma.Decimal(0)).toString(),
          ),
          totalPaid: Number(
            (summaryRows._sum.paidAmount ?? new Prisma.Decimal(0)).toString(),
          ),
          totalOutstanding: Number(
            (
              summaryRows._sum.remainingAmount ?? new Prisma.Decimal(0)
            ).toString(),
          ),
        },
      },
    };
  }

  async getDashboardOne(user: DashboardJwtUser, invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        lines: { orderBy: { sortOrder: 'asc' } },
        client: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
          },
        },
        booking: {
          select: {
            id: true,
            source: true,
            branchId: true,
            createdAt: true,
            branch: {
              select: { id: true, name: true },
            },
            slot: {
              select: {
                id: true,
                date: true,
                startTime: true,
                endTime: true,
              },
            },
            items: {
              orderBy: { createdAt: 'asc' },
              select: {
                id: true,
                nameSnapshot: true,
                quantity: true,
              },
            },
          },
        },
        createdByUser: {
          select: { id: true, name: true },
        },
      },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    assertDashboardBranchAccess(user, invoice.booking.branchId);

    const payments = await this.prisma.payment.findMany({
      where: {
        bookingId: invoice.bookingId,
        status: PaymentStatus.PAID,
      },
      orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }],
      include: {
        createdByUser: { select: { id: true, name: true } },
      },
    });

    const servicesSummary = invoice.booking.items.length
      ? invoice.booking.items
          .map((it) =>
            it.quantity > 1
              ? `${it.nameSnapshot} ×${it.quantity}`
              : it.nameSnapshot,
          )
          .join(', ')
      : '';

    return {
      ...this.mapInvoiceListRow(invoice),
      lines: invoice.lines.map((ln) => ({
        id: ln.id,
        sortOrder: ln.sortOrder,
        itemType: ln.itemType,
        serviceId: ln.serviceId,
        serviceVariantId: ln.serviceVariantId,
        packageId: ln.packageId,
        bundleId: ln.bundleId,
        serviceEnhancementId: ln.serviceEnhancementId,
        nameSnapshot: ln.nameSnapshot,
        priceSnapshot: Number(ln.priceSnapshot.toString()),
        discountAmount: Number(ln.discountAmount.toString()),
        durationMinutesSnapshot: ln.durationMinutesSnapshot,
        quantity: ln.quantity,
        lineMetadata: ln.lineMetadata,
      })),
      client: {
        id: invoice.client.id,
        fullName: invoice.client.fullName,
        phone: invoice.client.phone || null,
        email: invoice.client.email,
      },
      booking: {
        id: invoice.booking.id,
        reference: formatBookingReference(invoice.booking.id),
        source: invoice.booking.source,
        branchId: invoice.booking.branchId,
        branchName: invoice.booking.branch?.name ?? null,
        createdAt: invoice.booking.createdAt,
        slot: invoice.booking.slot
          ? {
              id: invoice.booking.slot.id,
              ...presentBookingSlot(invoice.booking.slot, invoice.booking),
            }
          : null,
        servicesSummary,
        itemCount: invoice.booking.items.length,
      },
      branch: {
        id: invoice.booking.branch?.id ?? invoice.booking.branchId,
        name: invoice.booking.branch?.name ?? null,
      },
      payments: payments.map((p) => ({
        id: p.id,
        method: p.method,
        amount: Number(p.amount.toString()),
        status: p.status,
        referenceNumber: p.reference,
        paidAt: (p.paidAt ?? p.createdAt).toISOString(),
        createdAt: p.createdAt.toISOString(),
        cashierName: p.createdByUser?.name ?? null,
      })),
      finalizedAt: invoice.createdAt,
      cashierName: invoice.createdByUser?.name ?? null,
    };
  }

  async getDashboardReceipt(user: DashboardJwtUser, invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        lines: { orderBy: { sortOrder: 'asc' } },
        booking: {
          include: {
            branch: true,
            client: {
              select: {
                id: true,
                fullName: true,
                phone: true,
              },
            },
            queueEntries: {
              where: { source: QueueEntrySource.WALK_IN },
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { id: true, source: true },
            },
          },
        },
        createdByUser: {
          select: { id: true, name: true },
        },
      },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    assertDashboardBranchAccess(user, invoice.booking.branchId);
    if (invoice.status !== InvoiceStatus.FINALIZED) {
      throw httpBusiness(
        HttpStatus.BAD_REQUEST,
        'Receipt is available only for finalized invoices',
        'INVOICE_NOT_FINALIZED',
      );
    }

    const payments = await this.prisma.payment.findMany({
      where: {
        bookingId: invoice.bookingId,
        status: PaymentStatus.PAID,
      },
      orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        method: true,
        amount: true,
        reference: true,
        paidAt: true,
        createdAt: true,
      },
    });

    const paymentStatus = deriveInvoicePaymentStatus(
      invoice.totalAmount,
      invoice.paidAmount,
      invoice.remainingAmount,
    );
    const queueEntry = invoice.booking.queueEntries[0] ?? null;
    const settings = await this.prisma.systemSettings.findUnique({
      where: { id: SYSTEM_SETTINGS_ID },
      select: {
        salonName: true,
        taxLabel: true,
        showVatOnInvoice: true,
        receiptTitle: true,
        receiptFooterMessage: true,
        receiptWidth: true,
        showSalonPhoneOnReceipt: true,
        showBranchAddressOnReceipt: true,
        showVatBreakdown: true,
        showPaymentBreakdown: true,
        showCashierName: true,
      },
    });

    return {
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        finalizedAt: invoice.createdAt,
        paymentStatus,
        status: invoice.status,
        cashierName:
          settings?.showCashierName === false
            ? null
            : (invoice.createdByUser?.name ?? null),
      },
      branch: {
        id: invoice.booking.branch.id,
        salonName: settings?.salonName || 'Alrouby Salon & Spa',
        name: invoice.booking.branch.name,
        address:
          settings?.showBranchAddressOnReceipt === false
            ? null
            : invoice.booking.branch.address || null,
        phone:
          settings?.showSalonPhoneOnReceipt === false
            ? null
            : invoice.booking.branch.phone || null,
      },
      booking: {
        id: invoice.booking.id,
        reference: formatBookingReference(invoice.booking.id),
        source: invoice.booking.source,
      },
      queueEntry: queueEntry
        ? {
            id: queueEntry.id,
            source: queueEntry.source,
          }
        : null,
      client: {
        id: invoice.booking.client.id,
        name: invoice.booking.client.fullName,
        phone: invoice.booking.client.phone || null,
      },
      lines: invoice.lines.map((ln) => {
        const unitPrice = Number(ln.priceSnapshot.toString());
        const quantity = ln.quantity;
        const discount = Number(ln.discountAmount.toString());
        return {
          id: ln.id,
          sortOrder: ln.sortOrder,
          name: ln.nameSnapshot,
          quantity,
          unitPrice,
          discountAmount: discount,
          lineTotal: Math.max(
            0,
            Number(ln.priceSnapshot.mul(quantity).toString()) - discount,
          ),
        };
      }),
      payments: payments.map((p) => ({
        id: p.id,
        method: p.method,
        amount: Number(p.amount.toString()),
        referenceNumber: p.reference,
        paidAt: (p.paidAt ?? p.createdAt).toISOString(),
      })),
      totals: {
        subtotal: Number(invoice.subtotal.toString()),
        discountAmount: Number(invoice.discountAmount.toString()),
        vatAmount: Number(invoice.vatAmount.toString()),
        totalAmount: Number(invoice.totalAmount.toString()),
        paidAmount: Number(invoice.paidAmount.toString()),
        remainingAmount: Number(invoice.remainingAmount.toString()),
      },
      taxLabel: settings?.taxLabel || 'VAT',
      showVatOnInvoice: settings?.showVatOnInvoice ?? true,
      showVatBreakdown: settings?.showVatBreakdown ?? true,
      showPaymentBreakdown: settings?.showPaymentBreakdown ?? true,
      receiptTitle: settings?.receiptTitle || 'Receipt',
      receiptWidth: settings?.receiptWidth || '80mm',
      footerMessage:
        settings?.receiptFooterMessage ||
        'Thank you for visiting Alrouby Salon & Spa. This receipt was generated from a finalized invoice record.',
    };
  }

  async patchDashboardInvoice(
    user: DashboardJwtUser,
    invoiceId: string,
    dto: PatchInvoiceDto,
  ) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { booking: { select: { branchId: true } } },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    assertDashboardBranchAccess(user, invoice.booking.branchId);

    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw httpBusiness(
        HttpStatus.BAD_REQUEST,
        'Invoice is already cancelled',
        'INVOICE_ALREADY_CANCELLED',
      );
    }

    if (dto.status === InvoiceStatus.CANCELLED) {
      if (invoice.status !== InvoiceStatus.FINALIZED) {
        throw httpBusiness(
          HttpStatus.BAD_REQUEST,
          'Only finalized invoices can be cancelled',
          'INVALID_INVOICE_STATUS',
        );
      }
    }

    if (dto.status === undefined && dto.paymentMethod === undefined) {
      return this.getDashboardOne(user, invoiceId);
    }

    const data: Prisma.InvoiceUpdateInput = {};
    if (dto.status !== undefined) {
      data.status = dto.status;
    }
    if (dto.paymentMethod !== undefined) {
      data.paymentMethod = dto.paymentMethod;
    }

    if (Object.keys(data).length === 0) {
      return this.getDashboardOne(user, invoiceId);
    }

    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data,
    });

    return this.getDashboardOne(user, invoiceId);
  }

  private buildPaymentStatusWhere(
    status: InvoicePaymentStatusFilter,
  ): Prisma.InvoiceWhereInput | null {
    if (status === 'PAID') {
      return {
        remainingAmount: { lte: 0 },
      } satisfies Prisma.InvoiceWhereInput;
    }
    if (status === 'UNPAID') {
      return {
        AND: [{ remainingAmount: { gt: 0 } }, { paidAmount: { lte: 0 } }],
      } satisfies Prisma.InvoiceWhereInput;
    }
    if (status === 'PARTIALLY_PAID') {
      return {
        AND: [{ remainingAmount: { gt: 0 } }, { paidAmount: { gt: 0 } }],
      } satisfies Prisma.InvoiceWhereInput;
    }
    return null;
  }

  private combineWhere(
    base: Prisma.InvoiceWhereInput,
    extra: Prisma.InvoiceWhereInput | null,
  ): Prisma.InvoiceWhereInput {
    if (!extra) {
      return base;
    }
    return { AND: [base, extra] };
  }

  private tryDashedUuid(compact: string): string | null {
    if (compact.length !== 32) {
      return null;
    }
    return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20, 32)}`;
  }

  private mapInvoiceListRow(inv: {
    id: string;
    invoiceNumber: string;
    bookingId: string;
    clientId: string;
    subtotal: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
    discountReason: string | null;
    vatRate: Prisma.Decimal;
    vatAmount: Prisma.Decimal;
    totalAmount: Prisma.Decimal;
    paidAmount: Prisma.Decimal;
    remainingAmount: Prisma.Decimal;
    status: InvoiceStatus;
    paymentMethod: PaymentMethod | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const paymentStatus = deriveInvoicePaymentStatus(
      inv.totalAmount,
      inv.paidAmount,
      inv.remainingAmount,
    );
    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      bookingId: inv.bookingId,
      bookingReference: formatBookingReference(inv.bookingId),
      clientId: inv.clientId,
      subtotal: Number(inv.subtotal.toString()),
      discountAmount: Number(inv.discountAmount.toString()),
      discountReason: inv.discountReason,
      vatRate: Number(inv.vatRate.toString()),
      vatAmount: Number(inv.vatAmount.toString()),
      totalAmount: Number(inv.totalAmount.toString()),
      paidAmount: Number(inv.paidAmount.toString()),
      remainingAmount: Number(inv.remainingAmount.toString()),
      paymentStatus,
      status: inv.status,
      paymentMethod: inv.paymentMethod,
      currency: 'EGP',
      createdAt: inv.createdAt,
      updatedAt: inv.updatedAt,
      finalizedAt: inv.createdAt,
    };
  }

  private mapEnrichedListRow(inv: {
    id: string;
    invoiceNumber: string;
    bookingId: string;
    clientId: string;
    subtotal: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
    discountReason: string | null;
    vatRate: Prisma.Decimal;
    vatAmount: Prisma.Decimal;
    totalAmount: Prisma.Decimal;
    paidAmount: Prisma.Decimal;
    remainingAmount: Prisma.Decimal;
    status: InvoiceStatus;
    paymentMethod: PaymentMethod | null;
    createdAt: Date;
    updatedAt: Date;
    client: {
      id: string;
      fullName: string;
      phone: string | null;
    };
    booking: {
      id: string;
      source: BookingSource;
      createdAt: Date;
      branchId: string;
      branch: { id: string; name: string } | null;
      slot: { date: Date; startTime: Date; endTime: Date } | null;
    };
  }) {
    return {
      ...this.mapInvoiceListRow(inv),
      client: {
        id: inv.client.id,
        fullName: inv.client.fullName,
        phone: inv.client.phone,
      },
      booking: {
        id: inv.booking.id,
        reference: formatBookingReference(inv.booking.id),
        source: inv.booking.source,
        branchId: inv.booking.branchId,
        branchName: inv.booking.branch?.name ?? null,
        slot: inv.booking.slot
          ? presentBookingSlot(inv.booking.slot, inv.booking)
          : null,
      },
    };
  }

  mapInvoice(inv: {
    id: string;
    invoiceNumber: string;
    bookingId: string;
    clientId: string;
    subtotal: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
    discountReason: string | null;
    vatRate: Prisma.Decimal;
    vatAmount: Prisma.Decimal;
    totalAmount: Prisma.Decimal;
    paidAmount: Prisma.Decimal;
    remainingAmount: Prisma.Decimal;
    status: InvoiceStatus;
    paymentMethod: PaymentMethod | null;
    createdAt: Date;
    updatedAt: Date;
    lines?: Array<{
      id: string;
      sortOrder: number;
      itemType: string;
      serviceId: string | null;
      serviceVariantId: string | null;
      packageId: string | null;
      bundleId: string | null;
      serviceEnhancementId: string | null;
      nameSnapshot: string;
      priceSnapshot: Prisma.Decimal;
      durationMinutesSnapshot: number;
      quantity: number;
      lineMetadata: Prisma.JsonValue | null;
    }>;
  }) {
    return {
      ...this.mapInvoiceListRow(inv),
      lines:
        inv.lines?.map((ln) => ({
          id: ln.id,
          sortOrder: ln.sortOrder,
          itemType: ln.itemType,
          serviceId: ln.serviceId,
          serviceVariantId: ln.serviceVariantId,
          packageId: ln.packageId,
          bundleId: ln.bundleId,
          serviceEnhancementId: ln.serviceEnhancementId,
          nameSnapshot: ln.nameSnapshot,
          priceSnapshot: Number(ln.priceSnapshot.toString()),
          durationMinutesSnapshot: ln.durationMinutesSnapshot,
          quantity: ln.quantity,
          lineMetadata: ln.lineMetadata,
        })) ?? [],
    };
  }
}
