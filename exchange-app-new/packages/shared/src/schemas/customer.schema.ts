import { z } from 'zod';

export const CustomerSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  name: z.string().min(1),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  level: z.number().int().min(1).max(5).default(3),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreateCustomerSchema = CustomerSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Customer = z.infer<typeof CustomerSchema>;
export type CreateCustomerInput = z.infer<typeof CreateCustomerSchema>;
