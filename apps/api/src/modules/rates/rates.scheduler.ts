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
  private _paused = false;

  constructor(
    @Inject(RatesService) private ratesService: RatesService,
    @Inject(RatesGateway) private ratesGateway: RatesGateway,
  ) {}

  get paused() {
    return this._paused;
  }

  async onModuleInit() {
    this.logger.log('Starting rate scheduler...');
    await this.ratesService.refreshRates();
    this.startTimers();
    this.logger.log(
      `Scheduler active: refresh=${REFRESH_INTERVAL_MS}ms, broadcast=${WS_BROADCAST_INTERVAL_MS}ms`,
    );
  }

  onModuleDestroy() {
    this.stopTimers();
  }

  /** Pause all rate fetching. Existing cached rates remain available. */
  pause() {
    if (this._paused) return;
    this._paused = true;
    this.stopTimers();
    this.logger.warn('Rate scheduler PAUSED — no more API calls until resumed');
  }

  /** Resume rate fetching and immediately refresh once. */
  async resume() {
    if (!this._paused) return;
    this._paused = false;
    await this.ratesService.refreshRates();
    this.startTimers();
    this.logger.log('Rate scheduler RESUMED');
  }

  /** Fetch once without starting the timers (useful when paused). */
  async fetchOnce() {
    this.logger.log('Manual one-time rate fetch triggered');
    await this.ratesService.refreshRates();
    const rates = await this.ratesService.getLatestRates();
    this.ratesGateway.broadcastRates(rates);
  }

  private startTimers() {
    this.stopTimers();

    this.refreshTimer = setInterval(async () => {
      await this.ratesService.refreshRates();
    }, REFRESH_INTERVAL_MS);

    this.broadcastTimer = setInterval(async () => {
      const rates = await this.ratesService.getLatestRates();
      this.ratesGateway.broadcastRates(rates);
    }, WS_BROADCAST_INTERVAL_MS);

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
  }

  private stopTimers() {
    if (this.refreshTimer) { clearInterval(this.refreshTimer); this.refreshTimer = null; }
    if (this.broadcastTimer) { clearInterval(this.broadcastTimer); this.broadcastTimer = null; }
    if (this.snapshotTimer) { clearInterval(this.snapshotTimer); this.snapshotTimer = null; }
  }
}
