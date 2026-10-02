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
  BookingItemLineStatus,
  BookingItemType,
  BookingSource,
  BookingStatus,
  InvoiceStatus,
  OfferAppliesTo,
  OfferDiscountType,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  QueueEntryStatus,
} from '@prisma/client';
import type { ClientJwtUser } from '../auth/client-jwt-user';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import {
  assertDashboardBranchAccess,
  buildDashboardBookingBranchWhere,
} from '../billing/dashboard-branch-scope';
import {
  isAtLeast24HoursBeforeSlotStartCairo,
  presentBookingSlot,
} from '../common/cairo-slot-time';
import {
  slotStartCompositeKey,
  getCairoNowCompositeKey,
} from '../common/cairo-slot-time';
import { overridableException } from '../common/overridable.exception';
import { PrismaService } from '../prisma/prisma.service';
import { SlotsService } from '../slots/slots.service';
import { AuditService } from '../audit/audit.service';
import { InvoicesService } from '../billing/invoices.service';
import { StaffAvailabilityService } from '../staff/staff-availability.service';
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
import type { DashboardCreateChangeRequestDto } from './dto/dashboard-create-change-request.dto';
import type { DiscountBodyDto } from './dto/discount-body.dto';
import type {
  PublicBookingCreateBodyDto,
  PublicBookingEstimateBodyDto,
} from './dto/booking-item-input.dto';
import type { RescheduleBodyDto } from './dto/reschedule-body.dto';
import { buildListMeta } from '../catalog/catalog.utils';
import { BookingNotificationService } from '../notifications/booking-notification.service';
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

