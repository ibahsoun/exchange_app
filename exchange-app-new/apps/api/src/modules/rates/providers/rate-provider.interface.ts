/**
 * Adapter interface for rate data providers.
 * Implement this to add new rate sources (Open Exchange Rates, etc).
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

/**
 * Extended interface for multi-source rate comparison.
 * Providers may return mid-only (bid/ask null) and track latency.
 */
export interface MultiSourceQuote {
  base: string;
  quote: string;
  bid: number | null;
  ask: number | null;
  mid: number;
  timestamp: Date;
}

export interface MultiSourceResult {
  quotes: MultiSourceQuote[];
  latencyMs: number;
}

export interface MultiSourceProvider {
  readonly name: string;
  readonly label: string;
  fetchRates(base: string, quotes: string[]): Promise<MultiSourceResult>;
}
