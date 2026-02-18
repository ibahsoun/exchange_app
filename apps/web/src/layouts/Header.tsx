import { useEffect, useState } from 'react';
import { Bell, HelpCircle, Shield } from 'lucide-react';
import { useRatesConnected } from '@/hooks/useRates';

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

        {/* Divider */}
        <div className="divider-v mx-3" />

        {/* Mode pill */}
        <div className="flex items-center gap-1.5 bg-status-blue-subtle border border-status-blue/20 rounded-full px-3.5 py-1 ml-1">
          <Shield className="w-3 h-3 text-status-blue" />
          <span className="text-[11px] font-bold text-status-blue tracking-wide uppercase">
            Standard Teller Mode
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

        {/* Notifications */}
        <button className="relative p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-terminal-surface transition-colors">
          <Bell className="w-[18px] h-[18px]" />
          {/* Unread dot */}
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-status-red" />
        </button>

        {/* Help */}
        <button className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-terminal-surface transition-colors ml-1">
          <HelpCircle className="w-[18px] h-[18px]" />
        </button>
      </div>
    </header>
  );
}
