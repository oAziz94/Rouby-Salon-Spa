import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingChangeRequestStatus,
  BookingChangeRequestType,
  BookingItemType,
  BookingSource,
  BookingStatus,
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import type { ClientJwtUser } from '../auth/client-jwt-user';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { isAtLeast24HoursBeforeSlotStartCairo } from '../common/cairo-slot-time';
import { PrismaService } from '../prisma/prisma.service';
import { SlotsService } from '../slots/slots.service';
import {
  BookingPricingService,
  type ResolvedBookingLine,
} from './booking-pricing.service';
import type { BookingItemInputDto } from './dto/booking-item-input.dto';
import type { ChangeRequestListQueryDto } from './dto/change-request-list-query.dto';
import type { ClientBookingListQueryDto } from './dto/client-booking-list-query.dto';
import type { ClientRescheduleRequestDto } from './dto/client-reschedule-request.dto';
import type { DashboardBookingListQueryDto } from './dto/dashboard-booking-list-query.dto';
import type { DashboardCreateBookingDto } from './dto/dashboard-create-booking.dto';
import type { DiscountBodyDto } from './dto/discount-body.dto';
import type {
  PublicBookingCreateBodyDto,
  PublicBookingEstimateBodyDto,
} from './dto/booking-item-input.dto';
import type { RescheduleBodyDto } from './dto/reschedule-body.dto';
import { buildListMeta } from '../catalog/catalog.utils';
import {
  decimalMaxZero,
  sumPaidPayments,
} from '../billing/payment-ledger.util';

