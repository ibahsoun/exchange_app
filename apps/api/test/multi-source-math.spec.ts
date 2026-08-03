/**
 * Math-focused tests for MultiSourceService.
 *
 * Every expected value below is hand-derived from the documented business
 * intent (rates.constants.ts, spread.util.ts and the comments inside
 * multi-source.service.ts), with the arithmetic shown in comments — never by
 * running the implementation and copying its output.
 *
 * The service is instantiated directly with plain-object stubs for its two
 * constructor deps (PrismaService, providers[]). Note: `filterOutliers` is a
 * private pure method; it is reached both through refreshBoard() and, for the
 * edge cases, via a cast to `any` (noted as a last resort).
 */
import { describe, it, expect } from 'vitest';
import { MultiSourceService } from '../src/modules/rates/multi-source.service';
import type { MultiSourceProvider } from '../src/modules/rates/providers/rate-provider.interface';
import {
  LIVE_FEED_QUOTES,
  OUTLIER_THRESHOLD_PCT,
} from '../src/modules/rates/rates.constants';

// ─── Fixtures / stubs ──────────────────────────────────────

interface TickFixture {
  quote: string;
  bid: number | null;
  ask: number | null;
  mid: number;
}

function provider(
  name: string,
  ticks: TickFixture[],
  latencyMs = 50,
  fail = false,
): MultiSourceProvider {
  return {
    name,
    label: name.toUpperCase(),
    async fetchRates(base: string, quotes: string[]) {
      if (fail) throw new Error(`${name} down`);
      return {
        quotes: ticks
          .filter((t) => quotes.includes(t.quote))
          .map((t) => ({
            base,
            quote: t.quote,
            bid: t.bid,
            ask: t.ask,
            mid: t.mid,
            timestamp: new Date('2026-08-01T00:00:00Z'),
          })),
        latencyMs,
      };
    },
  };
}

/** A StoreRate DB row with all the fields the service reads. */
function srRow(partial: Record<string, unknown>) {
  return {
    base: 'USD',
    quote: 'BRL',
    mid: 0,
    marketBid: null,
    marketAsk: null,
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
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    ...partial,
  };
}

interface PrismaStubOpts {
  currencies?: Array<{ code: string; name: string }>;
  storeRates?: ReturnType<typeof srRow>[];
  customers?: Array<{ id: string; customerId: string; name: string; level: number }>;
  feeRows?: Array<{
    customerId: string;
    base: string;
    quote: string;
    points: number | null;
    percent: number | null;
  }>;
}

function prismaStub(opts: PrismaStubOpts = {}) {
  const currencies = opts.currencies ?? [
    { code: 'BRL', name: 'Brazilian Real' },
    { code: 'CNY', name: 'Chinese Yuan' },
  ];
  return {
    currency: { findMany: async () => currencies },
    storeRate: {
      findMany: async () => opts.storeRates ?? [],
      upsert: async () => ({}),
      findUnique: async () => null,
      updateMany: async () => ({}),
    },
    rateTick: { createMany: async () => ({ count: 0 }) },
    customer: { findMany: async () => opts.customers ?? [] },
    customerPairFee: {
      // Honours the `OR` orientation filter (and customerId when present) so
      // the orientation-resolution logic is actually exercised.
      findMany: async ({ where }: any) =>
        (opts.feeRows ?? []).filter(
          (r) =>
            (where.customerId == null || r.customerId === where.customerId) &&
            where.OR.some((o: any) => o.base === r.base && o.quote === r.quote),
        ),
      deleteMany: async () => ({ count: 0 }),
      upsert: async (args: any) => args.create,
    },
  } as any;
}

function makeService(prismaOpts: PrismaStubOpts = {}, providers: MultiSourceProvider[] = []) {
  return new MultiSourceService(prismaStub(prismaOpts), providers);
}

// The board tests price the pair through the live feed; that only works for
// quotes in LIVE_FEED_QUOTES. Guard the fixture assumption explicitly.
describe('fixture sanity', () => {
  it('BRL is a live-feed quote and the outlier threshold is 15%', () => {
    expect(LIVE_FEED_QUOTES).toContain('BRL');
    expect(OUTLIER_THRESHOLD_PCT).toBe(15);
  });
});

