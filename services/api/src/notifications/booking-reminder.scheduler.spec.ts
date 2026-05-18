import { BookingStatus, NotificationType } from '@prisma/client';
import { BookingReminderScheduler } from './booking-reminder.scheduler';
import { BookingNotificationService } from './booking-notification.service';
import { NotificationConfigService } from './notification-config.service';
import { bookingSlotStartUtcMs } from './booking-slot-format';
import * as reminderTiming from './booking-reminder-timing';

jest.mock('./booking-slot-format', () => ({
  bookingSlotStartUtcMs: jest.fn(),
}));

jest.mock('../common/cairo-slot-time', () => {
  const actual = jest.requireActual<typeof import('../common/cairo-slot-time')>(
    '../common/cairo-slot-time',
  );
  return {
    ...actual,
    getCairoNowCompositeKey: jest.fn(() => '2026-05-17T12:00:00'),
    isSlotStartStrictlyInFutureCairo: jest.fn(() => true),
  };
});

describe('BookingReminderScheduler', () => {
  let reminderNowMsSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.mocked(bookingSlotStartUtcMs).mockReset();
    reminderNowMsSpy = jest
      .spyOn(reminderTiming, 'reminderComparisonNowMs')
      .mockReturnValue(Date.now());
  });

  afterEach(() => {
    reminderNowMsSpy.mockRestore();
  });

  function createConfig(overrides: Partial<NotificationConfigService> = {}) {
    return {
      isEnabled: () => true,
      getReminderHoursBefore: () => 24,
      getReminderMinutesBeforeFinal: () => 90,
      ...overrides,
    } as NotificationConfigService;
  }

  it('skips when notifications are disabled', async () => {
    const config = createConfig({ isEnabled: () => false });
    const notifications = {
      sendAppointmentReminderForBooking: jest.fn(),
    } as unknown as BookingNotificationService;
    const prisma = { booking: { findMany: jest.fn() } };
    const scheduler = new BookingReminderScheduler(
      prisma as never,
      config,
      notifications,
    );
    await scheduler.dispatchDueReminders();
    expect(prisma.booking.findMany).not.toHaveBeenCalled();
  });

  it('does not send when slot is outside both reminder rules', async () => {
    const nowMs = Date.now();
    reminderNowMsSpy.mockReturnValue(nowMs);
    const slotMs = nowMs + 25 * 60 * 60_000;
    const slot = {
      date: new Date('2026-05-18T00:00:00.000Z'),
      startTime: new Date(),
    };
    jest.mocked(bookingSlotStartUtcMs).mockReturnValue(slotMs);

    const sendAppointmentReminderForBooking = jest.fn();
    const scheduler = new BookingReminderScheduler(
      {
        booking: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              { id: 'b1', status: BookingStatus.CONFIRMED, slot },
            ]),
        },
      } as never,
      createConfig(),
      {
        sendAppointmentReminderForBooking,
      } as unknown as BookingNotificationService,
    );
    await scheduler.dispatchDueReminders();
    expect(sendAppointmentReminderForBooking).not.toHaveBeenCalled();
  });

  it('sends 24h reminder when appointment is within 24h but outside 90m', async () => {
    const nowMs = Date.now();
    reminderNowMsSpy.mockReturnValue(nowMs);
    const slotMs = nowMs + 12 * 60 * 60_000;
    const slot = { date: new Date(), startTime: new Date() };
    jest.mocked(bookingSlotStartUtcMs).mockReturnValue(slotMs);

    const sendAppointmentReminderForBooking = jest.fn().mockResolvedValue(true);
    const scheduler = new BookingReminderScheduler(
      {
        booking: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              { id: 'b-24h', status: BookingStatus.CONFIRMED, slot },
            ]),
        },
      } as never,
      createConfig(),
      {
        sendAppointmentReminderForBooking,
      } as unknown as BookingNotificationService,
    );
    await scheduler.dispatchDueReminders();

    expect(sendAppointmentReminderForBooking).toHaveBeenCalledWith(
      'b-24h',
      NotificationType.APPOINTMENT_REMINDER,
    );
    expect(sendAppointmentReminderForBooking).not.toHaveBeenCalledWith(
      'b-24h',
      NotificationType.APPOINTMENT_REMINDER_90M,
    );
  });

  it('sends 90m reminder when appointment is within 90 minutes', async () => {
    const nowMs = Date.now();
    reminderNowMsSpy.mockReturnValue(nowMs);
    const slotMs = nowMs + 45 * 60_000;
    const slot = { date: new Date(), startTime: new Date() };
    jest.mocked(bookingSlotStartUtcMs).mockReturnValue(slotMs);

    const sendAppointmentReminderForBooking = jest.fn().mockResolvedValue(true);
    const scheduler = new BookingReminderScheduler(
      {
        booking: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              { id: 'b-45m', status: BookingStatus.CONFIRMED, slot },
            ]),
        },
      } as never,
      createConfig(),
      {
        sendAppointmentReminderForBooking,
      } as unknown as BookingNotificationService,
    );
    await scheduler.dispatchDueReminders();

    expect(sendAppointmentReminderForBooking).toHaveBeenCalledWith(
      'b-45m',
      NotificationType.APPOINTMENT_REMINDER_90M,
    );
    expect(sendAppointmentReminderForBooking).not.toHaveBeenCalledWith(
      'b-45m',
      NotificationType.APPOINTMENT_REMINDER,
    );
  });
});
