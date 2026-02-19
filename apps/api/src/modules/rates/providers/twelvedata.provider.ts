import type { MultiSourceProvider, MultiSourceResult, MultiSourceQuote } from './rate-provider.interface';

/**
 * Source C: TwelveData
 * GET https://api.twelvedata.com/price?symbol=EUR/USD&apikey=...
 * Returns: { "price": "1.08421" }
 *
 * NOTE: TwelveData uses "QUOTE/BASE" format (e.g. EUR/USD = how many USD per 1 EUR).
 * For our system we store USD/EUR = how many EUR per 1 USD, so we invert.
 * For USDT/USD and XAU/USD, the symbol format is different — handled below.
 *
 * Returns mid only. Fetches per-pair (batched via Promise.allSettled).
 */
export class TwelveDataProvider implements MultiSourceProvider {
  readonly name = 'twelvedata';
  readonly label = 'TwelveData';

  private readonly apiKey: string;

  constructor() {
    this.apiKey = process.env.TWELVEDATA_API_KEY ?? '';
  }

  async fetchRates(base: string, quotes: string[]): Promise<MultiSourceResult> {
    if (!this.apiKey) {
      return { quotes: [], latencyMs: 0 };
    }

    const start = Date.now();

    const fetches = quotes.map(async (quote): Promise<MultiSourceQuote | null> => {
      try {
        const { symbol, invert } = this.getSymbol(base, quote);
        const url = `https://api.twelvedata.com/price?symbol=${symbol}&apikey=${this.apiKey}`;

        const res = await fetch(url);
        if (!res.ok) return null;

        const data: { price?: string; code?: number } = await res.json();
        if (!data.price || data.code) return null;

        let mid = parseFloat(data.price);
        if (isNaN(mid) || mid <= 0) return null;

        // Invert if needed (TwelveData returns QUOTE/BASE for fiat)
        if (invert) mid = 1 / mid;

        return {
          base,
          quote,
          bid: null,
          ask: null,
          mid,
          timestamp: new Date(),
        };
      } catch {
        return null;
      }
    });

    const results = await Promise.allSettled(fetches);
    const latencyMs = Date.now() - start;

    const validQuotes: MultiSourceQuote[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        validQuotes.push(r.value);
      }
    }

    return { quotes: validQuotes, latencyMs };
  }

  /**
   * TwelveData symbol mapping.
   * Fiat pairs: "EUR/USD" (quote/base in their format) — we invert to get USD/EUR.
   * Crypto: "USDT/USD" — direct, no invert.
   * Commodity: "XAU/USD" — returns USD per 1 oz, we want USD/XAU (how many XAU per 1 USD) so invert.
   */
  private getSymbol(base: string, quote: string): { symbol: string; invert: boolean } {
    if (quote === 'USDT') {
      // USDT/USD returns price of 1 USDT in USD (~1.0)
      // We want USD/USDT = how many USDT per 1 USD, so invert
      return { symbol: 'USDT/USD', invert: true };
    }
    if (quote === 'XAU') {
      // XAU/USD returns price of 1 oz gold in USD (~2150)
      // We want USD/XAU = how many oz per 1 USD, so invert
      return { symbol: 'XAU/USD', invert: true };
    }
    // Fiat: "EUR/USD" returns price of 1 EUR in USD
    // We want USD/EUR = how many EUR per 1 USD, so invert
    return { symbol: `${quote}/${base}`, invert: true };
  }
}
