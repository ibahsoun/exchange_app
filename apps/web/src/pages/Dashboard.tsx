import { useState, useMemo, useCallback } from 'react';
import {
  ArrowLeftRight,
  CheckCircle2,
  ChevronDown,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/Toast';
import { useRates } from '@/hooks/useRates';
import { currencyRates as seedRates, dashboardRates as seedDashboard } from '@/data/seed';
import type { LiveRate } from '@/stores/rates.store';

// ─── Currency meta ──────────────────────────────────────────
const CURRENCIES = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'Pound', symbol: '£' },
  { code: 'JPY', name: 'Yen', symbol: '¥' },
  { code: 'CHF', name: 'Franc', symbol: 'Fr' },
  { code: 'CAD', name: 'CAD', symbol: 'C$' },
  { code: 'AUD', name: 'AUD', symbol: 'A$' },
  { code: 'CNY', name: 'Yuan', symbol: '¥' },
  { code: 'ARS', name: 'Peso', symbol: '$' },
  { code: 'PYG', name: 'Guarani', symbol: '₲' },
  { code: 'BRL', name: 'Real', symbol: 'R$' },
  { code: 'AED', name: 'Dirham', symbol: 'د' },
  { code: 'USDT', name: 'USDT', symbol: '₮' },
] as const;

const CURRENCY_COLORS: Record<string, string> = {
  USD: 'bg-emerald-600', EUR: 'bg-blue-500', GBP: 'bg-indigo-500',
  JPY: 'bg-red-500', CHF: 'bg-red-600', CAD: 'bg-rose-700',
  AUD: 'bg-blue-700', CNY: 'bg-amber-600', ARS: 'bg-sky-700',
  PYG: 'bg-red-700', BRL: 'bg-green-600', AED: 'bg-teal-600',
  USDT: 'bg-emerald-500',
};

const PURPOSES = ['Travel & Tourism', 'Business', 'Education', 'Family Support', 'Medical', 'Other'] as const;
const FUND_SOURCES = ['Personal Savings', 'Salary/Income', 'Business Revenue', 'Investment Returns', 'Gift/Donation'] as const;

// ─── Helpers ────────────────────────────────────────────────
function formatRate(n: number): string {
  if (n >= 1000) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1) return n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return n.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 });
}

