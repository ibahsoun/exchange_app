import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { MultiSourceProvider, MultiSourceQuote } from './providers';
import {
  MULTI_SOURCE_PROVIDERS,
  MULTI_SOURCE_QUOTES,
  OUTLIER_THRESHOLD_PCT,
  DEFAULT_BASE,
  SUPPORTED_PAIRS,
  TROY_OZ_TO_GRAMS,
} from './rates.constants';
import type { StoreRateMode } from './rates.constants';
import { computeBidAsk, spreadConfigFromRow, type SpreadType, type SpreadMode, type FixedUnit, type SpreadConfig, DEFAULT_SPREAD_CONFIG } from './spread.util';

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

  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(MULTI_SOURCE_PROVIDERS) private providers: MultiSourceProvider[],
  ) {}

  // ─── Main board endpoint ─────────────────────────────────

  async getBoard(): Promise<MultiSourceBoardResponse> {
    if (this.cachedBoard && Date.now() - this.lastFetchTime < 5000) {
      return this.cachedBoard;
    }
    return this.refreshBoard();
  }

  async refreshBoard(): Promise<MultiSourceBoardResponse> {
    const quotes = MULTI_SOURCE_QUOTES;
    const base = DEFAULT_BASE;

    // Fetch all providers in parallel
    const providerResults = await Promise.allSettled(
      this.providers.map(async (p) => {
        try {
          const result = await p.fetchRates(base, quotes);
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

      const map = new Map<string, MultiSourceQuote & { latencyMs: number }>();
      for (const q of result.quotes) {
        map.set(q.quote, { ...q, latencyMs: result.latencyMs });
      }
      quotesBySource.set(provider.name, map);

      // Persist ticks to DB (fire and forget)
      this.persistTicks(provider.name, result.quotes, result.latencyMs).catch((e) =>
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
    const pairMeta = new Map(SUPPORTED_PAIRS.map((p) => [p.quote, p]));

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

      // Global average from filtered mids
      const avgMid = filteredMids.length > 0 ? filteredMids.reduce((a, b) => a + b, 0) / filteredMids.length : 0;

      // Variance (max - min spread among valid mids)
      const variancePoints =
        filteredMids.length >= 2 ? Math.max(...filteredMids) - Math.min(...filteredMids) : 0;
      const variancePct = avgMid > 0 ? (variancePoints / avgMid) * 100 : 0;
      const direction: BoardRow['variance']['direction'] =
        variancePct < 0.5 ? 'tight' : variancePct > 2 ? 'wide' : 'normal';

      // Store rate resolution
      const existing = storeRateMap.get(quote);
      const storeRate = this.resolveStoreRate(existing, avgMid, quote, sourceRates);

      // Upsert store rate if AUTO_AVG
      if ((!existing || existing.mode === 'AUTO_AVG') && avgMid > 0) {
        this.upsertStoreRate(base, quote, avgMid, 'AUTO_AVG').catch((e) =>
          this.logger.error(`Failed to upsert store rate ${quote}: ${e}`),
        );
      }

      rows.push({
        base,
        quote,
        pair: meta.label,
        quoteName: meta.quoteName,
        sourceRates,
        globalAvg: { buy: null, sell: null, mid: Number(avgMid.toPrecision(8)) },
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

      const xaugAvgMid = xauRow.globalAvg.mid > 0 ? xauRow.globalAvg.mid * factor : 0;
      const existingXaug = storeRateMap.get('XAUG');
      const xaugStoreRate = this.resolveStoreRate(existingXaug, xaugAvgMid, 'XAUG', xaugSourceRates);

      if ((!existingXaug || existingXaug.mode === 'AUTO_AVG') && xaugAvgMid > 0) {
        this.upsertStoreRate(base, 'XAUG', xaugAvgMid, 'AUTO_AVG').catch((e) =>
          this.logger.error(`Failed to upsert store rate XAUG: ${e}`),
        );
      }

      rows.push({
        base,
        quote: 'XAUG',
        pair: xaugMeta.label,
        quoteName: xaugMeta.quoteName,
        sourceRates: xaugSourceRates,
        globalAvg: { buy: null, sell: null, mid: Number(xaugAvgMid.toPrecision(8)) },
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
    return board;
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

    const updateData: Record<string, unknown> = {
      mid,
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

  async getAllSpreads() {
    const storeRates = await this.prisma.storeRate.findMany({
      orderBy: { quote: 'asc' },
    });
    const pairMeta = new Map(SUPPORTED_PAIRS.map((p) => [p.quote, p]));

    return storeRates.map((sr) => {
      const mid = Number(sr.mid);
      const config = spreadConfigFromRow(sr);
      const { bid, ask, spread } = computeBidAsk(mid, config, sr.quote);
      const meta = pairMeta.get(sr.quote);

      return {
        base: sr.base,
        quote: sr.quote,
        pair: meta?.label ?? `${sr.base}/${sr.quote}`,
        quoteName: meta?.quoteName ?? sr.quote,
        mid,
        mode: sr.mode as string,
        sourceHint: sr.sourceHint,
        spreadType: config.spreadType,
        spreadMode: config.spreadMode,
        fixedUnit: config.fixedUnit,
        spreadPercent: config.spreadPercent,
        spreadFixed: config.spreadFixed,
        buyMargin: config.buyMargin,
        sellMargin: config.sellMargin,
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
      },
      update: {
        spreadType: dto.spreadType,
        spreadMode: dto.spreadMode,
        fixedUnit: dto.fixedUnit ?? 'RAW',
        spreadPercent: dto.spreadPercent ?? 0,
        spreadFixed: dto.spreadFixed ?? 0,
        buyMargin: dto.buyMargin ?? 0,
        sellMargin: dto.sellMargin ?? 0,
      },
    });
    this.cachedBoard = null;
    return result;
  }

  /** Get the current mid rate for a pair (for validation) */
  async getMidForPair(base: string, quote: string): Promise<number> {
    const sr = await this.prisma.storeRate.findUnique({
      where: { base_quote: { base, quote } },
    });
    return sr ? Number(sr.mid) : 0;
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
    avgMid: number,
    quote: string,
    _sourceRates: Record<string, SourceRateCell>,
  ): BoardRow['storeRate'] {
    const config = existing ? spreadConfigFromRow(existing) : DEFAULT_SPREAD_CONFIG;

    if (!existing) {
      const { bid, ask, spread } = computeBidAsk(avgMid || 0, config, quote);
      return {
        mid: Number((avgMid || 0).toPrecision(8)),
        mode: 'AUTO_AVG',
        sourceHint: null,
        label: 'Auto (Avg)',
        ...config,
        bid,
        ask,
        spread,
      };
    }

    const mode = (existing.mode as StoreRateMode) ?? 'AUTO_AVG';
    const labels: Record<StoreRateMode, string> = {
      AUTO_AVG: 'Auto (Avg)',
      MANUAL_SOURCE: `Manual (${(existing.sourceHint as string) ?? '?'})`,
      CUSTOM_VALUE: 'Custom',
      LOCKED: 'Locked',
    };

    const mid = mode === 'AUTO_AVG' ? (avgMid || 0) : Number(existing.mid);
    const { bid, ask, spread } = computeBidAsk(mid, config, quote);

    return {
      mid: Number(mid.toPrecision(8)),
      mode,
      sourceHint: (existing.sourceHint as string | null) ?? null,
      label: labels[mode],
      ...config,
      bid,
      ask,
      spread,
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

  private async upsertStoreRate(base: string, quote: string, mid: number, mode: StoreRateMode) {
    // Only update mid — preserve existing spread fields
    await this.prisma.storeRate.upsert({
      where: { base_quote: { base, quote } },
      create: { base, quote, mid, mode },
      update: { mid },
    });
  }
}
