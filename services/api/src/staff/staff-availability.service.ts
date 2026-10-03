import { Injectable } from '@nestjs/common';
import {
  BookingItemLineStatus,
  BookingStatus,
  StaffScheduleExceptionType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  cairoTodayYmd,
  cairoWeekdayIndexFromDateString,
  getCairoNowCompositeKey,
} from '../common/cairo-slot-time';

export type StaffAvailabilityEntry = {
  staffProfileId: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  status: 'AVAILABLE' | 'UNAVAILABLE';
  reason?: string;
};

function timeFromDbTime(d: Date): string {
  return d.toISOString().slice(11, 19);
}

/** Lexicographic compare for HH:mm:ss strings (UTC wall projection used project-wide). */
function timeBetweenInclusive(t: string, start: string, end: string): boolean {
  return t >= start && t <= end;
}

function subtractBreak(
  start: string,
  end: string,
  breakStart: string | null,
  breakEnd: string | null,
): Array<{ start: string; end: string }> {
  if (!breakStart || !breakEnd || breakStart >= breakEnd) {
    return [{ start, end }];
  }
  if (breakEnd <= start || breakStart >= end) {
    return [{ start, end }];
  }
  const out: Array<{ start: string; end: string }> = [];
  if (start < breakStart) {
    out.push({ start, end: breakStart < end ? breakStart : end });
  }
  if (breakEnd < end) {
    out.push({ start: breakEnd > start ? breakEnd : start, end });
  }
  return out.filter((w) => w.start < w.end);
}

function mergeIntervals(
  windows: Array<{ start: string; end: string }>,
): Array<{ start: string; end: string }> {
  const sorted = [...windows].sort((a, b) => a.start.localeCompare(b.start));
  const merged: Array<{ start: string; end: string }> = [];
  for (const w of sorted) {
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push({ ...w });
      continue;
    }
    if (w.start <= last.end) {
      if (w.end > last.end) last.end = w.end;
    } else {
      merged.push({ ...w });
    }
  }
  return merged;
}

