export interface CurrencyRate {
  id: string;
  pair: string;
  currency: string;
  currencyName: string;
  buyRate: number;
  sellRate: number;
  spread: number;
  trend: 'up' | 'down' | 'stable';
  updatedAt: string;
}

export interface MarketSummary {
  totalVolume24h: number;
  volumeChange: number;
  activePairs: number;
  avgSpread: number;
  marketStatus: 'LIVE' | 'CLOSED';
  openMarkets: string;
}
