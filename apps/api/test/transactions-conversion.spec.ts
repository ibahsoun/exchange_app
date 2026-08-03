import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import {
  TransactionsService,
  type CreateTransactionDto,
} from '../src/modules/transactions/transactions.service';

/**
 * Conversion math for TransactionsService.create().
 *
 * All expected values are derived BY HAND from the documented business intent
 * (see comments in transactions.service.ts and rates.constants.ts):
 *   - feeOffset(mid) = mid * percent/100 - points * FEE_POINT_VALUE (0.01)
 *     The % moves the rate AGAINST the customer; points and the pair spread
 *     are discounts back toward the customer.
 *   - USD -> foreign:  out = in * (mid + spread - feeOffset(mid))
 *     inverted fee (stored on <quote>/USD): the customer pays a USD-per-unit
 *     price of 1/(mid+spread) + feeOffset(1/mid), so out = in / that price.
 *   - foreign -> USD:  out = in / (mid - spread + feeOffset(mid))
 *     flipped fee (stored on <base>/USD): out = in * (1/(mid-spread) - feeOffset(1/mid))
 *   - cross:           crossAdj = (qMid + qSpread)/(bMid - bSpread), crossMid = qMid/bMid
 *                      out = in * (crossAdj - feeOffset(crossMid)),
 *     inverted fee:    out = in / (1/crossAdj + feeOffset(1/crossMid))
 *   - destination FIXED commission: flat subtraction; PERCENTAGE: * (1 - pct/100);
 *     zero/negative commission ignored.
 *   - persisted: amountOut = toFixed(2), rateApplied = effectiveRate toFixed(8)
 *     where effectiveRate = (amountOut AFTER destination fee, BEFORE 2dp
 *     rounding) / amountIn; spread column = baseLeg.spread + quoteLeg.spread.
 */

// ─── Fixtures ──────────────────────────────────────────────

const CUSTOMER = { id: 'cust-1', name: 'Test Customer', customerId: 'C-001' };

function rateRow(quote: string, mid: number, spread: number) {
  // Shape of RatesService.getLatestRates() rows (LiveRate); create() consumes
  // base, quote, mid and spread.
  return {
    base: 'USD',
    quote,
    mid,
    spread,
    bid: mid - spread / 2,
    ask: mid + spread / 2,
    trend: 'stable' as const,
    overridden: false,
    timestamp: '2026-08-03T00:00:00.000Z',
  };
}

// USD/BRL mid 5, pair spread 0.02 — USD/EUR mid 2, pair spread 0.04
const RATES = [rateRow('BRL', 5, 0.02), rateRow('EUR', 2, 0.04)];

// Shape of MultiSourceService.getCustomerPairFee() result
interface Fee {
  base: string;
  quote: string;
  percent: number;
  points: number;
}

interface MakeOpts {
  customer?: typeof CUSTOMER | null;
  rates?: ReturnType<typeof rateRow>[];
  fee?: Fee | null;
  destination?: { id: string; commission: number; commissionType: string } | null;
}

function makeService(opts: MakeOpts = {}) {
  const customer = opts.customer === undefined ? CUSTOMER : opts.customer;
  const rates = opts.rates === undefined ? RATES : opts.rates;
  const fee = opts.fee === undefined ? null : opts.fee;
  const destination = opts.destination === undefined ? null : opts.destination;

  const createCalls: any[] = [];
  const destinationCalls: any[] = [];
  const feeCalls: any[] = [];
  const ratesCalls: any[] = [];

  const prisma = {
    customer: { findUnique: async (_args: any) => customer },
    destination: {
      findUnique: async (args: any) => {
        destinationCalls.push(args);
        return destination;
      },
    },
    transaction: {
      create: async (args: any) => {
        createCalls.push(args);
        return { ...args.data, id: 'tx1', customer: { name: CUSTOMER.name, customerId: CUSTOMER.customerId } };
      },
      findFirst: async () => null,
    },
  };
  const ratesService = {
    getLatestRates: async (base: string) => {
      ratesCalls.push(base);
      return rates;
    },
  };
  const multiSourceService = {
    getCustomerPairFee: async (customerId: string, a: string, b: string) => {
      feeCalls.push([customerId, a, b]);
      return fee;
    },
  };

  const svc = new TransactionsService(prisma as any, ratesService as any, multiSourceService as any);
  const persisted = () => createCalls[createCalls.length - 1].data;
  return { svc, persisted, createCalls, destinationCalls, feeCalls, ratesCalls };
}

