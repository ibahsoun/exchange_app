import { describe, expect, it } from 'vitest';
import {
  applyLevelPoints,
  applyRounding,
  computeBidAsk,
  DEFAULT_SPREAD_CONFIG,
  effectiveDecimals,
  MAX_ROUNDING_DECIMALS,
  minDecimalsFor,
  resolveBaseSides,
  spreadConfigFromRow,
  validateRounding,
  validateSpread,
  type MarketSides,
  type RoundingConfig,
  type SpreadConfig,
} from '../src/modules/rates/spread.util';

/** Convenience builder: zero-margin PERCENTAGE/SYMMETRIC base overridden per test. */
function cfg(over: Partial<SpreadConfig> = {}): SpreadConfig {
  return { ...DEFAULT_SPREAD_CONFIG, ...over };
}

describe('computeBidAsk', () => {
  it('PERCENTAGE SYMMETRIC splits the spread% in half on each side', () => {
    // mid=100, spread 2% -> half = 100 * 2/100 / 2 = 1
    // bid = 100 - 1 = 99, ask = 100 + 1 = 101, spread = 2
    const r = computeBidAsk(100, cfg({ spreadPercent: 2 }));
    expect(r.bid).toBe(99);
    expect(r.ask).toBe(101);
    expect(r.spread).toBe(2);
  });

  it('PERCENTAGE ASYMMETRIC applies buyMargin/sellMargin of mid per side', () => {
    // mid=100, buy 1% -> bidOffset = 1; sell 3% -> askOffset = 3
    // bid = 99, ask = 103, spread = 4
    const r = computeBidAsk(
      100,
      cfg({ spreadMode: 'ASYMMETRIC', buyMargin: 1, sellMargin: 3 }),
    );
    expect(r.bid).toBe(99);
    expect(r.ask).toBe(103);
    expect(r.spread).toBe(4);
  });

  it('FIXED SYMMETRIC applies spreadFixed/2 on each side', () => {
    // mid=50, fixed 4 -> half = 2; bid = 48, ask = 52, spread = 4
    const r = computeBidAsk(50, cfg({ spreadType: 'FIXED', spreadFixed: 4 }));
    expect(r.bid).toBe(48);
    expect(r.ask).toBe(52);
    expect(r.spread).toBe(4);
  });

  it('FIXED ASYMMETRIC applies buyMargin/sellMargin as raw offsets', () => {
    // mid=50, buy 1.5, sell 0.5 -> bid = 48.5, ask = 50.5, spread = 2
    const r = computeBidAsk(
      50,
      cfg({ spreadType: 'FIXED', spreadMode: 'ASYMMETRIC', buyMargin: 1.5, sellMargin: 0.5 }),
    );
    expect(r.bid).toBeCloseTo(48.5, 10);
    expect(r.ask).toBeCloseTo(50.5, 10);
    expect(r.spread).toBeCloseTo(2, 10);
  });

  it('zero config without market collapses both sides onto the mid', () => {
    const r = computeBidAsk(100, cfg());
    expect(r.bid).toBe(100);
    expect(r.ask).toBe(100);
    expect(r.spread).toBe(0);
  });

  it('zero config with valid market keeps the feed bid/ask intact', () => {
    // market spread survives a 0% store margin: 6.7714 / 6.7724
    const market: MarketSides = { bid: 6.7714, ask: 6.7724 };
    const r = computeBidAsk(6.7719, cfg(), null, market);
    expect(r.bid).toBeCloseTo(6.7714, 10);
    expect(r.ask).toBeCloseTo(6.7724, 10);
    // 6.7724 - 6.7714 = 0.0010
    expect(r.spread).toBeCloseTo(0.001, 10);
  });

  it('margins are sized off the mid but applied to the market sides', () => {
    // mid=6.7719, buy 1% -> offset = 0.067719 taken from MARKET bid 6.7714
    // bid = 6.7714 - 0.067719 = 6.703681
    // ask = 6.7724 + 0.067719 = 6.840119
    const market: MarketSides = { bid: 6.7714, ask: 6.7724 };
    const r = computeBidAsk(
      6.7719,
      cfg({ spreadMode: 'ASYMMETRIC', buyMargin: 1, sellMargin: 1 }),
      null,
      market,
    );
    expect(r.bid).toBeCloseTo(6.703681, 9);
    expect(r.ask).toBeCloseTo(6.840119, 9);
    // 6.840119 - 6.703681 = 0.136438
    expect(r.spread).toBeCloseTo(0.136438, 8);
  });

  it('inverted market (bid > ask) collapses to mid', () => {
    const r = computeBidAsk(100, cfg({ spreadPercent: 2 }), null, { bid: 101, ask: 99 });
    // collapsed: bid = 100 - 1 = 99, ask = 101
    expect(r.bid).toBe(99);
    expect(r.ask).toBe(101);
  });

  it('nonpositive market side collapses to mid', () => {
    const r = computeBidAsk(100, cfg({ spreadPercent: 2 }), null, { bid: 0, ask: 101 });
    expect(r.bid).toBe(99);
    expect(r.ask).toBe(101);
  });

  it('missing market side (null) collapses to mid', () => {
    const r = computeBidAsk(100, cfg({ spreadPercent: 2 }), null, { bid: null, ask: 101 });
    expect(r.bid).toBe(99);
    expect(r.ask).toBe(101);
  });

  it('zero mid returns zeros regardless of config', () => {
    const r = computeBidAsk(0, cfg({ spreadPercent: 50, spreadFixed: 10 }));
    expect(r).toEqual({ bid: 0, ask: 0, spread: 0 });
  });

  it('rounds bid with FLOOR and ask with CEIL, overriding the config mode', () => {
    // mid=10, spread 1.34% -> half = 10 * 0.0134 / 2 = 0.067
    // raw bid = 9.933, raw ask = 10.067
    // 2 decimals: bid FLOOR -> 9.93, ask CEIL -> 10.07 (even though config says CEIL for both)
    const rounding: RoundingConfig = { decimals: 2, mode: 'CEIL' };
    const r = computeBidAsk(10, cfg({ spreadPercent: 1.34 }), rounding);
    expect(r.bid).toBeCloseTo(9.93, 10);
    expect(r.ask).toBeCloseTo(10.07, 10);
    // 10.07 - 9.93 = 0.14
    expect(r.spread).toBeCloseTo(0.14, 10);
  });

  it('rounding too coarse for the rate is ignored inside computeBidAsk', () => {
    // mid=3.6695, 1% symmetric -> half = 3.6695 * 0.01 / 2 = 0.0183475
    // raw bid = 3.6511525, raw ask = 3.6878475
    // 0 decimals: step 1 > 1% of ~3.65 -> guardrail ignores rounding entirely
    const r = computeBidAsk(3.6695, cfg({ spreadPercent: 1 }), { decimals: 0, mode: 'FLOOR' });
    expect(r.bid).toBeCloseTo(3.6511525, 7);
    expect(r.ask).toBeCloseTo(3.6878475, 7);
  });

  it('invariants: bid <= ask for any nonnegative config; rounding never moves bid up or ask down', () => {
    const configs: SpreadConfig[] = [
      cfg(),
      cfg({ spreadPercent: 0.5 }),
      cfg({ spreadPercent: 7 }),
      cfg({ spreadMode: 'ASYMMETRIC', buyMargin: 0.25, sellMargin: 4 }),
      cfg({ spreadType: 'FIXED', spreadFixed: 0.03 }),
      cfg({ spreadType: 'FIXED', spreadMode: 'ASYMMETRIC', buyMargin: 0.01, sellMargin: 0.2 }),
    ];
    const markets: (MarketSides | undefined)[] = [undefined, { bid: 6.7714, ask: 6.7724 }];
    const rounding: RoundingConfig = { decimals: 3, mode: 'FLOOR' };
    for (const c of configs) {
      for (const m of markets) {
        const raw = computeBidAsk(6.7719, c, null, m);
        expect(raw.bid).toBeLessThanOrEqual(raw.ask);
        const rounded = computeBidAsk(6.7719, c, rounding, m);
        expect(rounded.bid).toBeLessThanOrEqual(rounded.ask);
        expect(rounded.bid).toBeLessThanOrEqual(raw.bid); // FLOOR never raises bid
        expect(rounded.ask).toBeGreaterThanOrEqual(raw.ask); // CEIL never lowers ask
      }
    }
  });
});

