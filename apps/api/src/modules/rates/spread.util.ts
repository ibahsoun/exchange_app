export type SpreadType = 'PERCENTAGE' | 'FIXED';
export type SpreadMode = 'SYMMETRIC' | 'ASYMMETRIC';
export type FixedUnit = 'RAW' | 'PIPS';
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

/** Standard pip size for most FX pairs (4th decimal). JPY-like pairs use 0.01. */
export function pipSizeForQuote(quote: string): number {
  const jpyLike = ['JPY', 'KRW', 'HUF'];
  return jpyLike.includes(quote) ? 0.01 : 0.0001;
}

/** Convert PIPS to raw quote-currency units */
export function pipsToRaw(pips: number, quote: string): number {
  return pips * pipSizeForQuote(quote);
}

/**
 * Resolve the effective fixed value (RAW) from config + quote.
 * If fixedUnit='PIPS', converts to raw using pipSize.
 */
function resolveFixed(value: number, config: SpreadConfig, quote: string): number {
  if (config.fixedUnit === 'PIPS') return pipsToRaw(value, quote);
  return value;
}

export interface RoundingConfig {
  decimals: number | null;
  mode: RoundingMode | null;
}

/** Apply rounding to a value. Returns as-is if no rounding configured. */
export function applyRounding(
  value: number,
  rounding?: RoundingConfig | null,
): number {
  if (!rounding || rounding.decimals == null || rounding.mode == null) return value;
  const factor = Math.pow(10, rounding.decimals);
  if (rounding.mode === 'FLOOR') return Math.floor(value * factor) / factor;
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
  quote = '',
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
    const buyRaw = resolveFixed(config.buyMargin, config, quote);
    const sellRaw = resolveFixed(config.sellMargin, config, quote);
    if (buyRaw < 0 || sellRaw < 0) return 'Fixed offsets cannot be negative.';
    if (buyRaw >= mid) {
      return `Fixed buy offset (${buyRaw}) is too large for mid=${mid}. It would make bid <= 0.`;
    }
  } else {
    const fixedRaw = resolveFixed(config.spreadFixed, config, quote);
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
  quote = '',
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
      bidOffset = resolveFixed(config.buyMargin, config, quote);
      askOffset = resolveFixed(config.sellMargin, config, quote);
    } else {
      const half = resolveFixed(config.spreadFixed, config, quote) / 2;
      bidOffset = half;
      askOffset = half;
    }
  }

  if (bidOffset <= 0 && askOffset <= 0) {
    return { bid: mid, ask: mid, spread: 0 };
  }

  let bid = Number((mid - bidOffset).toPrecision(8));
  let ask = Number((mid + askOffset).toPrecision(8));

  bid = applyRounding(bid, rounding);
  ask = applyRounding(ask, rounding);

  return {
    bid,
    ask,
    spread: Number((ask - bid).toPrecision(6)),
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
  const fixedUnit = (sr.fixedUnit === 'PIPS' ? 'PIPS' : 'RAW') as FixedUnit;

  let spreadPercent = Number(sr.spreadPercent) || 0;
  const spreadFixed = Number(sr.spreadFixed) || 0;
  const buyMargin = Number(sr.buyMargin) || 0;
  const sellMargin = Number(sr.sellMargin) || 0;

  if (spreadPercent === 0 && Number(sr.spreadValue) > 0) {
    spreadPercent = Number(sr.spreadValue);
  }

  return { spreadType, spreadMode, fixedUnit, spreadPercent, spreadFixed, buyMargin, sellMargin };
}
