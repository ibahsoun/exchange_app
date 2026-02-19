export interface Customer {
  id: string;
  customerId: string;
  name: string;
  phone: string | null;
  email: string | null;
  level: number; // 1-5 star rating
  createdAt: string;
  updatedAt: string;
}
