import type { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Injectable, Inject, Logger } from '@nestjs/common';
import { RatesService } from './rates.service';
import { RatesGateway } from './rates.gateway';
import { REFRESH_INTERVAL_MS, WS_BROADCAST_INTERVAL_MS } from './rates.constants';

@Injectable()
export class RatesScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RatesScheduler.name);
  private refreshTimer: NodeJS.Timeout | null = null;
  private broadcastTimer: NodeJS.Timeout | null = null;
  private snapshotTimer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(RatesService) private ratesService: RatesService,
    @Inject(RatesGateway) private ratesGateway: RatesGateway,
  ) {}

  async onModuleInit() {
    // Initial fetch
    this.logger.log('Starting rate scheduler...');
    await this.ratesService.refreshRates();

    // Poll provider every REFRESH_INTERVAL_MS (default 60s)
    this.refreshTimer = setInterval(async () => {
      await this.ratesService.refreshRates();
    }, REFRESH_INTERVAL_MS);

    // Broadcast to WebSocket clients every WS_BROADCAST_INTERVAL_MS (default 3s)
    this.broadcastTimer = setInterval(async () => {
      const rates = await this.ratesService.getLatestRates();
      this.ratesGateway.broadcastRates(rates);
    }, WS_BROADCAST_INTERVAL_MS);

    // Take snapshot every 5 minutes for historical data
    this.snapshotTimer = setInterval(
      async () => {
        try {
          await this.ratesService.takeSnapshot();
        } catch {
          // Snapshots are non-critical
        }
      },
      5 * 60 * 1000,
    );

    this.logger.log(
      `Scheduler active: refresh=${REFRESH_INTERVAL_MS}ms, broadcast=${WS_BROADCAST_INTERVAL_MS}ms`,
    );
  }

  onModuleDestroy() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if (this.broadcastTimer) clearInterval(this.broadcastTimer);
    if (this.snapshotTimer) clearInterval(this.snapshotTimer);
  }
}