// ─── Outlier filtering (private pure method, reached via `as any`) ───

describe('filterOutliers', () => {
  const filter = (svc: MultiSourceService, mids: number[]): number[] =>
    (svc as any).filterOutliers(mids);

  it('drops values deviating more than 15% from the median', () => {
    const svc = makeService();
    // sorted [5.0, 5.1, 9.9] -> median = element at floor(3/2)=1 -> 5.1
    // threshold = 5.1 * 0.15 = 0.765
    // |5.0-5.1| = 0.1 keep; |9.9-5.1| = 4.8 > 0.765 drop
    expect(filter(svc, [5.0, 5.1, 9.9])).toEqual([5.0, 5.1]);
  });

  it('keeps a value at exactly 15% deviation (threshold is inclusive)', () => {
    const svc = makeService();
    // sorted [10, 10, 11.5] -> median = 10, threshold = 1.5
    // |11.5-10| = 1.5 <= 1.5 -> kept
    expect(filter(svc, [10, 10, 11.5])).toEqual([10, 10, 11.5]);
  });

  it('never filters when there are 2 or fewer sources', () => {
    const svc = makeService();
    expect(filter(svc, [1, 100])).toEqual([1, 100]);
    expect(filter(svc, [42])).toEqual([42]);
    expect(filter(svc, [])).toEqual([]);
  });

  it('uses the upper-middle element as median for even-length input', () => {
    const svc = makeService();
    // sorted [10, 10.2, 10.4, 12] -> median = element at floor(4/2)=2 -> 10.4
    // threshold = 10.4 * 0.15 = 1.56
    // |12-10.4| = 1.6 > 1.56 drop; the rest deviate <= 0.4 keep
    expect(filter(svc, [10, 10.2, 10.4, 12])).toEqual([10, 10.2, 10.4]);
  });
});

// ─── Aggregation: averaging, outlier marking, variance, stats ───

describe('refreshBoard aggregation', () => {
  it('averages surviving sources, marks the outlier, and reports variance/stats', async () => {
    const svc = makeService({}, [
      provider('alpha', [{ quote: 'BRL', bid: 5.0, ask: 5.02, mid: 5.01 }], 40),
      provider('beta', [{ quote: 'BRL', bid: 5.06, ask: 5.1, mid: 5.08 }], 60),
      provider('gamma', [{ quote: 'BRL', bid: 9.85, ask: 9.95, mid: 9.9 }], 80),
    ]);

    const board = await svc.refreshBoard();
    const row = board.rows.find((r) => r.quote === 'BRL')!;

    // mids [5.01, 5.08, 9.9]: median 5.08, threshold 5.08*0.15 = 0.762
    // 9.9 deviates 4.82 -> dropped; survivors [5.01, 5.08]
    expect(row.sourceRates.alpha.status).toBe('ok');
    expect(row.sourceRates.beta.status).toBe('ok');
    expect(row.sourceRates.gamma.status).toBe('outlier');

    // avg mid = (5.01+5.08)/2 = 5.045
    expect(row.globalAvg.mid).toBe(5.045);
    // avg bid = (5.00+5.06)/2 = 5.03 ; avg ask = (5.02+5.10)/2 = 5.06
    // (gamma excluded from the side averages too)
    expect(row.globalAvg.buy).toBe(5.03);
    expect(row.globalAvg.sell).toBe(5.06);

    // variance = max-min of survivors = 5.08 - 5.01 = 0.07
    // pct = 0.07/5.045*100 = 1.387..% -> between 0.5 and 2 -> 'normal'
    expect(row.variance.points).toBe(0.07);
    expect(row.variance.direction).toBe('normal');

    // No stored row -> AUTO_AVG off the average, zero spread applied to the
    // averaged market sides: bid = 5.03 - 0, ask = 5.06 + 0
    expect(row.storeRate.mode).toBe('AUTO_AVG');
    expect(row.storeRate.label).toBe('Auto (Avg)');
    expect(row.storeRate.mid).toBe(5.045);
    expect(row.storeRate.marketBid).toBe(5.03);
    expect(row.storeRate.marketAsk).toBe(5.06);
    expect(row.storeRate.bid).toBe(5.03);
    expect(row.storeRate.ask).toBe(5.06);
    // spread = 5.06 - 5.03 = 0.03
    expect(row.storeRate.spread).toBe(0.03);

    // stats: latency = round((40+60+80)/3) = 60; 3 sources online
    expect(board.stats.networkLatency).toBe(60);
    expect(board.stats.sourcesConnected).toBe(3);
    expect(board.stats.sourcesTotal).toBe(3);
    // variances: BRL 0.07/5.045 = 0.0138751..., CNY (no feed) 0
    // avg = 0.0069375...; stability = 100 - 0.69375... = 99.306... -> 99.3
    expect(board.stats.marketStability).toBe(99.3);
    // drift = 0.69375...% -> toFixed(2) -> 0.69
    expect(board.stats.globalAvgDrift).toBe(0.69);
    expect(board.stats.driftLocked).toBe(0);
  });

  it('gives a non-feed pair no source data and a zero auto rate when unset', async () => {
    const svc = makeService({}, [
      provider('alpha', [{ quote: 'BRL', bid: 5.0, ask: 5.02, mid: 5.01 }]),
    ]);
    const board = await svc.refreshBoard();
    const cny = board.rows.find((r) => r.quote === 'CNY')!;
    expect(cny.sourceRates.alpha.status).toBe('missing');
    expect(cny.globalAvg.mid).toBe(0);
    expect(cny.storeRate.mid).toBe(0);
  });
});

