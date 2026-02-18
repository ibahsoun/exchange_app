export interface Transaction {
  id: string;
  receiptId: string;
  customerId: string;
  customerName: string;
  customerInitials: string;
  type: 'BUY' | 'SELL' | 'SWAP';
  base: string;
  quote: string;
  amountIn: number;
  amountOut: number;
  rateApplied: number;
  spread: number;
  status: 'COMPLETED' | 'PENDING' | 'FAILED' | 'CANCELLED';
  tellerId?: string;
  kycName?: string;
  kycDocId?: string;
  kycPurpose?: string;
  kycSource?: string;
  createdAt: string;
}
