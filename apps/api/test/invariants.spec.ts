import { describe, it, expect } from 'vitest';
import {
  applyLevelPoints,
  applyRounding,
  computeBidAsk,
  effectiveDecimals,
  DEFAULT_SPREAD_CONFIG,
  type MarketSides,
  type RoundingConfig,
  type SpreadConfig,
} from '../src/modules/rates/spread.util';
import { FEE_POINT_VALUE } from '../src/modules/rates/rates.constants';
import {
  TransactionsService,
  type CreateTransactionDto,
} from '../src/modules/transactions/transactions.service';

// ─── Deterministic grids (Math.random is not available / not allowed) ────────
const MIDS = [0.19, 1, 3.6695, 5.0792, 1397, 68000];
const SPREAD_PERCENTS = [0, 0.5, 2];
const FEE_PERCENTS = [0, 0.5, 1, 2];
const POINTS = [0, 2, 5, 7];
const AMOUNTS = [1, 100, 1000, 12345.67];

const cfg = (partial: Partial<SpreadConfig>): SpreadConfig => ({
  ...DEFAULT_SPREAD_CONFIG,
  ...partial,
});

/**
 * Spread configs exercised for a given mid. Fixed offsets are scaled off the
 * mid so they stay sane across magnitudes (0.19 … 68000) and never push bid
 * through zero.
 */
function configsFor(mid: number): Array<[string, SpreadConfig]> {
  const list: Array<[string, SpreadConfig]> = [];
  for (const sp of SPREAD_PERCENTS) {
    list.push([`pct-sym-${sp}%`, cfg({ spreadType: 'PERCENTAGE', spreadMode: 'SYMMETRIC', spreadPercent: sp })]);
  }
  list.push(['pct-asym-0.5/2', cfg({ spreadType: 'PERCENTAGE', spreadMode: 'ASYMMETRIC', buyMargin: 0.5, sellMargin: 2 })]);
  list.push(['pct-asym-2/0', cfg({ spreadType: 'PERCENTAGE', spreadMode: 'ASYMMETRIC', buyMargin: 2, sellMargin: 0 })]);
  for (const fx of [0, mid * 0.002, mid * 0.02]) {
    list.push([`fixed-sym-${fx}`, cfg({ spreadType: 'FIXED', spreadMode: 'SYMMETRIC', spreadFixed: fx })]);
  }
  list.push([
    `fixed-asym-${mid * 0.001}/${mid * 0.004}`,
    cfg({ spreadType: 'FIXED', spreadMode: 'ASYMMETRIC', buyMargin: mid * 0.001, sellMargin: mid * 0.004 }),
  ]);
  return list;
}

// Rounding configs: decimals=4 is valid (10^-4 <= mid * 0.01) for every mid in
// the grid (smallest: 0.19 * 0.01 = 0.0019 >= 1e-4). decimals=2 is too coarse
// for mid=0.19 and exercises the "rounding skipped" path.
const ROUNDINGS: Array<[string, RoundingConfig | null]> = [
  ['no-rounding', null],
  ['round-4dp', { decimals: 4, mode: null }],
  ['round-2dp', { decimals: 2, mode: null }],
];

// ─── TransactionsService plain-object stubbing ───────────────────────────────

interface FeeRow {
  base: string;
  quote: string;
  points: number;
  percent: number;
}

/** LiveRate-shaped stub row; create() only reads base/quote/mid/spread. */
const usdRate = (quote: string, mid: number, spread: number) => ({
  base: 'USD',
  quote,
  mid,
  spread,
  bid: mid - spread / 2,
  ask: mid + spread / 2,
  trend: 'up',
  overridden: false,
  timestamp: new Date().toISOString(),
});

