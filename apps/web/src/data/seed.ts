import type { CurrencyRate, Transaction, MarketSummary } from '@exchange/shared';

// ─── MARKET RATES (Live Rates page + Dashboard sidebar) ─────────────────
export const marketSummary: MarketSummary = {
  totalVolume24h: 4_820_000_000,
  volumeChange: 1.2,
  activePairs: 42,
  avgSpread: 0.02,
  marketStatus: 'LIVE',
  openMarkets: 'NYC / LDN',
};

export const currencyRates: CurrencyRate[] = [
  { id: '1', pair: 'USD/USD', currency: 'USD', currencyName: 'United States Dollar', buyRate: 1.0000, sellRate: 1.0010, spread: 0.0010, trend: 'up', updatedAt: '2s ago' },
  { id: '2', pair: 'EUR/USD', currency: 'EUR', currencyName: 'European Union Euro', buyRate: 1.0850, sellRate: 1.0865, spread: 0.0015, trend: 'up', updatedAt: 'Just now' },
  { id: '3', pair: 'CNY/USD', currency: 'CNY', currencyName: 'Chinese Yuan', buyRate: 7.2410, sellRate: 7.2450, spread: 0.0040, trend: 'stable', updatedAt: '12s ago' },
  { id: '4', pair: 'XAU/USD', currency: 'XAU', currencyName: 'Spot Gold / Ounce', buyRate: 2155.40, sellRate: 2156.80, spread: 1.4000, trend: 'up', updatedAt: '1s ago' },
  { id: '5', pair: 'USDT/USD', currency: 'USDT', currencyName: 'Tether Stablecoin', buyRate: 0.9999, sellRate: 1.0001, spread: 0.0002, trend: 'stable', updatedAt: 'Just now' },
  { id: '6', pair: 'ARS/USD', currency: 'ARS', currencyName: 'Argentine Peso', buyRate: 845.50, sellRate: 855.00, spread: 9.5000, trend: 'down', updatedAt: '3s ago' },
  { id: '7', pair: 'PYG/USD', currency: 'PYG', currencyName: 'Paraguayan Guarani', buyRate: 7350.00, sellRate: 7380.00, spread: 30.00, trend: 'stable', updatedAt: '1s ago' },
  { id: '8', pair: 'GBP/USD', currency: 'GBP', currencyName: 'British Pound', buyRate: 1.2654, sellRate: 1.2731, spread: 0.0077, trend: 'up', updatedAt: '5s ago' },
  { id: '9', pair: 'JPY/USD', currency: 'JPY', currencyName: 'Japanese Yen', buyRate: 149.22, sellRate: 150.15, spread: 0.93, trend: 'down', updatedAt: '2s ago' },
  { id: '10', pair: 'CHF/USD', currency: 'CHF', currencyName: 'Swiss Franc', buyRate: 1.1342, sellRate: 1.1405, spread: 0.0063, trend: 'stable', updatedAt: '8s ago' },
  { id: '11', pair: 'CAD/USD', currency: 'CAD', currencyName: 'Canadian Dollar', buyRate: 1.3508, sellRate: 1.3592, spread: 0.0084, trend: 'stable', updatedAt: '4s ago' },
  { id: '12', pair: 'AUD/USD', currency: 'AUD', currencyName: 'Australian Dollar', buyRate: 0.6542, sellRate: 0.6601, spread: 0.0059, trend: 'up', updatedAt: '6s ago' },
];

// Dashboard sidebar rates (subset)
export const dashboardRates = [
  { currency: 'EUR', pair: 'EUR/USD', buy: 1.0824, sell: 1.0912 },
  { currency: 'GBP', pair: 'GBP/USD', buy: 1.2654, sell: 1.2731 },
  { currency: 'JPY', pair: 'USD/JPY', buy: 149.22, sell: 150.15 },
  { currency: 'CHF', pair: 'CHF/USD', buy: 1.1342, sell: 1.1405 },
  { currency: 'CAD', pair: 'USD/CAD', buy: 1.3508, sell: 1.3592 },
  { currency: 'AUD', pair: 'AUD/USD', buy: 0.6542, sell: 0.6601 },
];

