import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { computeNotificationHealth } from './notifications/notification-health';
import { PrismaService } from './prisma/prisma.service';

@ApiExcludeController()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness: process is up and the event loop is responsive. */
  @Get()
  health(): { status: string } {
    return { status: 'ok' };
  }

  /**
   * WhatsApp delivery health: 503 when messages failed in the last 24 h and none went out.
   * Polled by the uptime workflow so a dead provider token is noticed the same day.
   */
  @Get('notifications')
  async notifications() {
    const health = await computeNotificationHealth(this.prisma);
    if (health.down) {
      throw new ServiceUnavailableException({
        status: 'whatsapp_down',
        ...health,
      });
    }
    return { status: 'ok', ...health };
  }

  /** Readiness: the database answers within 3s. Use this as the Render health check. */
  @Get('ready')
  async ready(): Promise<{ status: string }> {
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('db timeout')), 3000),
        ),
      ]);
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException({ status: 'database_unavailable' });
    }
  }
}