function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function countsTowardCapacity(status: BookingStatus): boolean {
  return (
    status === BookingStatus.CONFIRMED ||
    status === BookingStatus.RESCHEDULED ||
    status === BookingStatus.ARRIVED ||
    status === BookingStatus.IN_PROGRESS
  );
}

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: BookingPricingService,
    private readonly slots: SlotsService,
  ) {}

  // --- Sprint 9: persist AuditLog rows for booking lifecycle events (TODO placeholders only). ---
  // private auditBookingEvent(...): void {}

  private canAccessAllBranches(user: DashboardJwtUser): boolean {
    return (
      user.branchId === null || user.permissions.includes('branches.manage')
    );
  }

  private assertDashboardBranchAccess(
    user: DashboardJwtUser,
    branchId: string,
  ): void {
    if (this.canAccessAllBranches(user)) {
      return;
    }
    if (user.branchId !== branchId) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }

  private resolveDashboardBranchFilter(
    user: DashboardJwtUser,
    queryBranchId?: string,
  ): string | undefined {
    if (this.canAccessAllBranches(user)) {
      return queryBranchId;
    }
    return user.branchId ?? undefined;
  }

  async estimatePublic(body: PublicBookingEstimateBodyDto) {
    const settings = await this.pricing.getSystemSettings();
    const lines = await this.pricing.resolveLines(body.branchId, body.items);
    const totals = this.pricing.computeTotals(lines, settings, 0);
    return {
      subtotal: Number(totals.subtotal.toString()),
      discountAmount: Number(totals.discountAmount.toString()),
      vatRate: Number(totals.vatRate.toString()),
      vatAmount: Number(totals.vatAmount.toString()),
      totalAmount: Number(totals.totalAmount.toString()),
      currency: 'EGP',
      pricesIncludeVat: settings.pricesIncludeVat,
    };
  }

  async createPublicBooking(
    client: ClientJwtUser,
    body: PublicBookingCreateBodyDto,
  ) {
    const dbClient = await this.prisma.client.findUnique({
      where: { id: client.clientId },
    });
    if (!dbClient?.phone?.trim()) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Phone number is required before booking submission',
          error: 'Bad Request',
          code: 'CLIENT_PHONE_REQUIRED',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.slots.assertSlotPubliclyBookable(body.branchId, body.slotId);

    const settings = await this.pricing.getSystemSettings();
    const lines = await this.pricing.resolveLines(body.branchId, body.items);
    const totals = this.pricing.computeTotals(lines, settings, 0);

    const booking = await this.prisma.booking.create({
      data: {
        clientId: client.clientId,
        branchId: body.branchId,
        slotId: body.slotId,
        status: BookingStatus.PENDING,
        source: BookingSource.WEBSITE,
        subtotal: totals.subtotal,
        discountAmount: totals.discountAmount,
        vatRate: totals.vatRate,
        vatAmount: totals.vatAmount,
        totalAmount: totals.totalAmount,
        clientNotes: body.clientNotes ?? null,
        adminNotes: null,
        createdByUserId: null,
        items: {
          create: lines.map((l) => ({
            itemType: l.itemType,
            serviceId: l.serviceId,
            serviceVariantId: l.serviceVariantId,
            packageId: l.packageId,
            bundleId: l.bundleId,
            nameSnapshot: l.nameSnapshot,
            priceSnapshot: l.priceSnapshot,
            durationMinutesSnapshot: l.durationMinutesSnapshot,
            quantity: l.quantity,
            lineMetadata: l.lineMetadata ?? Prisma.JsonNull,
          })),
        },
      },
      select: {
        id: true,
        status: true,
        branchId: true,
        slotId: true,
        totalAmount: true,
        createdAt: true,
      },
    });

    return {
      id: booking.id,
      status: booking.status,
      branchId: booking.branchId,
      slotId: booking.slotId,
      totalAmount: Number(booking.totalAmount.toString()),
      currency: 'EGP',
      createdAt: booking.createdAt,
    };
  }

  async listClientBookings(
    client: ClientJwtUser,
    query: ClientBookingListQueryDto,
  ) {
    const where: Prisma.BookingWhereInput = { clientId: client.clientId };
    if (query.status) {
      where.status = query.status;
    }
    const skip = (query.page - 1) * query.pageSize;
    const [totalItems, rows] = await Promise.all([
      this.prisma.booking.count({ where }),
      this.prisma.booking.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          branchId: true,
          slotId: true,
          totalAmount: true,
          createdAt: true,
        },
      }),
    ]);
    return {
      data: rows.map((b) => ({
        ...b,
        totalAmount: Number(b.totalAmount.toString()),
        currency: 'EGP',
      })),
      meta: buildListMeta({
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
      }),
    };
  }

  async getClientBooking(client: ClientJwtUser, bookingId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, clientId: client.clientId },
      include: {
        items: true,
        slot: true,
      },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    return this.mapBookingDetail(booking);
  }

  async createCancellationRequest(client: ClientJwtUser, bookingId: string) {
    const booking = await this.getOwnedBookingOrThrow(
      client.clientId,
      bookingId,
    );
    this.assertClientChangeWindow(booking);

    const dup = await this.prisma.bookingChangeRequest.findFirst({
      where: {
        bookingId,
        requestType: BookingChangeRequestType.CANCEL,
        status: BookingChangeRequestStatus.PENDING,
      },
    });
    if (dup) {
      throw new ConflictException(
        'A pending cancellation request already exists for this booking',
      );
    }

    const row = await this.prisma.bookingChangeRequest.create({
      data: {
        bookingId,
        clientId: client.clientId,
        requestType: BookingChangeRequestType.CANCEL,
        requestedSlotId: null,
        status: BookingChangeRequestStatus.PENDING,
      },
      select: {
        id: true,
        bookingId: true,
        requestType: true,
        status: true,
        createdAt: true,
      },
    });
    return row;
  }

  async createRescheduleRequest(
    client: ClientJwtUser,
    bookingId: string,
    body: ClientRescheduleRequestDto,
  ) {
    const booking = await this.getOwnedBookingOrThrow(
      client.clientId,
      bookingId,
    );
    this.assertClientChangeWindow(booking);

    const dup = await this.prisma.bookingChangeRequest.findFirst({
      where: {
        bookingId,
        requestType: BookingChangeRequestType.RESCHEDULE,
        status: BookingChangeRequestStatus.PENDING,
      },
    });
    if (dup) {
      throw new ConflictException(
        'A pending reschedule request already exists for this booking',
      );
    }

    const slot = await this.prisma.bookingSlot.findFirst({
      where: {
        id: body.requestedSlotId,
        branchId: booking.branchId,
        deletedAt: null,
      },
    });
    if (!slot) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Requested slot is not valid for this branch',
          error: 'Bad Request',
          code: 'INVALID_REQUESTED_SLOT',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const row = await this.prisma.bookingChangeRequest.create({
      data: {
        bookingId,
        clientId: client.clientId,
        requestType: BookingChangeRequestType.RESCHEDULE,
        requestedSlotId: body.requestedSlotId,
        reason: body.reason ?? null,
        status: BookingChangeRequestStatus.PENDING,
      },
      select: {
        id: true,
        bookingId: true,
        requestType: true,
        status: true,
        requestedSlotId: true,
        createdAt: true,
      },
    });
    return row;
  }

  async listDashboardBookings(
    user: DashboardJwtUser,
    query: DashboardBookingListQueryDto,
  ) {
    // TODO(Sprint 5): Specialist "Own" scope — filter via assigned staff lines when Staff/User linkage exists (RBAC_MATRIX §3.2).
    const branchFilter = this.resolveDashboardBranchFilter(
      user,
      query.branchId,
    );
    if (!this.canAccessAllBranches(user) && !branchFilter) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const where: Prisma.BookingWhereInput = {};
    if (branchFilter) {
      where.branchId = branchFilter;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.clientId) {
      where.clientId = query.clientId;
    }
    if (query.slotId) {
      where.slotId = query.slotId;
    }
    if (query.dateFrom || query.dateTo) {
      const dateFilter: Prisma.DateTimeFilter = {};
      if (query.dateFrom) {
        dateFilter.gte = parseDateOnly(query.dateFrom);
      }
      if (query.dateTo) {
        dateFilter.lte = parseDateOnly(query.dateTo);
      }
      where.slot = { date: dateFilter };
    }

    const skip = (query.page - 1) * query.pageSize;
    const [totalItems, rows] = await Promise.all([
      this.prisma.booking.count({ where }),
      this.prisma.booking.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          branchId: true,
          slotId: true,
          clientId: true,
          source: true,
          totalAmount: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      data: rows.map((b) => ({
        ...b,
        totalAmount: Number(b.totalAmount.toString()),
        currency: 'EGP',
      })),
      meta: buildListMeta({
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
      }),
    };
  }

  async getDashboardBooking(user: DashboardJwtUser, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        items: true,
        slot: true,
        client: true,
        payments: { orderBy: { createdAt: 'desc' } },
        invoices: {
          where: { status: InvoiceStatus.FINALIZED },
          take: 1,
          select: {
            id: true,
            invoiceNumber: true,
            paidAmount: true,
            remainingAmount: true,
            status: true,
          },
        },
      },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    this.assertDashboardBranchAccess(user, booking.branchId);
    return this.mapBookingDetail(booking);
  }

  async dashboardCreateBooking(
    user: DashboardJwtUser,
    dto: DashboardCreateBookingDto,
  ) {
    this.assertDashboardBranchAccess(user, dto.branchId);
    if (dto.source === BookingSource.WEBSITE) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Dashboard bookings cannot use WEBSITE source',
          error: 'Bad Request',
          code: 'INVALID_BOOKING_SOURCE',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const initialStatus = dto.initialStatus ?? BookingStatus.PENDING;

    await this.assertDashboardSlotAssignable(dto.branchId, dto.slotId);

    const settings = await this.pricing.getSystemSettings();
    const lines = await this.pricing.resolveLines(dto.branchId, dto.items);
    const totals = this.pricing.computeTotals(lines, settings, 0);

    const booking = await this.prisma.$transaction(
      async (tx) => {
        const created = await tx.booking.create({
          data: {
            clientId: dto.clientId,
            branchId: dto.branchId,
            slotId: dto.slotId,
            status: initialStatus,
            source: dto.source,
            subtotal: totals.subtotal,
            discountAmount: totals.discountAmount,
            vatRate: totals.vatRate,
            vatAmount: totals.vatAmount,
            totalAmount: totals.totalAmount,
            clientNotes: dto.clientNotes ?? null,
            adminNotes: dto.adminNotes ?? null,
            createdByUserId: user.userId,
            items: {
              create: lines.map((l) => ({
                itemType: l.itemType,
                serviceId: l.serviceId,
                serviceVariantId: l.serviceVariantId,
                packageId: l.packageId,
                bundleId: l.bundleId,
                nameSnapshot: l.nameSnapshot,
                priceSnapshot: l.priceSnapshot,
                durationMinutesSnapshot: l.durationMinutesSnapshot,
                quantity: l.quantity,
                lineMetadata: l.lineMetadata ?? Prisma.JsonNull,
              })),
            },
          },
          include: { items: true, slot: true, client: true },
        });

        if (countsTowardCapacity(initialStatus)) {
          await this.assertSlotHasCapacity(tx, dto.slotId);
          await tx.bookingSlot.update({
            where: { id: dto.slotId },
            data: { bookedCount: { increment: 1 } },
          });
        }

        return created;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 10_000,
      },
    );

    return this.mapBookingDetail(booking);
  }

  async confirmBooking(user: DashboardJwtUser, bookingId: string) {
    // TODO(Sprint 9): AuditLog `booking.confirmed` with before/after payload (BOOKING_ENGINE_RULES §20).
    await this.mutateBookingStatus(user, bookingId, async (tx, booking) => {
      if (booking.status !== BookingStatus.PENDING) {
        throw new HttpException(
          {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'Only PENDING bookings can be confirmed',
            error: 'Bad Request',
            code: 'INVALID_STATUS_TRANSITION',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      await this.assertSlotHasCapacity(tx, booking.slotId);
      await tx.bookingSlot.update({
        where: { id: booking.slotId },
        data: { bookedCount: { increment: 1 } },
      });
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: BookingStatus.CONFIRMED },
      });
    });
    return this.getDashboardBooking(user, bookingId);
  }

  async rejectBooking(user: DashboardJwtUser, bookingId: string) {
    await this.mutateBookingStatus(user, bookingId, async (tx, booking) => {
      if (booking.status !== BookingStatus.PENDING) {
        throw new HttpException(
          {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'Only PENDING bookings can be rejected',
            error: 'Bad Request',
            code: 'INVALID_STATUS_TRANSITION',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: BookingStatus.REJECTED },
      });
    });
    return this.getDashboardBooking(user, bookingId);
  }

  async requireFollowUp(user: DashboardJwtUser, bookingId: string) {
    await this.mutateBookingStatus(user, bookingId, async (tx, booking) => {
      if (booking.status !== BookingStatus.PENDING) {
        throw new HttpException(
          {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'Only PENDING bookings can be moved to REQUIRES_FOLLOW_UP',
            error: 'Bad Request',
            code: 'INVALID_STATUS_TRANSITION',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: BookingStatus.REQUIRES_FOLLOW_UP },
      });
    });
    return this.getDashboardBooking(user, bookingId);
  }

  async rescheduleBooking(
    user: DashboardJwtUser,
    bookingId: string,
    body: RescheduleBodyDto,
  ) {
    await this.mutateBookingStatus(user, bookingId, async (tx) => {
      await this.rescheduleBookingTx(tx, bookingId, body.slotId);
    });
    return this.getDashboardBooking(user, bookingId);
  }

  async confirmReschedule(user: DashboardJwtUser, bookingId: string) {
    await this.mutateBookingStatus(user, bookingId, async (tx, booking) => {
      if (booking.status !== BookingStatus.RESCHEDULED) {
        throw new HttpException(
          {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'Only RESCHEDULED bookings can be confirm-rescheduled',
            error: 'Bad Request',
            code: 'INVALID_STATUS_TRANSITION',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: BookingStatus.CONFIRMED },
      });
    });
    return this.getDashboardBooking(user, bookingId);
  }

  async cancelBooking(user: DashboardJwtUser, bookingId: string) {
    await this.mutateBookingStatus(user, bookingId, async (tx) => {
      await this.cancelBookingTx(tx, bookingId);
    });
    return this.getDashboardBooking(user, bookingId);
  }

  async markArrived(user: DashboardJwtUser, bookingId: string) {
    await this.transitionProgress(user, bookingId, {
      from: new Set([BookingStatus.CONFIRMED, BookingStatus.RESCHEDULED]),
      to: BookingStatus.ARRIVED,
      adjustCapacity: false,
    });
    return this.getDashboardBooking(user, bookingId);
  }

  async markInProgress(user: DashboardJwtUser, bookingId: string) {
    await this.transitionProgress(user, bookingId, {
      from: new Set([BookingStatus.ARRIVED]),
      to: BookingStatus.IN_PROGRESS,
      adjustCapacity: false,
    });
    return this.getDashboardBooking(user, bookingId);
  }

  async markCompleted(user: DashboardJwtUser, bookingId: string) {
    await this.transitionProgress(user, bookingId, {
      from: new Set([BookingStatus.IN_PROGRESS, BookingStatus.ARRIVED]),
      to: BookingStatus.COMPLETED,
      adjustCapacity: true,
    });
    return this.getDashboardBooking(user, bookingId);
  }

  async markNoShow(user: DashboardJwtUser, bookingId: string) {
    await this.transitionProgress(user, bookingId, {
      from: new Set([BookingStatus.CONFIRMED, BookingStatus.RESCHEDULED]),
      to: BookingStatus.NO_SHOW,
      adjustCapacity: true,
    });
    return this.getDashboardBooking(user, bookingId);
  }

  async recalculatePricing(user: DashboardJwtUser, bookingId: string) {
    const booking = await this.requireDashboardBooking(user, bookingId);
    if (booking.status !== BookingStatus.PENDING) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Pricing can only be recalculated for PENDING bookings',
          error: 'Bad Request',
          code: 'NOT_PENDING',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const dtoItems = await this.bookingItemsToDtoInputs(bookingId);

    const settings = await this.pricing.getSystemSettings();
    const lines = await this.pricing.resolveLines(booking.branchId, dtoItems);
    const totals = this.pricing.computeTotals(
      lines,
      settings,
      Number(booking.discountAmount.toString()),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.bookingItem.deleteMany({ where: { bookingId } });
      await tx.bookingItem.createMany({
        data: lines.map((l) => ({
          bookingId,
          itemType: l.itemType,
          serviceId: l.serviceId,
          serviceVariantId: l.serviceVariantId,
          packageId: l.packageId,
          bundleId: l.bundleId,
          nameSnapshot: l.nameSnapshot,
          priceSnapshot: l.priceSnapshot,
          durationMinutesSnapshot: l.durationMinutesSnapshot,
          quantity: l.quantity,
          lineMetadata: l.lineMetadata ?? Prisma.JsonNull,
        })),
      });
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          subtotal: totals.subtotal,
          discountAmount: totals.discountAmount,
          vatRate: totals.vatRate,
          vatAmount: totals.vatAmount,
          totalAmount: totals.totalAmount,
        },
      });
    });

    return this.getDashboardBooking(user, bookingId);
  }

  async applyDiscount(
    user: DashboardJwtUser,
    bookingId: string,
    body: DiscountBodyDto,
  ) {
    const booking = await this.requireDashboardBooking(user, bookingId);
    if (
      booking.status === BookingStatus.CANCELLED ||
      booking.status === BookingStatus.REJECTED
    ) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Cannot apply discount to a cancelled/rejected booking',
          error: 'Bad Request',
          code: 'INVALID_BOOKING_STATE',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const settings = await this.pricing.getSystemSettings();
    const lines = await this.buildResolvedLinesFromPersistedItems(bookingId);
    const totals = this.pricing.computeTotals(
      lines,
      settings,
      body.discountAmount,
    );

    await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        discountAmount: totals.discountAmount,
        vatRate: totals.vatRate,
        vatAmount: totals.vatAmount,
        totalAmount: totals.totalAmount,
        subtotal: totals.subtotal,
      },
    });

    return this.getDashboardBooking(user, bookingId);
  }

  async listChangeRequests(
    user: DashboardJwtUser,
    query: ChangeRequestListQueryDto,
  ) {
    const branchFilter = this.resolveDashboardBranchFilter(
      user,
      query.branchId,
    );
    if (!this.canAccessAllBranches(user) && !branchFilter) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const where: Prisma.BookingChangeRequestWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.bookingId) {
      where.bookingId = query.bookingId;
    }
    if (branchFilter) {
      where.booking = { branchId: branchFilter };
    }

    const skip = (query.page - 1) * query.pageSize;
    const [totalItems, rows] = await Promise.all([
      this.prisma.bookingChangeRequest.count({ where }),
      this.prisma.bookingChangeRequest.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          booking: {
            select: { id: true, branchId: true, status: true, slotId: true },
          },
        },
      }),
    ]);

    return {
      data: rows.map((r) => ({
        id: r.id,
        bookingId: r.bookingId,
        clientId: r.clientId,
        requestType: r.requestType,
        requestedSlotId: r.requestedSlotId,
        status: r.status,
        reason: r.reason,
        createdAt: r.createdAt,
        booking: r.booking,
      })),
      meta: buildListMeta({
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
      }),
    };
  }

  async getChangeRequest(user: DashboardJwtUser, requestId: string) {
    const row = await this.prisma.bookingChangeRequest.findUnique({
      where: { id: requestId },
      include: {
        booking: { include: { slot: true, client: true } },
        requestedSlot: true,
      },
    });
    if (!row) {
      throw new NotFoundException('Change request not found');
    }
    this.assertDashboardBranchAccess(user, row.booking.branchId);
    return row;
  }

  async approveChangeRequest(user: DashboardJwtUser, requestId: string) {
    await this.prisma.$transaction(
      async (tx) => {
        const row = await tx.bookingChangeRequest.findUnique({
          where: { id: requestId },
          include: { booking: true },
        });
        if (!row) {
          throw new NotFoundException('Change request not found');
        }
        this.assertDashboardBranchAccess(user, row.booking.branchId);

        if (row.status !== BookingChangeRequestStatus.PENDING) {
          throw new HttpException(
            {
              statusCode: HttpStatus.BAD_REQUEST,
              message: 'Only PENDING change requests can be approved',
              error: 'Bad Request',
              code: 'INVALID_REQUEST_STATUS',
            },
            HttpStatus.BAD_REQUEST,
          );
        }

        if (row.requestType === BookingChangeRequestType.CANCEL) {
          if (!user.permissions.includes('bookings.cancel')) {
            throw new ForbiddenException('Insufficient permissions');
          }
          await this.cancelBookingTx(tx, row.bookingId);
        } else {
          if (!user.permissions.includes('bookings.reschedule')) {
            throw new ForbiddenException('Insufficient permissions');
          }
          if (!row.requestedSlotId) {
            throw new HttpException(
              {
                statusCode: HttpStatus.BAD_REQUEST,
                message: 'Reschedule request is missing requestedSlotId',
                error: 'Bad Request',
                code: 'INVALID_REQUEST',
              },
              HttpStatus.BAD_REQUEST,
            );
          }
          await this.rescheduleBookingTx(
            tx,
            row.bookingId,
            row.requestedSlotId,
          );
        }

        await tx.bookingChangeRequest.update({
          where: { id: requestId },
          data: {
            status: BookingChangeRequestStatus.APPROVED,
            handledByUserId: user.userId,
            handledAt: new Date(),
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 10_000,
      },
    );

    return this.getChangeRequest(user, requestId);
  }

  async rejectChangeRequest(user: DashboardJwtUser, requestId: string) {
    const row = await this.getChangeRequest(user, requestId);
    if (row.status !== BookingChangeRequestStatus.PENDING) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Only PENDING change requests can be rejected',
          error: 'Bad Request',
          code: 'INVALID_REQUEST_STATUS',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.prisma.bookingChangeRequest.update({
      where: { id: requestId },
      data: {
        status: BookingChangeRequestStatus.REJECTED,
        handledByUserId: user.userId,
        handledAt: new Date(),
      },
    });
    return this.getChangeRequest(user, requestId);
  }

  async cancelChangeRequest(user: DashboardJwtUser, requestId: string) {
    const row = await this.getChangeRequest(user, requestId);
    if (row.status !== BookingChangeRequestStatus.PENDING) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Only PENDING change requests can be cancelled',
          error: 'Bad Request',
          code: 'INVALID_REQUEST_STATUS',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.prisma.bookingChangeRequest.update({
      where: { id: requestId },
      data: {
        status: BookingChangeRequestStatus.CANCELLED,
        handledByUserId: user.userId,
        handledAt: new Date(),
      },
    });
    return this.getChangeRequest(user, requestId);
  }

  private async bookingItemsToDtoInputs(
    bookingId: string,
  ): Promise<BookingItemInputDto[]> {
    const items = await this.prisma.bookingItem.findMany({
      where: { bookingId },
      orderBy: { createdAt: 'asc' },
    });
    return items.map((it) => {
      const meta = it.lineMetadata as { selectedServiceIds?: string[] } | null;
      return {
        itemType: it.itemType,
        serviceId: it.serviceId ?? undefined,
        serviceVariantId: it.serviceVariantId ?? undefined,
        packageId: it.packageId ?? undefined,
        bundleId: it.bundleId ?? undefined,
        quantity: it.quantity,
        selectedServiceIds: meta?.selectedServiceIds,
      };
    });
  }

  /**
   * Rebuild `ResolvedBookingLine` objects from persisted snapshots for **header-only** recomputation
   * (discounts) without re-pricing from catalog.
   */
  private async buildResolvedLinesFromPersistedItems(
    bookingId: string,
  ): Promise<ResolvedBookingLine[]> {
    const items = await this.prisma.bookingItem.findMany({
      where: { bookingId },
      include: {
        service: true,
        serviceVariant: { include: { service: true } },
        package: true,
        bundle: { include: { services: { include: { service: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return items.map((it) => {
      const meta = it.lineMetadata as { selectedServiceIds?: string[] } | null;
      let isTaxable = true;
      if (it.service) {
        isTaxable = it.service.isTaxable;
      } else if (it.serviceVariant?.service) {
        isTaxable = it.serviceVariant.service.isTaxable;
      } else if (it.package) {
        isTaxable = it.package.isTaxable;
      } else if (it.bundle) {
        isTaxable = it.bundle.services.some((s) => s.service.isTaxable);
      }

      return {
        itemType: it.itemType,
        serviceId: it.serviceId,
        serviceVariantId: it.serviceVariantId,
        packageId: it.packageId,
        bundleId: it.bundleId,
        nameSnapshot: it.nameSnapshot,
        priceSnapshot: it.priceSnapshot,
        durationMinutesSnapshot: it.durationMinutesSnapshot,
        quantity: it.quantity,
        isTaxable,
        lineMetadata: meta?.selectedServiceIds
          ? {
              selectedServiceIds: meta.selectedServiceIds,
            }
          : null,
      };
    });
  }

  private async cancelBookingTx(
    tx: Prisma.TransactionClient,
    bookingId: string,
  ): Promise<void> {
    const booking = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    if (
      booking.status === BookingStatus.CANCELLED ||
      booking.status === BookingStatus.REJECTED ||
      booking.status === BookingStatus.COMPLETED ||
      booking.status === BookingStatus.NO_SHOW
    ) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Booking is already terminal',
          error: 'Bad Request',
          code: 'INVALID_STATUS_TRANSITION',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (countsTowardCapacity(booking.status)) {
      await tx.bookingSlot.update({
        where: { id: booking.slotId },
        data: { bookedCount: { decrement: 1 } },
      });
    }
    await tx.booking.update({
      where: { id: booking.id },
      data: { status: BookingStatus.CANCELLED },
    });
  }

  private async rescheduleBookingTx(
    tx: Prisma.TransactionClient,
    bookingId: string,
    newSlotId: string,
  ): Promise<void> {
    const booking = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const newSlot = await tx.bookingSlot.findFirst({
      where: { id: newSlotId, deletedAt: null },
    });
    if (!newSlot || newSlot.branchId !== booking.branchId) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'New slot is not valid for this booking branch',
          error: 'Bad Request',
          code: 'INVALID_SLOT',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const oldCounted = countsTowardCapacity(booking.status);
    if (oldCounted) {
      await tx.bookingSlot.update({
        where: { id: booking.slotId },
        data: { bookedCount: { decrement: 1 } },
      });
    }

    await this.assertSlotHasCapacity(tx, newSlot.id);

    await tx.bookingSlot.update({
      where: { id: newSlot.id },
      data: { bookedCount: { increment: 1 } },
    });

    await tx.booking.update({
      where: { id: booking.id },
      data: { slotId: newSlot.id, status: BookingStatus.RESCHEDULED },
    });
  }

  private async requireDashboardBooking(
    user: DashboardJwtUser,
    bookingId: string,
  ) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    this.assertDashboardBranchAccess(user, booking.branchId);
    return booking;
  }

  private async mutateBookingStatus(
    user: DashboardJwtUser,
    bookingId: string,
    fn: (
      tx: Prisma.TransactionClient,
      booking: {
        id: string;
        branchId: string;
        slotId: string;
        status: BookingStatus;
      },
    ) => Promise<void>,
  ): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const booking = await tx.booking.findUnique({
          where: { id: bookingId },
        });
        if (!booking) {
          throw new NotFoundException('Booking not found');
        }
        this.assertDashboardBranchAccess(user, booking.branchId);
        await fn(tx, booking);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 10_000,
      },
    );
  }

  private async transitionProgress(
    user: DashboardJwtUser,
    bookingId: string,
    spec: {
      from: Set<BookingStatus>;
      to: BookingStatus;
      adjustCapacity: boolean;
    },
  ): Promise<void> {
    await this.mutateBookingStatus(user, bookingId, async (tx, booking) => {
      if (!spec.from.has(booking.status)) {
        throw new HttpException(
          {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'Invalid status transition',
            error: 'Bad Request',
            code: 'INVALID_STATUS_TRANSITION',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      const wasCounting = countsTowardCapacity(booking.status);
      const willCount = countsTowardCapacity(spec.to);
      if (spec.adjustCapacity && wasCounting && !willCount) {
        await tx.bookingSlot.update({
          where: { id: booking.slotId },
          data: { bookedCount: { decrement: 1 } },
        });
      }
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: spec.to },
      });
    });
  }

  private async assertSlotHasCapacity(
    tx: Prisma.TransactionClient,
    slotId: string,
  ): Promise<void> {
    const slot = await tx.bookingSlot.findUnique({ where: { id: slotId } });
    if (!slot || slot.deletedAt) {
      throw new NotFoundException('Slot not found');
    }
    if (slot.bookedCount >= slot.capacity) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Slot is at capacity',
          error: 'Bad Request',
          code: 'SLOT_AT_CAPACITY',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private async assertDashboardSlotAssignable(
    branchId: string,
    slotId: string,
  ): Promise<void> {
    const slot = await this.prisma.bookingSlot.findFirst({
      where: { id: slotId, branchId, deletedAt: null },
    });
    if (!slot) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Slot is not valid for this branch',
          error: 'Bad Request',
          code: 'INVALID_SLOT',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private async getOwnedBookingOrThrow(clientId: string, bookingId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, clientId },
      include: { slot: true },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    return booking;
  }

  private assertClientChangeWindow(booking: {
    slot: { date: Date; startTime: Date };
  }): void {
    if (!isAtLeast24HoursBeforeSlotStartCairo(booking.slot)) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message:
            'Cancellation/reschedule requests are only allowed at least 24 hours before your appointment. Please contact the salon directly.',
          error: 'Bad Request',
          code: 'CANCEL_WINDOW_EXPIRED',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private mapBookingDetail(booking: {
    id: string;
    status: BookingStatus;
    branchId: string;
    slotId: string;
    source: BookingSource;
    subtotal: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
    vatRate: Prisma.Decimal;
    vatAmount: Prisma.Decimal;
    totalAmount: Prisma.Decimal;
    clientNotes: string | null;
    adminNotes: string | null;
    createdAt: Date;
    updatedAt: Date;
    items?: Array<{
      id: string;
      itemType: BookingItemType;
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
    payments?: Array<{
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
    }>;
    invoices?: Array<{
      id: string;
      invoiceNumber: string;
      paidAmount: Prisma.Decimal;
      remainingAmount: Prisma.Decimal;
      status: InvoiceStatus;
    }>;
    slot?: { date: Date; startTime: Date; endTime: Date };
    client?: {
      id: string;
      fullName: string;
      phone: string;
      email: string | null;
    };
  }) {
    const paidDecimal = booking.payments?.length
      ? sumPaidPayments(booking.payments)
      : new Prisma.Decimal(0);
    const remainingDecimal = decimalMaxZero(
      booking.totalAmount.minus(paidDecimal),
    );
    const inv = booking.invoices?.[0];
    return {
      id: booking.id,
      status: booking.status,
      branchId: booking.branchId,
      slotId: booking.slotId,
      source: booking.source,
      subtotal: Number(booking.subtotal.toString()),
      discountAmount: Number(booking.discountAmount.toString()),
      vatRate: Number(booking.vatRate.toString()),
      vatAmount: Number(booking.vatAmount.toString()),
      totalAmount: Number(booking.totalAmount.toString()),
      paidAmount: Number(paidDecimal.toString()),
      remainingAmount: Number(remainingDecimal.toString()),
      currency: 'EGP',
      clientNotes: booking.clientNotes,
      adminNotes: booking.adminNotes,
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
      slot: booking.slot
        ? {
            date: booking.slot.date.toISOString().slice(0, 10),
            startTime: booking.slot.startTime.toISOString().slice(11, 19),
            endTime: booking.slot.endTime.toISOString().slice(11, 19),
          }
        : undefined,
      client: booking.client,
      items:
        booking.items?.map((it) => ({
          id: it.id,
          itemType: it.itemType,
          serviceId: it.serviceId,
          serviceVariantId: it.serviceVariantId,
          packageId: it.packageId,
          bundleId: it.bundleId,
          nameSnapshot: it.nameSnapshot,
          priceSnapshot: Number(it.priceSnapshot.toString()),
          durationMinutesSnapshot: it.durationMinutesSnapshot,
          quantity: it.quantity,
          lineMetadata: it.lineMetadata,
        })) ?? [],
      payments:
        booking.payments?.map((p) => ({
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
        })) ?? [],
      finalizedInvoice: inv
        ? {
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            paidAmount: Number(inv.paidAmount.toString()),
            remainingAmount: Number(inv.remainingAmount.toString()),
            status: inv.status,
          }
        : null,
    };
  }
}
