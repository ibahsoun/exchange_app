import { useState, useMemo, useCallback, memo } from 'react';
import {
  Download,
  ArrowDownToLine,
  ArrowUpFromLine,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  DollarSign,
  Boxes,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/Toast';
import {
  vaultCurrencies as seedVaults,
  vaultSummary as seedSummary,
  vaultAdjustments as seedAdjustments,
} from '@/data/seed';
import type { VaultCurrency, VaultAdjustment, VaultSummary } from '@exchange/shared';

// ─── Constants ──────────────────────────────────────────────
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', JPY: '¥', CHF: 'Fr', CAD: 'C$', AUD: 'A$', CNY: '¥',
};

const CURRENCY_COLORS: Record<string, string> = {
  USD: 'bg-emerald-600', EUR: 'bg-blue-500', GBP: 'bg-indigo-500',
  JPY: 'bg-red-500', CHF: 'bg-red-600', CAD: 'bg-rose-700', AUD: 'bg-blue-700',
};

// ─── Helpers ────────────────────────────────────────────────
function formatAmount(n: number, currency?: string): string {
  // JPY uses no decimals
  if (currency === 'JPY') return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('en-CA'),
    time: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
  };
}

// ═════════════════════════════════════════════════════════════
// Component
// ═════════════════════════════════════════════════════════════
export function VaultInventoryPage() {
  const toast = useToast();

  // ─── State ─────────────────────────────────────────────
  const [vaults, setVaults] = useState<VaultCurrency[]>(seedVaults);
  const [adjustments, setAdjustments] = useState<VaultAdjustment[]>(seedAdjustments);
  const [modal, setModal] = useState<{ type: 'INBOUND' | 'OUTBOUND'; currency: string } | null>(null);
  const [modalAmount, setModalAmount] = useState('');
  const [modalNotes, setModalNotes] = useState('');
  const [modalError, setModalError] = useState('');

  // ─── Summary (computed from vaults) ────────────────────
  const summary: VaultSummary = useMemo(() => {
    const totalValue = vaults.reduce((s, v) => s + v.totalAmount, 0);
    const critical = vaults.filter((v) => v.alertLevel === 'CRITICAL');
    const minor = vaults.filter((v) => v.alertLevel === 'MINOR_ALERT');

    let inventoryHealth: VaultSummary['inventoryHealth'] = 'Optimal';
    if (critical.length > 2) inventoryHealth = 'Critical';
    else if (critical.length > 0 || minor.length > 1) inventoryHealth = 'Warning';

    return {
      totalValue,
      valueChange: seedSummary.valueChange,
      criticalAlerts: critical.length,
      minorAlerts: minor.length,
      alertCurrencies: [...critical.map((v) => v.currency), ...minor.map((v) => v.currency)],
      inventoryHealth,
      totalCurrencies: vaults.length,
    };
  }, [vaults]);

  // ─── Inbound / Outbound handler ───────────────────────
  const handleSubmit = useCallback(() => {
    if (!modal) return;
    const amt = parseFloat(modalAmount);
    if (isNaN(amt) || amt <= 0) {
      setModalError('Enter a valid positive amount');
      return;
    }

    const vault = vaults.find((v) => v.currency === modal.currency);
    if (!vault) return;

    if (modal.type === 'OUTBOUND' && amt > vault.totalAmount) {
      setModalError(`Insufficient balance (${CURRENCY_SYMBOLS[modal.currency] ?? ''}${formatAmount(vault.totalAmount, modal.currency)} available)`);
      return;
    }

    const newTotal = modal.type === 'INBOUND'
      ? vault.totalAmount + amt
      : vault.totalAmount - amt;

    // Determine new alert level
    let alertLevel: VaultCurrency['alertLevel'] = 'HEALTHY';
    if (newTotal < 50_000) alertLevel = 'CRITICAL';
    else if (newTotal < 100_000) alertLevel = 'MINOR_ALERT';

    // Update vault in state
    setVaults((prev) =>
      prev.map((v) =>
        v.currency === modal.currency
          ? { ...v, totalAmount: newTotal, alertLevel }
          : v,
      ),
    );

    // Add adjustment
    const newAdj: VaultAdjustment = {
      id: `adj-${Date.now()}`,
      currency: modal.currency,
      amount: modal.type === 'INBOUND' ? amt : -amt,
      type: modal.type,
      notes: modalNotes || undefined,
      user: 'M. Teller (Station 04-A)',
      status: 'VERIFIED',
      createdAt: new Date().toISOString(),
    };
    setAdjustments((prev) => [newAdj, ...prev]);

    // Toast notification
    const sym = CURRENCY_SYMBOLS[modal.currency] ?? '';
    toast(
      'success',
      `${modal.type === 'INBOUND' ? 'Inbound' : 'Outbound'} of ${sym}${formatAmount(amt, modal.currency)} ${modal.currency} recorded`,
    );

    // Close modal
    setModal(null);
    setModalAmount('');
    setModalNotes('');
    setModalError('');
  }, [modal, modalAmount, modalNotes, vaults, toast]);

  const openModal = (type: 'INBOUND' | 'OUTBOUND', currency: string) => {
    setModal({ type, currency });
    setModalAmount('');
    setModalNotes('');
    setModalError('');
  };

  // ─── Health color ─────────────────────────────────────
  const healthColor =
    summary.inventoryHealth === 'Optimal'
      ? 'text-status-green'
      : summary.inventoryHealth === 'Warning'
        ? 'text-status-yellow'
        : 'text-status-red';

  return (
    <div className="space-y-5">
      {/* ─── Header ────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Vault Inventory</h1>
          <div className="flex items-center gap-4 mt-1 text-xs text-text-muted">
            <span className="flex items-center gap-1.5">
              <RefreshCw className="w-3 h-3" /> Last Synced: just now
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-status-green animate-pulse-slow" /> Live Connection Active
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-outline text-xs py-2 px-4 flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" /> Global Export
          </button>
        </div>
      </div>

      {/* ─── Summary KPI cards ────────────────────────── */}
      <div className="grid grid-cols-4 gap-4">
        <SummaryCard
          icon={<DollarSign className="w-4 h-4" />}
          label="Total Vault Value (USD)"
          value={`$${formatAmount(summary.totalValue)}`}
          sub={
            <span className="text-status-green">+{summary.valueChange}% from yesterday</span>
          }
        />
        <SummaryCard
          icon={<AlertTriangle className="w-4 h-4" />}
          label="Critical Alerts"
          value={`${summary.criticalAlerts}`}
          valueColor={summary.criticalAlerts > 0 ? 'text-status-red' : undefined}
          sub={
            summary.alertCurrencies.length > 0
              ? <span className="text-status-yellow">Low stock: {summary.alertCurrencies.join(', ')}</span>
              : <span className="text-status-green">All currencies balanced</span>
          }
        />
        <SummaryCard
          icon={<ShieldCheck className="w-4 h-4" />}
          label="Inventory Health"
          value={summary.inventoryHealth}
          valueColor={healthColor}
          sub={
            summary.inventoryHealth === 'Optimal'
              ? <span className="text-status-green">All core pairs balanced</span>
              : <span className="text-status-yellow">{summary.criticalAlerts + summary.minorAlerts} currencies need attention</span>
          }
        />
        <SummaryCard
          icon={<Boxes className="w-4 h-4" />}
          label="Active Currencies"
          value={`${summary.totalCurrencies}`}
          sub={<span className="text-text-muted">Across all vaults</span>}
        />
      </div>

      {/* ─── Vault Currency Cards ─────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        {vaults.map((vc) => (
          <VaultCard
            key={vc.id}
            vault={vc}
            onInbound={() => openModal('INBOUND', vc.currency)}
            onOutbound={() => openModal('OUTBOUND', vc.currency)}
          />
        ))}
      </div>

      {/* ─── Recent Vault Adjustments ─────────────────── */}
      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-2.5">
            <div className="card-icon">
              <RefreshCw className="w-4 h-4" />
            </div>
            <h2 className="font-semibold text-[15px]">Recent Vault Adjustments</h2>
          </div>
          <span className="text-text-muted text-xs">{adjustments.length} entries</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-terminal-border">
                <th className="table-header text-left px-5 py-2.5">Timestamp</th>
                <th className="table-header text-left px-5 py-2.5">User</th>
                <th className="table-header text-center px-4 py-2.5">Currency</th>
                <th className="table-header text-center px-4 py-2.5">Type</th>
                <th className="table-header text-right px-5 py-2.5">Amount</th>
                <th className="table-header text-left px-5 py-2.5">Notes</th>
                <th className="table-header text-right px-5 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {adjustments.map((adj) => {
                const { date, time } = formatDate(adj.createdAt);
                const sym = CURRENCY_SYMBOLS[adj.currency] ?? '';
                const isPositive = adj.amount >= 0;
                return (
                  <tr key={adj.id} className="border-b border-terminal-border/40 hover:bg-terminal-surface/40 transition-colors">
                    <td className="px-5 py-3">
                      <div className="text-sm text-text-secondary">{date}</div>
                      <div className="text-xxs text-text-muted mt-0.5">{time}</div>
                    </td>
                    <td className="px-5 py-3 text-sm text-text-primary">{adj.user}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn(
                        'inline-flex items-center justify-center w-8 h-8 rounded-full text-white text-xs font-bold',
                        CURRENCY_COLORS[adj.currency] ?? 'bg-gray-600',
                      )}>
                        {adj.currency.slice(0, 2)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <AdjTypeBadge type={adj.type} />
                    </td>
                    <td className={cn(
                      'px-5 py-3 text-right font-mono text-sm font-semibold',
                      isPositive ? 'text-status-green' : 'text-status-red',
                    )}>
                      {isPositive ? '+' : ''}{sym}{formatAmount(Math.abs(adj.amount), adj.currency)}
                    </td>
                    <td className="px-5 py-3 text-sm text-text-muted max-w-[200px] truncate">
                      {adj.notes ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <StatusPill status={adj.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Inbound / Outbound Modal ─────────────────── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-label={`${modal.type === 'INBOUND' ? 'Inbound' : 'Outbound'} ${modal.currency}`} onKeyDown={(e) => { if (e.key === 'Escape') setModal(null); }}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60" onClick={() => setModal(null)} />
          {/* Content */}
          <div className="relative bg-terminal-card border border-terminal-border rounded-terminal shadow-terminal-lg w-full max-w-md p-6 space-y-5 animate-fade-in">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                {modal.type === 'INBOUND'
                  ? <ArrowDownToLine className="w-5 h-5 text-status-green" />
                  : <ArrowUpFromLine className="w-5 h-5 text-status-red" />}
                {modal.type === 'INBOUND' ? 'Inbound Load' : 'Outbound Withdrawal'} — {modal.currency}
              </h3>
              <button onClick={() => setModal(null)} className="text-text-muted hover:text-text-primary" aria-label="Close modal">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Current balance */}
            <div className="stat-card">
              <div className="table-header mb-1">Current Balance</div>
              <div className="text-xl font-bold font-mono">
                {CURRENCY_SYMBOLS[modal.currency] ?? ''}{formatAmount(
                  vaults.find((v) => v.currency === modal.currency)?.totalAmount ?? 0,
                  modal.currency,
                )}
              </div>
            </div>

            {/* Amount input */}
            <div>
              <label className="table-header block mb-2">Amount ({modal.currency})</label>
              <input
                type="text"
                inputMode="decimal"
                value={modalAmount}
                onChange={(e) => {
                  setModalAmount(e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'));
                  if (modalError) setModalError('');
                }}
                placeholder="e.g. 25000"
                className={cn(
                  'w-full bg-terminal-bg border rounded-lg px-4 py-3 text-lg font-mono font-semibold text-text-primary placeholder-text-muted outline-none transition-colors',
                  modalError ? 'border-status-red' : 'border-terminal-border focus:border-primary',
                )}
                autoFocus
              />
              {modalError && (
                <p className="text-status-red text-xs mt-1.5">{modalError}</p>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="table-header block mb-2">Notes (optional)</label>
              <input
                type="text"
                value={modalNotes}
                onChange={(e) => setModalNotes(e.target.value)}
                placeholder="e.g. CIT delivery — Brinks"
                className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-4 py-2.5 text-text-primary placeholder-text-muted outline-none focus:border-primary transition-colors"
              />
            </div>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              className={cn(
                'w-full py-3 font-semibold rounded-lg transition-all flex items-center justify-center gap-2',
                modal.type === 'INBOUND'
                  ? 'bg-status-green/90 hover:bg-status-green text-white'
                  : 'bg-status-red/90 hover:bg-status-red text-white',
              )}
            >
              {modal.type === 'INBOUND'
                ? <><ArrowDownToLine className="w-4 h-4" /> Confirm Inbound</>
                : <><ArrowUpFromLine className="w-4 h-4" /> Confirm Outbound</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Summary Card ───────────────────────────────────────────
function SummaryCard({
  icon,
  label,
  value,
  valueColor,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueColor?: string;
  sub: React.ReactNode;
}) {
  return (
    <div className="stat-card">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
          {icon}
        </div>
        <span className="table-header">{label}</span>
      </div>
      <div className={cn('text-2xl font-bold', valueColor)}>{value}</div>
      <div className="text-xs mt-1">{sub}</div>
    </div>
  );
}

// ─── Vault Currency Card ────────────────────────────────────
const VaultCard = memo(function VaultCard({
  vault,
  onInbound,
  onOutbound,
}: {
  vault: VaultCurrency;
  onInbound: () => void;
  onOutbound: () => void;
}) {
  const sym = CURRENCY_SYMBOLS[vault.currency] ?? vault.currency + ' ';

  return (
    <div className="card">
      <div className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-10 h-10 rounded-lg flex items-center justify-center text-white text-lg font-bold',
              CURRENCY_COLORS[vault.currency] ?? 'bg-gray-600',
            )}>
              {sym}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-text-primary">{vault.currency}</span>
                <span className="text-text-muted text-sm">— {vault.currencyName}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <AlertBadge level={vault.alertLevel} />
                <span className="text-xxs text-text-muted">{vault.vaultName}</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold font-mono">{sym}{formatAmount(vault.totalAmount, vault.currency)}</div>
            <div className="text-xxs text-text-muted">On-Hand Total</div>
          </div>
        </div>

        {/* Denominations table */}
        <table className="w-full mb-4">
          <thead>
            <tr className="border-b border-terminal-border">
              <th className="table-header text-left py-2">Denomination</th>
              <th className="table-header text-right py-2">Units</th>
              <th className="table-header text-right py-2">Amount</th>
              <th className="table-header text-right py-2">Level</th>
            </tr>
          </thead>
          <tbody>
            {vault.denominations.map((d) => {
              const isAlert = d.level === 'critical' || d.level === 'low';
              return (
                <tr key={d.id} className="border-b border-terminal-border/30">
                  <td className={cn('py-2 text-sm', isAlert ? 'text-status-red font-medium' : 'text-text-primary')}>
                    {d.label}
                    {d.level === 'critical' && (
                      <AlertTriangle className="w-3 h-3 text-status-red inline ml-1.5 -mt-0.5" />
                    )}
                  </td>
                  <td className={cn('py-2 text-right text-sm font-mono', isAlert ? 'text-status-red' : 'text-text-secondary')}>
                    {d.units.toLocaleString()}
                  </td>
                  <td className="py-2 text-right text-sm font-mono text-text-secondary">
                    {sym}{formatAmount(d.amount, vault.currency)}
                  </td>
                  <td className="py-2">
                    <div className="flex items-center justify-end gap-2">
                      <LevelBar level={d.level} />
                      <span className={cn(
                        'text-xxs w-12 text-right capitalize',
                        d.level === 'healthy' ? 'text-status-green'
                          : d.level === 'normal' ? 'text-text-muted'
                            : d.level === 'low' ? 'text-status-yellow'
                              : 'text-status-red',
                      )}>
                        {d.level}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={onInbound}
            className="flex-1 text-sm py-2.5 flex items-center justify-center gap-1.5 rounded-lg border border-status-green/30 text-status-green hover:bg-status-green/10 transition-colors font-medium"
          >
            <ArrowDownToLine className="w-4 h-4" /> Inbound
          </button>
          <button
            onClick={onOutbound}
            className="flex-1 text-sm py-2.5 flex items-center justify-center gap-1.5 rounded-lg border border-status-red/30 text-status-red hover:bg-status-red/10 transition-colors font-medium"
          >
            <ArrowUpFromLine className="w-4 h-4" /> Outbound
          </button>
        </div>
      </div>
    </div>
  );
});

// ─── Sub-components ─────────────────────────────────────────

function AlertBadge({ level }: { level: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    CRITICAL: { cls: 'badge-red', label: 'CRITICAL' },
    MINOR_ALERT: { cls: 'badge-yellow', label: 'MINOR ALERT' },
    HEALTHY: { cls: 'badge-green', label: 'HEALTHY' },
  };
  const config = map[level] ?? map.HEALTHY;
  return <span className={cn('badge text-xxs font-bold', config.cls)}>{config.label}</span>;
}

function LevelBar({ level }: { level: string }) {
  const widths: Record<string, string> = {
    healthy: 'w-4/5', normal: 'w-3/5', low: 'w-2/5', critical: 'w-1/5',
  };
  const colors: Record<string, string> = {
    healthy: 'bg-status-green', normal: 'bg-primary', low: 'bg-status-yellow', critical: 'bg-status-red',
  };
  return (
    <div className="w-16 h-1.5 bg-terminal-border rounded-full overflow-hidden">
      <div className={cn('h-full rounded-full transition-all', widths[level], colors[level])} />
    </div>
  );
}

function AdjTypeBadge({ type }: { type: string }) {
  const map: Record<string, string> = {
    INBOUND: 'badge-green',
    OUTBOUND: 'badge-red',
    MANUAL: 'badge-blue',
  };
  return <span className={cn('badge text-xxs', map[type] ?? 'badge-blue')}>{type}</span>;
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string }> = {
    VERIFIED: { bg: 'bg-status-green-subtle', text: 'text-status-green' },
    PENDING: { bg: 'bg-status-yellow-subtle', text: 'text-status-yellow' },
    REJECTED: { bg: 'bg-status-red-subtle', text: 'text-status-red' },
  };
  const s = map[status] ?? map.PENDING;
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold', s.bg, s.text)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', s.text.replace('text-', 'bg-'))} />
      {status}
    </span>
  );
}
