import { useState, useEffect, useCallback } from 'react';
import {
  Settings,
  Clock,
  Percent,
  Radio,
  RefreshCw,
  Coins,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  X,
} from 'lucide-react';
import { useSettings } from '@/contexts/SettingsContext';
import { schedulerApi, currenciesApi, type Currency } from '@/lib/api';
import { cn } from '@/lib/utils';

const COLOR_OPTIONS = [
  'bg-emerald-600',
  'bg-blue-500',
  'bg-amber-600',
  'bg-sky-700',
  'bg-red-700',
  'bg-green-600',
  'bg-teal-600',
  'bg-emerald-500',
  'bg-yellow-500',
  'bg-yellow-600',
  'bg-purple-600',
  'bg-pink-600',
  'bg-indigo-600',
  'bg-orange-600',
  'bg-gray-600',
];

function Toggle({
  enabled,
  onChange,
  disabled,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
        enabled ? 'bg-primary' : 'bg-terminal-border',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200',
          enabled ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  );
}

export function SettingsPage() {
  const {
    showSettlementTerms,
    showMargins,
    setShowSettlementTerms,
    setShowMargins,
  } = useSettings();

  const [liveRatesEnabled, setLiveRatesEnabled] = useState(true);
  const [schedulerLoading, setSchedulerLoading] = useState(true);
  const [fetching, setFetching] = useState(false);

  // ─── Currencies state ─────────────────────────────
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ code: '', name: '', symbol: '', color: 'bg-gray-600' });
  const [addError, setAddError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    currenciesApi.list().then(setCurrencies).catch(console.error);
  }, []);

  const handleAddCurrency = useCallback(async () => {
    if (!addForm.code.trim() || !addForm.name.trim() || !addForm.symbol.trim()) {
      setAddError('All fields are required');
      return;
    }
    setSaving(true);
    setAddError('');
    try {
      const created = await currenciesApi.create({
        code: addForm.code.toUpperCase().trim(),
        name: addForm.name.trim(),
        symbol: addForm.symbol.trim(),
        color: addForm.color,
      });
      setCurrencies((prev) => [...prev, created]);
      setAddForm({ code: '', name: '', symbol: '', color: 'bg-gray-600' });
      setShowAddForm(false);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add currency');
    } finally {
      setSaving(false);
    }
  }, [addForm]);

  const handleDeleteCurrency = useCallback(async (id: string) => {
    try {
      await currenciesApi.delete(id);
      setCurrencies((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error('Failed to delete currency:', err);
    }
  }, []);

  const handleMove = useCallback(async (index: number, direction: 'up' | 'down') => {
    setCurrencies((prev) => {
      const arr = [...prev];
      const swapIdx = direction === 'up' ? index - 1 : index + 1;
      if (swapIdx < 0 || swapIdx >= arr.length) return prev;
      [arr[index], arr[swapIdx]] = [arr[swapIdx], arr[index]];
      // Reassign sortIndex
      const items = arr.map((c, i) => ({ id: c.id, sortIndex: i }));
      currenciesApi.reorder(items).catch(console.error);
      return arr.map((c, i) => ({ ...c, sortIndex: i }));
    });
  }, []);

  // Load scheduler status on mount
  useEffect(() => {
    schedulerApi.getStatus()
      .then(({ paused }) => setLiveRatesEnabled(!paused))
      .catch(() => {})
      .finally(() => setSchedulerLoading(false));
  }, []);

  const handleToggleLiveRates = useCallback(async (enabled: boolean) => {
    setSchedulerLoading(true);
    try {
      if (enabled) {
        const res = await schedulerApi.resume();
        setLiveRatesEnabled(!res.paused);
      } else {
        const res = await schedulerApi.pause();
        setLiveRatesEnabled(!res.paused);
      }
    } catch {
      // revert on error
    } finally {
      setSchedulerLoading(false);
    }
  }, []);

  const handleFetchOnce = useCallback(async () => {
    setFetching(true);
    try {
      await schedulerApi.fetchOnce();
    } catch {
      // ignore
    } finally {
      setFetching(false);
    }
  }, []);

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <Settings className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Configuration</h1>
          <p className="text-text-muted text-sm">Manage application preferences</p>
        </div>
      </div>

      {/* ── Currencies ─────────────────────────────────── */}
      <div className="card mb-5">
        <div className="px-5 py-4 border-b border-terminal-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Coins className="w-4 h-4 text-text-muted" />
            <h2 className="text-[13px] font-semibold uppercase tracking-wider text-text-muted">
              Currencies
            </h2>
            <span className="text-[11px] text-text-muted font-mono">({currencies.length})</span>
          </div>
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="btn-outline text-xs py-1.5 px-3 flex items-center gap-1.5"
          >
            {showAddForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {showAddForm ? 'Cancel' : 'Add Currency'}
          </button>
        </div>

        {/* Add currency form */}
        {showAddForm && (
          <div className="px-5 py-4 border-b border-terminal-border bg-terminal-surface/30">
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div>
                <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wide block mb-1">Code</label>
                <input
                  type="text"
                  value={addForm.code}
                  onChange={(e) => setAddForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder="USD"
                  maxLength={5}
                  className="w-full bg-terminal-bg border border-terminal-border rounded-md px-3 py-2 text-sm text-text-primary outline-none focus:border-primary placeholder:text-text-muted font-mono uppercase"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wide block mb-1">Name</label>
                <input
                  type="text"
                  value={addForm.name}
                  onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="US Dollar"
                  className="w-full bg-terminal-bg border border-terminal-border rounded-md px-3 py-2 text-sm text-text-primary outline-none focus:border-primary placeholder:text-text-muted"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wide block mb-1">Symbol</label>
                <input
                  type="text"
                  value={addForm.symbol}
                  onChange={(e) => setAddForm((f) => ({ ...f, symbol: e.target.value }))}
                  placeholder="$"
                  maxLength={5}
                  className="w-full bg-terminal-bg border border-terminal-border rounded-md px-3 py-2 text-sm text-text-primary outline-none focus:border-primary placeholder:text-text-muted font-mono"
                />
              </div>
            </div>
            <div className="mb-3">
              <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wide block mb-1.5">Color</label>
              <div className="flex flex-wrap gap-1.5">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setAddForm((f) => ({ ...f, color: c }))}
                    className={cn(
                      'w-6 h-6 rounded-full transition-all',
                      c,
                      addForm.color === c ? 'ring-2 ring-primary ring-offset-2 ring-offset-terminal-bg scale-110' : 'opacity-60 hover:opacity-100',
                    )}
                  />
                ))}
              </div>
            </div>
            {addError && <p className="text-status-red text-xs mb-2">{addError}</p>}
            <button
              onClick={handleAddCurrency}
              disabled={saving}
              className="btn-primary text-xs py-2 px-4"
            >
              {saving ? 'Adding...' : 'Add Currency'}
            </button>
          </div>
        )}

        {/* Currency list */}
        {currencies.length === 0 ? (
          <div className="px-5 py-8 text-center text-text-muted text-sm">
            No currencies configured. Add your first currency above.
          </div>
        ) : (
          <div className="divide-y divide-terminal-border/40">
            {currencies.map((c, i) => (
              <div key={c.id} className="flex items-center gap-3 px-5 py-3 group">
                {/* Sort index badge */}
                <span className="w-6 h-6 rounded-md bg-terminal-surface flex items-center justify-center text-[11px] font-mono font-bold text-text-muted flex-shrink-0">
                  {i}
                </span>
                {/* Color dot */}
                <span className={cn('w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0', c.color)}>
                  {c.code.slice(0, 2)}
                </span>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-text-primary">{c.code}</span>
                    <span className="text-xs text-text-muted">{c.name}</span>
                  </div>
                  <span className="text-[11px] text-text-muted font-mono">Symbol: {c.symbol}</span>
                </div>
                {/* Reorder arrows */}
                <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleMove(i, 'up')}
                    disabled={i === 0}
                    className={cn('p-0.5 rounded hover:bg-terminal-surface transition-colors', i === 0 && 'opacity-30 cursor-not-allowed')}
                  >
                    <ChevronUp className="w-3.5 h-3.5 text-text-muted" />
                  </button>
                  <button
                    onClick={() => handleMove(i, 'down')}
                    disabled={i === currencies.length - 1}
                    className={cn('p-0.5 rounded hover:bg-terminal-surface transition-colors', i === currencies.length - 1 && 'opacity-30 cursor-not-allowed')}
                  >
                    <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
                  </button>
                </div>
                {/* Delete */}
                <button
                  onClick={() => handleDeleteCurrency(c.id)}
                  className="p-1.5 rounded hover:bg-status-red/10 text-text-muted hover:text-status-red transition-colors opacity-0 group-hover:opacity-100"
                  title={`Remove ${c.code}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Live Rates ───────────────────────────────────── */}
      <div className="card mb-5">
        <div className="px-5 py-4 border-b border-terminal-border">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-text-muted">
            Live Rates
          </h2>
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-b border-terminal-border/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-terminal-surface flex items-center justify-center">
              <Radio className="w-[18px] h-[18px] text-text-muted" />
            </div>
            <div>
              <div className="text-sm font-medium text-text-primary flex items-center gap-2">
                Live Rate Fetching
                {!schedulerLoading && (
                  <span className={cn(
                    'text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded',
                    liveRatesEnabled
                      ? 'bg-status-green/10 text-status-green'
                      : 'bg-status-yellow/10 text-status-yellow',
                  )}>
                    {liveRatesEnabled ? 'Active' : 'Paused'}
                  </span>
                )}
              </div>
              <div className="text-xs text-text-muted">
                When disabled, no API calls are made to rate providers. Cached rates remain available.
              </div>
            </div>
          </div>
          <Toggle
            enabled={liveRatesEnabled}
            onChange={handleToggleLiveRates}
            disabled={schedulerLoading}
          />
        </div>

        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-terminal-surface flex items-center justify-center">
              <RefreshCw className={cn('w-[18px] h-[18px] text-text-muted', fetching && 'animate-spin')} />
            </div>
            <div>
              <div className="text-sm font-medium text-text-primary">Fetch Rates Once</div>
              <div className="text-xs text-text-muted">
                Trigger a single rate fetch without enabling continuous polling
              </div>
            </div>
          </div>
          <button
            onClick={handleFetchOnce}
            disabled={fetching}
            className="btn-outline text-xs py-1.5 px-3"
          >
            {fetching ? 'Fetching...' : 'Fetch Now'}
          </button>
        </div>
      </div>

      {/* ── Sidebar Sections ─────────────────────────────── */}
      <div className="card">
        <div className="px-5 py-4 border-b border-terminal-border">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-text-muted">
            Sidebar Sections
          </h2>
        </div>

        {/* Settlement Terms toggle */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-terminal-border/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-terminal-surface flex items-center justify-center">
              <Clock className="w-[18px] h-[18px] text-text-muted" />
            </div>
            <div>
              <div className="text-sm font-medium text-text-primary">Settlement Terms</div>
              <div className="text-xs text-text-muted">
                Configure settlement timing options (Today, Tomorrow, etc.)
              </div>
            </div>
          </div>
          <Toggle enabled={showSettlementTerms} onChange={setShowSettlementTerms} />
        </div>

        {/* Margins toggle */}
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-terminal-surface flex items-center justify-center">
              <Percent className="w-[18px] h-[18px] text-text-muted" />
            </div>
            <div>
              <div className="text-sm font-medium text-text-primary">Margins</div>
              <div className="text-xs text-text-muted">
                Define fee tiers based on transaction amount ranges
              </div>
            </div>
          </div>
          <Toggle enabled={showMargins} onChange={setShowMargins} />
        </div>
      </div>
    </div>
  );
}
