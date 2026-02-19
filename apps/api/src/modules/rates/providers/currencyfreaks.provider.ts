import type { MultiSourceProvider, MultiSourceResult, MultiSourceQuote } from './rate-provider.interface';

/**
 * Source A: CurrencyFreaks
 * GET https://api.currencyfreaks.com/v2.0/rates/latest?apikey=...&symbols=EUR,CNY,...
 * Returns: { "date":"...", "base":"USD", "rates": { "EUR":"0.843775", ... } }
 *
 * Only returns mid rates (no bid/ask).
 */
export class CurrencyFreaksProvider implements MultiSourceProvider {
  readonly name = 'currencyfreaks';
  readonly label = 'CurrencyFreaks';

  private readonly apiKey: string;

  constructor() {
    this.apiKey = process.env.CURRENCYFREAKS_API_KEY ?? '';
  }

  async fetchRates(base: string, quotes: string[]): Promise<MultiSourceResult> {
    if (!this.apiKey) {
      return { quotes: [], latencyMs: 0 };
    }

    const symbols = quotes.join(',');
    const url = `https://api.currencyfreaks.com/v2.0/rates/latest?apikey=${this.apiKey}&symbols=${symbols}&base=${base}`;

    const start = Date.now();
    const res = await fetch(url);
    const latencyMs = Date.now() - start;

    if (!res.ok) {
      throw new Error(`CurrencyFreaks HTTP ${res.status}: ${await res.text()}`);
    }

    const data: { date: string; base: string; rates: Record<string, string> } = await res.json();

    const results: MultiSourceQuote[] = [];
    for (const quote of quotes) {
      const rateStr = data.rates[quote];
      if (rateStr == null) continue;

      const mid = parseFloat(rateStr);
      if (isNaN(mid) || mid <= 0) continue;

      results.push({
        base,
        quote,
        bid: null,
        ask: null,
        mid,
        timestamp: new Date(data.date),
      });
    }

    return { quotes: results, latencyMs };
  }
}
