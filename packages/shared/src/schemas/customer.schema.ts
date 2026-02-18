import { z } from 'zod';

export const ExpiryStatus = z.enum(['VALID', 'EXPIRING', 'EXPIRED']);
export const RiskLevel = z.enum(['LOW', 'MEDIUM', 'HIGH']);

export const CustomerSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  fullName: z.string().min(1),
  nationality: z.string().min(1),
  documentType: z.string().min(1),
  documentNumber: z.string().min(1),
  documentExpiry: z.string(),
  expiryStatus: ExpiryStatus,
  riskLevel: RiskLevel,
  lifetimeVolume: z.number(),
  preferredPair: z.string().nullable(),
  activeSince: z.string(),
  avatarUrl: z.string().nullable(),
  notes: z.string().nullable(),
  lastTransaction: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreateCustomerSchema = CustomerSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lifetimeVolume: true,
  lastTransaction: true,
});

export type Customer = z.infer<typeof CustomerSchema>;
export type CreateCustomerInput = z.infer<typeof CreateCustomerSchema>;