// ─── TRANSACTIONS ────────────────────────────────────────────────────────
export const transactions: Transaction[] = [
  { id: '1',  receiptId: 'TX-99281', customerId: '1', customerName: 'James Sterling',   customerInitials: 'JS', type: 'BUY',  base: 'USD', quote: 'EUR', amountIn: 12500.00,  amountOut: 11776.25,  rateApplied: 0.9421,  spread: 0.0015, status: 'COMPLETED', tellerId: 'TELLER-04A', createdAt: '2024-11-24T14:22:10Z' },
  { id: '2',  receiptId: 'TX-99280', customerId: '2', customerName: 'Maria Al-Sayed',   customerInitials: 'MA', type: 'SELL', base: 'GBP', quote: 'JPY', amountIn: 4200.00,   amountOut: 766290.00, rateApplied: 182.45,  spread: 0.93,   status: 'PENDING',   tellerId: 'TELLER-04A', createdAt: '2024-11-24T13:45:02Z' },
  { id: '3',  receiptId: 'TX-99279', customerId: '3', customerName: 'Chen Han',         customerInitials: 'CH', type: 'SWAP', base: 'EUR', quote: 'CHF', amountIn: 85000.00,  amountOut: 81685.00,  rateApplied: 0.9610,  spread: 0.0063, status: 'COMPLETED', tellerId: 'TELLER-02B', createdAt: '2024-11-24T11:12:44Z' },
  { id: '4',  receiptId: 'TX-99278', customerId: '4', customerName: 'Elena Lopez',      customerInitials: 'EL', type: 'BUY',  base: 'USD', quote: 'JPY', amountIn: 1500.00,   amountOut: 224730.00, rateApplied: 149.82,  spread: 0.93,   status: 'FAILED',    tellerId: 'TELLER-04A', createdAt: '2024-11-24T09:30:15Z' },
  { id: '5',  receiptId: 'TX-99277', customerId: '5', customerName: 'Oliver Bennett',   customerInitials: 'OB', type: 'BUY',  base: 'USD', quote: 'GBP', amountIn: 28000.00,  amountOut: 22184.40,  rateApplied: 0.7923,  spread: 0.0077, status: 'COMPLETED', tellerId: 'TELLER-01C', createdAt: '2024-11-24T08:15:33Z' },
  { id: '6',  receiptId: 'TX-99276', customerId: '1', customerName: 'James Sterling',   customerInitials: 'JS', type: 'SELL', base: 'EUR', quote: 'USD', amountIn: 55000.00,  amountOut: 59515.50,  rateApplied: 1.0821,  spread: 0.0015, status: 'COMPLETED', tellerId: 'TELLER-04A', createdAt: '2024-11-23T16:42:19Z' },
  { id: '7',  receiptId: 'TX-99275', customerId: '2', customerName: 'Maria Al-Sayed',   customerInitials: 'MA', type: 'BUY',  base: 'USD', quote: 'AED', amountIn: 10000.00,  amountOut: 36710.00,  rateApplied: 3.6710,  spread: 0.0020, status: 'COMPLETED', tellerId: 'TELLER-04A', createdAt: '2024-11-23T15:20:08Z' },
  { id: '8',  receiptId: 'TX-99274', customerId: '3', customerName: 'Chen Han',         customerInitials: 'CH', type: 'BUY',  base: 'USD', quote: 'CNY', amountIn: 25000.00,  amountOut: 181025.00, rateApplied: 7.2410,  spread: 0.0040, status: 'COMPLETED', tellerId: 'TELLER-02B', createdAt: '2024-11-23T14:05:22Z' },
  { id: '9',  receiptId: 'TX-99273', customerId: '4', customerName: 'Elena Lopez',      customerInitials: 'EL', type: 'SWAP', base: 'GBP', quote: 'EUR', amountIn: 7500.00,   amountOut: 8712.50,   rateApplied: 1.1617,  spread: 0.0015, status: 'COMPLETED', tellerId: 'TELLER-04A', createdAt: '2024-11-23T10:33:41Z' },
  { id: '10', receiptId: 'TX-99272', customerId: '5', customerName: 'Oliver Bennett',   customerInitials: 'OB', type: 'BUY',  base: 'USD', quote: 'CHF', amountIn: 45000.00,  amountOut: 39870.00,  rateApplied: 0.8860,  spread: 0.0063, status: 'PENDING',   tellerId: 'TELLER-01C', createdAt: '2024-11-23T09:18:55Z' },
  { id: '11', receiptId: 'TX-99271', customerId: '1', customerName: 'James Sterling',   customerInitials: 'JS', type: 'SELL', base: 'CAD', quote: 'USD', amountIn: 18000.00,  amountOut: 13324.50,  rateApplied: 0.7403,  spread: 0.0084, status: 'COMPLETED', tellerId: 'TELLER-04A', createdAt: '2024-11-22T17:55:30Z' },
  { id: '12', receiptId: 'TX-99270', customerId: '2', customerName: 'Maria Al-Sayed',   customerInitials: 'MA', type: 'BUY',  base: 'USD', quote: 'ARS', amountIn: 2000.00,   amountOut: 1691000.00, rateApplied: 845.50, spread: 9.50,   status: 'CANCELLED', tellerId: 'TELLER-04A', createdAt: '2024-11-22T14:12:18Z' },
];


