import { Logger } from '@nestjs/common';
import type {
  RateProvider,
  RateQuote,
  MultiSourceProvider,
  MultiSourceQuote,
  MultiSourceResult,
} from './rate-provider.interface';
import {
  loadLiveMarketConfig,
  isLiveMarketConfigured,
  isDerived,
  specSymbols,
  legSymbols,
  type LiveMarketConfig,
  type SymbolSpec,
  type DirectSymbolSpec,
  type DerivedSymbolSpec,
} from './live-market.config';

/**
 * Live rate feed — platform.betaserver.dev/fxrates (Beta Broadcaster).
 *
 * The vendor holds upstream TradingView websockets and republishes the latest
 * quote per pair over HTTP:
 *
 *   GET /fxrates/usdbrl   -> one pair (path must be lowercase; uppercase 404s)
 *   GET /fxrates/         -> {"status":"running","endpoints":["/usdbrl","/usdtbrl"]}
 *   GET /fxrates/stats    -> every pair's latest quote in one response
 *
 *   { "pair": "USDBRL", "source": "TradingView FX_IDC", "last": 5.087,
 *     "bid": 5.087, "ask": 5.0874, "mid": 5.0872,
 *     "lp_time_utc": "2026-07-24T21:13:22+00:00",
 *     "received_at_utc": "2026-07-25T09:11:46.700705+00:00" }
 *
 * No authentication. One pair per request by default; set
 * LIVE_MARKET_FETCH_MODE=stats to pull everything in a single call instead.
 *
 * Structure:
 *   LiveMarketClient        — HTTP + parsing + normalisation + caching (one instance)
 *   LiveMarketProvider      — MultiSourceProvider face, feeds the rate board
 *   LiveMarketRateProvider  — RateProvider face, feeds RatesService / websocket ticker
 *
 * Both provider faces share one client, so a board refresh and a scheduler tick
 * inside the same cache window cost a single upstream request.
 */

/** One quote as the vendor sends it, before it is mapped onto our pairs. */
export interface VendorRow {
  symbol: string;
  bid: number | null;
  ask: number | null;
  /** Vendor's own mid; preferred over (bid+ask)/2 when present */
  mid: number | null;
  /** Market time of the tick (`lp_time_utc`) */
  timestamp: Date;
  /** When the vendor's broadcaster received it (`received_at_utc`) — freshness signal */
  receivedAt: Date;
  /** Upstream venue, e.g. "TradingView FX_IDC" */
  source?: string;
}

/** A vendor row mapped onto one of our USD-based pairs. */
export interface NormalizedTick {
  base: string;
  quote: string;
  bid: number | null;
  ask: number | null;
  mid: number;
  timestamp: Date;
  receivedAt: Date;
  /** True when computed as a cross of two vendor symbols rather than quoted directly */
  derived: boolean;
}

export interface TickBatch {
  ticks: NormalizedTick[];
  latencyMs: number;
}

// ─────────────────────────────────────────────────────────────
// VENDOR ADAPTER — everything specific to this API lives here
// ─────────────────────────────────────────────────────────────

/** Single-pair endpoint. The vendor 404s on anything but a lowercase path. */
export function quoteUrl(cfg: LiveMarketConfig, symbol: string): string {
  return `${cfg.baseUrl}${cfg.ratesPath}/${symbol.trim().toLowerCase()}`;
}

/** Batch endpoint: every pair's latest quote in one response. */
export function statsUrl(cfg: LiveMarketConfig): string {
  return `${cfg.baseUrl}${cfg.ratesPath}/stats`;
}

/** Discovery endpoint: which pairs the feed currently publishes. */
export function indexUrl(cfg: LiveMarketConfig): string {
  return `${cfg.baseUrl}${cfg.ratesPath}/`;
}

/**
 * Credentials. The feed is currently open (authScheme 'none'); the other schemes
 * are wired so a key can be added later through env alone.
 */