/** Normalize dashboard booking search input to a canonical UUID string, or null. */
function normalizeUuidSearchString(raw: string): string | null {
  const trimmed = raw.trim();
  const compact = trimmed.replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(compact)) {
    return null;
  }
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20, 32)}`;
}

/**
 * Extracts a 4–32 hex-char fragment used to match booking ids (supports RB-… style references).
 */
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

type PromoComputationResult =
  | {
      ok: true;
      offerId: string;
      appliedPromoCode: string;
      discountAmount: number;
      promoSnapshot: Record<string, unknown>;
    }
  | { ok: false; message: string };

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: BookingPricingService,
    private readonly slots: SlotsService,
    private readonly audit: AuditService,
    private readonly invoices: InvoicesService,
    private readonly staffAvailability: StaffAvailabilityService,
    private readonly bookingNotifications: BookingNotificationService,
  ) {}

  async estimatePublic(body: PublicBookingEstimateBodyDto) {
    const settings = await this.pricing.getSystemSettings();
    const lines = await this.pricing.resolveLines(body.branchId, body.items);
    let discountAmount = 0;
    let appliedPromoCode: string | null = null;
    let appliedOfferId: string | null = null;
    let promoError: string | null = null;
    const promoCode = body.promoCode?.trim();
    if (promoCode) {
      const promo = await this.computePromoDiscount(
        promoCode,
        lines,
        settings,
        body.branchId,
      );
      if (promo.ok) {
        discountAmount = promo.discountAmount;
        appliedPromoCode = promo.appliedPromoCode;
        appliedOfferId = promo.offerId;
      } else {
        promoError = promo.message;
      }
    }
    const totals = this.pricing.computeTotals(lines, settings, discountAmount);
    return {
      subtotal: Number(totals.subtotal.toString()),
      discountAmount: Number(totals.discountAmount.toString()),
      vatRate: Number(totals.vatRate.toString()),
      vatAmount: Number(totals.vatAmount.toString()),
      totalAmount: Number(totals.totalAmount.toString()),
      currency: 'EGP',
      pricesIncludeVat: settings.pricesIncludeVat,
      appliedPromoCode,
      appliedOfferId,
      promoError,
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

    const settings = await this.pricing.getSystemSettings();
    const lines = await this.pricing.resolveLines(body.branchId, body.items);
    let discountAmount = 0;
    let appliedOfferId: string | null = null;
    let appliedPromoCode: string | null = null;
    let promoSnapshot: Record<string, unknown> | null = null;
    const promoCode = body.promoCode?.trim();
    if (promoCode) {
      const promo = await this.computePromoDiscount(
        promoCode,
        lines,
        settings,
        body.branchId,
      );
      if (!promo.ok) {
        throw new HttpException(
          {
            statusCode: HttpStatus.BAD_REQUEST,
            message: promo.message,
            error: 'Bad Request',
            code: 'PROMO_INVALID',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      discountAmount = promo.discountAmount;
      appliedOfferId = promo.offerId;
      appliedPromoCode = promo.appliedPromoCode;
      promoSnapshot = promo.promoSnapshot;
    }
    const totals = this.pricing.computeTotals(lines, settings, discountAmount);

    const booking = await this.prisma.$transaction(
      async (tx) => {
        await this.slots.assertWebsiteSubmitSlotPolicyTx(
          tx,
          body.branchId,
          body.slotId,
        );
        const reserved = await this.slots.tryReserveOneSlotCapacityTx(
          tx,
          body.slotId,
        );
        if (!reserved) {
          throw new HttpException(
            {
              statusCode: HttpStatus.BAD_REQUEST,
              message: 'Selected slot is full',
              error: 'Bad Request',
              code: 'SLOT_FULL',
            },
            HttpStatus.BAD_REQUEST,
          );
        }

        const created = await tx.booking.create({
          data: {
            clientId: client.clientId,
            branchId: body.branchId,
            slotId: body.slotId,
            status: BookingStatus.PENDING,
            source: BookingSource.WEBSITE,
            subtotal: totals.subtotal,
            discountAmount: totals.discountAmount,
            appliedOfferId,
            appliedPromoCode,
            promoSnapshot:
              promoSnapshot !== null
                ? (promoSnapshot as Prisma.InputJsonValue)
                : Prisma.JsonNull,
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
                serviceEnhancementId: l.serviceEnhancementId,
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

        await this.slots.syncBookingSlotFilledFromCapacityTx(tx, body.slotId);

        return created;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 10_000,
      },
    );
    await this.audit.log({
      userId: null,
      action: 'booking.created',
      module: 'bookings',
      entityId: booking.id,
      newValue: {
        branchId: booking.branchId,
        slotId: booking.slotId,
        status: booking.status,
        totalAmount: Number(booking.totalAmount.toString()),
        appliedOfferId,
        appliedPromoCode,
      },
    });

    this.bookingNotifications.notifyBookingRequestReceived(booking.id);

    return {
      id: booking.id,
      status: booking.status,
      branchId: booking.branchId,
      slotId: booking.slotId,
      totalAmount: Number(booking.totalAmount.toString()),
      currency: 'EGP',
      createdAt: booking.createdAt,
      appliedOfferId,
      appliedPromoCode,
    };
  }

  private async computePromoDiscount(
    rawPromoCode: string,
    lines: ResolvedBookingLine[],
    settings: Awaited<ReturnType<BookingPricingService['getSystemSettings']>>,
    branchId: string,
  ): Promise<PromoComputationResult> {
    const promoCode = rawPromoCode.trim();
    if (!promoCode) {
      return { ok: false, message: 'Promo code is required' };
    }

    const offer = await this.prisma.offer.findFirst({
      where: { offerCode: { equals: promoCode, mode: 'insensitive' } },
    });
    if (!offer || !offer.offerCode) {
      return { ok: false, message: 'Promo code not found' };
    }
    if (!offer.isActive) {
      return { ok: false, message: 'Promo code is inactive' };
    }
    const today = new Date();
    if (today < offer.startDate || today > offer.endDate) {
      return {
        ok: false,
        message: 'Promo code is outside its validity period',
      };
    }

    // usageLimit/perClientUsageLimit are intentionally not enforced yet:
    // redemption tracking is out of this MVP scope.
    const allSubtotal = lines.reduce(
      (sum, line) => sum + this.pricing.lineExclusiveAmount(line, settings),
      0,
    );
    if (
      offer.minimumSpend !== null &&
      allSubtotal < Number(offer.minimumSpend.toString())
    ) {
      return {
        ok: false,
        message: 'Minimum spend is not met for this promo code',
      };
    }

    const rules =
      offer.eligibilityRules &&
      typeof offer.eligibilityRules === 'object' &&
      !Array.isArray(offer.eligibilityRules)
        ? (offer.eligibilityRules as Record<string, unknown>)
        : {};
    const ruleServiceIds = Array.isArray(rules.serviceIds)
      ? new Set(
          rules.serviceIds
            .filter((v): v is string => typeof v === 'string')
            .map((v) => v.trim()),
        )
      : null;
    const rulePackageIds = Array.isArray(rules.packageIds)
      ? new Set(
          rules.packageIds
            .filter((v): v is string => typeof v === 'string')
            .map((v) => v.trim()),
        )
      : null;

    const eligibleLines = lines.filter((line) => {
      if (offer.appliesTo === OfferAppliesTo.SERVICES) {
        if (
          line.itemType !== BookingItemType.SERVICE &&
          line.itemType !== BookingItemType.SERVICE_VARIANT &&
          line.itemType !== BookingItemType.ADD_ON
        ) {
          return false;
        }
        if (!ruleServiceIds || ruleServiceIds.size === 0) {
          return true;
        }
        return Boolean(line.serviceId && ruleServiceIds.has(line.serviceId));
      }
      if (offer.appliesTo === OfferAppliesTo.PACKAGES) {
        if (!line.packageId) {
          return false;
        }
        if (!rulePackageIds || rulePackageIds.size === 0) {
          return true;
        }
        return rulePackageIds.has(line.packageId);
      }

      if (
        line.itemType === BookingItemType.SERVICE ||
        line.itemType === BookingItemType.SERVICE_VARIANT ||
        line.itemType === BookingItemType.ADD_ON
      ) {
        if (ruleServiceIds && ruleServiceIds.size > 0) {
          return Boolean(line.serviceId && ruleServiceIds.has(line.serviceId));
        }
        return true;
      }
      if (line.packageId) {
        if (rulePackageIds && rulePackageIds.size > 0) {
          return rulePackageIds.has(line.packageId);
        }
        return true;
      }
      if (line.itemType === BookingItemType.SERVICE_ENHANCEMENT) {
        if (ruleServiceIds && ruleServiceIds.size > 0) {
          return false;
        }
        if (rulePackageIds && rulePackageIds.size > 0) {
          return false;
        }
        return true;
      }
      return ruleServiceIds == null && rulePackageIds == null;
    });

    const eligibleSubtotal = eligibleLines.reduce(
      (sum, line) => sum + this.pricing.lineExclusiveAmount(line, settings),
      0,
    );
    if (eligibleSubtotal <= 0) {
      return {
        ok: false,
        message: 'Promo code does not apply to selected items',
      };
    }

    let discountAmount = 0;
    if (offer.discountType === OfferDiscountType.PERCENTAGE) {
      const pct = Number(offer.discountValue.toString());
      discountAmount = (eligibleSubtotal * pct) / 100;
    } else if (offer.discountType === OfferDiscountType.FIXED_AMOUNT) {
      discountAmount = Number(offer.discountValue.toString());
    } else {
      return {
        ok: false,
        message: 'Promo code discount type is not supported for booking yet',
      };
    }

    discountAmount = Math.max(0, Math.min(discountAmount, eligibleSubtotal));
    return {
      ok: true,
      offerId: offer.id,
      appliedPromoCode: offer.offerCode,
      discountAmount,
      promoSnapshot: {
        offerId: offer.id,
        offerCode: offer.offerCode,
        name: offer.name,
        discountType: offer.discountType,
        discountValue: Number(offer.discountValue.toString()),
        minimumSpend:
          offer.minimumSpend === null
            ? null
            : Number(offer.minimumSpend.toString()),
        appliesTo: offer.appliesTo,
        usageLimit: offer.usageLimit,
        perClientUsageLimit: offer.perClientUsageLimit,
        eligibilityRules: offer.eligibilityRules,
        branchId,
      },
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

  private async findBookingIdsMatchingCompactId(
    compactHex: string,
    scope: {
      branchIds?: string[];
      status?: BookingStatus;
      clientId?: string;
      slotId?: string;
      dateFrom?: Date;
      dateTo?: Date;
    },
  ): Promise<string[]> {
    const pattern = `%${compactHex.toLowerCase()}%`;
    const checks: Prisma.Sql[] = [
      Prisma.sql`replace(lower(b.id::text), '-', '') LIKE ${pattern}`,
    ];
    if (scope.branchIds?.length === 1) {
      checks.push(Prisma.sql`b.branch_id = ${scope.branchIds[0]}::uuid`);
    } else if (scope.branchIds && scope.branchIds.length > 1) {
      const parts = scope.branchIds.map((id) => Prisma.sql`${id}::uuid`);
      checks.push(Prisma.sql`b.branch_id IN (${Prisma.join(parts)})`);
    }
    if (scope.status) {
      checks.push(Prisma.sql`b.status = ${scope.status}::"BookingStatus"`);
    }
    if (scope.clientId) {
      checks.push(Prisma.sql`b.client_id = ${scope.clientId}::uuid`);
    }
    if (scope.slotId) {
      checks.push(Prisma.sql`b.slot_id = ${scope.slotId}::uuid`);
    }
    if (scope.dateFrom) {
      checks.push(Prisma.sql`s.date >= ${scope.dateFrom}::date`);
    }
    if (scope.dateTo) {
      checks.push(Prisma.sql`s.date <= ${scope.dateTo}::date`);
    }
    const rows = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT b.id
      FROM bookings b
      INNER JOIN booking_slots s ON s.id = b.slot_id
      WHERE ${Prisma.join(checks, ' AND ')}
      LIMIT 500
    `);
    return rows.map((r) => String(r.id));
  }

  async listDashboardBookings(
    user: DashboardJwtUser,
    query: DashboardBookingListQueryDto,
  ) {
    // TODO(Sprint 5): Specialist "Own" scope — filter via assigned staff lines when Staff/User linkage exists (RBAC_MATRIX §3.2).
    const branchWhere = buildDashboardBookingBranchWhere(user, query.branchId);
    const branchIdsForSearch =
      typeof branchWhere.branchId === 'string'
        ? [branchWhere.branchId]
        : branchWhere.branchId &&
            typeof branchWhere.branchId === 'object' &&
            'in' in branchWhere.branchId &&
            Array.isArray((branchWhere.branchId as { in: string[] }).in)
          ? (branchWhere.branchId as { in: string[] }).in
          : undefined;

    const filters: Prisma.BookingWhereInput[] = [];
    if (Object.keys(branchWhere).length) {
      filters.push(branchWhere);
    }
    if (query.status) {
      filters.push({ status: query.status });
    }
    if (query.clientId) {
      filters.push({ clientId: query.clientId });
    }
    if (query.slotId) {
      filters.push({ slotId: query.slotId });
    }
    if (query.dateFrom || query.dateTo) {
      const dateFilter: Prisma.DateTimeFilter = {};
      if (query.dateFrom) {
        dateFilter.gte = parseDateOnly(query.dateFrom);
      }
      if (query.dateTo) {
        dateFilter.lte = parseDateOnly(query.dateTo);
      }
      filters.push({ slot: { date: dateFilter } });
    }

    const searchRaw = query.search?.trim() ?? '';
    if (searchRaw) {
      const searchOr: Prisma.BookingWhereInput[] = [
        {
          client: {
            fullName: { contains: searchRaw, mode: 'insensitive' },
          },
        },
        {
          client: {
            email: { contains: searchRaw, mode: 'insensitive' },
          },
        },
        {
          client: {
            phone: { contains: searchRaw, mode: 'insensitive' },
          },
        },
      ];
      const digitsOnly = searchRaw.replace(/\D/g, '');
      if (digitsOnly.length >= 3) {
        searchOr.push({
          client: { phone: { contains: digitsOnly, mode: 'insensitive' } },
        });
      }
      const uuidNorm = normalizeUuidSearchString(searchRaw);
      if (uuidNorm) {
        searchOr.push({ id: uuidNorm });
      }
      const compactId = extractBookingIdSearchCompact(searchRaw);
      if (compactId && compactId.length >= 4) {
        const idMatches = await this.findBookingIdsMatchingCompactId(
          compactId,
          {
            branchIds: branchIdsForSearch,
            status: query.status,
            clientId: query.clientId,
            slotId: query.slotId,
            dateFrom: query.dateFrom
              ? parseDateOnly(query.dateFrom)
              : undefined,
            dateTo: query.dateTo ? parseDateOnly(query.dateTo) : undefined,
          },
        );
        if (idMatches.length) {
          searchOr.push({ id: { in: idMatches } });
        }
      }
      filters.push({ OR: searchOr });
    }

    const where: Prisma.BookingWhereInput =
      filters.length === 0
        ? {}
        : filters.length === 1
          ? filters[0]
          : { AND: filters };

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
          client: {
            select: {
              id: true,
              fullName: true,
              phone: true,
              email: true,
            },
          },
          branch: { select: { name: true } },
          slot: {
            select: {
              date: true,
              startTime: true,
              endTime: true,
            },
          },
          items: {
            orderBy: { createdAt: 'asc' },
            take: 4,
            select: {
              nameSnapshot: true,
              quantity: true,
            },
          },
        },
      }),
    ]);

    return {
      data: rows.map((b) => {
        const slot = b.slot ? presentBookingSlot(b.slot, b) : null;
        const itemsPreview =
          b.items?.map((it) => ({
            nameSnapshot: it.nameSnapshot,
            quantity: it.quantity,
          })) ?? [];
        let servicesSummary = '—';
        if (itemsPreview.length > 0) {
          const first = itemsPreview[0]?.nameSnapshot ?? 'Item';
          servicesSummary =
            itemsPreview.length === 1
              ? first
              : `${first} +${itemsPreview.length - 1} more`;
        }
        return {
          id: b.id,
          status: b.status,
          branchId: b.branchId,
          branchName: b.branch?.name ?? null,
          slotId: b.slotId,
          slot,
          clientId: b.clientId,
          client: b.client
            ? {
                id: b.client.id,
                fullName: b.client.fullName,
                phone: b.client.phone,
                email: b.client.email,
              }
            : null,
          source: b.source,
          totalAmount: Number(b.totalAmount.toString()),
          currency: 'EGP',
          createdAt: b.createdAt,
          itemsPreview,
          servicesSummary,
        };
      }),
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
        items: {
          include: {
            staffProfile: { select: { id: true, displayName: true } },
          },
        },
        slot: true,
        client: true,
        payments: { orderBy: { createdAt: 'desc' } },
        invoices: {
          where: { status: InvoiceStatus.FINALIZED },
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
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    assertDashboardBranchAccess(user, booking.branchId);
    const mapped = this.mapBookingDetail(booking);
    const items = await Promise.all(
      mapped.items.map(async (it) => {
        const catalogServiceId =
          await this.staffAvailability.resolveCatalogServiceIdForBookingItem({
            itemType: it.itemType,
            serviceId: it.serviceId,
            serviceVariantId: it.serviceVariantId,
          });
        return { ...it, catalogServiceId };
      }),
    );
    const latestQueueEntry = await this.prisma.queueEntry.findFirst({
      where: {
        bookingId,
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, source: true },
    });
    return {
      ...mapped,
      items,
      activeQueueEntryId:
        latestQueueEntry &&
        (latestQueueEntry.status === QueueEntryStatus.WAITING ||
          latestQueueEntry.status === QueueEntryStatus.IN_SERVICE)
          ? latestQueueEntry.id
          : null,
      linkedQueueEntry: latestQueueEntry
        ? {
            id: latestQueueEntry.id,
            status: latestQueueEntry.status,
            source: latestQueueEntry.source,
          }
        : null,
    };
  }

  async dashboardCreateBooking(
    user: DashboardJwtUser,
    dto: DashboardCreateBookingDto,
  ) {
    assertDashboardBranchAccess(user, dto.branchId);
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
    const lines = await this.pricing.resolveLines(dto.branchId, dto.items, {
      enforceOnlineCatalogRules: false,
      allowStaffPriceOverrides: true,
    });
    const totals = this.pricing.computeTotals(lines, settings, 0);

    const booking = await this.prisma.$transaction(
      async (tx) => {
        if (countsTowardCapacity(initialStatus)) {
          const ok = await this.slots.tryReserveOneSlotCapacityTx(
            tx,
            dto.slotId,
          );
          if (!ok) {
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
          await this.slots.syncBookingSlotFilledFromCapacityTx(tx, dto.slotId);
        }

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
                serviceEnhancementId: l.serviceEnhancementId,
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

        return created;
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
        branchId: booking.branchId,
        slotId: booking.slotId,
        status: booking.status,
      },
    });

    if (initialStatus === BookingStatus.CONFIRMED) {
      this.bookingNotifications.notifyBookingConfirmed(booking.id);
    }

    return this.mapBookingDetail(booking);
  }

  async createWalkInArrivedBookingTx(
    tx: Prisma.TransactionClient,
    params: {
      clientId: string;
      branchId: string;
      slotId: string;
      createdByUserId: string;
      lines: ResolvedBookingLine[];
      totals: {
        subtotal: Prisma.Decimal;
        discountAmount: Prisma.Decimal;
        vatRate: Prisma.Decimal;
        vatAmount: Prisma.Decimal;
        totalAmount: Prisma.Decimal;
      };
    },
  ) {
    return tx.booking.create({
      data: {
        clientId: params.clientId,
        branchId: params.branchId,
        slotId: params.slotId,
        status: BookingStatus.ARRIVED,
        source: BookingSource.WALK_IN,
        subtotal: params.totals.subtotal,
        discountAmount: params.totals.discountAmount,
        vatRate: params.totals.vatRate,
        vatAmount: params.totals.vatAmount,
        totalAmount: params.totals.totalAmount,
        clientNotes: null,
        adminNotes: null,
        createdByUserId: params.createdByUserId,
        items: {
          create: params.lines.map((l) => ({
            itemType: l.itemType,
            serviceId: l.serviceId,
            serviceVariantId: l.serviceVariantId,
            packageId: l.packageId,
            bundleId: l.bundleId,
            serviceEnhancementId: l.serviceEnhancementId,
            nameSnapshot: l.nameSnapshot,
            priceSnapshot: l.priceSnapshot,
            durationMinutesSnapshot: l.durationMinutesSnapshot,
            quantity: l.quantity,
            lineMetadata: l.lineMetadata ?? Prisma.JsonNull,
          })),
        },
      },
      include: { items: true },
    });
  }

  async confirmBooking(
    user: DashboardJwtUser,
    bookingId: string,
    overrideReason?: string | null,
  ) {
    const capacityReason = overrideReason?.trim() || null;
    let overrodeCapacity = false;
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
      if (booking.source === BookingSource.WEBSITE) {
        await tx.booking.update({
          where: { id: booking.id },
          data: { status: BookingStatus.CONFIRMED },
        });
        await this.slots.syncBookingSlotFilledFromCapacityTx(
          tx,
          booking.slotId,
        );
      } else {
        const ok = await this.slots.tryReserveOneSlotCapacityTx(
          tx,
          booking.slotId,
        );
        if (!ok) {
          // Spec v2 §2: confirming into a full slot is SOFT.
          if (!capacityReason) {
            throw overridableException(
              'SLOT_AT_CAPACITY',
              'This slot is already full — confirm anyway?',
            );
          }
          await tx.bookingSlot.update({
            where: { id: booking.slotId },
            data: { bookedCount: { increment: 1 } },
          });
          overrodeCapacity = true;
        }
        await tx.booking.update({
          where: { id: booking.id },
          data: { status: BookingStatus.CONFIRMED },
        });
        await this.slots.syncBookingSlotFilledFromCapacityTx(
          tx,
          booking.slotId,
        );
      }
    });
    if (overrodeCapacity) {
      await this.audit.log({
        userId: user.userId,
        action: 'override.slot_full',
        module: 'bookings',
        entityId: bookingId,
        newValue: { reason: capacityReason },
      });
    }
    const updated = await this.getDashboardBooking(user, bookingId);
    await this.audit.log({
      userId: user.userId,
      action: 'booking.confirmed',
      module: 'bookings',
      entityId: bookingId,
      newValue: { status: updated.status },
    });
    this.bookingNotifications.notifyBookingConfirmed(bookingId);
    return updated;
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
      if (booking.source === BookingSource.WEBSITE) {
        await this.slots.releaseOneSlotCapacityTx(tx, booking.slotId);
        await this.slots.syncBookingSlotFilledFromCapacityTx(
          tx,
          booking.slotId,
        );
      }
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: BookingStatus.REJECTED },
      });
    });
    const updated = await this.getDashboardBooking(user, bookingId);
    await this.audit.log({
      userId: user.userId,
      action: 'booking.rejected',
      module: 'bookings',
      entityId: bookingId,
      newValue: { status: updated.status },
    });
    this.bookingNotifications.notifyBookingRejected(bookingId);
    return updated;
  }

  async rescheduleBooking(
    user: DashboardJwtUser,
    bookingId: string,
    body: RescheduleBodyDto,
  ) {
    await this.mutateBookingStatus(user, bookingId, async (tx) => {
      await this.rescheduleBookingTx(tx, bookingId, body.slotId);
    });
    const updated = await this.getDashboardBooking(user, bookingId);
    await this.audit.log({
      userId: user.userId,
      action: 'booking.rescheduled',
      module: 'bookings',
      entityId: bookingId,
      newValue: { status: updated.status, slotId: updated.slotId },
    });
    this.bookingNotifications.notifyBookingRescheduled(bookingId);
    return updated;
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
    const updated = await this.getDashboardBooking(user, bookingId);
    await this.audit.log({
      userId: user.userId,
      action: 'booking.cancelled',
      module: 'bookings',
      entityId: bookingId,
      newValue: { status: updated.status },
    });
    this.bookingNotifications.notifyBookingCancelled(bookingId);
    return updated;
  }

  async markArrived(user: DashboardJwtUser, bookingId: string) {
    await this.transitionProgress(user, bookingId, {
      from: new Set([BookingStatus.CONFIRMED, BookingStatus.RESCHEDULED]),
      to: BookingStatus.ARRIVED,
      adjustCapacity: false,
    });
    const updated = await this.getDashboardBooking(user, bookingId);
    await this.audit.log({
      userId: user.userId,
      action: 'booking.arrived',
      module: 'bookings',
      entityId: bookingId,
      newValue: { status: updated.status },
    });
    return updated;
  }

  async markInProgress(user: DashboardJwtUser, bookingId: string) {
    const before = await this.requireDashboardBooking(user, bookingId);
    if (before.status === BookingStatus.IN_PROGRESS) {
      return this.getDashboardBooking(user, bookingId);
    }
    await this.transitionProgress(user, bookingId, {
      from: new Set([BookingStatus.ARRIVED]),
      to: BookingStatus.IN_PROGRESS,
      adjustCapacity: false,
    });
    const updated = await this.getDashboardBooking(user, bookingId);
    await this.audit.log({
      userId: user.userId,
      action: 'booking.in_progress',
      module: 'bookings',
      entityId: bookingId,
      newValue: { status: updated.status },
    });
    return updated;
  }

  async markCompleted(user: DashboardJwtUser, bookingId: string) {
    await this.requireDashboardBooking(user, bookingId);

    /** Lines staff starts/completes in the dashboard are catalog services only (see queue + bookings UI). */
    const staffTrackedItemTypes: BookingItemType[] = [
      BookingItemType.SERVICE,
      BookingItemType.SERVICE_VARIANT,
    ];
    const autoCloseItemTypes: BookingItemType[] = [
      BookingItemType.SERVICE_ENHANCEMENT,
      BookingItemType.PACKAGE,
      BookingItemType.BUNDLE,
      BookingItemType.ADD_ON,
    ];

    const now = new Date();
    await this.prisma.bookingItem.updateMany({
      where: {
        bookingId,
        itemType: { in: autoCloseItemTypes },
        lineStatus: {
          in: [
            BookingItemLineStatus.PENDING,
            BookingItemLineStatus.IN_PROGRESS,
          ],
        },
      },
      data: {
        lineStatus: BookingItemLineStatus.COMPLETED,
        completedAt: now,
      },
    });

    const pending = await this.prisma.bookingItem.count({
      where: {
        bookingId,
        itemType: { in: staffTrackedItemTypes },
        lineStatus: {
          in: [
            BookingItemLineStatus.PENDING,
            BookingItemLineStatus.IN_PROGRESS,
          ],
        },
      },
    });
    if (pending > 0) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message:
            'All catalog service lines must be completed or cancelled before the visit can be marked completed',
          error: 'Bad Request',
          code: 'BOOKING_ITEMS_NOT_COMPLETE',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.transitionProgress(user, bookingId, {
      from: new Set([BookingStatus.IN_PROGRESS, BookingStatus.ARRIVED]),
      to: BookingStatus.COMPLETED,
      adjustCapacity: true,
    });
    const updated = await this.getDashboardBooking(user, bookingId);
    await this.audit.log({
      userId: user.userId,
      action: 'booking.completed',
      module: 'bookings',
      entityId: bookingId,
      newValue: { status: updated.status },
    });
    return updated;
  }

  async markNoShow(user: DashboardJwtUser, bookingId: string) {
    // Spec v2 §6 (Fresha rule): no-show only once the appointment start has passed.
    const slotRow = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { slot: { select: { date: true, startTime: true } } },
    });
    if (
      slotRow?.slot &&
      slotStartCompositeKey(slotRow.slot) > getCairoNowCompositeKey()
    ) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message:
            'No-show can be marked only after the appointment start time',
          error: 'Bad Request',
          code: 'NO_SHOW_TOO_EARLY',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.transitionProgress(user, bookingId, {
      from: new Set([BookingStatus.CONFIRMED, BookingStatus.RESCHEDULED]),
      to: BookingStatus.NO_SHOW,
      adjustCapacity: true,
    });
    const updated = await this.getDashboardBooking(user, bookingId);
    await this.audit.log({
      userId: user.userId,
      action: 'booking.no_show',
      module: 'bookings',
      entityId: bookingId,
      newValue: { status: updated.status },
    });
    return updated;
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
    const lines = await this.pricing.resolveLines(booking.branchId, dtoItems, {
      enforceOnlineCatalogRules: false,
      allowStaffPriceOverrides: true,
    });
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
          serviceEnhancementId: l.serviceEnhancementId,
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

    const updated = await this.getDashboardBooking(user, bookingId);
    await this.audit.log({
      userId: user.userId,
      action: 'booking.price_recalculated',
      module: 'bookings',
      entityId: bookingId,
      newValue: {
        subtotal: updated.subtotal,
        discountAmount: updated.discountAmount,
        vatAmount: updated.vatAmount,
        totalAmount: updated.totalAmount,
      },
    });
    return updated;
  }

  async appendItemsAndReprice(
    user: DashboardJwtUser,
    bookingId: string,
    items: BookingItemInputDto[],
  ) {
    if (items.length === 0) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'At least one line item is required',
          error: 'Bad Request',
          code: 'BOOKING_APPEND_ITEMS_REQUIRED',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        invoices: {
          where: { status: InvoiceStatus.FINALIZED },
          take: 1,
          select: { id: true },
        },
      },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    assertDashboardBranchAccess(user, booking.branchId);

    const activeQueue = await this.prisma.queueEntry.findFirst({
      where: {
        bookingId,
        status: {
          in: [QueueEntryStatus.WAITING, QueueEntryStatus.IN_SERVICE],
        },
      },
      select: { id: true },
    });
    // Before check-in a booking may be edited from the Bookings page (spec v2 §3: "add a
    // service" is FREE until the visit is closed); after check-in it must be on the queue.
    const editableBeforeCheckIn: BookingStatus[] = [
      BookingStatus.PENDING,
      BookingStatus.CONFIRMED,
      BookingStatus.RESCHEDULED,
    ];
    if (!activeQueue && !editableBeforeCheckIn.includes(booking.status)) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message:
            booking.status === BookingStatus.COMPLETED ||
            booking.status === BookingStatus.CANCELLED ||
            booking.status === BookingStatus.REJECTED ||
            booking.status === BookingStatus.NO_SHOW
              ? 'This booking is closed — services can no longer be added'
              : 'Check the client in first, then add services from the queue',
          error: 'Bad Request',
          code: 'BOOKING_NOT_EDITABLE',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const settings = await this.pricing.getSystemSettings();
    const existingResolved =
      await this.buildResolvedLinesFromPersistedItems(bookingId);
    const newLines = await this.pricing.resolveLines(booking.branchId, items, {
      enforceOnlineCatalogRules: false,
      allowStaffPriceOverrides: true,
    });
    const allLines = [...existingResolved, ...newLines];
    const totals = this.pricing.computeTotals(
      allLines,
      settings,
      Number(booking.discountAmount.toString()),
    );

    await this.prisma.$transaction(
      async (tx) => {
        await tx.bookingItem.createMany({
          data: newLines.map((l) => ({
            bookingId,
            itemType: l.itemType,
            serviceId: l.serviceId,
            serviceVariantId: l.serviceVariantId,
            packageId: l.packageId,
            bundleId: l.bundleId,
            serviceEnhancementId: l.serviceEnhancementId,
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

        const allItems = await tx.bookingItem.findMany({
          where: {
            bookingId,
            lineStatus: { not: BookingItemLineStatus.CANCELLED },
          },
          orderBy: { createdAt: 'asc' },
          select: {
            itemType: true,
            nameSnapshot: true,
            quantity: true,
          },
        });
        const itemsSnapshot = allItems.map((it) => ({
          itemType: it.itemType,
          nameSnapshot: it.nameSnapshot,
          quantity: it.quantity,
        }));
        const serviceSummarySnapshot =
          allItems.length === 0
            ? '—'
            : allItems.length === 1
              ? allItems[0].nameSnapshot
              : `${allItems[0].nameSnapshot} +${allItems.length - 1} more`;

        if (activeQueue) {
          await tx.queueEntry.update({
            where: { id: activeQueue.id },
            data: {
              itemsSnapshot,
              serviceSummarySnapshot,
            },
          });
        }
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 10_000,
      },
    );

    const updated = await this.getDashboardBooking(user, bookingId);
    if (booking.invoices.length > 0) {
      await this.invoices.syncFinalizedInvoiceWithBooking(user, bookingId);
    }
    await this.audit.log({
      userId: user.userId,
      action: activeQueue
        ? 'booking.items_appended_from_queue'
        : 'booking.items_appended',
      module: 'bookings',
      entityId: bookingId,
      newValue: {
        addedLines: newLines.map((l) => l.nameSnapshot),
        totalAmount: updated.totalAmount,
        queueEntryId: activeQueue?.id ?? null,
      },
    });
    return updated;
  }

  async startBookingServiceItem(
    user: DashboardJwtUser,
    bookingId: string,
    itemId: string,
    staffProfileId: string,
    overrideReason?: string | null,
  ) {
    if (!user.permissions.includes('bookingServiceItems.start')) {
      throw new ForbiddenException('Insufficient permissions');
    }
    const item = await this.prisma.bookingItem.findFirst({
      where: { id: itemId, bookingId },
      include: {
        booking: { select: { id: true, branchId: true, status: true } },
      },
    });
    if (!item?.booking) {
      throw new NotFoundException('Booking item not found');
    }
    assertDashboardBranchAccess(user, item.booking.branchId);
    if (item.lineStatus !== BookingItemLineStatus.PENDING) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Only PENDING service lines can be started',
          error: 'Bad Request',
          code: 'BOOKING_ITEM_NOT_PENDING',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Spec v2 §3: several services of one visit may run at once (FREE).

    const catalogServiceId =
      await this.staffAvailability.resolveCatalogServiceIdForBookingItem(item);
    if (!catalogServiceId) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message:
            'Staff assignment is only supported for catalog service / variant lines',
          error: 'Bad Request',
          code: 'BOOKING_ITEM_NOT_SERVICE',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const profile = await this.prisma.staffProfile.findFirst({
      where: {
        id: staffProfileId,
        branchId: item.booking.branchId,
        isActive: true,
        isBookable: true,
      },
    });
    if (!profile) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Staff profile is not valid for this branch',
          error: 'Bad Request',
          code: 'STAFF_PROFILE_INVALID',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Spec v2 §3: qualification, shift and busy checks are SOFT — refused
    // without a reason, accepted and audited with one.
    const capable = await this.staffAvailability.hasCapability(
      staffProfileId,
      catalogServiceId,
    );
    const whenKey = this.staffAvailability.cairoNowKey();
    const avail = await this.staffAvailability.evaluateStaffForInstant(
      staffProfileId,
      item.booking.branchId,
      whenKey,
    );
    const softIssues: Array<{ code: string; message: string }> = [];
    if (!capable) {
      softIssues.push({
        code: 'STAFF_NOT_QUALIFIED',
        message: `${profile.displayName} is not listed for this service`,
      });
    }
    if (!avail.ok) {
      softIssues.push({
        code: avail.reason.toLowerCase().includes('in progress')
          ? 'STAFF_BUSY'
          : 'STAFF_NOT_AVAILABLE',
        message: `${profile.displayName}: ${avail.reason}`,
      });
    }
    const reason = overrideReason?.trim() || null;
    if (softIssues.length > 0 && !reason) {
      throw overridableException(
        softIssues[0].code,
        `${softIssues.map((x) => x.message).join('; ')} — assign anyway?`,
        { issues: softIssues },
      );
    }

    const now = new Date();
    await this.prisma.bookingItem.update({
      where: { id: itemId },
      data: {
        staffProfileId,
        lineStatus: BookingItemLineStatus.IN_PROGRESS,
        startedAt: now,
      },
    });

    await this.prisma.queueEntry.updateMany({
      where: {
        bookingId,
        status: QueueEntryStatus.WAITING,
      },
      data: {
        status: QueueEntryStatus.IN_SERVICE,
        startedAt: now,
        updatedByUserId: user.userId,
      },
    });

    if (softIssues.length > 0 && reason) {
      await this.audit.log({
        userId: user.userId,
        action: 'override.staff_start',
        module: 'bookings',
        entityId: bookingId,
        newValue: {
          bookingItemId: itemId,
          staffProfileId,
          reason,
          issues: softIssues,
        },
      });
    }

    if (item.booking.status === BookingStatus.ARRIVED) {
      await this.markInProgress(user, bookingId);
    }

    const updated = await this.getDashboardBooking(user, bookingId);
    await this.audit.log({
      userId: user.userId,
      action: 'booking.service_item.started',
      module: 'bookings',
      entityId: bookingId,
      newValue: {
        bookingItemId: itemId,
        staffProfileId,
      },
    });
    return updated;
  }

  async completeBookingServiceItem(
    user: DashboardJwtUser,
    bookingId: string,
    itemId: string,
  ) {
    if (!user.permissions.includes('bookingServiceItems.complete')) {
      throw new ForbiddenException('Insufficient permissions');
    }
    const item = await this.prisma.bookingItem.findFirst({
      where: { id: itemId, bookingId },
      include: {
        booking: { select: { branchId: true } },
        staffProfile: { select: { userId: true } },
      },
    });
    if (!item?.booking) {
      throw new NotFoundException('Booking item not found');
    }
    assertDashboardBranchAccess(user, item.booking.branchId);
    // Staff without front-desk rights may only mark their own lines done.
    const frontDesk =
      user.permissions.includes('queue.manage') ||
      user.permissions.includes('bookings.status.progress');
    if (!frontDesk && item.staffProfile?.userId !== user.userId) {
      throw new ForbiddenException(
        'You can only mark your own services as done',
      );
    }
    if (item.lineStatus !== BookingItemLineStatus.IN_PROGRESS) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Only IN_PROGRESS lines can be completed',
          error: 'Bad Request',
          code: 'BOOKING_ITEM_NOT_IN_PROGRESS',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.prisma.bookingItem.update({
      where: { id: itemId },
      data: {
        lineStatus: BookingItemLineStatus.COMPLETED,
        completedAt: new Date(),
      },
    });

    const updated = await this.getDashboardBooking(user, bookingId);
    await this.audit.log({
      userId: user.userId,
      action: 'booking.service_item.completed',
      module: 'bookings',
      entityId: bookingId,
      newValue: { bookingItemId: itemId },
    });
    return updated;
  }

  async appendServiceItemsForActiveQueue(
    user: DashboardJwtUser,
    bookingId: string,
    items: BookingItemInputDto[],
  ) {
    if (!user.permissions.includes('bookingServiceItems.create')) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return this.appendItemsAndReprice(user, bookingId, items);
  }

  /**
   * Remove one line from an active booking (spec v2 §3):
   * - PENDING line → hard delete (FREE).
   * - IN_PROGRESS line → SOFT: refused without `reason`; with a reason the line is
   *   kept as CANCELLED (not charged, stylist freed) for the record.
   * - COMPLETED line → blocked; the dispute is handled with a discount instead.
   */
  async removeBookingItem(
    user: DashboardJwtUser,
    bookingId: string,
    itemId: string,
    reason?: string | null,
  ) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        invoices: {
          where: { status: InvoiceStatus.FINALIZED },
          take: 1,
          select: { id: true },
        },
      },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    assertDashboardBranchAccess(user, booking.branchId);

    if (
      booking.status === BookingStatus.CANCELLED ||
      booking.status === BookingStatus.REJECTED ||
      booking.status === BookingStatus.COMPLETED ||
      booking.status === BookingStatus.NO_SHOW
    ) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message:
            'Items can only be removed from active bookings (not cancelled, rejected, completed, or no-show)',
          error: 'Bad Request',
          code: 'INVALID_BOOKING_STATE',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (booking.invoices.length > 0) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message:
            'Cannot remove items after a finalized invoice exists for this booking',
          error: 'Bad Request',
          code: 'INVOICE_FINALIZED_BLOCKS_ITEMS',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const target = await this.prisma.bookingItem.findFirst({
      where: { id: itemId, bookingId },
      select: {
        id: true,
        nameSnapshot: true,
        itemType: true,
        priceSnapshot: true,
        quantity: true,
        lineStatus: true,
        staffProfile: { select: { displayName: true } },
      },
    });
    if (!target) {
      throw new NotFoundException('Booking item not found on this booking');
    }
    if (target.lineStatus === BookingItemLineStatus.COMPLETED) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: `"${target.nameSnapshot}" is already done and cannot be removed — apply a discount instead`,
          error: 'Bad Request',
          code: 'LINE_COMPLETED',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (target.lineStatus === BookingItemLineStatus.CANCELLED) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: `"${target.nameSnapshot}" was already removed`,
          error: 'Bad Request',
          code: 'LINE_ALREADY_CANCELLED',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    const stopInProgress =
      target.lineStatus === BookingItemLineStatus.IN_PROGRESS;
    const overrideReason = reason?.trim() || null;
    if (stopInProgress && !overrideReason) {
      const who = target.staffProfile?.displayName;
      throw overridableException(
        'LINE_IN_PROGRESS',
        `"${target.nameSnapshot}" is in progress${who ? ` with ${who}` : ''} — stop and remove it? It will not be charged.`,
      );
    }

    const totalItemCount = await this.prisma.bookingItem.count({
      where: {
        bookingId,
        lineStatus: { not: BookingItemLineStatus.CANCELLED },
      },
    });
    if (totalItemCount <= 1) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message:
            'A booking must keep at least one item — cancel the booking instead of removing the last item',
          error: 'Bad Request',
          code: 'BOOKING_LAST_ITEM',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const activeQueue = await this.prisma.queueEntry.findFirst({
      where: {
        bookingId,
        status: {
          in: [QueueEntryStatus.WAITING, QueueEntryStatus.IN_SERVICE],
        },
      },
      select: { id: true },
    });

    const settings = await this.pricing.getSystemSettings();

    await this.prisma.$transaction(
      async (tx) => {
        if (stopInProgress) {
          await tx.bookingItem.update({
            where: { id: target.id },
            data: {
              lineStatus: BookingItemLineStatus.CANCELLED,
              completedAt: new Date(),
            },
          });
        } else {
          await tx.bookingItem.delete({ where: { id: target.id } });
        }

        const remainingItems = await tx.bookingItem.findMany({
          where: {
            bookingId,
            lineStatus: { not: BookingItemLineStatus.CANCELLED },
          },
          include: {
            service: true,
            serviceVariant: { include: { service: true } },
            package: true,
            bundle: { include: { services: { include: { service: true } } } },
            serviceEnhancement: true,
          },
          orderBy: { createdAt: 'asc' },
        });

        const remainingLines: ResolvedBookingLine[] = remainingItems.map(
          (it) => {
            const meta = it.lineMetadata as {
              selectedServiceIds?: string[];
            } | null;
            let isTaxable = true;
            if (it.packageId && it.package) {
              isTaxable = it.package.isTaxable;
            } else if (it.service) {
              isTaxable = it.service.isTaxable;
            } else if (it.serviceVariant?.service) {
              isTaxable = it.serviceVariant.service.isTaxable;
            } else if (it.bundle) {
              isTaxable = it.bundle.services.some((s) => s.service.isTaxable);
            } else if (it.serviceEnhancement) {
              isTaxable = true;
            }
            return {
              itemType: it.itemType,
              serviceId: it.serviceId,
              serviceVariantId: it.serviceVariantId,
              packageId: it.packageId,
              bundleId: it.bundleId,
              serviceEnhancementId: it.serviceEnhancementId,
              nameSnapshot: it.nameSnapshot,
              priceSnapshot: it.priceSnapshot,
              durationMinutesSnapshot: it.durationMinutesSnapshot,
              quantity: it.quantity,
              isTaxable,
              discountAmount: it.discountAmount,
              lineMetadata: meta?.selectedServiceIds
                ? { selectedServiceIds: meta.selectedServiceIds }
                : null,
            };
          },
        );

        const totals = this.pricing.computeTotals(
          remainingLines,
          settings,
          Number(booking.discountAmount.toString()),
        );

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

        if (activeQueue) {
          const itemsSnapshot = remainingItems.map((it) => ({
            itemType: it.itemType,
            nameSnapshot: it.nameSnapshot,
            quantity: it.quantity,
          }));
          const serviceSummarySnapshot =
            remainingItems.length === 0
              ? '—'
              : remainingItems.length === 1
                ? remainingItems[0].nameSnapshot
                : `${remainingItems[0].nameSnapshot} +${remainingItems.length - 1} more`;
          await tx.queueEntry.update({
            where: { id: activeQueue.id },
            data: {
              itemsSnapshot,
              serviceSummarySnapshot,
            },
          });
        }
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 10_000,
      },
    );

    const updated = await this.getDashboardBooking(user, bookingId);
    await this.audit.log({
      userId: user.userId,
      action: stopInProgress
        ? 'booking.item_cancelled_in_progress'
        : 'booking.item_removed',
      module: 'bookings',
      entityId: bookingId,
      oldValue: {
        itemId: target.id,
        itemType: target.itemType,
        nameSnapshot: target.nameSnapshot,
        priceSnapshot: Number(target.priceSnapshot.toString()),
        quantity: target.quantity,
        lineStatus: target.lineStatus,
        staffDisplayName: target.staffProfile?.displayName ?? null,
      },
      newValue: {
        reason: overrideReason,
        subtotal: updated.subtotal,
        discountAmount: updated.discountAmount,
        vatAmount: updated.vatAmount,
        totalAmount: updated.totalAmount,
        remainingItemCount: updated.items.length,
        queueEntryId: activeQueue?.id ?? null,
      },
    });
    return updated;
  }

  /**
   * Discount on a single line (spec v2 §4), as an alternative to the receipt-level discount.
   * Same guard as the receipt discount: reception needs a reason and stays under the limit
   * (measured against that line), managers with `bookings.discount.apply_unlimited` don't.
   * Totals are recomputed; a finalized invoice is kept in sync.
   */
  async applyLineDiscount(
    user: DashboardJwtUser,
    bookingId: string,
    itemId: string,
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
    const item = await this.prisma.bookingItem.findFirst({
      where: { id: itemId, bookingId },
      select: {
        id: true,
        nameSnapshot: true,
        priceSnapshot: true,
        quantity: true,
        lineStatus: true,
        discountAmount: true,
      },
    });
    if (!item) {
      throw new NotFoundException('Booking item not found on this booking');
    }
    if (item.lineStatus === BookingItemLineStatus.CANCELLED) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: `"${item.nameSnapshot}" was removed and is not charged`,
          error: 'Bad Request',
          code: 'LINE_ALREADY_CANCELLED',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    const lineGross = Number(item.priceSnapshot.toString()) * item.quantity;
    const requested = Math.max(0, Number(body.discountAmount.toFixed(2)));
    if (requested > lineGross + 0.005) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: `Discount cannot exceed the line amount (${lineGross.toFixed(2)})`,
          error: 'Bad Request',
          code: 'DISCOUNT_EXCEEDS_LINE',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    const discountReason = body.reason?.trim() || null;
    if (
      requested > 0 &&
      !user.permissions.includes('bookings.discount.apply_unlimited')
    ) {
      if (!discountReason) {
        throw new HttpException(
          {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'A reason is required for discounts',
            error: 'Bad Request',
            code: 'DISCOUNT_REASON_REQUIRED',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      const limitRow = await this.prisma.systemSettings.findFirst({
        select: { discountLimitPercentWithoutApproval: true },
      });
      const limitPct = Number(
        limitRow?.discountLimitPercentWithoutApproval?.toString() ?? '15',
      );
      if (lineGross > 0 && requested > (lineGross * limitPct) / 100 + 0.005) {
        throw new HttpException(
          {
            statusCode: HttpStatus.FORBIDDEN,
            message: `Discounts above ${limitPct}% of the line need a manager`,
            error: 'Forbidden',
            code: 'DISCOUNT_ABOVE_LIMIT',
            limitPercent: limitPct,
          },
          HttpStatus.FORBIDDEN,
        );
      }
    }

    await this.prisma.bookingItem.update({
      where: { id: item.id },
      data: {
        discountAmount: new Prisma.Decimal(requested.toFixed(2)),
        discountReason: requested > 0 ? discountReason : null,
      },
    });
    const settings = await this.pricing.getSystemSettings();
    const lines = await this.buildResolvedLinesFromPersistedItems(bookingId);
    const totals = this.pricing.computeTotals(
      lines,
      settings,
      Number(booking.discountAmount.toString()),
    );
    await this.prisma.$transaction(async (tx) => {
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
      const finalizedInvoice = await tx.invoice.findFirst({
        where: { bookingId, status: InvoiceStatus.FINALIZED },
        orderBy: { createdAt: 'desc' },
        select: { id: true, paidAmount: true },
      });
      if (finalizedInvoice) {
        await tx.invoiceLine.updateMany({
          where: { invoiceId: finalizedInvoice.id, bookingItemId: item.id },
          data: { discountAmount: new Prisma.Decimal(requested.toFixed(2)) },
        });
        await tx.invoice.update({
          where: { id: finalizedInvoice.id },
          data: {
            subtotal: totals.subtotal,
            discountAmount: totals.discountAmount,
            vatRate: totals.vatRate,
            vatAmount: totals.vatAmount,
            totalAmount: totals.totalAmount,
            remainingAmount: decimalMaxZero(
              totals.totalAmount.minus(finalizedInvoice.paidAmount),
            ),
          },
        });
      }
    });
    const updated = await this.getDashboardBooking(user, bookingId);
    await this.audit.log({
      userId: user.userId,
      action: 'booking.line_discount_applied',
      module: 'bookings',
      entityId: bookingId,
      oldValue: {
        itemId: item.id,
        nameSnapshot: item.nameSnapshot,
        discountAmount: Number(item.discountAmount.toString()),
        totalAmount: Number(booking.totalAmount.toString()),
      },
      newValue: {
        discountAmount: requested,
        reason: discountReason,
        totalAmount: updated.totalAmount,
      },
    });
    return updated;
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

    const beforeTotal = Number(booking.totalAmount.toString());
    const discountReason = body.reason?.trim() || null;
    // Spec v2 §4: reception discounts need a reason and stay under the limit.
    if (!user.permissions.includes('bookings.discount.apply_unlimited')) {
      if (!discountReason) {
        throw new HttpException(
          {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'A reason is required for discounts',
            error: 'Bad Request',
            code: 'DISCOUNT_REASON_REQUIRED',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      const limitRow = await this.prisma.systemSettings.findFirst({
        select: { discountLimitPercentWithoutApproval: true },
      });
      const limitPct = Number(
        limitRow?.discountLimitPercentWithoutApproval?.toString() ?? '15',
      );
      const subtotal = Number(totals.subtotal.toString());
      if (
        subtotal > 0 &&
        body.discountAmount > (subtotal * limitPct) / 100 + 0.005
      ) {
        throw new HttpException(
          {
            statusCode: HttpStatus.FORBIDDEN,
            message: `Discounts above ${limitPct}% of the subtotal need a manager`,
            error: 'Forbidden',
            code: 'DISCOUNT_ABOVE_LIMIT',
            limitPercent: limitPct,
          },
          HttpStatus.FORBIDDEN,
        );
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          discountAmount: totals.discountAmount,
          discountReason,
          vatRate: totals.vatRate,
          vatAmount: totals.vatAmount,
          totalAmount: totals.totalAmount,
          subtotal: totals.subtotal,
        },
      });

      const finalizedInvoice = await tx.invoice.findFirst({
        where: { bookingId, status: InvoiceStatus.FINALIZED },
        orderBy: { createdAt: 'desc' },
        select: { id: true, paidAmount: true },
      });
      if (finalizedInvoice) {
        await tx.invoice.update({
          where: { id: finalizedInvoice.id },
          data: {
            subtotal: totals.subtotal,
            discountAmount: totals.discountAmount,
            discountReason,
            vatRate: totals.vatRate,
            vatAmount: totals.vatAmount,
            totalAmount: totals.totalAmount,
            remainingAmount: decimalMaxZero(
              totals.totalAmount.minus(finalizedInvoice.paidAmount),
            ),
          },
        });
      }
    });
    const updated = await this.getDashboardBooking(user, bookingId);
    await this.audit.log({
      userId: user.userId,
      action: 'booking.discount_applied',
      module: 'bookings',
      entityId: bookingId,
      oldValue: {
        totalAmount: beforeTotal,
        discountAmount: Number(booking.discountAmount.toString()),
      },
      newValue: {
        totalAmount: updated.totalAmount,
        discountAmount: updated.discountAmount,
        reason: discountReason,
      },
    });
    return updated;
  }

  async listChangeRequests(
    user: DashboardJwtUser,
    query: ChangeRequestListQueryDto,
  ) {
    const branchWhere = buildDashboardBookingBranchWhere(user, query.branchId);

    const where: Prisma.BookingChangeRequestWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.bookingId) {
      where.bookingId = query.bookingId;
    }
    if (Object.keys(branchWhere).length) {
      where.booking = { is: branchWhere };
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
    assertDashboardBranchAccess(user, row.booking.branchId);
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
        assertDashboardBranchAccess(user, row.booking.branchId);

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

    const approved = await this.getChangeRequest(user, requestId);
    if (approved.requestType === BookingChangeRequestType.CANCEL) {
      this.bookingNotifications.notifyBookingCancelled(approved.bookingId);
    } else {
      this.bookingNotifications.notifyChangeRequestApproved(requestId);
    }
    return approved;
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
    this.bookingNotifications.notifyChangeRequestRejected(requestId);
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

  async dashboardCreateChangeRequest(
    user: DashboardJwtUser,
    bookingId: string,
    dto: DashboardCreateChangeRequestDto,
  ) {
    const booking = await this.requireDashboardBooking(user, bookingId);
    if (
      booking.status === BookingStatus.CANCELLED ||
      booking.status === BookingStatus.REJECTED ||
      booking.status === BookingStatus.COMPLETED ||
      booking.status === BookingStatus.NO_SHOW
    ) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message:
            'Cannot create a change request for a cancelled, rejected, completed, or no-show booking',
          error: 'Bad Request',
          code: 'INVALID_BOOKING_STATE',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (dto.requestType === BookingChangeRequestType.RESCHEDULE) {
      if (!dto.requestedSlotId) {
        throw new HttpException(
          {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'requestedSlotId is required for RESCHEDULE',
            error: 'Bad Request',
            code: 'INVALID_REQUESTED_SLOT',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      if (dto.requestedSlotId === booking.slotId) {
        throw new HttpException(
          {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'New slot must differ from the current booking slot',
            error: 'Bad Request',
            code: 'SAME_SLOT',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    const dup = await this.prisma.bookingChangeRequest.findFirst({
      where: {
        bookingId,
        requestType: dto.requestType,
        status: BookingChangeRequestStatus.PENDING,
      },
    });
    if (dup) {
      throw new ConflictException(
        `A pending ${dto.requestType.toLowerCase()} request already exists for this booking`,
      );
    }

    let requestedSlotId: string | null = null;
    if (dto.requestType === BookingChangeRequestType.RESCHEDULE) {
      const slot = await this.prisma.bookingSlot.findFirst({
        where: {
          id: dto.requestedSlotId!,
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
      requestedSlotId = slot.id;
    }

    const row = await this.prisma.bookingChangeRequest.create({
      data: {
        bookingId,
        clientId: booking.clientId,
        requestType: dto.requestType,
        requestedSlotId,
        reason: dto.reason ?? null,
        status: BookingChangeRequestStatus.PENDING,
      },
      select: {
        id: true,
        bookingId: true,
        clientId: true,
        requestType: true,
        requestedSlotId: true,
        reason: true,
        status: true,
        createdAt: true,
      },
    });

    await this.audit.log({
      userId: user.userId,
      action: 'booking_change_request.created',
      module: 'bookings',
      entityId: row.id,
      newValue: {
        bookingId,
        requestType: dto.requestType,
        requestedSlotId,
      },
    });

    return row;
  }

  private async bookingItemsToDtoInputs(
    bookingId: string,
  ): Promise<BookingItemInputDto[]> {
    const items = await this.prisma.bookingItem.findMany({
      where: {
        bookingId,
        lineStatus: { not: BookingItemLineStatus.CANCELLED },
      },
      orderBy: { createdAt: 'asc' },
    });
    return items.map((it) => {
      const meta = it.lineMetadata as {
        selectedServiceIds?: string[];
        staffCatalogOverride?: {
          unitPrice: number;
          durationMinutes?: number;
        };
      } | null;
      const staff = meta?.staffCatalogOverride;
      return {
        itemType: it.itemType,
        serviceId: it.serviceId ?? undefined,
        serviceVariantId: it.serviceVariantId ?? undefined,
        packageId: it.packageId ?? undefined,
        bundleId: it.bundleId ?? undefined,
        serviceEnhancementId: it.serviceEnhancementId ?? undefined,
        quantity: it.quantity,
        selectedServiceIds: meta?.selectedServiceIds,
        staffOverrideUnitPrice: staff?.unitPrice,
        staffOverrideDurationMinutes: staff?.durationMinutes,
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
      where: {
        bookingId,
        lineStatus: { not: BookingItemLineStatus.CANCELLED },
      },
      include: {
        service: true,
        serviceVariant: { include: { service: true } },
        package: true,
        bundle: { include: { services: { include: { service: true } } } },
        serviceEnhancement: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return items.map((it) => {
      const meta = it.lineMetadata as { selectedServiceIds?: string[] } | null;
      let isTaxable = true;
      if (it.packageId && it.package) {
        isTaxable = it.package.isTaxable;
      } else if (it.service) {
        isTaxable = it.service.isTaxable;
      } else if (it.serviceVariant?.service) {
        isTaxable = it.serviceVariant.service.isTaxable;
      } else if (it.bundle) {
        isTaxable = it.bundle.services.some((s) => s.service.isTaxable);
      } else if (it.serviceEnhancement) {
        isTaxable = true;
      }

      return {
        itemType: it.itemType,
        serviceId: it.serviceId,
        serviceVariantId: it.serviceVariantId,
        packageId: it.packageId,
        bundleId: it.bundleId,
        serviceEnhancementId: it.serviceEnhancementId,
        nameSnapshot: it.nameSnapshot,
        priceSnapshot: it.priceSnapshot,
        durationMinutesSnapshot: it.durationMinutesSnapshot,
        quantity: it.quantity,
        isTaxable,
        discountAmount: it.discountAmount,
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
      await this.slots.syncBookingSlotFilledFromCapacityTx(tx, booking.slotId);
    } else if (
      booking.source === BookingSource.WEBSITE &&
      booking.status === BookingStatus.PENDING
    ) {
      await this.slots.releaseOneSlotCapacityTx(tx, booking.slotId);
      await this.slots.syncBookingSlotFilledFromCapacityTx(tx, booking.slotId);
    }
    await tx.bookingItem.updateMany({
      where: {
        bookingId: booking.id,
        lineStatus: {
          in: [
            BookingItemLineStatus.PENDING,
            BookingItemLineStatus.IN_PROGRESS,
          ],
        },
      },
      data: { lineStatus: BookingItemLineStatus.CANCELLED },
    });
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

    const oldSlotHeld =
      countsTowardCapacity(booking.status) ||
      (booking.source === BookingSource.WEBSITE &&
        booking.status === BookingStatus.PENDING);
    if (oldSlotHeld) {
      await tx.bookingSlot.update({
        where: { id: booking.slotId },
        data: { bookedCount: { decrement: 1 } },
      });
      await this.slots.syncBookingSlotFilledFromCapacityTx(tx, booking.slotId);
    }

    const reservedNew = await this.slots.tryReserveOneSlotCapacityTx(
      tx,
      newSlot.id,
    );
    if (!reservedNew) {
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
    await this.slots.syncBookingSlotFilledFromCapacityTx(tx, newSlot.id);

    await tx.booking.update({
      where: { id: booking.id },
      // Spec v2 §6: a staff reschedule lands directly on CONFIRMED.
      data: { slotId: newSlot.id, status: BookingStatus.CONFIRMED },
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
    assertDashboardBranchAccess(user, booking.branchId);
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
        source: BookingSource;
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
        assertDashboardBranchAccess(user, booking.branchId);
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
        await this.slots.syncBookingSlotFilledFromCapacityTx(
          tx,
          booking.slotId,
        );
      }
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: spec.to },
      });
    });
  }

  private async assertDashboardSlotAssignable(
    branchId: string,
    slotId: string,
  ): Promise<void> {
    const slot = await this.prisma.bookingSlot.findFirst({
      where: {
        id: slotId,
        branchId,
        deletedAt: null,
        isWalkInBucket: false,
      },
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
    appliedPromoCode: string | null;
    subtotal: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
    discountReason: string | null;
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
      serviceEnhancementId: string | null;
      nameSnapshot: string;
      priceSnapshot: Prisma.Decimal;
      discountAmount: Prisma.Decimal;
      discountReason: string | null;
      durationMinutesSnapshot: number;
      quantity: number;
      lineMetadata: Prisma.JsonValue | null;
      lineStatus: BookingItemLineStatus;
      staffProfileId: string | null;
      startedAt: Date | null;
      completedAt: Date | null;
      staffProfile?: { id: string; displayName: string } | null;
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
      totalAmount: Prisma.Decimal;
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
      appliedPromoCode: booking.appliedPromoCode,
      subtotal: Number(booking.subtotal.toString()),
      discountAmount: Number(booking.discountAmount.toString()),
      discountReason: booking.discountReason,
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
        ? presentBookingSlot(booking.slot, booking)
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
          serviceEnhancementId: it.serviceEnhancementId,
          nameSnapshot: it.nameSnapshot,
          priceSnapshot: Number(it.priceSnapshot.toString()),
          discountAmount: Number(it.discountAmount.toString()),
          discountReason: it.discountReason,
          durationMinutesSnapshot: it.durationMinutesSnapshot,
          quantity: it.quantity,
          lineMetadata: it.lineMetadata,
          lineStatus: it.lineStatus,
          staffProfileId: it.staffProfileId,
          startedAt: it.startedAt?.toISOString() ?? null,
          completedAt: it.completedAt?.toISOString() ?? null,
          staffDisplayName: it.staffProfile?.displayName ?? null,
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
            totalAmount: Number(inv.totalAmount.toString()),
            paidAmount: Number(inv.paidAmount.toString()),
            remainingAmount: Number(inv.remainingAmount.toString()),
            status: inv.status,
            paymentStatus: inv.remainingAmount.lessThanOrEqualTo(0)
              ? 'PAID'
              : inv.paidAmount.greaterThan(0)
                ? 'PARTIALLY_PAID'
                : 'UNPAID',
          }
        : null,
    };
  }
}
