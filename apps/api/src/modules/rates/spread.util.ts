export type SpreadType = 'PERCENTAGE' | 'FIXED';
export type SpreadMode = 'SYMMETRIC' | 'ASYMMETRIC';
export type FixedUnit = 'RAW';
export type RoundingMode = 'FLOOR' | 'CEIL';

export interface SpreadConfig {
  spreadType: SpreadType;
  spreadMode: SpreadMode;
  fixedUnit: FixedUnit;
  spreadPercent: number;
  spreadFixed: number;
  buyMargin: number;
  sellMargin: number;
}

export const DEFAULT_SPREAD_CONFIG: SpreadConfig = {
  spreadType: 'PERCENTAGE',
  spreadMode: 'SYMMETRIC',
  fixedUnit: 'RAW',
  spreadPercent: 0,
  spreadFixed: 0,
  buyMargin: 0,
  sellMargin: 0,
};

export const MAX_SPREAD_PERCENT = 100;

/** Resolve the effective fixed value (always RAW). */
function resolveFixed(value: number): number {
  return value;
}

export interface RoundingConfig {
  decimals: number | null;
  mode: RoundingMode | null;
}

export const MAX_ROUNDING_DECIMALS = 8;

/**
 * How much of the rate a single rounding step may swallow.
 *
 * Rounding is a quoting convention, so it only means anything against the
 * magnitude of the rate it is applied to. Whole units are right for USD/ARS at
 * 1397 (a 1-unit step is 0.07% of the rate) and ruinous for USD/AED at 3.6695,
 * where the same setting deals 3 / 4 — a 27% spread nobody configured on
 * purpose. Re-basing makes it worse: AED/USD is 0.273, so 0 dp deals 0 / 1.
 */
export const MAX_ROUNDING_STEP_RATIO = 0.01;

/**
 * The decimals actually usable for `value`, or null when the configured ones
 * would distort it past MAX_ROUNDING_STEP_RATIO.
 */
export function effectiveDecimals(value: number, decimals: number | null | undefined): number | null {
  if (decimals == null || !Number.isFinite(value) || value <= 0) return null;
  return Math.pow(10, -decimals) <= value * MAX_ROUNDING_STEP_RATIO ? decimals : null;
}

/** Fewest decimals that keep a rate of `value` quotable. */
export function minDecimalsFor(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.max(0, Math.ceil(-Math.log10(value * MAX_ROUNDING_STEP_RATIO)));
}

/** Apply rounding to a value. If mode is not specified, uses the config's mode. */
export function applyRounding(
  value: number,
  rounding?: RoundingConfig | null,
  modeOverride?: RoundingMode,
): number {
  if (!rounding || rounding.decimals == null) return value;
  const mode = modeOverride ?? rounding.mode;
  if (!mode) return value;

  // Ignore a setting too coarse for this rate rather than quoting a number the
  // operator would never deal at.
  const decimals = effectiveDecimals(value, rounding.decimals);
  if (decimals == null) return value;

  const factor = Math.pow(10, decimals);
  if (mode === 'FLOOR') return Math.floor(value * factor) / factor;
  return Math.ceil(value * factor) / factor;
}

export interface BidAskResult {
  bid: number;
  ask: number;
  spread: number;
}

/** The two prices the feed itself quotes, before any store margin. */
export interface MarketSides {
  bid: number | null;
  ask: number | null;
}

/**
 * The prices the store margin is measured from.
 *
 * The market already quotes two sides (USD/CNY 6.7714 / 6.7724), so the margin
 * widens that spread rather than replacing it. Only when the feed gives no
 * usable sides — a locked or operator-set mid, a source that publishes a single
 * price — do both sides collapse onto the mid.
 */
export function resolveBaseSides(mid: number, market?: MarketSides | null): { bid: number; ask: number } {
  const bid = market?.bid ?? null;
  const ask = market?.ask ?? null;

  if (bid != null && ask != null && bid > 0 && ask > 0 && bid <= ask) {
    return { bid, ask };
  }
  return { bid: mid, ask: mid };
}

/**
 * Validate spread config against a mid rate.
 * Returns null if valid, or an error message string if invalid.
 */
export function validateSpread(
  mid: number,
  config: SpreadConfig,
): string | null {
  if (!mid || mid <= 0) return null; // nothing to validate without a mid

  if (config.spreadType === 'PERCENTAGE') {
    if (config.spreadMode === 'ASYMMETRIC') {
      if (config.buyMargin < 0) return 'Buy margin % cannot be negative.';
      if (config.sellMargin < 0) return 'Sell margin % cannot be negative.';
      if (config.buyMargin >= 100) return 'Buy margin % would make bid <= 0.';
    } else {
      if (config.spreadPercent < 0) return 'Spread % cannot be negative.';
      if (config.spreadPercent >= 200) return 'Spread % would make bid <= 0.';
    }
    return null;
  }

  // FIXED validation
  if (config.spreadMode === 'ASYMMETRIC') {
    const buyRaw = resolveFixed(config.buyMargin);
    const sellRaw = resolveFixed(config.sellMargin);
    if (buyRaw < 0 || sellRaw < 0) return 'Fixed offsets cannot be negative.';
    if (buyRaw >= mid) {
      return `Fixed buy offset (${buyRaw}) is too large for mid=${mid}. It would make bid <= 0.`;
    }
  } else {
    const fixedRaw = resolveFixed(config.spreadFixed);
    if (fixedRaw < 0) return 'Fixed spread cannot be negative.';
    if (fixedRaw >= 2 * mid) {
      return `Fixed spread (${fixedRaw}) is too large for mid=${mid}. It would make bid <= 0.`;
    }
  }

  return null;
}

