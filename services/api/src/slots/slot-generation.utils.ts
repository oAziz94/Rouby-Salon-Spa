import { BadRequestException } from '@nestjs/common';
import { toDateOnlyUtc, toTimeOnlyUtc } from '../common/cairo-slot-time';
import type { SlotGenerationOverridesDto } from './dto/slot-generation-overrides.dto';

export const SLOT_GENERATION_SCHEMA_VERSION = 1 as const;

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

export type SlotGenerationBreakPeriod = {
  startTime: string;
  endTime: string;
};

export type SlotGenerationDefaultsV1 = {
  schemaVersion: typeof SLOT_GENERATION_SCHEMA_VERSION;
  workingDays: number[];
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
  defaultCapacity: number;
  defaultOnlineBookable: boolean;
  breakPeriods: SlotGenerationBreakPeriod[];
};

export function defaultSlotGeneration(): SlotGenerationDefaultsV1 {
  return {
    schemaVersion: SLOT_GENERATION_SCHEMA_VERSION,
    workingDays: [1, 2, 3, 4, 5, 6],
    startTime: '10:00',
    endTime: '20:00',
    slotDurationMinutes: 60,
    defaultCapacity: 1,
    defaultOnlineBookable: true,
    breakPeriods: [],
  };
}

function normalizeTime(value: string): string {
  return value.length === 5 ? `${value}:00` : value;
}

export function timeToMinutes(value: string): number {
  const v = normalizeTime(value);
  const parts = v.split(':');
  const h = Number(parts[0]);
  const min = Number(parts[1]);
  return h * 60 + min;
}

export function minutesToTimeString(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Accepts integers and numeric strings from JSON / admin tooling. */
function coerceIntInRange(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const n = Math.round(value);
    if (Number.isInteger(n) && n >= min && n <= max) {
      return n;
    }
  }
  if (typeof value === 'string') {
    const n = Number.parseInt(value.trim(), 10);
    if (!Number.isNaN(n) && n >= min && n <= max) {
      return n;
    }
  }
  return fallback;
}

