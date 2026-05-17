import { NotificationStatus, NotificationType } from '@prisma/client';
import { NotificationLogService } from './notification-log.service';

describe('NotificationLogService', () => {
  it('prevents duplicate successful booking notifications', async () => {
    const prisma = {
      notificationLog: {
        findFirst: jest.fn().mockResolvedValue({ id: 'log-1' }),
      },
    };
    const service = new NotificationLogService(prisma as never);
    const dup = await service.hasSuccessfulBookingNotification(
      'b1',
      NotificationType.APPOINTMENT_REMINDER,
    );
    expect(dup).toBe(true);
    expect(prisma.notificationLog.findFirst).toHaveBeenCalledWith({
      where: {
        bookingId: 'b1',
        type: NotificationType.APPOINTMENT_REMINDER,
        status: NotificationStatus.SENT,
      },
      select: { id: true },
    });
  });
});