describe('applyRounding', () => {
  it('FLOOR truncates at the configured decimals', () => {
    // floor(1.2345 * 100) / 100 = 1.23
    expect(applyRounding(1.2345, { decimals: 2, mode: 'FLOOR' })).toBeCloseTo(1.23, 10);
    // floor(3.66957 * 10000) / 10000 = 3.6695
    expect(applyRounding(3.66957, { decimals: 4, mode: 'FLOOR' })).toBeCloseTo(3.6695, 10);
  });

  it('CEIL rounds up at the configured decimals', () => {
    // ceil(1.2301 * 100) / 100 = 1.24
    expect(applyRounding(1.2301, { decimals: 2, mode: 'CEIL' })).toBeCloseTo(1.24, 10);
    // ceil(1234.00042 * 1000) / 1000 = 1234.001
    expect(applyRounding(1234.00042, { decimals: 3, mode: 'CEIL' })).toBeCloseTo(1234.001, 9);
  });

  it('passes value through when rounding config is missing or decimals is null', () => {
    expect(applyRounding(5.5)).toBe(5.5);
    expect(applyRounding(5.5, null)).toBe(5.5);
    expect(applyRounding(5.5, undefined)).toBe(5.5);
    expect(applyRounding(5.5, { decimals: null, mode: 'FLOOR' })).toBe(5.5);
  });

  it('passes value through when no mode is configured and none overridden', () => {
    expect(applyRounding(5.5, { decimals: 1, mode: null })).toBe(5.5);
  });

  it('ignores a decimals setting too coarse for the value (MAX_ROUNDING_STEP_RATIO guardrail)', () => {
    // step 10^0 = 1 vs 1% of 3.6695 = 0.036695 -> too coarse, return unrounded
    expect(applyRounding(3.6695, { decimals: 0, mode: 'FLOOR' })).toBe(3.6695);
    // step 0.1 vs 1% of 0.273 = 0.00273 -> too coarse
    expect(applyRounding(0.273, { decimals: 1, mode: 'CEIL' })).toBe(0.273);
  });

  it('passes nonpositive values through unrounded (guardrail cannot be measured)', () => {
    expect(applyRounding(0, { decimals: 2, mode: 'FLOOR' })).toBe(0);
    expect(applyRounding(-1.5, { decimals: 2, mode: 'FLOOR' })).toBe(-1.5);
  });

  it('modeOverride beats the config mode', () => {
    // config says CEIL, override FLOOR: floor(1.234 * 100)/100 = 1.23
    expect(applyRounding(1.234, { decimals: 2, mode: 'CEIL' }, 'FLOOR')).toBeCloseTo(1.23, 10);
    // config mode null, override CEIL: ceil(1.234 * 100)/100 = 1.24
    expect(applyRounding(1.234, { decimals: 2, mode: null }, 'CEIL')).toBeCloseTo(1.24, 10);
  });
});

