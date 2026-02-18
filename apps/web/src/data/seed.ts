import type { CurrencyRate, Transaction, Customer, VaultCurrency, VaultAdjustment, MarketSummary, VaultSummary } from '@exchange/shared';

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

// ─── CUSTOMERS ───────────────────────────────────────────────────────────
export const customers: Customer[] = [
  { id: '1',  customerId: 'CUST-9921', fullName: 'Julian Reinhardt',  nationality: 'Germany',     documentType: 'Passport',     documentNumber: 'DE-29381742', documentExpiry: '2027-03-15', expiryStatus: 'VALID',    riskLevel: 'LOW',    lifetimeVolume: 42000,  preferredPair: 'EUR/USD', activeSince: '2020-06-12', avatarUrl: null, notes: null, lastTransaction: '1 day ago',   createdAt: '2020-06-12', updatedAt: '2024-11-24' },
  { id: '2',  customerId: 'CUST-4402', fullName: 'Sarah Al-Fayed',   nationality: 'UAE',         documentType: 'Resident ID',  documentNumber: 'R-44218903',  documentExpiry: '2025-03-05', expiryStatus: 'EXPIRING', riskLevel: 'MEDIUM', lifetimeVolume: 128900, preferredPair: 'AED/USD', activeSince: '2021-01-08', avatarUrl: null, notes: 'VIP client — priority processing requested. Requires dedicated teller.', lastTransaction: '2 days ago',  createdAt: '2021-01-08', updatedAt: '2024-11-24' },
  { id: '3',  customerId: 'CUST-3188', fullName: 'Wei Chen',         nationality: 'China',       documentType: 'Passport',     documentNumber: 'CN-88712345', documentExpiry: '2022-08-20', expiryStatus: 'EXPIRED',  riskLevel: 'LOW',    lifetimeVolume: 1200,   preferredPair: 'CNY/USD', activeSince: '2022-03-20', avatarUrl: null, notes: null, lastTransaction: '15 days ago', createdAt: '2022-03-20', updatedAt: '2024-10-10' },
  { id: '4',  customerId: 'CUST-8812', fullName: 'Elena Popova',     nationality: 'Bulgaria',    documentType: 'EU ID Card',   documentNumber: 'BG-55129900', documentExpiry: '2028-12-01', expiryStatus: 'VALID',    riskLevel: 'LOW',    lifetimeVolume: 15000,  preferredPair: 'EUR/USD', activeSince: '2019-11-30', avatarUrl: null, notes: null, lastTransaction: '5 days ago',  createdAt: '2019-11-30', updatedAt: '2024-10-20' },
  { id: '5',  customerId: 'CUST-1029', fullName: 'Marcus Thorne',    nationality: 'UK',          documentType: 'Passport',     documentNumber: 'UK-33981200', documentExpiry: '2026-07-18', expiryStatus: 'VALID',    riskLevel: 'LOW',    lifetimeVolume: 8700,   preferredPair: 'GBP/USD', activeSince: '2021-05-14', avatarUrl: null, notes: null, lastTransaction: '3 days ago',  createdAt: '2021-05-14', updatedAt: '2024-10-22' },
  { id: '6',  customerId: 'CUST-7731', fullName: 'Alejandro Vega',   nationality: 'Argentina',   documentType: 'DNI',          documentNumber: 'AR-12994821', documentExpiry: '2029-01-10', expiryStatus: 'VALID',    riskLevel: 'HIGH',   lifetimeVolume: 310500, preferredPair: 'ARS/USD', activeSince: '2019-03-05', avatarUrl: null, notes: '[FLAGGED] Multiple large cash deposits exceeding $50k in rolling 30-day window. SAR filed 2024-09-15.', lastTransaction: '12 hours ago', createdAt: '2019-03-05', updatedAt: '2024-11-24' },
  { id: '7',  customerId: 'CUST-5519', fullName: 'Yuki Tanaka',      nationality: 'Japan',       documentType: 'Passport',     documentNumber: 'JP-44829100', documentExpiry: '2027-09-22', expiryStatus: 'VALID',    riskLevel: 'LOW',    lifetimeVolume: 67200,  preferredPair: 'JPY/USD', activeSince: '2022-07-01', avatarUrl: null, notes: null, lastTransaction: '1 week ago',  createdAt: '2022-07-01', updatedAt: '2024-11-18' },
  { id: '8',  customerId: 'CUST-2205', fullName: 'Fatima Hassan',    nationality: 'Egypt',       documentType: 'Passport',     documentNumber: 'EG-77541233', documentExpiry: '2025-01-30', expiryStatus: 'EXPIRING', riskLevel: 'LOW',    lifetimeVolume: 23400,  preferredPair: 'EUR/USD', activeSince: '2023-02-14', avatarUrl: null, notes: null, lastTransaction: '4 days ago',  createdAt: '2023-02-14', updatedAt: '2024-11-20' },
  { id: '9',  customerId: 'CUST-6610', fullName: 'Pierre Dubois',    nationality: 'France',      documentType: 'EU ID Card',   documentNumber: 'FR-88123400', documentExpiry: '2026-06-30', expiryStatus: 'VALID',    riskLevel: 'MEDIUM', lifetimeVolume: 89100,  preferredPair: 'EUR/USD', activeSince: '2020-11-22', avatarUrl: null, notes: 'Under enhanced monitoring — source of funds review pending.', lastTransaction: '6 days ago',  createdAt: '2020-11-22', updatedAt: '2024-11-15' },
  { id: '10', customerId: 'CUST-3399', fullName: 'Ana Ferreira',     nationality: 'Brazil',      documentType: 'Passport',     documentNumber: 'BR-55128700', documentExpiry: '2025-11-12', expiryStatus: 'VALID',    riskLevel: 'LOW',    lifetimeVolume: 5800,   preferredPair: 'BRL/USD', activeSince: '2024-01-20', avatarUrl: null, notes: null, lastTransaction: '2 weeks ago', createdAt: '2024-01-20', updatedAt: '2024-11-10' },
];