export function buildRequest(cfg: LiveMarketConfig, url: string): { url: string; init: RequestInit } {
  const target = new URL(url);
  const headers: Record<string, string> = { Accept: 'application/json' };

  switch (cfg.authScheme) {
    case 'query':
      target.searchParams.set(cfg.authKeyName, cfg.apiKey);
      break;
    case 'bearer':
      headers.Authorization = `Bearer ${cfg.apiKey}`;
      break;
    case 'header':
      headers[cfg.authKeyName] = cfg.apiKey;
      break;
    case 'basic':
      headers.Authorization =
        'Basic ' + Buffer.from(`${cfg.apiKey}:${cfg.apiSecret}`).toString('base64');
      break;
    case 'none':
      break;
  }

  return { url: target.toString(), init: { method: 'GET', headers } };
}

/** Read a single `/fxrates/{pair}` payload. */
export function parseQuote(payload: unknown): VendorRow | null {
  if (!payload || typeof payload !== 'object') return null;
  const row = payload as Record<string, unknown>;

  const symbol = typeof row.pair === 'string' ? row.pair : null;
  if (!symbol) return null;

  const bid = toNum(row.bid);
  const ask = toNum(row.ask);
  const mid = toNum(row.mid) ?? toNum(row.last);
  if (bid == null && ask == null && mid == null) return null;

  const timestamp = toDate(row.lp_time_utc) ?? toDate(row.received_at_utc) ?? new Date();
  const receivedAt = toDate(row.received_at_utc) ?? timestamp;

  return {
    symbol,
    bid,
    ask,
    mid,
    timestamp,
    receivedAt,
    source: typeof row.source === 'string' ? row.source : undefined,
  };
}

/**
 * Read a `/fxrates/stats` payload: { pairs: { USDBRL: { latest: {...} } } }.
 * Also accepts a bare single-quote payload so both fetch modes share a path.
 */
export function extractRows(payload: unknown): VendorRow[] {
  if (!payload || typeof payload !== 'object') return [];
  const root = payload as Record<string, unknown>;

  const pairs = root.pairs;
  if (pairs && typeof pairs === 'object') {
    return Object.values(pairs as Record<string, unknown>)
      .map((entry) => {
        const latest = (entry as Record<string, unknown>)?.latest;
        return parseQuote(latest ?? entry);
      })
      .filter((row): row is VendorRow => row != null);
  }

  const single = parseQuote(root);
  return single ? [single] : [];
}

/** Read the `/fxrates/` index: {"endpoints":["/usdbrl","/usdtbrl"]}. */
export function extractAvailablePairs(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const endpoints = (payload as Record<string, unknown>).endpoints;
  if (!Array.isArray(endpoints)) return [];
  return endpoints
    .filter((e): e is string => typeof e === 'string')
    .map((e) => e.replace(/^\/+/, ''))
    .filter((e) => e !== '' && e !== 'stats');
}