// ─── Store-rate modes ──────────────────────────────────────

describe('store rate modes', () => {
  it('AUTO_AVG follows the feed and widens the averaged market sides by the spread, rounding against the customer', async () => {
    const svc = makeService(
      {
        storeRates: [
          srRow({
            mid: 4.9, // stale stored mid — must be replaced by the live average
            marketBid: 4.9,
            marketAsk: 4.9,
            spreadPercent: 2,
            roundingDecimals: 2,
            roundingMode: 'FLOOR',
          }),
        ],
      },
      [provider('alpha', [{ quote: 'BRL', bid: 5.03, ask: 5.06, mid: 5.045 }])],
    );

    const board = await svc.refreshBoard();
    const sr = board.rows.find((r) => r.quote === 'BRL')!.storeRate;

    expect(sr.mode).toBe('AUTO_AVG');
    expect(sr.mid).toBe(5.045); // tracked live average, not the stale 4.9
    expect(sr.marketBid).toBe(5.03);
    expect(sr.marketAsk).toBe(5.06);

    // half-spread = mid * 2% / 2 = 5.045 * 0.01 = 0.05045
    // raw bid = 5.03 - 0.05045 = 4.97955 -> FLOOR @2dp = 4.97 (house keeps the diff)
    // raw ask = 5.06 + 0.05045 = 5.11045 -> CEIL  @2dp = 5.12
    expect(sr.bid).toBe(4.97);
    expect(sr.ask).toBe(5.12);
    // spread = 5.12 - 4.97 = 0.15
    expect(sr.spread).toBe(0.15);
    // 2dp is fine for a ~5.0 rate: step 0.01 <= 5.045*1% = 0.05045
    expect(sr.roundingDecimals).toBe(2);
    expect(sr.effectiveRoundingDecimals).toBe(2);
  });

  it('MANUAL_SOURCE pins the rate to the hinted source and its sides', async () => {
    const svc = makeService(
      { storeRates: [srRow({ mode: 'MANUAL_SOURCE', sourceHint: 'beta', mid: 1 })] },
      [
        provider('alpha', [{ quote: 'BRL', bid: 5.0, ask: 5.02, mid: 5.01 }]),
        provider('beta', [{ quote: 'BRL', bid: 5.06, ask: 5.1, mid: 5.08 }]),
      ],
    );
    const sr = (await svc.refreshBoard()).rows.find((r) => r.quote === 'BRL')!.storeRate;

    expect(sr.mode).toBe('MANUAL_SOURCE');
    expect(sr.sourceHint).toBe('beta');
    expect(sr.label).toBe('Manual (beta)');
    expect(sr.mid).toBe(5.08); // beta's mid, not the 2-source average 5.045
    expect(sr.marketBid).toBe(5.06);
    expect(sr.marketAsk).toBe(5.1);
    // zero margin -> the market's own sides pass through
    expect(sr.bid).toBe(5.06);
    expect(sr.ask).toBe(5.1);
  });

  it('MANUAL_SOURCE with a retired hint follows the single live source and repairs the label', async () => {
    const svc = makeService(
      { storeRates: [srRow({ mode: 'MANUAL_SOURCE', sourceHint: 'oldfeed', mid: 4.5 })] },
      [provider('alpha', [{ quote: 'BRL', bid: 5.01, ask: 5.03, mid: 5.02 }])],
    );
    const sr = (await svc.refreshBoard()).rows.find((r) => r.quote === 'BRL')!.storeRate;

    expect(sr.sourceHint).toBe('alpha');
    expect(sr.label).toBe('Manual (alpha)');
    expect(sr.mid).toBe(5.02);
    expect(sr.marketBid).toBe(5.01);
    expect(sr.marketAsk).toBe(5.03);
  });

  it('CUSTOM_VALUE ignores the feed, drops market sides, and prices both sides off the mid with asymmetric margins', async () => {
    const svc = makeService(
      {
        storeRates: [
          srRow({
            mode: 'CUSTOM_VALUE',
            mid: 5.5,
            // stored sides must NOT be used for an operator-set rate
            marketBid: 4.99,
            marketAsk: 5.01,
            spreadMode: 'ASYMMETRIC',
            buyMargin: 1,
            sellMargin: 2,
          }),
        ],
      },
      [provider('alpha', [{ quote: 'BRL', bid: 4.99, ask: 5.01, mid: 5.0 }])],
    );
    const sr = (await svc.refreshBoard()).rows.find((r) => r.quote === 'BRL')!.storeRate;

    expect(sr.mode).toBe('CUSTOM_VALUE');
    expect(sr.label).toBe('Custom');
    expect(sr.mid).toBe(5.5); // operator value never moves with the feed
    expect(sr.marketBid).toBeNull();
    expect(sr.marketAsk).toBeNull();
    // bid = 5.5 - 5.5*1% = 5.5 - 0.055 = 5.445
    // ask = 5.5 + 5.5*2% = 5.5 + 0.110 = 5.610
    expect(sr.bid).toBe(5.445);
    expect(sr.ask).toBe(5.61);
    // spread = 5.61 - 5.445 = 0.165
    expect(sr.spread).toBe(0.165);
  });

  it('LOCKED keeps the stored mid and collapses both sides onto it', async () => {
    const svc = makeService(
      {
        storeRates: [
          srRow({ mode: 'LOCKED', mid: 5.5, marketBid: 5.49, marketAsk: 5.51 }),
        ],
      },
      [provider('alpha', [{ quote: 'BRL', bid: 4.99, ask: 5.01, mid: 5.0 }])],
    );
    const sr = (await svc.refreshBoard()).rows.find((r) => r.quote === 'BRL')!.storeRate;

    expect(sr.mode).toBe('LOCKED');
    expect(sr.label).toBe('Locked');
    expect(sr.mid).toBe(5.5);
    expect(sr.marketBid).toBeNull();
    expect(sr.marketAsk).toBeNull();
    expect(sr.bid).toBe(5.5);
    expect(sr.ask).toBe(5.5);
    expect(sr.spread).toBe(0);
  });

  it('AUTO_AVG keeps the stored mid and stored market sides when the feed is offline', async () => {
    const svc = makeService(
      { storeRates: [srRow({ mid: 5.2, marketBid: 5.19, marketAsk: 5.21 })] },
      [provider('alpha', [], 0, /* fail */ true)],
    );
    const board = await svc.refreshBoard();
    expect(board.sources[0].status).toBe('offline');

    const sr = board.rows.find((r) => r.quote === 'BRL')!.storeRate;
    expect(sr.mid).toBe(5.2);
    expect(sr.marketBid).toBe(5.19);
    expect(sr.marketAsk).toBe(5.21);
    // zero margin on the remembered sides
    expect(sr.bid).toBe(5.19);
    expect(sr.ask).toBe(5.21);
  });
});

