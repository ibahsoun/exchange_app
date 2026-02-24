import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  ArrowLeftRight,
  CheckCircle2,
  ChevronDown,
  AlertCircle,
  Activity,
  User,
  Search,
  Eraser,
} from 'lucide-react';
import { cn, formatRate, formatAmount } from '@/lib/utils';
import { useToast } from '@/components/Toast';
import { transactionsApi, customersApi, currenciesApi, spreadApi, VALID_BASES, type SpreadRow, type Currency } from '@/lib/api';

/** Generate a transaction reference */
function generateRef() {
  return `TR-${Math.floor(10000 + Math.random() * 90000)}`;
}

function getStoredBase(): string {
  try {
    const v = localStorage.getItem('baseCurrency');
    if (v && VALID_BASES.includes(v)) return v;
  } catch { /* ignore */ }
  return 'USD';
}

const DASHBOARD_FORM_KEY = 'exchange-dashboard-form';

interface StoredDashboardForm {
  payCurrency: string;
  receiveCurrency: string;
  payAmount: string;
  receiveAmount: string;
  editDirection: 'pay' | 'receive';
  selectedCustomerId: string;
}

const DEFAULT_PAY = '1000.00';
const DEFAULT_PAY_CURRENCY = 'USD';
const DEFAULT_RECEIVE_CURRENCY = 'EUR';

