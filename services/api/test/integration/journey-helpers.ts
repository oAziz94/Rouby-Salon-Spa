/**
 * Shared setup for the end-to-end journey suites.
 *
 * Every run gets its own branch, so the cash drawer and the daily closing of "today" are
 * always fresh (a closed day cannot be reopened, and the test database is reused between
 * runs). Slot times are Cairo wall-clock times, like production.
 */
import { BookingSlotStatus } from '@prisma/client';
import { getCairoNowCompositeKey } from '../../src/common/cairo-slot-time';
import { BRANCH_ID, prisma, SVC_CUT, SVC_MANI, USERS } from './harness';

export type JourneyBranch = {
  id: string;
  name: string;
  /** Mona's staff profile at this branch (works every day, all day). */
  staffProfileId: string;
};

/** A new branch with the two seeded services, Mona working all day, and reception access. */
export async function createJourneyBranch(
  label: string,
): Promise<JourneyBranch> {
  const name = `${label} ${Date.now().toString(36).toUpperCase()}`;
  const branch = await prisma.branch.create({
    data: { name, address: 'Journey test branch', phone: '0100000000' },
  });
  await prisma.serviceBranch.createMany({
    data: [SVC_CUT, SVC_MANI].map((serviceId) => ({
      serviceId,
      branchId: branch.id,
    })),
  });
  const mona = await prisma.user.findUniqueOrThrow({
    where: { email: USERS.staff.email },
    select: { id: true },
  });
  const profile = await prisma.staffProfile.create({
    data: {
      userId: mona.id,
      branchId: branch.id,
      displayName: 'Mona',
      isBookable: true,
      isActive: true,
      services: {
        create: [{ serviceId: SVC_CUT }, { serviceId: SVC_MANI }],
      },
      schedules: {
        create: Array.from({ length: 7 }, (_, dayOfWeek) => ({
          branchId: branch.id,
          dayOfWeek,
          startTime: new Date('1970-01-01T00:00:00.000Z'),
          endTime: new Date('1970-01-01T23:59:59.000Z'),
          isWorking: true,
        })),
      },
    },
  });
  const reception = await prisma.user.findUniqueOrThrow({
    where: { email: USERS.receptionist.email },
    select: { id: true },
  });
  // Explicit access rows replace the default branch, so keep the main branch listed too.
  await prisma.userBranchAccess.createMany({
    data: [BRANCH_ID, branch.id].map((branchId) => ({
      userId: reception.id,
      branchId,
    })),
    skipDuplicates: true,
  });
  return { id: branch.id, name, staffProfileId: profile.id };
}

/** Remove reception's access to a journey branch so other suites see the usual setup. */
export async function releaseJourneyBranch(branch: JourneyBranch) {
  await prisma.userBranchAccess.deleteMany({
    where: { branchId: branch.id, user: { email: USERS.receptionist.email } },
  });
}

/** Cairo wall clock now + `minutes`, as slot date and HH:mm:ss. */
export function cairoPlus(minutes: number): { date: string; time: string } {
  const now = new Date(`${getCairoNowCompositeKey().slice(0, 19)}Z`);
  const at = new Date(now.getTime() + minutes * 60_000);
  at.setUTCSeconds(0, 0);
  const iso = at.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 19) };
}

export const cairoToday = (): string => getCairoNowCompositeKey().slice(0, 10);
/** Cash drawer and daily closing use the UTC calendar day. */
export const utcToday = (): string => new Date().toISOString().slice(0, 10);

/** A slot at `branchId`; `end` defaults to start + 30 min, kept inside the same day. */
export async function createBranchSlot(
  branchId: string,
  opts: { date: string; start: string; end?: string; capacity?: number },
) {
  let end = opts.end;
  if (!end) {
    const [h, m] = opts.start.split(':').map(Number);
    const mins = Math.min(h * 60 + m + 30, 23 * 60 + 59);
    end = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}:00`;
  }
  return prisma.bookingSlot.create({
    data: {
      branchId,
      date: new Date(`${opts.date}T00:00:00.000Z`),
      startTime: new Date(`1970-01-01T${opts.start}.000Z`),
      endTime: new Date(`1970-01-01T${end}.000Z`),
      capacity: opts.capacity ?? 3,
      bookedCount: 0,
      status: BookingSlotStatus.AVAILABLE,
      isOnlineBookable: true,
      notes: 'journey-test',
    },
  });
}

/** Captures WhatsApp messages instead of sending them; can be told to fail for a number. */
export class FakeWhatsApp {
  readonly sent: Array<{ chatId: string; text: string }> = [];
  readonly failFor = new Set<string>();

  sendTextMessage(chatId: string, text: string): Promise<void> {
    const digits = chatId.replace(/\D/g, '');
    if (this.failFor.has(digits)) {
      return Promise.reject(new Error('WAPilot send-message returned 502'));
    }
    this.sent.push({ chatId: digits, text });
    return Promise.resolve();
  }

  to(phone: string): string[] {
    const digits = phone.replace(/\D/g, '');
    return this.sent.filter((m) => m.chatId === digits).map((m) => m.text);
  }
}

/** Notifications are sent after the HTTP response; wait for the log row to settle. */
export async function waitForNotification(
  bookingId: string,
  type: string,
  status: 'SENT' | 'FAILED' = 'SENT',
  timeoutMs = 10_000,
) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const row = await prisma.notificationLog.findFirst({
      where: { bookingId, type: type as never, status },
      orderBy: { createdAt: 'desc' },
    });
    if (row) return row;
    if (Date.now() > until) {
      throw new Error(`no ${status} ${type} notification for ${bookingId}`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}

/** Give fire-and-forget sends time to finish, then list what was logged for a booking. */
export async function notificationTypes(bookingId: string, settleMs = 1500) {
  await new Promise((r) => setTimeout(r, settleMs));
  const rows = await prisma.notificationLog.findMany({
    where: { bookingId },
    orderBy: { createdAt: 'asc' },
    select: { type: true, status: true },
  });
  return rows.map((r) => `${r.type}:${r.status}`);
}