// ─── getAllSpreads: spread + rounding math (USD base) ──────

describe('getAllSpreads (USD base)', () => {
  const currencies = [
    { code: 'BRL', name: 'Brazilian Real' },
    { code: 'CNY', name: 'Chinese Yuan' },
    { code: 'ARS', name: 'Argentine Peso' },
    { code: 'AED', name: 'Emirates Dirham' },
  ];

  it('preserves the market spread at zero margin', async () => {
    const svc = makeService({
      currencies,
      storeRates: [srRow({ quote: 'BRL', mid: 5.0, marketBid: 4.99, marketAsk: 5.01 })],
    });
    const [row] = await svc.getAllSpreads('USD');
    expect(row.pair).toBe('USD/BRL');
    expect(row.mid).toBe(5.0);
    // 0% margin leaves the feed's own sides intact
    expect(row.bid).toBe(4.99);
    expect(row.ask).toBe(5.01);
    // spread = 5.01 - 4.99 = 0.02
    expect(row.spread).toBe(0.02);
  });

  it('applies a FIXED symmetric spread half-and-half around the mid', async () => {
    const svc = makeService({
      currencies,
      storeRates: [
        srRow({ quote: 'CNY', mid: 7.2, spreadType: 'FIXED', spreadFixed: 0.1 }),
      ],
    });
    const [row] = await svc.getAllSpreads('USD');
    // no market sides -> both sides off the mid
    // bid = 7.2 - 0.1/2 = 7.15 ; ask = 7.2 + 0.05 = 7.25 ; spread = 0.1
    expect(row.bid).toBe(7.15);
    expect(row.ask).toBe(7.25);
    expect(row.spread).toBe(0.1);
  });

  it('rounds FLOOR on bid and CEIL on ask when the decimals fit the rate', async () => {
    const svc = makeService({
      currencies,
      storeRates: [
        srRow({
          quote: 'ARS',
          mid: 1397.5,
          spreadPercent: 1,
          roundingDecimals: 0,
          roundingMode: 'FLOOR',
        }),
      ],
    });
    const [row] = await svc.getAllSpreads('USD');
    // half = 1397.5*1%/2 = 6.9875
    // raw bid = 1397.5 - 6.9875 = 1390.5125 -> FLOOR @0dp = 1390
    // raw ask = 1397.5 + 6.9875 = 1404.4875 -> CEIL  @0dp = 1405
    expect(row.bid).toBe(1390);
    expect(row.ask).toBe(1405);
    expect(row.spread).toBe(15);
    // step 1 <= 1397.5*1% = 13.975 -> the setting is usable
    expect(row.effectiveRoundingDecimals).toBe(0);
  });

  it('ignores rounding too coarse for the rate (step > 1% of mid)', async () => {
    const svc = makeService({
      currencies,
      storeRates: [
        srRow({
          quote: 'AED',
          mid: 3.6695,
          roundingDecimals: 0,
          roundingMode: 'FLOOR',
        }),
      ],
    });
    const [row] = await svc.getAllSpreads('USD');
    // 0dp step = 1 > 3.6695*1% = 0.036695 -> rounding must be skipped, or the
    // house would quote 3 / 4 (a 27% spread nobody configured)
    expect(row.effectiveRoundingDecimals).toBeNull();
    expect(row.bid).toBe(3.6695);
    expect(row.ask).toBe(3.6695);
  });
});

