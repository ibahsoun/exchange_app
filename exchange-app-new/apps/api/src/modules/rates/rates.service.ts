import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { RateProvider } from './providers';
import { RATE_PROVIDER, SUPPORTED_PAIRS, TROY_OZ_TO_GRAMS, DEFAULT_BASE } from './rates.constants';
import { computeBidAsk, spreadConfigFromRow } from './spread.util';

export interface LiveRate {
  base: string;
  quote: string;
  bid: number;
  ask: number;
  mid: number;
  spread: number;
  trend: 'up' | 'down' | 'stable';
  overridden: boolean;
  timestamp: string;
}

@Injectable()
export class RatesService {
  private readonly logger = new Logger(RatesService.name);

  /** In-memory cache of latest rates, keyed by "BASE/QUOTE" */
  private cache = new Map<string, LiveRate>();

  /** Previous mid values for trend calculation */
  private prevMids = new Map<string, number>();

  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(RATE_PROVIDER) private provider: RateProvider,
  ) {}

  // ─── Public API ────────────────────────────────────────────

  /** Get all latest rates (from cache, falls back to provider) */
  async getLatestRates(base = DEFAULT_BASE): Promise<LiveRate[]> {
    if (this.cache.size === 0) {
      await this.refreshRates();
    }

    // Always re-apply manual spreads so changes are reflected immediately
    await this.applyManualSpreads();

    const rates = Array.from(this.cache.values()).filter((r) => r.base === base);

    // Derive XAU/g from XAU/ozt
    const xauOzt = rates.find((r) => r.quote === 'XAU');
    if (xauOzt) {
      const gramBid = 1 / xauOzt.bid / TROY_OZ_TO_GRAMS;
      const gramAsk = 1 / xauOzt.ask / TROY_OZ_TO_GRAMS;
      const gramMid = (gramBid + gramAsk) / 2;
      rates.push({
        base: 'XAU',
        quote: 'GRAM',
        bid: Number(gramBid.toFixed(4)),
        ask: Number(gramAsk.toFixed(4)),
        mid: Number(gramMid.toFixed(4)),
        spread: Number((gramAsk - gramBid).toFixed(4)),
        trend: xauOzt.trend,
        overridden: false,
        timestamp: xauOzt.timestamp,
      });
    }

    return rates;
  }

  /** Get pair metadata */
  getPairsMetadata() {
    return SUPPORTED_PAIRS;
  }

  /** Get market summary */
  async getMarketSummary() {
    const rates = await this.getLatestRates();
    const avgSpread = rates.length > 0 ? rates.reduce((s, r) => s + r.spread, 0) / rates.length : 0;

    return {
      totalVolume24h: 4_820_000_000,
      volumeChange: +(Math.random() * 3 - 0.5).toFixed(1),
      activePairs: rates.length,
      avgSpread: +avgSpread.toFixed(4),
      marketStatus: 'LIVE' as const,
      openMarkets: 'NYC / LDN',
    };
  }

  // ─── Override management ───────────────────────────────────

  async setOverride(data: {
    base: string;
    quote: string;
    bid: number;
    ask: number;
    reason?: string;
    userId: string;
  }) {
    const override = await this.prisma.manualOverride.upsert({
      where: { base_quote: { base: data.base, quote: data.quote } },
      create: {
        base: data.base,
        quote: data.quote,
        bid: data.bid,
        ask: data.ask,
        reason: data.reason,
        userId: data.userId,
        enabled: true,
      },
      update: {
        bid: data.bid,
        ask: data.ask,
        reason: data.reason,
        userId: data.userId,
        enabled: true,
      },
    });

    // Apply immediately to cache
    await this.applyOverrides();
    return override;
  }

  async disableOverride(base: string, quote: string) {
    const override = await this.prisma.manualOverride.update({
      where: { base_quote: { base, quote } },
      data: { enabled: false },
    });

    // Re-apply to remove override from cache
    await this.refreshRates();
    return override;
  }

  // ─── Refresh cycle (called by scheduler) ───────────────────

  async refreshRates(): Promise<LiveRate[]> {
    try {
      const quotes = await this.provider.fetchRates(DEFAULT_BASE);
      const now = new Date().toISOString();

      // Ensure source exists in DB
      await this.prisma.rateSource.upsert({
        where: { name: this.provider.name },
        create: { name: this.provider.name, status: 'active', priority: 0 },
        update: { status: 'active' },
      });

      const source = await this.prisma.rateSource.findUnique({
        where: { name: this.provider.name },
      });

      for (const q of quotes) {
        const key = `${q.base}/${q.quote}`;
        const prevMid = this.prevMids.get(key);
        const trend: LiveRate['trend'] =
          prevMid == null ? 'stable' : q.mid > prevMid ? 'up' : q.mid < prevMid ? 'down' : 'stable';

        this.prevMids.set(key, q.mid);

        this.cache.set(key, {
          base: q.base,
          quote: q.quote,
          bid: q.bid,
          ask: q.ask,
          mid: q.mid,
          spread: q.spread,
          trend,
          overridden: false,
          timestamp: now,
        });

        // Persist to DB (upsert latest)
        if (source) {
          await this.prisma.rate.upsert({
            where: {
              base_quote_sourceId: {
                base: q.base,
                quote: q.quote,
                sourceId: source.id,
              },
            },
            create: {
              base: q.base,
              quote: q.quote,
              bid: q.bid,
              ask: q.ask,
              mid: q.mid,
              spread: q.spread,
              sourceId: source.id,
              timestamp: q.timestamp,
            },
            update: {
              bid: q.bid,
              ask: q.ask,
              mid: q.mid,
              spread: q.spread,
              timestamp: q.timestamp,
            },
          });
        }
      }

      // Apply any active overrides on top
      await this.applyOverrides();

      // Apply manual spreads from StoreRate DB
      await this.applyManualSpreads();

      this.logger.log(`Refreshed ${quotes.length} rates from ${this.provider.name}`);

      return Array.from(this.cache.values());
    } catch (err) {
      this.logger.error(`Failed to refresh rates: ${err}`);
      return Array.from(this.cache.values());
    }
  }

  /** Snapshot current rates for historical record */
  async takeSnapshot() {
    const rates = Array.from(this.cache.values());
    if (rates.length === 0) return;

    await this.prisma.rateSnapshot.createMany({
      data: rates.map((r) => ({
        base: r.base,
        quote: r.quote,
        bid: r.bid,
        ask: r.ask,
        mid: r.mid,
        source: this.provider.name,
        timestamp: new Date(r.timestamp),
      })),
    });
  }

  // ─── Internal ──────────────────────────────────────────────

  private async applyManualSpreads() {
    const storeRates = await this.prisma.storeRate.findMany({
      where: {
        OR: [
          { mid: { gt: 0 } },
          { spreadPercent: { gt: 0 } },
          { spreadFixed: { gt: 0 } },
          { buyMargin: { gt: 0 } },
          { sellMargin: { gt: 0 } },
        ],
      },
    });

    for (const sr of storeRates) {
      const key = `${sr.base}/${sr.quote}`;
      const existing = this.cache.get(key);
      if (!existing) continue;

      const mid = Number(sr.mid) > 0 ? Number(sr.mid) : existing.mid;
      const config = spreadConfigFromRow(sr);
      const { bid, ask, spread } = computeBidAsk(mid, config);

      this.cache.set(key, {
        ...existing,
        mid,
        bid,
        ask,
        spread,
      });
    }
  }

  private async applyOverrides() {
    const overrides = await this.prisma.manualOverride.findMany({
      where: { enabled: true },
    });

    for (const ov of overrides) {
      const key = `${ov.base}/${ov.quote}`;
      const existing = this.cache.get(key);
      if (existing) {
        const bid = Number(ov.bid);
        const ask = Number(ov.ask);
        this.cache.set(key, {
          ...existing,
          bid,
          ask,
          mid: (bid + ask) / 2,
          spread: ask - bid,
          overridden: true,
        });
      }
    }
  }
}