describe('effectiveDecimals', () => {
  it('is inclusive at the 1% step-ratio boundary', () => {
    // value 1.0, 2 decimals: step 0.01 == 1% of 1.0 -> allowed per <=
    expect(effectiveDecimals(1.0, 2)).toBe(2);
    // value 100, 0 decimals: step 1 == 1% of 100 -> allowed
    expect(effectiveDecimals(100, 0)).toBe(0);
  });

  it('rejects steps coarser than 1% of the value', () => {
    // value 1.0, 1 decimal: step 0.1 > 0.01 -> null
    expect(effectiveDecimals(1.0, 1)).toBeNull();
    // value 99.5, 0 decimals: step 1 > 0.995 -> null
    expect(effectiveDecimals(99.5, 0)).toBeNull();
    // value 3.6695, 0 or 1 decimals -> null (steps 1 and 0.1 vs 0.036695)
    expect(effectiveDecimals(3.6695, 0)).toBeNull();
    expect(effectiveDecimals(3.6695, 1)).toBeNull();
  });

  it('accepts steps finer than 1% of the value', () => {
    expect(effectiveDecimals(1.0, 3)).toBe(3); // 0.001 <= 0.01
    expect(effectiveDecimals(3.6695, 2)).toBe(2); // 0.01 <= 0.036695
    expect(effectiveDecimals(1397, 0)).toBe(0); // 1 <= 13.97
  });

  it('returns null for null/undefined decimals and nonpositive/non-finite values', () => {
    expect(effectiveDecimals(5, null)).toBeNull();
    expect(effectiveDecimals(5, undefined)).toBeNull();
    expect(effectiveDecimals(0, 2)).toBeNull();
    expect(effectiveDecimals(-5, 2)).toBeNull();
    expect(effectiveDecimals(NaN, 2)).toBeNull();
    expect(effectiveDecimals(Infinity, 2)).toBeNull();
  });
});