// ─── getAllSpreads: re-basing (inversion and crossing) ─────

describe('getAllSpreads re-based to BRL', () => {
  const storeRates = [
    srRow({ quote: 'BRL', mid: 5.0, marketBid: 4.99, marketAsk: 5.01 }),
    srRow({ quote: 'CNY', mid: 7.2, marketBid: 7.19, marketAsk: 7.21 }),
  ];

  it('inverts the base pair, swapping sides (1/ask becomes the bid)', async () => {
    const svc = makeService({ storeRates });
    const rows = await svc.getAllSpreads('BRL');
    const brlUsd = rows.find((r) => r.pair === 'BRL/USD')!;

    // mid = 1/5.0 = 0.2
    expect(brlUsd.base).toBe('BRL');
    expect(brlUsd.quote).toBe('USD');
    expect(brlUsd.mid).toBeCloseTo(0.2, 10);
    // flipped bid = 1/ask = 1/5.01 = 0.19960080 (8 sig figs)
    // flipped ask = 1/bid = 1/4.99 = 0.20040080
    expect(brlUsd.marketBid).toBeCloseTo(0.1996008, 7);
    expect(brlUsd.marketAsk).toBeCloseTo(0.2004008, 7);
    // zero margin -> quoted sides equal the flipped market sides
    expect(brlUsd.bid).toBeCloseTo(0.1996008, 7);
    expect(brlUsd.ask).toBeCloseTo(0.2004008, 7);
    expect(brlUsd.bid).toBeLessThan(brlUsd.ask);
  });

  it('crosses other pairs against the opposite side of the base pair', async () => {
    const svc = makeService({ storeRates });
    const rows = await svc.getAllSpreads('BRL');
    const brlCny = rows.find((r) => r.pair === 'BRL/CNY')!;

    // mid = 7.2 / 5.0 = 1.44
    expect(brlCny.mid).toBeCloseTo(1.44, 10);
    // cross bid = usd/cny bid / usd/brl ask = 7.19/5.01 = 1.4351297 (8 s.f.)
    // cross ask = usd/cny ask / usd/brl bid = 7.21/4.99 = 1.4448898
    expect(brlCny.marketBid).toBeCloseTo(1.4351297, 6);
    expect(brlCny.marketAsk).toBeCloseTo(1.4448898, 6);
    expect(brlCny.bid).toBeCloseTo(1.4351297, 6);
    expect(brlCny.ask).toBeCloseTo(1.4448898, 6);
    expect(brlCny.bid).toBeLessThan(brlCny.ask);
  });
});

