/** Supported currency pairs and metadata */
export interface PairMeta {
  base: string;
  quote: string;
  label: string;
  quoteName: string;
  type: 'fiat' | 'crypto' | 'commodity';
}

export const SUPPORTED_PAIRS: PairMeta[] = [
  { base: 'USD', quote: 'BRL', label: 'USD/BRL', quoteName: 'Brazilian Real', type: 'fiat' },
  { base: 'USD', quote: 'CNY', label: 'USD/CNY', quoteName: 'Chinese Yuan', type: 'fiat' },
  { base: 'USD', quote: 'EUR', label: 'USD/EUR', quoteName: 'European Union Euro', type: 'fiat' },
  { base: 'USD', quote: 'PYG', label: 'USD/PYG', quoteName: 'Paraguayan Guarani', type: 'fiat' },
  { base: 'USD', quote: 'USDT', label: 'USD/USDT', quoteName: 'Tether Stablecoin', type: 'crypto' },
  { base: 'USD', quote: 'AED', label: 'USD/AED', quoteName: 'UAE Dirham', type: 'fiat' },
  { base: 'USD', quote: 'ARS', label: 'USD/ARS', quoteName: 'Argentine Peso', type: 'fiat' },
  { base: 'USD', quote: 'XAU', label: 'XAU/USD', quoteName: 'Spot Gold / Troy Ounce', type: 'commodity' },
  { base: 'USD', quote: 'XAUG', label: 'XAUG/USD', quoteName: 'Gold / Gram', type: 'commodity' },
];

/** Troy ounce to grams conversion factor */
export const TROY_OZ_TO_GRAMS = 31.1034768;

/** Default base currency */
export const DEFAULT_BASE = 'USD';

/** Valid base currencies for presentation layer (excludes commodities) */
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

/** Multi-source refresh interval (default 30s) */
export const MULTI_SOURCE_REFRESH_MS = parseInt(process.env.MULTI_SOURCE_REFRESH_MS ?? '30000', 10);

/** Store rate modes */
export type StoreRateMode = 'AUTO_AVG' | 'MANUAL_SOURCE' | 'CUSTOM_VALUE' | 'LOCKED';

/** Outlier threshold — remove values deviating more than this % from median */
export const OUTLIER_THRESHOLD_PCT = 15;

/** Multi-source target currencies (what we fetch from external sources) */
export const MULTI_SOURCE_QUOTES = ['BRL', 'CNY', 'EUR', 'PYG', 'USDT', 'AED', 'ARS', 'XAU'];