function getStoredDashboardForm(): StoredDashboardForm | null {
  try {
    const raw = localStorage.getItem(DASHBOARD_FORM_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as unknown;
    if (
      data &&
      typeof data === 'object' &&
      typeof (data as StoredDashboardForm).payCurrency === 'string' &&
      typeof (data as StoredDashboardForm).receiveCurrency === 'string' &&
      typeof (data as StoredDashboardForm).payAmount === 'string' &&
      typeof (data as StoredDashboardForm).receiveAmount === 'string' &&
      ((data as StoredDashboardForm).editDirection === 'pay' ||
        (data as StoredDashboardForm).editDirection === 'receive') &&
      typeof (data as StoredDashboardForm).selectedCustomerId === 'string'
    ) {
      return data as StoredDashboardForm;
    }
  } catch { /* ignore */ }
  return null;
}

function saveDashboardForm(form: StoredDashboardForm): void {
  try {
    localStorage.setItem(DASHBOARD_FORM_KEY, JSON.stringify(form));
  } catch { /* ignore */ }
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

  // ─── Exchange state (restored from localStorage when navigating back) ─
  const stored = getStoredDashboardForm();
  const [payCurrency, setPayCurrency] = useState(
    stored?.payCurrency ?? DEFAULT_PAY_CURRENCY,
  );
  const [receiveCurrency, setReceiveCurrency] = useState(
    stored?.receiveCurrency ?? DEFAULT_RECEIVE_CURRENCY,
  );
  const [payAmount, setPayAmount] = useState(stored?.payAmount ?? DEFAULT_PAY);
  const [receiveAmount, setReceiveAmount] = useState(
    stored?.receiveAmount ?? '',
  );
  const [editDirection, setEditDirection] = useState<'pay' | 'receive'>(
    stored?.editDirection ?? 'pay',
  );
  const [payDropdownOpen, setPayDropdownOpen] = useState(false);
  const [receiveDropdownOpen, setReceiveDropdownOpen] = useState(false);

  // ─── Currency list from backend ─────────────────────────
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const currencyColors = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of currencies) m[c.code] = c.color;
    return m;
  }, [currencies]);

  useEffect(() => {
    currenciesApi.list().then(setCurrencies).catch(console.error);
  }, []);

  // ─── Customer list & selection ─────────────────────────
  const [customerList, setCustomerList] = useState<
    { id: string; name: string; customerId: string }[]
  >([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(
    stored?.selectedCustomerId ?? '',
  );
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

  // Persist form state so it survives navigation
  useEffect(() => {
    saveDashboardForm({
      payCurrency,
      receiveCurrency,
      payAmount,
      receiveAmount,
      editDirection,
      selectedCustomerId,
    });
  }, [
    payCurrency,
    receiveCurrency,
    payAmount,
    receiveAmount,
    editDirection,
    selectedCustomerId,
  ]);

  // ─── UI state ──────────────────────────────────────────
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [ref] = useState(generateRef);

  // ─── Base currency (shared with LiveRates via localStorage) ─
  const [baseCurrency, setBaseCurrency] = useState(getStoredBase);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'baseCurrency' && e.newValue && VALID_BASES.includes(e.newValue)) {
        setBaseCurrency(e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // ─── Pricing from backend (single source of truth) ─
  const [pricing, setPricing] = useState<SpreadRow[]>([]);

  const fetchPricing = useCallback(() => {
    spreadApi.getAll(baseCurrency).then(setPricing).catch(console.error);
  }, [baseCurrency]);

  useEffect(() => { fetchPricing(); }, [fetchPricing]);

  // Re-fetch pricing when page regains focus (e.g. after editing Spread Settings)
  useEffect(() => {
    const onFocus = () => fetchPricing();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchPricing]);

  // Lookup returns backend-computed bid/ask/mid — no frontend spread math
  const pricingMap = useMemo(() => {
    const m = new Map<string, SpreadRow>();
    for (const row of pricing) m.set(row.quote, row);
    return m;
  }, [pricing]);

  // Rounding helper: apply per-pair rounding to a value
  const applyRounding = useCallback((value: number, currency: string): number => {
    const cfg = pricingMap.get(currency);
    if (!cfg || cfg.roundingDecimals == null || !cfg.roundingMode) return value;
    const factor = Math.pow(10, cfg.roundingDecimals);
    if (cfg.roundingMode === 'FLOOR') return Math.floor(value * factor) / factor;
    return Math.ceil(value * factor) / factor;
  }, [pricingMap]);

  // Format rate respecting per-pair rounding decimals
  const fmtRate = useCallback((value: number, currency: string): string => {
    const cfg = pricingMap.get(currency);
    if (cfg?.roundingDecimals != null) {
      return value.toLocaleString('en-US', { minimumFractionDigits: cfg.roundingDecimals, maximumFractionDigits: cfg.roundingDecimals });
    }
    return formatRate(value);
  }, [pricingMap]);

  // Format amount respecting per-pair rounding decimals
  const fmtAmount = useCallback((value: number, currency: string): string => {
    const cfg = pricingMap.get(currency);
    if (cfg?.roundingDecimals != null) {
      return value.toLocaleString('en-US', { minimumFractionDigits: cfg.roundingDecimals, maximumFractionDigits: cfg.roundingDecimals });
    }
    return formatAmount(value);
  }, [pricingMap]);

  // ─── Bidirectional conversion ──────────────────────
  const conversionResult = useMemo(() => {
    const sourceAmount = editDirection === 'pay' ? payAmount : receiveAmount;
    const amount = parseFloat(sourceAmount);
    if (isNaN(amount) || amount <= 0) return null;
    if (payCurrency === receiveCurrency)
      return { rate: 1, midRate: 1, bidRate: 1, askRate: 1, rateLabel: 'bid' as const, computedPay: amount, computedReceive: amount };

    // All rates are BASE/QUOTE (how many QUOTE per 1 BASE).
    // BASE is the selected baseCurrency (default USD).
    // bid/ask/mid come pre-computed from backend using the same
    // storeRate + spreadConfig as LiveRates and SpreadSettings.
    const BASE_UNIT: Pick<SpreadRow, 'bid' | 'ask' | 'mid'> = { bid: 1, ask: 1, mid: 1 };
    const payPricing = payCurrency === baseCurrency ? BASE_UNIT : pricingMap.get(payCurrency);
    const recvPricing = receiveCurrency === baseCurrency ? BASE_UNIT : pricingMap.get(receiveCurrency);
    if (!payPricing || !recvPricing) return null;

    // "Customer pays X" = customer SELLS X to us.
    //   When selling BASE → quote rate bid  (customer gets fewer QUOTE)
    //   When selling QUOTE → quote rate ask  (customer gives more QUOTE per BASE)

    let computedPay: number;
    let computedReceive: number;

    if (editDirection === 'pay') {
      const baseAmount = payCurrency === baseCurrency ? amount : amount / payPricing.ask;
      computedReceive = receiveCurrency === baseCurrency ? baseAmount : baseAmount * recvPricing.bid;
      computedReceive = applyRounding(computedReceive, receiveCurrency);
      computedPay = amount;
    } else {
      const baseAmount = receiveCurrency === baseCurrency ? amount : amount / recvPricing.bid;
      computedPay = payCurrency === baseCurrency ? baseAmount : baseAmount * payPricing.ask;
      computedPay = applyRounding(computedPay, payCurrency);
      computedReceive = amount;
    }

    // Mid-rate for display: 1 PAY → midPay BASE → midPay × midRecv RECV
    const midPay = payCurrency === baseCurrency ? 1 : 1 / payPricing.mid;
    const midRecv = receiveCurrency === baseCurrency ? 1 : recvPricing.mid;
    const midRate = midPay * midRecv;

    // Bid rate: 1 PAY → RECV using bid prices
    const bidRate =
      (payCurrency === baseCurrency ? 1 : 1 / payPricing.bid) *
      (receiveCurrency === baseCurrency ? 1 : recvPricing.bid);

    // Ask rate: 1 PAY → RECV using ask prices
    const askRate =
      (payCurrency === baseCurrency ? 1 : 1 / payPricing.ask) *
      (receiveCurrency === baseCurrency ? 1 : recvPricing.ask);

    const customerRate = computedReceive / computedPay;
    const rateLabel: 'bid' | 'ask' = payCurrency === baseCurrency ? 'bid' : 'ask';

    return { rate: customerRate, midRate, bidRate, askRate, rateLabel, computedPay, computedReceive };
  }, [payAmount, receiveAmount, editDirection, payCurrency, receiveCurrency, baseCurrency, pricingMap, applyRounding]);

  // ─── Swap currencies ──────────────────────────────────
  const handleSwap = useCallback(() => {
    setPayCurrency(receiveCurrency);
    setReceiveCurrency(payCurrency);
    // Swap the amounts and flip direction
    setPayAmount(
      receiveAmount || (conversionResult ? fmtAmount(conversionResult.computedReceive, receiveCurrency) : ''),
    );
    setReceiveAmount(
      payAmount || (conversionResult ? fmtAmount(conversionResult.computedPay, payCurrency) : ''),
    );
    setErrors((e) => ({ ...e, currencies: undefined }));
  }, [payCurrency, receiveCurrency, payAmount, receiveAmount, conversionResult, fmtAmount]);

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

  const handleClear = useCallback(() => {
    setPayCurrency(DEFAULT_PAY_CURRENCY);
    setReceiveCurrency(DEFAULT_RECEIVE_CURRENCY);
    setPayAmount(DEFAULT_PAY);
    setReceiveAmount('');
    setEditDirection('pay');
    setSelectedCustomerId('');
    setErrors({});
    // Persist effect will save cleared state so it stays cleared when navigating back
  }, []);

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
                          ? fmtAmount(conversionResult.computedPay, payCurrency)
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
                    currencies={currencies}
                    colorMap={currencyColors}
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
                          ? fmtAmount(conversionResult.computedReceive, receiveCurrency)
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
                    currencies={currencies}
                    colorMap={currencyColors}
                  />
                </div>
                {errors.currencies && (
                  <p className="text-status-red text-xs mt-1.5 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {errors.currencies}
                  </p>
                )}
              </div>
            </div>

            {/* Rate & spread display */}
            <div className="flex flex-col gap-1.5 px-1 text-sm">
              {/* Market rate (mid) */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-text-muted" />
                  <span className="text-text-muted text-xs font-semibold">Market rate</span>
                  <span className="text-text-muted font-mono text-[12px]">
                    {conversionResult
                      ? <>1 {payCurrency} = {fmtRate(conversionResult.midRate, receiveCurrency)} {receiveCurrency} <span className="inline-block mx-1.5 w-px h-3 bg-terminal-border align-middle" /> 1 {receiveCurrency} = {fmtRate(1 / conversionResult.midRate, payCurrency)} {payCurrency}</>
                      : '—'}
                  </span>
                </div>
                <span className="text-text-muted text-xs font-mono">
                  Spread: {(() => {
                    const quote = receiveCurrency !== baseCurrency ? receiveCurrency : payCurrency;
                    const cfg = pricingMap.get(quote);
                    if (!cfg) return '—';
                    if (cfg.spreadType === 'FIXED') {
                      if (cfg.spreadMode === 'ASYMMETRIC') {
                        if (cfg.buyMargin === 0 && cfg.sellMargin === 0) return '—';
                        return `B:${cfg.buyMargin} / S:${cfg.sellMargin} fix`;
                      }
                      if (cfg.spreadFixed === 0) return '—';
                      return `${cfg.spreadFixed} fix`;
                    }
                    if (cfg.spreadMode === 'ASYMMETRIC') {
                      if (cfg.buyMargin === 0 && cfg.sellMargin === 0) return '—';
                      return `B:${cfg.buyMargin}% / S:${cfg.sellMargin}%`;
                    }
                    if (cfg.spreadPercent === 0) return '—';
                    return `${cfg.spreadPercent}%`;
                  })()}
                </span>
              </div>
              {/* Customer rate (bid) */}
              <div className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-status-green" />
                <span className="text-text-primary text-xs font-semibold">Customer rate (bid)</span>
                <span className="text-text-primary font-mono font-medium text-[12px]">
                  {conversionResult
                    ? <>1 {payCurrency} = {fmtRate(conversionResult.bidRate, receiveCurrency)} {receiveCurrency} <span className="inline-block mx-1.5 w-px h-3 bg-terminal-border align-middle" /> 1 {receiveCurrency} = {fmtRate(1 / conversionResult.bidRate, payCurrency)} {payCurrency}</>
                    : '—'}
                </span>
              </div>
              {/* Customer rate (ask) */}
              <div className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-text-primary text-xs font-semibold">Customer rate (ask)</span>
                <span className="text-text-primary font-mono font-medium text-[12px]">
                  {conversionResult
                    ? <>1 {payCurrency} = {fmtRate(conversionResult.askRate, receiveCurrency)} {receiveCurrency} <span className="inline-block mx-1.5 w-px h-3 bg-terminal-border align-middle" /> 1 {receiveCurrency} = {fmtRate(1 / conversionResult.askRate, payCurrency)} {payCurrency}</>
                    : '—'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Clear & Process Transaction Buttons ───────── */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleClear}
            className="flex-1 py-3.5 text-[15px] font-semibold flex items-center justify-center gap-2 rounded-terminal border border-terminal-border bg-terminal-surface text-text-secondary hover:bg-terminal-surface-2 hover:border-terminal-border/80 transition-all duration-150"
          >
            <Eraser className="w-5 h-5" />
            Clear
          </button>
          <button
            onClick={handleProcess}
            disabled={submitted}
            className={cn(
              'flex-1 py-3.5 text-[15px] font-semibold flex items-center justify-center gap-2 rounded-terminal transition-all duration-150',
              submitted ? 'bg-status-green text-white cursor-default' : 'btn-primary',
            )}
          >
            <CheckCircle2 className="w-5 h-5" />
            {submitted ? 'Transaction Submitted!' : 'Process Transaction'}
          </button>
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
  currencies,
  colorMap,
}: {
  value: string;
  onChange: (code: string) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
  side: 'left' | 'right';
  currencies: Currency[];
  colorMap: Record<string, string>;
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
            colorMap[value] ?? 'bg-gray-600',
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
              {currencies.map((c) => (
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
                      colorMap[c.code] ?? 'bg-gray-600',
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
