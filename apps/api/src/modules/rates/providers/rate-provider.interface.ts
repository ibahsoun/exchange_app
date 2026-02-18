/**
 * Adapter interface for rate data providers.
 * Implement this to add new rate sources (XE, Open Exchange Rates, etc).
 */
export interface RateQuote {
  base: string;
  quote: string;
  bid: number;
  ask: number;
  mid: number;
  spread: number;
  timestamp: Date;
}

export interface RateProvider {
  /** Unique provider name, matches RateSource.name in DB */
  readonly name: string;

  /** Fetch all supported pairs */
  fetchRates(base: string): Promise<RateQuote[]>;

  /** Which quote currencies this provider can supply */
  getSupportedQuotes(): string[];
}