// ─── Board re-basing via refreshBoard(baseCurrency) ────────

describe('refreshBoard re-based to BRL', () => {
  const setup = () =>
    makeService(
      { storeRates: [srRow({ quote: 'CNY', mode: 'CUSTOM_VALUE', mid: 7.2 })] },
      [provider('alpha', [{ quote: 'BRL', bid: 4.99, ask: 5.01, mid: 5.0 }])],
    );

  it('inverts the base row store rate with swapped market sides', async () => {
    const board = await setup().refreshBoard('BRL');
    const row = board.rows.find((r) => r.quote === 'USD')!;

    expect(row.pair).toBe('BRL/USD');
    // mid = 1/5.0 = 0.2 ; globalAvg mid likewise
    expect(row.storeRate.mid).toBeCloseTo(0.2, 10);
    expect(row.globalAvg.mid).toBeCloseTo(0.2, 10);
    // sides swap on inversion: bid = 1/5.01, ask = 1/4.99
    expect(row.storeRate.marketBid).toBeCloseTo(0.1996008, 7);
    expect(row.storeRate.marketAsk).toBeCloseTo(0.2004008, 7);
    expect(row.storeRate.bid).toBeCloseTo(0.1996008, 7);
    expect(row.storeRate.ask).toBeCloseTo(0.2004008, 7);
    // spread = 1/4.99 - 1/5.01 = 0.2004008 - 0.1996008 = 0.0008
    expect(row.storeRate.spread).toBeCloseTo(0.0008, 8);
  });

  it('re-bases an operator CUSTOM rate off the base mid with no market sides', async () => {
    const board = await setup().refreshBoard('BRL');
    const row = board.rows.find((r) => r.quote === 'CNY')!;

    expect(row.pair).toBe('BRL/CNY');
    // mid = 7.2 / 5.0 = 1.44; CUSTOM has no market sides, so bid = ask = mid
    expect(row.storeRate.mode).toBe('CUSTOM_VALUE');
    expect(row.storeRate.mid).toBeCloseTo(1.44, 10);
    expect(row.storeRate.marketBid).toBeNull();
    expect(row.storeRate.marketAsk).toBeNull();
    expect(row.storeRate.bid).toBeCloseTo(1.44, 10);
    expect(row.storeRate.ask).toBeCloseTo(1.44, 10);
    expect(row.storeRate.spread).toBe(0);
  });

  it('flips per-source cells with swapped sides so buy stays the cheaper price', async () => {
    // Documented intent (invertMarketSides in the same file): "Flipping the
    // pair swaps the sides: 1/ask is the cheaper one." A source quoting
    // USD/BRL 4.99 / 5.01 therefore flips to BRL/USD:
    //   buy (bid) = 1/5.01 = 0.19960080  (the cheaper side)
    //   sell (ask) = 1/4.99 = 0.20040080
    // Any market cell must satisfy buy <= sell.
    const board = await setup().refreshBoard('BRL');
    const cell = board.rows.find((r) => r.quote === 'USD')!.sourceRates.alpha;

    expect(cell.status).toBe('ok');
    expect(cell.mid).toBeCloseTo(0.2, 10);
    expect(cell.buy!).toBeLessThanOrEqual(cell.sell!);
    expect(cell.buy).toBeCloseTo(0.1996008, 7);
    expect(cell.sell).toBeCloseTo(0.2004008, 7);
  });
});

