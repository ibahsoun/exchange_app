import { describe, expect, it } from 'vitest';
import { LiveMarketClient, type VendorRow } from '../src/modules/rates/providers/live-market.provider';
import type { LiveMarketConfig } from '../src/modules/rates/providers/live-market.config';

/**
 * The store rate and all pricing anchor on the BID of our orientation, not the
 * vendor's mid. These tests pin that rule for every resolution path.
 */

const CONFIG: LiveMarketConfig = {
  name: 'betaserver',
  label: 'Beta Broadcaster',
  baseUrl: 'https://example.test',
  ratesPath: '/fxrates',
  fetchMode: 'per-pair',
  apiKey: '',
  apiSecret: '',
  authScheme: 'none',
  authKeyName: '',
  timeoutMs: 1000,
  cacheTtlMs: 1000,
  staleAfterMs: 60000,
  symbols: {
    BRL: { symbol: 'usdbrl', invert: false },
    EUR: { symbol: 'eurusd', invert: true },
    USDT: { derive: { numerator: 'usdbrl', denominator: 'usdtbrl' } },
  },
};

function row(symbol: string, bid: number | null, ask: number | null, mid: number | null): VendorRow {
  return {
    symbol,
    bid,
    ask,
    mid,
    timestamp: new Date('2026-08-03T11:42:14Z'),
    receivedAt: new Date('2026-08-03T11:44:16Z'),
  };
}

describe('live-market anchor = bid', () => {
  it('direct pair: anchor is the feed bid, not the vendor mid', () => {
    const client = new LiveMarketClient(CONFIG);
    // The exact payload from the vendor: bid 5.0751 / ask 5.0771 / mid 5.0761
    client.applyVendorRow(row('USDBRL', 5.0751, 5.0771, 5.0761));
    const tick = client.getLatest('BRL')!;
    expect(tick.mid).toBe(5.0751); // anchor = bid
    expect(tick.bid).toBe(5.0751); // sides preserved for spread display
    expect(tick.ask).toBe(5.0771);
  });

  it('inverted pair: anchor is the bid of OUR orientation (1/vendor ask)', () => {
    const client = new LiveMarketClient(CONFIG);
    // Vendor quotes EUR/USD 1.0850 / 1.0854; our USD/EUR bid = 1/1.0854.
    client.applyVendorRow(row('EURUSD', 1.085, 1.0854, 1.0852));
    const tick = client.getLatest('EUR')!;
    // 1/1.0854 = 0.9213249... (bid, the cheaper side of the flipped pair)
    expect(tick.mid).toBeCloseTo(1 / 1.0854, 10);
    expect(tick.bid).toBeCloseTo(1 / 1.0854, 10);
    expect(tick.ask).toBeCloseTo(1 / 1.085, 10);
  });

  it('derived cross: anchor is the cross bid (numerator bid over denominator ask)', () => {
    const client = new LiveMarketClient(CONFIG);
    client.applyVendorRow(row('USDBRL', 5.0, 5.02, 5.01));
    client.applyVendorRow(row('USDTBRL', 4.98, 5.0, 4.99));
    const tick = client.getLatest('USDT')!;
    // cross bid = 5.0 / 5.0 = 1.0; cross ask = 5.02 / 4.98 = 1.00803213
    expect(tick.mid).toBeCloseTo(5.0 / 5.0, 10); // anchor = cross bid
    expect(tick.bid).toBeCloseTo(5.0 / 5.0, 10);
    expect(tick.ask).toBeCloseTo(5.02 / 4.98, 8);
  });

  it('one-sided quote (only last/mid published): bid = ask = anchor = that price', () => {
    const client = new LiveMarketClient(CONFIG);
    client.applyVendorRow(row('USDBRL', null, null, 5.08));
    const tick = client.getLatest('BRL')!;
    expect(tick.mid).toBe(5.08);
    expect(tick.bid).toBe(5.08);
    expect(tick.ask).toBe(5.08);
  });
});
