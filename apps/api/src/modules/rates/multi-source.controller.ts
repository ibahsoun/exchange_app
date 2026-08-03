import { Controller, Get, Post, Body, Query, Inject, BadRequestException } from '@nestjs/common';
import { MultiSourceService } from './multi-source.service';
import type { StoreRateMode } from './rates.constants';
import { LIVE_MARKET_CLIENT } from './rates.constants';
import type { LiveMarketClient } from './providers';
import { validateSpread, validateRounding, type SpreadType, type SpreadMode, type FixedUnit } from './spread.util';

@Controller('rates')
export class MultiSourceController {
  constructor(
    @Inject(MultiSourceService) private multiSourceService: MultiSourceService,
    @Inject(LIVE_MARKET_CLIENT) private liveMarket: LiveMarketClient,
  ) {}

  /**
   * Diagnostics for the live-rate feed: what is configured (never the key), which
   * pairs the vendor currently publishes, and one real fetch — so mapping gaps
   * surface here instead of as empty cells on the board.
   */
  @Get('source-status')
  async getSourceStatus() {
    const cfg = this.liveMarket.config;
    const configured = this.liveMarket.isConfigured();
    const activeQuotes = await this.multiSourceService.getActiveQuotes();

    const base = {
      source: cfg.name,
      label: cfg.label,
      configured,
      baseUrl: cfg.baseUrl || null,
      ratesPath: cfg.ratesPath || null,
      fetchMode: cfg.fetchMode,
      authScheme: cfg.authScheme,
      apiKeySet: Boolean(cfg.apiKey),
      activeQuotes,
      mappedQuotes: activeQuotes.filter((q) => cfg.symbols[q]),
      unmappedQuotes: activeQuotes.filter((q) => !cfg.symbols[q]),
    };

    if (!configured) {
      return { ...base, probe: { ok: false, reason: 'not configured' } };
    }

    const vendorPairs = await this.liveMarket
      .listAvailablePairs()
      .catch(() => null as string[] | null);

    try {
      const { ticks, latencyMs } = await this.liveMarket.getTicks('USD', activeQuotes);
      return {
        ...base,
        vendorPairs,
        probe: {
          ok: true,
          latencyMs,
          received: ticks.length,
          missing: activeQuotes.filter((q) => !ticks.some((t) => t.quote === q)),
          stale: ticks.filter((t) => this.liveMarket.isStale(t)).map((t) => t.quote),
          quotes: ticks,
        },
      };
    } catch (err) {
      return {
        ...base,
        vendorPairs,
        probe: { ok: false, reason: err instanceof Error ? err.message : String(err) },
      };
    }
  }

  /** Base currencies the board can be displayed in, per Settings. */
  @Get('bases')
  getBases() {
    return this.multiSourceService.getValidBases();
  }

  @Get('multi-source-board')
  async getBoard(@Query('base') base?: string) {
    const baseCurrency = await this.resolveBase(base);
    return this.multiSourceService.getBoard(baseCurrency);
  }

  @Post('multi-source-board/refresh')
  async refreshBoard(@Query('base') base?: string) {
    const baseCurrency = await this.resolveBase(base);
    return this.multiSourceService.refreshBoard(baseCurrency);
  }

  @Post('store-rate')
  updateStoreRate(
    @Body()
    body: {
      base: string;
      quote: string;
      mode: StoreRateMode;
      mid?: number;
      sourceHint?: string;
      reason?: string;
      updatedBy?: string;
      spreadType?: SpreadType;
      spreadMode?: SpreadMode;
      fixedUnit?: FixedUnit;
      spreadPercent?: number;
      spreadFixed?: number;
      buyMargin?: number;
      sellMargin?: number;
    },
  ) {
    return this.multiSourceService.updateStoreRate(body);
  }

  /** Reset all pairs to Auto source, zero spread, and no rounding. */
  @Post('reset')
  resetStoreRates() {
    return this.multiSourceService.resetStoreRates();
  }

  @Get('spreads')
  async getAllSpreads(@Query('base') base?: string) {
    const baseCurrency = await this.resolveBase(base);
    return this.multiSourceService.getAllSpreads(baseCurrency);
  }

  @Post('spread')
  async updateSpread(
    @Body()
    body: {
      base: string;
      quote: string;
      spreadType: SpreadType;
      spreadMode: SpreadMode;
      fixedUnit?: FixedUnit;
      spreadPercent?: number;
      spreadFixed?: number;
      buyMargin?: number;
      sellMargin?: number;
      roundingDecimals?: number | null;
      roundingMode?: string | null;
    },
  ) {
    const mid = await this.multiSourceService.getMidForPair(body.base, body.quote);
    const config = {
      spreadType: body.spreadType,
      spreadMode: body.spreadMode,
      fixedUnit: (body.fixedUnit ?? 'RAW') as FixedUnit,
      spreadPercent: body.spreadPercent ?? 0,
      spreadFixed: body.spreadFixed ?? 0,
      buyMargin: body.buyMargin ?? 0,
      sellMargin: body.sellMargin ?? 0,
    };
    const err = validateSpread(mid, config) ?? validateRounding(mid, body.roundingDecimals);
    if (err) throw new BadRequestException(err);

    return this.multiSourceService.updateSpread(body);
  }

  /** Pairs the customer-fee page can configure for the chosen base. */
  @Get('level-points/pairs')
  async getLevelPointsPairs(@Query('base') base?: string) {
    const baseCurrency = await this.resolveBase(base);
    return this.multiSourceService.getLevelPointsPairs(baseCurrency);
  }

  /** One customer's effective fee for a pair (for quote previews). */
  @Get('customer-fees/one')
  async getCustomerFee(
    @Query('customerId') customerId: string,
    @Query('base') base: string,
    @Query('quote') quote: string,
  ) {
    if (!customerId || !base || !quote) {
      throw new BadRequestException('customerId, base, and quote query params are required');
    }
    const fee = await this.multiSourceService.getCustomerPairFee(customerId, base, quote);
    return fee ?? { base, quote, points: 0, percent: 0 };
  }

  /** Every customer's fee config for a pair. */
  @Get('customer-fees')
  getCustomerFees(@Query('base') base: string, @Query('quote') quote: string) {
    if (!base || !quote) {
      throw new BadRequestException('base and quote query params are required');
    }
    return this.multiSourceService.getCustomerFees(base, quote);
  }

  @Post('customer-fees')
  updateCustomerFee(
    @Body()
    body: {
      customerId: string;
      base: string;
      quote: string;
      points?: number | null;
      percent?: number | null;
    },
  ) {
    if (!body.customerId || !body.base || !body.quote) {
      throw new BadRequestException('customerId, base, and quote are required');
    }
    if ((body.points != null && body.points < 0) || (body.percent != null && body.percent < 0)) {
      throw new BadRequestException('points and percent must be non-negative');
    }
    return this.multiSourceService.updateCustomerFee(body);
  }

  /** Bases come from the currencies configured in Settings. */
  private async resolveBase(base?: string): Promise<string> {
    if (!base || base === 'USD') return 'USD';
    const validBases = await this.multiSourceService.getValidBases();
    if (!validBases.includes(base)) {
      throw new BadRequestException(
        `Invalid base currency "${base}". Valid options: ${validBases.join(', ')}`,
      );
    }
    return base;
  }
}
