import { useState, useEffect, useMemo } from 'react';
import { SlidersHorizontal, RefreshCw, Check, Info, ChevronDown, AlertTriangle } from 'lucide-react';
import { cn, formatRate } from '@/lib/utils';
import { spreadApi, type SpreadRow, type SpreadType, type SpreadMode, type FixedUnit } from '@/lib/api';

const PIP_SIZES: Record<string, number> = { JPY: 0.01, KRW: 0.01, HUF: 0.01 };
function pipSize(quote: string) { return PIP_SIZES[quote] ?? 0.0001; }
function pipsToRaw(pips: number, quote: string) { return pips * pipSize(quote); }

interface LocalRow extends SpreadRow {
  localType: SpreadType;
  localMode: SpreadMode;
  localUnit: FixedUnit;
  localPercent: string;
  localFixed: string;
  localBuy: string;
  localSell: string;
  dirty: boolean;
  saving: boolean;
  saved: boolean;
  error: string | null;
}

function rowFromData(r: SpreadRow): LocalRow {
  return {
    ...r,
    localType: r.spreadType || 'PERCENTAGE',
    localMode: r.spreadMode || 'SYMMETRIC',
    localUnit: r.fixedUnit || 'RAW',
    localPercent: String(r.spreadPercent || ''),
    localFixed: String(r.spreadFixed || ''),
    localBuy: String(r.buyMargin || ''),
    localSell: String(r.sellMargin || ''),
    dirty: false,
    saving: false,
    saved: false,
    error: null,
  };
}

function validateRow(row: LocalRow): string | null {
  const mid = row.mid;
  if (!mid || mid <= 0) return null;

  if (row.localType === 'PERCENTAGE') {
    if (row.localMode === 'SYMMETRIC') {
      const v = parseFloat(row.localPercent) || 0;
      if (v < 0) return 'Spread % cannot be negative.';
      if (v >= 200) return 'Spread % would make bid <= 0.';
    } else {
      const b = parseFloat(row.localBuy) || 0;
      const s = parseFloat(row.localSell) || 0;
      if (b < 0 || s < 0) return 'Margins cannot be negative.';
      if (b >= 100) return 'Buy margin % would make bid <= 0.';
    }
    return null;
  }

  // FIXED validation
  if (row.localMode === 'SYMMETRIC') {
    const v = parseFloat(row.localFixed) || 0;
    if (v < 0) return 'Fixed spread cannot be negative.';
    const raw = row.localUnit === 'PIPS' ? pipsToRaw(v, row.quote) : v;
    if (raw >= 2 * mid) return `Fixed spread too large for mid=${formatRate(mid)}. Bid would be <= 0.`;
  } else {
    const b = parseFloat(row.localBuy) || 0;
    const s = parseFloat(row.localSell) || 0;
    if (b < 0 || s < 0) return 'Fixed offsets cannot be negative.';
    const buyRaw = row.localUnit === 'PIPS' ? pipsToRaw(b, row.quote) : b;
    if (buyRaw >= mid) return `Buy offset too large for mid=${formatRate(mid)}. Bid would be <= 0.`;
  }
  return null;
}

