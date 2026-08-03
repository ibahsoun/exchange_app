/** Supported currency pairs and metadata */
export interface PairMeta {
  base: string;
  quote: string;
  label: string;
  quoteName: string;
  type: 'fiat' | 'crypto' | 'commodity';
}

/**
 * Which currencies the app trades is configured in Settings (the Currency table);
 * `MultiSourceService.getPairs()` reads it and builds pair metadata from there.
 *
 * The list below is only the fallback used when that table cannot be read or is
 * empty — keep it in step with the seeded currencies.
 */
export const SUPPORTED_PAIRS: PairMeta[] = [
  { base: 'USD', quote: 'CNY', label: 'USD/CNY', quoteName: 'Chinese Yuan', type: 'fiat' },
  { base: 'USD', quote: 'BRL', label: 'USD/BRL', quoteName: 'Brazilian Real', type: 'fiat' },
  { base: 'USD', quote: 'USDT', label: 'USD/USDT', quoteName: 'Tether', type: 'crypto' },
  { base: 'USD', quote: 'AED', label: 'USD/AED', quoteName: 'Emirates Dirham', type: 'fiat' },
];

/** Non-fiat codes. Anything not listed is treated as fiat. */
export const CURRENCY_TYPES: Record<string, PairMeta['type']> = {
  USDT: 'crypto',
  BTC: 'crypto',
  ETH: 'crypto',
  XAU: 'commodity',
  XAUG: 'commodity',
  XAG: 'commodity',
};

/** Build pair metadata for a currency configured in Settings. */
export function pairMetaFor(code: string, name?: string): PairMeta {
  const type = CURRENCY_TYPES[code] ?? 'fiat';
  return {
    base: DEFAULT_BASE,
    quote: code,
    // Commodities are conventionally quoted the other way round (XAU/USD).
    label: type === 'commodity' ? `${code}/${DEFAULT_BASE}` : `${DEFAULT_BASE}/${code}`,
    quoteName: name ?? code,
    type,
  };
}

/** One customer-fee "point" moves the rate by this much */
export const FEE_POINT_VALUE = 0.01;

/**
 * The only pairs priced by the live feed. Every other configured pair is
 * priced manually by the operator on the Live Rates page.
 */
export const LIVE_FEED_QUOTES = ['BRL'];

/** Troy ounce to grams conversion factor */
export const TROY_OZ_TO_GRAMS = 31.1034768;

/** Default base currency */
export const DEFAULT_BASE = 'USD';

/** Fallback base currencies for the presentation layer (excludes commodities) */
export const VALID_BASES: string[] = [
  'USD',
  ...SUPPORTED_PAIRS.filter((p) => p.type !== 'commodity').map((p) => p.quote),
];

/** Refresh interval in milliseconds (configurable via env) */
export const REFRESH_INTERVAL_MS = parseInt(process.env.RATE_REFRESH_MS ?? '60000', 10);

/** WebSocket broadcast interval */
export const WS_BROADCAST_INTERVAL_MS = parseInt(process.env.WS_BROADCAST_MS ?? '3000', 10);

/** Rate provider token for DI */
export const RATE_PROVIDER = 'RATE_PROVIDER';

/** Multi-source provider tokens */
export const MULTI_SOURCE_PROVIDERS = 'MULTI_SOURCE_PROVIDERS';

/** Shared live-market API client (single upstream connection for all consumers) */
export const LIVE_MARKET_CLIENT = 'LIVE_MARKET_CLIENT';

/** Multi-source refresh interval (default 30s) */
export const MULTI_SOURCE_REFRESH_MS = parseInt(process.env.MULTI_SOURCE_REFRESH_MS ?? '30000', 10);

/** Store rate modes */
export type StoreRateMode = 'AUTO_AVG' | 'MANUAL_SOURCE' | 'CUSTOM_VALUE' | 'LOCKED';

/** Outlier threshold — remove values deviating more than this % from median */
export const OUTLIER_THRESHOLD_PCT = 15;

/**
 * Fallback fetch list. The live list comes from Settings via
 * `MultiSourceService.getActiveQuotes()`.
 */
export const MULTI_SOURCE_QUOTES = SUPPORTED_PAIRS.filter((p) => p.quote !== 'XAUG').map(
  (p) => p.quote,
);
