import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { PrismaService } from '../prisma/prisma.service';
import { SIMPLE_PAYMENT_STATUS_REFERENCE } from './billing.constants';
import { assertDashboardBranchAccess } from './dashboard-branch-scope';
import { decimalMaxZero, sumPaidManualPayments } from './payment-ledger.util';
import type { CreatePaymentDto } from './dto/create-payment.dto';
import type { SimplePaymentStatusDto } from './dto/simple-payment-status.dto';
import type { UpdatePaymentDto } from './dto/update-payment.dto';
import { InvoicesService } from './invoices.service';
import { AuditService } from '../audit/audit.service';

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
      const booking = await tx.booking.findUnique({ where: { id: bookingId } });
      if (!booking) {
        throw new NotFoundException('Booking not found');
      }
      assertDashboardBranchAccess(user, booking.branchId);
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

  async updatePayment(
    user: DashboardJwtUser,
    paymentId: string,
    dto: UpdatePaymentDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
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

      const data: Prisma.PaymentUpdateInput = {};
      if (dto.amount !== undefined) {
        data.amount = new Prisma.Decimal(dto.amount.toFixed(2));
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
          action: 'payment.recorded',
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
