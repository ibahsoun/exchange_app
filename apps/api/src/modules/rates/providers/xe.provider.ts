import type { MultiSourceProvider, MultiSourceResult, MultiSourceQuote } from './rate-provider.interface';

/**
 * Source B: XE
 * GET https://xecdapi.xe.com/v1/convert_from?from=USD&to=EUR,CNY,...&amount=1
 * Auth: Basic (accountId:apiKey)
 * Returns: { "from":"USD", "amount":1, "timestamp":"...", "to":[{"quotecurrency":"EUR","mid":0.843},...] }
 *
 * Returns mid only per currency.
 */
export class XeProvider implements MultiSourceProvider {
  readonly name = 'xe';
  readonly label = 'XE';

  private readonly accountId: string;
  private readonly apiKey: string;

  constructor() {
    this.accountId = process.env.XE_ACCOUNT_ID ?? '';
    this.apiKey = process.env.XE_API_KEY ?? '';
  }

  async fetchRates(base: string, quotes: string[]): Promise<MultiSourceResult> {
    if (!this.accountId || !this.apiKey) {
      return { quotes: [], latencyMs: 0 };
    }

    const to = quotes.join(',');
    const url = `https://xecdapi.xe.com/v1/convert_from?from=${base}&to=${to}&amount=1`;

    const auth = Buffer.from(`${this.accountId}:${this.apiKey}`).toString('base64');

    const start = Date.now();
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${auth}` },
    });
    const latencyMs = Date.now() - start;

    if (!res.ok) {
      throw new Error(`XE HTTP ${res.status}: ${await res.text()}`);
    }

    const data: {
      from: string;
      amount: number;
      timestamp: string;
      to: { quotecurrency: string; mid: number }[];
    } = await res.json();

    const results: MultiSourceQuote[] = [];
    for (const item of data.to) {
      if (item.mid == null || item.mid <= 0) continue;
      results.push({
        base,
        quote: item.quotecurrency,
        bid: null,
        ask: null,
        mid: item.mid,
        timestamp: new Date(data.timestamp),
      });
    }

    return { quotes: results, latencyMs };
  }
}