export function SpreadSettingsPage() {
  const [rows, setRows] = useState<LocalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSpreads = async () => {
    try {
      const data = await spreadApi.getAll();
      setRows(data.map(rowFromData));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load spreads');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSpreads(); }, []);

  const update = (idx: number, patch: Partial<LocalRow>) => {
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== idx) return r;
        const next = { ...r, ...patch, dirty: true, saved: false };
        next.error = validateRow(next);
        return next;
      }),
    );
  };

  const handleSave = async (idx: number) => {
    const row = rows[idx];
    if (row.error) return;

    const spreadPercent = parseFloat(row.localPercent) || 0;
    const spreadFixed = parseFloat(row.localFixed) || 0;
    const buyMargin = parseFloat(row.localBuy) || 0;
    const sellMargin = parseFloat(row.localSell) || 0;

    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, saving: true } : r)));

    try {
      await spreadApi.update({
        base: row.base,
        quote: row.quote,
        spreadType: row.localType,
        spreadMode: row.localMode,
        fixedUnit: row.localUnit,
        spreadPercent,
        spreadFixed,
        buyMargin,
        sellMargin,
      });
      const data = await spreadApi.getAll();
      setRows(data.map((r, i) => ({ ...rowFromData(r), saved: i === idx })));
      setTimeout(() => {
        setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, saved: false } : r)));
      }, 1500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, saving: false, error: msg } : r)));
    }
  };

  if (loading) {
    return (
      <div className="space-y-5">
        <h1 className="text-xl font-bold text-text-primary">Spread Settings</h1>
        <div className="card p-8 text-center">
          <RefreshCw className="w-5 h-5 text-primary animate-spin mx-auto mb-3" />
          <p className="text-text-muted text-sm">Loading spread configuration...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-5">
        <h1 className="text-xl font-bold text-text-primary">Spread Settings</h1>
        <div className="card p-8 text-center">
          <p className="text-status-red text-sm mb-3">{error}</p>
          <button onClick={() => { setLoading(true); fetchSpreads(); }} className="btn-primary text-sm">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Spread Settings</h1>
          <p className="text-text-muted text-sm mt-0.5">Configure bid/ask spread per currency pair</p>
        </div>
        <button onClick={() => { setLoading(true); fetchSpreads(); }} className="btn-outline text-xs py-1.5 px-3 flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-2.5">
            <div className="card-icon"><SlidersHorizontal className="w-4 h-4" /></div>
            <h2 className="font-semibold text-[15px]">Spread Configuration</h2>
          </div>
          <span className="text-xs text-text-muted">{rows.length} pairs</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-terminal-border">
                <th className="table-header text-left px-4 py-3">Pair</th>
                <th className="table-header text-right px-3 py-3">Mid Rate</th>
                <th className="table-header text-left px-3 py-3">Type</th>
                <th className="table-header text-left px-3 py-3">Mode</th>
                <th className="table-header text-left px-3 py-3">Spread Value</th>
                <th className="table-header text-right px-3 py-3">Bid</th>
                <th className="table-header text-right px-3 py-3">Ask</th>
                <th className="table-header text-center px-3 py-3 w-20">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <SpreadRowCmp key={row.pair} row={row} onUpdate={(p) => update(idx, p)} onSave={() => handleSave(idx)} />
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-text-muted text-sm">No pairs configured</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-terminal-border flex items-center gap-2 text-xs text-text-muted">
          <Info className="w-4 h-4 text-primary flex-shrink-0" />
          <span>
            <strong className="text-text-primary">Percentage</strong>: offset as % of mid.{' '}
            <strong className="text-text-primary">Fixed RAW</strong>: absolute offset in quote currency (e.g. EUR per 1 USD). Typical values: 0.0001–0.01.{' '}
            <strong className="text-text-primary">Fixed PIPS</strong>: offset in pips (1 pip = {'{'}0.0001 for most FX{'}'}).{' '}
            <strong className="text-text-primary">Symmetric</strong>: equal both sides.{' '}
            <strong className="text-text-primary">Asymmetric</strong>: separate buy/sell margins.
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Components ────────────────────────────────────────────

function MiniSelect({ value, options, onChange }: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-terminal-surface-2 border border-terminal-border rounded px-2.5 py-1 pr-7 text-xs font-semibold text-text-primary outline-none focus:border-primary cursor-pointer"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted pointer-events-none" />
    </div>
  );
}

function SpreadRowCmp({ row, onUpdate, onSave }: {
  row: LocalRow;
  onUpdate: (patch: Partial<LocalRow>) => void;
  onSave: () => void;
}) {
  const isPercent = row.localType === 'PERCENTAGE';
  const isFixed = !isPercent;
  const isSymmetric = row.localMode === 'SYMMETRIC';
  const isPips = row.localUnit === 'PIPS';
  const hasError = !!row.error;

  // Show RAW warning for non-LBP pairs using FIXED RAW
  const showRawWarning = isFixed && !isPips && row.quote !== 'LBP';

  // Computed effective value for PIPS display
  const pipsPreview = useMemo(() => {
    if (!isFixed || !isPips) return null;
    if (isSymmetric) {
      const v = parseFloat(row.localFixed) || 0;
      return v > 0 ? `${v} pips = ${pipsToRaw(v, row.quote)} ${row.quote}` : null;
    }
    const b = parseFloat(row.localBuy) || 0;
    const s = parseFloat(row.localSell) || 0;
    if (b <= 0 && s <= 0) return null;
    return `B: ${b}→${pipsToRaw(b, row.quote)} / S: ${s}→${pipsToRaw(s, row.quote)} ${row.quote}`;
  }, [isFixed, isPips, isSymmetric, row.localFixed, row.localBuy, row.localSell, row.quote]);

  const inputBorderClass = hasError ? 'border-status-red' : 'border-terminal-border';

  return (
    <tr className="border-b border-terminal-border/40 hover:bg-terminal-surface/40 transition-colors align-top">
      <td className="px-4 py-3">
        <div className="font-semibold text-text-primary text-[13px]">{row.pair}</div>
        <div className="text-xxs text-text-muted mt-0.5">{row.quoteName}</div>
      </td>
      <td className="px-3 py-3 text-right font-mono text-[12px] text-text-primary">
        {formatRate(row.mid)}
      </td>
      <td className="px-3 py-3">
        <MiniSelect
          value={row.localType}
          options={[
            { value: 'PERCENTAGE', label: '%' },
            { value: 'FIXED', label: 'Fixed' },
          ]}
          onChange={(v) => onUpdate({ localType: v as SpreadType })}
        />
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-col gap-1">
          <MiniSelect
            value={row.localMode}
            options={[
              { value: 'SYMMETRIC', label: 'Sym' },
              { value: 'ASYMMETRIC', label: 'Asym' },
            ]}
            onChange={(v) => onUpdate({ localMode: v as SpreadMode })}
          />
          {isFixed && (
            <MiniSelect
              value={row.localUnit}
              options={[
                { value: 'RAW', label: 'RAW' },
                { value: 'PIPS', label: 'PIPS' },
              ]}
              onChange={(v) => onUpdate({ localUnit: v as FixedUnit })}
            />
          )}
        </div>
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-col gap-1">
          {isSymmetric ? (
            <div className="inline-flex items-center gap-1.5">
              <input
                type="number"
                step="any"
                min="0"
                value={isPercent ? row.localPercent : row.localFixed}
                onChange={(e) => onUpdate(isPercent ? { localPercent: e.target.value } : { localFixed: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter' && !hasError) onSave(); }}
                className={cn('w-20 bg-terminal-surface-2 border rounded px-2 py-1 text-xs font-mono text-text-primary text-right outline-none focus:border-primary', inputBorderClass)}
              />
              <span className="text-xxs text-text-muted font-semibold">
                {isPercent ? '%' : isPips ? 'pips' : row.quote}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-1">
                <span className="text-xxs text-text-muted">B</span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={row.localBuy}
                  onChange={(e) => onUpdate({ localBuy: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !hasError) onSave(); }}
                  className={cn('w-16 bg-terminal-surface-2 border rounded px-2 py-1 text-xs font-mono text-text-primary text-right outline-none focus:border-primary', inputBorderClass)}
                />
              </div>
              <div className="inline-flex items-center gap-1">
                <span className="text-xxs text-text-muted">S</span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={row.localSell}
                  onChange={(e) => onUpdate({ localSell: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !hasError) onSave(); }}
                  className={cn('w-16 bg-terminal-surface-2 border rounded px-2 py-1 text-xs font-mono text-text-primary text-right outline-none focus:border-primary', inputBorderClass)}
                />
              </div>
              <span className="text-xxs text-text-muted font-semibold">
                {isPercent ? '%' : isPips ? 'pips' : row.quote}
              </span>
            </div>
          )}
          {pipsPreview && (
            <span className="text-xxs text-text-muted font-mono">{pipsPreview}</span>
          )}
          {showRawWarning && (
            <span className="flex items-center gap-1 text-xxs text-status-yellow">
              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
              RAW = absolute {row.quote} units. Consider PIPS or %.
            </span>
          )}
          {hasError && (
            <span className="text-xxs text-status-red font-semibold">{row.error}</span>
          )}
        </div>
      </td>
      <td className="px-3 py-3 text-right font-mono text-[12px] text-text-primary">
        {row.bid ? formatRate(row.bid) : '—'}
      </td>
      <td className="px-3 py-3 text-right font-mono text-[12px] text-text-primary">
        {row.ask ? formatRate(row.ask) : '—'}
      </td>
      <td className="px-3 py-3 text-center">
        {row.saved ? (
          <span className="inline-flex items-center gap-1 text-status-green text-xxs font-semibold">
            <Check className="w-3 h-3" /> Saved
          </span>
        ) : (
          <button
            onClick={onSave}
            disabled={!row.dirty || row.saving || hasError}
            className={cn(
              'px-3 py-1 text-xs rounded font-semibold transition-colors',
              row.dirty && !hasError
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
  );
}
