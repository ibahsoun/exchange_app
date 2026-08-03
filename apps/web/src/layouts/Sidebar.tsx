import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { LayoutDashboard, TrendingUp, ArrowLeftRight, Users, Settings, Clock, Percent, Star, MapPin, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useSettings } from '@/contexts/SettingsContext';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/live-rates', label: 'Live Rates', icon: TrendingUp },
  { to: '/spread-settings', label: 'Level Points', icon: Star },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/destinations', label: 'Destinations', icon: MapPin },
];

const COLLAPSE_KEY = 'sidebarCollapsed';
/** Below this width the full sidebar leaves too little room for the page */
const NARROW_PX = 768;

function initialCollapsed(): boolean {
  if (window.innerWidth < NARROW_PX) return true;
  return localStorage.getItem(COLLAPSE_KEY) === '1';
}

export function Sidebar() {
  const location = useLocation();
  const { showSettlementTerms, showMargins } = useSettings();
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  // Collapse when the window gets narrow; restore the saved choice when it grows
  useEffect(() => {
    const onResize = () => setCollapsed(initialCollapsed());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const toggleCollapsed = () =>
    setCollapsed((c) => {
      localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      return !c;
    });

  const dynamicItems = [
    ...(showSettlementTerms
      ? [{ to: '/settlement-terms', label: 'Settlement Terms', icon: Clock }]
      : []),
    ...(showMargins
      ? [{ to: '/margins', label: 'Margins', icon: Percent }]
      : []),
  ];

  const linkClass = (isActive: boolean) =>
    cn(
      'group flex items-center gap-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150',
      collapsed ? 'justify-center px-0' : 'px-3',
      isActive
        ? 'bg-primary text-white shadow-glow-blue'
        : 'text-text-secondary hover:text-text-primary hover:bg-terminal-surface',
    );

  const iconClass = (isActive: boolean) =>
    cn(
      'w-[18px] h-[18px] flex-shrink-0 transition-colors',
      isActive ? 'text-white' : 'text-text-muted group-hover:text-text-secondary',
    );

  return (
    <aside
      className={cn(
        'bg-terminal-card border-r border-terminal-border flex flex-col h-full transition-all duration-200',
        collapsed ? 'w-16 min-w-16' : 'w-[228px] min-w-[228px]',
      )}
    >
      {/* ── Brand ────────────────────────────────────── */}
      <div className={cn('pt-5 pb-4 flex items-center gap-3', collapsed ? 'px-0 flex-col' : 'px-5')}>
        <button
          onClick={collapsed ? toggleCollapsed : undefined}
          title={collapsed ? 'Expand menu' : undefined}
          className={cn(
            'w-9 h-9 rounded-xl bg-primary shadow-glow-blue flex items-center justify-center flex-shrink-0',
            collapsed ? 'cursor-pointer' : 'cursor-default',
          )}
        >
          <ArrowLeftRight className="w-[18px] h-[18px] text-white" strokeWidth={2.4} />
        </button>
        {!collapsed && (
          <div className="overflow-hidden flex-1">
            <div className="text-[13px] font-bold text-text-primary leading-tight truncate">
              Exchange Center
            </div>
            <div className="text-xxs text-text-muted uppercase tracking-widest mt-0.5">
              Enterprise Edition
            </div>
          </div>
        )}
        <button
          onClick={toggleCollapsed}
          title={collapsed ? 'Expand menu' : 'Collapse menu'}
          className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-terminal-surface transition-colors flex-shrink-0"
        >
          {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      {/* ── Main navigation ──────────────────────────── */}
      <nav className={cn('flex-1 mt-1 space-y-0.5', collapsed ? 'px-2' : 'px-3')}>
        {navItems.map(({ to, label, icon: Icon }) => {
          const isActive = location.pathname.startsWith(to);
          return (
            <NavLink key={to} to={to} title={collapsed ? label : undefined} className={linkClass(isActive)}>
              <Icon className={iconClass(isActive)} />
              {!collapsed && label}
            </NavLink>
          );
        })}

        {/* ── Dynamic sections ──────────────────────────── */}
        {dynamicItems.length > 0 && (
          <>
            <div className="pt-3 pb-1 px-3">
              <div className="h-px bg-terminal-border" />
            </div>
            {dynamicItems.map(({ to, label, icon: Icon }) => {
              const isActive = location.pathname.startsWith(to);
              return (
                <NavLink key={to} to={to} title={collapsed ? label : undefined} className={linkClass(isActive)}>
                  <Icon className={iconClass(isActive)} />
                  {!collapsed && label}
                </NavLink>
              );
            })}
          </>
        )}
      </nav>

      {/* ── Bottom: Settings ─────────────────────────── */}
      <div className={cn('pb-3 pt-3 border-t border-terminal-border', collapsed ? 'px-2' : 'px-3')}>
        <NavLink
          to="/settings"
          title={collapsed ? 'Configuration' : undefined}
          className={linkClass(location.pathname.startsWith('/settings'))}
        >
          <Settings className="w-[18px] h-[18px] flex-shrink-0 text-text-muted" />
          {!collapsed && 'Configuration'}
        </NavLink>
      </div>

      {/* ── User panel ───────────────────────────────── */}
      <div
        className={cn(
          'py-4 border-t border-terminal-border flex items-center gap-3',
          collapsed ? 'px-0 justify-center' : 'px-4',
        )}
      >
        <div className="w-8 h-8 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-[11px] font-bold text-status-blue flex-shrink-0">
          HH
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <div className="text-[13px] font-semibold text-text-primary truncate">
              Hussein Hobballah
            </div>
            <div className="text-xxs text-text-muted font-mono tracking-wide truncate">Tyre</div>
          </div>
        )}
      </div>
    </aside>
  );
}