function dto(base: string, quote: string, amountIn: number, destinationId?: string): CreateTransactionDto {
  return {
    type: 'SWAP',
    base,
    quote,
    amountIn,
    customerId: 'cust-1',
    ...(destinationId ? { destinationId } : {}),
  };
}

// ─── USD -> foreign (base USD) ─────────────────────────────

describe('USD -> foreign (USD/BRL mid 5, spread 0.02)', () => {
  it('no fee: pair spread is a discount that raises amountOut (100 * 5.02 = 502)', async () => {
    const { svc, persisted, feeCalls, ratesCalls } = makeService();
    await svc.create(dto('USD', 'BRL', 100));
    const data = persisted();
    // out = 100 * (5 + 0.02) = 502 — strictly above the 500 the bare mid gives
    expect(data.amountOut).toBe(502);
    expect(data.amountOut).toBeGreaterThan(100 * 5);
    expect(data.rateApplied).toBe(5.02);
    // spread column = baseLeg(0, USD) + quoteLeg(0.02)
    expect(data.spread).toBeCloseTo(0.02, 10);
    // plumbing: rates fetched with USD base; fee looked up as (customerId, base, quote)
    expect(ratesCalls).toEqual(['USD']);
    expect(feeCalls).toEqual([['cust-1', 'USD', 'BRL']]);
  });

  it('percent-only fee (1%) moves the rate against the customer', async () => {
    const { svc, persisted } = makeService({
      fee: { base: 'USD', quote: 'BRL', percent: 1, points: 0 },
    });
    await svc.create(dto('USD', 'BRL', 100));
    const data = persisted();
    // feeOffset(5) = 5*1/100 = 0.05 → out = 100 * (5.02 - 0.05) = 497
    expect(data.amountOut).toBe(497);
    expect(data.rateApplied).toBe(4.97);
  });

  it('points-only fee (2pt) is a discount back to the customer', async () => {
    const { svc, persisted } = makeService({
      fee: { base: 'USD', quote: 'BRL', percent: 0, points: 2 },
    });
    await svc.create(dto('USD', 'BRL', 100));
    const data = persisted();
    // feeOffset(5) = -2*0.01 = -0.02 → out = 100 * (5.02 + 0.02) = 504
    expect(data.amountOut).toBe(504);
    expect(data.rateApplied).toBe(5.04);
  });

  it('percent + points combine (1% + 2pt)', async () => {
    const { svc, persisted } = makeService({
      fee: { base: 'USD', quote: 'BRL', percent: 1, points: 2 },
    });
    await svc.create(dto('USD', 'BRL', 100));
    const data = persisted();
    // feeOffset(5) = 0.05 - 0.02 = 0.03 → out = 100 * (5.02 - 0.03) = 499
    expect(data.amountOut).toBe(499);
    expect(data.rateApplied).toBe(4.99);
  });

  it('fee stored on the inverted pair (BRL/USD) is applied on that side', async () => {
    const { svc, persisted } = makeService({
      fee: { base: 'BRL', quote: 'USD', percent: 1, points: 2 },
    });
    await svc.create(dto('USD', 'BRL', 100));
    const data = persisted();
    // Flipped mid = 1/5 = 0.2. feeOffset(0.2) = 0.2*1/100 - 2*0.01 = 0.002 - 0.02 = -0.018
    // USD-per-BRL price customer pays = 1/(5.02) - 0.018 = 0.1992031872... - 0.018
    //                                = 0.1812031872...
    // out = 100 / 0.1812031872... = 551.8666725... → persisted 551.87
    const expectedOut = 100 / (1 / 5.02 + ((1 / 5) * 1) / 100 - 2 * 0.01);
    expect(data.amountOut).toBe(551.87);
    // rateApplied keeps the pre-2dp-rounding value: ≈ 5.5186667, NOT 551.87/100 = 5.5187
    expect(data.rateApplied).toBeCloseTo(expectedOut / 100, 7);
    expect(data.rateApplied).not.toBe(5.5187);
  });

  it('a zero fee stored inverted behaves exactly like no fee', async () => {
    const { svc, persisted } = makeService({
      fee: { base: 'BRL', quote: 'USD', percent: 0, points: 0 },
    });
    await svc.create(dto('USD', 'BRL', 100));
    // 1/(1/5.02 + 0) = 5.02 → out = 502, identical to the no-fee path
    expect(persisted().amountOut).toBe(502);
    expect(persisted().rateApplied).toBe(5.02);
  });
});

