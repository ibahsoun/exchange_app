import { useState, useRef, useEffect, useMemo, memo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  SlidersHorizontal,
  Download,
  Search,
  Activity,
  Sparkles,
  ArrowUpDown,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRates, useMarketSummary } from '@/hooks/useRates';
import { currencyRates as seedRates, marketSummary as seedSummary } from '@/data/seed';
import type { LiveRate } from '@/stores/rates.store';

// ─── Currency metadata ───────────────────────────────────────
const CURRENCY_META: Record<string, { name: string; color: string }> = {
  USD: { name: 'United States Dollar', color: 'bg-emerald-600' },
  EUR: { name: 'European Union Euro', color: 'bg-blue-500' },
  CNY: { name: 'Chinese Yuan', color: 'bg-amber-600' },
  BRL: { name: 'Brazilian Real', color: 'bg-green-600' },
  PYG: { name: 'Paraguayan Guarani', color: 'bg-red-700' },
  AED: { name: 'UAE Dirham', color: 'bg-teal-600' },
  ARS: { name: 'Argentine Peso', color: 'bg-sky-700' },
  USDT: { name: 'Tether Stablecoin', color: 'bg-emerald-500' },
  XAU: { name: 'Spot Gold / Ounce', color: 'bg-yellow-500' },
  GRAM: { name: 'Gold per Gram', color: 'bg-yellow-600' },
  GBP: { name: 'British Pound', color: 'bg-indigo-500' },
  JPY: { name: 'Japanese Yen', color: 'bg-red-500' },
  CHF: { name: 'Swiss Franc', color: 'bg-red-600' },
  CAD: { name: 'Canadian Dollar', color: 'bg-rose-700' },
  AUD: { name: 'Australian Dollar', color: 'bg-blue-700' },
};

function currencyIcon(code: string) {
  const symbols: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥',
    XAU: '★', GRAM: 'g', USDT: '₮', BRL: 'R', AED: 'د',
    ARS: '$', PYG: '₲', CHF: 'Fr', CAD: '$', AUD: '$',
  };
  return symbols[code] ?? code[0];
}

// ─── Helpers ─────────────────────────────────────────────────
function formatRate(n: number): string {
  if (n >= 1000) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1) return n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
}

function timeAgo(ts: string): string {
  if (!ts || ts === 'Just now') return 'Just now';
  if (ts.includes('ago')) return ts; // already formatted seed data
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 2) return 'Just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function TrendArrow({ trend }: { trend: string }) {
  if (trend === 'up') return <TrendingUp className="w-3.5 h-3.5 text-status-green" />;
  if (trend === 'down') return <TrendingDown className="w-3.5 h-3.5 text-status-red" />;
  return <Minus className="w-3.5 h-3.5 text-text-muted" />;
}

// ─── Seed rate type alias ────────────────────────────────────
type SeedRate = (typeof seedRates)[0];

