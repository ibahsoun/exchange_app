import { useEffect, useState, useCallback } from 'react';
import { Moon, Sun, RefreshCw } from 'lucide-react';
import { useRatesConnected } from '@/hooks/useRates';
import { useTheme } from '@/contexts/ThemeContext';
import { schedulerApi } from '@/lib/api';
import { cn } from '@/lib/utils';

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function Header() {
  const now = useClock();
  const wsConnected = useRatesConnected();
  const { theme, toggleTheme } = useTheme();
  const [fetching, setFetching] = useState(false);

  const handleFetchRates = useCallback(async () => {
    setFetching(true);
    try {
      await schedulerApi.fetchOnce();
    } catch {
      // ignore
    } finally {
      setFetching(false);
    }
  }, []);

  const time = now.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const date = now
    .toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    })
    .toUpperCase();

  return (
    <header className="h-[52px] min-h-[52px] bg-terminal-card border-b border-terminal-border flex items-center justify-between px-6">
      {/* ── Left cluster ──────────────────────────────── */}
      <div className="flex items-center gap-0">
        {/* API status */}
        <div className="flex items-center gap-2 text-xs pr-4">
          <span className="relative flex h-2 w-2">
            {wsConnected && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-green opacity-60" />
            )}
            <span className={`relative inline-flex rounded-full h-2 w-2 ${wsConnected ? 'bg-status-green' : 'bg-status-yellow'}`} />
          </span>
          <span className="text-text-secondary font-medium">
            API: {wsConnected ? 'Connected' : 'Connecting...'}
          </span>
        </div>

      </div>

      {/* ── Right cluster ─────────────────────────────── */}
      <div className="flex items-center">
        {/* Clock */}
        <div className="text-right mr-5">
          <div className="text-[15px] font-mono font-bold text-text-primary leading-tight tracking-wider">
            {time}
          </div>
          <div className="text-xxs text-text-muted tracking-wider">{date}</div>
        </div>

        {/* Fetch rates */}
        <button
          onClick={handleFetchRates}
          disabled={fetching}
          className={cn(
            'p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-terminal-surface transition-colors mr-1',
            fetching && 'opacity-60 cursor-not-allowed',
          )}
          title="Refresh live rates"
        >
          <RefreshCw className={cn('w-[18px] h-[18px]', fetching && 'animate-spin')} />
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-terminal-surface transition-colors mr-1"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? (
            <Sun className="w-[18px] h-[18px]" />
          ) : (
            <Moon className="w-[18px] h-[18px]" />
          )}
        </button>

      </div>
    </header>
  );
}