// ─── foreign -> USD (quote USD) ────────────────────────────

describe('foreign -> USD (USD/BRL mid 5, spread 0.02)', () => {
  it('no fee: spread lowers what the customer pays per USD (100 / 4.98)', async () => {
    const { svc, persisted, feeCalls } = makeService();
    await svc.create(dto('BRL', 'USD', 100));
    const data = persisted();
    // customer pays mid - spread = 4.98 BRL per USD → out = 100/4.98 = 20.0803212851...
    expect(data.amountOut).toBe(20.08);
    expect(data.amountOut).toBeGreaterThan(100 / 5); // spread benefits the customer
    // rateApplied = 0.200803212851... → toFixed(8) = 0.20080321
    expect(data.rateApplied).toBe(0.20080321);
    expect(data.spread).toBeCloseTo(0.02, 10);
    expect(feeCalls).toEqual([['cust-1', 'BRL', 'USD']]);
  });

  it('percent-only fee stored as USD/BRL raises what the customer pays', async () => {
    const { svc, persisted } = makeService({
      fee: { base: 'USD', quote: 'BRL', percent: 1, points: 0 },
    });
    await svc.create(dto('BRL', 'USD', 100));
    const data = persisted();
    // customer pays 4.98 + 0.05 = 5.03 → out = 100/5.03 = 19.8807157... → 19.88
    expect(data.amountOut).toBe(19.88);
    // 1/5.03 = 0.198807157... → toFixed(8) ≈ 0.19880716
    expect(data.rateApplied).toBeCloseTo(1 / 5.03, 7);
  });

  it('points-only fee stored as USD/BRL discounts what the customer pays', async () => {
    const { svc, persisted } = makeService({
      fee: { base: 'USD', quote: 'BRL', percent: 0, points: 2 },
    });
    await svc.create(dto('BRL', 'USD', 100));
    const data = persisted();
    // customer pays 4.98 - 0.02 = 4.96 → out = 100/4.96 = 20.1612903... → 20.16
    expect(data.amountOut).toBe(20.16);
    expect(data.rateApplied).toBe(0.2016129);
  });

  it('percent + points stored as USD/BRL (pays 5.01 per USD)', async () => {
    const { svc, persisted } = makeService({
      fee: { base: 'USD', quote: 'BRL', percent: 1, points: 2 },
    });
    await svc.create(dto('BRL', 'USD', 100));
    const data = persisted();
    // matches the service's own doc example shape: pays mid - spread + mid*1% - 2pt
    // = 5 - 0.02 + 0.05 - 0.02 = 5.01 → out = 100/5.01 = 19.9600798... → 19.96
    expect(data.amountOut).toBe(19.96);
    expect(data.rateApplied).toBeCloseTo(1 / 5.01, 7);
  });

  it('fee stored on the flipped pair (BRL/USD) is applied on the USD-per-BRL side', async () => {
    const { svc, persisted } = makeService({
      fee: { base: 'BRL', quote: 'USD', percent: 1, points: 2 },
    });
    await svc.create(dto('BRL', 'USD', 100));
    const data = persisted();
    // Flipped mid = 0.2. feeOffset(0.2) = 0.002 - 0.02 = -0.018
    // customer receives 1/4.98 - (-0.018) = 0.2008032128... + 0.018 = 0.2188032128... USD per BRL
    // out = 100 * 0.2188032128... = 21.8803212... → 21.88
    expect(data.amountOut).toBe(21.88);
    expect(data.rateApplied).toBe(0.21880321);
  });
});

// ─── foreign -> foreign cross through USD ──────────────────

