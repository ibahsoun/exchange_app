import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { useRatesConnected } from '@/hooks/useRates';

/** How long the feed may be down before we alarm the user. */
const GRACE_MS = 6000;

/**
 * Sticky banner shown when the connection to the rates service is lost.
 * Renders nothing when connected.
 *
 * The store starts disconnected, so rendering purely on `connected` flashed
 * "API Disconnected" on every page load and during each brief reconnect.
 * Wait out a grace period first — the header shows "Connecting..." meanwhile.
 */
export function DisconnectedBanner() {
  const connected = useRatesConnected();
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    if (connected) {
      setShowBanner(false);
      return;
    }
    const timer = setTimeout(() => setShowBanner(true), GRACE_MS);
    return () => clearTimeout(timer);
  }, [connected]);

  if (!showBanner) return null;

  return (
    <div
      className="bg-status-red/10 border-b border-status-red/20 px-4 py-2 flex items-center justify-center gap-2 text-sm text-status-red"
      role="alert"
    >
      <WifiOff className="w-4 h-4 flex-shrink-0" />
      <span className="font-medium">API Disconnected</span>
      <span className="text-status-red/70">— Live rates are unavailable. Showing cached data.</span>
    </div>
  );
}
