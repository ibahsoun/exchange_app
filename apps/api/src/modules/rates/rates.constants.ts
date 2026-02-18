/** Supported currency pairs and metadata */
export interface PairMeta {
  base: string;
  quote: string;
  label: string;
  quoteName: string;
  type: 'fiat' | 'crypto' | 'commodity';
}

export const SUPPORTED_PAIRS: PairMeta[] = [
  { base: 'USD', quote: 'EUR', label: 'USD/EUR', quoteName: 'European Union Euro', type: 'fiat' },
  { base: 'USD', quote: 'CNY', label: 'USD/CNY', quoteName: 'Chinese Yuan', type: 'fiat' },
  { base: 'USD', quote: 'BRL', label: 'USD/BRL', quoteName: 'Brazilian Real', type: 'fiat' },
  { base: 'USD', quote: 'PYG', label: 'USD/PYG', quoteName: 'Paraguayan Guarani', type: 'fiat' },
  { base: 'USD', quote: 'AED', label: 'USD/AED', quoteName: 'UAE Dirham', type: 'fiat' },
  { base: 'USD', quote: 'ARS', label: 'USD/ARS', quoteName: 'Argentine Peso', type: 'fiat' },
  { base: 'USD', quote: 'GBP', label: 'USD/GBP', quoteName: 'British Pound', type: 'fiat' },
  { base: 'USD', quote: 'JPY', label: 'USD/JPY', quoteName: 'Japanese Yen', type: 'fiat' },
  { base: 'USD', quote: 'CHF', label: 'USD/CHF', quoteName: 'Swiss Franc', type: 'fiat' },
  { base: 'USD', quote: 'CAD', label: 'USD/CAD', quoteName: 'Canadian Dollar', type: 'fiat' },
  { base: 'USD', quote: 'AUD', label: 'USD/AUD', quoteName: 'Australian Dollar', type: 'fiat' },
  { base: 'USD', quote: 'USDT', label: 'USD/USDT', quoteName: 'Tether Stablecoin', type: 'crypto' },
  { base: 'USD', quote: 'XAU', label: 'XAU/USD', quoteName: 'Spot Gold / Troy Ounce', type: 'commodity' },
];

/** Troy ounce to grams conversion factor */
export const TROY_OZ_TO_GRAMS = 31.1034768;

/** Default base currency */
export const DEFAULT_BASE = 'USD';

/** Refresh interval in milliseconds (configurable via env) */
export const REFRESH_INTERVAL_MS = parseInt(process.env.RATE_REFRESH_MS ?? '60000', 10);

/** WebSocket broadcast interval */
export const WS_BROADCAST_INTERVAL_MS = parseInt(process.env.WS_BROADCAST_MS ?? '3000', 10);

/** Rate provider token for DI */
export const RATE_PROVIDER = 'RATE_PROVIDER';