describe('minDecimalsFor', () => {
  it('computes the fewest decimals keeping steps within 1% of the value', () => {
    // 1.0: ceil(-log10(0.01)) = 2
    expect(minDecimalsFor(1.0)).toBe(2);
    // 3.6695: ceil(-log10(0.036695)) = ceil(1.4354) = 2
    expect(minDecimalsFor(3.6695)).toBe(2);
    // 0.273: ceil(-log10(0.00273)) = ceil(2.5638) = 3
    expect(minDecimalsFor(0.273)).toBe(3);
    // 1397: ceil(-log10(13.97)) = ceil(-1.145) = -1 -> clamped to 0
    expect(minDecimalsFor(1397)).toBe(0);
    // 100: ceil(-log10(1)) = 0
    expect(minDecimalsFor(100)).toBe(0);
  });

  it('returns 0 for nonpositive and non-finite values', () => {
    expect(minDecimalsFor(0)).toBe(0);
    expect(minDecimalsFor(-5)).toBe(0);
    expect(minDecimalsFor(NaN)).toBe(0);
    expect(minDecimalsFor(Infinity)).toBe(0);
  });

  it('is consistent with effectiveDecimals: min decimals are usable, one fewer is not', () => {
    for (const v of [1.0, 3.6695, 0.273, 1397]) {
      const min = minDecimalsFor(v);
      expect(effectiveDecimals(v, min)).toBe(min);
      if (min > 0) expect(effectiveDecimals(v, min - 1)).toBeNull();
    }
  });
});

describe('validateSpread', () => {
  it('skips validation when there is no positive mid', () => {
    expect(validateSpread(0, cfg({ spreadPercent: -5 }))).toBeNull();
    expect(validateSpread(-3, cfg({ spreadPercent: 999 }))).toBeNull();
  });

  it('PERCENTAGE SYMMETRIC: rejects negative and >= 200, accepts just inside', () => {
    expect(validateSpread(100, cfg({ spreadPercent: -0.1 }))).toBe('Spread % cannot be negative.');
    expect(validateSpread(100, cfg({ spreadPercent: 200 }))).toBe('Spread % would make bid <= 0.');
    expect(validateSpread(100, cfg({ spreadPercent: 250 }))).toBe('Spread % would make bid <= 0.');
    expect(validateSpread(100, cfg({ spreadPercent: 199.99 }))).toBeNull();
    expect(validateSpread(100, cfg({ spreadPercent: 0 }))).toBeNull();
  });

  it('PERCENTAGE ASYMMETRIC: rejects negative margins and buy >= 100, accepts just inside', () => {
    const asym = (buy: number, sell: number) =>
      validateSpread(100, cfg({ spreadMode: 'ASYMMETRIC', buyMargin: buy, sellMargin: sell }));
    expect(asym(-1, 0)).toBe('Buy margin % cannot be negative.');
    expect(asym(0, -1)).toBe('Sell margin % cannot be negative.');
    expect(asym(100, 0)).toBe('Buy margin % would make bid <= 0.');
    expect(asym(150, 0)).toBe('Buy margin % would make bid <= 0.');
    // sell margin has no upper bound (ask can rise arbitrarily)
    expect(asym(99.99, 500)).toBeNull();
    expect(asym(0, 0)).toBeNull();
  });

  it('FIXED SYMMETRIC: rejects negative and fixed >= 2*mid, accepts just inside', () => {
    const sym = (fixed: number) =>
      validateSpread(50, cfg({ spreadType: 'FIXED', spreadFixed: fixed }));
    expect(sym(-1)).toBe('Fixed spread cannot be negative.');
    // 100 = 2 * 50 -> bid = 50 - 50 = 0
    expect(sym(100)).toContain('too large for mid=50');
    expect(sym(99.99)).toBeNull();
    expect(sym(0)).toBeNull();
  });

  it('FIXED ASYMMETRIC: rejects negative offsets and buy >= mid, accepts just inside', () => {
    const asym = (buy: number, sell: number) =>
      validateSpread(
        50,
        cfg({ spreadType: 'FIXED', spreadMode: 'ASYMMETRIC', buyMargin: buy, sellMargin: sell }),
      );
    expect(asym(-1, 0)).toBe('Fixed offsets cannot be negative.');
    expect(asym(0, -1)).toBe('Fixed offsets cannot be negative.');
    expect(asym(50, 0)).toContain('too large for mid=50');
    // sell offset has no upper bound
    expect(asym(49.99, 1000)).toBeNull();
    expect(asym(0, 0)).toBeNull();
  });
});

