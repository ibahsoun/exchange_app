import { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
  Activity,
  ShieldCheck,
  Radio,
  GitCompareArrows,
  RefreshCw,
  Search,
  ChevronDown,
  Info,
  Clock,
} from 'lucide-react';
import { cn, formatRate } from '@/lib/utils';
import { multiSourceApi, spreadApi, VALID_BASES, type MultiSourceBoardResponse, type BoardRow, type SourceStatus, type SpreadType, type SpreadMode, type FixedUnit } from '@/lib/api';

// ─── Cache key ───────────────────────────────────────────────
const CACHE_KEY = 'live-rates-board';

function readCache(): MultiSourceBoardResponse | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(data: MultiSourceBoardResponse) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // storage full — ignore
  }
}

// ─── Base currency persistence ───────────────────────────────

const BASE_STORAGE_KEY = 'baseCurrency';

function getStoredBase(): string {
  try {
    const v = localStorage.getItem(BASE_STORAGE_KEY);
    if (v && VALID_BASES.includes(v)) return v;
  } catch { /* ignore */ }
  return 'USD';
}

function storeBase(base: string) {
  try { localStorage.setItem(BASE_STORAGE_KEY, base); } catch { /* ignore */ }
}

// ─── Helpers ─────────────────────────────────────────────────

function timeAgo(ts: string): string {
  if (!ts) return '—';
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 2) return 'Just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

const DEFAULT_SOURCE = 'currencyfreaks';

// ─── Shimmer overlay ────────────────────────────────────────

function ShimmerOverlay() {
  return (
    <div className="absolute inset-0 z-20 bg-terminal-card/60 backdrop-blur-[1px] flex items-center justify-center">
      <div className="flex items-center gap-2.5 bg-terminal-card border border-terminal-border rounded-lg px-4 py-2.5 shadow-terminal-lg">
        <RefreshCw className="w-4 h-4 text-primary animate-spin" />
        <span className="text-sm text-text-secondary font-medium">Updating rates...</span>
      </div>
    </div>
  );
}

// ─── Skeleton shimmer ───────────────────────────────────────

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div className={cn('bg-terminal-surface rounded overflow-hidden relative', className)}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
    </div>
  );
}

// ─── Source status dot ───────────────────────────────────────

function StatusDot({ status }: { status: SourceStatus['status'] }) {
  if (status === 'online')
    return (
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-green opacity-50" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-status-green" />
      </span>
    );
  if (status === 'stale')
    return <span className="inline-flex rounded-full h-2 w-2 bg-status-yellow" />;
  return <span className="inline-flex rounded-full h-2 w-2 bg-status-red" />;
}

// ─── Comparison row ──────────────────────────────────────────

