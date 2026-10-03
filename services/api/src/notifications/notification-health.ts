import { NotificationStatus, type PrismaClient } from '@prisma/client';

export type NotificationHealth = {
  failed24h: number;
  sent24h: number;
  lastSentAt: string | null;
  lastFailedAt: string | null;
  /** True when messages failed in the last 24 h and none succeeded: the channel is down. */
  down: boolean;
};

/**
 * One question: is WhatsApp delivery working? Failures with no successes in the same
 * window mean a dead token or disconnected instance (it stayed unnoticed for four months
 * once). Shared by the Overview banner and /health/notifications.
 */
export async function computeNotificationHealth(
  prisma: Pick<PrismaClient, 'notificationLog'>,
  now = new Date(),
): Promise<NotificationHealth> {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [failed24h, sent24h, lastSent, lastFailed] = await Promise.all([
    prisma.notificationLog.count({
      where: { status: NotificationStatus.FAILED, createdAt: { gte: since } },
    }),
    prisma.notificationLog.count({
      where: { status: NotificationStatus.SENT, createdAt: { gte: since } },
    }),
    prisma.notificationLog.findFirst({
      where: { status: NotificationStatus.SENT },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    prisma.notificationLog.findFirst({
      where: { status: NotificationStatus.FAILED },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ]);
  return {
    failed24h,
    sent24h,
    lastSentAt: lastSent?.createdAt.toISOString() ?? null,
    lastFailedAt: lastFailed?.createdAt.toISOString() ?? null,
    down: failed24h > 0 && sent24h === 0,
  };
}