describe('validateRounding', () => {
  it('accepts null/undefined decimals', () => {
    expect(validateRounding(100, null)).toBeNull();
    expect(validateRounding(100, undefined)).toBeNull();
  });

  it('rejects non-integer, negative, and > MAX_ROUNDING_DECIMALS', () => {
    const rangeMsg = `Rounding must be a whole number of decimals between 0 and ${MAX_ROUNDING_DECIMALS}.`;
    expect(validateRounding(100, 2.5)).toBe(rangeMsg);
    expect(validateRounding(100, -1)).toBe(rangeMsg);
    expect(validateRounding(100, MAX_ROUNDING_DECIMALS + 1)).toBe(rangeMsg);
    expect(validateRounding(100, MAX_ROUNDING_DECIMALS)).toBeNull();
  });

  it('accepts any in-range decimals when mid is not positive', () => {
    expect(validateRounding(0, 5)).toBeNull();
    expect(validateRounding(-3, 5)).toBeNull();
  });

  it('rejects decimals too coarse for the mid, suggesting the minimum', () => {
    const msg = validateRounding(3.6695, 0);
    expect(msg).toContain('too coarse for a rate of 3.6695');
    expect(msg).toContain('Use 2 or more');
    // singular form for 1 decimal
    const msg1 = validateRounding(1.0, 1);
    expect(msg1).toContain('Rounding to 1 decimal is too coarse');
    expect(msg1).toContain('Use 2 or more');
  });

  it('is inclusive at the boundary: step exactly 1% of mid is fine', () => {
    expect(validateRounding(1.0, 2)).toBeNull(); // 0.01 == 1% of 1.0
    expect(validateRounding(100, 0)).toBeNull(); // 1 == 1% of 100
    expect(validateRounding(3.6695, 2)).toBeNull();
  });
});

describe('applyLevelPoints', () => {
  it('widens both sides by mid*pct/100/2', () => {
    // bid=99, ask=101, mid=100, pct=1 -> offset = 100 * 0.01 / 2 = 0.5
    // newBid = 98.5, newAsk = 101.5, spread = 3
    const r = applyLevelPoints(99, 101, 100, 1);
    expect(r.bid).toBeCloseTo(98.5, 10);
    expect(r.ask).toBeCloseTo(101.5, 10);
    expect(r.spread).toBeCloseTo(3, 10);
  });

  it('applies FLOOR to bid and CEIL to ask when rounding is configured', () => {
    // bid=9.933, ask=10.067, mid=10, pct=1 -> offset = 0.05
    // newBid = 9.883 -> floor@2 = 9.88; newAsk = 10.117 -> ceil@2 = 10.12
    const r = applyLevelPoints(9.933, 10.067, 10, 1, { decimals: 2, mode: null });
    expect(r.bid).toBeCloseTo(9.88, 10);
    expect(r.ask).toBeCloseTo(10.12, 10);
    // 10.12 - 9.88 = 0.24
    expect(r.spread).toBeCloseTo(0.24, 10);
  });

  it('passes through on zero or negative pct (no rounding applied either)', () => {
    expect(applyLevelPoints(99, 101, 100, 0)).toEqual({ bid: 99, ask: 101, spread: 2 });
    expect(applyLevelPoints(99, 101, 100, -2, { decimals: 0, mode: 'FLOOR' })).toEqual({
      bid: 99,
      ask: 101,
      spread: 2,
    });
  });
});

