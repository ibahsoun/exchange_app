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
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json();
}

// ─── Customers ──────────────────────────────────────────
export const customersApi = {
  list: (filters?: Record<string, string>) =>
    get<{ items: unknown[]; total: number; page: number; limit: number; totalPages: number }>('/customers', filters),
  getById: (id: string) => get(`/customers/${id}`),
  getStats: () => get<{ total: number; avgLevel: number }>('/customers/stats'),
  create: (dto: { name: string; phone?: string; email?: string; level?: number }) =>
    post<unknown>('/customers', dto),
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
  }) => post('/transactions', dto),
};

// ─── Multi-Source Rates ────────────────────────────────────

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
    mode: 'AUTO_AVG' | 'MANUAL_SOURCE' | 'CUSTOM_VALUE' | 'LOCKED';
    sourceHint: string | null;
    label: string;
  };
  variance: { points: number; direction: 'tight' | 'wide' | 'normal' };
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

export const multiSourceApi = {
  getBoard: () => get<MultiSourceBoardResponse>('/rates/multi-source-board'),
  refresh: () => post<MultiSourceBoardResponse>('/rates/multi-source-board/refresh'),
  updateStoreRate: (dto: {
    base: string;
    quote: string;
    mode: 'AUTO_AVG' | 'MANUAL_SOURCE' | 'CUSTOM_VALUE' | 'LOCKED';
    mid?: number;
    sourceHint?: string;
    reason?: string;
  }) => post('/rates/store-rate', dto),
};