describe('cross EUR -> BRL (USD/EUR mid 2 spread 0.04, USD/BRL mid 5 spread 0.02)', () => {
  it('no fee: both legs spread act as discounts to the customer', async () => {
    const { svc, persisted } = makeService();
    await svc.create(dto('EUR', 'BRL', 100));
    const data = persisted();
    // crossAdj = (5 + 0.02)/(2 - 0.04) = 5.02/1.96 = 2.5612244897959...
    // out = 100 * 2.5612244897959... = 256.1224489... → 256.12 (> the 250 bare cross mid pays)
    expect(data.amountOut).toBe(256.12);
    expect(data.amountOut).toBeGreaterThan(100 * (5 / 2));
    // rateApplied = 2.5612244897959... → toFixed(8) = 2.56122449
    expect(data.rateApplied).toBe(2.56122449);
    // spread column = both legs: 0.04 + 0.02 = 0.06
    expect(data.spread).toBeCloseTo(0.06, 10);
  });

  it('fee stored in the transaction orientation (EUR/BRL) is applied on crossMid', async () => {
    const { svc, persisted } = makeService({
      fee: { base: 'EUR', quote: 'BRL', percent: 1, points: 2 },
    });
    await svc.create(dto('EUR', 'BRL', 100));
    const data = persisted();
    // crossMid = 5/2 = 2.5. feeOffset(2.5) = 2.5*1/100 - 0.02 = 0.025 - 0.02 = 0.005
    // out = 100 * (5.02/1.96 - 0.005) = 256.1224489... - 0.5 = 255.6224489... → 255.62
    expect(data.amountOut).toBe(255.62);
    expect(data.rateApplied).toBe(2.55622449);
  });

  it('fee stored on the inverted pair (BRL/EUR) is applied on 1/crossMid', async () => {
    const { svc, persisted } = makeService({
      fee: { base: 'BRL', quote: 'EUR', percent: 1, points: 2 },
    });
    await svc.create(dto('EUR', 'BRL', 100));
    const data = persisted();
    // 1/crossAdj = 1.96/5.02 = 0.3904382470...; 1/crossMid = 2/5 = 0.4
    // feeOffset(0.4) = 0.4*1/100 - 0.02 = 0.004 - 0.02 = -0.016
    // EUR-per-BRL price = 0.3904382470... - 0.016 = 0.3744382470...
    // out = 100 / 0.3744382470... = 267.0667... → 267.07
    const expectedOut = 100 / (1.96 / 5.02 + (0.4 * 1) / 100 - 2 * 0.01);
    expect(data.amountOut).toBe(267.07);
    expect(data.rateApplied).toBeCloseTo(expectedOut / 100, 7);
  });
});

// ─── Destination commission ────────────────────────────────

describe('destination commission (on USD -> BRL, gross out = 502)', () => {
  it('FIXED commission subtracts a flat amount from amountOut', async () => {
    const { svc, persisted } = makeService({
      destination: { id: 'dest-1', commission: 10, commissionType: 'FIXED' },
    });
    await svc.create(dto('USD', 'BRL', 100, 'dest-1'));
    const data = persisted();
    // out = 502 - 10 = 492; effectiveRate is the all-in rate AFTER commission
    expect(data.amountOut).toBe(492);
    expect(data.rateApplied).toBe(4.92);
    expect(data.destinationId).toBe('dest-1');
  });

  it('PERCENTAGE commission multiplies by (1 - pct/100)', async () => {
    const { svc, persisted } = makeService({
      destination: { id: 'dest-1', commission: 10, commissionType: 'PERCENTAGE' },
    });
    await svc.create(dto('USD', 'BRL', 100, 'dest-1'));
    const data = persisted();
    // out = 502 * 0.9 = 451.8
    expect(data.amountOut).toBe(451.8);
    expect(data.rateApplied).toBe(4.518);
  });

  it('zero commission is ignored', async () => {
    const { svc, persisted } = makeService({
      destination: { id: 'dest-1', commission: 0, commissionType: 'FIXED' },
    });
    await svc.create(dto('USD', 'BRL', 100, 'dest-1'));
    expect(persisted().amountOut).toBe(502);
  });

  it('negative FIXED commission is ignored', async () => {
    const { svc, persisted } = makeService({
      destination: { id: 'dest-1', commission: -5, commissionType: 'FIXED' },
    });
    await svc.create(dto('USD', 'BRL', 100, 'dest-1'));
    expect(persisted().amountOut).toBe(502);
  });

  it('negative PERCENTAGE commission is ignored', async () => {
    const { svc, persisted } = makeService({
      destination: { id: 'dest-1', commission: -3, commissionType: 'PERCENTAGE' },
    });
    await svc.create(dto('USD', 'BRL', 100, 'dest-1'));
    expect(persisted().amountOut).toBe(502);
  });

  it('no destinationId: destination is never looked up and nothing is deducted', async () => {
    const { svc, persisted, destinationCalls } = makeService({
      destination: { id: 'dest-1', commission: 10, commissionType: 'FIXED' },
    });
    await svc.create(dto('USD', 'BRL', 100));
    expect(destinationCalls).toEqual([]);
    expect(persisted().amountOut).toBe(502);
    expect(persisted().destinationId).toBe(null);
  });
});