describe('resolveBaseSides', () => {
  it('collapses to mid when market is missing', () => {
    expect(resolveBaseSides(100)).toEqual({ bid: 100, ask: 100 });
    expect(resolveBaseSides(100, null)).toEqual({ bid: 100, ask: 100 });
    expect(resolveBaseSides(100, undefined)).toEqual({ bid: 100, ask: 100 });
  });

  it('collapses to mid when either side is null', () => {
    expect(resolveBaseSides(100, { bid: null, ask: 101 })).toEqual({ bid: 100, ask: 100 });
    expect(resolveBaseSides(100, { bid: 99, ask: null })).toEqual({ bid: 100, ask: 100 });
    expect(resolveBaseSides(100, { bid: null, ask: null })).toEqual({ bid: 100, ask: 100 });
  });

  it('collapses to mid when either side is nonpositive', () => {
    expect(resolveBaseSides(100, { bid: 0, ask: 101 })).toEqual({ bid: 100, ask: 100 });
    expect(resolveBaseSides(100, { bid: 99, ask: 0 })).toEqual({ bid: 100, ask: 100 });
    expect(resolveBaseSides(100, { bid: -1, ask: 101 })).toEqual({ bid: 100, ask: 100 });
    expect(resolveBaseSides(100, { bid: 99, ask: -1 })).toEqual({ bid: 100, ask: 100 });
  });

  it('collapses to mid when the market is inverted (bid > ask)', () => {
    expect(resolveBaseSides(100, { bid: 102, ask: 101 })).toEqual({ bid: 100, ask: 100 });
  });

  it('keeps valid market sides, including bid == ask', () => {
    expect(resolveBaseSides(100, { bid: 99, ask: 101 })).toEqual({ bid: 99, ask: 101 });
    expect(resolveBaseSides(100, { bid: 99.5, ask: 99.5 })).toEqual({ bid: 99.5, ask: 99.5 });
  });
});

describe('spreadConfigFromRow', () => {
  it('returns defaults for an empty row', () => {
    expect(spreadConfigFromRow({})).toEqual({
      spreadType: 'PERCENTAGE',
      spreadMode: 'SYMMETRIC',
      fixedUnit: 'RAW',
      spreadPercent: 0,
      spreadFixed: 0,
      buyMargin: 0,
      sellMargin: 0,
    });
  });

  it('maps known enum strings and coerces numeric strings', () => {
    const r = spreadConfigFromRow({
      spreadType: 'FIXED',
      spreadMode: 'ASYMMETRIC',
      spreadFixed: '0.5',
      buyMargin: '1.5',
      sellMargin: 2,
    });
    expect(r.spreadType).toBe('FIXED');
    expect(r.spreadMode).toBe('ASYMMETRIC');
    expect(r.spreadFixed).toBe(0.5);
    expect(r.buyMargin).toBe(1.5);
    expect(r.sellMargin).toBe(2);
  });

  it('falls back to PERCENTAGE/SYMMETRIC for unknown enum strings', () => {
    const r = spreadConfigFromRow({ spreadType: 'bogus', spreadMode: 'garbage' });
    expect(r.spreadType).toBe('PERCENTAGE');
    expect(r.spreadMode).toBe('SYMMETRIC');
  });

  it('uses legacy spreadValue only when spreadPercent is 0', () => {
    expect(spreadConfigFromRow({ spreadPercent: 0, spreadValue: 2.5 }).spreadPercent).toBe(2.5);
    expect(spreadConfigFromRow({ spreadValue: 2.5 }).spreadPercent).toBe(2.5);
    expect(spreadConfigFromRow({ spreadPercent: null, spreadValue: '3' }).spreadPercent).toBe(3);
    // spreadPercent set -> legacy value ignored
    expect(spreadConfigFromRow({ spreadPercent: 1, spreadValue: 2.5 }).spreadPercent).toBe(1);
  });

  it('coerces non-numeric inputs to 0 and ignores non-numeric legacy values', () => {
    const r = spreadConfigFromRow({
      spreadPercent: 'abc',
      spreadFixed: 'nope',
      buyMargin: null,
      sellMargin: undefined,
      spreadValue: 'xyz',
    });
    expect(r.spreadPercent).toBe(0);
    expect(r.spreadFixed).toBe(0);
    expect(r.buyMargin).toBe(0);
    expect(r.sellMargin).toBe(0);
  });
});