/**
 * Customer-facing bid/ask for a pair.
 *
 * @param market The feed's own two sides. Passing them keeps the market spread
 *   visible when the store margin is zero; omitting them prices both sides off
 *   the mid, as an operator-set rate should be.
 */
/**
 * Validate rounding against the rate it will be applied to.
 * Returns null if valid, or an error message string if invalid.
 */
export function validateRounding(mid: number, decimals: number | null | undefined): string | null {
  if (decimals == null) return null;
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_ROUNDING_DECIMALS) {
    return `Rounding must be a whole number of decimals between 0 and ${MAX_ROUNDING_DECIMALS}.`;
  }
  if (!mid || mid <= 0) return null; // nothing to measure it against yet

  if (effectiveDecimals(mid, decimals) == null) {
    const min = minDecimalsFor(mid);
    return (
      `Rounding to ${decimals} decimal${decimals === 1 ? '' : 's'} is too coarse for a rate of ${mid} — ` +
      `each step moves the quote by more than ${MAX_ROUNDING_STEP_RATIO * 100}%. Use ${min} or more.`
    );
  }
  return null;
}

export function computeBidAsk(
  mid: number,
  config: SpreadConfig,
  rounding?: RoundingConfig | null,
  market?: MarketSides | null,
): BidAskResult {
  if (!mid) return { bid: mid, ask: mid, spread: 0 };

  let bidOffset: number;
  let askOffset: number;

  if (config.spreadType === 'PERCENTAGE') {
    if (config.spreadMode === 'ASYMMETRIC') {
      bidOffset = mid * (config.buyMargin / 100);
      askOffset = mid * (config.sellMargin / 100);
    } else {
      const half = mid * (config.spreadPercent / 100) / 2;
      bidOffset = half;
      askOffset = half;
    }
  } else {
    if (config.spreadMode === 'ASYMMETRIC') {
      bidOffset = resolveFixed(config.buyMargin);
      askOffset = resolveFixed(config.sellMargin);
    } else {
      const half = resolveFixed(config.spreadFixed) / 2;
      bidOffset = half;
      askOffset = half;
    }
  }

  // Offsets are always sized off the mid; they are applied to the market's own
  // sides so a 0% margin leaves the feed's bid/ask intact instead of flattening
  // both to the mid.
  const sides = resolveBaseSides(mid, market);

  let bid = Number((sides.bid - bidOffset).toPrecision(8));
  let ask = Number((sides.ask + askOffset).toPrecision(8));

  // Automatically: FLOOR for bid (favour the house), CEIL for ask
  bid = applyRounding(bid, rounding, 'FLOOR');
  ask = applyRounding(ask, rounding, 'CEIL');

  return {
    bid,
    ask,
    spread: Number((ask - bid).toPrecision(6)),
  };
}

/**
 * Apply customer-level points on top of spread-adjusted bid/ask.
 * This widens the spread further by the given percentage of mid.
 */
export function applyLevelPoints(
  bid: number,
  ask: number,
  mid: number,
  levelPointsPercent: number,
  rounding?: RoundingConfig | null,
): BidAskResult {
  if (!levelPointsPercent || levelPointsPercent <= 0) {
    return { bid, ask, spread: Number((ask - bid).toPrecision(6)) };
  }
  const offset = mid * (levelPointsPercent / 100) / 2;
  let newBid = Number((bid - offset).toPrecision(8));
  let newAsk = Number((ask + offset).toPrecision(8));
  newBid = applyRounding(newBid, rounding, 'FLOOR');
  newAsk = applyRounding(newAsk, rounding, 'CEIL');
  return {
    bid: newBid,
    ask: newAsk,
    spread: Number((newAsk - newBid).toPrecision(6)),
  };
}

/** Build a SpreadConfig from a Prisma StoreRate row (handles backward compat) */
export function spreadConfigFromRow(sr: {
  spreadType?: string | null;
  spreadMode?: string | null;
  fixedUnit?: string | null;
  spreadPercent?: unknown;
  spreadFixed?: unknown;
  buyMargin?: unknown;
  sellMargin?: unknown;
  spreadValue?: unknown;
}): SpreadConfig {
  const spreadType = (sr.spreadType === 'FIXED' ? 'FIXED' : 'PERCENTAGE') as SpreadType;
  const spreadMode = (sr.spreadMode === 'ASYMMETRIC' ? 'ASYMMETRIC' : 'SYMMETRIC') as SpreadMode;
  const fixedUnit = 'RAW' as FixedUnit;

  let spreadPercent = Number(sr.spreadPercent) || 0;
  const spreadFixed = Number(sr.spreadFixed) || 0;
  const buyMargin = Number(sr.buyMargin) || 0;
  const sellMargin = Number(sr.sellMargin) || 0;

  if (spreadPercent === 0 && Number(sr.spreadValue) > 0) {
    spreadPercent = Number(sr.spreadValue);
  }

  return { spreadType, spreadMode, fixedUnit, spreadPercent, spreadFixed, buyMargin, sellMargin };
}
