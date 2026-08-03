import { describe, it, expect } from 'vitest';
import { computeBidAsk, DEFAULT_SPREAD_CONFIG } from '../src/modules/rates/spread.util';
import { TransactionsService } from '../src/modules/transactions/transactions.service';

describe('smoke', () => {
  it('imports spread.util and computes', () => {
    const r = computeBidAsk(5.0792, DEFAULT_SPREAD_CONFIG);
    expect(r.bid).toBe(5.0792);
    expect(r.ask).toBe(5.0792);
  });

  it('imports TransactionsService', () => {
    expect(typeof TransactionsService).toBe('function');
  });
});
