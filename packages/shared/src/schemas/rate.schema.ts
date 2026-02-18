import { z } from 'zod';

export const TrendDirection = z.enum(['up', 'down', 'stable']);

export const CurrencyRateSchema = z.object({
  id: z.string(),
  pair: z.string(),
  currency: z.string(),
  currencyName: z.string(),
  buyRate: z.number().positive(),
  sellRate: z.number().positive(),
  spread: z.number().nonnegative(),
  trend: TrendDirection,
  updatedAt: z.string(),
});

export const MarketSummarySchema = z.object({
  totalVolume24h: z.number(),
  volumeChange: z.number(),
  activePairs: z.number().int(),
  avgSpread: z.number(),
  marketStatus: z.enum(['LIVE', 'CLOSED']),
  openMarkets: z.string(),
});

export type CurrencyRate = z.infer<typeof CurrencyRateSchema>;
export type MarketSummary = z.infer<typeof MarketSummarySchema>;
