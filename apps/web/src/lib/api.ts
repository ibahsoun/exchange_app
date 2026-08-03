const API = '/api';

async function get<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(API + path, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '' && v !== 'ALL') url.searchParams.set(k, v);
    });
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = `POST ${path} failed: ${res.status}`;
    try { const body = await res.json(); if (body.message) msg = body.message; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json();
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(API + path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `PATCH ${path} failed: ${res.status}`;
    try { const b = await res.json(); if (b.message) msg = b.message; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json();
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(API + path, { method: 'DELETE' });
  if (!res.ok) {
    let msg = `DELETE ${path} failed: ${res.status}`;
    try { const b = await res.json(); if (b.message) msg = b.message; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.ok && res.headers.get('content-length') === '0' ? (undefined as T) : res.json();
}

// ─── Customers ──────────────────────────────────────────
export const customersApi = {
  list: (filters?: Record<string, string>) =>
    get<{ items: unknown[]; total: number; page: number; limit: number; totalPages: number }>('/customers', filters),
  getById: (id: string) => get(`/customers/${id}`),
  getStats: () => get<{ total: number; avgLevel: number }>('/customers/stats'),
  create: (dto: { name: string; phone?: string; email?: string; level?: number }) =>
    post<unknown>('/customers', dto),
  update: (id: string, dto: { name?: string; phone?: string; email?: string; level?: number }) =>
    patch<unknown>(`/customers/${id}`, dto),
  delete: (id: string) => del<{ ok?: boolean }>(`/customers/${id}`),
  uploadExcel: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return fetch(API + '/customers/upload-excel', {
      method: 'POST',
      body: form,
    }).then(async (res) => {
      if (!res.ok) {
        let msg = `Upload failed: ${res.status}`;
        try { const b = await res.json(); if (b.message) msg = b.message; } catch { /* ignore */ }
        throw new Error(msg);
      }
      return res.json() as Promise<{ created: number; errors: string[] }>;
    });
  },
  downloadTemplate: async () => {
    const res = await fetch(API + '/customers/template');
    if (!res.ok) throw new Error('Failed to download template');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'customers-template.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  },
};

// ─── Currencies ─────────────────────────────────────────
export interface Currency {
  id: string;
  code: string;
  name: string;
  symbol: string;
  color: string;
  sortIndex: number;
}

export const currenciesApi = {
  list: () => get<Currency[]>('/currencies'),
  create: (dto: { code: string; name: string; symbol: string; color?: string }) =>
    post<Currency>('/currencies', dto),
  update: (id: string, dto: { name?: string; symbol?: string; color?: string; sortIndex?: number }) =>
    patch<Currency>(`/currencies/${id}`, dto),
  delete: (id: string) => del<{ ok: boolean }>(`/currencies/${id}`),
  reorder: (items: { id: string; sortIndex: number }[]) =>
    post<Currency[]>('/currencies/reorder', { items }),
};

// ─── Transactions ───────────────────────────────────────
export const transactionsApi = {
  list: (filters?: Record<string, string>) =>
    get<{ items: unknown[]; total: number; page: number; limit: number; totalPages: number }>('/transactions', filters),
  create: (dto: {
    type: string;
    base: string;
    quote: string;
    amountIn: number;
    customerId: string;
    destinationId?: string;
  }) => post('/transactions', dto),
};

// ─── Destinations ───────────────────────────────────────
export interface Destination {
  id: string;
  name: string;
  commission: number;
  commissionType: 'PERCENTAGE' | 'FIXED';
  fixedUnit: FixedUnit;
}

export const destinationsApi = {
  list: () => get<Destination[]>('/destinations'),
  create: (dto: { name: string; commission?: number; commissionType?: string; fixedUnit?: string }) =>
    post<Destination>('/destinations', dto),
  update: (id: string, dto: { name?: string; commission?: number; commissionType?: string; fixedUnit?: string }) =>
    patch<Destination>(`/destinations/${id}`, dto),
  delete: (id: string) => del<{ ok: boolean }>(`/destinations/${id}`),
};

// ─── Multi-Source Rates ────────────────────────────────────

export type SpreadType = 'PERCENTAGE' | 'FIXED';
export type SpreadMode = 'SYMMETRIC' | 'ASYMMETRIC';
export type FixedUnit = 'RAW';

export interface SourceStatus {
  key: string;
  label: string;
  status: 'online' | 'offline' | 'stale';
  latencyMs: number;
}

export interface SourceRateCell {
  buy: number | null;
  sell: number | null;
  mid: number;
  latencyMs: number;
  status: 'ok' | 'outlier' | 'missing';
}

export interface BoardRow {
  base: string;
  quote: string;
  pair: string;
  quoteName: string;
  flag?: string;
  sourceRates: Record<string, SourceRateCell>;
  globalAvg: { buy: number | null; sell: number | null; mid: number };
  storeRate: {
    mid: number;
    /** Feed's own sides behind `mid`; null when the rate is operator-set */
    marketBid: number | null;
    marketAsk: number | null;
    mode: 'AUTO_AVG' | 'MANUAL_SOURCE' | 'CUSTOM_VALUE' | 'LOCKED';
    sourceHint: string | null;
    label: string;
    spreadType: SpreadType;
    spreadMode: SpreadMode;
    fixedUnit: FixedUnit;
    spreadPercent: number;
    spreadFixed: number;
    buyMargin: number;
    sellMargin: number;
    bid: number;
    ask: number;
    spread: number;
    roundingDecimals: number | null;
    /** Decimals actually applied; null when the configured ones are too coarse for this rate */
    effectiveRoundingDecimals: number | null;
    roundingMode: string | null;
    updatedAt: string;
  };
  variance: { points: number; direction: 'tight' | 'wide' | 'normal' };
}

export interface SpreadRow {
  base: string;
  quote: string;
  pair: string;
  quoteName: string;
  mid: number;
  marketBid: number | null;
  marketAsk: number | null;
  mode: string;
  sourceHint: string | null;
  spreadType: SpreadType;
  spreadMode: SpreadMode;
  fixedUnit: FixedUnit;
  spreadPercent: number;
  spreadFixed: number;
  buyMargin: number;
  sellMargin: number;
  bid: number;
  ask: number;
  spread: number;
  roundingDecimals: number | null;
  effectiveRoundingDecimals: number | null;
  roundingMode: string | null;
  updatedAt: string;
}

export interface MultiSourceBoardResponse {
  stats: {
    networkLatency: number;
    marketStability: number;
    sourcesConnected: number;
    sourcesTotal: number;
    sourceStatuses: SourceStatus[];
    globalAvgDrift: number;
    driftLocked: number;
  };
  sources: SourceStatus[];
  rows: BoardRow[];
  lastSync: string;
  autoSyncEnabled: boolean;
  autoSyncIntervalSec: number;
}

// ─── Rate Scheduler ──────────────────────────────────────
export const schedulerApi = {
  getStatus: () => get<{ paused: boolean }>('/rates/scheduler/status'),
  pause: () => post<{ paused: boolean }>('/rates/scheduler/pause'),
  resume: () => post<{ paused: boolean }>('/rates/scheduler/resume'),
  fetchOnce: () => post<{ ok: boolean }>('/rates/scheduler/fetch-once'),
};

/**
 * Fallback base currencies. The real list comes from Settings via
 * `multiSourceApi.getBases()` — this is only what renders before it arrives.
 */
export const VALID_BASES = ['USD', 'CNY', 'BRL', 'USDT', 'AED'];

export const multiSourceApi = {
  /** Base currencies the board can be displayed in, per Settings */
  getBases: () => get<string[]>('/rates/bases'),
  getBoard: (baseCurrency?: string) => {
    const params = baseCurrency && baseCurrency !== 'USD' ? { base: baseCurrency } : undefined;
    return get<MultiSourceBoardResponse>('/rates/multi-source-board', params);
  },
  /** Reset all pairs to Auto source, zero spread, and no rounding */
  reset: () => post<{ ok: boolean }>('/rates/reset', {}),
  refresh: (baseCurrency?: string) => {
    const qs = baseCurrency && baseCurrency !== 'USD' ? `?base=${baseCurrency}` : '';
    return post<MultiSourceBoardResponse>(`/rates/multi-source-board/refresh${qs}`);
  },
  updateStoreRate: (dto: {
    base: string;
    quote: string;
    mode: 'AUTO_AVG' | 'MANUAL_SOURCE' | 'CUSTOM_VALUE' | 'LOCKED';
    mid?: number;
    sourceHint?: string;
    reason?: string;
    spreadType?: SpreadType;
    spreadMode?: SpreadMode;
    fixedUnit?: FixedUnit;
    spreadPercent?: number;
    spreadFixed?: number;
    buyMargin?: number;
    sellMargin?: number;
  }) => post('/rates/store-rate', dto),
};

// ─── Customer Pair Fees ──────────────────────────────────
export interface LevelPointsPair {
  base: string;
  quote: string;
  pair: string;
  quoteName: string;
}

export interface CustomerFeeRow {
  customerId: string;
  customerCode: string;
  name: string;
  level: number;
  points: number | null;
  percent: number | null;
}

export interface CustomerPairFee {
  base: string;
  quote: string;
  points: number;
  percent: number;
}

/** One customer-fee "point" moves the rate by this much (mirrors the backend) */
export const FEE_POINT_VALUE = 0.01;

export const customerFeesApi = {
  getPairs: (base?: string) =>
    get<LevelPointsPair[]>('/rates/level-points/pairs', base ? { base } : undefined),
  list: (base: string, quote: string) =>
    get<CustomerFeeRow[]>('/rates/customer-fees', { base, quote }),
  getForCustomer: (customerId: string, base: string, quote: string) =>
    get<CustomerPairFee>('/rates/customer-fees/one', { customerId, base, quote }),
  update: (dto: {
    customerId: string;
    base: string;
    quote: string;
    points?: number | null;
    percent?: number | null;
  }) => post<CustomerFeeRow>('/rates/customer-fees', dto),
};

// ─── Spread Management ──────────────────────────────────
export const spreadApi = {
  getAll: (baseCurrency?: string) => {
    const params = baseCurrency && baseCurrency !== 'USD' ? { base: baseCurrency } : undefined;
    return get<SpreadRow[]>('/rates/spreads', params);
  },
  update: (dto: {
    base: string;
    quote: string;
    spreadType: SpreadType;
    spreadMode: SpreadMode;
    fixedUnit?: FixedUnit;
    spreadPercent?: number;
    spreadFixed?: number;
    buyMargin?: number;
    sellMargin?: number;
    roundingDecimals?: number | null;
    roundingMode?: string | null;
  }) => post('/rates/spread', dto),
};
