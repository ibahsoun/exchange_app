import { z } from 'zod';

export const DenominationLevel = z.enum(['critical', 'low', 'normal', 'healthy']);
export const AlertLevel = z.enum(['HEALTHY', 'MINOR_ALERT', 'CRITICAL']);
export const AdjustmentType = z.enum(['INBOUND', 'OUTBOUND', 'MANUAL']);
export const AdjustmentStatus = z.enum(['VERIFIED', 'PENDING', 'REJECTED']);

export const VaultDenominationSchema = z.object({
  id: z.string(),
  label: z.string(),
  units: z.number().int().nonnegative(),
  amount: z.number().nonnegative(),
  level: DenominationLevel,
});

export const VaultCurrencySchema = z.object({
  id: z.string(),
  currency: z.string(),
  currencyName: z.string(),
  vaultName: z.string(),
  totalAmount: z.number().nonnegative(),
  alertLevel: AlertLevel,
  denominations: z.array(VaultDenominationSchema),
});

export const VaultAdjustmentSchema = z.object({
  id: z.string(),
  currency: z.string(),
  amount: z.number(),
  type: AdjustmentType,
  notes: z.string().optional(),
  user: z.string(),
  status: AdjustmentStatus,
  createdAt: z.string(),
});

export const VaultSummarySchema = z.object({
  totalValue: z.number(),
  valueChange: z.number(),
  criticalAlerts: z.number().int(),
  minorAlerts: z.number().int(),
  alertCurrencies: z.array(z.string()),
  inventoryHealth: z.enum(['Optimal', 'Warning', 'Critical']),
  totalCurrencies: z.number().int(),
});

export type VaultDenomination = z.infer<typeof VaultDenominationSchema>;
export type VaultCurrency = z.infer<typeof VaultCurrencySchema>;
export type VaultAdjustment = z.infer<typeof VaultAdjustmentSchema>;
export type VaultSummary = z.infer<typeof VaultSummarySchema>;
