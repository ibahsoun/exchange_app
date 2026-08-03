import { create } from 'zustand';

export interface LiveRate {
  base: string;
  quote: string;
  bid: number;
  ask: number;
  mid: number;
  spread: number;
  trend: 'up' | 'down' | 'stable';
  overridden: boolean;
  timestamp: string;
}

export interface MarketSummary {
  totalVolume24h: number;
  volumeChange: number;
  activePairs: number;
  avgSpread: number;
  marketStatus: 'LIVE' | 'CLOSED';
  openMarkets: string;
}

interface RatesState {
  /** All live rates keyed for quick access */
  rates: LiveRate[];
  /** Market-level summary stats */
  summary: MarketSummary | null;
  /** WebSocket connection status */
  connected: boolean;
  /** Last update timestamp */
  lastUpdated: string | null;
  /** Last sync timestamp from multi-source board (global) */
  lastSyncAt: string | null;

  // Actions
  setRates: (rates: LiveRate[]) => void;
  setSummary: (summary: MarketSummary) => void;
  setConnected: (connected: boolean) => void;
  setLastSyncAt: (ts: string) => void;

  // Selectors (convenience)
  getRate: (base: string, quote: string) => LiveRate | undefined;
}

export const useRatesStore = create<RatesState>((set, get) => ({
  rates: [],
  summary: null,
  connected: false,
  lastUpdated: null,
  lastSyncAt: null,

  setRates: (rates) =>
    set({ rates, lastUpdated: new Date().toISOString() }),

  setSummary: (summary) => set({ summary }),

  setConnected: (connected) => set({ connected }),

  setLastSyncAt: (lastSyncAt) => set({ lastSyncAt }),

  getRate: (base, quote) =>
    get().rates.find((r) => r.base === base && r.quote === quote),
}));
