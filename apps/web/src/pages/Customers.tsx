import { useState, useMemo, useCallback, memo } from 'react';
import {
  Search,
  ChevronDown,
  Download,
  UserPlus,
  X,
  Flag,
  ShieldCheck,
  Users,
  AlertTriangle,
  ShieldAlert,
  FileText,
  DollarSign,
  ArrowLeftRight,
  Clock,
  Save,
} from 'lucide-react';
import { cn, getInitials } from '@/lib/utils';
import { useToast } from '@/components/Toast';
import { customers as seedCustomers } from '@/data/seed';
import type { Customer } from '@exchange/shared';

// ─── Constants ──────────────────────────────────────────────
const RISK_LEVELS = ['ALL', 'LOW', 'MEDIUM', 'HIGH'] as const;
const EXPIRY_STATUSES = ['ALL', 'VALID', 'EXPIRING', 'EXPIRED'] as const;

const AVATAR_COLORS = [
  'bg-teal-700', 'bg-slate-600', 'bg-blue-700', 'bg-rose-700',
  'bg-indigo-600', 'bg-amber-700', 'bg-emerald-700', 'bg-purple-700',
  'bg-cyan-700', 'bg-pink-700',
];

// ─── Helpers ────────────────────────────────────────────────
function hashColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
}