// ─── Row component with flash animation ──────────────────────
const RateRow = memo(function RateRow({ rate, prevBid }: { rate: LiveRate | SeedRate; prevBid?: number }) {
  const rowRef = useRef<HTMLTableRowElement>(null);
  const isLive = 'quote' in rate;

  const code = isLive ? rate.quote : rate.currency;
  const meta = CURRENCY_META[code] ?? { name: code, color: 'bg-gray-600' };

  const bid = isLive ? rate.bid : rate.buyRate;
  const ask = isLive ? rate.ask : rate.sellRate;
  const spread = isLive ? rate.spread : rate.spread;
  const trend = isLive ? rate.trend : rate.trend;
  const ts = isLive ? rate.timestamp : rate.updatedAt;

  // Flash on bid change
  useEffect(() => {
    if (prevBid != null && prevBid !== bid && rowRef.current) {
      rowRef.current.classList.remove('row-flash');
      // Force reflow
      void rowRef.current.offsetWidth;
      rowRef.current.classList.add('row-flash');
    }
  }, [bid, prevBid]);

  const ago = timeAgo(ts);
  const isJustNow = ago === 'Just now';

  return (
    <tr
      ref={rowRef}
      className="border-b border-terminal-border/40 hover:bg-terminal-surface/40 transition-colors"
    >
      {/* Currency pair */}
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-sm',
              meta.color,
            )}
          >
            {currencyIcon(code)}
          </div>
          <div>
            <div className="font-semibold text-text-primary text-[13px]">{code}</div>
            <div className="text-xxs text-text-muted mt-0.5">{meta.name}</div>
          </div>
        </div>
      </td>

      {/* Buy rate */}
      <td className="px-5 py-3.5 text-right">
        <div className="flex items-center justify-end gap-2">
          <span className={cn(
            'font-mono font-bold text-[13px]',
            trend === 'up' ? 'text-status-green' : 'text-text-primary',
          )}>
            {formatRate(bid)}
          </span>
          <TrendArrow trend={trend} />
        </div>
      </td>

      {/* Sell rate */}
      <td className="px-5 py-3.5 text-right">
        <div className="flex items-center justify-end gap-2">
          <span className={cn(
            'font-mono font-bold text-[13px]',
            trend === 'down' ? 'text-status-red' : 'text-text-primary',
          )}>
            {formatRate(ask)}
          </span>
          <TrendArrow trend={trend === 'up' ? 'down' : trend === 'down' ? 'up' : 'stable'} />
        </div>
      </td>

      {/* Spread */}
      <td className="px-5 py-3.5 text-center">
        <span
          className={cn(
            'inline-flex items-center justify-center min-w-[56px] px-2 py-0.5 rounded text-xs font-mono font-semibold',
            spread > 5
              ? 'bg-status-red-subtle text-status-red'
              : spread > 0.01
                ? 'bg-status-yellow-subtle text-status-yellow'
                : 'bg-status-green-subtle text-status-green',
          )}
        >
          {spread >= 1 ? spread.toFixed(2) : spread.toFixed(4)}
        </span>
      </td>

      {/* Last updated */}
      <td className="px-5 py-3.5 text-right">
        <span className={cn('text-[13px]', isJustNow ? 'text-status-green font-medium' : 'text-text-muted')}>
          {ago}
        </span>
      </td>
    </tr>
  );
});

