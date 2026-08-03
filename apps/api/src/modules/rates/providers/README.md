# Live rate source integration

The app pulls rates from **one** external feed: **Beta Broadcaster**
(`https://platform.betaserver.dev/fxrates`). It is the only rate source in the
system — the earlier multi-vendor setup has been removed from the code, the env
and the database (migration `20260725120000_single_live_source`).

## The vendor API

```
GET /fxrates/usdbrl    -> one pair. The path must be lowercase — uppercase 404s.
GET /fxrates/          -> {"status":"running","endpoints":["/usdbrl","/usdtbrl"]}
GET /fxrates/stats     -> every pair's latest quote in one response
```

```json
{ "pair": "USDBRL", "source": "TradingView FX_IDC", "last": 5.087,
  "bid": 5.087, "ask": 5.0874, "mid": 5.0872,
  "lp_time_utc": "2026-07-24T21:13:22+00:00",
  "received_at_utc": "2026-07-25T09:11:46.700705+00:00" }
```

No authentication today. The vendor holds upstream TradingView websockets and
republishes the latest tick, so `received_at_utc` keeps moving even when
`lp_time_utc` is hours old (FX is closed at weekends) — **staleness is measured
against `received_at_utc`** for that reason.

## Where things live

| File | Role |
| --- | --- |
| `live-market.config.ts` | Env-driven config + pair → vendor-symbol map |
| `live-market.provider.ts` | HTTP, parsing, inversion, crosses, caching |
| `mock.provider.ts` | Dev-only fallback when the feed is unconfigured |

Mock rates are never served when `NODE_ENV=production` — an unconfigured feed
there means no rates at all, which is safer than invented prices.

One `LiveMarketClient` instance is shared by two faces:

- `LiveMarketProvider` → the rate board (`/api/rates/multi-source-board`)
- `LiveMarketRateProvider` → `RatesService` (ticker, websocket, snapshots)

Both go through the same client, so a board refresh and a scheduler tick inside
the cache window (`LIVE_MARKET_CACHE_MS`, default 2s) cost one upstream request.
Fetch mode defaults to one request per pair; `LIVE_MARKET_FETCH_MODE=stats`
switches to a single `/stats` call, which is worth doing once several pairs are live.

## Which currencies are traded

Configured in **Settings** (the `Currency` table), not in code.
`MultiSourceService.getPairs()` reads it (15s cache) and everything else follows:
the board rows, `/api/rates/pairs`, `/api/rates/spreads`, and the base-currency
dropdown via `/api/rates/bases`. `SUPPORTED_PAIRS` in `rates.constants.ts` is only
the fallback for when that table is empty.

Currently configured: **USD** (base), CNY, BRL, USDT, AED.

Removing a currency from Settings hides it everywhere but leaves its `StoreRate`
row intact — re-adding it restores the spread config untouched.

## Pair mapping

The feed publishes `usdbrl` and `usdtbrl` only. The map in `live-market.config.ts`:

| Our pair | Vendor | Notes |
| --- | --- | --- |
| USD/BRL | `usdbrl` | direct |
| USD/USDT | `usdbrl` / `usdtbrl` | cross — the BRL leg cancels |
| USD/CNY, USD/AED | — | not published; keep their last stored value |

Add pairs as the vendor turns them on, either in `DEFAULT_SYMBOLS` or without a
deploy via `LIVE_MARKET_SYMBOLS`:

```
LIVE_MARKET_SYMBOLS={"CNY":"usdcny","EUR":{"symbol":"eurusd","invert":true}}
```

`invert: true` means the vendor quotes QUOTE/USD while we store USD/QUOTE.
`{"derive":{"numerator":"usdbrl","denominator":"usdtbrl"}}` computes a cross;
the bid pairs with the denominator's ask (and vice versa) because the trade
crosses both spreads.

## How a rate reaches a customer

1. The feed quote lands as the source cell on the board.
2. The **store rate** follows it when the pair is on `AUTO_AVG` or `MANUAL_SOURCE`;
   `LOCKED` and `CUSTOM_VALUE` are operator values and never move.
3. The spread from SpreadSettings turns that mid into the customer bid/ask.

A pair with no live quote keeps its last stored mid rather than dropping to zero.

## Diagnostics

`GET /api/rates/source-status` — configuration (never the key), the pairs the
vendor currently publishes, which configured currencies are mapped, and one real
fetch with the resulting quotes. Start here when a cell is empty.

## Open questions for the vendor

- Rate limits, so `LIVE_MARKET_CACHE_MS` / `RATE_REFRESH_INTERVAL` can be tuned.
- Is `/fxrates/stats` a supported endpoint or an internal one that may change?
- Which pairs are planned next — CNY and AED are configured here and waiting.
- Is there a public websocket? `LiveMarketClient.applyVendorRow()` is the push
  entry point; a stream would call it per tick and every consumer picks it up.
