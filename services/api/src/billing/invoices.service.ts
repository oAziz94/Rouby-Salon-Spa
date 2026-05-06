import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceStatus, PaymentMethod, Prisma } from '@prisma/client';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { buildListMeta } from '../catalog/catalog.utils';
import { INVOICE_NUMBER_SEQUENCE_ID } from './billing.constants';
import {
  assertDashboardBranchAccess,
  canAccessAllBranches,
  resolveDashboardBranchFilter,
} from './dashboard-branch-scope';
import { decimalMaxZero, sumPaidPayments } from './payment-ledger.util';
import type { InvoiceListQueryDto } from './dto/invoice-list-query.dto';
import type { PatchInvoiceDto } from './dto/patch-invoice.dto';

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
    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { items: { orderBy: { createdAt: 'asc' } } },
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
              itemType: it.itemType,
              serviceId: it.serviceId,
              serviceVariantId: it.serviceVariantId,
              packageId: it.packageId,
              bundleId: it.bundleId,
              nameSnapshot: it.nameSnapshot,
              priceSnapshot: it.priceSnapshot,
              durationMinutesSnapshot: it.durationMinutesSnapshot,
              quantity: it.quantity,
              lineMetadata: it.lineMetadata ?? Prisma.JsonNull,
            })),
          },
        },
        include: { lines: { orderBy: { sortOrder: 'asc' } } },
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

      return this.mapInvoice(invoice);
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

    const branchFilter = resolveDashboardBranchFilter(user, query.branchId);
    const where: Prisma.InvoiceWhereInput = {};

    if (query.bookingId) {
      where.bookingId = query.bookingId;
    }
    if (query.clientId) {
      where.clientId = query.clientId;
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

    if (branchFilter) {
      where.booking = { branchId: branchFilter };
    } else if (!canAccessAllBranches(user) && user.branchId) {
      where.booking = { branchId: user.branchId };
    }

    const skip = (query.page - 1) * query.pageSize;
    const [totalItems, rows] = await Promise.all([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      data: rows.map((r) => this.mapInvoiceListRow(r)),
      meta: buildListMeta({
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
      }),
    };
  }

  async getDashboardOne(user: DashboardJwtUser, invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        lines: { orderBy: { sortOrder: 'asc' } },
        booking: { select: { branchId: true } },
      },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    assertDashboardBranchAccess(user, invoice.booking.branchId);
    const { booking, ...rest } = invoice;
    void booking;
    return this.mapInvoice(rest);
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

    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data,
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    });

    return this.mapInvoice(updated);
  }

  private mapInvoiceListRow(inv: {
    id: string;
    invoiceNumber: string;
    bookingId: string;
    clientId: string;
    subtotal: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
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
    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      bookingId: inv.bookingId,
      clientId: inv.clientId,
      subtotal: Number(inv.subtotal.toString()),
      discountAmount: Number(inv.discountAmount.toString()),
      vatRate: Number(inv.vatRate.toString()),
      vatAmount: Number(inv.vatAmount.toString()),
      totalAmount: Number(inv.totalAmount.toString()),
      paidAmount: Number(inv.paidAmount.toString()),
      remainingAmount: Number(inv.remainingAmount.toString()),
      status: inv.status,
      paymentMethod: inv.paymentMethod,
      currency: 'EGP',
      createdAt: inv.createdAt,
      updatedAt: inv.updatedAt,
    };
  }

  mapInvoice(inv: {
    id: string;
    invoiceNumber: string;
    bookingId: string;
    clientId: string;
    subtotal: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
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
          nameSnapshot: ln.nameSnapshot,
          priceSnapshot: Number(ln.priceSnapshot.toString()),
          durationMinutesSnapshot: ln.durationMinutesSnapshot,
          quantity: ln.quantity,
          lineMetadata: ln.lineMetadata,
        })) ?? [],
    };
  }
}
