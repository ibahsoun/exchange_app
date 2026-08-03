import { WifiOff } from 'lucide-react';
import { useRatesConnected } from '@/hooks/useRates';

/**
 * Sticky banner shown when the WebSocket connection to the rates
 * service is lost. Renders nothing when connected.
 */
export function DisconnectedBanner() {
  const connected = useRatesConnected();

  if (connected) return null;

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
