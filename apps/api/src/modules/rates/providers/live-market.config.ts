/**
 * Configuration for the primary live-rate (trading) API.
 *
 * This app now uses ONE external rate source. Everything vendor-specific lives
 * in this file and in `live-market.provider.ts` — nothing else in the codebase
 * should need to know which vendor is behind it.
 *
 * All values are env-driven so the same build works against sandbox/production
 * endpoints without a code change.
 */

/** How the API expects credentials to be presented. */
export type AuthScheme = 'none' | 'query' | 'bearer' | 'header' | 'basic';

/**
 * How a pair of ours maps onto a vendor symbol.
 *
 * Our internal pairs are always quoted as USD -> QUOTE (how many QUOTE per 1 USD).
 * Trading APIs usually quote majors and metals the other way round (EUR/USD,
 * XAU/USD), so `invert: true` means "the vendor price is USD per unit of QUOTE,
 * flip it".
 */
export interface DirectSymbolSpec {
  /** Vendor's symbol/ticker, e.g. "usdbrl", "EUR/USD", "FX:EURUSD" */
  symbol: string;
  /** True when the vendor quotes QUOTE/USD instead of USD/QUOTE */
  invert: boolean;
}

/**
 * A pair the vendor does not publish directly, computed from symbols that do
 * exist. Everything on top is multiplied, everything underneath divides, and the
 * shared currencies cancel:
 *
 *   USDT per USD = USDBRL / USDTBRL                    (BRL cancels)
 *   AED  per USD = USDTAED * USDBRL / USDTBRL          (BRL and USDT cancel)
 */
export interface DerivedSymbolSpec {
  derive: {
    /** Vendor symbol(s) on top; several are multiplied together */
    numerator: string | string[];
    /** Vendor symbol(s) underneath */
    denominator: string | string[];
  };
  /** Flip the computed cross, for when the result comes out as QUOTE/USD */
  invert?: boolean;
}

export type SymbolSpec = DirectSymbolSpec | DerivedSymbolSpec;

export function isDerived(spec: SymbolSpec): spec is DerivedSymbolSpec {
  return 'derive' in spec;
}

/** Normalise a `string | string[]` leg to an array. */
export function legSymbols(leg: string | string[]): string[] {
  return Array.isArray(leg) ? leg : [leg];
}

/** Every vendor symbol a spec depends on. */
export function specSymbols(spec: SymbolSpec): string[] {
  return isDerived(spec)
    ? [...legSymbols(spec.derive.numerator), ...legSymbols(spec.derive.denominator)]
    : [spec.symbol];
}

/**
 * How quotes are pulled:
 *   'per-pair' — GET {baseUrl}{ratesPath}/{symbol}, one request per symbol (documented)
 *   'stats'    — GET {baseUrl}{ratesPath}/stats, every pair in one request
 */
export type FetchMode = 'per-pair' | 'stats';

export interface LiveMarketConfig {
  /** Source key persisted in RateSource.name and sent to the frontend */
  name: string;
  /** Human-readable label shown in the UI */
  label: string;
  /** e.g. https://platform.betaserver.dev */
  baseUrl: string;
  /** Path prefix of the quotes endpoints, e.g. /fxrates */
  ratesPath: string;
  fetchMode: FetchMode;
  apiKey: string;
  apiSecret: string;
  authScheme: AuthScheme;
  /** Query-param name (authScheme 'query') or header name (authScheme 'header') */
  authKeyName: string;
  /** Abort the HTTP call after this many ms */
  timeoutMs: number;
  /** Reuse the last response for this long — protects the vendor rate limit */
  cacheTtlMs: number;
  /** A tick older than this is reported as stale rather than live */
  staleAfterMs: number;
  /** quote currency -> vendor symbol */
  symbols: Record<string, SymbolSpec>;
}

/**
 * Symbol map for platform.betaserver.dev/fxrates.
 *
 * The feed currently publishes USDBRL and USDTBRL only — check the live list with
 * `GET /fxrates/` (or `/api/rates/source-status`). Quotes with no entry here are
 * reported as missing on the board rather than guessed at.
 *
 * Add pairs as the vendor turns them on, either here or without a deploy via
 * LIVE_MARKET_SYMBOLS, e.g.
 *   LIVE_MARKET_SYMBOLS='{"EUR":{"symbol":"eurusd","invert":true},"CNY":"usdcny"}'
 */