// ─── Customer pair fee orientation resolution ──────────────

describe('getCustomerPairFee', () => {
  const feeRows = [
    { customerId: 'c1', base: 'USD', quote: 'BRL', points: 3, percent: null },
    { customerId: 'c2', base: 'BRL', quote: 'USD', points: 7, percent: null },
    { customerId: 'c2', base: 'USD', quote: 'BRL', points: 3, percent: null },
    { customerId: 'c3', base: 'USD', quote: 'BRL', points: null, percent: null },
    { customerId: 'c4', base: 'USD', quote: 'BRL', points: null, percent: 1.5 },
  ];

  it('finds a fee stored in the opposite orientation (A/B queried as B/A)', async () => {
    const svc = makeService({ feeRows });
    const fee = await svc.getCustomerPairFee('c1', 'BRL', 'USD');
    // stored as USD/BRL, still found; returned in its stored orientation
    expect(fee).toEqual({ base: 'USD', quote: 'BRL', points: 3, percent: 0 });
  });

  it('prefers the row matching the requested orientation when both exist', async () => {
    const svc = makeService({ feeRows });
    const fee = await svc.getCustomerPairFee('c2', 'BRL', 'USD');
    expect(fee).toEqual({ base: 'BRL', quote: 'USD', points: 7, percent: 0 });
  });

  it('returns null when nothing (or only nulls) is configured', async () => {
    const svc = makeService({ feeRows });
    expect(await svc.getCustomerPairFee('c3', 'USD', 'BRL')).toBeNull();
    expect(await svc.getCustomerPairFee('nobody', 'USD', 'BRL')).toBeNull();
  });

  it('coerces a percent-only row to points 0 / percent value', async () => {
    const svc = makeService({ feeRows });
    const fee = await svc.getCustomerPairFee('c4', 'USD', 'BRL');
    expect(fee).toEqual({ base: 'USD', quote: 'BRL', points: 0, percent: 1.5 });
  });
});

describe('getCustomerFees', () => {
  it('lets the requested orientation win when a customer has both rows', async () => {
    const svc = makeService({
      customers: [{ id: 'c2', customerId: 'C002', name: 'Bea', level: 1 }],
      feeRows: [
        // inverted row deliberately first: the USD-base row must still win
        { customerId: 'c2', base: 'BRL', quote: 'USD', points: 7, percent: null },
        { customerId: 'c2', base: 'USD', quote: 'BRL', points: 3, percent: null },
      ],
    });
    const [row] = await svc.getCustomerFees('USD', 'BRL');
    expect(row.points).toBe(3);
  });
});