@Injectable()
export class StaffAvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  /** Resolve catalog service id used for StaffProfileService rows (variant → parent service). */
  async resolveCatalogServiceIdForBookingItem(item: {
    itemType: string;
    serviceId: string | null;
    serviceVariantId: string | null;
  }): Promise<string | null> {
    if (item.serviceId) return item.serviceId;
    if (!item.serviceVariantId) return null;
    const v = await this.prisma.serviceVariant.findUnique({
      where: { id: item.serviceVariantId },
      select: { serviceId: true },
    });
    return v?.serviceId ?? null;
  }

  async hasCapability(
    staffProfileId: string,
    catalogServiceId: string,
  ): Promise<boolean> {
    const row = await this.prisma.staffProfileService.findUnique({
      where: {
        staffProfileId_serviceId: {
          staffProfileId,
          serviceId: catalogServiceId,
        },
      },
      select: { id: true },
    });
    return !!row;
  }

  /**
   * Busy = an IN_PROGRESS line whose stylist is hands-on right now. A line inside its
   * processing window (colour developing…) leaves the stylist free for another client.
   * Processing values are read live from the service, so a catalog edit applies at once.
   */
  async hasInProgressElsewhere(
    staffProfileId: string,
    excludeBookingItemId?: string,
    now: Date = new Date(),
  ): Promise<boolean> {
    const state = await this.inProgressStateFor([staffProfileId], now);
    const s = state.get(staffProfileId);
    if (!s) return false;
    if (excludeBookingItemId && s.handsOnItemIds.size === 1) {
      return !s.handsOnItemIds.has(excludeBookingItemId);
    }
    return s.handsOn > 0;
  }

  /**
   * Per staff: how many in-progress lines are hands-on vs. in their processing window.
   * One query for a set of profiles (overview, staff pickers).
   */
  async inProgressStateFor(
    staffProfileIds: string[],
    now: Date = new Date(),
  ): Promise<
    Map<
      string,
      { handsOn: number; processing: number; handsOnItemIds: Set<string> }
    >
  > {
    const out = new Map<
      string,
      { handsOn: number; processing: number; handsOnItemIds: Set<string> }
    >();
    if (staffProfileIds.length === 0) return out;
    const rows = await this.prisma.bookingItem.findMany({
      where: {
        staffProfileId: { in: staffProfileIds },
        lineStatus: BookingItemLineStatus.IN_PROGRESS,
        booking: {
          status: {
            notIn: [
              BookingStatus.CANCELLED,
              BookingStatus.REJECTED,
              BookingStatus.COMPLETED,
              BookingStatus.NO_SHOW,
            ],
          },
        },
      },
      select: {
        id: true,
        staffProfileId: true,
        startedAt: true,
        service: {
          select: {
            processingMinutes: true,
            processingStartsAfterMinutes: true,
          },
        },
        serviceVariant: {
          select: {
            service: {
              select: {
                processingMinutes: true,
                processingStartsAfterMinutes: true,
              },
            },
          },
        },
      },
    });
    for (const r of rows) {
      if (!r.staffProfileId) continue;
      const svc = r.service ?? r.serviceVariant?.service ?? null;
      const inProcessing = isInProcessingWindow(
        r.startedAt,
        svc?.processingStartsAfterMinutes ?? 0,
        svc?.processingMinutes ?? 0,
        now,
      );
      const s = out.get(r.staffProfileId) ?? {
        handsOn: 0,
        processing: 0,
        handsOnItemIds: new Set<string>(),
      };
      if (inProcessing) s.processing += 1;
      else {
        s.handsOn += 1;
        s.handsOnItemIds.add(r.id);
      }
      out.set(r.staffProfileId, s);
    }
    return out;
  }

  /**
   * Builds effective working wall-clock intervals (HH:mm:ss) for a Cairo calendar date string.
   */
  async buildWorkingIntervals(
    staffProfileId: string,
    branchId: string,
    dateYmd: string,
  ): Promise<Array<{ start: string; end: string }>> {
    const dayIdx = cairoWeekdayIndexFromDateString(dateYmd);
    const dateOnly = new Date(`${dateYmd}T00:00:00.000Z`);

    const exceptions = await this.prisma.staffScheduleException.findMany({
      where: {
        staffProfileId,
        branchId,
        date: dateOnly,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (exceptions.some((e) => e.type === StaffScheduleExceptionType.DAY_OFF)) {
      return [];
    }

    const custom = exceptions.find(
      (e) => e.type === StaffScheduleExceptionType.CUSTOM_HOURS,
    );
    const extras = exceptions.filter(
      (e) => e.type === StaffScheduleExceptionType.EXTRA_SHIFT,
    );

    const windows: Array<{ start: string; end: string }> = [];

    if (
      custom &&
      custom.startTime &&
      custom.endTime &&
      timeFromDbTime(custom.startTime) < timeFromDbTime(custom.endTime)
    ) {
      const s = timeFromDbTime(custom.startTime);
      const e = timeFromDbTime(custom.endTime);
      windows.push(
        ...subtractBreak(
          s,
          e,
          custom.startTime && custom.endTime ? null : null,
          null,
        ),
      );
    } else {
      const weekly = await this.prisma.staffSchedule.findUnique({
        where: {
          staffProfileId_branchId_dayOfWeek: {
            staffProfileId,
            branchId,
            dayOfWeek: dayIdx,
          },
        },
      });
      if (weekly?.isWorking && weekly.startTime && weekly.endTime) {
        const s = timeFromDbTime(weekly.startTime);
        const e = timeFromDbTime(weekly.endTime);
        const bs = weekly.breakStartTime
          ? timeFromDbTime(weekly.breakStartTime)
          : null;
        const be = weekly.breakEndTime
          ? timeFromDbTime(weekly.breakEndTime)
          : null;
        windows.push(...subtractBreak(s, e, bs, be));
      }
    }

    for (const ex of extras) {
      if (!ex.startTime || !ex.endTime) continue;
      const s = timeFromDbTime(ex.startTime);
      const e = timeFromDbTime(ex.endTime);
      if (s < e) windows.push({ start: s, end: e });
    }

    return mergeIntervals(windows);
  }

  isInstantAvailableOnDate(
    intervals: Array<{ start: string; end: string }>,
    compositeKey: string,
  ): boolean {
    const t = compositeKey.slice(11, 19);
    return intervals.some((w) => timeBetweenInclusive(t, w.start, w.end));
  }

  async evaluateStaffForInstant(
    staffProfileId: string,
    branchId: string,
    whenCompositeKey: string,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const dateYmd = whenCompositeKey.slice(0, 10);
    const profile = await this.prisma.staffProfile.findFirst({
      where: { id: staffProfileId, branchId, isActive: true },
    });
    if (!profile) {
      return { ok: false, reason: 'Staff profile not found or inactive' };
    }
    if (!profile.isBookable) {
      return { ok: false, reason: 'Staff profile is not bookable' };
    }
    const intervals = await this.buildWorkingIntervals(
      staffProfileId,
      branchId,
      dateYmd,
    );
    if (intervals.length === 0) {
      return { ok: false, reason: 'Not scheduled at this time' };
    }
    if (!this.isInstantAvailableOnDate(intervals, whenCompositeKey)) {
      return { ok: false, reason: 'Outside working hours for this date' };
    }
    if (await this.hasInProgressElsewhere(staffProfileId)) {
      return { ok: false, reason: 'Staff already has a service in progress' };
    }
    return { ok: true };
  }

  async listQualifiedStaffForService(
    branchId: string,
    catalogServiceId: string,
    whenCompositeKey: string,
  ): Promise<StaffAvailabilityEntry[]> {
    const profiles = await this.prisma.staffProfile.findMany({
      where: {
        branchId,
        isActive: true,
        isBookable: true,
        services: { some: { serviceId: catalogServiceId } },
      },
      include: {
        user: { select: { email: true, phone: true } },
      },
      orderBy: { displayName: 'asc' },
    });

    const out: StaffAvailabilityEntry[] = [];
    for (const p of profiles) {
      const intervals = await this.buildWorkingIntervals(
        p.id,
        branchId,
        whenCompositeKey.slice(0, 10),
      );
      if (intervals.length === 0) {
        out.push({
          staffProfileId: p.id,
          displayName: p.displayName,
          email: p.user.email,
          phone: p.user.phone,
          status: 'UNAVAILABLE',
          reason: 'Off or not scheduled (exception or weekly schedule)',
        });
        continue;
      }
      if (!this.isInstantAvailableOnDate(intervals, whenCompositeKey)) {
        out.push({
          staffProfileId: p.id,
          displayName: p.displayName,
          email: p.user.email,
          phone: p.user.phone,
          status: 'UNAVAILABLE',
          reason: 'Outside working hours now',
        });
        continue;
      }
      const state = (await this.inProgressStateFor([p.id])).get(p.id);
      if (state && state.handsOn > 0) {
        out.push({
          staffProfileId: p.id,
          displayName: p.displayName,
          email: p.user.email,
          phone: p.user.phone,
          status: 'UNAVAILABLE',
          reason: 'Busy with another in-progress service',
        });
        continue;
      }
      out.push({
        staffProfileId: p.id,
        displayName: p.displayName,
        email: p.user.email,
        phone: p.user.phone,
        status: 'AVAILABLE',
        ...(state && state.processing > 0
          ? { reason: 'Free while a client’s colour/treatment is processing' }
          : {}),
      });
    }
    return out;
  }

  cairoNowKey(): string {
    return getCairoNowCompositeKey();
  }

  cairoTodayYmd(): string {
    return cairoTodayYmd();
  }
}

/**
 * True when `now` falls inside the service's processing window:
 * [startedAt + startsAfter, startedAt + startsAfter + processing).
 */
export function isInProcessingWindow(
  startedAt: Date | null | undefined,
  processingStartsAfterMinutes: number,
  processingMinutes: number,
  now: Date = new Date(),
): boolean {
  if (!startedAt || processingMinutes <= 0) return false;
  const from = startedAt.getTime() + processingStartsAfterMinutes * 60_000;
  const to = from + processingMinutes * 60_000;
  const t = now.getTime();
  return t >= from && t < to;
}
