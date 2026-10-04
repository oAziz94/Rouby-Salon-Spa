import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingSource,
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { presentBookingSlot } from '../common/cairo-slot-time';
import { PrismaService } from '../prisma/prisma.service';
import { buildListMeta } from '../catalog/catalog.utils';
import { SIMPLE_PAYMENT_STATUS_REFERENCE } from './billing.constants';
import {
  assertDashboardBranchAccess,
  buildDashboardBookingBranchWhere,
} from './dashboard-branch-scope';
import { lockBookingForPayments } from './booking-lock';
import { assertMoneyDayOpen } from './business-day-guard';
import {
  decimalMaxZero,
  sumPaidManualPayments,
  sumPaidPayments,
} from './payment-ledger.util';
import type { CreatePaymentDto } from './dto/create-payment.dto';
import type { SimplePaymentStatusDto } from './dto/simple-payment-status.dto';
import type { UpdatePaymentDto } from './dto/update-payment.dto';
import { InvoicesService } from './invoices.service';
import { AuditService } from '../audit/audit.service';
import type { CreateInvoicePaymentDto } from './dto/create-invoice-payment.dto';
import type { PaymentListQueryDto } from './dto/payment-list-query.dto';

function httpBusiness(
  status: HttpStatus,
  message: string,
  code: string,
): HttpException {
  return new HttpException(
    {
      statusCode: status,
      message,
      error: status === HttpStatus.BAD_REQUEST ? 'Bad Request' : 'Bad Request',
      code,
    },
    status,
  );
}

const ALLOWED_METHODS = new Set<PaymentMethod>([
  PaymentMethod.CASH,
  PaymentMethod.CARD,
  PaymentMethod.INSTAPAY,
  PaymentMethod.MOBILE_WALLET,
  PaymentMethod.BANK_TRANSFER,
]);

