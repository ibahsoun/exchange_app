export interface Customer {
  id: string;
  customerId: string;
  fullName: string;
  nationality: string;
  documentType: string;
  documentNumber: string;
  documentExpiry: string;
  expiryStatus: 'VALID' | 'EXPIRING' | 'EXPIRED';
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  lifetimeVolume: number;
  preferredPair: string | null;
  activeSince: string;
  avatarUrl: string | null;
  notes: string | null;
  lastTransaction: string | null;
  createdAt: string;
  updatedAt: string;
}
