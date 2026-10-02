import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  slotAutoGenerationEnabled,
  slotHorizonDays,
} from './slot-generation.utils';
import { SlotsService } from './slots.service';

/**
 * Keeps bookable slots available `SLOT_HORIZON_DAYS` ahead (spec v2 §5) so nobody has to
 * remember to press "Generate week". Runs nightly and once shortly after the API starts,
 * which also heals any gap left by downtime.
 */
@Injectable()
export class SlotHorizonScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(SlotHorizonScheduler.name);
  private running = false;

  constructor(private readonly slots: SlotsService) {}

  onApplicationBootstrap(): void {
    if (!slotAutoGenerationEnabled() || process.env.NODE_ENV === 'test') {
      return;
    }
    this.logger.log(
      `Automatic slots on: ${slotHorizonDays()} days ahead, nightly at 01:10 Cairo and once after start`,
    );
    setTimeout(() => void this.run('startup'), 20_000);
  }

  @Cron('10 1 * * *', { timeZone: 'Africa/Cairo' })
  async nightly(): Promise<void> {
    if (!slotAutoGenerationEnabled()) {
      return;
    }
    await this.run('nightly');
  }

  async run(trigger: 'startup' | 'nightly'): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const results =
        await this.slots.ensureSlotHorizonAllBranches(slotHorizonDays());
      const created = results.reduce((n, r) => n + r.createdCount, 0);
      const unconfigured = results.filter((r) => !r.configured).length;
      this.logger.log(
        `Slot horizon (${trigger}): ${created} slot(s) created across ${results.length} branch(es), ${slotHorizonDays()} days ahead` +
          (unconfigured > 0
            ? `; ${unconfigured} branch(es) skipped — slot defaults not saved yet`
            : ''),
      );
    } catch (err) {
      this.logger.error(
        `Slot horizon (${trigger}) failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.running = false;
    }
  }
}