function daysUntilExpiry(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// ═════════════════════════════════════════════════════════════
// Component
// ═════════════════════════════════════════════════════════════
export function CustomersPage() {
  const toast = useToast();

  // ─── Data state ────────────────────────────────────────
  const [customers, setCustomers] = useState<Customer[]>(seedCustomers);

  // ─── Filter state ──────────────────────────────────────
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState<string>('ALL');
  const [riskOpen, setRiskOpen] = useState(false);
  const [expiryFilter, setExpiryFilter] = useState<string>('ALL');
  const [expiryOpen, setExpiryOpen] = useState(false);

  // ─── Drawer state ─────────────────────────────────────
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerNotes, setDrawerNotes] = useState('');
  const [notesSaved, setNotesSaved] = useState(false);
  const [flagConfirm, setFlagConfirm] = useState(false);
  const [verifyConfirm, setVerifyConfirm] = useState(false);

  // ─── Derived data ──────────────────────────────────────
  const filtered = useMemo(() => {
    let result = customers;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.fullName.toLowerCase().includes(q) ||
          c.customerId.toLowerCase().includes(q) ||
          c.documentNumber.toLowerCase().includes(q) ||
          c.nationality.toLowerCase().includes(q),
      );
    }

    if (riskFilter !== 'ALL') {
      result = result.filter((c) => c.riskLevel === riskFilter);
    }

    if (expiryFilter !== 'ALL') {
      result = result.filter((c) => c.expiryStatus === expiryFilter);
    }

    return result;
  }, [customers, search, riskFilter, expiryFilter]);

  const selected = customers.find((c) => c.id === selectedId) ?? null;

  // ─── Stats ────────────────────────────────────────────
  const totalCustomers = customers.length;
  const pendingVerifications = customers.filter((c) => c.expiryStatus === 'EXPIRING' || c.expiryStatus === 'EXPIRED').length;
  const highRisk = customers.filter((c) => c.riskLevel === 'HIGH').length;

  // ─── Select customer ──────────────────────────────────
  const selectCustomer = useCallback((c: Customer) => {
    setSelectedId(c.id);
    setDrawerNotes(c.notes ?? '');
    setNotesSaved(false);
    setFlagConfirm(false);
    setVerifyConfirm(false);
  }, []);

  // ─── Actions ──────────────────────────────────────────
  const handleVerify = useCallback(() => {
    if (!selected) return;
    setCustomers((prev) =>
      prev.map((c) =>
        c.id === selected.id
          ? { ...c, expiryStatus: 'VALID' as const, riskLevel: c.riskLevel === 'HIGH' ? 'MEDIUM' as const : c.riskLevel }
          : c,
      ),
    );
    toast('success', `${selected.fullName} identity verified`);
    setVerifyConfirm(true);
    setTimeout(() => setVerifyConfirm(false), 2000);
  }, [selected, toast]);

  const handleFlag = useCallback(() => {
    if (!selected) return;
    setCustomers((prev) =>
      prev.map((c) =>
        c.id === selected.id
          ? { ...c, riskLevel: 'HIGH' as const }
          : c,
      ),
    );
    toast('warning', `${selected.fullName} flagged as HIGH risk`);
    setFlagConfirm(true);
    setTimeout(() => setFlagConfirm(false), 2000);
  }, [selected, toast]);

  const handleSaveNotes = useCallback(() => {
    if (!selected) return;
    setCustomers((prev) =>
      prev.map((c) =>
        c.id === selected.id
          ? { ...c, notes: drawerNotes || null }
          : c,
      ),
    );
    toast('info', 'Compliance notes saved');
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 1500);
  }, [selected, drawerNotes, toast]);

  return (
    <div className="flex gap-0 h-full -m-6">
      {/* ═══ Main list panel ══════════════════════════════ */}
      <div className={cn('flex-1 flex flex-col p-6 transition-all min-w-0', selected ? 'pr-0' : '')}>
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold">Customer Directory</h1>
              <span className="flex items-center gap-1.5 text-xs text-text-muted">
                <span className="w-2 h-2 rounded-full bg-status-green animate-pulse-slow" /> Live Database
              </span>
            </div>
            <p className="text-text-muted text-sm mt-0.5">{filtered.length} customer{filtered.length !== 1 ? 's' : ''} found</p>
          </div>
          <button className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5">
            <UserPlus className="w-3.5 h-3.5" /> Add New Customer
          </button>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-3 gap-4 mb-5">
          <KpiCard
            icon={<Users className="w-4 h-4" />}
            label="Total Customers"
            value={totalCustomers.toLocaleString()}
            sub={<span className="text-status-green">+12% this month</span>}
          />
          <KpiCard
            icon={<AlertTriangle className="w-4 h-4" />}
            label="Pending Verifications"
            value={pendingVerifications.toString()}
            valueColor={pendingVerifications > 0 ? 'text-status-yellow' : undefined}
            sub={<span className="text-status-yellow">Requires review</span>}
          />
          <KpiCard
            icon={<ShieldAlert className="w-4 h-4" />}
            label="High Risk Flagged"
            value={highRisk.toString()}
            valueColor={highRisk > 0 ? 'text-status-red' : undefined}
            sub={<span className="text-text-muted">Enhanced monitoring</span>}
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-2 bg-terminal-card border border-terminal-border rounded-lg px-3 py-2 flex-1 focus-within:border-primary transition-colors">
            <Search className="w-4 h-4 text-text-muted flex-shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Name, ID, Document, or Nationality..."
              aria-label="Search customers"
              className="bg-transparent text-sm text-text-primary outline-none flex-1 placeholder-text-muted"
            />
          </div>

          {/* Risk Level dropdown */}
          <FilterDropdown
            label={riskFilter === 'ALL' ? 'Risk Level' : `${riskFilter} Risk`}
            open={riskOpen}
            setOpen={setRiskOpen}
            options={RISK_LEVELS}
            value={riskFilter}
            onChange={setRiskFilter}
            renderOption={(opt) => (
              <div className="flex items-center gap-2">
                {opt !== 'ALL' && <RiskDot level={opt} />}
                <span>{opt === 'ALL' ? 'All Risk Levels' : `${opt} Risk`}</span>
              </div>
            )}
          />

          {/* Expiry Status dropdown */}
          <FilterDropdown
            label={expiryFilter === 'ALL' ? 'Expiry Status' : expiryFilter}
            open={expiryOpen}
            setOpen={setExpiryOpen}
            options={EXPIRY_STATUSES}
            value={expiryFilter}
            onChange={setExpiryFilter}
            renderOption={(opt) => (
              <span>{opt === 'ALL' ? 'All Statuses' : opt}</span>
            )}
          />

          <button className="btn-outline text-xs py-2 px-3 flex items-center gap-1.5 ml-auto">
            <Download className="w-3.5 h-3.5" /> Export
          </button>
        </div>

        {/* Table */}
        <div className="card flex-1 flex flex-col min-h-0">
          <div className="overflow-x-auto flex-1">
            <table className="w-full">
              <thead>
                <tr className="border-b border-terminal-border">
                  <th className="table-header text-left px-5 py-2.5">Customer</th>
                  <th className="table-header text-left px-4 py-2.5">Nationality</th>
                  <th className="table-header text-left px-4 py-2.5">Document</th>
                  <th className="table-header text-center px-4 py-2.5">Risk</th>
                  <th className="table-header text-center px-4 py-2.5">Expiry</th>
                  <th className="table-header text-right px-5 py-2.5">Volume</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-text-muted">
                      No customers match your filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => selectCustomer(c)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectCustomer(c); } }}
                      tabIndex={0}
                      role="button"
                      aria-label={`View ${c.fullName}`}
                      className={cn(
                        'border-b border-terminal-border/40 cursor-pointer transition-colors focus:outline-none focus:ring-1 focus:ring-primary/50',
                        selectedId === c.id
                          ? 'bg-primary/10 border-l-2 border-l-primary'
                          : 'hover:bg-terminal-surface/40',
                      )}
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className={cn(
                            'w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0',
                            hashColor(c.fullName),
                          )}>
                            {getInitials(c.fullName)}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-text-primary truncate">{c.fullName}</div>
                            <div className="text-xxs text-text-muted">#{c.customerId}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary">{c.nationality}</td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-text-secondary">{c.documentType}</div>
                        <div className="text-xxs text-text-muted font-mono">{c.documentNumber}</div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <RiskBadge level={c.riskLevel} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <ExpiryBadge status={c.expiryStatus} />
                      </td>
                      <td className="px-5 py-3 text-right text-sm font-mono text-text-secondary">
                        ${c.lifetimeVolume.toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-terminal-border">
            <span className="text-xs text-text-muted">
              Showing <strong className="text-text-primary">{filtered.length}</strong> of <strong className="text-text-primary">{customers.length}</strong> customers
            </span>
          </div>
        </div>
      </div>

      {/* ═══ Detail drawer ═══════════════════════════════ */}
      {selected && (
        <div className="w-[400px] min-w-[400px] bg-terminal-card border-l border-terminal-border h-full overflow-y-auto animate-slide-in-right" role="complementary" aria-label="Customer details">
          <div className="p-6 space-y-6">
            {/* Close */}
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-[15px]">Customer Details</h2>
              <button
                onClick={() => setSelectedId(null)}
                className="text-text-muted hover:text-text-primary transition-colors"
                aria-label="Close customer details"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Avatar + Identity */}
            <div className="flex flex-col items-center text-center">
              <div className={cn(
                'w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold mb-3',
                hashColor(selected.fullName),
              )}>
                {getInitials(selected.fullName)}
              </div>
              <h3 className="text-lg font-bold">{selected.fullName}</h3>
              <div className="text-xs text-text-muted mt-0.5">
                #{selected.customerId} &bull; {selected.nationality} &bull; Active since {new Date(selected.activeSince).getFullYear()}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <RiskBadge level={selected.riskLevel} />
                {selected.expiryStatus !== 'VALID' && (
                  <ExpiryBadge status={selected.expiryStatus} />
                )}
              </div>
            </div>

            {/* KYC Documents */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="table-header">KYC Documents</span>
                <button className="text-primary text-xs font-medium hover:underline">Update</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-terminal-surface border border-terminal-border rounded-lg p-3 h-20 flex flex-col justify-between">
                  <FileText className="w-5 h-5 text-text-muted" />
                  <div>
                    <div className="text-xxs text-text-muted">{selected.documentType}</div>
                    <div className="text-xxs text-text-primary font-mono">{selected.documentNumber}</div>
                  </div>
                </div>
                <div className="bg-terminal-surface border border-terminal-border rounded-lg p-3 h-20 flex flex-col justify-between">
                  <FileText className="w-5 h-5 text-text-muted" />
                  <div>
                    <div className="text-xxs text-text-muted">Expiry Date</div>
                    <div className={cn(
                      'text-xxs font-mono font-semibold',
                      selected.expiryStatus === 'VALID' ? 'text-status-green'
                        : selected.expiryStatus === 'EXPIRING' ? 'text-status-yellow'
                          : 'text-status-red',
                    )}>
                      {selected.documentExpiry}
                    </div>
                  </div>
                </div>
              </div>

              {/* Warning callout */}
              {selected.expiryStatus === 'EXPIRING' && (
                <div className="mt-3 bg-status-yellow-subtle border border-status-yellow/20 rounded-lg p-3 text-xs text-status-yellow flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>Document expiring in {daysUntilExpiry(selected.documentExpiry)} days. Renewal required for high-value transactions.</span>
                </div>
              )}
              {selected.expiryStatus === 'EXPIRED' && (
                <div className="mt-3 bg-status-red-subtle border border-status-red/20 rounded-lg p-3 text-xs text-status-red flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>Document expired {Math.abs(daysUntilExpiry(selected.documentExpiry))} days ago. Customer is blocked from transactions until renewed.</span>
                </div>
              )}
              {selected.riskLevel === 'HIGH' && (
                <div className="mt-3 bg-status-red-subtle border border-status-red/20 rounded-lg p-3 text-xs text-status-red flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>HIGH RISK — Account flagged for enhanced due diligence. All transactions require supervisor approval.</span>
                </div>
              )}
            </div>

            {/* Financial Snapshot */}
            <div>
              <span className="table-header block mb-3">Financial Snapshot</span>
              <div className="space-y-2">
                <SnapshotRow
                  icon={<DollarSign className="w-3.5 h-3.5 text-primary" />}
                  label="Lifetime Volume"
                  value={`$${selected.lifetimeVolume.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                />
                <SnapshotRow
                  icon={<Clock className="w-3.5 h-3.5 text-primary" />}
                  label="Last Transaction"
                  value={selected.lastTransaction ?? 'N/A'}
                />
                <SnapshotRow
                  icon={<ArrowLeftRight className="w-3.5 h-3.5 text-primary" />}
                  label="Preferred Pair"
                  value={selected.preferredPair ?? 'N/A'}
                />
              </div>
            </div>

            {/* Compliance Notes */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="table-header">Compliance Notes</span>
                {notesSaved && <span className="text-xxs text-status-green">Saved!</span>}
              </div>
              <textarea
                value={drawerNotes}
                onChange={(e) => { setDrawerNotes(e.target.value); setNotesSaved(false); }}
                placeholder="Add a private note regarding this customer..."
                className="w-full bg-terminal-surface border border-terminal-border rounded-lg px-4 py-3 text-sm text-text-primary placeholder-text-muted outline-none focus:border-primary resize-none h-24 transition-colors"
              />
              <button
                onClick={handleSaveNotes}
                className="mt-2 text-xs text-primary hover:underline flex items-center gap-1"
              >
                <Save className="w-3 h-3" /> Save Notes
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleFlag}
                disabled={selected.riskLevel === 'HIGH'}
                className={cn(
                  'flex-1 text-sm py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-all font-medium',
                  flagConfirm
                    ? 'bg-status-red text-white cursor-default'
                    : selected.riskLevel === 'HIGH'
                      ? 'border border-terminal-border text-text-muted cursor-not-allowed'
                      : 'border border-status-red/30 text-status-red hover:bg-status-red/10',
                )}
              >
                <Flag className="w-4 h-4" />
                {flagConfirm ? 'Flagged!' : selected.riskLevel === 'HIGH' ? 'Already Flagged' : 'Flag Account'}
              </button>
              <button
                onClick={handleVerify}
                disabled={selected.expiryStatus === 'VALID' && selected.riskLevel !== 'HIGH'}
                className={cn(
                  'flex-1 text-sm py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-all font-medium',
                  verifyConfirm
                    ? 'bg-status-green text-white cursor-default'
                    : selected.expiryStatus === 'VALID' && selected.riskLevel !== 'HIGH'
                      ? 'bg-terminal-surface text-text-muted cursor-not-allowed'
                      : 'bg-primary hover:bg-primary-hover text-white',
                )}
              >
                <ShieldCheck className="w-4 h-4" />
                {verifyConfirm ? 'Verified!' : 'Verify Identity'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────

const KpiCard = memo(function KpiCard({
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
});

function SnapshotRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between bg-terminal-surface rounded-lg px-4 py-3">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm text-text-secondary">{label}</span>
      </div>
      <span className="text-sm font-bold font-mono">{value}</span>
    </div>
  );
}

function RiskDot({ level }: { level: string }) {
  const colors: Record<string, string> = {
    LOW: 'bg-status-green', MEDIUM: 'bg-status-yellow', HIGH: 'bg-status-red',
  };
  return <span className={cn('w-2 h-2 rounded-full inline-block', colors[level] ?? 'bg-text-muted')} />;
}

function RiskBadge({ level }: { level: string }) {
  const map: Record<string, string> = {
    LOW: 'badge-green', MEDIUM: 'badge-yellow', HIGH: 'badge-red',
  };
  return <span className={cn('badge text-xxs', map[level])}>{level}</span>;
}

function ExpiryBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    VALID: 'badge-green', EXPIRING: 'badge-yellow', EXPIRED: 'badge-red',
  };
  return <span className={cn('badge text-xxs', map[status])}>{status}</span>;
}

function FilterDropdown({
  label,
  open,
  setOpen,
  options,
  value,
  onChange,
  renderOption,
}: {
  label: string;
  open: boolean;
  setOpen: (v: boolean) => void;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  renderOption: (opt: string) => React.ReactNode;
}) {
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="btn-outline text-xs py-2 px-3 flex items-center gap-1.5"
      >
        {label}
        <ChevronDown className={cn('w-3 h-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 right-0 z-50 bg-terminal-card border border-terminal-border rounded-lg shadow-terminal-lg overflow-hidden w-44">
            {options.map((opt) => (
              <button
                key={opt}
                onClick={() => { onChange(opt); setOpen(false); }}
                className={cn(
                  'w-full flex items-center gap-2 px-4 py-2.5 text-xs text-left hover:bg-terminal-surface transition-colors',
                  value === opt && 'bg-primary/10 text-primary',
                )}
              >
                {renderOption(opt)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
