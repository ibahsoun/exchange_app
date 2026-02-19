import type { MultiSourceProvider, MultiSourceResult, MultiSourceQuote } from './rate-provider.interface';

/**
 * Source D: OANDA Exchange Rates API v1
 * GET https://exchange-rates-api.oanda.com/v1/rates/USD.json?date=2025-08-18
 * Header: Authorization: <api_key>
 * Returns: { "quotes": { "EUR": { "bid":"0.843", "ask":"0.845", "date":"..." }, ... } }
 */
export class OandaProvider implements MultiSourceProvider {
  readonly name = 'oanda';
  readonly label = 'OANDA';

  private readonly apiKey: string;

  constructor() {
    this.apiKey = process.env.OANDA_API_KEY ?? '';
  }

  async fetchRates(base: string, quotes: string[]): Promise<MultiSourceResult> {
    if (!this.apiKey) {
      return { quotes: [], latencyMs: 0 };
    }

    // OANDA doesn't support crypto/commodity symbols the same way — filter them
    const fiatQuotes = quotes.filter((q) => !['USDT', 'XAU'].includes(q));
    if (fiatQuotes.length === 0) {
      return { quotes: [], latencyMs: 0 };
    }

    const url = `https://exchange-rates-api.oanda.com/v1/rates/${base}.json?date=2025-08-18`;

    const start = Date.now();
    const res = await fetch(url, {
      headers: { Authorization: this.apiKey },
    });
    const latencyMs = Date.now() - start;

    if (!res.ok) {
      throw new Error(`OANDA HTTP ${res.status}: ${await res.text()}`);
    }

    const data: {
      quotes: Record<string, { bid: string; ask: string; date: string }>;
    } = await res.json();

    const fiatSet = new Set(fiatQuotes);
    const results: MultiSourceQuote[] = [];

    for (const [currency, rate] of Object.entries(data.quotes)) {
      if (!fiatSet.has(currency)) continue;

      const bid = parseFloat(rate.bid);
      const ask = parseFloat(rate.ask);
      if (isNaN(bid) || isNaN(ask) || bid <= 0 || ask <= 0) continue;

      const mid = (bid + ask) / 2;

      results.push({
        base,
        quote: currency,
        bid,
        ask,
        mid,
        timestamp: new Date(rate.date),
      });
    }

    return { quotes: results, latencyMs };
  }
}