const ComparisonRow = memo(function ComparisonRow({
  row,
  sources,
  prevMid,
  onModeChange,
  onSpreadChange,
}: {
  row: BoardRow;
  sources: SourceStatus[];
  prevMid?: number;
  onModeChange: (quote: string, mode: string, mid?: number, sourceHint?: string) => void;
  onSpreadChange: (quote: string, spreadType: SpreadType, spreadMode: SpreadMode, fixedUnit: FixedUnit, values: { spreadPercent?: number; spreadFixed?: number; buyMargin?: number; sellMargin?: number }) => void;
}) {
  const rowRef = useRef<HTMLTableRowElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [modeOpen, setModeOpen] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const [editSpreadType, setEditSpreadType] = useState<SpreadType | null>(null);
  const [editSpreadMode, setEditSpreadMode] = useState<SpreadMode | null>(null);
  const [editPercent, setEditPercent] = useState<string | null>(null);
  const [editFixed, setEditFixed] = useState<string | null>(null);
  const [editBuy, setEditBuy] = useState<string | null>(null);
  const [editSell, setEditSell] = useState<string | null>(null);
  const [spreadDirty, setSpreadDirty] = useState(false);

  // Derive display values: use edit state when dirty, otherwise always use props
  const localSpreadType = spreadDirty && editSpreadType != null ? editSpreadType : (row.storeRate.spreadType || 'PERCENTAGE');
  const localSpreadMode = spreadDirty && editSpreadMode != null ? editSpreadMode : (row.storeRate.spreadMode || 'SYMMETRIC');
  const localFixedUnit: FixedUnit = row.storeRate.fixedUnit || 'RAW';
  const localPercent = spreadDirty && editPercent != null ? editPercent : (row.storeRate.spreadPercent ? String(row.storeRate.spreadPercent) : '');
  const localFixed = spreadDirty && editFixed != null ? editFixed : (row.storeRate.spreadFixed ? String(row.storeRate.spreadFixed) : '');
  const localBuy = spreadDirty && editBuy != null ? editBuy : (row.storeRate.buyMargin ? String(row.storeRate.buyMargin) : '');
  const localSell = spreadDirty && editSell != null ? editSell : (row.storeRate.sellMargin ? String(row.storeRate.sellMargin) : '');

  const saveSpread = () => {
    onSpreadChange(row.quote, localSpreadType, localSpreadMode, localFixedUnit, {
      spreadPercent: parseFloat(localPercent) || 0,
      spreadFixed: parseFloat(localFixed) || 0,
      buyMargin: parseFloat(localBuy) || 0,
      sellMargin: parseFloat(localSell) || 0,
    });
    // Reset edit state — values will now derive from refreshed props
    setSpreadDirty(false);
    setEditSpreadType(null);
    setEditSpreadMode(null);
    setEditPercent(null);
    setEditFixed(null);
    setEditBuy(null);
    setEditSell(null);
  };

  // Flash on mid change
  useEffect(() => {
    if (prevMid != null && prevMid !== row.globalAvg.mid && rowRef.current) {
      rowRef.current.classList.remove('row-flash');
      void rowRef.current.offsetWidth;
      rowRef.current.classList.add('row-flash');
    }
  }, [row.globalAvg.mid, prevMid]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!modeOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setModeOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [modeOpen]);

  const handleUseSource = () => {
    const cell = row.sourceRates[DEFAULT_SOURCE];
    if (cell && cell.status === 'ok') {
      onModeChange(row.quote, 'MANUAL_SOURCE', cell.mid, DEFAULT_SOURCE);
    }
    setModeOpen(false);
  };

  const handleCustomSubmit = () => {
    const val = parseFloat(customValue);
    if (!isNaN(val) && val > 0) {
      onModeChange(row.quote, 'CUSTOM_VALUE', val);
      setModeOpen(false);
      setCustomValue('');
    }
  };

  return (
    <tr
      ref={rowRef}
      className="border-b border-terminal-border/40 hover:bg-terminal-surface/40 transition-colors"
    >
      {/* Pair */}
      <td className="px-4 py-3 sticky left-0 bg-terminal-card z-10">
        <div className="font-semibold text-text-primary text-[13px]">{row.pair}</div>
        <div className="text-xxs text-text-muted mt-0.5">{row.quoteName}</div>
      </td>

      {/* Source rate cells */}
      {sources.map((src) => {
        const cell = row.sourceRates[src.key];
        if (!cell || cell.status === 'missing') {
          return (
            <td key={src.key} className="px-3 py-3 text-center">
              <span className="text-text-muted text-xs">—</span>
            </td>
          );
        }
        const isOutlier = cell.status === 'outlier';
        return (
          <td key={src.key} className="px-3 py-3 text-right">
            <span
              className={cn(
                'font-mono text-[12px]',
                isOutlier ? 'text-status-red line-through opacity-60' : 'text-text-primary',
              )}
            >
              {formatRate(cell.mid)}
            </span>
            {cell.buy != null && (
              <div className="text-xxs text-text-muted mt-0.5">
                {formatRate(cell.buy)} / {formatRate(cell.sell ?? 0)}
              </div>
            )}
          </td>
        );
      })}

      {/* Store Rate + Mode dropdown */}
      <td className="px-3 py-3">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-[13px] text-text-primary">
            {formatRate(row.storeRate.mid)}
          </span>
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setModeOpen(!modeOpen)}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded text-xxs font-semibold border transition-colors',
                row.storeRate.mode === 'CUSTOM_VALUE'
                  ? 'border-accent-purple/30 text-accent-purple bg-primary-subtle'
                  : 'border-status-blue/30 text-status-blue bg-status-blue-subtle',
              )}
            >
              {row.storeRate.mode === 'CUSTOM_VALUE' ? 'Custom' : `Source (${row.storeRate.sourceHint ?? DEFAULT_SOURCE})`}
              <ChevronDown className={cn('w-3 h-3 transition-transform', modeOpen && 'rotate-180')} />
            </button>

            {modeOpen && (
              <div className="absolute right-0 top-full mt-1 w-52 bg-terminal-card border border-terminal-border rounded-lg shadow-terminal-lg z-50 py-1 animate-fade-in">
                {/* Use source rate */}
                <button
                  onClick={handleUseSource}
                  className={cn(
                    'w-full text-left px-3 py-2 text-xs hover:bg-terminal-surface transition-colors',
                    row.storeRate.mode !== 'CUSTOM_VALUE'
                      ? 'text-primary font-semibold'
                      : 'text-text-secondary',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span>Use Source Rate</span>
                    <span className="font-mono text-text-muted">
                      {formatRate(row.sourceRates[DEFAULT_SOURCE]?.mid ?? 0)}
                    </span>
                  </div>
                </button>
                {/* Custom value input */}
                <div className="px-3 pt-2 pb-2 border-t border-terminal-border">
                  <div className="text-xxs text-text-muted mb-1.5 font-medium">Custom Value</div>
                  <div className="flex gap-1.5">
                    <input
                      type="number"
                      step="any"
                      placeholder="Enter rate..."
                      value={customValue}
                      onChange={(e) => setCustomValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleCustomSubmit(); }}
                      className="flex-1 bg-terminal-surface-2 border border-terminal-border rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-primary"
                    />
                    <button
                      onClick={handleCustomSubmit}
                      disabled={!customValue || parseFloat(customValue) <= 0 || isNaN(parseFloat(customValue))}
                      className="px-2 py-1 bg-primary text-white text-xs rounded font-semibold hover:bg-primary-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Set
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </td>

      {/* Spread controls */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <select
            value={`${localSpreadType}_${localSpreadMode}`}
            onChange={(e) => {
              const [t, m] = e.target.value.split('_') as [SpreadType, SpreadMode];
              setEditSpreadType(t);
              setEditSpreadMode(m);
              setSpreadDirty(true);
            }}
            className="appearance-none bg-terminal-surface-2 border border-terminal-border rounded px-1.5 py-1 text-xxs font-semibold text-text-primary outline-none focus:border-primary cursor-pointer"
          >
            <option value="PERCENTAGE_SYMMETRIC">% Sym</option>
            <option value="PERCENTAGE_ASYMMETRIC">% Asym</option>
            <option value="FIXED_SYMMETRIC">Fix Sym</option>
            <option value="FIXED_ASYMMETRIC">Fix Asym</option>
          </select>
          {localSpreadMode === 'SYMMETRIC' ? (
            <input
              type="number"
              step="any"
              min="0"
              placeholder="0"
              value={localSpreadType === 'PERCENTAGE' ? localPercent : localFixed}
              onChange={(e) => {
                if (localSpreadType === 'PERCENTAGE') setEditPercent(e.target.value);
                else setEditFixed(e.target.value);
                setSpreadDirty(true);
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') saveSpread(); }}
              className="w-16 bg-terminal-surface-2 border border-terminal-border rounded px-2 py-1 text-[12px] font-mono text-text-primary outline-none focus:border-primary"
            />
          ) : (
            <>
              <input
                type="number"
                step="any"
                min="0"
                placeholder="B"
                title="Buy margin"
                value={localBuy}
                onChange={(e) => { setEditBuy(e.target.value); setSpreadDirty(true); }}
                onKeyDown={(e) => { if (e.key === 'Enter') saveSpread(); }}
                className="w-14 bg-terminal-surface-2 border border-terminal-border rounded px-1.5 py-1 text-[12px] font-mono text-text-primary outline-none focus:border-primary"
              />
              <input
                type="number"
                step="any"
                min="0"
                placeholder="S"
                title="Sell margin"
                value={localSell}
                onChange={(e) => { setEditSell(e.target.value); setSpreadDirty(true); }}
                onKeyDown={(e) => { if (e.key === 'Enter') saveSpread(); }}
                className="w-14 bg-terminal-surface-2 border border-terminal-border rounded px-1.5 py-1 text-[12px] font-mono text-text-primary outline-none focus:border-primary"
              />
            </>
          )}
          {spreadDirty && (
            <button
              onClick={saveSpread}
              className="px-2 py-1 bg-primary text-white text-xxs rounded font-semibold hover:bg-primary-hover transition-colors"
            >
              Save
            </button>
          )}
        </div>
        {(row.storeRate.spread > 0 || row.storeRate.buyMargin > 0 || row.storeRate.sellMargin > 0 || row.storeRate.spreadPercent > 0 || row.storeRate.spreadFixed > 0) && (
          <div className="text-xs text-text-muted mt-1.5 font-mono">
            B: {formatRate(row.storeRate.bid)} / A: {formatRate(row.storeRate.ask)}
          </div>
        )}
      </td>

      {/* Last Updated */}
      <td className="px-3 py-3">
        <div className="text-xs text-text-secondary font-mono">
          {new Date(row.storeRate.updatedAt).toLocaleDateString('en-US', {
            month: 'short',
            day: '2-digit',
          })}
        </div>
        <div className="text-xxs text-text-muted mt-0.5 font-mono">
          {new Date(row.storeRate.updatedAt).toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
        {row.storeRate.mode === 'CUSTOM_VALUE' && (
          <span className="inline-block mt-1 text-xxs font-semibold text-accent-purple">Custom</span>
        )}
      </td>
    </tr>
  );
});

// ─── Main page ───────────────────────────────────────────────

export function LiveRatesPage() {
  const cached = readCache();
  const [board, setBoard] = useState<MultiSourceBoardResponse | null>(cached);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [search, setSearch] = useState('');
  const [autoSync, setAutoSync] = useState(false);
  const [baseCurrency, setBaseCurrency] = useState(getStoredBase);
  const prevMidsRef = useRef<Map<string, number>>(new Map());
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const defaultsAppliedRef = useRef(false);

  const handleBaseChange = (newBase: string) => {
    setBaseCurrency(newBase);
    storeBase(newBase);
  };

  const fetchBoard = useCallback(async () => {
    try {
      const data = await multiSourceApi.getBoard(baseCurrency);
      setBoard(data);
      writeCache(data);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch multi-source board:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [baseCurrency]);

  // Initial fetch (only if no cache, or background refresh with cache)
  useEffect(() => {
    if (cached) {
      // We have cached data — do a silent background refresh
      fetchBoard();
    } else {
      fetchBoard();
    }
  }, [fetchBoard]); // eslint-disable-line react-hooks/exhaustive-deps

  // Once board loads, set CurrencyFreaks as default source for pairs still on AUTO_AVG.
  // Only run with USD base to avoid writing converted mids to the USD-based store.
  useEffect(() => {
    if (!board || defaultsAppliedRef.current || baseCurrency !== 'USD') return;
    defaultsAppliedRef.current = true;

    const cfSource = board.sources.find((s) => s.key === DEFAULT_SOURCE);
    if (!cfSource || cfSource.status !== 'online') return;

    const pairsToUpdate = board.rows.filter(
      (r) =>
        r.storeRate.mode === 'AUTO_AVG' &&
        r.sourceRates[DEFAULT_SOURCE]?.status === 'ok',
    );

    if (pairsToUpdate.length > 0) {
      setUpdating(true);
      Promise.all(
        pairsToUpdate.map((r) =>
          multiSourceApi.updateStoreRate({
            base: r.base,
            quote: r.quote,
            mode: 'MANUAL_SOURCE',
            mid: r.sourceRates[DEFAULT_SOURCE]!.mid,
            sourceHint: DEFAULT_SOURCE,
          }),
        ),
      )
        .then(() => fetchBoard())
        .finally(() => setUpdating(false));
    }
  }, [board, fetchBoard]);

  // Auto-sync interval
  useEffect(() => {
    if (autoSync) {
      intervalRef.current = setInterval(() => {
        setRefreshing(true);
        fetchBoard();
      }, 30_000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoSync, fetchBoard]);

  // Track previous mids for flash
  useEffect(() => {
    if (!board) return;
    const newMap = new Map<string, number>();
    for (const row of board.rows) {
      newMap.set(row.quote, row.globalAvg.mid);
    }
    // Defer update to next tick so current render sees old values
    requestAnimationFrame(() => {
      prevMidsRef.current = newMap;
    });
  }, [board]);

  const handleForceRefresh = async () => {
    setRefreshing(true);
    try {
      const data = await multiSourceApi.refresh(baseCurrency);
      setBoard(data);
      writeCache(data);
    } catch (err) {
      console.error('Failed to force refresh:', err);
    } finally {
      setRefreshing(false);
    }
  };

  /** Map a display-layer quote/mid back to the original USD pair for writes */
  const toUsdPair = useCallback(
    (displayQuote: string, displayMid?: number) => {
      if (baseCurrency === 'USD' || !board) return { quote: displayQuote, mid: displayMid };
      const usdRow = board.rows.find((r) => r.quote === 'USD');
      if (!usdRow || usdRow.storeRate.mid === 0) return { quote: displayQuote, mid: displayMid };

      if (displayQuote === 'USD') {
        return {
          quote: baseCurrency,
          mid: displayMid && displayMid > 0 ? 1 / displayMid : displayMid,
        };
      }
      const usdToBaseMid = 1 / usdRow.storeRate.mid;
      return {
        quote: displayQuote,
        mid: displayMid != null ? displayMid * usdToBaseMid : displayMid,
      };
    },
    [baseCurrency, board],
  );

  const handleSpreadChange = async (
    quote: string,
    spreadType: SpreadType,
    spreadMode: SpreadMode,
    fixedUnit: FixedUnit,
    values: { spreadPercent?: number; spreadFixed?: number; buyMargin?: number; sellMargin?: number },
  ) => {
    const usd = toUsdPair(quote);
    setUpdating(true);
    try {
      await spreadApi.update({ base: 'USD', quote: usd.quote, spreadType, spreadMode, fixedUnit, ...values });
      await fetchBoard();
    } catch (err) {
      console.error('Failed to update spread:', err);
    } finally {
      setUpdating(false);
    }
  };

  const handleModeChange = async (quote: string, mode: string, mid?: number, sourceHint?: string) => {
    const usd = toUsdPair(quote, mid);
    setUpdating(true);
    try {
      await multiSourceApi.updateStoreRate({
        base: 'USD',
        quote: usd.quote,
        mode: mode as 'AUTO_AVG' | 'MANUAL_SOURCE' | 'CUSTOM_VALUE' | 'LOCKED',
        mid: usd.mid,
        sourceHint,
      });
      await fetchBoard();
    } catch (err) {
      console.error('Failed to update store rate:', err);
    } finally {
      setUpdating(false);
    }
  };

  // Filter rows
  const filteredRows = board?.rows.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.pair.toLowerCase().includes(q) ||
      r.quoteName.toLowerCase().includes(q) ||
      r.quote.toLowerCase().includes(q)
    );
  }) ?? [];

  const sources = board?.sources ?? [];
  const stats = board?.stats;

  // Are we in an active API call? (for shimmer overlay)
  const isBusy = refreshing || updating;

  // ─── Skeleton loading (first load, no cache) ──────────────

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <SkeletonBlock className="h-7 w-64" />
          <SkeletonBlock className="h-9 w-32" />
        </div>
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="stat-card">
              <SkeletonBlock className="h-4 w-24 mb-3" />
              <SkeletonBlock className="h-7 w-20 mb-2" />
              <SkeletonBlock className="h-3 w-16" />
            </div>
          ))}
        </div>
        <div className="card overflow-hidden">
          <div className="card-header">
            <SkeletonBlock className="h-5 w-40" />
            <SkeletonBlock className="h-4 w-24" />
          </div>
          <div className="p-4 space-y-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <SkeletonBlock className="h-5 w-24" />
                <SkeletonBlock className="h-5 w-20 ml-auto" />
                <SkeletonBlock className="h-5 w-20" />
                <SkeletonBlock className="h-5 w-20" />
                <SkeletonBlock className="h-5 w-20" />
                <SkeletonBlock className="h-5 w-16" />
                <SkeletonBlock className="h-5 w-28" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error && !board) {
    return (
      <div className="space-y-5">
        <h1 className="text-xl font-bold text-text-primary">Live Rates</h1>
        <div className="card p-8 text-center">
          <div className="text-status-red text-lg font-semibold mb-2">Connection Error</div>
          <p className="text-text-muted text-sm mb-4">{error}</p>
          <button onClick={() => { setLoading(true); fetchBoard(); }} className="btn-primary text-sm">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Page header ───────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-text-primary">Live Rates</h1>
          <div className="flex items-center gap-2 bg-terminal-card border border-terminal-border rounded-lg px-3 py-1.5">
            <span className="text-xxs text-text-muted font-semibold uppercase tracking-wide">Base</span>
            <select
              value={baseCurrency}
              onChange={(e) => handleBaseChange(e.target.value)}
              className="appearance-none bg-transparent text-[13px] text-text-primary font-semibold outline-none cursor-pointer pr-1"
            >
              {VALID_BASES.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
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

        <div className="flex items-center gap-3">
          {/* Auto-sync toggle */}
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-text-muted font-medium uppercase tracking-wide">Auto Sync</span>
            <div
              className="toggle-track"
              data-active={autoSync}
              onClick={() => setAutoSync(!autoSync)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAutoSync(!autoSync); } }}
              tabIndex={0}
              role="switch"
              aria-checked={autoSync}
              aria-label="Toggle auto sync"
            >
              <div className="toggle-knob" />
            </div>
          </div>

          {/* Refresh button */}
          <button
            onClick={handleForceRefresh}
            disabled={isBusy}
            className="btn-outline text-xs py-1.5 px-3 flex items-center gap-1.5"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isBusy && 'animate-spin')} />
            {refreshing ? 'Syncing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* ── KPI stat cards ────────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          {/* Network Latency */}
          <div className="stat-card">
            <div className="flex items-center justify-between mb-2">
              <span className="table-header">Network Latency</span>
              <Activity className="w-4 h-4 text-text-muted" />
            </div>
            <div className="text-xl font-bold font-mono">{stats.networkLatency}ms</div>
            <span className={cn(
              'text-xs mt-1 inline-block',
              stats.networkLatency < 500 ? 'text-status-green' : stats.networkLatency < 1500 ? 'text-status-yellow' : 'text-status-red',
            )}>
              {stats.networkLatency < 500 ? 'Excellent' : stats.networkLatency < 1500 ? 'Moderate' : 'Slow'}
            </span>
          </div>

          {/* Market Stability */}
          <div className="stat-card">
            <div className="flex items-center justify-between mb-2">
              <span className="table-header">Market Stability</span>
              <ShieldCheck className="w-4 h-4 text-text-muted" />
            </div>
            <div className="text-xl font-bold">{stats.marketStability}%</div>
            <span className={cn(
              'text-xs mt-1 inline-block',
              stats.marketStability > 95 ? 'text-status-green' : stats.marketStability > 80 ? 'text-status-yellow' : 'text-status-red',
            )}>
              {stats.marketStability > 95 ? 'Stable' : stats.marketStability > 80 ? 'Moderate' : 'Volatile'}
            </span>
          </div>

          {/* Sources Connected */}
          <div className="stat-card">
            <div className="flex items-center justify-between mb-2">
              <span className="table-header">Sources Connected</span>
              <Radio className="w-4 h-4 text-text-muted" />
            </div>
            <div className="text-xl font-bold">
              {stats.sourcesConnected}
              <span className="text-sm text-text-muted font-normal"> / {stats.sourcesTotal}</span>
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              {stats.sourceStatuses.map((s) => (
                <div key={s.key} className="flex items-center gap-1">
                  <StatusDot status={s.status} />
                  <span className="text-xxs text-text-muted">{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Global Avg Drift */}
          <div className="stat-card">
            <div className="flex items-center justify-between mb-2">
              <span className="table-header">Global Avg Drift</span>
              <GitCompareArrows className="w-4 h-4 text-text-muted" />
            </div>
            <div className="text-xl font-bold font-mono">{stats.globalAvgDrift}%</div>
            <span className="text-xs text-text-muted mt-1 inline-block">
              {stats.driftLocked} pair{stats.driftLocked !== 1 ? 's' : ''} locked/custom
            </span>
          </div>
        </div>
      )}

      {/* ── Comparison table ──────────────────────────── */}
      <div className="card relative">
        {isBusy && <ShimmerOverlay />}

        <div className="card-header">
          <div className="flex items-center gap-2.5">
            <div className="card-icon">
              <GitCompareArrows />
            </div>
            <h2 className="font-semibold text-[15px]">Source Comparison</h2>
          </div>
          <div className="flex items-center gap-3 text-xs text-text-muted">
            <span>Last sync: {board ? timeAgo(board.lastSync) : '—'}</span>
            <span>{filteredRows.length} pair{filteredRows.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-terminal-border">
                <th className="table-header text-left px-4 py-3 sticky left-0 bg-terminal-card z-10 min-w-[140px]">
                  Pair
                </th>
                {sources.map((src) => (
                  <th key={src.key} className="table-header text-right px-3 py-3 min-w-[110px]">
                    <div className="flex items-center justify-end gap-1.5">
                      <StatusDot status={src.status} />
                      <span>{src.label}</span>
                    </div>
                    <div className="text-xxs text-text-muted font-normal mt-0.5">
                      {src.status === 'online' ? `${src.latencyMs}ms` : 'offline'}
                    </div>
                  </th>
                ))}
                <th className="table-header text-left px-3 py-3 min-w-[180px]">Store Rate</th>
                <th className="table-header text-left px-3 py-3 min-w-[240px]">Spread</th>
                <th className="table-header text-left px-3 py-3 min-w-[130px]">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    <span>Last Updated</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <ComparisonRow
                  key={row.quote}
                  row={row}
                  sources={sources}
                  prevMid={prevMidsRef.current.get(row.quote)}
                  onModeChange={handleModeChange}
                  onSpreadChange={handleSpreadChange}
                />
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td
                    colSpan={sources.length + 4}
                    className="px-5 py-10 text-center text-text-muted text-sm"
                  >
                    {search ? `No pairs matching "${search}"` : 'No data available'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-terminal-border flex items-center gap-2 text-xs text-text-muted">
          <Info className="w-4 h-4 text-primary flex-shrink-0" />
          <span>
            Rates are fetched from {sources.length} external source{sources.length !== 1 ? 's' : ''}.
            Use the <strong className="text-text-primary">Store Rate</strong> dropdown to override pricing per pair.
            {' '}<strong className="text-text-primary">Percentage</strong>: offset by % of mid. <strong className="text-text-primary">Fixed</strong>: offset by fixed amount. <strong className="text-text-primary">Asymmetric</strong>: separate buy/sell margins. Customer receives the Bid rate when selling {baseCurrency}.
          </span>
        </div>
      </div>

      {/* ── System Health bar ─────────────────────────── */}
      {stats && (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <Activity className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs text-text-muted font-medium">System Health</span>
          </div>
          <div className="w-36 h-1.5 bg-terminal-border rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-blue-400 rounded-full transition-all"
              style={{ width: `${Math.min(100, stats.marketStability)}%` }}
            />
          </div>
          <span className="text-xs text-text-muted">
            Latency: <span className="text-text-secondary font-mono">{stats.networkLatency}ms</span>
            {' · '}
            Sources: <span className="text-text-secondary font-mono">{stats.sourcesConnected}/{stats.sourcesTotal}</span>
          </span>
        </div>
      )}
    </div>
  );
}