function toNum(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toDate(value: unknown): Date | null {
  if (typeof value !== 'string' || value === '') return null;
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/** "USDBRL", "usdbrl" and "USD/BRL" all compare equal. */
function normalizeSymbol(symbol: string): string {
  return symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// ─────────────────────────────────────────────────────────────
// Client
// ─────────────────────────────────────────────────────────────

export class LiveMarketClient {
  private readonly logger = new Logger(LiveMarketClient.name);
  readonly config: LiveMarketConfig;

  /** Latest raw quote per vendor symbol; also where streamed ticks land. */
  private readonly rawBySymbol = new Map<string, VendorRow>();
  /** Latest resolved tick per quote currency. */
  private readonly latest = new Map<string, NormalizedTick>();

  private lastBatch: TickBatch | null = null;
  private lastFetchAt = 0;
  private inflight: Promise<TickBatch> | null = null;
  /** Symbols already reported as unavailable — keeps 404s out of the log loop. */
  private readonly warnedSymbols = new Set<string>();

  constructor(config: LiveMarketConfig = loadLiveMarketConfig()) {
    this.config = config;
  }

  get name() {
    return this.config.name;
  }

  get label() {
    return this.config.label;
  }

  isConfigured(): boolean {
    return isLiveMarketConfigured(this.config);
  }

  /** Quote currencies we have a symbol mapping for. */
  getSupportedQuotes(): string[] {
    return Object.keys(this.config.symbols);
  }

  getLatest(quote: string): NormalizedTick | undefined {
    return this.latest.get(quote);
  }

  /**
   * Staleness is measured against `received_at_utc`, not the market time: FX
   * quotes legitimately carry a Friday-evening `lp_time_utc` all weekend, while
   * the broadcaster keeps republishing them.
   */
  isStale(tick: NormalizedTick): boolean {
    return Date.now() - tick.receivedAt.getTime() > this.config.staleAfterMs;
  }

  /** Which pairs the feed currently publishes (`GET /fxrates/`). */
  async listAvailablePairs(): Promise<string[]> {
    const { url, init } = buildRequest(this.config, indexUrl(this.config));
    return extractAvailablePairs(await this.request(url, init));
  }

  /**
   * Push a quote in from outside the polling path — the hook a websocket feed
   * plugs into. Mapping, inversion and crosses stay in one place.
   */
  applyVendorRow(row: VendorRow): void {
    this.rawBySymbol.set(normalizeSymbol(row.symbol), row);
    this.recomputeLatest();
  }

  /**
   * Fetch quotes for the given currencies against `base`.
   * Concurrent callers within the cache window share one upstream request.
   */
  async getTicks(base: string, quotes: string[]): Promise<TickBatch> {
    if (!this.isConfigured()) {
      throw new Error(`${this.config.label} is not configured — set LIVE_MARKET_BASE_URL`);
    }
    if (base !== 'USD') {
      throw new Error(`${this.config.label} provider expects USD as base, got ${base}`);
    }

    // The batch cache is shared across callers requesting different quote
    // lists, so always slice the result down to what THIS caller asked for.
    if (this.lastBatch && Date.now() - this.lastFetchAt < this.config.cacheTtlMs) {
      return this.sliceBatch(this.lastBatch, quotes);
    }
    if (this.inflight) return this.inflight.then((b) => this.sliceBatch(b, quotes));

    this.inflight = this.fetchBatch(quotes).finally(() => {
      this.inflight = null;
    });
    return this.inflight.then((b) => this.sliceBatch(b, quotes));
  }

  /** Only the requested quotes — a cached batch may hold more (or fewer). */
  private sliceBatch(batch: TickBatch, quotes: string[]): TickBatch {
    return { ...batch, ticks: batch.ticks.filter((t) => quotes.includes(t.quote)) };
  }

  private async fetchBatch(quotes: string[]): Promise<TickBatch> {
    const wanted = quotes.filter((q) => this.config.symbols[q]);
    const unmapped = quotes.filter((q) => !this.config.symbols[q]);
    if (unmapped.length > 0) {
      this.logger.debug(`No symbol mapping for: ${unmapped.join(', ')}`);
    }
    if (wanted.length === 0) return { ticks: [], latencyMs: 0 };

    const started = Date.now();
    const rows =
      this.config.fetchMode === 'stats'
        ? await this.fetchViaStats()
        : await this.fetchPerPair(wanted);
    const latencyMs = Date.now() - started;

    for (const row of rows) {
      this.rawBySymbol.set(normalizeSymbol(row.symbol), row);
    }
    this.recomputeLatest();

    const ticks = wanted
      .map((q) => this.latest.get(q))
      .filter((t): t is NormalizedTick => t != null);

    const batch = { ticks, latencyMs };
    this.lastBatch = batch;
    this.lastFetchAt = Date.now();
    return batch;
  }

  /** One request per vendor symbol; a pair the feed does not serve is skipped. */
  private async fetchPerPair(quotes: string[]): Promise<VendorRow[]> {
    const symbols = [
      ...new Set(quotes.flatMap((q) => specSymbols(this.config.symbols[q]))),
    ];

    const settled = await Promise.allSettled(
      symbols.map(async (symbol) => {
        const { url, init } = buildRequest(this.config, quoteUrl(this.config, symbol));
        const row = parseQuote(await this.request(url, init));
        if (!row) throw new Error(`unparsable payload for ${symbol}`);
        this.warnedSymbols.delete(symbol);
        return row;
      }),
    );

    const rows: VendorRow[] = [];
    settled.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        rows.push(result.value);
      } else if (!this.warnedSymbols.has(symbols[i])) {
        // Log the first failure per symbol only — a pair the feed has not turned
        // on yet would otherwise warn on every refresh.
        this.warnedSymbols.add(symbols[i]);
        this.logger.warn(`${this.config.label}: ${symbols[i]} unavailable — ${result.reason}`);
      }
    });
    return rows;
  }

  /** Single request returning every pair the feed knows about. */
  private async fetchViaStats(): Promise<VendorRow[]> {
    const { url, init } = buildRequest(this.config, statsUrl(this.config));
    const rows = extractRows(await this.request(url, init));
    if (rows.length === 0) {
      this.logger.warn(`${this.config.label}: /stats returned no parsable quotes`);
    }
    return rows;
  }

  private async request(url: string, init: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
      return await res.json();
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`timed out after ${this.config.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Re-resolve every configured pair from the raw quotes currently held. */
  private recomputeLatest(): void {
    for (const [quote, spec] of Object.entries(this.config.symbols)) {
      const tick = this.resolve(quote, spec);
      if (tick) this.latest.set(quote, tick);
    }
  }

  private resolve(quote: string, spec: SymbolSpec): NormalizedTick | null {
    return isDerived(spec) ? this.resolveDerived(quote, spec) : this.resolveDirect(quote, spec);
  }

  private resolveDirect(quote: string, spec: DirectSymbolSpec): NormalizedTick | null {
    const row = this.rawBySymbol.get(normalizeSymbol(spec.symbol));
    if (!row) return null;

    const sides = sidesOf(row);
    if (!sides) return null;

    const { bid, ask } = spec.invert ? invertSides(sides) : sides;
    // Anchor on the BID of our orientation, not the vendor mid: the store rate
    // and all pricing follow the conservative side of the market. (Inversion
    // has already swapped the sides, so this is the bid of the flipped pair.)
    if (!Number.isFinite(bid) || bid <= 0) return null;

    return {
      base: 'USD',
      quote,
      bid: round(bid),
      ask: round(ask),
      mid: round(bid),
      timestamp: row.timestamp,
      receivedAt: row.receivedAt,
      derived: false,
    };
  }

  /**
   * Cross of vendor symbols sharing currencies, e.g. USDT per USD from
   * USDBRL / USDTBRL. Every leg crosses a spread, so the resulting bid takes the
   * numerators' bids over the denominators' asks and vice versa.
   */
  private resolveDerived(quote: string, spec: DerivedSymbolSpec): NormalizedTick | null {
    const numRows = this.rowsFor(spec.derive.numerator);
    const denRows = this.rowsFor(spec.derive.denominator);
    if (!numRows || !denRows) return null;

    const num = numRows.map(sidesOf);
    const den = denRows.map(sidesOf);
    if (num.some((s) => s == null) || den.some((s) => s == null)) return null;

    const numSides = num as Sides[];
    const denSides = den as Sides[];
    if (denSides.some((s) => s.bid <= 0 || s.ask <= 0)) return null;

    const product = (sides: Sides[], pick: keyof Sides) =>
      sides.reduce((acc, s) => acc * s[pick], 1);

    let sides: Sides = {
      bid: product(numSides, 'bid') / product(denSides, 'ask'),
      ask: product(numSides, 'ask') / product(denSides, 'bid'),
      mid: product(numSides, 'mid') / product(denSides, 'mid'),
    };
    if (spec.invert) sides = invertSides(sides);

    // Same anchoring rule as direct pairs: the cross's own bid, post-inversion.
    if (!Number.isFinite(sides.bid) || sides.bid <= 0) return null;

    // The cross is only as fresh as its stalest leg.
    const rows = [...numRows, ...denRows];
    const oldest = (pick: 'timestamp' | 'receivedAt') =>
      rows.reduce((acc, r) => (r[pick] < acc ? r[pick] : acc), rows[0][pick]);

    return {
      base: 'USD',
      quote,
      bid: round(sides.bid),
      ask: round(sides.ask),
      mid: round(sides.bid),
      timestamp: oldest('timestamp'),
      receivedAt: oldest('receivedAt'),
      derived: true,
    };
  }

  /** All rows for a derive leg, or null if any symbol is missing. */
  private rowsFor(leg: string | string[]): VendorRow[] | null {
    const rows = legSymbols(leg).map((s) => this.rawBySymbol.get(normalizeSymbol(s)));
    return rows.every((r): r is VendorRow => r != null) ? rows : null;
  }
}

interface Sides {
  bid: number;
  ask: number;
  mid: number;
}

/**
 * Fill in whatever the vendor omitted. A quote with only one price becomes
 * bid = ask = mid; the customer-facing spread is applied later from SpreadSettings.
 */
function sidesOf(row: VendorRow): Sides | null {
  let bid = row.bid;
  let ask = row.ask;
  const mid = row.mid;

  if (bid == null && ask == null && mid != null) {
    bid = mid;
    ask = mid;
  }
  if (bid == null && ask != null) bid = ask;
  if (ask == null && bid != null) ask = bid;
  if (bid == null || ask == null || bid <= 0 || ask <= 0) return null;

  // Prefer the vendor's own mid; fall back to the midpoint of the two sides.
  const resolvedMid = mid != null && mid > 0 ? mid : (bid + ask) / 2;
  return { bid, ask, mid: resolvedMid };
}

/** Flip a quote: 1/ask becomes the bid, the cheaper side of the flipped pair. */
function invertSides(sides: Sides): Sides {
  return {
    bid: 1 / sides.ask,
    ask: 1 / sides.bid,
    mid: 1 / sides.mid,
  };
}

function round(value: number): number {
  return Number(value.toPrecision(10));
}

// ─────────────────────────────────────────────────────────────
// Provider faces
// ─────────────────────────────────────────────────────────────

/** Feeds the multi-source rate board (LiveRates page). */
export class LiveMarketProvider implements MultiSourceProvider {
  readonly name: string;
  readonly label: string;

  constructor(private readonly client: LiveMarketClient) {
    this.name = client.name;
    this.label = client.label;
  }

  async fetchRates(base: string, quotes: string[]): Promise<MultiSourceResult> {
    const { ticks, latencyMs } = await this.client.getTicks(base, quotes);

    const result: MultiSourceQuote[] = ticks.map((t) => ({
      base: t.base,
      quote: t.quote,
      bid: t.bid,
      ask: t.ask,
      mid: t.mid,
      timestamp: t.timestamp,
    }));

    return { quotes: result, latencyMs };
  }
}

/** Feeds RatesService (cached ticker + websocket broadcast + snapshots). */
export class LiveMarketRateProvider implements RateProvider {
  readonly name: string;

  /**
   * @param quotes Restrict to these currencies; defaults to every pair the feed
   *   is mapped for. The board applies the Settings currency list on top.
   */
  constructor(
    private readonly client: LiveMarketClient,
    private readonly quotes?: string[],
  ) {
    this.name = client.name;
  }

  getSupportedQuotes(): string[] {
    const supported = this.client.getSupportedQuotes();
    return this.quotes ? this.quotes.filter((q) => supported.includes(q)) : supported;
  }

  async fetchRates(base: string): Promise<RateQuote[]> {
    const { ticks } = await this.client.getTicks(base, this.getSupportedQuotes());

    return ticks.map((t) => {
      const bid = t.bid ?? t.mid;
      const ask = t.ask ?? t.mid;
      return {
        base: t.base,
        quote: t.quote,
        bid,
        ask,
        mid: t.mid,
        spread: Number((ask - bid).toPrecision(6)),
        timestamp: t.timestamp,
      };
    });
  }
}
