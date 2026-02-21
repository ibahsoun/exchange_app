import { useState, useEffect, useCallback } from 'react';
import { Settings, Clock, Percent, Radio, RefreshCw } from 'lucide-react';
import { useSettings } from '@/contexts/SettingsContext';
import { schedulerApi } from '@/lib/api';
import { cn } from '@/lib/utils';

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
          <h1 className="text-xl font-bold">Settings</h1>
          <p className="text-text-muted text-sm">Manage application preferences</p>
        </div>
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
