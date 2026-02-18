import { useState, useMemo, useCallback } from 'react';
import {
  Search,
  Calendar,
  ChevronDown,
  Download,
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { transactions as seedTxs } from '@/data/seed';
import type { Transaction } from '@exchange/shared';

// ─── Constants ──────────────────────────────────────────────
const STATUSES = ['ALL', 'COMPLETED', 'PENDING', 'FAILED', 'CANCELLED'] as const;
const PAGE_SIZE = 10;

const AVATAR_COLORS = [
  'bg-blue-600', 'bg-amber-600', 'bg-emerald-600',
  'bg-purple-600', 'bg-orange-600', 'bg-pink-600',
  'bg-cyan-600', 'bg-rose-600',
];

// ─── Helpers ────────────────────────────────────────────────
function getInitials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

function formatAmount(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatRate(n: number): string {
  if (n >= 100) return n.toFixed(2);
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(6);
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('en-CA'), // YYYY-MM-DD
    time: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
  };
}

function hashColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
}

// ═════════════════════════════════════════════════════════════
// Component
// ═════════════════════════════════════════════════════════════
export function TransactionsPage() {
  // ─── Filter state ──────────────────────────────────────
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [statusOpen, setStatusOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dateOpen, setDateOpen] = useState(false);
  const [page, setPage] = useState(1);

  // ─── Data (seed fallback — would fetch from API in production) ──
  const allTxs: Transaction[] = seedTxs;

  // ─── Filtered + paginated ─────────────────────────────
  const filtered = useMemo(() => {
    let result = allTxs;

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (tx) =>
          tx.receiptId.toLowerCase().includes(q) ||
          tx.customerName.toLowerCase().includes(q) ||
          `${tx.base}/${tx.quote}`.toLowerCase().includes(q) ||
          tx.base.toLowerCase().includes(q) ||
          tx.quote.toLowerCase().includes(q),
      );
    }

    // Status
    if (statusFilter !== 'ALL') {
      result = result.filter((tx) => tx.status === statusFilter);
    }

    // Date range
    if (dateFrom) {
      const from = new Date(dateFrom);
      result = result.filter((tx) => new Date(tx.createdAt) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo + 'T23:59:59Z');
      result = result.filter((tx) => new Date(tx.createdAt) <= to);
    }

    return result;
  }, [allTxs, search, statusFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Reset page when filters change
  const setSearchAndReset = useCallback((v: string) => { setSearch(v); setPage(1); }, []);
  const setStatusAndReset = useCallback((v: string) => { setStatusFilter(v); setPage(1); }, []);

  // ─── Stats ────────────────────────────────────────────
  const completedCount = allTxs.filter((t) => t.status === 'COMPLETED').length;
  const pendingCount = allTxs.filter((t) => t.status === 'PENDING').length;
  const totalVolume = allTxs.reduce((s, t) => s + t.amountIn, 0);

  // ─── Pagination helpers ───────────────────────────────
  const pageNums = useMemo(() => {
    const nums: (number | '...')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) nums.push(i);
    } else {
      nums.push(1);
      if (currentPage > 3) nums.push('...');
      for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) nums.push(i);
      if (currentPage < totalPages - 2) nums.push('...');
      nums.push(totalPages);
    }
    return nums;
  }, [currentPage, totalPages]);

  return (
    <div className="space-y-5">
      {/* ─── Header ────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">Transactions</h1>
            <span className="badge badge-green text-xxs animate-pulse-slow">LIVE FEED</span>
          </div>
          <p className="text-text-muted text-sm mt-0.5">
            {filtered.length} transaction{filtered.length !== 1 ? 's' : ''} found
          </p>
        </div>

        {/* Quick stats */}
        <div className="flex items-center gap-5 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-status-green" />
            <span className="text-text-muted">Completed</span>
            <span className="text-text-primary font-semibold">{completedCount}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-status-yellow" />
            <span className="text-text-muted">Pending</span>
            <span className="text-text-primary font-semibold">{pendingCount}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Activity className="w-3 h-3 text-primary" />
            <span className="text-text-muted">Volume</span>
            <span className="text-text-primary font-semibold font-mono">${formatAmount(totalVolume)}</span>
          </div>
        </div>
      </div>

      {/* ─── Filters bar ──────────────────────────────── */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="flex items-center gap-2 bg-terminal-card border border-terminal-border rounded-lg px-3 py-2 flex-1 max-w-md focus-within:border-primary transition-colors">
          <Search className="w-4 h-4 text-text-muted flex-shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearchAndReset(e.target.value)}
            placeholder="Search by Receipt ID, Customer, or Pair..."
            aria-label="Search transactions"
            className="bg-transparent text-sm text-text-primary outline-none flex-1 placeholder-text-muted"
          />
        </div>

        {/* Date range */}
        <div className="relative">
          <button
            onClick={() => setDateOpen(!dateOpen)}
            className="btn-outline text-xs py-2 px-3 flex items-center gap-1.5"
          >
            <Calendar className="w-3.5 h-3.5" />
            {dateFrom || dateTo
              ? `${dateFrom || '...'} — ${dateTo || '...'}`
              : 'All Dates'}
            <ChevronDown className={cn('w-3 h-3 transition-transform', dateOpen && 'rotate-180')} />
          </button>
          {dateOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setDateOpen(false)} />
              <div className="absolute top-full mt-1 right-0 z-50 bg-terminal-card border border-terminal-border rounded-lg shadow-terminal-lg p-4 space-y-3 w-64">
                <div>
                  <label className="table-header block mb-1.5">From</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                    className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="table-header block mb-1.5">To</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                    className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-primary"
                  />
                </div>
                {(dateFrom || dateTo) && (
                  <button
                    onClick={() => { setDateFrom(''); setDateTo(''); setPage(1); }}
                    className="text-primary text-xs hover:underline"
                  >
                    Clear dates
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Status dropdown */}
        <div className="relative">
          <button
            onClick={() => setStatusOpen(!statusOpen)}
            className="btn-outline text-xs py-2 px-3 flex items-center gap-1.5"
          >
            {statusFilter === 'ALL' ? (
              <span>All Status</span>
            ) : (
              <>
                <StatusDot status={statusFilter} />
                <span>{statusFilter}</span>
              </>
            )}
            <ChevronDown className={cn('w-3 h-3 transition-transform', statusOpen && 'rotate-180')} />
          </button>
          {statusOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setStatusOpen(false)} />
              <div className="absolute top-full mt-1 right-0 z-50 bg-terminal-card border border-terminal-border rounded-lg shadow-terminal-lg overflow-hidden w-40">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    onClick={() => { setStatusAndReset(s); setStatusOpen(false); }}
                    className={cn(
                      'w-full flex items-center gap-2 px-4 py-2.5 text-xs text-left hover:bg-terminal-surface transition-colors',
                      statusFilter === s && 'bg-primary/10 text-primary',
                    )}
                  >
                    {s !== 'ALL' && <StatusDot status={s} />}
                    {s === 'ALL' ? 'All Status' : s}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Export */}
        <button className="bg-status-red/90 hover:bg-status-red text-white text-xs font-semibold py-2 px-4 rounded-lg flex items-center gap-1.5 transition-colors ml-auto">
          <Download className="w-3.5 h-3.5" />
          Export Report
        </button>
      </div>

      {/* ─── Table ─────────────────────────────────────── */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-terminal-border">
                <th className="table-header text-left px-5 py-3">ID</th>
                <th className="table-header text-left px-5 py-3">Date & Time</th>
                <th className="table-header text-left px-5 py-3">Customer</th>
                <th className="table-header text-center px-4 py-3">Type</th>
                <th className="table-header text-center px-4 py-3">Pair</th>
                <th className="table-header text-right px-5 py-3">Amount In</th>
                <th className="table-header text-right px-4 py-3">Amount Out</th>
                <th className="table-header text-right px-4 py-3">Rate</th>
                <th className="table-header text-right px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center text-text-muted">
                    No transactions match your filters.
                  </td>
                </tr>
              ) : (
                paginated.map((tx) => {
                  const { date, time } = formatDate(tx.createdAt);
                  return (
                    <tr
                      key={tx.id}
                      className="border-b border-terminal-border/40 hover:bg-terminal-surface/40 transition-colors cursor-pointer"
                    >
                      {/* Receipt ID */}
                      <td className="px-5 py-3.5 text-sm text-text-secondary font-mono">
                        #{tx.receiptId}
                      </td>

                      {/* Date & Time */}
                      <td className="px-5 py-3.5">
                        <div className="text-sm text-text-secondary">{date}</div>
                        <div className="text-xxs text-text-muted mt-0.5">{time}</div>
                      </td>

                      {/* Customer */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={cn(
                              'w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold',
                              hashColor(tx.customerName),
                            )}
                          >
                            {tx.customerInitials || getInitials(tx.customerName)}
                          </div>
                          <span className="text-sm font-medium text-text-primary">{tx.customerName}</span>
                        </div>
                      </td>

                      {/* Type badge */}
                      <td className="px-4 py-3.5 text-center">
                        <TypeBadge type={tx.type} />
                      </td>

                      {/* Pair */}
                      <td className="px-4 py-3.5 text-center">
                        <div className="inline-flex items-center gap-1.5 text-sm text-text-secondary">
                          <span className="font-medium">{tx.base}</span>
                          <ArrowLeftRight className="w-3 h-3 text-text-muted" />
                          <span className="font-medium">{tx.quote}</span>
                        </div>
                      </td>

                      {/* Amount In */}
                      <td className="px-5 py-3.5 text-right">
                        <span className="font-mono text-sm text-text-primary">{formatAmount(tx.amountIn)}</span>
                        <span className="text-xxs text-text-muted ml-1">{tx.base}</span>
                      </td>

                      {/* Amount Out */}
                      <td className="px-4 py-3.5 text-right">
                        <span className="font-mono text-sm text-status-green">{formatAmount(tx.amountOut)}</span>
                        <span className="text-xxs text-text-muted ml-1">{tx.quote}</span>
                      </td>

                      {/* Rate */}
                      <td className="px-4 py-3.5 text-right font-mono text-sm text-text-secondary">
                        {formatRate(tx.rateApplied)}
                      </td>

                      {/* Status */}
                      <td className="px-5 py-3.5 text-right">
                        <StatusPill status={tx.status} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ─── Pagination footer ──────────────────────── */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-terminal-border">
          <span className="text-sm text-text-muted">
            Showing{' '}
            <strong className="text-text-primary">
              {filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)}
            </strong>{' '}
            of <strong className="text-text-primary">{filtered.length}</strong> transactions
          </span>

          <div className="flex items-center gap-1">
            <PagBtn disabled={currentPage <= 1} onClick={() => setPage(1)}>
              <ChevronsLeft className="w-4 h-4" />
            </PagBtn>
            <PagBtn disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <ChevronLeft className="w-4 h-4" />
            </PagBtn>

            {pageNums.map((n, i) =>
              n === '...' ? (
                <span key={`dot-${i}`} className="px-1.5 text-text-muted text-xs">…</span>
              ) : (
                <PagBtn key={n} active={n === currentPage} onClick={() => setPage(n)}>
                  {n}
                </PagBtn>
              ),
            )}

            <PagBtn disabled={currentPage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              <ChevronRight className="w-4 h-4" />
            </PagBtn>
            <PagBtn disabled={currentPage >= totalPages} onClick={() => setPage(totalPages)}>
              <ChevronsRight className="w-4 h-4" />
            </PagBtn>
          </div>
        </div>
      </div>

      {/* ─── Bottom bar ────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-text-muted">
          <span>Daily Limit</span>
          <div className="w-32 h-1.5 bg-terminal-border rounded-full overflow-hidden">
            <div className="w-[85%] h-full bg-primary rounded-full" />
          </div>
          <span className="text-text-primary font-medium">85%</span>
        </div>
        <button className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5">
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    BUY: 'badge-green',
    SELL: 'badge-yellow',
    SWAP: 'badge-blue',
  };
  return <span className={cn('badge', styles[type])}>{type}</span>;
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    COMPLETED: 'bg-status-green',
    PENDING: 'bg-status-yellow',
    FAILED: 'bg-status-red',
    CANCELLED: 'bg-text-muted',
  };
  return <span className={cn('w-2 h-2 rounded-full inline-block', colors[status] ?? 'bg-text-muted')} />;
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string }> = {
    COMPLETED: { bg: 'bg-status-green-subtle', text: 'text-status-green' },
    PENDING: { bg: 'bg-status-yellow-subtle', text: 'text-status-yellow' },
    FAILED: { bg: 'bg-status-red-subtle', text: 'text-status-red' },
    CANCELLED: { bg: 'bg-terminal-surface', text: 'text-text-muted' },
  };
  const s = map[status] ?? map.CANCELLED;
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold', s.bg, s.text)}>
      <StatusDot status={status} />
      {status}
    </span>
  );
}

function PagBtn({
  children,
  active,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'w-8 h-8 flex items-center justify-center rounded-md text-xs transition-colors',
        active
          ? 'bg-primary text-white'
          : disabled
            ? 'text-text-muted cursor-not-allowed'
            : 'text-text-secondary hover:bg-terminal-surface hover:text-text-primary',
      )}
    >
      {children}
    </button>
  );
}
