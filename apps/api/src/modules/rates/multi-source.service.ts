import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { MultiSourceProvider, MultiSourceQuote } from './providers';
import {
  MULTI_SOURCE_PROVIDERS,
  OUTLIER_THRESHOLD_PCT,
  DEFAULT_BASE,
  SUPPORTED_PAIRS,
  TROY_OZ_TO_GRAMS,
  LIVE_FEED_QUOTES,
  pairMetaFor,
} from './rates.constants';
import type { StoreRateMode, PairMeta } from './rates.constants';
import { computeBidAsk, spreadConfigFromRow, applyRounding, effectiveDecimals, type SpreadType, type SpreadMode, type FixedUnit, type SpreadConfig, type RoundingConfig, type RoundingMode, type MarketSides, DEFAULT_SPREAD_CONFIG } from './spread.util';

// ─── Response DTOs ─────────────────────────────────────────

export interface SourceStatus {
  key: string;
  label: string;
  status: 'online' | 'offline' | 'stale';
  latencyMs: number;
}

export interface SourceRateCell {
  buy: number | null;
  sell: number | null;
  mid: number;
  latencyMs: number;
  status: 'ok' | 'outlier' | 'missing';
}

export interface BoardRow {
  base: string;
  quote: string;
  pair: string;
  quoteName: string;
  flag?: string;
  sourceRates: Record<string, SourceRateCell>;
  globalAvg: { buy: number | null; sell: number | null; mid: number };
  storeRate: {
    mid: number;
    /** Feed sides behind `mid`; null when the rate is operator-set or single-priced */
    marketBid: number | null;
    marketAsk: number | null;
    mode: StoreRateMode;
    sourceHint: string | null;
    label: string;
    spreadType: SpreadType;
    spreadMode: SpreadMode;
    fixedUnit: FixedUnit;
    spreadPercent: number;
    spreadFixed: number;
    buyMargin: number;
    sellMargin: number;
    bid: number;
    ask: number;
    spread: number;
    roundingDecimals: number | null;
    /** Decimals actually used — null when the configured ones are too coarse for this rate */
    effectiveRoundingDecimals: number | null;
    roundingMode: string | null;
    updatedAt: string;
  };
  variance: { points: number; direction: 'tight' | 'wide' | 'normal' };
}

export interface MultiSourceBoardResponse {
  stats: {
    networkLatency: number;
    marketStability: number;
    sourcesConnected: number;
    sourcesTotal: number;
    sourceStatuses: SourceStatus[];
    globalAvgDrift: number;
    driftLocked: number;
  };
  sources: SourceStatus[];
  rows: BoardRow[];
  lastSync: string;
  autoSyncEnabled: boolean;
  autoSyncIntervalSec: number;
}

// ─── Service ───────────────────────────────────────────────

@Injectable()
export class MultiSourceService {
  private readonly logger = new Logger(MultiSourceService.name);

  /** Cached board data from the last fetch cycle */
  private cachedBoard: MultiSourceBoardResponse | null = null;
  private lastFetchTime = 0;

