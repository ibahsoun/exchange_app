import { Controller, Get, Post, Body, Query, Inject } from '@nestjs/common';
import { RatesService } from './rates.service';
import { RatesScheduler } from './rates.scheduler';

@Controller('rates')
export class RatesController {
  constructor(
    @Inject(RatesService) private ratesService: RatesService,
    @Inject(RatesScheduler) private ratesScheduler: RatesScheduler,
  ) {}

  /** GET /api/rates/latest?base=USD */
  @Get('latest')
  getLatest(@Query('base') base?: string) {
    return this.ratesService.getLatestRates(base ?? 'USD');
  }

  /** GET /api/rates/pairs — pair metadata */
  @Get('pairs')
  getPairs() {
    return this.ratesService.getPairsMetadata();
  }

  /** GET /api/rates/summary — market summary stats */
  @Get('summary')
  getSummary() {
    return this.ratesService.getMarketSummary();
  }

  /** POST /api/rates/override — create or update manual override */
  @Post('override')
  setOverride(
    @Body()
    body: {
      base: string;
      quote: string;
      bid: number;
      ask: number;
      reason?: string;
      userId: string;
    },
  ) {
    return this.ratesService.setOverride(body);
  }

  /** POST /api/rates/override/disable — disable an override */
  @Post('override/disable')
  disableOverride(@Body() body: { base: string; quote: string }) {
    return this.ratesService.disableOverride(body.base, body.quote);
  }

  /** GET /api/rates/scheduler/status — check if scheduler is running or paused */
  @Get('scheduler/status')
  getSchedulerStatus() {
    return { paused: this.ratesScheduler.paused };
  }

  /** POST /api/rates/scheduler/pause — stop all rate fetching */
  @Post('scheduler/pause')
  pauseScheduler() {
    this.ratesScheduler.pause();
    return { paused: true };
  }

  /** POST /api/rates/scheduler/resume — resume rate fetching */
  @Post('scheduler/resume')
  async resumeScheduler() {
    await this.ratesScheduler.resume();
    return { paused: false };
  }

  /** POST /api/rates/scheduler/fetch-once — fetch rates one time (works even when paused) */
  @Post('scheduler/fetch-once')
  async fetchOnce() {
    await this.ratesScheduler.fetchOnce();
    return { ok: true };
  }
}
