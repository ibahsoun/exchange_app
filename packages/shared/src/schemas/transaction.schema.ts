import { z } from 'zod';

export const TransactionType = z.enum(['BUY', 'SELL', 'SWAP']);
export const TransactionStatus = z.enum(['COMPLETED', 'PENDING', 'FAILED', 'CANCELLED']);

export const TransactionSchema = z.object({
  id: z.string(),
  receiptId: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  customerInitials: z.string(),
  type: TransactionType,
  base: z.string().min(2).max(5),
  quote: z.string().min(2).max(5),
  amountIn: z.number().positive(),
  amountOut: z.number().positive(),
  rateApplied: z.number().positive(),
  spread: z.number().min(0),
  status: TransactionStatus,
  tellerId: z.string().optional(),
  kycName: z.string().optional(),
  kycDocId: z.string().optional(),
  kycPurpose: z.string().optional(),
  kycSource: z.string().optional(),
  createdAt: z.string(),
});

export const CreateTransactionSchema = z.object({
  type: TransactionType,
  base: z.string().min(2).max(5),
  quote: z.string().min(2).max(5),
  amountIn: z.number().positive(),
  customerId: z.string(),
  kycName: z.string().optional(),
  kycDocId: z.string().optional(),
  kycPurpose: z.string().optional(),
  kycSource: z.string().optional(),
});

export type Transaction = z.infer<typeof TransactionSchema>;
export type CreateTransactionInput = z.infer<typeof CreateTransactionSchema>;