// ─── VAULT INVENTORY ─────────────────────────────────────────────────────
export const vaultCurrencies: VaultCurrency[] = [
  {
    id: '1', currency: 'USD', currencyName: 'US Dollar', vaultName: 'Primary Vault',
    totalAmount: 145200.00, alertLevel: 'CRITICAL',
    denominations: [
      { id: 'd1', label: '$100 Bills', units: 1200, amount: 120000, level: 'healthy' },
      { id: 'd2', label: '$50 Bills', units: 400, amount: 20000, level: 'normal' },
      { id: 'd3', label: '$20 Bills', units: 150, amount: 3000, level: 'critical' },
      { id: 'd4', label: '$10 Bills', units: 200, amount: 2000, level: 'low' },
    ],
  },
  {
    id: '2', currency: 'EUR', currencyName: 'Euro', vaultName: 'Zone 1 Bins',
    totalAmount: 82000.00, alertLevel: 'HEALTHY',
    denominations: [
      { id: 'd5', label: '€500 Bills', units: 100, amount: 50000, level: 'healthy' },
      { id: 'd6', label: '€200 Bills', units: 110, amount: 22000, level: 'healthy' },
      { id: 'd7', label: '€100 Bills', units: 80, amount: 8000, level: 'normal' },
      { id: 'd8', label: '€50 Bills', units: 40, amount: 2000, level: 'normal' },
    ],
  },
  {
    id: '3', currency: 'GBP', currencyName: 'British Pound', vaultName: 'Vault Secure B',
    totalAmount: 64500.00, alertLevel: 'MINOR_ALERT',
    denominations: [
      { id: 'd9', label: '£50 Notes', units: 1000, amount: 50000, level: 'healthy' },
      { id: 'd10', label: '£20 Notes', units: 500, amount: 10000, level: 'low' },
      { id: 'd11', label: '£10 Notes', units: 400, amount: 4000, level: 'normal' },
      { id: 'd12', label: '£5 Notes', units: 100, amount: 500, level: 'critical' },
    ],
  },
  {
    id: '4', currency: 'JPY', currencyName: 'Japanese Yen', vaultName: 'East Wing Safe',
    totalAmount: 22450000.00, alertLevel: 'HEALTHY',
    denominations: [
      { id: 'd13', label: '¥10,000 Bills', units: 1800, amount: 18000000, level: 'healthy' },
      { id: 'd14', label: '¥5,000 Bills', units: 600, amount: 3000000, level: 'normal' },
      { id: 'd15', label: '¥1,000 Bills', units: 1450, amount: 1450000, level: 'normal' },
    ],
  },
  {
    id: '5', currency: 'CHF', currencyName: 'Swiss Franc', vaultName: 'Vault Secure A',
    totalAmount: 38500.00, alertLevel: 'CRITICAL',
    denominations: [
      { id: 'd16', label: 'Fr.1000 Bills', units: 25, amount: 25000, level: 'low' },
      { id: 'd17', label: 'Fr.200 Bills', units: 50, amount: 10000, level: 'normal' },
      { id: 'd18', label: 'Fr.100 Bills', units: 35, amount: 3500, level: 'critical' },
    ],
  },
];

export const vaultSummary: VaultSummary = {
  totalValue: 1245800.00,
  valueChange: 0.42,
  criticalAlerts: 2,
  minorAlerts: 1,
  alertCurrencies: ['USD', 'CHF', 'GBP'],
  inventoryHealth: 'Warning',
  totalCurrencies: 5,
};

export const vaultAdjustments: VaultAdjustment[] = [
  { id: '1', currency: 'USD', amount: 25000.00,  type: 'INBOUND',  notes: 'CIT delivery — Brinks',                     user: 'S. Henderson (Lead)', status: 'VERIFIED', createdAt: '2024-11-24T12:45:12Z' },
  { id: '2', currency: 'EUR', amount: -5000.00,   type: 'OUTBOUND', notes: 'Wholesale order #WO-2291',                  user: 'M. Kovic',            status: 'VERIFIED', createdAt: '2024-11-24T11:20:05Z' },
  { id: '3', currency: 'GBP', amount: 2500.00,    type: 'MANUAL',   notes: 'Recount adjustment — off by +2,500',        user: 'S. Henderson (Lead)', status: 'PENDING',  createdAt: '2024-11-24T09:15:44Z' },
  { id: '4', currency: 'USD', amount: -12500.00,  type: 'OUTBOUND', notes: 'Transaction TX-99281 — customer withdrawal', user: 'M. Teller',           status: 'VERIFIED', createdAt: '2024-11-24T08:30:22Z' },
  { id: '5', currency: 'JPY', amount: 5000000.00, type: 'INBOUND',  notes: 'Branch transfer from HQ',                   user: 'S. Henderson (Lead)', status: 'VERIFIED', createdAt: '2024-11-23T16:10:45Z' },
  { id: '6', currency: 'CHF', amount: -8000.00,   type: 'OUTBOUND', notes: 'Customer swap CHF→EUR',                     user: 'M. Kovic',            status: 'VERIFIED', createdAt: '2024-11-23T14:55:10Z' },
  { id: '7', currency: 'EUR', amount: 15000.00,   type: 'INBOUND',  notes: 'CIT delivery — G4S',                        user: 'S. Henderson (Lead)', status: 'PENDING',  createdAt: '2024-11-23T10:05:33Z' },
];
