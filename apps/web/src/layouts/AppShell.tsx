import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { DisconnectedBanner } from '@/components/DisconnectedBanner';
import { useRatesConnection } from '@/hooks/useRates';

export function AppShell() {
  // Initialize WebSocket + REST fetch for rates at layout level
  useRatesConnection();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      {/* min-w-0 so wide tables scroll inside the page instead of stretching it */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <DisconnectedBanner />
        <Header />
        <main className="flex-1 overflow-y-auto p-6" role="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
