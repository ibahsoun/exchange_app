import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  TrendingUp,
  ArrowLeftRight,
  Users,
  Vault,
  Settings,
} from 'lucide-react';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/live-rates', label: 'Live Rates', icon: TrendingUp },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/vault', label: 'Vault Inventory', icon: Vault },
];

export function Sidebar() {
  const location = useLocation();

  return (
    <aside className="w-[228px] min-w-[228px] bg-terminal-card border-r border-terminal-border flex flex-col h-full">
      {/* ── Brand ────────────────────────────────────── */}
      <div className="px-5 pt-5 pb-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary shadow-glow-blue flex items-center justify-center">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="w-5 h-5 text-white"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M16 8h-6a2 2 0 100 4h4a2 2 0 010 4H8" />
            <path d="M12 6v2m0 8v2" />
          </svg>
        </div>
        <div className="overflow-hidden">
          <div className="text-[13px] font-bold text-text-primary leading-tight truncate">
            Unified Terminal
          </div>
          <div className="text-xxs text-text-muted uppercase tracking-widest mt-0.5">
            Enterprise Edition
          </div>
        </div>
      </div>

      {/* ── Main navigation ──────────────────────────── */}
      <nav className="flex-1 px-3 mt-1 space-y-0.5">
        {navItems.map(({ to, label, icon: Icon }) => {
          const isActive = location.pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              className={cn(
                'group flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150',
                isActive
                  ? 'bg-primary text-white shadow-glow-blue'
                  : 'text-text-secondary hover:text-text-primary hover:bg-terminal-surface',
              )}
            >
              <Icon
                className={cn(
                  'w-[18px] h-[18px] flex-shrink-0 transition-colors',
                  isActive
                    ? 'text-white'
                    : 'text-text-muted group-hover:text-text-secondary',
                )}
              />
              {label}
            </NavLink>
          );
        })}
      </nav>

      {/* ── Bottom: Settings ─────────────────────────── */}
      <div className="px-3 pb-3">
        <NavLink
          to="/settings"
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150',
            location.pathname.startsWith('/settings')
              ? 'bg-primary text-white'
              : 'text-text-secondary hover:text-text-primary hover:bg-terminal-surface',
          )}
        >
          <Settings className="w-[18px] h-[18px] flex-shrink-0 text-text-muted" />
          Settings
        </NavLink>
      </div>

      {/* ── User panel ───────────────────────────────── */}
      <div className="px-4 py-4 border-t border-terminal-border flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-[11px] font-bold text-white shadow-sm">
          MV
        </div>
        <div className="overflow-hidden">
          <div className="text-[13px] font-semibold text-text-primary truncate">
            Marcus V. Teller
          </div>
          <div className="text-xxs text-text-muted">Station 04-A</div>
        </div>
      </div>
    </aside>
  );
}