// ─── Main page ───────────────────────────────────────────────
export function LiveRatesPage() {
  const [search, setSearch] = useState('');
  const [overrideEnabled, setOverrideEnabled] = useState(false);

  const liveRates = useRates();
  const liveSummary = useMarketSummary();

  // Track previous bids for flash animation
  const prevBidsRef = useRef<Map<string, number>>(new Map());

  // Use live rates if available, otherwise fall back to seed
  const hasLiveData = liveRates.length > 0;
  const summary = liveSummary ?? seedSummary;

  // Build unified rate list
  const rates = useMemo(() => {
    if (hasLiveData) return liveRates;
    // Convert seed data to LiveRate-like shape
    return seedRates.map((r) => ({
      base: 'USD',
      quote: r.currency,
      bid: r.buyRate,
      ask: r.sellRate,
      mid: (r.buyRate + r.sellRate) / 2,
      spread: r.spread,
      trend: r.trend as 'up' | 'down' | 'stable',
      overridden: false,
      timestamp: r.updatedAt,
    }));
  }, [hasLiveData, liveRates]);

  // Filter
  const filtered = rates.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const code = r.quote;
    const name = CURRENCY_META[code]?.name ?? '';
    return code.toLowerCase().includes(q) || name.toLowerCase().includes(q);
  });

  // Update prev bids after render
  useEffect(() => {
    const newMap = new Map<string, number>();
    for (const r of rates) {
      newMap.set(r.quote, r.bid);
    }
    prevBidsRef.current = newMap;
  }, [rates]);

  return (
    <div className="space-y-5">
      {/* ── Page header ───────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-text-primary">Live Rates Board</h1>
          <div className="flex items-center gap-2 bg-terminal-card border border-terminal-border rounded-lg px-3 py-1.5">
            <Search className="w-3.5 h-3.5 text-text-muted" />
            <input
              type="text"
              placeholder="Search pairs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search currency pairs"
              className="bg-transparent text-[13px] text-text-primary placeholder-text-muted outline-none w-44"
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Manual Override toggle */}
          <div className="flex items-center gap-2.5">
            <span className="text-[13px] text-text-muted font-medium uppercase tracking-wide">
              Manual Override
            </span>
            <div
              className="toggle-track"
              data-active={overrideEnabled}
              onClick={() => setOverrideEnabled(!overrideEnabled)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOverrideEnabled(!overrideEnabled); } }}
              tabIndex={0}
              role="switch"
              aria-checked={overrideEnabled}
              aria-label="Toggle manual rate override"
            >
              <div className="toggle-knob" />
            </div>
          </div>
        </div>
      </div>

      {/* ── KPI stat cards ────────────────────────────── */}
      <div className="grid grid-cols-4 gap-4">
        {/* Total Volume */}
        <div className="stat-card">
          <div className="flex items-center justify-between mb-2">
            <span className="table-header">Total Volume (24H)</span>
            <Activity className="w-4 h-4 text-text-muted" />
          </div>
          <div className="text-xl font-bold">
            ${(summary.totalVolume24h / 1e9).toFixed(2)}B
          </div>
          <span className="text-xs text-status-green mt-1 inline-block">
            +{summary.volumeChange}%
          </span>
        </div>

        {/* Active Pairs */}
        <div className="stat-card">
          <div className="flex items-center justify-between mb-2">
            <span className="table-header">Active Pairs</span>
            <Sparkles className="w-4 h-4 text-text-muted" />
          </div>
          <div className="text-xl font-bold">{summary.activePairs}</div>
          <span className="text-xs text-text-muted mt-1 inline-block">Global</span>
        </div>

        {/* Avg Spread */}
        <div className="stat-card">
          <div className="flex items-center justify-between mb-2">
            <span className="table-header">Avg. Spread</span>
            <ArrowUpDown className="w-4 h-4 text-text-muted" />
          </div>
          <div className="text-xl font-bold">{summary.avgSpread.toFixed(2)}</div>
          <span className="text-xs text-text-muted mt-1 inline-block">Pips</span>
        </div>

        {/* Market Status */}
        <div className="stat-card">
          <div className="flex items-center justify-between mb-2">
            <span className="table-header">Market Status</span>
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-green opacity-50" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-status-green" />
            </span>
          </div>
          <div className="text-xl font-bold">
            {summary.marketStatus === 'LIVE' ? 'Open' : 'Closed'}
          </div>
          <span className="text-xs text-text-muted mt-1 inline-block">
            {summary.openMarkets}
          </span>
        </div>
      </div>

      {/* ── Live Feed Terminal table ──────────────────── */}
      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-2.5">
            <div className="card-icon">
              <TrendingUp />
            </div>
            <h2 className="font-semibold text-[15px]">Live Feed Terminal</h2>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-outline text-xs py-1.5 px-3 flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5" /> Filter
            </button>
            <button className="btn-outline text-xs py-1.5 px-3 flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5" /> Export
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-terminal-border">
                <th className="table-header text-left px-5 py-3 w-[260px]">Currency Pair</th>
                <th className="table-header text-right px-5 py-3">Buy Rate</th>
                <th className="table-header text-right px-5 py-3">Sell Rate</th>
                <th className="table-header text-center px-5 py-3">Spread</th>
                <th className="table-header text-right px-5 py-3">Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((rate) => (
                <RateRow
                  key={rate.quote}
                  rate={rate}
                  prevBid={prevBidsRef.current.get(rate.quote)}
                />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-text-muted text-sm">
                    No pairs matching &quot;{search}&quot;
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer info bar */}
        <div className="px-5 py-3 border-t border-terminal-border flex items-center gap-2 text-xs text-text-muted">
          <Info className="w-4 h-4 text-primary flex-shrink-0" />
          <span>
            Automatic updates are enabled. Enable{' '}
            <strong className="text-text-primary">Manual Override</strong> in the header
            to lock rates for custom pricing.
          </span>
          <button className="ml-auto text-primary font-semibold hover:underline whitespace-nowrap">
            View Manual Logs
          </button>
        </div>
      </div>

      {/* ── System Health bar ─────────────────────────── */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <Activity className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs text-text-muted font-medium">System Health</span>
        </div>
        <div className="w-36 h-1.5 bg-terminal-border rounded-full overflow-hidden">
          <div className="w-[85%] h-full bg-gradient-to-r from-primary to-blue-400 rounded-full" />
        </div>
        <span className="text-xs text-text-muted">
          Latency: <span className="text-text-secondary font-mono">14ms</span> (Optimum)
        </span>
      </div>
    </div>
  );
}