  /** Cached currency list from Settings */
  private pairsCache: { at: number; pairs: PairMeta[] } | null = null;
  private static readonly PAIRS_TTL_MS = 15_000;

  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(MULTI_SOURCE_PROVIDERS) private providers: MultiSourceProvider[],
  ) {}

  // ─── Currency configuration (Settings-driven) ────────────

  /**
   * The pairs the app trades, derived from the currencies configured in Settings.
   * Falls back to SUPPORTED_PAIRS if that table is empty or unreadable, so the
   * board never comes back blank.
   */
  async getPairs(): Promise<PairMeta[]> {
    if (this.pairsCache && Date.now() - this.pairsCache.at < MultiSourceService.PAIRS_TTL_MS) {
      return this.pairsCache.pairs;
    }

    let pairs: PairMeta[];
    try {
      const currencies = await this.prisma.currency.findMany({ orderBy: { sortIndex: 'asc' } });
      const quotes = currencies.filter((c) => c.code !== DEFAULT_BASE);
      pairs = quotes.length > 0 ? quotes.map((c) => pairMetaFor(c.code, c.name)) : SUPPORTED_PAIRS;
    } catch (err) {
      this.logger.warn(`Could not read currencies from Settings, using defaults: ${err}`);
      pairs = SUPPORTED_PAIRS;
    }

    // Gold is configured as troy ounces; the per-gram row is derived from it.
    if (pairs.some((p) => p.quote === 'XAU') && !pairs.some((p) => p.quote === 'XAUG')) {
      pairs = [...pairs, pairMetaFor('XAUG', 'Gold / Gram')];
    }

    // Live-feed pairs first, the rest keeping their Settings order.
    pairs = [...pairs].sort(
      (a, b) =>
        Number(LIVE_FEED_QUOTES.includes(b.quote)) - Number(LIVE_FEED_QUOTES.includes(a.quote)),
    );

    this.pairsCache = { at: Date.now(), pairs };
    return pairs;
  }

  /** Quote currencies to fetch from the feed (excludes derived rows). */
  async getActiveQuotes(): Promise<string[]> {
    return (await this.getPairs()).filter((p) => p.quote !== 'XAUG').map((p) => p.quote);
  }

  /** Currencies the board may be re-based to (commodities cannot be a base). */
  async getValidBases(): Promise<string[]> {
    const pairs = await this.getPairs();
    return [DEFAULT_BASE, ...pairs.filter((p) => p.type !== 'commodity').map((p) => p.quote)];
  }

  /** Drop the cached currency list — call after Settings changes. */
  invalidatePairs() {
    this.pairsCache = null;
    this.cachedBoard = null;
  }

  // ─── Main board endpoint ─────────────────────────────────

  async getBoard(baseCurrency = 'USD'): Promise<MultiSourceBoardResponse> {
    let board: MultiSourceBoardResponse;
    if (this.cachedBoard && Date.now() - this.lastFetchTime < 5000) {
      board = this.cachedBoard;
    } else {
      board = await this.refreshBoard();
    }
    return baseCurrency === 'USD' ? board : this.convertBoardToBase(board, baseCurrency);
  }

  async refreshBoard(baseCurrency = 'USD'): Promise<MultiSourceBoardResponse> {
    const pairs = await this.getPairs();
    const quotes = pairs.filter((p) => p.quote !== 'XAUG').map((p) => p.quote);
    const base = DEFAULT_BASE;

    // Only the feed pairs come from the API; the rest are operator-priced.
    const feedQuotes = quotes.filter((q) => LIVE_FEED_QUOTES.includes(q));

    // Fetch all providers in parallel
    const providerResults = await Promise.allSettled(
      this.providers.map(async (p) => {
        try {
          const result = await p.fetchRates(base, feedQuotes);
          return { provider: p, result, error: null };
        } catch (err) {
          return { provider: p, result: null, error: err };
        }
      }),
    );

    // Build source status + per-quote data
    const sourceStatuses: SourceStatus[] = [];
    const quotesBySource = new Map<string, Map<string, MultiSourceQuote & { latencyMs: number }>>();

    for (const settled of providerResults) {
      if (settled.status === 'rejected') continue;
      const { provider, result, error } = settled.value;

      if (error || !result || result.quotes.length === 0) {
        sourceStatuses.push({
          key: provider.name,
          label: provider.label,
          status: 'offline',
          latencyMs: 0,
        });
        this.logger.warn(`Provider ${provider.name} returned no data: ${error ?? 'empty'}`);
        continue;
      }

      sourceStatuses.push({
        key: provider.name,
        label: provider.label,
        status: 'online',
        latencyMs: result.latencyMs,
      });

      // Belt and braces: never let a provider hand back non-feed pairs.
      const feedTicks = result.quotes.filter((q) => LIVE_FEED_QUOTES.includes(q.quote));

      const map = new Map<string, MultiSourceQuote & { latencyMs: number }>();
      for (const q of feedTicks) {
        map.set(q.quote, { ...q, latencyMs: result.latencyMs });
      }
      quotesBySource.set(provider.name, map);

      // Persist ticks to DB (fire and forget)
      this.persistTicks(provider.name, feedTicks, result.latencyMs).catch((e) =>
        this.logger.error(`Failed to persist ticks for ${provider.name}: ${e}`),
      );
    }

    // Load existing store rates from DB
    const storeRates = await this.prisma.storeRate.findMany({
      where: { base },
    });
    const storeRateMap = new Map(storeRates.map((sr) => [sr.quote, sr]));

    // Build rows
    const rows: BoardRow[] = [];
    const pairMeta = new Map(pairs.map((p) => [p.quote, p]));

    for (const quote of quotes) {
      const meta = pairMeta.get(quote);
      if (!meta) continue;

      const sourceRates: Record<string, SourceRateCell> = {};
      const mids: number[] = [];

      for (const [sourceName, sourceMap] of quotesBySource) {
        const tick = sourceMap.get(quote);
        if (!tick) {
          sourceRates[sourceName] = { buy: null, sell: null, mid: 0, latencyMs: 0, status: 'missing' };
          continue;
        }

        mids.push(tick.mid);
        sourceRates[sourceName] = {
          buy: tick.bid,
          sell: tick.ask,
          mid: tick.mid,
          latencyMs: tick.latencyMs,
          status: 'ok', // will be updated after outlier check
        };
      }

      // Also add entries for offline providers
      for (const ss of sourceStatuses) {
        if (!sourceRates[ss.key]) {
          sourceRates[ss.key] = { buy: null, sell: null, mid: 0, latencyMs: 0, status: 'missing' };
        }
      }

      // Outlier filtering
      const filteredMids = this.filterOutliers(mids);
      // Mark outliers in sourceRates
      for (const [sourceName, cell] of Object.entries(sourceRates)) {
        if (cell.status === 'ok' && cell.mid > 0 && !filteredMids.includes(cell.mid)) {
          cell.status = 'outlier';
        }
      }

      // Global average from filtered mids, with the matching average bid/ask so
      // the store rate can widen the market spread rather than replace it.
      const avgMid = filteredMids.length > 0 ? filteredMids.reduce((a, b) => a + b, 0) / filteredMids.length : 0;
      const avg = { mid: avgMid, ...this.averageSides(sourceRates, filteredMids) };

      // Variance (max - min spread among valid mids)
      const variancePoints =
        filteredMids.length >= 2 ? Math.max(...filteredMids) - Math.min(...filteredMids) : 0;
      const variancePct = avgMid > 0 ? (variancePoints / avgMid) * 100 : 0;
      const direction: BoardRow['variance']['direction'] =
        variancePct < 0.5 ? 'tight' : variancePct > 2 ? 'wide' : 'normal';

      // Store rate resolution
      const existing = storeRateMap.get(quote);
      const storeRate = this.resolveStoreRate(existing, avg, quote, sourceRates);

      // Persist the tracked mid so the ticker and transactions price off it too
      const tracked = this.trackedMid(existing, avg, sourceRates);
      if (tracked) {
        const mode = (existing?.mode as StoreRateMode) ?? 'AUTO_AVG';
        this.upsertStoreRate(base, quote, tracked, mode).catch((e) =>
          this.logger.error(`Failed to upsert store rate ${quote}: ${e}`),
        );
      }

      rows.push({
        base,
        quote,
        pair: meta.label,
        quoteName: meta.quoteName,
        sourceRates,
        globalAvg: { buy: avg.bid, sell: avg.ask, mid: Number(avgMid.toPrecision(8)) },
        storeRate,
        variance: { points: Number(variancePoints.toPrecision(6)), direction },
      });
    }

    // Derive XAUG (gold gram) row from XAU
    const xauRow = rows.find((r) => r.quote === 'XAU');
    const xaugMeta = pairMeta.get('XAUG');
    if (xauRow && xaugMeta) {
      const factor = TROY_OZ_TO_GRAMS;
      const xaugSourceRates: Record<string, SourceRateCell> = {};
      for (const [key, cell] of Object.entries(xauRow.sourceRates)) {
        if (cell.status === 'missing') {
          xaugSourceRates[key] = { ...cell };
        } else {
          xaugSourceRates[key] = {
            buy: cell.buy != null ? Number((cell.buy * factor).toPrecision(8)) : null,
            sell: cell.sell != null ? Number((cell.sell * factor).toPrecision(8)) : null,
            mid: Number((cell.mid * factor).toPrecision(8)),
            latencyMs: cell.latencyMs,
            status: cell.status,
          };
        }
      }

      const xaugAvg = {
        mid: xauRow.globalAvg.mid > 0 ? xauRow.globalAvg.mid * factor : 0,
        bid: xauRow.globalAvg.buy != null ? Number((xauRow.globalAvg.buy * factor).toPrecision(8)) : null,
        ask: xauRow.globalAvg.sell != null ? Number((xauRow.globalAvg.sell * factor).toPrecision(8)) : null,
      };
      const xaugAvgMid = xaugAvg.mid;
      const existingXaug = storeRateMap.get('XAUG');
      const xaugStoreRate = this.resolveStoreRate(existingXaug, xaugAvg, 'XAUG', xaugSourceRates);

      const trackedXaug = this.trackedMid(existingXaug, xaugAvg, xaugSourceRates);
      if (trackedXaug) {
        const xaugMode = (existingXaug?.mode as StoreRateMode) ?? 'AUTO_AVG';
        this.upsertStoreRate(base, 'XAUG', trackedXaug, xaugMode).catch(
          (e) => this.logger.error(`Failed to upsert store rate XAUG: ${e}`),
        );
      }

      rows.push({
        base,
        quote: 'XAUG',
        pair: xaugMeta.label,
        quoteName: xaugMeta.quoteName,
        sourceRates: xaugSourceRates,
        globalAvg: { buy: xaugAvg.bid, sell: xaugAvg.ask, mid: Number(xaugAvgMid.toPrecision(8)) },
        storeRate: xaugStoreRate,
        variance: xauRow.variance,
      });
    }

    // Aggregate stats
    const onlineSources = sourceStatuses.filter((s) => s.status === 'online');
    const avgLatency =
      onlineSources.length > 0
        ? Math.round(onlineSources.reduce((a, b) => a + b.latencyMs, 0) / onlineSources.length)
        : 0;

    const allVariances = rows.map((r) => (r.globalAvg.mid > 0 ? r.variance.points / r.globalAvg.mid : 0));
    const avgVariancePct =
      allVariances.length > 0 ? allVariances.reduce((a, b) => a + b, 0) / allVariances.length : 0;
    const stability = Math.max(0, 100 - avgVariancePct * 100);

    const driftLocked = rows.filter(
      (r) => r.storeRate.mode === 'LOCKED' || r.storeRate.mode === 'CUSTOM_VALUE',
    ).length;

    const board: MultiSourceBoardResponse = {
      stats: {
        networkLatency: avgLatency,
        marketStability: Number(stability.toFixed(1)),
        sourcesConnected: onlineSources.length,
        sourcesTotal: this.providers.length,
        sourceStatuses,
        globalAvgDrift: Number((avgVariancePct * 100).toFixed(2)),
        driftLocked,
      },
      sources: sourceStatuses,
      rows,
      lastSync: new Date().toISOString(),
      autoSyncEnabled: true,
      autoSyncIntervalSec: 30,
    };

    this.cachedBoard = board;
    this.lastFetchTime = Date.now();
    return baseCurrency === 'USD' ? board : this.convertBoardToBase(board, baseCurrency);
  }

  // ─── Store rate management ───────────────────────────────

  async updateStoreRate(dto: {
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
  }) {
    const mid = dto.mid ?? 0;

    // An operator-set mid has no market sides behind it; the next refresh fills
    // them back in if the row goes back to following the feed.
    const updateData: Record<string, unknown> = {
      mid,
      marketBid: null,
      marketAsk: null,
      mode: dto.mode,
      sourceHint: dto.sourceHint ?? null,
      reason: dto.reason ?? null,
      updatedBy: dto.updatedBy ?? null,
    };

    if (dto.spreadType !== undefined) updateData.spreadType = dto.spreadType;
    if (dto.spreadMode !== undefined) updateData.spreadMode = dto.spreadMode;
    if (dto.fixedUnit !== undefined) updateData.fixedUnit = dto.fixedUnit;
    if (dto.spreadPercent !== undefined) updateData.spreadPercent = dto.spreadPercent;
    if (dto.spreadFixed !== undefined) updateData.spreadFixed = dto.spreadFixed;
    if (dto.buyMargin !== undefined) updateData.buyMargin = dto.buyMargin;
    if (dto.sellMargin !== undefined) updateData.sellMargin = dto.sellMargin;

    const result = await this.prisma.storeRate.upsert({
      where: { base_quote: { base: dto.base, quote: dto.quote } },
      create: {
        base: dto.base,
        quote: dto.quote,
        mid,
        mode: dto.mode,
        sourceHint: dto.sourceHint ?? null,
        reason: dto.reason ?? null,
        updatedBy: dto.updatedBy ?? null,
        spreadType: dto.spreadType ?? 'PERCENTAGE',
        spreadMode: dto.spreadMode ?? 'SYMMETRIC',
        fixedUnit: dto.fixedUnit ?? 'RAW',
        spreadPercent: dto.spreadPercent ?? 0,
        spreadFixed: dto.spreadFixed ?? 0,
        buyMargin: dto.buyMargin ?? 0,
        sellMargin: dto.sellMargin ?? 0,
      },
      update: updateData,
    });

    this.cachedBoard = null;
    return result;
  }

  // ─── Spread management ─────────────────────────────────

  async getAllSpreads(baseCurrency = 'USD') {
    const pairs = await this.getPairs();
    const pairMeta = new Map(pairs.map((p) => [p.quote, p]));

    // Rows for currencies since removed from Settings stay in the DB but are not
    // shown — re-adding the currency brings its spread config back untouched.
    const storeRates = (
      await this.prisma.storeRate.findMany({ orderBy: { quote: 'asc' } })
    ).filter((sr) => pairMeta.has(sr.quote));

    const baseSr = baseCurrency === 'USD' ? undefined : storeRates.find((sr) => sr.quote === baseCurrency);
    const usdToBaseMid = baseCurrency === 'USD' ? 1 : Number(baseSr?.mid ?? 0);
    const effectiveBase = baseCurrency !== 'USD' && usdToBaseMid === 0 ? 'USD' : baseCurrency;
    const factor = effectiveBase === 'USD' ? 1 : usdToBaseMid;
    const baseSides: MarketSides = {
      bid: toNumOrNull(baseSr?.marketBid),
      ask: toNumOrNull(baseSr?.marketAsk),
    };

    return storeRates.map((sr) => {
      const usdMid = Number(sr.mid);
      const config = spreadConfigFromRow(sr);
      const meta = pairMeta.get(sr.quote);

      const usdSides: MarketSides = { bid: toNumOrNull(sr.marketBid), ask: toNumOrNull(sr.marketAsk) };

      let convertedMid: number;
      let market: MarketSides;
      let pairBase: string;
      let pairQuote: string;
      let pairLabel: string;
      let quoteName: string;

      if (effectiveBase === 'USD') {
        convertedMid = usdMid;
        market = usdSides;
        pairBase = 'USD';
        pairQuote = sr.quote;
        pairLabel = meta?.label ?? `USD/${sr.quote}`;
        quoteName = meta?.quoteName ?? sr.quote;
      } else if (sr.quote === effectiveBase) {
        convertedMid = usdMid > 0 ? 1 / usdMid : 0;
        market = invertMarketSides(usdSides);
        pairBase = effectiveBase;
        pairQuote = 'USD';
        pairLabel = `${effectiveBase}/USD`;
        quoteName = 'US Dollar';
      } else {
        convertedMid = factor > 0 ? usdMid / factor : 0;
        market = crossMarketSides(usdSides, baseSides, factor);
        pairBase = effectiveBase;
        pairQuote = sr.quote;
        pairLabel =
          meta?.type === 'commodity'
            ? `${sr.quote}/${effectiveBase}`
            : `${effectiveBase}/${sr.quote}`;
        quoteName = meta?.quoteName ?? sr.quote;
      }

      const rounding: RoundingConfig = {
        decimals: sr.roundingDecimals ?? null,
        mode: (sr.roundingMode as RoundingMode) ?? null,
      };
      const { bid, ask, spread } = computeBidAsk(convertedMid, config, rounding, market);

      return {
        base: pairBase,
        quote: pairQuote,
        pair: pairLabel,
        quoteName,
        mid: convertedMid,
        marketBid: market.bid,
        marketAsk: market.ask,
        mode: sr.mode as string,
        sourceHint: sr.sourceHint,
        spreadType: config.spreadType,
        spreadMode: config.spreadMode,
        fixedUnit: config.fixedUnit,
        spreadPercent: config.spreadPercent,
        spreadFixed: config.spreadFixed,
        buyMargin: config.buyMargin,
        sellMargin: config.sellMargin,
        roundingDecimals: sr.roundingDecimals ?? null,
        effectiveRoundingDecimals: effectiveDecimals(convertedMid, sr.roundingDecimals),
        roundingMode: sr.roundingMode ?? null,
        bid,
        ask,
        spread,
        updatedAt: sr.updatedAt.toISOString(),
      };
    });
  }

  async updateSpread(dto: {
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
  }) {
    const result = await this.prisma.storeRate.upsert({
      where: { base_quote: { base: dto.base, quote: dto.quote } },
      create: {
        base: dto.base,
        quote: dto.quote,
        mid: 0,
        spreadType: dto.spreadType,
        spreadMode: dto.spreadMode,
        fixedUnit: dto.fixedUnit ?? 'RAW',
        spreadPercent: dto.spreadPercent ?? 0,
        spreadFixed: dto.spreadFixed ?? 0,
        buyMargin: dto.buyMargin ?? 0,
        sellMargin: dto.sellMargin ?? 0,
        roundingDecimals: dto.roundingDecimals ?? null,
        roundingMode: dto.roundingMode ?? null,
      },
      update: {
        spreadType: dto.spreadType,
        spreadMode: dto.spreadMode,
        fixedUnit: dto.fixedUnit ?? 'RAW',
        spreadPercent: dto.spreadPercent ?? 0,
        spreadFixed: dto.spreadFixed ?? 0,
        buyMargin: dto.buyMargin ?? 0,
        sellMargin: dto.sellMargin ?? 0,
        roundingDecimals: dto.roundingDecimals ?? null,
        roundingMode: dto.roundingMode ?? null,
      },
    });
    this.cachedBoard = null;
    return result;
  }

  /**
   * Reset every pair to defaults: follow the feed (Auto), zero spread, no
   * rounding. Keeps the stored mids so rates stay live until the next refresh.
   */
  async resetStoreRates() {
    await this.prisma.storeRate.updateMany({
      data: {
        mode: 'AUTO_AVG',
        sourceHint: null,
        spreadType: 'PERCENTAGE',
        spreadMode: 'SYMMETRIC',
        fixedUnit: 'RAW',
        spreadPercent: 0,
        spreadFixed: 0,
        buyMargin: 0,
        sellMargin: 0,
        roundingDecimals: null,
        roundingMode: null,
      },
    });
    this.cachedBoard = null;
    return { ok: true };
  }

  /** Get the current mid rate for a pair (for validation) */
  async getMidForPair(base: string, quote: string): Promise<number> {
    const sr = await this.prisma.storeRate.findUnique({
      where: { base_quote: { base, quote } },
    });
    return sr ? Number(sr.mid) : 0;
  }

  // ─── Base currency conversion ─────────────────────────────

  private async convertBoardToBase(
    board: MultiSourceBoardResponse,
    baseCurrency: string,
  ): Promise<MultiSourceBoardResponse> {
    const baseRow = board.rows.find((r) => r.quote === baseCurrency);
    if (!baseRow || !baseRow.storeRate.mid || baseRow.storeRate.mid === 0) {
      return board;
    }

    const usdToBaseMid = baseRow.storeRate.mid;
    const pairMeta = new Map((await this.getPairs()).map((p) => [p.quote, p]));

    const convertedRows: BoardRow[] = [];

    for (const row of board.rows) {
      const config: SpreadConfig = {
        spreadType: row.storeRate.spreadType,
        spreadMode: row.storeRate.spreadMode,
        fixedUnit: row.storeRate.fixedUnit,
        spreadPercent: row.storeRate.spreadPercent,
        spreadFixed: row.storeRate.spreadFixed,
        buyMargin: row.storeRate.buyMargin,
        sellMargin: row.storeRate.sellMargin,
      };
      const rounding: RoundingConfig = {
        decimals: row.storeRate.roundingDecimals,
        mode: (row.storeRate.roundingMode as RoundingMode) ?? null,
      };

      const rowSides: MarketSides = { bid: row.storeRate.marketBid, ask: row.storeRate.marketAsk };
      const baseSides: MarketSides = {
        bid: baseRow.storeRate.marketBid,
        ask: baseRow.storeRate.marketAsk,
      };

      if (row.quote === baseCurrency) {
        const newMid = 1 / usdToBaseMid;
        // Flipping the pair swaps the sides: 1/ask is the cheaper one.
        const market = invertMarketSides(rowSides);
        const { bid, ask, spread } = computeBidAsk(newMid, config, rounding, market);

        const convertedSourceRates: Record<string, SourceRateCell> = {};
        for (const [key, cell] of Object.entries(row.sourceRates)) {
          if (cell.status === 'missing' || cell.mid === 0) {
            convertedSourceRates[key] = { ...cell };
          } else {
            // Flipping the pair swaps the sides: 1/sell is the cheaper one.
            convertedSourceRates[key] = {
              buy: cell.sell != null && cell.sell > 0 ? Number((1 / cell.sell).toPrecision(8)) : null,
              sell: cell.buy != null && cell.buy > 0 ? Number((1 / cell.buy).toPrecision(8)) : null,
              mid: Number((1 / cell.mid).toPrecision(8)),
              latencyMs: cell.latencyMs,
              status: cell.status,
            };
          }
        }

        convertedRows.push({
          base: baseCurrency,
          quote: 'USD',
          pair: `${baseCurrency}/USD`,
          quoteName: 'US Dollar',
          sourceRates: convertedSourceRates,
          globalAvg: {
            buy: null,
            sell: null,
            mid: row.globalAvg.mid > 0 ? Number((1 / row.globalAvg.mid).toPrecision(8)) : 0,
          },
          storeRate: {
            ...row.storeRate,
            mid: Number(newMid.toPrecision(8)),
            marketBid: market.bid,
            marketAsk: market.ask,
            bid,
            ask,
            spread,
            // Re-basing changes the magnitude, so the same setting may no longer fit.
            effectiveRoundingDecimals: effectiveDecimals(newMid, rounding.decimals),
          },
          variance: row.variance,
        });
      } else {
        const newMid = row.storeRate.mid / usdToBaseMid;
        // Each side crosses the base pair's opposite side.
        const market = crossMarketSides(rowSides, baseSides, usdToBaseMid);
        const { bid, ask, spread } = computeBidAsk(newMid, config, rounding, market);

        const convertedSourceRates: Record<string, SourceRateCell> = {};
        for (const [key, cell] of Object.entries(row.sourceRates)) {
          const baseCell = baseRow.sourceRates[key];
          const baseMid =
            baseCell && baseCell.status !== 'missing' && baseCell.mid > 0
              ? baseCell.mid
              : usdToBaseMid;

          if (cell.status === 'missing' || cell.mid === 0) {
            convertedSourceRates[key] = { ...cell };
          } else {
            convertedSourceRates[key] = {
              buy: cell.buy != null ? Number((cell.buy / baseMid).toPrecision(8)) : null,
              sell: cell.sell != null ? Number((cell.sell / baseMid).toPrecision(8)) : null,
              mid: Number((cell.mid / baseMid).toPrecision(8)),
              latencyMs: cell.latencyMs,
              status: cell.status,
            };
          }
        }

        const globalAvgMid =
          row.globalAvg.mid > 0 && baseRow.globalAvg.mid > 0
            ? Number((row.globalAvg.mid / baseRow.globalAvg.mid).toPrecision(8))
            : 0;

        const meta = pairMeta.get(row.quote);
        const pairLabel =
          meta?.type === 'commodity'
            ? `${row.quote}/${baseCurrency}`
            : `${baseCurrency}/${row.quote}`;

        convertedRows.push({
          base: baseCurrency,
          quote: row.quote,
          pair: pairLabel,
          quoteName: row.quoteName,
          sourceRates: convertedSourceRates,
          globalAvg: { buy: null, sell: null, mid: globalAvgMid },
          storeRate: {
            ...row.storeRate,
            mid: Number(newMid.toPrecision(8)),
            marketBid: market.bid,
            marketAsk: market.ask,
            bid,
            ask,
            spread,
            // Re-basing changes the magnitude, so the same setting may no longer fit.
            effectiveRoundingDecimals: effectiveDecimals(newMid, rounding.decimals),
          },
          variance: row.variance,
        });
      }
    }

    return { ...board, rows: convertedRows };
  }

  // ─── Internal helpers ────────────────────────────────────

  private filterOutliers(mids: number[]): number[] {
    if (mids.length <= 2) return mids;

    const sorted = [...mids].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const threshold = median * (OUTLIER_THRESHOLD_PCT / 100);

    return mids.filter((m) => Math.abs(m - median) <= threshold);
  }

  private resolveStoreRate(
    existing: Record<string, unknown> | undefined,
    avg: MarketAverage,
    quote: string,
    sourceRates: Record<string, SourceRateCell>,
  ): BoardRow['storeRate'] {
    const config = existing ? spreadConfigFromRow(existing) : DEFAULT_SPREAD_CONFIG;
    const rounding: RoundingConfig = {
      decimals: existing ? (existing.roundingDecimals as number | null) ?? null : null,
      mode: existing ? (existing.roundingMode as RoundingMode | null) ?? null : null,
    };

    if (!existing) {
      const market: MarketSides = { bid: avg.bid, ask: avg.ask };
      const { bid, ask, spread } = computeBidAsk(avg.mid || 0, config, null, market);
      return {
        mid: Number((avg.mid || 0).toPrecision(8)),
        marketBid: market.bid,
        marketAsk: market.ask,
        mode: 'AUTO_AVG',
        sourceHint: null,
        label: 'Auto (Avg)',
        ...config,
        bid,
        ask,
        spread,
        roundingDecimals: null,
        effectiveRoundingDecimals: null,
        roundingMode: null,
        updatedAt: new Date().toISOString(),
      };
    }

    const mode = (existing.mode as StoreRateMode) ?? 'AUTO_AVG';

    // AUTO_AVG and MANUAL_SOURCE follow the feed; when it has no quote for this
    // pair, keep the last stored mid rather than dropping the row to zero.
    const tracked = this.trackedMid(existing, avg, sourceRates);
    const mid = tracked?.mid ?? Number(existing.mid) ?? 0;
    const sourceHint = tracked?.sourceHint ?? ((existing.sourceHint as string | null) ?? null);
    const market = tracked
      ? { bid: tracked.marketBid, ask: tracked.marketAsk }
      : this.storedSides(existing, mode);

    const labels: Record<StoreRateMode, string> = {
      AUTO_AVG: 'Auto (Avg)',
      MANUAL_SOURCE: `Manual (${sourceHint ?? '?'})`,
      CUSTOM_VALUE: 'Custom',
      LOCKED: 'Locked',
    };

    const { bid, ask, spread } = computeBidAsk(mid, config, rounding, market);

    return {
      mid: Number(mid.toPrecision(8)),
      marketBid: market.bid,
      marketAsk: market.ask,
      mode,
      sourceHint,
      label: labels[mode],
      ...config,
      bid,
      ask,
      spread,
      roundingDecimals: rounding.decimals,
      effectiveRoundingDecimals: effectiveDecimals(mid, rounding.decimals),
      roundingMode: rounding.mode,
      updatedAt: existing.updatedAt instanceof Date
        ? (existing.updatedAt as Date).toISOString()
        : (existing.updatedAt as string) ?? new Date().toISOString(),
    };
  }

  private async persistTicks(source: string, quotes: MultiSourceQuote[], latencyMs: number) {
    await this.prisma.rateTick.createMany({
      data: quotes.map((q) => ({
        base: q.base,
        quote: q.quote,
        source,
        bid: q.bid,
        ask: q.ask,
        mid: q.mid,
        latencyMs,
        timestamp: q.timestamp,
      })),
    });
  }

  // ─── Customer Level Points ─────────────────────────────────

  /**
   * The pairs configurable for a given base — that base against every other
   * currency in Settings. Level points are per pair, not just per USD leg.
   */
  async getLevelPointsPairs(base = DEFAULT_BASE) {
    const metas = await this.getPairs();
    const currencies = [
      { code: DEFAULT_BASE, name: 'US Dollar', type: 'fiat' as PairMeta['type'] },
      ...metas.map((m) => ({ code: m.quote, name: m.quoteName, type: m.type })),
    ];

    return currencies
      .filter((c) => c.code !== base)
      .map((c) => ({
        base,
        quote: c.code,
        // Commodities are conventionally quoted the other way round (XAU/USD).
        pair: c.type === 'commodity' ? `${c.code}/${base}` : `${base}/${c.code}`,
        quoteName: c.name,
      }));
  }

  /**
   * Fee rows for every customer on a pair. A customer's config is found in
   * either orientation; the requested one wins if both exist.
   */
  async getCustomerFees(base: string, quote: string) {
    const [customers, fees] = await Promise.all([
      this.prisma.customer.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.customerPairFee.findMany({
        where: { OR: [{ base, quote }, { base: quote, quote: base }] },
      }),
    ]);

    const feeByCustomer = new Map<string, (typeof fees)[number]>();
    for (const f of fees) {
      if (!feeByCustomer.has(f.customerId) || f.base === base) feeByCustomer.set(f.customerId, f);
    }

    return customers.map((c) => {
      const f = feeByCustomer.get(c.id);
      return {
        customerId: c.id,
        customerCode: c.customerId,
        name: c.name,
        level: c.level,
        points: f?.points != null ? Number(f.points) : null,
        percent: f?.percent != null ? Number(f.percent) : null,
      };
    });
  }

  /** Set a customer's fee for a pair; replaces any inverted-orientation row. */
  async updateCustomerFee(dto: {
    customerId: string;
    base: string;
    quote: string;
    points?: number | null;
    percent?: number | null;
  }) {
    // One config per pair regardless of orientation.
    await this.prisma.customerPairFee.deleteMany({
      where: { customerId: dto.customerId, base: dto.quote, quote: dto.base },
    });
    const data = {
      points: dto.points ?? null,
      percent: dto.percent ?? null,
    };
    return this.prisma.customerPairFee.upsert({
      where: {
        customerId_base_quote: { customerId: dto.customerId, base: dto.base, quote: dto.quote },
      },
      create: { customerId: dto.customerId, base: dto.base, quote: dto.quote, ...data },
      update: data,
    });
  }

  /**
   * A customer's fee for a pair, found in either orientation. Null when the
   * customer has nothing configured for it.
   */
  async getCustomerPairFee(customerId: string, a: string, b: string) {
    const rows = await this.prisma.customerPairFee.findMany({
      where: { customerId, OR: [{ base: a, quote: b }, { base: b, quote: a }] },
    });
    const row = rows.find((r) => r.base === a) ?? rows[0];
    if (!row || (row.points == null && row.percent == null)) return null;
    return {
      base: row.base,
      quote: row.quote,
      points: row.points != null ? Number(row.points) : 0,
      percent: row.percent != null ? Number(row.percent) : 0,
    };
  }

  private async upsertStoreRate(
    base: string,
    quote: string,
    tracked: TrackedRate,
    mode: StoreRateMode,
  ) {
    // Only update the tracked rate (and the source label) — preserve the
    // operator's spread and rounding fields.
    const rate = {
      mid: tracked.mid,
      marketBid: tracked.marketBid,
      marketAsk: tracked.marketAsk,
      sourceHint: tracked.sourceHint,
    };

    await this.prisma.storeRate.upsert({
      where: { base_quote: { base, quote } },
      create: { base, quote, mode, ...rate },
      update: rate,
    });
  }

  /**
   * The rate a pair should be priced at right now, or null to keep the stored one.
   *
   * AUTO_AVG and MANUAL_SOURCE both follow the live feed — MANUAL_SOURCE means
   * "pinned to this source", so it re-prices whenever that source has a quote.
   * LOCKED and CUSTOM_VALUE are deliberate operator values and never move.
   */
  private trackedMid(
    existing: Record<string, unknown> | undefined,
    avg: MarketAverage,
    sourceRates: Record<string, SourceRateCell>,
  ): TrackedRate | null {
    const mode = (existing?.mode as StoreRateMode) ?? 'AUTO_AVG';

    if (mode === 'AUTO_AVG') {
      return avg.mid > 0 ? { mid: avg.mid, marketBid: avg.bid, marketAsk: avg.ask, sourceHint: null } : null;
    }
    if (mode !== 'MANUAL_SOURCE') return null;

    const hint = (existing?.sourceHint as string | null) ?? null;
    const hinted = hint ? sourceRates[hint] : undefined;
    if (hinted && hinted.status === 'ok' && hinted.mid > 0) {
      return { mid: hinted.mid, ...cellSides(hinted), sourceHint: hint };
    }

    // The hint names a source we no longer poll (e.g. a retired provider). With a
    // single feed there is no ambiguity about what it was pinned to — follow that
    // one and repair the label.
    const live = Object.entries(sourceRates).filter(([, c]) => c.status === 'ok' && c.mid > 0);
    if (live.length === 1) {
      const [key, cell] = live[0];
      return { mid: cell.mid, ...cellSides(cell), sourceHint: key };
    }

    return null;
  }

  /**
   * Average bid/ask across the sources that survived outlier filtering — the
   * market sides that go with `avgMid`. Null when no source quotes two sides.
   */
  private averageSides(
    sourceRates: Record<string, SourceRateCell>,
    filteredMids: number[],
  ): { bid: number | null; ask: number | null } {
    const cells = Object.values(sourceRates).filter(
      (c) =>
        c.status === 'ok' &&
        c.mid > 0 &&
        filteredMids.includes(c.mid) &&
        c.buy != null &&
        c.sell != null &&
        c.buy > 0 &&
        c.sell > 0,
    );
    if (cells.length === 0) return { bid: null, ask: null };

    const mean = (pick: (c: SourceRateCell) => number) =>
      Number((cells.reduce((acc, c) => acc + pick(c), 0) / cells.length).toPrecision(8));

    return { bid: mean((c) => c.buy as number), ask: mean((c) => c.sell as number) };
  }

  /**
   * Market sides recorded on the stored row, used when the feed has nothing for
   * this pair right now. Operator-set rates carry no market sides — their bid
   * and ask come from the mid and the configured margin alone.
   */
  private storedSides(existing: Record<string, unknown>, mode: StoreRateMode): MarketSides {
    if (mode !== 'AUTO_AVG' && mode !== 'MANUAL_SOURCE') return { bid: null, ask: null };
    return {
      bid: toNumOrNull(existing.marketBid),
      ask: toNumOrNull(existing.marketAsk),
    };
  }
}

