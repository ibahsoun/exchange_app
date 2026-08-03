/**
 * Unit tests for RatesService (apps/api/src/modules/rates/rates.service.ts).
 *
 * All expected values are hand-derived from the documented business rules:
 *  - Single-rate model: every cached pair is quoted at ONE rate (bid = ask = mid, spread field
 *    carried separately as operator metadata).
 *  - Only LIVE_FEED_QUOTES (['BRL']) come from the provider; everything else is operator-priced
 *    via StoreRate rows (applyStoreRates).
 *  - Manual overrides collapse to their midpoint: mid = (bid + ask) / 2.
 *  - XAU/GRAM is derived from the cached USD/XAU rate (oz per USD):
 *      USD-per-gram = 1 / (oz-per-USD) / TROY_OZ_TO_GRAMS, rounded via Number(x.toFixed(4)).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { Logger } from '@nestjs/common';
import { RatesService } from '../src/modules/rates/rates.service';

beforeAll(() => {
  // Keep test output clean (the provider-failure test intentionally triggers logger.error)
  Logger.overrideLogger(false);
});

// ─── Stub helpers ────────────────────────────────────────────────────────────

interface StubState {
  storeRates: any[];
  overrides: any[];
}

function makePrisma(state: StubState) {
  const rateUpserts: any[] = [];
  const prisma: any = {
    rateSource: {
      upsert: async () => ({ id: 'src-1', name: 'stub-provider' }),
      findUnique: async () => ({ id: 'src-1', name: 'stub-provider' }),
    },
    rate: {
      upsert: async (args: any) => {
        rateUpserts.push(args);
        return {};
      },
    },
    manualOverride: {
      findMany: async () => state.overrides,
      upsert: async (args: any) => ({ ...args.create }),
      update: async (args: any) => ({ ...args.data }),
    },
    storeRate: {
      // Real Prisma filters where { base: 'USD', mid: { gt: 0 } } — tests only supply
      // rows that satisfy that filter.
      findMany: async () => state.storeRates,
    },
    rateSnapshot: { createMany: async () => ({ count: 0 }) },
    currency: { findMany: async () => [] },
  };
  return { prisma, rateUpserts };
}

function makeProvider(fetchImpl: () => any[]) {
  return {
    name: 'stub-provider',
    fetchRates: async (_base: string) => fetchImpl(),
    getSupportedQuotes: () => ['BRL'],
  } as any;
}

function brlQuote(mid: number, bid = mid - 0.005, ask = mid + 0.005) {
  return {
    base: 'USD',
    quote: 'BRL',
    bid,
    ask,
    mid,
    spread: ask - bid,
    timestamp: new Date('2026-08-03T10:00:00.000Z'),
  };
}

function build(opts: { quotes?: () => any[]; storeRates?: any[]; overrides?: any[] } = {}) {
  const state: StubState = { storeRates: opts.storeRates ?? [], overrides: opts.overrides ?? [] };
  const { prisma, rateUpserts } = makePrisma(state);
  const provider = makeProvider(opts.quotes ?? (() => []));
  const service = new RatesService(prisma, provider);
  return { service, state, rateUpserts };
}

// ─── refreshRates: feed filtering + single-rate model ───────────────────────

describe('refreshRates', () => {
  it('keeps only LIVE_FEED_QUOTES pairs and quotes them at the single mid rate', async () => {
    const { service } = build({
      quotes: () => [
        brlQuote(5.0792, 5.0742, 5.0842),
        // CNY is NOT in LIVE_FEED_QUOTES — it must be dropped even if the provider sends it
        {
          base: 'USD',
          quote: 'CNY',
          bid: 7.24,
          ask: 7.26,
          mid: 7.25,
          spread: 0.02,
          timestamp: new Date('2026-08-03T10:00:00.000Z'),
        },
      ],
    });

    const rates = await service.refreshRates();

    expect(rates).toHaveLength(1);
    const brl = rates[0];
    expect(brl.base).toBe('USD');
    expect(brl.quote).toBe('BRL');
    // Single-rate model: bid = ask = mid = provider mid (NOT the provider's own bid/ask)
    expect(brl.bid).toBe(5.0792);
    expect(brl.ask).toBe(5.0792);
    expect(brl.mid).toBe(5.0792);
    expect(brl.spread).toBe(0);
    expect(brl.overridden).toBe(false);
  });

  it('persists the provider raw bid/ask/mid/spread to the DB (not the collapsed mid)', async () => {
    const { service, rateUpserts } = build({
      quotes: () => [brlQuote(5.0792, 5.0742, 5.0842)],
    });

    await service.refreshRates();

    expect(rateUpserts).toHaveLength(1);
    const created = rateUpserts[0].create;
    expect(created.bid).toBe(5.0742);
    expect(created.ask).toBe(5.0842);
    expect(created.mid).toBe(5.0792);
    // spread persisted as passed through: 5.0842 - 5.0742 = 0.01 (float noise allowed)
    expect(created.spread).toBeCloseTo(0.01, 12);
  });

  it('computes trend from the previous mid: stable -> up -> down -> stable', async () => {
    let mid = 5.0;
    const { service } = build({ quotes: () => [brlQuote(mid)] });

    // First fetch: no previous mid recorded => 'stable'
    let [r] = await service.refreshRates();
    expect(r.trend).toBe('stable');

    // 5.2 > 5.0 => 'up'
    mid = 5.2;
    [r] = await service.refreshRates();
    expect(r.trend).toBe('up');

    // 5.1 < 5.2 => 'down'
    mid = 5.1;
    [r] = await service.refreshRates();
    expect(r.trend).toBe('down');

    // 5.1 === 5.1 => 'stable'
    [r] = await service.refreshRates();
    expect(r.trend).toBe('stable');
  });

  it('returns the previously cached values when the provider throws (fallback)', async () => {
    let fail = false;
    const { service } = build({
      quotes: () => {
        if (fail) throw new Error('upstream down');
        return [brlQuote(5.0792)];
      },
    });

    await service.refreshRates();

    fail = true;
    const rates = await service.refreshRates();
    expect(rates).toHaveLength(1);
    expect(rates[0].mid).toBe(5.0792); // stale-but-served cache value
  });
});

// ─── Manual overrides ────────────────────────────────────────────────────────

describe('manual overrides', () => {
  it('collapses an override to its midpoint: (5.10 + 5.20) / 2 = 5.15, spread 0, overridden', async () => {
    const { service } = build({
      quotes: () => [brlQuote(5.0792)],
      overrides: [{ base: 'USD', quote: 'BRL', bid: 5.1, ask: 5.2, enabled: true }],
    });

    const [r] = await service.refreshRates();

    // Hand math: (5.10 + 5.20) / 2 = 5.15
    expect(r.mid).toBeCloseTo(5.15, 12);
    expect(r.bid).toBeCloseTo(5.15, 12);
    expect(r.ask).toBeCloseTo(5.15, 12);
    expect(r.spread).toBe(0);
    expect(r.overridden).toBe(true);
  });

  it('ignores overrides for pairs that are not in the cache', async () => {
    const { service } = build({
      quotes: () => [brlQuote(5.0792)],
      overrides: [{ base: 'USD', quote: 'JPY', bid: 140, ask: 150, enabled: true }],
    });

    const rates = await service.refreshRates();
    expect(rates).toHaveLength(1);
    expect(rates[0].quote).toBe('BRL');
    expect(rates[0].overridden).toBe(false);
  });
});

// ─── Operator store rates (applyStoreRates) ──────────────────────────────────

describe('store rates overlay', () => {
  it('prices a non-feed pair entirely from the store rate: bid = ask = mid, spread = spreadFixed', async () => {
    const { service } = build({
      storeRates: [
        // Prisma Decimal columns arrive as objects Number() can coerce; strings model that
        { base: 'USD', quote: 'AED', mid: '3.6725', spreadFixed: '0.005', mode: 'CUSTOM_VALUE' },
      ],
    });

    const rates = await service.getLatestRates('USD');

    expect(rates).toHaveLength(1);
    const aed = rates[0];
    expect(aed.quote).toBe('AED');
    expect(aed.bid).toBe(3.6725);
    expect(aed.ask).toBe(3.6725);
    expect(aed.mid).toBe(3.6725);
    expect(aed.spread).toBe(0.005);
    expect(aed.trend).toBe('stable'); // no live history for an operator-priced pair
    expect(aed.overridden).toBe(false);
  });

  it('keeps the live mid for a feed pair in AUTO_AVG mode, applying only the operator spread', async () => {
    const { service } = build({
      quotes: () => [brlQuote(5.0792)],
      storeRates: [
        // Operator's stored mid (999) must NOT replace the live rate in AUTO_AVG mode
        { base: 'USD', quote: 'BRL', mid: '999', spreadFixed: '0.02', mode: 'AUTO_AVG' },
      ],
    });

    const rates = await service.getLatestRates('USD');
    expect(rates).toHaveLength(1);
    const brl = rates[0];
    expect(brl.mid).toBe(5.0792); // still the live feed mid
    expect(brl.bid).toBe(5.0792);
    expect(brl.ask).toBe(5.0792);
    expect(brl.spread).toBe(0.02); // operator spread applied on top
  });

  it('lets a CUSTOM_VALUE store rate replace even a feed pair mid', async () => {
    const { service } = build({
      quotes: () => [brlQuote(5.0792)],
      storeRates: [{ base: 'USD', quote: 'BRL', mid: '5.5', spreadFixed: '0.01', mode: 'CUSTOM_VALUE' }],
    });

    const rates = await service.getLatestRates('USD');
    expect(rates).toHaveLength(1);
    expect(rates[0].mid).toBe(5.5);
    expect(rates[0].bid).toBe(5.5);
    expect(rates[0].ask).toBe(5.5);
    expect(rates[0].spread).toBe(0.01);
  });

  it('re-applies store rates on every getLatestRates call so operator edits show immediately', async () => {
    const { service, state } = build({
      storeRates: [{ base: 'USD', quote: 'AED', mid: '3.6725', spreadFixed: '0', mode: 'CUSTOM_VALUE' }],
    });

    let rates = await service.getLatestRates('USD');
    expect(rates[0].mid).toBe(3.6725);

    // Operator edits the rate; no refresh cycle runs in between
    state.storeRates = [{ base: 'USD', quote: 'AED', mid: '3.68', spreadFixed: '0', mode: 'CUSTOM_VALUE' }];

    rates = await service.getLatestRates('USD');
    expect(rates[0].mid).toBe(3.68);
  });

  it('missing/zero spreadFixed falls back to spread 0', async () => {
    const { service } = build({
      storeRates: [{ base: 'USD', quote: 'AED', mid: '3.6725', spreadFixed: null, mode: 'CUSTOM_VALUE' }],
    });

    const rates = await service.getLatestRates('USD');
    expect(rates[0].spread).toBe(0);
  });
});

// ─── getLatestRates: base filtering + XAU gram derivation ────────────────────

describe('getLatestRates', () => {
  it('returns only rows whose base matches the requested base', async () => {
    const { service } = build({
      storeRates: [{ base: 'USD', quote: 'AED', mid: '3.6725', spreadFixed: '0', mode: 'CUSTOM_VALUE' }],
    });

    // Cache only holds USD-based rows, so a different base yields nothing
    const eur = await service.getLatestRates('EUR');
    expect(eur).toEqual([]);

    const usd = await service.getLatestRates('USD');
    expect(usd).toHaveLength(1);
  });

  it('derives XAU/GRAM from the USD/XAU (oz per USD) rate: 1/mid/31.1034768', async () => {
    // Store rate: USD/XAU mid = 1/3390 troy oz per USD  <=>  3390 USD per troy oz.
    // Hand math: USD per gram = 3390 / 31.1034768
    //   31.1034768 * 109        = 3390.278971  (too big by 0.278971)
    //   0.278971 / 31.1034768   = 0.0089691
    //   => 3390 / 31.1034768    = 109 - 0.0089691 = 108.9910309
    //   Number((108.9910309).toFixed(4)) = 108.991
    const { service } = build({
      storeRates: [{ base: 'USD', quote: 'XAU', mid: String(1 / 3390), spreadFixed: '0', mode: 'CUSTOM_VALUE' }],
    });

    const rates = await service.getLatestRates('USD');
    expect(rates).toHaveLength(2); // the USD/XAU row + the derived XAU/GRAM row

    const gram = rates.find((r) => r.quote === 'GRAM')!;
    expect(gram).toBeDefined();
    expect(gram.base).toBe('XAU');
    expect(gram.bid).toBe(108.991);
    expect(gram.ask).toBe(108.991);
    expect(gram.mid).toBe(108.991);
    expect(gram.spread).toBe(0); // bid === ask in the single-rate model
    expect(gram.overridden).toBe(false);

    const xau = rates.find((r) => r.quote === 'XAU')!;
    expect(gram.trend).toBe(xau.trend);
    expect(gram.timestamp).toBe(xau.timestamp);
  });

  it('gram conversion, second point: 2500 USD/oz -> 80.3769 USD/g', async () => {
    // mid = 0.0004 oz per USD  <=>  2500 USD per oz.
    // Hand math: 2500 / 31.1034768
    //   31.1034768 * 80          = 2488.278144, remainder 11.721856
    //   11.721856 / 31.1034768   = 0.3768664
    //   => 80.3768664..., toFixed(4) rounds the 5th decimal (6) up => 80.3769
    const { service } = build({
      storeRates: [{ base: 'USD', quote: 'XAU', mid: '0.0004', spreadFixed: '0', mode: 'CUSTOM_VALUE' }],
    });

    const rates = await service.getLatestRates('USD');
    const gram = rates.find((r) => r.quote === 'GRAM')!;
    expect(gram.mid).toBe(80.3769);
  });

  it('does not fabricate a gram row when no XAU rate exists', async () => {
    const { service } = build({
      storeRates: [{ base: 'USD', quote: 'AED', mid: '3.6725', spreadFixed: '0', mode: 'CUSTOM_VALUE' }],
    });

    const rates = await service.getLatestRates('USD');
    expect(rates.some((r) => r.quote === 'GRAM')).toBe(false);
  });
});

// ─── getMarketSummary ────────────────────────────────────────────────────────

describe('getMarketSummary', () => {
  it('averages the pair spreads: (0.01 + 0.03) / 2 = 0.02', async () => {
    const { service } = build({
      storeRates: [
        { base: 'USD', quote: 'AED', mid: '3.6725', spreadFixed: '0.01', mode: 'CUSTOM_VALUE' },
        { base: 'USD', quote: 'CNY', mid: '7.30', spreadFixed: '0.03', mode: 'CUSTOM_VALUE' },
      ],
    });

    const summary = await service.getMarketSummary();
    expect(summary.activePairs).toBe(2);
    // Hand math: (0.01 + 0.03) / 2 = 0.02, +/-(toFixed(4)) leaves 0.02
    expect(summary.avgSpread).toBe(0.02);
    expect(summary.marketStatus).toBe('LIVE');
  });

  it('reports avgSpread 0 when there are no rates', async () => {
    const { service } = build();
    const summary = await service.getMarketSummary();
    expect(summary.activePairs).toBe(0);
    expect(summary.avgSpread).toBe(0);
  });
});
