import { useState, useEffect } from 'react';
import { RefreshCw, Check, Info, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { spreadApi, levelPointsApi, type LevelPointEntry, type LevelPointsType, type FixedUnit } from '@/lib/api';

interface LevelPointsLocalRow {
  base: string;
  quote: string;
  pair: string;
  quoteName: string;
  pointsType: LevelPointsType;
  fixedUnit: FixedUnit;
  levels: { level: number; value: string }[];
  dirty: boolean;
  saving: boolean;
  saved: boolean;
}

export function SpreadSettingsPage() {
  const [rows, setRows] = useState<LevelPointsLocalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch pairs from spread API to know which pairs exist
      const spreads = await spreadApi.getAll();
      const results: LevelPointsLocalRow[] = [];
      await Promise.all(
        spreads.map(async (s) => {
          try {
            const res = await levelPointsApi.get(s.base, s.quote);
            results.push({
              base: s.base,
              quote: s.quote,
              pair: s.pair,
              quoteName: s.quoteName,
              pointsType: res.pointsType,
              fixedUnit: 'RAW',
              levels: res.levels.map((l) => ({ level: l.level, value: String(l.points || '') })),
              dirty: false,
              saving: false,
              saved: false,
            });
          } catch {
            results.push({
              base: s.base,
              quote: s.quote,
              pair: s.pair,
              quoteName: s.quoteName,
              pointsType: 'PERCENTAGE',
              fixedUnit: 'RAW',
              levels: [1, 2, 3, 4, 5].map((l) => ({ level: l, value: '' })),
              dirty: false,
              saving: false,
              saved: false,
            });
          }
        }),
      );
      // Sort to match original pairs order
      const order = new Map(spreads.map((s, i) => [s.pair, i]));
      results.sort((a, b) => (order.get(a.pair) ?? 0) - (order.get(b.pair) ?? 0));
      setRows(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const updateLevel = (rowIdx: number, levelIdx: number, value: string) => {
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== rowIdx) return r;
        const levels = r.levels.map((l, li) => (li === levelIdx ? { ...l, value } : l));
        return { ...r, levels, dirty: true, saved: false };
      }),
    );
  };

  const updatePointsType = (rowIdx: number, pointsType: LevelPointsType) => {
    setRows((prev) =>
      prev.map((r, i) => (i === rowIdx ? { ...r, pointsType, dirty: true, saved: false } : r)),
    );
  };

  const updateFixedUnit = (rowIdx: number, fixedUnit: FixedUnit) => {
    setRows((prev) =>
      prev.map((r, i) => (i === rowIdx ? { ...r, fixedUnit, dirty: true, saved: false } : r)),
    );
  };

  const handleSave = async (idx: number) => {
    const row = rows[idx];
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, saving: true } : r)));
    try {
      await levelPointsApi.update({
        base: row.base,
        quote: row.quote,
        pointsType: row.pointsType,
        fixedUnit: row.fixedUnit,
        levels: row.levels.map((l) => ({ level: l.level, points: parseFloat(l.value) || 0 })),
      });
      setRows((prev) =>
        prev.map((r, i) => (i === idx ? { ...r, saving: false, dirty: false, saved: true } : r)),
      );
      setTimeout(() => {
        setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, saved: false } : r)));
      }, 1500);
    } catch {
      setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, saving: false } : r)));
    }
  };

  const unitLabel = (row: LevelPointsLocalRow) => {
    if (row.pointsType === 'PERCENTAGE') return '%';
    return 'raw';
  };

  if (loading) {
    return (
      <div className="space-y-5">
        <h1 className="text-xl font-bold text-text-primary">Customer Level Points</h1>
        <div className="card p-8 text-center">
          <RefreshCw className="w-5 h-5 text-primary animate-spin mx-auto mb-3" />
          <p className="text-text-muted text-sm">Loading level points...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-5">
        <h1 className="text-xl font-bold text-text-primary">Customer Level Points</h1>
        <div className="card p-8 text-center">
          <p className="text-status-red text-sm mb-3">{error}</p>
          <button onClick={fetchAll} className="btn-primary text-sm">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Customer Level Points</h1>
          <p className="text-text-muted text-sm mt-0.5">Configure fees per customer star level, per currency pair</p>
        </div>
        <button onClick={fetchAll} className="btn-outline text-xs py-1.5 px-3 flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-2.5">
            <div className="card-icon"><Star className="w-4 h-4" /></div>
            <h2 className="font-semibold text-[15px]">Level Points Configuration</h2>
          </div>
          <span className="text-xs text-text-muted">{rows.length} pairs · higher stars = lower fee</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-terminal-border">
                <th className="table-header text-left px-4 py-3">Pair</th>
                <th className="table-header text-center px-3 py-3">Type</th>
                {[1, 2, 3, 4, 5].map((l) => (
                  <th key={l} className="table-header text-center px-3 py-3">
                    {'★'.repeat(l)} ({l})
                  </th>
                ))}
                <th className="table-header text-center px-3 py-3 w-20">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={row.pair} className="border-b border-terminal-border/40 hover:bg-terminal-surface/40 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-text-primary text-[13px]">{row.pair}</div>
                    <div className="text-xxs text-text-muted mt-0.5">{row.quoteName}</div>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <select
                        value={row.pointsType}
                        onChange={(e) => updatePointsType(idx, e.target.value as LevelPointsType)}
                        className="bg-terminal-surface-2 border border-terminal-border rounded px-2 py-1 text-xs font-mono text-text-primary outline-none focus:border-primary"
                      >
                        <option value="PERCENTAGE">%</option>
                        <option value="FIXED">Fixed</option>
                      </select>
                      {row.pointsType === 'FIXED' && (
                        <span className="text-xxs font-mono text-text-muted px-2 py-1">RAW</span>
                      )}
                    </div>
                  </td>
                  {row.levels.map((l, li) => (
                    <td key={l.level} className="px-3 py-3 text-center">
                      <div className="inline-flex items-center gap-1">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          placeholder="0"
                          value={l.value}
                          onChange={(e) => updateLevel(idx, li, e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(idx); }}
                          className="w-16 bg-terminal-surface-2 border border-terminal-border rounded px-2 py-1 text-xs font-mono text-text-primary text-right outline-none focus:border-primary"
                        />
                        <span className="text-xxs text-text-muted">{unitLabel(row)}</span>
                      </div>
                    </td>
                  ))}
                  <td className="px-3 py-3 text-center">
                    {row.saved ? (
                      <span className="inline-flex items-center gap-1 text-status-green text-xxs font-semibold">
                        <Check className="w-3 h-3" /> Saved
                      </span>
                    ) : (
                      <button
                        onClick={() => handleSave(idx)}
                        disabled={!row.dirty || row.saving}
                        className={cn(
                          'px-3 py-1 text-xs rounded font-semibold transition-colors',
                          row.dirty
                            ? 'bg-primary text-white hover:bg-primary-hover'
                            : 'bg-terminal-surface text-text-muted cursor-not-allowed',
                          row.saving && 'opacity-60',
                        )}
                      >
                        {row.saving ? '...' : 'Save'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-text-muted text-sm">No pairs configured</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-terminal-border flex items-center gap-2 text-xs text-text-muted">
          <Info className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <span>
            Level points add an extra fee on top of the spread. Use <strong>%</strong> for a percentage of the mid rate,
            or <strong>Fixed</strong> with <strong>Pips</strong> (0.0001 per pip) or <strong>Raw</strong> (absolute value).
            Higher star customers (VIP) should have lower values. A value of 0 means no additional fee.
          </span>
        </div>
      </div>
    </div>
  );
}