function coerceWorkingDays(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const out: number[] = [];
  for (const item of value) {
    if (
      typeof item !== 'number' ||
      !Number.isInteger(item) ||
      item < 0 ||
      item > 6
    ) {
      return null;
    }
    out.push(item);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

function coerceBreakPeriods(
  value: unknown,
): SlotGenerationBreakPeriod[] | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (!Array.isArray(value)) {
    return null;
  }
  if (value.length === 0) {
    return [];
  }
  const out: SlotGenerationBreakPeriod[] = [];
  for (const row of value) {
    if (!isPlainObject(row)) {
      return null;
    }
    const st = row.startTime;
    const et = row.endTime;
    if (typeof st !== 'string' || typeof et !== 'string') {
      return null;
    }
    if (
      !TIME_PATTERN.test(normalizeTime(st)) ||
      !TIME_PATTERN.test(normalizeTime(et))
    ) {
      return null;
    }
    out.push({
      startTime: st.length === 5 ? `${st}:00` : st,
      endTime: et.length === 5 ? `${et}:00` : et,
    });
  }
  return out;
}

/** Overlay `stored` JSON onto code defaults; does not validate business rules. */
export function parseStoredSlotGeneration(
  stored: unknown,
): SlotGenerationDefaultsV1 {
  const base = defaultSlotGeneration();
  if (!isPlainObject(stored)) {
    return base;
  }
  const wd = coerceWorkingDays(stored.workingDays);
  const breaks = coerceBreakPeriods(stored.breakPeriods);
  return {
    schemaVersion: SLOT_GENERATION_SCHEMA_VERSION,
    workingDays: wd ?? base.workingDays,
    startTime:
      typeof stored.startTime === 'string' ? stored.startTime : base.startTime,
    endTime: typeof stored.endTime === 'string' ? stored.endTime : base.endTime,
    slotDurationMinutes: coerceIntInRange(
      stored.slotDurationMinutes,
      5,
      480,
      base.slotDurationMinutes,
    ),
    defaultCapacity: coerceIntInRange(
      stored.defaultCapacity,
      1,
      500,
      base.defaultCapacity,
    ),
    defaultOnlineBookable:
      typeof stored.defaultOnlineBookable === 'boolean'
        ? stored.defaultOnlineBookable
        : typeof stored.defaultOnlineBookable === 'string' &&
            (stored.defaultOnlineBookable === 'true' ||
              stored.defaultOnlineBookable === 'false')
          ? stored.defaultOnlineBookable === 'true'
          : base.defaultOnlineBookable,
    breakPeriods: breaks ?? base.breakPeriods,
  };
}

export function mergeSlotGeneration(
  current: SlotGenerationDefaultsV1,
  patch: Partial<{
    workingDays: number[];
    startTime: string;
    endTime: string;
    slotDurationMinutes: number;
    defaultCapacity: number;
    defaultOnlineBookable: boolean;
    breakPeriods: SlotGenerationBreakPeriod[];
  }>,
): SlotGenerationDefaultsV1 {
  return {
    schemaVersion: SLOT_GENERATION_SCHEMA_VERSION,
    workingDays:
      patch.workingDays !== undefined ? patch.workingDays : current.workingDays,
    startTime:
      patch.startTime !== undefined ? patch.startTime : current.startTime,
    endTime: patch.endTime !== undefined ? patch.endTime : current.endTime,
    slotDurationMinutes:
      patch.slotDurationMinutes !== undefined
        ? patch.slotDurationMinutes
        : current.slotDurationMinutes,
    defaultCapacity:
      patch.defaultCapacity !== undefined
        ? patch.defaultCapacity
        : current.defaultCapacity,
    defaultOnlineBookable:
      patch.defaultOnlineBookable !== undefined
        ? patch.defaultOnlineBookable
        : current.defaultOnlineBookable,
    breakPeriods:
      patch.breakPeriods !== undefined
        ? patch.breakPeriods
        : current.breakPeriods,
  };
}

export function intervalsOverlapHalfOpen(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function slotOverlapsAnyBreak(
  slotStart: number,
  slotEnd: number,
  breaks: { start: number; end: number }[],
): boolean {
  return breaks.some((b) =>
    intervalsOverlapHalfOpen(slotStart, slotEnd, b.start, b.end),
  );
}

/** Validates merged config; throws BadRequestException on failure. */
export function assertValidSlotGeneration(
  config: SlotGenerationDefaultsV1,
): void {
  const wd = coerceWorkingDays(config.workingDays);
  if (!wd || wd.length === 0) {
    throw new BadRequestException(
      'workingDays must be a non-empty list of 0–6',
    );
  }

  if (
    !TIME_PATTERN.test(normalizeTime(config.startTime)) ||
    !TIME_PATTERN.test(normalizeTime(config.endTime))
  ) {
    throw new BadRequestException(
      'startTime and endTime must be HH:mm or HH:mm:ss',
    );
  }

  const startM = timeToMinutes(config.startTime);
  const endM = timeToMinutes(config.endTime);
  if (startM >= endM) {
    throw new BadRequestException('endTime must be after startTime');
  }

  const dur = config.slotDurationMinutes;
  if (!Number.isInteger(dur) || dur < 5 || dur > 480) {
    throw new BadRequestException(
      'slotDurationMinutes must be an integer between 5 and 480',
    );
  }

  const cap = config.defaultCapacity;
  if (!Number.isInteger(cap) || cap < 1 || cap > 500) {
    throw new BadRequestException(
      'defaultCapacity must be an integer between 1 and 500',
    );
  }

  const breaks = config.breakPeriods ?? [];
  const breakRanges: { start: number; end: number }[] = [];
  for (const br of breaks) {
    const bs = timeToMinutes(br.startTime);
    const be = timeToMinutes(br.endTime);
    if (bs >= be) {
      throw new BadRequestException(
        'Each break period must have end after start',
      );
    }
    if (bs < startM || be > endM) {
      throw new BadRequestException(
        'Break periods must fall within working hours (startTime–endTime)',
      );
    }
    breakRanges.push({ start: bs, end: be });
  }
  const sorted = [...breakRanges].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].start < sorted[i - 1].end) {
      throw new BadRequestException('Break periods must not overlap');
    }
  }
}

export function addUtcDaysToDateString(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function slotDuplicateKey(row: {
  date: Date;
  startTime: Date;
  endTime: Date;
}): string {
  return `${toDateOnlyUtc(row.date)}|${toTimeOnlyUtc(row.startTime)}|${toTimeOnlyUtc(row.endTime)}`;
}

export function buildExistingSlotKeySet(
  rows: Array<{ date: Date; startTime: Date; endTime: Date }>,
): Set<string> {
  return new Set(rows.map((r) => slotDuplicateKey(r)));
}

export function pickOverridesFromSlotDto(
  dto: SlotGenerationOverridesDto,
): Partial<SlotGenerationDefaultsV1> {
  const patch: Partial<SlotGenerationDefaultsV1> = {};
  if (dto.workingDays !== undefined) {
    patch.workingDays = dto.workingDays;
  }
  if (dto.startTime !== undefined) {
    patch.startTime = dto.startTime;
  }
  if (dto.endTime !== undefined) {
    patch.endTime = dto.endTime;
  }
  if (dto.slotDurationMinutes !== undefined) {
    patch.slotDurationMinutes = dto.slotDurationMinutes;
  }
  if (dto.defaultCapacity !== undefined) {
    patch.defaultCapacity = dto.defaultCapacity;
  }
  if (dto.defaultOnlineBookable !== undefined) {
    patch.defaultOnlineBookable = dto.defaultOnlineBookable;
  }
  if (dto.breakPeriods !== undefined) {
    patch.breakPeriods = dto.breakPeriods.map((b) => ({
      startTime: b.startTime,
      endTime: b.endTime,
    }));
  }
  return patch;
}
