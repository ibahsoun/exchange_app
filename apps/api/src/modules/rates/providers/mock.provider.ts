import type { RateProvider, RateQuote } from './rate-provider.interface';

/**
 * Mock provider that generates realistic FX rates with small random fluctuations.
 * Used in development and testing. Replace with a real provider for production.
 */

// Base mid-market rates vs USD (realistic as of late 2023)
const BASE_RATES: Record<string, number> = {
  EUR: 0.9245,
  CNY: 7.2410,
  BRL: 4.9720,
  PYG: 7350.0,
  AED: 3.6725,
  ARS: 850.5,
  USDT: 1.0001,
  GBP: 0.7923,
  JPY: 149.5,
  CHF: 0.8812,
  CAD: 1.3550,
  AUD: 1.5290,
  XAU: 0.000475, // USD per troy ounce inverted → 1/2105
};

// Typical spread in pips for each pair
const SPREADS: Record<string, number> = {
  EUR: 0.0015,
  CNY: 0.004,
  BRL: 0.008,
  PYG: 30.0,
  AED: 0.0005,
  ARS: 9.5,
  USDT: 0.0002,
  GBP: 0.002,
  JPY: 0.3,
  CHF: 0.002,
  CAD: 0.003,
  AUD: 0.003,
  XAU: 0.000002,
};

const SUPPORTED_QUOTES = Object.keys(BASE_RATES);

export class MockRateProvider implements RateProvider {
  readonly name = 'mock';

  // Store last rates to create realistic walk
  private lastRates = new Map<string, number>();

  getSupportedQuotes(): string[] {
    return SUPPORTED_QUOTES;
  }

  async fetchRates(base: string): Promise<RateQuote[]> {
    if (base !== 'USD') {
      throw new Error(`MockProvider only supports USD as base, got ${base}`);
    }

    const now = new Date();

    return SUPPORTED_QUOTES.map((quote) => {
      const baseRate = BASE_RATES[quote];
      const spreadHalf = SPREADS[quote] / 2;

      // Random walk: ±0.05% max step from last value
      const lastMid = this.lastRates.get(quote) ?? baseRate;
      const maxStep = lastMid * 0.0005;
      const step = (Math.random() - 0.5) * 2 * maxStep;
      const mid = lastMid + step;

      this.lastRates.set(quote, mid);

      const bid = mid - spreadHalf;
      const ask = mid + spreadHalf;

      return {
        base: 'USD',
        quote,
        bid: Number(bid.toPrecision(8)),
        ask: Number(ask.toPrecision(8)),
        mid: Number(mid.toPrecision(8)),
        spread: Number((ask - bid).toPrecision(6)),
        timestamp: now,
      };
    });
  }
}