/** The mid a store rate tracks, plus the market sides it came from. */
interface TrackedRate {
  mid: number;
  marketBid: number | null;
  marketAsk: number | null;
  sourceHint: string | null;
}

/** Global average across sources: mid plus the matching bid/ask. */
interface MarketAverage {
  mid: number;
  bid: number | null;
  ask: number | null;
}

/** Flip a quote's sides: 1/ask becomes the bid of the flipped pair. */
function invertMarketSides(sides: MarketSides): MarketSides {
  if (sides.bid == null || sides.ask == null || sides.bid <= 0 || sides.ask <= 0) {
    return { bid: null, ask: null };
  }
  return {
    bid: Number((1 / sides.ask).toPrecision(8)),
    ask: Number((1 / sides.bid).toPrecision(8)),
  };
}

/**
 * Re-base USD/QUOTE onto BASE/QUOTE. Both legs are crossed, so each side of the
 * result pairs with the opposite side of the base pair.
 */
function crossMarketSides(sides: MarketSides, baseSides: MarketSides, baseMid: number): MarketSides {
  if (sides.bid == null || sides.ask == null || baseMid <= 0) return { bid: null, ask: null };

  const baseBid = baseSides.bid != null && baseSides.bid > 0 ? baseSides.bid : baseMid;
  const baseAsk = baseSides.ask != null && baseSides.ask > 0 ? baseSides.ask : baseMid;

  return {
    bid: Number((sides.bid / baseAsk).toPrecision(8)),
    ask: Number((sides.ask / baseBid).toPrecision(8)),
  };
}

function cellSides(cell: SourceRateCell): { marketBid: number | null; marketAsk: number | null } {
  const usable = cell.buy != null && cell.sell != null && cell.buy > 0 && cell.sell > 0;
  return usable ? { marketBid: cell.buy, marketAsk: cell.sell } : { marketBid: null, marketAsk: null };
}

function toNumOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}
