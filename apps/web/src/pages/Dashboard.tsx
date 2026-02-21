import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  ArrowLeftRight,
  CheckCircle2,
  ChevronDown,
  AlertCircle,
  Activity,
  User,
  Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/Toast';
import { useRates } from '@/hooks/useRates';
import { transactionsApi, customersApi } from '@/lib/api';
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
  USD: 'bg-emerald-600',
  EUR: 'bg-blue-500',
  GBP: 'bg-indigo-500',
  JPY: 'bg-red-500',
  CHF: 'bg-red-600',
  CAD: 'bg-rose-700',
  AUD: 'bg-blue-700',
  CNY: 'bg-amber-600',
  ARS: 'bg-sky-700',
  PYG: 'bg-red-700',
  BRL: 'bg-green-600',
  AED: 'bg-teal-600',
  USDT: 'bg-emerald-500',
};

// ─── Helpers ────────────────────────────────────────────────
function formatRate(n: number): string {
  if (n >= 1000)
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1)
    return n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
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
  customer?: string;
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
  const [receiveAmount, setReceiveAmount] = useState('');
  const [editDirection, setEditDirection] = useState<'pay' | 'receive'>('pay');
  const [payDropdownOpen, setPayDropdownOpen] = useState(false);
  const [receiveDropdownOpen, setReceiveDropdownOpen] = useState(false);

  // ─── Customer list & selection ─────────────────────────
  const [customerList, setCustomerList] = useState<
    { id: string; name: string; customerId: string }[]
  >([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const customerSearchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    customersApi
      .list({ limit: '100' })
      .then((res) => {
        const customers = (res.items as { id: string; name: string; customerId: string }[]).map(
          (c) => ({ id: c.id, name: c.name, customerId: c.customerId }),
        );
        setCustomerList(customers);
        if (customers.length > 0 && !selectedCustomerId) {
          setSelectedCustomerId(customers[0].id);
        }
      })
      .catch(console.error);
  }, []);

  // ─── UI state ──────────────────────────────────────────
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [ref] = useState(generateRef);

  // ─── Store rates (live from API) ────────────────────────
  const storeRates = useRates();

  // ─── Rate lookup helper ─────────────────────────────
  const findRate = useCallback(
    (code: string): { bid: number; ask: number } | null => {
      if (code === 'USD') return { bid: 1, ask: 1 };
      const r = storeRates.find((r: LiveRate) => r.base === 'USD' && r.quote === code);
      if (r) return { bid: r.bid, ask: r.ask };
      return null;
    },
    [storeRates],
  );

  // ─── Bidirectional conversion ──────────────────────
  const conversionResult = useMemo(() => {
    const sourceAmount = editDirection === 'pay' ? payAmount : receiveAmount;
    const amount = parseFloat(sourceAmount);
    if (isNaN(amount) || amount <= 0) return null;
    if (payCurrency === receiveCurrency)
      return { rate: 1, computedPay: amount, computedReceive: amount, spread: 0 };

    const payRate = findRate(payCurrency);
    const recvRate = findRate(receiveCurrency);
    if (!payRate || !recvRate) return null;

    let computedPay: number;
    let computedReceive: number;

    if (editDirection === 'pay') {
      // Forward: pay → receive
      const usdAmount = payCurrency === 'USD' ? amount : amount * payRate.bid;
      computedReceive = receiveCurrency === 'USD' ? usdAmount : usdAmount / recvRate.ask;
      computedPay = amount;
    } else {
      // Reverse: receive → pay
      const usdAmount = receiveCurrency === 'USD' ? amount : amount * recvRate.ask;
      computedPay = payCurrency === 'USD' ? usdAmount : usdAmount / payRate.bid;
      computedReceive = amount;
    }

    const effectiveRate = computedReceive / computedPay;

    return { rate: effectiveRate, computedPay, computedReceive, spread: 0 };
  }, [payAmount, receiveAmount, editDirection, payCurrency, receiveCurrency, findRate]);

  // ─── Swap currencies ──────────────────────────────────
  const handleSwap = useCallback(() => {
    setPayCurrency(receiveCurrency);
    setReceiveCurrency(payCurrency);
    // Swap the amounts and flip direction
    setPayAmount(
      receiveAmount || (conversionResult ? formatAmount(conversionResult.computedReceive) : ''),
    );
    setReceiveAmount(
      payAmount || (conversionResult ? formatAmount(conversionResult.computedPay) : ''),
    );
    setErrors((e) => ({ ...e, currencies: undefined }));
  }, [payCurrency, receiveCurrency, payAmount, receiveAmount, conversionResult]);

  // ─── Validate ─────────────────────────────────────────
  const validate = useCallback((): boolean => {
    const errs: FormErrors = {};
    const sourceAmount = editDirection === 'pay' ? payAmount : receiveAmount;
    const amt = parseFloat(sourceAmount);

    if (!sourceAmount.trim() || isNaN(amt)) {
      errs.amount = 'Enter a valid amount';
    } else if (amt <= 0) {
      errs.amount = 'Amount must be greater than 0';
    } else if (editDirection === 'pay' && amt > 1_000_000) {
      errs.amount = 'Amount exceeds maximum (1,000,000)';
    } else if (conversionResult && conversionResult.computedPay > 1_000_000) {
      errs.amount = 'Computed pay amount exceeds maximum (1,000,000)';
    }

    if (payCurrency === receiveCurrency) {
      errs.currencies = 'Select different currencies';
    }

    if (!selectedCustomerId) {
      errs.customer = 'Select a customer';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, [
    payAmount,
    receiveAmount,
    editDirection,
    conversionResult,
    payCurrency,
    receiveCurrency,
    selectedCustomerId,
  ]);

  // ─── Submit ───────────────────────────────────────────
  const handleProcess = useCallback(async () => {
    if (!validate() || !conversionResult) return;

    try {
      await transactionsApi.create({
        type: 'BUY',
        base: payCurrency,
        quote: receiveCurrency,
        amountIn: conversionResult.computedPay,
        customerId: selectedCustomerId,
      });
      setSubmitted(true);
      toast('success', `Transaction ${ref} submitted — ${payCurrency} → ${receiveCurrency}`);
      setTimeout(() => setSubmitted(false), 2500);
    } catch (err) {
      console.error('Transaction failed:', err);
      toast('error', 'Transaction failed. Check rates and try again.');
    }
  }, [validate, conversionResult, toast, ref, payCurrency, receiveCurrency, selectedCustomerId]);

  // ─── Amount input handlers ────────────────────────────
  const cleanAmount = (val: string) => val.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');

  const handlePayAmountChange = (val: string) => {
    const cleaned = cleanAmount(val);
    setPayAmount(cleaned);
    setEditDirection('pay');
    if (errors.amount) setErrors((e) => ({ ...e, amount: undefined }));
  };

  const handleReceiveAmountChange = (val: string) => {
    const cleaned = cleanAmount(val);
    setReceiveAmount(cleaned);
    setEditDirection('receive');
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
              <h2 className="font-semibold text-[15px]">Currency Exchange</h2>
            </div>
            <span className="text-text-muted text-xs font-mono">{ref}</span>
          </div>

          <div className="p-5 space-y-5">
            {/* Customer selector */}
            <div>
              <label className="table-header block mb-2">Customer</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setCustomerDropdownOpen((v) => !v);
                    setCustomerSearch('');
                    setTimeout(() => customerSearchRef.current?.focus(), 0);
                  }}
                  className={cn(
                    'w-full bg-terminal-bg border rounded-lg pl-9 pr-10 py-2.5 text-left outline-none cursor-pointer transition-colors',
                    errors.customer
                      ? 'border-status-red focus:border-status-red'
                      : 'border-terminal-border focus:border-primary',
                  )}
                >
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
                    <User className="w-4 h-4" />
                  </div>
                  <span className={selectedCustomerId ? 'text-text-primary' : 'text-text-muted'}>
                    {selectedCustomerId
                      ? (() => {
                          const c = customerList.find((c) => c.id === selectedCustomerId);
                          return c ? `${c.name} (${c.customerId})` : 'Select a customer...';
                        })()
                      : 'Select a customer...'}
                  </span>
                  <ChevronDown
                    className={cn(
                      'absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted transition-transform',
                      customerDropdownOpen && 'rotate-180',
                    )}
                  />
                </button>

                {customerDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setCustomerDropdownOpen(false)}
                    />
                    <div className="absolute top-full mt-1 left-0 right-0 z-50 bg-terminal-card border border-terminal-border rounded-lg shadow-terminal-lg overflow-hidden">
                      <div className="p-2 border-b border-terminal-border">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
                          <input
                            ref={customerSearchRef}
                            type="text"
                            value={customerSearch}
                            onChange={(e) => setCustomerSearch(e.target.value)}
                            placeholder="Search customers..."
                            className="w-full bg-terminal-bg border border-terminal-border rounded-md pl-8 pr-3 py-1.5 text-sm text-text-primary outline-none focus:border-primary placeholder:text-text-muted"
                          />
                        </div>
                      </div>
                      <div className="max-h-56 overflow-y-auto">
                        {customerList
                          .filter((c) => {
                            if (!customerSearch) return true;
                            const q = customerSearch.toLowerCase();
                            return (
                              c.name.toLowerCase().includes(q) ||
                              c.customerId.toLowerCase().includes(q)
                            );
                          })
                          .map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setSelectedCustomerId(c.id);
                                setCustomerDropdownOpen(false);
                                setCustomerSearch('');
                                if (errors.customer)
                                  setErrors((er) => ({ ...er, customer: undefined }));
                              }}
                              className={cn(
                                'w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-terminal-surface transition-colors',
                                c.id === selectedCustomerId && 'bg-primary/10',
                              )}
                            >
                              <User className="w-4 h-4 text-text-muted flex-shrink-0" />
                              <span className="text-sm text-text-primary font-medium">
                                {c.name}
                              </span>
                              <span className="text-xs text-text-muted ml-auto">
                                {c.customerId}
                              </span>
                            </button>
                          ))}
                        {customerList.filter((c) => {
                          if (!customerSearch) return true;
                          const q = customerSearch.toLowerCase();
                          return (
                            c.name.toLowerCase().includes(q) ||
                            c.customerId.toLowerCase().includes(q)
                          );
                        }).length === 0 && (
                          <div className="px-4 py-3 text-sm text-text-muted text-center">
                            No customers found
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
              {errors.customer && (
                <p className="text-status-red text-xs mt-1.5 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {errors.customer}
                </p>
              )}
            </div>

            {/* Currency conversion row */}
            <div className="flex items-start gap-3">
              {/* Customer Pays */}
              <div className="flex-1 min-w-0">
                <label className="table-header block mb-2">Customer Pays</label>
                <div className="flex">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={
                      editDirection === 'pay'
                        ? payAmount
                        : conversionResult
                          ? formatAmount(conversionResult.computedPay)
                          : '—'
                    }
                    onChange={(e) => handlePayAmountChange(e.target.value)}
                    onFocus={() => {
                      if (editDirection === 'receive' && conversionResult) {
                        setPayAmount(conversionResult.computedPay.toFixed(2));
                        setEditDirection('pay');
                      }
                    }}
                    aria-label="Amount customer pays"
                    className={cn(
                      'flex-1 min-w-0 bg-terminal-bg border rounded-l-lg px-4 py-3 text-lg font-mono font-semibold outline-none transition-colors',
                      editDirection === 'pay' ? 'text-text-primary' : 'text-status-green',
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
                    inputMode="decimal"
                    value={
                      editDirection === 'receive'
                        ? receiveAmount
                        : conversionResult
                          ? formatAmount(conversionResult.computedReceive)
                          : '—'
                    }
                    onChange={(e) => handleReceiveAmountChange(e.target.value)}
                    onFocus={() => {
                      if (editDirection === 'pay' && conversionResult) {
                        setReceiveAmount(conversionResult.computedReceive.toFixed(2));
                        setEditDirection('receive');
                      }
                    }}
                    aria-label="Amount customer receives"
                    className={cn(
                      'flex-1 min-w-0 bg-terminal-bg border rounded-l-lg px-4 py-3 text-lg font-mono font-semibold outline-none transition-colors',
                      editDirection === 'receive' ? 'text-text-primary' : 'text-status-green',
                      'border-terminal-border focus:border-primary',
                    )}
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
                <span className="text-text-muted text-xs uppercase tracking-wide font-semibold">
                  Live Rate
                </span>
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

        {/* ─── Process Transaction Button ────────────────── */}
        <button
          onClick={handleProcess}
          disabled={submitted}
          className={cn(
            'w-full py-3.5 text-[15px] font-semibold flex items-center justify-center gap-2 rounded-terminal transition-all duration-150',
            submitted ? 'bg-status-green text-white cursor-default' : 'btn-primary',
          )}
        >
          <CheckCircle2 className="w-5 h-5" />
          {submitted ? 'Transaction Submitted!' : 'Process Transaction'}
        </button>
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
        <ChevronDown
          className={cn('w-3.5 h-3.5 text-text-muted transition-transform', open && 'rotate-180')}
        />
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