function assertAllowedMethod(method: PaymentMethod): void {
  if (!ALLOWED_METHODS.has(method)) {
    throw httpBusiness(
      HttpStatus.BAD_REQUEST,
      'This payment method is not supported',
      'PAYMENT_METHOD_NOT_ALLOWED',
    );
  }
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

function tryDashedUuid(compact: string): string | null {
  if (compact.length !== 32) {
    return null;
  }
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20, 32)}`;
}

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

function utcDayBounds(d: Date): { start: Date; end: Date } {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const start = new Date(Date.UTC(y, m, day, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, day, 23, 59, 59, 999));
  return { start, end };
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoicesService,
    private readonly audit: AuditService,
  ) {}

  private async requireBookingWithPayments(
    user: DashboardJwtUser,
    bookingId: string,
  ) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { payments: { orderBy: { createdAt: 'desc' } } },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    assertDashboardBranchAccess(user, booking.branchId);
    return booking;
  }

  async listForBooking(user: DashboardJwtUser, bookingId: string) {
    const booking = await this.requireBookingWithPayments(user, bookingId);
    return {
      bookingId: booking.id,
      payments: booking.payments.map((p) => this.mapPayment(p)),
    };
  }

  async listDashboard(user: DashboardJwtUser, query: PaymentListQueryDto) {
    const andParts: Prisma.PaymentWhereInput[] = [];

    const bookingBranchWhere = buildDashboardBookingBranchWhere(
      user,
      query.branchId,
    );
    if (Object.keys(bookingBranchWhere).length) {
      andParts.push({ booking: { is: bookingBranchWhere } });
    }

    if (query.method) {
      andParts.push({ method: query.method });
    }
    if (query.status) {
      andParts.push({ status: query.status });
    }

    const dateWin = this.paymentRecordedInRangeFilter(
      query.dateFrom,
      query.dateTo,
    );
    if (dateWin) {
      andParts.push(dateWin);
    }

    const searchBlock = this.buildPaymentSearchWhere(query.search);
    if (searchBlock) {
      andParts.push(searchBlock);
    }

    const where: Prisma.PaymentWhereInput =
      andParts.length > 0 ? { AND: andParts } : {};

    const page = query.page;
    const pageSize = query.pageSize;
    const skip = (page - 1) * pageSize;

    const paidWhere: Prisma.PaymentWhereInput = {
      AND: [where, { status: PaymentStatus.PAID }],
    };

    const { start: todayStart, end: todayEnd } = utcDayBounds(new Date());
    const paidTodayWhere: Prisma.PaymentWhereInput = {
      AND: [
        where,
        { status: PaymentStatus.PAID },
        {
          OR: [
            {
              paidAt: {
                gte: todayStart,
                lte: todayEnd,
              },
            },
            {
              AND: [
                { paidAt: null },
                {
                  createdAt: {
                    gte: todayStart,
                    lte: todayEnd,
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const [
      totalItems,
      rows,
      aggPaid,
      cashAgg,
      digitalAgg,
      todaySum,
      todayCount,
      outstandingAgg,
    ] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ createdAt: 'desc' }],
        include: {
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
              invoices: {
                where: { status: InvoiceStatus.FINALIZED },
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: {
                  id: true,
                  invoiceNumber: true,
                  totalAmount: true,
                  paidAmount: true,
                  remainingAmount: true,
                  status: true,
                },
              },
            },
          },
          createdByUser: { select: { id: true, name: true } },
        },
      }),
      this.prisma.payment.aggregate({
        where: paidWhere,
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          AND: [
            where,
            { status: PaymentStatus.PAID, method: PaymentMethod.CASH },
          ],
        },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          AND: [
            where,
            {
              status: PaymentStatus.PAID,
              method: {
                in: [
                  PaymentMethod.CARD,
                  PaymentMethod.INSTAPAY,
                  PaymentMethod.MOBILE_WALLET,
                  PaymentMethod.BANK_TRANSFER,
                ],
              },
            },
          ],
        },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: paidTodayWhere,
        _sum: { amount: true },
      }),
      this.prisma.payment.count({ where: paidTodayWhere }),
      this.outstandingInvoicesAggregate(user, bookingBranchWhere),
    ]);

    return {
      data: rows.map((r) => this.mapPaymentListRow(r)),
      meta: buildListMeta({ page, pageSize, totalItems }),
      summary: {
        totalCollected: Number(
          (aggPaid._sum.amount ?? new Prisma.Decimal(0)).toString(),
        ),
        cashCollected: Number(
          (cashAgg._sum.amount ?? new Prisma.Decimal(0)).toString(),
        ),
        cardDigitalCollected: Number(
          (digitalAgg._sum.amount ?? new Prisma.Decimal(0)).toString(),
        ),
        outstandingBalance: outstandingAgg,
        paymentsTodayCount: todayCount,
        paymentsTodayTotal: Number(
          (todaySum._sum.amount ?? new Prisma.Decimal(0)).toString(),
        ),
        /** Outstanding uses finalized invoices in the same branch scope as this list (ignores text/method filters). */
        outstandingScope: 'branch_finalized_invoices' as const,
      },
    };
  }

  async getDashboardDetail(user: DashboardJwtUser, paymentId: string) {
    const p = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
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
            items: {
              orderBy: { createdAt: 'asc' },
              select: { nameSnapshot: true, quantity: true },
            },
            invoices: {
              where: { status: InvoiceStatus.FINALIZED },
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: {
                id: true,
                invoiceNumber: true,
                totalAmount: true,
                paidAmount: true,
                remainingAmount: true,
                status: true,
              },
            },
          },
        },
        createdByUser: { select: { id: true, name: true } },
      },
    });
    if (!p) {
      throw new NotFoundException('Payment not found');
    }
    assertDashboardBranchAccess(user, p.booking.branchId);

    const inv = p.booking.invoices[0] ?? null;
    const servicesSummary = p.booking.items.length
      ? p.booking.items
          .map((it) =>
            it.quantity > 1
              ? `${it.nameSnapshot} ×${it.quantity}`
              : it.nameSnapshot,
          )
          .join(', ')
      : '';

    const slot = p.booking.slot;
    const slotPayload = slot ? presentBookingSlot(slot, p.booking) : null;

    const shortRef = `PAY-${p.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

    return {
      payment: {
        id: p.id,
        shortReference: shortRef,
        amount: Number(p.amount.toString()),
        method: p.method,
        status: p.status,
        reference: p.reference,
        notes: null as string | null,
        paidAt: p.paidAt ? p.paidAt.toISOString() : null,
        createdAt: p.createdAt.toISOString(),
        createdByUserId: p.createdByUserId,
        cashierName: p.createdByUser?.name ?? null,
      },
      invoice: inv
        ? {
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            status: inv.status,
            paymentStatus: deriveInvoicePaymentStatus(
              inv.totalAmount,
              inv.paidAmount,
              inv.remainingAmount,
            ),
            totalAmount: Number(inv.totalAmount.toString()),
            paidAmount: Number(inv.paidAmount.toString()),
            remainingAmount: Number(inv.remainingAmount.toString()),
          }
        : null,
      client: {
        id: p.client.id,
        fullName: p.client.fullName,
        phone: p.client.phone,
        email: p.client.email,
      },
      booking: {
        id: p.booking.id,
        reference: formatBookingReference(p.booking.id),
        source: p.booking.source,
        createdAt: p.booking.createdAt.toISOString(),
        servicesSummary,
        slot: slotPayload,
      },
      branch: {
        id: p.booking.branch?.id ?? p.booking.branchId,
        name: p.booking.branch?.name ?? null,
      },
    };
  }

  async recordPayment(
    user: DashboardJwtUser,
    bookingId: string,
    dto: CreatePaymentDto,
  ) {
    assertAllowedMethod(dto.method);
    if (dto.reference === SIMPLE_PAYMENT_STATUS_REFERENCE) {
      throw httpBusiness(
        HttpStatus.BAD_REQUEST,
        'Reserved reference value',
        'PAYMENT_REFERENCE_RESERVED',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await lockBookingForPayments(tx, bookingId);
      const booking = await tx.booking.findUnique({ where: { id: bookingId } });
      if (!booking) {
        throw new NotFoundException('Booking not found');
      }
      assertDashboardBranchAccess(user, booking.branchId);
      await assertMoneyDayOpen(
        tx,
        booking.branchId,
        dto.paidAt ? new Date(dto.paidAt) : new Date(),
        { cash: dto.method === PaymentMethod.CASH },
      );
      if (dto.status === PaymentStatus.PAID) {
        const invoice = await tx.invoice.findFirst({
          where: { bookingId, status: InvoiceStatus.FINALIZED },
        });
        if (
          invoice &&
          new Prisma.Decimal(dto.amount.toFixed(2)).greaterThan(
            invoice.remainingAmount,
          )
        ) {
          throw httpBusiness(
            HttpStatus.BAD_REQUEST,
            'Payment amount exceeds invoice remaining balance',
            'PAYMENT_EXCEEDS_REMAINING',
          );
        }
      }
      const payment = await tx.payment.create({
        data: {
          bookingId: booking.id,
          clientId: booking.clientId,
          amount: new Prisma.Decimal(dto.amount.toFixed(2)),
          method: dto.method,
          status: dto.status,
          reference: dto.reference ?? null,
          paidAt: dto.paidAt ? new Date(dto.paidAt) : null,
          createdByUserId: user.userId,
        },
      });

      await this.invoices.syncInvoicePaymentTotalsForBooking(tx, bookingId);
      await this.audit.log(
        {
          userId: user.userId,
          action: 'payment.recorded',
          module: 'billing',
          entityId: payment.id,
          newValue: {
            bookingId: payment.bookingId,
            amount: Number(payment.amount.toString()),
            method: payment.method,
            status: payment.status,
            reference: payment.reference,
          },
        },
        tx,
      );

      return this.mapPayment(payment);
    });
  }

  async recordPaymentForInvoice(
    user: DashboardJwtUser,
    invoiceId: string,
    dto: CreateInvoicePaymentDto,
    options?: { fromQueue?: boolean; queueEntryId?: string },
  ) {
    assertAllowedMethod(dto.method);
    if (dto.referenceNumber === SIMPLE_PAYMENT_STATUS_REFERENCE) {
      throw httpBusiness(
        HttpStatus.BAD_REQUEST,
        'Reserved reference value',
        'PAYMENT_REFERENCE_RESERVED',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const found = await tx.invoice.findUnique({
        where: { id: invoiceId },
        select: { bookingId: true },
      });
      if (!found) {
        throw new NotFoundException('Invoice not found');
      }
      // Lock first, then read the balance: parallel payments queue here instead of all fitting.
      await lockBookingForPayments(tx, found.bookingId);
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          booking: { select: { id: true, branchId: true, clientId: true } },
        },
      });
      if (!invoice) {
        throw new NotFoundException('Invoice not found');
      }
      assertDashboardBranchAccess(user, invoice.booking.branchId);
      if (invoice.status !== InvoiceStatus.FINALIZED) {
        throw httpBusiness(
          HttpStatus.BAD_REQUEST,
          'Invoice must be finalized before recording payments',
          'INVOICE_NOT_FINALIZED',
        );
      }
      await assertMoneyDayOpen(tx, invoice.booking.branchId, new Date(), {
        cash: dto.method === PaymentMethod.CASH,
      });

      const amount = new Prisma.Decimal(dto.amount.toFixed(2));
      if (amount.lessThanOrEqualTo(0)) {
        throw httpBusiness(
          HttpStatus.BAD_REQUEST,
          'Payment amount must be greater than zero',
          'INVALID_PAYMENT_AMOUNT',
        );
      }
      if (amount.greaterThan(invoice.remainingAmount)) {
        throw httpBusiness(
          HttpStatus.BAD_REQUEST,
          'Payment amount exceeds invoice remaining balance',
          'PAYMENT_EXCEEDS_REMAINING',
        );
      }

      const payment = await tx.payment.create({
        data: {
          bookingId: invoice.booking.id,
          clientId: invoice.booking.clientId,
          amount,
          method: dto.method,
          status: PaymentStatus.PAID,
          reference: dto.referenceNumber?.trim() || null,
          paidAt: new Date(),
          createdByUserId: user.userId,
        },
      });

      await this.invoices.syncInvoicePaymentTotalsForBooking(
        tx,
        invoice.booking.id,
      );
      const refreshedInvoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
      });
      if (!refreshedInvoice) {
        throw new NotFoundException('Invoice not found');
      }

      await this.audit.log(
        {
          userId: user.userId,
          action: options?.fromQueue
            ? 'payment.recorded_from_queue'
            : 'payment.recorded',
          module: 'billing',
          entityId: payment.id,
          newValue: {
            invoiceId,
            bookingId: payment.bookingId,
            queueEntryId: options?.queueEntryId ?? null,
            amount: Number(payment.amount.toString()),
            method: payment.method,
            referenceNumber: payment.reference,
            notes: dto.notes ?? null,
          },
        },
        tx,
      );

      return {
        payment: this.mapPayment(payment),
        invoice: this.invoices.mapInvoice(refreshedInvoice),
      };
    });
  }

  async updatePayment(
    user: DashboardJwtUser,
    paymentId: string,
    dto: UpdatePaymentDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const found = await tx.payment.findUnique({
        where: { id: paymentId },
        select: { bookingId: true },
      });
      if (!found) {
        throw new NotFoundException('Payment not found');
      }
      await lockBookingForPayments(tx, found.bookingId);
      const existing = await tx.payment.findUnique({
        where: { id: paymentId },
        include: { booking: { select: { branchId: true, id: true } } },
      });
      if (!existing) {
        throw new NotFoundException('Payment not found');
      }
      assertDashboardBranchAccess(user, existing.booking.branchId);

      if (dto.method !== undefined) {
        assertAllowedMethod(dto.method);
      }
      // The payment belongs to the day it was taken; a closed day or counted drawer is final.
      await assertMoneyDayOpen(
        tx,
        existing.booking.branchId,
        existing.paidAt ?? existing.createdAt,
        {
          cash:
            existing.method === PaymentMethod.CASH ||
            dto.method === PaymentMethod.CASH,
        },
      );
      if (dto.reference === SIMPLE_PAYMENT_STATUS_REFERENCE) {
        throw httpBusiness(
          HttpStatus.BAD_REQUEST,
          'Reserved reference value',
          'PAYMENT_REFERENCE_RESERVED',
        );
      }

      const hasPatch =
        dto.amount !== undefined ||
        dto.method !== undefined ||
        dto.status !== undefined ||
        dto.reference !== undefined ||
        dto.paidAt !== undefined;
      if (!hasPatch) {
        return this.mapPayment(existing);
      }

      const newAmount =
        dto.amount !== undefined
          ? new Prisma.Decimal(dto.amount.toFixed(2))
          : existing.amount;
      if (newAmount.lessThanOrEqualTo(0)) {
        throw httpBusiness(
          HttpStatus.BAD_REQUEST,
          'Payment amount must be greater than zero',
          'INVALID_PAYMENT_AMOUNT',
        );
      }
      if (
        existing.method === PaymentMethod.LOYALTY &&
        ((dto.amount !== undefined && !newAmount.equals(existing.amount)) ||
          (dto.method !== undefined && dto.method !== existing.method))
      ) {
        throw httpBusiness(
          HttpStatus.BAD_REQUEST,
          'A loyalty payment cannot be edited. Cancel it instead to give the points or reward back.',
          'LOYALTY_PAYMENT_NOT_EDITABLE',
        );
      }
      const newStatus = dto.status ?? existing.status;
      if (newStatus === PaymentStatus.PAID) {
        const invoice = await tx.invoice.findFirst({
          where: {
            bookingId: existing.booking.id,
            status: InvoiceStatus.FINALIZED,
          },
        });
        if (invoice) {
          const siblings = await tx.payment.findMany({
            where: { bookingId: existing.booking.id, id: { not: existing.id } },
          });
          const paidAfter = sumPaidPayments(siblings).add(newAmount);
          if (paidAfter.greaterThan(invoice.totalAmount)) {
            throw httpBusiness(
              HttpStatus.BAD_REQUEST,
              `This change would make the paid total (${paidAfter.toString()}) higher than the invoice total (${invoice.totalAmount.toString()}).`,
              'PAYMENT_EXCEEDS_INVOICE_TOTAL',
            );
          }
        }
      }

      const data: Prisma.PaymentUpdateInput = {};
      if (dto.amount !== undefined) {
        data.amount = newAmount;
      }
      if (dto.method !== undefined) {
        data.method = dto.method;
      }
      if (dto.status !== undefined) {
        data.status = dto.status;
      }
      if (dto.reference !== undefined) {
        data.reference = dto.reference;
      }
      if (dto.paidAt !== undefined) {
        data.paidAt = dto.paidAt ? new Date(dto.paidAt) : null;
      }

      const payment = await tx.payment.update({
        where: { id: paymentId },
        data,
      });

      await this.invoices.syncInvoicePaymentTotalsForBooking(
        tx,
        existing.booking.id,
      );
      await this.audit.log(
        {
          userId: user.userId,
          action:
            existing.status === PaymentStatus.PAID &&
            payment.status !== PaymentStatus.PAID
              ? 'payment.voided'
              : 'payment.updated',
          severity: 'WARNING',
          module: 'billing',
          entityId: payment.id,
          oldValue: {
            amount: Number(existing.amount.toString()),
            method: existing.method,
            status: existing.status,
            reference: existing.reference,
            paidAt: existing.paidAt?.toISOString() ?? null,
          },
          newValue: {
            amount: Number(payment.amount.toString()),
            method: payment.method,
            status: payment.status,
            reference: payment.reference,
            paidAt: payment.paidAt?.toISOString() ?? null,
          },
        },
        tx,
      );

      return this.mapPayment(payment);
    });
  }

  async applySimplePaymentStatus(
    user: DashboardJwtUser,
    bookingId: string,
    dto: SimplePaymentStatusDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await lockBookingForPayments(tx, bookingId);
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { payments: true },
      });
      if (!booking) {
        throw new NotFoundException('Booking not found');
      }
      assertDashboardBranchAccess(user, booking.branchId);

      const total = booking.totalAmount;
      const paidManual = sumPaidManualPayments(booking.payments);
      const remainder = decimalMaxZero(total.minus(paidManual));

      const simple = booking.payments.find(
        (p) => p.reference === SIMPLE_PAYMENT_STATUS_REFERENCE,
      );
      // Simple status is recorded as cash today, and may rewrite the earlier simple payment.
      await assertMoneyDayOpen(tx, booking.branchId, new Date(), {
        cash: true,
      });
      if (simple) {
        await assertMoneyDayOpen(
          tx,
          booking.branchId,
          simple.paidAt ?? simple.createdAt,
          { cash: true },
        );
      }

      if (dto.paymentStatus === 'UNPAID') {
        if (simple) {
          await tx.payment.update({
            where: { id: simple.id },
            data: { status: PaymentStatus.CANCELLED },
          });
        }
      } else if (dto.paymentStatus === 'PARTIALLY_PAID') {
        if (dto.amount === undefined) {
          throw httpBusiness(
            HttpStatus.BAD_REQUEST,
            'amount is required when paymentStatus is PARTIALLY_PAID',
            'SIMPLE_PAYMENT_AMOUNT_REQUIRED',
          );
        }
        const amt = new Prisma.Decimal(dto.amount.toFixed(2));
        if (amt.greaterThan(remainder)) {
          throw httpBusiness(
            HttpStatus.BAD_REQUEST,
            'amount exceeds remaining balance for simple payment',
            'SIMPLE_PAYMENT_AMOUNT_TOO_HIGH',
          );
        }
        if (simple) {
          await tx.payment.update({
            where: { id: simple.id },
            data: {
              amount: amt,
              status: PaymentStatus.PAID,
              method: PaymentMethod.CASH,
              reference: SIMPLE_PAYMENT_STATUS_REFERENCE,
              paidAt: new Date(),
              createdByUserId: user.userId,
            },
          });
        } else {
          await tx.payment.create({
            data: {
              bookingId: booking.id,
              clientId: booking.clientId,
              amount: amt,
              method: PaymentMethod.CASH,
              status: PaymentStatus.PAID,
              reference: SIMPLE_PAYMENT_STATUS_REFERENCE,
              paidAt: new Date(),
              createdByUserId: user.userId,
            },
          });
        }
      } else if (dto.paymentStatus === 'PAID') {
        if (Number(remainder.toString()) <= 0) {
          if (simple) {
            await tx.payment.update({
              where: { id: simple.id },
              data: { status: PaymentStatus.CANCELLED },
            });
          }
        } else if (simple) {
          await tx.payment.update({
            where: { id: simple.id },
            data: {
              amount: remainder,
              status: PaymentStatus.PAID,
              method: PaymentMethod.CASH,
              reference: SIMPLE_PAYMENT_STATUS_REFERENCE,
              paidAt: new Date(),
              createdByUserId: user.userId,
            },
          });
        } else {
          await tx.payment.create({
            data: {
              bookingId: booking.id,
              clientId: booking.clientId,
              amount: remainder,
              method: PaymentMethod.CASH,
              status: PaymentStatus.PAID,
              reference: SIMPLE_PAYMENT_STATUS_REFERENCE,
              paidAt: new Date(),
              createdByUserId: user.userId,
            },
          });
        }
      }

      await this.invoices.syncInvoicePaymentTotalsForBooking(tx, bookingId);

      const payments = await tx.payment.findMany({
        where: { bookingId },
        orderBy: { createdAt: 'desc' },
      });
      return {
        bookingId,
        paymentStatus: dto.paymentStatus,
        payments: payments.map((p) => this.mapPayment(p)),
      };
    });
  }

  private paymentRecordedInRangeFilter(
    dateFrom?: string,
    dateTo?: string,
  ): Prisma.PaymentWhereInput | undefined {
    if (!dateFrom && !dateTo) return undefined;
    const gte = dateFrom ? new Date(dateFrom) : undefined;
    let lte: Date | undefined;
    if (dateTo) {
      lte = new Date(dateTo);
      lte.setUTCHours(23, 59, 59, 999);
    }
    const paidAtFilter: Prisma.DateTimeNullableFilter = { not: null };
    if (gte) paidAtFilter.gte = gte;
    if (lte) paidAtFilter.lte = lte;
    const createdFilter: Prisma.DateTimeFilter = {};
    if (gte) createdFilter.gte = gte;
    if (lte) createdFilter.lte = lte;
    return {
      OR: [
        { paidAt: paidAtFilter },
        { AND: [{ paidAt: null }, { createdAt: createdFilter }] },
      ],
    };
  }

  private buildPaymentSearchWhere(
    raw?: string,
  ): Prisma.PaymentWhereInput | undefined {
    const search = raw?.trim();
    if (!search) return undefined;
    const ors: Prisma.PaymentWhereInput[] = [
      { reference: { contains: search, mode: 'insensitive' } },
      {
        client: {
          fullName: { contains: search, mode: 'insensitive' },
        },
      },
    ];
    const phoneDigits = search.replace(/\D/g, '');
    if (phoneDigits.length >= 3) {
      ors.push({
        client: {
          phone: { contains: phoneDigits },
        },
      });
    }
    ors.push({
      booking: {
        invoices: {
          some: {
            status: InvoiceStatus.FINALIZED,
            invoiceNumber: { contains: search, mode: 'insensitive' },
          },
        },
      },
    });
    const compact = extractBookingIdSearchCompact(search);
    if (compact) {
      const dashed = tryDashedUuid(compact);
      if (dashed) {
        ors.push({ bookingId: dashed });
      }
    }
    return { OR: ors };
  }

  private async outstandingInvoicesAggregate(
    user: DashboardJwtUser,
    bookingBranchWhere: Prisma.BookingWhereInput,
  ): Promise<number> {
    const invWhere: Prisma.InvoiceWhereInput = {
      status: InvoiceStatus.FINALIZED,
      remainingAmount: { gt: new Prisma.Decimal(0) },
    };
    if (Object.keys(bookingBranchWhere).length) {
      invWhere.booking = { is: bookingBranchWhere };
    }
    const r = await this.prisma.invoice.aggregate({
      where: invWhere,
      _sum: { remainingAmount: true },
    });
    return Number((r._sum.remainingAmount ?? new Prisma.Decimal(0)).toString());
  }

  private mapPaymentListRow(p: {
    id: string;
    amount: Prisma.Decimal;
    method: PaymentMethod;
    status: PaymentStatus;
    reference: string | null;
    paidAt: Date | null;
    createdAt: Date;
    client: {
      id: string;
      fullName: string;
      phone: string;
      email: string | null;
    };
    booking: {
      id: string;
      source: BookingSource;
      createdAt: Date;
      branchId: string;
      branch: { id: string; name: string | null } | null;
      slot: {
        date: Date;
        startTime: Date;
        endTime: Date;
      } | null;
      invoices: Array<{
        id: string;
        invoiceNumber: string;
        totalAmount: Prisma.Decimal;
        paidAmount: Prisma.Decimal;
        remainingAmount: Prisma.Decimal;
        status: InvoiceStatus;
      }>;
    };
    createdByUser: { id: string; name: string } | null;
  }) {
    const inv = p.booking.invoices[0];
    const shortRef = `PAY-${p.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
    const displayRef =
      p.reference && p.reference.trim().length > 0
        ? p.reference.trim()
        : shortRef;
    let invoicePaymentStatus: InvoicePaymentSummaryStatus | null = null;
    let invoiceTotal: number | null = null;
    let invoiceNumber: string | null = null;
    let invoiceId: string | null = null;
    if (inv) {
      invoicePaymentStatus = deriveInvoicePaymentStatus(
        inv.totalAmount,
        inv.paidAmount,
        inv.remainingAmount,
      );
      invoiceTotal = Number(inv.totalAmount.toString());
      invoiceNumber = inv.invoiceNumber;
      invoiceId = inv.id;
    }
    const slot = p.booking.slot;
    const paidAtIso = p.paidAt ? p.paidAt.toISOString() : null;
    const bookingSlot = slot ? presentBookingSlot(slot, p.booking) : null;
    return {
      paymentId: p.id,
      paymentReference: displayRef,
      shortPaymentId: shortRef,
      amount: Number(p.amount.toString()),
      method: p.method,
      status: p.status,
      notes: null as string | null,
      paidAt: paidAtIso,
      recordedAt: p.createdAt.toISOString(),
      invoiceId,
      invoiceNumber,
      invoiceTotal,
      invoicePaymentStatus,
      clientName: p.client.fullName,
      clientPhone: p.client.phone,
      bookingId: p.booking.id,
      bookingReference: formatBookingReference(p.booking.id),
      bookingSource: p.booking.source,
      bookingCreatedAt: p.booking.createdAt.toISOString(),
      bookingSlot,
      branchName: p.booking.branch?.name ?? null,
      branchId: p.booking.branchId,
      cashierName: p.createdByUser?.name ?? null,
    };
  }

  private mapPayment(p: {
    id: string;
    bookingId: string;
    clientId: string;
    amount: Prisma.Decimal;
    method: PaymentMethod;
    status: PaymentStatus;
    reference: string | null;
    paidAt: Date | null;
    createdByUserId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: p.id,
      bookingId: p.bookingId,
      clientId: p.clientId,
      amount: Number(p.amount.toString()),
      method: p.method,
      status: p.status,
      reference: p.reference,
      paidAt: p.paidAt,
      createdByUserId: p.createdByUserId,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }
}