async function runTx(
  opts: { rates: Array<ReturnType<typeof usdRate>>; fee?: FeeRow | null },
  dto: { base: string; quote: string; amountIn: number },
) {
  let created: any = null;
  const prisma: any = {
    customer: { findUnique: async () => ({ id: 'cust-1', name: 'Test Customer' }) },
    destination: { findUnique: async () => null },
    transaction: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        created = data;
        return data;
      },
    },
    // No per-pair rounding configured — amountOut persists at 2dp nearest.
    storeRate: { findUnique: async () => null },
  };
  const ratesService: any = { getLatestRates: async () => opts.rates };
  const multiSource: any = { getCustomerPairFee: async () => opts.fee ?? null };
  const svc = new TransactionsService(prisma, ratesService, multiSource);
  // Silence the Nest logger (standalone Logger writes to console otherwise).
  (svc as any).logger = { log() {}, warn() {}, error() {}, debug() {}, verbose() {} };
  const full: CreateTransactionDto = { type: 'BUY', customerId: 'cust-1', ...dto };
  await svc.create(full);
  return created as {
    amountIn: number;
    amountOut: number;
    rateApplied: number;
    spread: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('constants guard', () => {
  it('FEE_POINT_VALUE is the documented 0.01 raw rate units per point', () => {
    expect(FEE_POINT_VALUE).toBe(0.01);
  });
});

describe('invariant 1: computeBidAsk ordering', () => {
  it('bid <= ask, bid <= mid <= ask (no market), bid <= market.bid & ask >= market.ask (with market)', () => {
    for (const mid of MIDS) {
      // eps absorbs the toPrecision(8) noise (relative ~5e-8) — far below any
      // configured spread in the grid, so ordering bugs still surface.
      const eps = mid * 1e-7;
      const markets: Array<[string, MarketSides | null]> = [
        ['no-market', null],
        ['market±0.1%', { bid: mid * 0.999, ask: mid * 1.001 }],
      ];
      for (const [cName, config] of configsFor(mid)) {
        for (const [rName, rounding] of ROUNDINGS) {
          for (const [mName, market] of markets) {
            const tag = `mid=${mid} cfg=${cName} rounding=${rName} market=${mName}`;
            const r = computeBidAsk(mid, config, rounding, market);
            expect(r.bid, `bid > ask for ${tag}`).toBeLessThanOrEqual(r.ask + eps);
            expect(r.spread, `negative spread for ${tag}`).toBeGreaterThanOrEqual(-eps);
            if (!market) {
              expect(r.bid, `bid > mid for ${tag}`).toBeLessThanOrEqual(mid + eps);
              expect(r.ask, `ask < mid for ${tag}`).toBeGreaterThanOrEqual(mid - eps);
            } else {
              expect(r.bid, `bid > market.bid for ${tag}`).toBeLessThanOrEqual((market.bid as number) + eps);
              expect(r.ask, `ask < market.ask for ${tag}`).toBeGreaterThanOrEqual((market.ask as number) - eps);
            }
          }
        }
      }
    }
  });
});

describe('invariant 2: applyRounding always favours the house and moves less than one step', () => {
  it('FLOOR <= value <= CEIL; |result - value| < step when rounding applied; identity when skipped', () => {
    const values = [...MIDS, 12345.67, 0.007];
    const decimalsGrid = [0, 2, 4, 8];
    for (const value of values) {
      for (const d of decimalsGrid) {
        const tag = `value=${value} decimals=${d}`;
        // FLOOR via modeOverride (the path computeBidAsk uses), CEIL via config mode.
        const f = applyRounding(value, { decimals: d, mode: null }, 'FLOOR');
        const c = applyRounding(value, { decimals: d, mode: 'CEIL' });
        // Pure float noise bound: floor(v*10^d)/10^d <= v up to a few ulps.
        const tiny = Math.abs(value) * 1e-12;
        expect(f, `FLOOR result above value for ${tag}`).toBeLessThanOrEqual(value + tiny);
        expect(c, `CEIL result below value for ${tag}`).toBeGreaterThanOrEqual(value - tiny);

        if (effectiveDecimals(value, d) != null) {
          const step = Math.pow(10, -d);
          // Mathematically |result - value| < step strictly. In floats a value
          // sitting exactly on the grid (e.g. 3.6695 at 4dp) can land a full
          // step away because v*10^d rounds across the integer boundary, so we
          // allow <= step with a whisker of slack. A wrong-decimals bug would
          // overshoot by ~10x step and still fail.
          expect(Math.abs(f - value), `FLOOR moved >= one step for ${tag}`).toBeLessThanOrEqual(step * (1 + 1e-6));
          expect(Math.abs(c - value), `CEIL moved >= one step for ${tag}`).toBeLessThanOrEqual(step * (1 + 1e-6));
        } else {
          // Too coarse for this magnitude — the code promises to skip exactly.
          expect(f, `skipped FLOOR not identity for ${tag}`).toBe(value);
          expect(c, `skipped CEIL not identity for ${tag}`).toBe(value);
        }
      }
    }
  });
});

describe('invariant 3: applyLevelPoints never narrows the spread', () => {
  it('spread after level points >= spread before, for every mid/config/points/rounding', () => {
    const levelPercents = [0, 0.5, 2, 5];
    for (const mid of MIDS) {
      const baseConfigs: Array<[string, SpreadConfig]> = [
        ['zero-spread', cfg({})],
        ['pct-sym-2%', cfg({ spreadPercent: 2 })],
      ];
      for (const [cName, config] of baseConfigs) {
        const r0 = computeBidAsk(mid, config);
        const before = r0.ask - r0.bid;
        for (const lp of levelPercents) {
          for (const [rName, rounding] of ROUNDINGS) {
            const tag = `mid=${mid} cfg=${cName} levelPoints%=${lp} rounding=${rName}`;
            const r1 = applyLevelPoints(r0.bid, r0.ask, mid, lp, rounding);
            const after = r1.ask - r1.bid;
            // eps: toPrecision(8) noise only; any real narrowing would be
            // >= mid * lp/100 which is orders of magnitude larger.
            const eps = mid * 1e-6;
            expect(after, `spread narrowed for ${tag}`).toBeGreaterThanOrEqual(before - eps);
            expect(r1.bid, `level points raised bid for ${tag}`).toBeLessThanOrEqual(r0.bid + eps);
            expect(r1.ask, `level points lowered ask for ${tag}`).toBeGreaterThanOrEqual(r0.ask - eps);
          }
        }
      }
    }
  });
});

describe('invariant 4: transaction fee/points behaviour', () => {
  it('4a: fee% > 0, points = 0, zero pair spread → customer strictly worse than mid conversion', async () => {
    for (const mid of MIDS) {
      for (const f of FEE_PERCENTS.filter((x) => x > 0)) {
        for (const amount of [1, 12345.67]) {
          const cases = [
            // USD -> X, fee stored USD/X: rate = mid*(1 - f/100) < mid
            { dir: 'USD->X fee@USD/X', base: 'USD', quote: 'XCU', feeBase: 'USD', feeQuote: 'XCU', midRate: mid },
            // USD -> X, fee stored X/USD: rate = 1/(1/mid + (1/mid)*f/100) = mid/(1+f/100) < mid
            { dir: 'USD->X fee@X/USD', base: 'USD', quote: 'XCU', feeBase: 'XCU', feeQuote: 'USD', midRate: mid },
            // X -> USD, fee stored USD/X: rate = 1/(mid*(1+f/100)) < 1/mid
            { dir: 'X->USD fee@USD/X', base: 'XCU', quote: 'USD', feeBase: 'USD', feeQuote: 'XCU', midRate: 1 / mid },
            // X -> USD, fee stored X/USD: rate = (1/mid)*(1 - f/100) < 1/mid
            { dir: 'X->USD fee@X/USD', base: 'XCU', quote: 'USD', feeBase: 'XCU', feeQuote: 'USD', midRate: 1 / mid },
          ];
          for (const c of cases) {
            const tx = await runTx(
              { rates: [usdRate('XCU', mid, 0)], fee: { base: c.feeBase, quote: c.feeQuote, percent: f, points: 0 } },
              { base: c.base, quote: c.quote, amountIn: amount },
            );
            const tag = `${c.dir} mid=${mid} fee%=${f} amt=${amount}`;
            // Smallest gap in the grid: f=0.5% of 1/68000 ≈ 7.3e-8, still
            // larger than the 8dp rateApplied quantum (1e-8) — strict holds.
            expect(tx.rateApplied, `customer not strictly worse than mid: ${tag}`).toBeLessThan(c.midRate);
          }
        }
      }
    }
  });

  it('4b: points only (fee% = 0) improve the stored-orientation rate by exactly points * 0.01', async () => {
    const pts = POINTS.filter((p) => p > 0);
    for (const mid of MIDS) {
      for (const p of pts) {
        for (const amount of [1, 12345.67]) {
          // Case 1 — USD -> X, fee stored USD/X (fee's orientation = trade orientation):
          // amountOut = amount * (mid + p*0.01), so rateApplied = mid + p*0.01.
          {
            const tx = await runTx(
              { rates: [usdRate('XCU', mid, 0)], fee: { base: 'USD', quote: 'XCU', percent: 0, points: p } },
              { base: 'USD', quote: 'XCU', amountIn: amount },
            );
            const expected = mid + p * FEE_POINT_VALUE;
            const tol = Math.abs(expected) * 1e-9 + 2e-8; // 8dp quantum + float
            expect(
              Math.abs(tx.rateApplied - expected),
              `USD->X fee@USD/X mid=${mid} pts=${p} amt=${amount}: rate ${tx.rateApplied} != mid + pts*0.01 = ${expected}`,
            ).toBeLessThanOrEqual(tol);
          }
          // Case 2 — X -> USD, fee stored X/USD: amountOut = amount * (1/mid + p*0.01).
          {
            const tx = await runTx(
              { rates: [usdRate('XCU', mid, 0)], fee: { base: 'XCU', quote: 'USD', percent: 0, points: p } },
              { base: 'XCU', quote: 'USD', amountIn: amount },
            );
            const expected = 1 / mid + p * FEE_POINT_VALUE;
            const tol = Math.abs(expected) * 1e-9 + 2e-8;
            expect(
              Math.abs(tx.rateApplied - expected),
              `X->USD fee@X/USD mid=${mid} pts=${p} amt=${amount}: rate ${tx.rateApplied} != 1/mid + pts*0.01 = ${expected}`,
            ).toBeLessThanOrEqual(tol);
          }
          // Cases 3 & 4 assert through an inverse (1/rate), which amplifies the
          // 8dp rateApplied quantisation by rate^-2 / mid^2. Restricted to
          // mid <= 10, where the quantisation (~5e-7) is far below the 0.02+
          // signal; at mid=68000 the persistence granularity swallows the
          // points entirely, so the invariant is untestable there.
          if (mid <= 10) {
            // Case 3 — USD -> X, fee stored X/USD (inverted): the customer buys X at
            // (1/mid − p*0.01) USD per X, i.e. rate = 1/(1/mid − p*0.01).
            {
              const tx = await runTx(
                { rates: [usdRate('XCU', mid, 0)], fee: { base: 'XCU', quote: 'USD', percent: 0, points: p } },
                { base: 'USD', quote: 'XCU', amountIn: amount },
              );
              const expected = 1 / (1 / mid - p * FEE_POINT_VALUE);
              const tol = Math.abs(expected) * 1e-7 + 1e-8;
              expect(
                Math.abs(tx.rateApplied - expected),
                `USD->X fee@X/USD mid=${mid} pts=${p} amt=${amount}: rate ${tx.rateApplied} != 1/(1/mid - pts*0.01) = ${expected}`,
              ).toBeLessThanOrEqual(tol);
            }
            // Case 4 — X -> USD, fee stored USD/X: the customer pays (mid − p*0.01)
            // per USD, i.e. rate = 1/(mid − p*0.01).
            {
              const tx = await runTx(
                { rates: [usdRate('XCU', mid, 0)], fee: { base: 'USD', quote: 'XCU', percent: 0, points: p } },
                { base: 'XCU', quote: 'USD', amountIn: amount },
              );
              const expected = 1 / (mid - p * FEE_POINT_VALUE);
              const tol = Math.abs(expected) * 1e-7 + 1e-8;
              expect(
                Math.abs(tx.rateApplied - expected),
                `X->USD fee@USD/X mid=${mid} pts=${p} amt=${amount}: rate ${tx.rateApplied} != 1/(mid - pts*0.01) = ${expected}`,
              ).toBeLessThanOrEqual(tol);
            }
          }
        }
      }
    }
  });

  it('4c: amountOut monotonically non-increasing as fee% rises (all else fixed)', async () => {
    for (const mid of MIDS) {
      for (const [base, quote] of [
        ['USD', 'XCU'],
        ['XCU', 'USD'],
      ] as const) {
        for (const amount of [100, 12345.67]) {
          let prevOut = Infinity;
          let prevRate = Infinity;
          for (const f of FEE_PERCENTS) {
            const tx = await runTx(
              { rates: [usdRate('XCU', mid, 0)], fee: { base: 'USD', quote: 'XCU', percent: f, points: 0 } },
              { base, quote, amountIn: amount },
            );
            const tag = `${base}->${quote} mid=${mid} amt=${amount} fee%=${f}`;
            // toFixed rounding is monotone, so persisted values must stay
            // non-increasing too; equality after rounding is allowed.
            expect(tx.amountOut, `amountOut increased with higher fee: ${tag}`).toBeLessThanOrEqual(prevOut);
            expect(tx.rateApplied, `rateApplied increased with higher fee: ${tag}`).toBeLessThanOrEqual(prevRate);
            prevOut = tx.amountOut;
            prevRate = tx.rateApplied;
          }
        }
      }
    }
  });
});

describe('invariant 5: cross-rate consistency (A -> B equals hand-composed A -> USD -> B)', () => {
  it('cross output = leg composition with fee applied once on the cross mid, per the code docs', async () => {
    const pairGrid: Array<[number, number]> = [
      [5.0792, 1397],
      [0.19, 68000],
      [3.6695, 0.19],
    ];
    const feeCombos: Array<[number, number]> = [
      [0, 0],
      [1, 0],
      [1, 2],
      [0, 5],
    ];
    for (const [midA, midB] of pairGrid) {
      for (const sPct of [0, 0.002]) {
        const sA = midA * sPct;
        const sB = midB * sPct;
        for (const [f, p] of feeCombos) {
          for (const amount of [1, 12345.67]) {
            const tag = `A(mid=${midA},s=${sA}) -> B(mid=${midB},s=${sB}) fee%=${f} pts=${p} amt=${amount}`;
            const tx = await runTx(
              {
                rates: [usdRate('AAA', midA, sA), usdRate('BBB', midB, sB)],
                fee: f || p ? { base: 'AAA', quote: 'BBB', percent: f, points: p } : null,
              },
              { base: 'AAA', quote: 'BBB', amountIn: amount },
            );
            // Hand-composed legs, per the code's own comments:
            //   leg 1 (pay the base leg, its spread discounts the price):
            //     usd = amount / (midA - sA)
            //   leg 2 (receive the quote leg, its spread raises what they get):
            //     gross = usd * (midB + sB)
            //   fee applied ONCE on the cross mid (midB/midA):
            //     out = gross - amount * (crossMid * f/100 - p * 0.01)
            const usd = amount / (midA - sA);
            const gross = usd * (midB + sB);
            const crossMid = midB / midA;
            const expected = gross - amount * ((crossMid * f) / 100 - p * FEE_POINT_VALUE);
            const expRate = expected / amount;
            expect(
              Math.abs(tx.rateApplied - expRate),
              `cross rate != composed legs: ${tag} (got ${tx.rateApplied}, expected ${expRate})`,
            ).toBeLessThanOrEqual(Math.abs(expRate) * 1e-9 + 1e-7);
            expect(
              Math.abs(tx.amountOut - expected),
              `cross amountOut != composed legs: ${tag} (got ${tx.amountOut}, expected ${expected})`,
            ).toBeLessThanOrEqual(0.0051 + Math.abs(expected) * 1e-9);
          }
        }
      }
    }
  });

  it('cross with inverted-orientation fee matches the hand-composed inverse-leg formula', async () => {
    // A = 1397, B = 5.0792 so the inverted cross mid (midA/midB ≈ 275) dwarfs
    // the points offset and the denominator stays positive.
    const midA = 1397;
    const midB = 5.0792;
    const sA = midA * 0.002;
    const sB = midB * 0.002;
    const f = 1;
    const p = 2;
    const amount = 1000;
    const tx = await runTx(
      {
        rates: [usdRate('AAA', midA, sA), usdRate('BBB', midB, sB)],
        // fee stored on B/A while trading A -> B: applied on the inverse side.
        fee: { base: 'BBB', quote: 'AAA', percent: f, points: p },
      },
      { base: 'AAA', quote: 'BBB', amountIn: amount },
    );
    // Legs composed by hand: crossAdj = (midB + sB)/(midA - sA); the fee sits
    // on the inverse orientation whose mid is midA/midB:
    //   out = amount / (1/crossAdj + (midA/midB)*f/100 - p*0.01)
    const crossAdj = (midB + sB) / (midA - sA);
    const invCrossMid = midA / midB;
    const expected = amount / (1 / crossAdj + (invCrossMid * f) / 100 - p * FEE_POINT_VALUE);
    const expRate = expected / amount;
    expect(
      Math.abs(tx.rateApplied - expRate),
      `inverted-fee cross rate mismatch (got ${tx.rateApplied}, expected ${expRate})`,
    ).toBeLessThanOrEqual(Math.abs(expRate) * 1e-9 + 1e-7);
    expect(
      Math.abs(tx.amountOut - expected),
      `inverted-fee cross amountOut mismatch (got ${tx.amountOut}, expected ${expected})`,
    ).toBeLessThanOrEqual(0.0051 + Math.abs(expected) * 1e-9);
  });
});

describe('invariant 6: round-trip USD -> X -> USD with zero fees/spreads/destination', () => {
  it('returns the original amount within the tolerance implied by 2-decimal persistence', async () => {
    for (const mid of MIDS) {
      for (const amount of AMOUNTS) {
        const tag = `mid=${mid} amt=${amount}`;
        const leg1 = await runTx({ rates: [usdRate('XCU', mid, 0)], fee: null }, { base: 'USD', quote: 'XCU', amountIn: amount });
        const leg2 = await runTx(
          { rates: [usdRate('XCU', mid, 0)], fee: null },
          { base: 'XCU', quote: 'USD', amountIn: leg1.amountOut },
        );
        // Tolerance derivation (NOT plain float noise — persistence dominates):
        //   leg 1 persists round2(amount*mid): error δ1, |δ1| <= 0.005
        //   leg 2 raw = (amount*mid + δ1)/mid = amount + δ1/mid → error <= 0.005/mid
        //   leg 2 persists with another round2: additional |δ2| <= 0.005
        //   ⇒ |roundTrip − amount| <= 0.005 + 0.005/mid (+ float whisker)
        const tol = 0.00501 + 0.00501 / mid + amount * 1e-12;
        expect(
          Math.abs(leg2.amountOut - amount),
          `round-trip drifted: ${tag} (got back ${leg2.amountOut}, tol ${tol})`,
        ).toBeLessThanOrEqual(tol);
      }
    }
  });
});

describe('invariant 7: rateApplied * amountIn ≈ amountOut for every branch', () => {
  it('the persisted rate and amountOut derive from the same pre-rounding number', async () => {
    for (const mid of [0.19, 5.0792, 68000]) {
      const s = mid * 0.002; // nonzero pair spread to exercise marketAdj paths
      for (const amount of AMOUNTS) {
        const rates = [
          usdRate('XCU', mid, s),
          usdRate('AAA', 3.6695, 3.6695 * 0.002),
          usdRate('BBB', 1397, 1397 * 0.002),
        ];
        const combos: Array<{ name: string; base: string; quote: string; fee: FeeRow | null }> = [
          { name: 'USD->X no-fee', base: 'USD', quote: 'XCU', fee: null },
          { name: 'USD->X fee@USD/X', base: 'USD', quote: 'XCU', fee: { base: 'USD', quote: 'XCU', percent: 1, points: 2 } },
          { name: 'X->USD no-fee', base: 'XCU', quote: 'USD', fee: null },
          { name: 'X->USD fee@USD/X', base: 'XCU', quote: 'USD', fee: { base: 'USD', quote: 'XCU', percent: 1, points: 2 } },
          { name: 'X->USD fee@X/USD', base: 'XCU', quote: 'USD', fee: { base: 'XCU', quote: 'USD', percent: 1, points: 2 } },
          { name: 'A->B no-fee', base: 'AAA', quote: 'BBB', fee: null },
          { name: 'A->B fee@A/B', base: 'AAA', quote: 'BBB', fee: { base: 'AAA', quote: 'BBB', percent: 1, points: 2 } },
          // Inverted cross fee: trade B -> A with fee stored A/B; the inverse
          // cross mid (1397/3.6695 ≈ 381) keeps the denominator positive.
          { name: 'B->A fee@A/B(inv)', base: 'BBB', quote: 'AAA', fee: { base: 'AAA', quote: 'BBB', percent: 1, points: 2 } },
        ];
        // USD->X with inverted fee needs 1/mid to dominate points*0.01.
        if (mid <= 10) {
          combos.push({ name: 'USD->X fee@X/USD', base: 'USD', quote: 'XCU', fee: { base: 'XCU', quote: 'USD', percent: 1, points: 2 } });
        }
        for (const c of combos) {
          const tx = await runTx({ rates, fee: c.fee }, { base: c.base, quote: c.quote, amountIn: amount });
          const tag = `${c.name} mid=${mid} amt=${amount}`;
          // amountOut is round2(raw) (error <= 0.005) and rateApplied is
          // round8(raw/amountIn) (error <= 5e-9 * amountIn after multiplying
          // back). tol = 0.0052 + amountIn * 1e-8 covers both.
          const tol = 0.0052 + amount * 1e-8;
          expect(
            Math.abs(tx.rateApplied * tx.amountIn - tx.amountOut),
            `rateApplied * amountIn != amountOut: ${tag} (rate=${tx.rateApplied}, in=${tx.amountIn}, out=${tx.amountOut})`,
          ).toBeLessThanOrEqual(tol);
        }
      }
    }
  });
});
