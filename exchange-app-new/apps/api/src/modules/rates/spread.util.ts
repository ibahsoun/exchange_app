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

/** Apply rounding to a value. If mode is not specified, uses the config's mode. */
export function applyRounding(
  value: number,
  rounding?: RoundingConfig | null,
  modeOverride?: RoundingMode,
): number {
  if (!rounding || rounding.decimals == null) return value;
  const mode = modeOverride ?? rounding.mode;
  if (!mode) return value;
  const factor = Math.pow(10, rounding.decimals);
  if (mode === 'FLOOR') return Math.floor(value * factor) / factor;
  return Math.ceil(value * factor) / factor;
}

export interface BidAskResult {
  bid: number;
  ask: number;
  spread: number;
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

export function computeBidAsk(
  mid: number,
  config: SpreadConfig,
  rounding?: RoundingConfig | null,
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

  let bid = Number((mid - bidOffset).toPrecision(8));
  let ask = Number((mid + askOffset).toPrecision(8));

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
