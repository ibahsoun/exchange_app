import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, RotateCcw, Info, Star, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { customerFeesApi, multiSourceApi, VALID_BASES, type LevelPointsPair } from '@/lib/api';

const POINT_PRESETS = [5, 6, 7];
const PERCENT_PRESETS = [
  { stars: 5, pct: 1 },
  { stars: 4, pct: 1.25 },
  { stars: 3, pct: 1.5 },
  { stars: 2, pct: 1.75 },
  { stars: 1, pct: 2 },
];

interface FeeLocalRow {
  customerId: string;
  customerCode: string;
  name: string;
  level: number;
  points: number | null;
  percent: number | null;
  customText: string;
  percentText: string;
  saving: boolean;
}

const PRESET_PCTS = PERCENT_PRESETS.map((p) => p.pct);

export function SpreadSettingsPage() {
  const [bases, setBases] = useState<string[]>(VALID_BASES);
  const [baseCurrency, setBaseCurrency] = useState('USD');
  const [pairs, setPairs] = useState<LevelPointsPair[]>([]);
  const [quote, setQuote] = useState('');
  const [rows, setRows] = useState<FeeLocalRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    multiSourceApi.getBases().then(setBases).catch(() => {});
  }, []);

  // Load pairs for the base; keep the quote if still valid, else pick the first
  useEffect(() => {
    let cancelled = false;
    customerFeesApi
      .getPairs(baseCurrency)
      .then((p) => {
        if (cancelled) return;
        setPairs(p);
        setQuote((q) => (p.some((x) => x.quote === q) ? q : p[0]?.quote ?? ''));
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load pairs');
      });
    return () => {
      cancelled = true;
    };
  }, [baseCurrency]);

  const fetchRows = useCallback(async () => {
    if (!quote) return;
    setLoading(true);
    setError(null);
    try {
      const data = await customerFeesApi.list(baseCurrency, quote);
      setRows(
        data.map((r) => ({
          customerId: r.customerId,
          customerCode: r.customerCode,
          name: r.name,
          level: r.level,
          points: r.points,
          percent: r.percent,
          customText: r.points != null && !POINT_PRESETS.includes(r.points) ? String(r.points) : '',
          percentText: r.percent != null && !PRESET_PCTS.includes(r.percent) ? String(r.percent) : '',
          saving: false,
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load customer fees');
    } finally {
      setLoading(false);
    }
  }, [baseCurrency, quote]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const save = async (
    row: FeeLocalRow,
    patch: Partial<Pick<FeeLocalRow, 'points' | 'percent'>>,
  ) => {
    const next = { points: row.points, percent: row.percent, ...patch };
    setRows((prev) =>
      prev.map((r) =>
        r.customerId === row.customerId
          ? {
              ...r,
              ...next,
              saving: true,
              customText:
                next.points != null && !POINT_PRESETS.includes(next.points)
                  ? String(next.points)
                  : '',
              percentText:
                next.percent != null && !PRESET_PCTS.includes(next.percent)
                  ? String(next.percent)
                  : '',
            }
          : r,
      ),
    );
    try {
      await customerFeesApi.update({
        customerId: row.customerId,
        base: baseCurrency,
        quote,
        ...next,
      });
      setRows((prev) =>
        prev.map((r) => (r.customerId === row.customerId ? { ...r, saving: false } : r)),
      );
    } catch {
      // Re-sync so the row doesn't keep values that failed to save
      fetchRows();
    }
  };

  const commitCustomPoints = (row: FeeLocalRow) => {
    const trimmed = row.customText.trim();
    const parsed = trimmed === '' ? null : parseFloat(trimmed);
    if (parsed != null && (isNaN(parsed) || parsed < 0)) return;
    if (parsed === row.points) return;
    save(row, { points: parsed });
  };

  const commitCustomPercent = (row: FeeLocalRow) => {
    const trimmed = row.percentText.trim();
    const parsed = trimmed === '' ? null : parseFloat(trimmed);
    if (parsed != null && (isNaN(parsed) || parsed < 0)) return;
    if (parsed === row.percent) return;
    save(row, { percent: parsed });
  };

  const handleResetAll = async () => {
    const pairLabel = pairs.find((p) => p.quote === quote)?.pair ?? `${baseCurrency}/${quote}`;
    if (!window.confirm(`Reset the ${pairLabel} fees of every customer?`)) return;
    setLoading(true);
    try {
      await Promise.all(
        rows
          .filter((r) => r.points != null || r.percent != null)
          .map((r) =>
            customerFeesApi.update({
              customerId: r.customerId,
              base: baseCurrency,
              quote,
              points: null,
              percent: null,
            }),
          ),
      );
    } catch {
      // fetchRows below re-syncs whatever state the reset reached
    }
    fetchRows();
  };

  const handleResetRow = (row: FeeLocalRow) => {
    if (!window.confirm(`Reset fees for ${row.name}?`)) return;
    save(row, { points: null, percent: null });
  };

  const visibleRows = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return r.name.toLowerCase().includes(q) || r.customerCode.toLowerCase().includes(q);
  });

  const pairLabel = pairs.find((p) => p.quote === quote)?.pair ?? '';
  const configuredCount = rows.filter((r) => r.points != null || r.percent != null).length;

  if (error) {
    return (
      <div className="space-y-5">
        <h1 className="text-xl font-bold text-text-primary">Customer Level Points</h1>
        <div className="card p-8 text-center">
          <p className="text-status-red text-sm mb-3">{error}</p>
          <button onClick={fetchRows} className="btn-primary text-sm">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-bold text-text-primary">Customer Level Points</h1>
            <p className="text-text-muted text-sm mt-0.5">Configure fees per customer, per currency pair</p>
          </div>
          <div className="flex items-center gap-2 bg-terminal-card border border-terminal-border rounded-lg px-3 py-1.5">
            <span className="text-xxs text-text-muted font-semibold uppercase tracking-wide">Base</span>
            <select
              value={baseCurrency}
              onChange={(e) => setBaseCurrency(e.target.value)}
              className="appearance-none bg-transparent text-[13px] text-text-primary font-semibold outline-none cursor-pointer pr-1"
            >
              {bases.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 bg-terminal-card border border-terminal-border rounded-lg px-3 py-1.5">
            <span className="text-xxs text-text-muted font-semibold uppercase tracking-wide">Pair</span>
            <select
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
              className="appearance-none bg-transparent text-[13px] text-text-primary font-semibold outline-none cursor-pointer pr-1"
            >
              {pairs.map((p) => (
                <option key={p.quote} value={p.quote}>{p.pair}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchRows} className="btn-outline text-xs py-1.5 px-3 flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button onClick={handleResetAll} className="btn-outline text-xs py-1.5 px-3 flex items-center gap-1.5">
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-header gap-5">
          <div className="flex flex-1 min-w-0 items-center gap-3 bg-terminal-surface-2 border border-terminal-border rounded-lg px-4 py-2.5 focus-within:border-primary focus-within:shadow-glow-blue transition-all">
            <Search className="w-5 h-5 text-text-muted flex-shrink-0" />
            <input
              type="text"
              placeholder="Search customer by name or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent text-[15px] text-text-primary placeholder-text-muted outline-none w-full"
            />
          </div>
          {/* Title and count are secondary — on mobile the search bar takes the row */}
          <div className="hidden md:flex items-center gap-4 flex-shrink-0">
            <span className="text-xs text-text-muted whitespace-nowrap">{configuredCount}/{rows.length} configured</span>
            <div className="flex items-center gap-2.5">
              <div className="card-icon"><Star className="w-4 h-4" /></div>
              <h2 className="font-semibold text-[15px]">{pairLabel} Customer Fees</h2>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <RefreshCw className="w-5 h-5 text-primary animate-spin mx-auto mb-3" />
            <p className="text-text-muted text-sm">Loading customer fees...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-terminal-border">
                  <th className="table-header text-left px-4 py-3">Customer</th>
                  <th className="table-header text-center px-3 py-3">Points</th>
                  <th className="table-header text-center px-3 py-3">Fee %</th>
                  <th className="table-header text-center px-3 py-3 w-36">Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  return (
                    <tr
                      key={row.customerId}
                      className="border-b border-terminal-border/40 hover:bg-terminal-surface/40 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold text-text-primary text-[13px]">{row.name}</div>
                        <div className="text-xxs text-text-muted mt-0.5">
                          {row.customerCode} · <span className="text-amber-500">{'★'.repeat(row.level)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          {POINT_PRESETS.map((pt) => (
                            <button
                              key={pt}
                              onClick={() => save(row, { points: row.points === pt ? null : pt })}
                              className={cn(
                                'px-2 py-1 text-xs font-mono rounded border transition-colors',
                                row.points === pt
                                  ? 'bg-primary text-white border-primary'
                                  : 'bg-terminal-surface-2 text-text-primary border-terminal-border hover:border-primary',
                              )}
                            >
                              {pt}pt
                            </button>
                          ))}
                          <input
                            type="number"
                            step="any"
                            min="0"
                            placeholder="custom"
                            value={row.customText}
                            onChange={(e) =>
                              setRows((prev) =>
                                prev.map((r) =>
                                  r.customerId === row.customerId ? { ...r, customText: e.target.value } : r,
                                ),
                              )
                            }
                            onBlur={() => commitCustomPoints(row)}
                            onKeyDown={(e) => { if (e.key === 'Enter') commitCustomPoints(row); }}
                            className="w-20 bg-terminal-surface-2 border border-terminal-border rounded px-2 py-1 text-xs font-mono text-text-primary text-right outline-none focus:border-primary"
                          />
                          <button
                            onClick={() => save(row, { points: null })}
                            title="Clear points"
                            className="p-1 text-text-muted hover:text-text-primary transition-colors"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          {PERCENT_PRESETS.map((p) => (
                            <button
                              key={p.pct}
                              onClick={() => save(row, { percent: row.percent === p.pct ? null : p.pct })}
                              className={cn(
                                'px-2 py-1 rounded border text-center transition-colors',
                                row.percent === p.pct
                                  ? 'bg-primary text-white border-primary'
                                  : 'bg-terminal-surface-2 text-text-primary border-terminal-border hover:border-primary',
                              )}
                            >
                              <div className="text-[9px] leading-tight">{'★'.repeat(p.stars)}</div>
                              <div className="text-xxs font-mono leading-tight">{p.pct}%</div>
                            </button>
                          ))}
                          <input
                            type="number"
                            step="any"
                            min="0"
                            placeholder="custom"
                            value={row.percentText}
                            onChange={(e) =>
                              setRows((prev) =>
                                prev.map((r) =>
                                  r.customerId === row.customerId ? { ...r, percentText: e.target.value } : r,
                                ),
                              )
                            }
                            onBlur={() => commitCustomPercent(row)}
                            onKeyDown={(e) => { if (e.key === 'Enter') commitCustomPercent(row); }}
                            className="w-16 bg-terminal-surface-2 border border-terminal-border rounded px-2 py-1 text-xs font-mono text-text-primary text-right outline-none focus:border-primary"
                          />
                          <button
                            onClick={() => save(row, { percent: null })}
                            title="Clear fee %"
                            className="p-1 text-text-muted hover:text-text-primary transition-colors"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleResetRow(row)}
                            className="btn-outline text-xxs py-1 px-2 flex items-center gap-1"
                          >
                            <RotateCcw className="w-3 h-3" /> Reset
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-text-muted text-sm">
                      No customers found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-5 py-3 border-t border-terminal-border flex items-center gap-2 text-xs text-text-muted">
          <Info className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <span>
            Fees are per customer for the selected pair. The <strong>star-tier %</strong> is charged to the
            customer; <strong>Points</strong> are the customer's spread (1pt = 0.01), a discount given back
            (rate + fee − points). More stars, lower fee. Empty means nothing extra for that customer.
          </span>
        </div>
      </div>
    </div>
  );
}
