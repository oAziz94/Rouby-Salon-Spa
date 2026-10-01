import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
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