function formatAmount(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Generate a transaction reference */
function generateRef() {
  return `TR-${Math.floor(10000 + Math.random() * 90000)}`;
}

// ─── Types ──────────────────────────────────────────────────
interface FormErrors {
  amount?: string;
  currencies?: string;
  fullName?: string;
  idNumber?: string;
}

// ═════════════════════════════════════════════════════════════
// Component
// ═════════════════════════════════════════════════════════════
export function DashboardPage() {
  const toast = useToast();

  // ─── Exchange state ────────────────────────────────────
  const [payCurrency, setPayCurrency] = useState('USD');
  const [receiveCurrency, setReceiveCurrency] = useState('EUR');
  const [payAmount, setPayAmount] = useState('1000.00');
  const [payDropdownOpen, setPayDropdownOpen] = useState(false);
  const [receiveDropdownOpen, setReceiveDropdownOpen] = useState(false);

  // ─── KYC state ─────────────────────────────────────────
  const [fullName, setFullName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [purpose, setPurpose] = useState(PURPOSES[0]);
  const [fundSource, setFundSource] = useState(FUND_SOURCES[0]);

  // ─── UI state ──────────────────────────────────────────
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [ref] = useState(generateRef);

  // ─── Store rates (with seed fallback) ──────────────────
  const storeRates = useRates();
  const hasLive = storeRates.length > 0;

  /**
   * Conversion logic:
   *
   * All rates in the store are quoted as XXX/USD (how many USD per 1 unit of XXX).
   * - bid = price we buy the base currency from customer (customer sells)
   * - ask = price we sell the base currency to customer (customer buys)
   *
   * When customer PAYS currency A and RECEIVES currency B:
   *   1. Convert A → USD using the bid for A (we buy A from customer)
   *   2. Convert USD → B using the ask for B (we sell B to customer)
   *
   * Special case: if A or B is USD, skip that leg.
   */
  const conversionResult = useMemo(() => {
    const amount = parseFloat(payAmount);
    if (isNaN(amount) || amount <= 0) return null;
    if (payCurrency === receiveCurrency) return { rate: 1, received: amount, spread: 0 };

    // Find rate for a currency vs USD
    const findRate = (code: string): { bid: number; ask: number } | null => {
      if (code === 'USD') return { bid: 1, ask: 1 };
      if (hasLive) {
        const r = storeRates.find((r: LiveRate) => r.base === code && r.quote === 'USD');
        if (r) return { bid: r.bid, ask: r.ask };
      }
      // Seed fallback
      const seed = seedRates.find((r) => r.currency === code);
      if (seed) return { bid: seed.buyRate, ask: seed.sellRate };
      return null;
    };

    const payRate = findRate(payCurrency);
    const recvRate = findRate(receiveCurrency);
    if (!payRate || !recvRate) return null;

    // Customer pays A → we buy A at bid → USD amount
    const usdAmount = payCurrency === 'USD' ? amount : amount * payRate.bid;
    // USD → customer receives B → we sell B at ask → B amount
    const received = receiveCurrency === 'USD' ? usdAmount : usdAmount / recvRate.ask;

    const effectiveRate = received / amount;
    // Spread: difference between mid and effective rate
    const midPay = payCurrency === 'USD' ? 1 : (payRate.bid + payRate.ask) / 2;
    const midRecv = receiveCurrency === 'USD' ? 1 : (recvRate.bid + recvRate.ask) / 2;
    const midRate = midPay / midRecv;
    const spread = midRate > 0 ? Math.abs((effectiveRate - midRate) / midRate) * 100 : 0;

    return { rate: effectiveRate, received, spread };
  }, [payAmount, payCurrency, receiveCurrency, storeRates, hasLive]);

  // ─── Sidebar rates from store or seed ──────────────────
  const sidebarRates = useMemo(() => {
    const pairs = ['EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD'];
    if (hasLive) {
      return pairs.map((code) => {
        const r = storeRates.find((r: LiveRate) => r.base === code && r.quote === 'USD');
        return {
          code,
          pair: `${code}/USD`,
          buy: r?.bid ?? 0,
          sell: r?.ask ?? 0,
          trend: r?.trend ?? 'stable',
        };
      }).filter((r) => r.buy > 0);
    }
    return seedDashboard.map((r) => ({
      code: r.currency,
      pair: r.pair,
      buy: r.buy,
      sell: r.sell,
      trend: 'stable' as const,
    }));
  }, [storeRates, hasLive]);

  // ─── Swap currencies ──────────────────────────────────
  const handleSwap = useCallback(() => {
    setPayCurrency(receiveCurrency);
    setReceiveCurrency(payCurrency);
    setErrors((e) => ({ ...e, currencies: undefined }));
  }, [payCurrency, receiveCurrency]);

  // ─── Validate ─────────────────────────────────────────
  const validate = useCallback((): boolean => {
    const errs: FormErrors = {};
    const amt = parseFloat(payAmount);

    if (!payAmount.trim() || isNaN(amt)) {
      errs.amount = 'Enter a valid amount';
    } else if (amt <= 0) {
      errs.amount = 'Amount must be greater than 0';
    } else if (amt > 1_000_000) {
      errs.amount = 'Amount exceeds maximum (1,000,000)';
    }

    if (payCurrency === receiveCurrency) {
      errs.currencies = 'Select different currencies';
    }

    if (!fullName.trim()) {
      errs.fullName = 'Customer name is required';
    } else if (fullName.trim().length < 3) {
      errs.fullName = 'Enter full name (min 3 characters)';
    }

    if (!idNumber.trim()) {
      errs.idNumber = 'ID number is required';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, [payAmount, payCurrency, receiveCurrency, fullName, idNumber]);

  // ─── Submit ───────────────────────────────────────────
  const handleProcess = useCallback(() => {
    if (!validate()) return;
    setSubmitted(true);
    toast('success', `Transaction ${ref} submitted — ${payCurrency} → ${receiveCurrency}`);
    setTimeout(() => setSubmitted(false), 2500);
  }, [validate, toast, ref, payCurrency, receiveCurrency]);

  // ─── Amount input handler ─────────────────────────────
  const handleAmountChange = (val: string) => {
    // Allow only numbers and one decimal point
    const cleaned = val.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    setPayAmount(cleaned);
    if (errors.amount) setErrors((e) => ({ ...e, amount: undefined }));
  };

  return (
    <div className="flex gap-6">
      {/* ═══ Main column ═══════════════════════════════════ */}
      <div className="flex-1 space-y-6 min-w-0">
        {/* Page heading */}
        <div>
          <h1 className="text-xl font-bold">Dashboard Overview</h1>
          <p className="text-text-muted text-sm mt-0.5">Ready for transaction processing</p>
        </div>

        {/* ─── Exchange Center Card ─────────────────────── */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-2.5">
              <div className="card-icon">
                <ArrowLeftRight className="w-4 h-4" />
              </div>
              <h2 className="font-semibold text-[15px]">Exchange Center</h2>
            </div>
            <span className="text-text-muted text-xs font-mono">{ref}</span>
          </div>

          <div className="p-5 space-y-5">
            {/* Currency conversion row */}
            <div className="flex items-start gap-3">
              {/* Customer Pays */}
              <div className="flex-1 min-w-0">
                <label className="table-header block mb-2">Customer Pays</label>
                <div className="flex">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={payAmount}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    aria-label="Amount customer pays"
                    className={cn(
                      'flex-1 min-w-0 bg-terminal-bg border rounded-l-lg px-4 py-3 text-lg font-mono font-semibold text-text-primary outline-none transition-colors',
                      errors.amount
                        ? 'border-status-red focus:border-status-red'
                        : 'border-terminal-border focus:border-primary',
                    )}
                  />
                  <CurrencyDropdown
                    value={payCurrency}
                    onChange={(c) => {
                      setPayCurrency(c);
                      if (errors.currencies) setErrors((e) => ({ ...e, currencies: undefined }));
                    }}
                    open={payDropdownOpen}
                    setOpen={setPayDropdownOpen}
                    side="right"
                  />
                </div>
                {errors.amount && (
                  <p className="text-status-red text-xs mt-1.5 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {errors.amount}
                  </p>
                )}
              </div>

              {/* Swap button */}
              <div className="pt-7">
                <button
                  onClick={handleSwap}
                  className="w-10 h-10 rounded-full bg-primary flex items-center justify-center hover:bg-primary-hover transition-colors active:scale-95 shadow-glow-blue"
                  title="Swap currencies"
                >
                  <ArrowLeftRight className="w-4.5 h-4.5 text-white" />
                </button>
              </div>

              {/* Customer Receives */}
              <div className="flex-1 min-w-0">
                <label className="table-header block mb-2">Customer Receives</label>
                <div className="flex">
                  <input
                    type="text"
                    readOnly
                    value={conversionResult ? formatAmount(conversionResult.received) : '—'}
                    aria-label="Amount customer receives"
                    className="flex-1 min-w-0 bg-terminal-bg border border-terminal-border rounded-l-lg px-4 py-3 text-lg font-mono font-semibold text-status-green outline-none cursor-default"
                  />
                  <CurrencyDropdown
                    value={receiveCurrency}
                    onChange={(c) => {
                      setReceiveCurrency(c);
                      if (errors.currencies) setErrors((e) => ({ ...e, currencies: undefined }));
                    }}
                    open={receiveDropdownOpen}
                    setOpen={setReceiveDropdownOpen}
                    side="right"
                  />
                </div>
                {errors.currencies && (
                  <p className="text-status-red text-xs mt-1.5 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {errors.currencies}
                  </p>
                )}
              </div>
            </div>

            {/* Live rate & spread display */}
            <div className="flex items-center justify-between px-1 text-sm">
              <div className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-status-green" />
                <span className="text-text-muted text-xs uppercase tracking-wide font-semibold">Live Rate</span>
                <span className="text-text-primary font-mono font-medium text-[13px]">
                  {conversionResult
                    ? `1 ${payCurrency} = ${formatRate(conversionResult.rate)} ${receiveCurrency}`
                    : '—'}
                </span>
              </div>
              <span className="text-text-muted text-xs font-mono">
                Spread: {conversionResult ? `${conversionResult.spread.toFixed(2)}%` : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* ─── KYC & Compliance Card ────────────────────── */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-2.5">
              <div className="card-icon">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <h2 className="font-semibold text-[15px]">KYC & Compliance</h2>
            </div>
            <span className="text-text-muted text-xs italic">Required for transactions above $500</span>
          </div>

          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Full Name */}
              <div>
                <label className="table-header block mb-2">Customer Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    if (errors.fullName) setErrors((er) => ({ ...er, fullName: undefined }));
                  }}
                  placeholder="e.g. John Doe"
                  className={cn(
                    'w-full bg-terminal-bg border rounded-lg px-4 py-2.5 text-text-primary placeholder-text-muted outline-none transition-colors',
                    errors.fullName
                      ? 'border-status-red focus:border-status-red'
                      : 'border-terminal-border focus:border-primary',
                  )}
                />
                {errors.fullName && (
                  <p className="text-status-red text-xs mt-1.5 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {errors.fullName}
                  </p>
                )}
              </div>

              {/* ID Number */}
              <div>
                <label className="table-header block mb-2">Identification Number (Passport/ID)</label>
                <input
                  type="text"
                  value={idNumber}
                  onChange={(e) => {
                    setIdNumber(e.target.value);
                    if (errors.idNumber) setErrors((er) => ({ ...er, idNumber: undefined }));
                  }}
                  placeholder="e.g. P-88234912"
                  className={cn(
                    'w-full bg-terminal-bg border rounded-lg px-4 py-2.5 text-text-primary placeholder-text-muted outline-none transition-colors',
                    errors.idNumber
                      ? 'border-status-red focus:border-status-red'
                      : 'border-terminal-border focus:border-primary',
                  )}
                />
                {errors.idNumber && (
                  <p className="text-status-red text-xs mt-1.5 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {errors.idNumber}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Purpose */}
              <div>
                <label className="table-header block mb-2">Purpose of Transaction</label>
                <div className="relative">
                  <select
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value as typeof purpose)}
                    className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-4 py-2.5 text-text-primary outline-none focus:border-primary appearance-none cursor-pointer transition-colors pr-10"
                  >
                    {PURPOSES.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                </div>
              </div>

              {/* Source of Funds */}
              <div>
                <label className="table-header block mb-2">Source of Funds</label>
                <div className="relative">
                  <select
                    value={fundSource}
                    onChange={(e) => setFundSource(e.target.value as typeof fundSource)}
                    className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-4 py-2.5 text-text-primary outline-none focus:border-primary appearance-none cursor-pointer transition-colors pr-10"
                  >
                    {FUND_SOURCES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Process Transaction Button ────────────────── */}
        <button
          onClick={handleProcess}
          disabled={submitted}
          className={cn(
            'w-full py-3.5 text-[15px] font-semibold flex items-center justify-center gap-2 rounded-terminal transition-all duration-150',
            submitted
              ? 'bg-status-green text-white cursor-default'
              : 'btn-primary',
          )}
        >
          <CheckCircle2 className="w-5 h-5" />
          {submitted ? 'Transaction Submitted!' : 'Process Transaction'}
        </button>
      </div>

      {/* ═══ Right sidebar — Market Live Rates ════════════ */}
      <div className="w-[320px] min-w-[320px]">
        <div className="card sticky top-6">
          <div className="card-header">
            <div className="flex items-center gap-2.5">
              <div className="card-icon">
                <Activity className="w-4 h-4" />
              </div>
              <h2 className="font-semibold text-[15px]">Market Live Rates</h2>
            </div>
            <a href="/live-rates" className="text-primary text-xs font-medium hover:underline">
              Full View
            </a>
          </div>

          <div className="p-0">
            <table className="w-full">
              <thead>
                <tr className="border-b border-terminal-border">
                  <th className="table-header text-left px-5 py-2.5">Currency</th>
                  <th className="table-header text-right px-3 py-2.5">Buy</th>
                  <th className="table-header text-right px-5 py-2.5">Sell</th>
                </tr>
              </thead>
              <tbody>
                {sidebarRates.map((r) => (
                  <tr
                    key={r.code}
                    className="border-b border-terminal-border/40 hover:bg-terminal-surface/40 transition-colors cursor-pointer"
                    onClick={() => {
                      setReceiveCurrency(r.code);
                      if (payCurrency === r.code) setPayCurrency('USD');
                    }}
                  >
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={cn(
                            'w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold',
                            CURRENCY_COLORS[r.code] ?? 'bg-gray-600',
                          )}
                        >
                          {r.code.slice(0, 2)}
                        </div>
                        <div>
                          <span className="text-sm font-medium text-text-primary">{r.code}</span>
                          <span className="text-xxs text-text-muted ml-1.5">/{payCurrency}</span>
                        </div>
                        {r.trend !== 'stable' && (
                          r.trend === 'up'
                            ? <TrendingUp className="w-3 h-3 text-status-green ml-auto" />
                            : <TrendingDown className="w-3 h-3 text-status-red ml-auto" />
                        )}
                        {r.trend === 'stable' && (
                          <Minus className="w-3 h-3 text-text-muted ml-auto" />
                        )}
                      </div>
                    </td>
                    <td className="text-right px-3 py-2.5 font-mono text-[12px] text-text-primary">
                      {formatRate(r.buy)}
                    </td>
                    <td className="text-right px-5 py-2.5 font-mono text-[12px] text-text-primary">
                      {formatRate(r.sell)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mini bar chart — General Market Trend (24H) */}
          <div className="px-5 py-4 border-t border-terminal-border">
            <div className="table-header mb-2">General Market Trend (24H)</div>
            <div className="h-14 bg-terminal-surface rounded-lg flex items-end justify-around px-2 pb-1 gap-[3px]">
              {[30, 45, 35, 55, 40, 65, 50, 70, 60, 75, 55, 80, 65, 70, 60, 75, 85, 70, 80, 90].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 bg-primary/50 rounded-t-sm transition-all"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Currency Dropdown ──────────────────────────────────────
function CurrencyDropdown({
  value,
  onChange,
  open,
  setOpen,
  side,
}: {
  value: string;
  onChange: (code: string) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
  side: 'left' | 'right';
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'h-full bg-terminal-surface border border-l-0 border-terminal-border px-4 py-3 flex items-center gap-2 text-text-secondary hover:bg-terminal-surface-2 transition-colors',
          side === 'right' ? 'rounded-r-lg' : 'rounded-l-lg',
        )}
      >
        <span
          className={cn(
            'w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold',
            CURRENCY_COLORS[value] ?? 'bg-gray-600',
          )}
        >
          {value.slice(0, 2)}
        </span>
        <span className="font-semibold text-text-primary text-sm">{value}</span>
        <ChevronDown className={cn('w-3.5 h-3.5 text-text-muted transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {/* Dropdown */}
          <div className="absolute top-full mt-1 right-0 z-50 w-52 bg-terminal-card border border-terminal-border rounded-lg shadow-terminal-lg overflow-hidden">
            <div className="max-h-64 overflow-y-auto">
              {CURRENCIES.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => {
                    onChange(c.code);
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-terminal-surface transition-colors',
                    c.code === value && 'bg-primary/10',
                  )}
                >
                  <span
                    className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold',
                      CURRENCY_COLORS[c.code] ?? 'bg-gray-600',
                    )}
                  >
                    {c.code.slice(0, 2)}
                  </span>
                  <span className="text-sm text-text-primary font-medium">{c.code}</span>
                  <span className="text-xs text-text-muted ml-auto">{c.name}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