// ─── Persisted record ──────────────────────────────────────

describe('persisted transaction record', () => {
  it('writes the full row: receipt id, echoed dto fields, status, teller', async () => {
    const { svc, persisted } = makeService();
    const result = await svc.create(dto('USD', 'BRL', 100));
    const data = persisted();
    expect(data.receiptId).toBe('TX-1');
    expect(data.customerId).toBe('cust-1');
    expect(data.destinationId).toBe(null);
    expect(data.type).toBe('SWAP');
    expect(data.base).toBe('USD');
    expect(data.quote).toBe('BRL');
    expect(data.amountIn).toBe(100);
    expect(data.status).toBe('COMPLETED');
    expect(data.tellerId).toBe('TELLER-04A');
    // create() returns what prisma returned
    expect(result.id).toBe('tx1');
    expect(result.receiptId).toBe('TX-1');
  });

  it('receipt counter increments across transactions on the same instance', async () => {
    const { svc, createCalls } = makeService();
    await svc.create(dto('USD', 'BRL', 100));
    await svc.create(dto('BRL', 'USD', 100));
    expect(createCalls[0].data.receiptId).toBe('TX-1');
    expect(createCalls[1].data.receiptId).toBe('TX-2');
  });

  it('amountOut is rounded to 2 decimals, rateApplied to 8, from the unrounded value', async () => {
    const { svc, persisted } = makeService({
      fee: { base: 'BRL', quote: 'USD', percent: 1, points: 2 },
    });
    await svc.create(dto('USD', 'BRL', 100));
    const data = persisted();
    // unrounded out = 100 / (1/5.02 - 0.018) = 551.8666725...
    expect(data.amountOut).toBe(551.87); // 2 dp
    // rateApplied is derived from the UNROUNDED amountOut (5.51866672|5 → 8 dp),
    // so it must not equal the re-derived rounded 551.87 / 100 = 5.5187
    expect(data.rateApplied).toBeCloseTo(5.518666725, 7);
    expect(Math.abs(data.rateApplied - data.amountOut / 100)).toBeGreaterThan(1e-6);
  });
});

// ─── Error paths ───────────────────────────────────────────

describe('error paths', () => {
  it('unknown customer -> BadRequestException', async () => {
    const { svc } = makeService({ customer: null });
    await expect(svc.create(dto('USD', 'BRL', 100))).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.create(dto('USD', 'BRL', 100))).rejects.toThrow('Customer not found');
  });

  it('missing rate for the base leg -> BadRequestException', async () => {
    const { svc } = makeService();
    await expect(svc.create(dto('GBP', 'USD', 100))).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.create(dto('GBP', 'USD', 100))).rejects.toThrow('No rate available for GBP');
  });

  it('missing rate for the quote leg -> BadRequestException', async () => {
    const { svc } = makeService();
    await expect(svc.create(dto('USD', 'GBP', 100))).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.create(dto('USD', 'GBP', 100))).rejects.toThrow('No rate available for GBP');
  });

  it('USD -> USD has no computable pair -> BadRequestException', async () => {
    const { svc } = makeService();
    await expect(svc.create(dto('USD', 'USD', 100))).rejects.toThrow(
      'Cannot calculate rate for USD/USD',
    );
  });
});
