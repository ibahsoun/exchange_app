export interface VaultDenomination {
  id: string;
  label: string;
  units: number;
  amount: number;
  level: 'critical' | 'low' | 'normal' | 'healthy';
}

export interface VaultCurrency {
  id: string;
  currency: string;
  currencyName: string;
  vaultName: string;
  totalAmount: number;
  alertLevel: 'HEALTHY' | 'MINOR_ALERT' | 'CRITICAL';
  denominations: VaultDenomination[];
}

export interface VaultAdjustment {
  id: string;
  currency: string;
  amount: number;
  type: 'INBOUND' | 'OUTBOUND' | 'MANUAL';
  notes?: string;
  user: string;
  status: 'VERIFIED' | 'PENDING' | 'REJECTED';
  createdAt: string;
}

export interface VaultSummary {
  totalValue: number;
  valueChange: number;
  criticalAlerts: number;
  minorAlerts: number;
  alertCurrencies: string[];
  inventoryHealth: 'Optimal' | 'Warning' | 'Critical';
  totalCurrencies: number;
}