const DEFAULT_SYMBOLS: Record<string, SymbolSpec> = {
  BRL: { symbol: 'usdbrl', invert: false },
  CNY: { symbol: 'usdcny', invert: false },
  // USD -> USDT is not published; the BRL leg cancels out of USDBRL / USDTBRL.
  USDT: { derive: { numerator: 'usdbrl', denominator: 'usdtbrl' } },
  // AED is published against USDT, not USD, so route through the USDT cross.
  // AED per USD = USDTAED * (USDBRL / USDTBRL).
  AED: { derive: { numerator: ['usdtaed', 'usdbrl'], denominator: 'usdtbrl' } },
};

function parseSymbolOverrides(raw: string | undefined): Record<string, SymbolSpec> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};

    const out: Record<string, SymbolSpec> = {};
    for (const [quote, spec] of Object.entries(parsed as Record<string, unknown>)) {
      // Shorthand: {"CNY": "usdcny"} keeps the default invert flag
      if (typeof spec === 'string') {
        const fallback = DEFAULT_SYMBOLS[quote];
        const invert = fallback && !isDerived(fallback) ? fallback.invert : false;
        out[quote] = { symbol: spec, invert };
        continue;
      }
      if (!spec || typeof spec !== 'object') continue;

      const candidate = spec as Partial<DirectSymbolSpec> & Partial<DerivedSymbolSpec>;
      if (
        candidate.derive &&
        typeof candidate.derive.numerator === 'string' &&
        typeof candidate.derive.denominator === 'string'
      ) {
        out[quote] = {
          derive: {
            numerator: candidate.derive.numerator,
            denominator: candidate.derive.denominator,
          },
          invert: Boolean(candidate.invert),
        };
      } else if (typeof candidate.symbol === 'string') {
        out[quote] = { symbol: candidate.symbol, invert: Boolean(candidate.invert) };
      }
    }
    return out;
  } catch {
    // Bad JSON must not take the API down — fall back to defaults.
    return {};
  }
}

export function loadLiveMarketConfig(env: NodeJS.ProcessEnv = process.env): LiveMarketConfig {
  return {
    name: env.LIVE_MARKET_SOURCE_KEY ?? 'betaserver',
    label: env.LIVE_MARKET_LABEL ?? 'Beta Broadcaster',
    baseUrl: (env.LIVE_MARKET_BASE_URL ?? 'https://platform.betaserver.dev').replace(/\/+$/, ''),
    ratesPath: env.LIVE_MARKET_RATES_PATH ?? '/fxrates',
    fetchMode: (env.LIVE_MARKET_FETCH_MODE as FetchMode) ?? 'per-pair',
    apiKey: env.LIVE_MARKET_API_KEY ?? '',
    apiSecret: env.LIVE_MARKET_API_SECRET ?? '',
    authScheme: (env.LIVE_MARKET_AUTH_SCHEME as AuthScheme) ?? 'none',
    authKeyName: env.LIVE_MARKET_AUTH_KEY_NAME ?? 'apikey',
    timeoutMs: parseInt(env.LIVE_MARKET_TIMEOUT_MS ?? '8000', 10),
    cacheTtlMs: parseInt(env.LIVE_MARKET_CACHE_MS ?? '2000', 10),
    staleAfterMs: parseInt(env.LIVE_MARKET_STALE_MS ?? '120000', 10),
    symbols: { ...DEFAULT_SYMBOLS, ...parseSymbolOverrides(env.LIVE_MARKET_SYMBOLS) },
  };
}

/** The integration is live once we have an endpoint and, if required, a key. */
export function isLiveMarketConfigured(cfg: LiveMarketConfig): boolean {
  if (process.env.LIVE_MARKET_ENABLED === 'false') return false;
  if (!cfg.baseUrl) return false;
  return cfg.authScheme === 'none' ? true : Boolean(cfg.apiKey);
}
