import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  ArrowLeftRight,
  CheckCircle2,
  ChevronDown,
  AlertCircle,
  User,
  Search,
  Eraser,
} from 'lucide-react';
import { cn, formatRate, formatAmount } from '@/lib/utils';
import { useToast } from '@/components/Toast';
import { transactionsApi, customersApi, currenciesApi, spreadApi, customerFeesApi, destinationsApi, VALID_BASES, FEE_POINT_VALUE, type SpreadRow, type Currency, type CustomerPairFee, type Destination } from '@/lib/api';

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
  selectedDestinationId?: string;
}

const DEFAULT_PAY = '1000.00';
const DEFAULT_PAY_CURRENCY = 'USD';
const DEFAULT_RECEIVE_CURRENCY = 'BRL';

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

/** Star rating rendered as filled/empty glyphs */
function Stars({ level }: { level: number }) {
  return (
    <span className="text-status-yellow text-[12px] leading-none tracking-tight flex-shrink-0">
      {'★'.repeat(level)}
      {'☆'.repeat(Math.max(0, 5 - level))}
    </span>
  );
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
    currenciesApi
      .list()
      .then((list) => {
        setCurrencies(list);
        // A currency removed in Configuration may still be saved in this
        // browser — fall back rather than quoting a pair that no longer exists.
        const codes = list.map((c) => c.code);
        if (codes.length > 0) {
          setPayCurrency((c) =>
            codes.includes(c) ? c : (codes.includes(DEFAULT_PAY_CURRENCY) ? DEFAULT_PAY_CURRENCY : codes[0]),
          );
          setReceiveCurrency((c) =>
            codes.includes(c)
              ? c
              : (codes.includes(DEFAULT_RECEIVE_CURRENCY) ? DEFAULT_RECEIVE_CURRENCY : codes[0]),
          );
        }
      })
      .catch(console.error);
  }, []);

  // ─── Customer list & selection ─────────────────────────
  const [customerList, setCustomerList] = useState<
    { id: string; name: string; customerId: string; level: number }[]
  >([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(
    stored?.selectedCustomerId ?? '',
  );
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const customerSearchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    customersApi
      .list({ limit: '1000' })
      .then((res) => {
        const customers = (res.items as { id: string; name: string; customerId: string; level?: number }[]).map(
          (c) => ({ id: c.id, name: c.name, customerId: c.customerId, level: c.level ?? 3 }),
        );
        setCustomerList(customers);
        if (customers.length > 0 && !selectedCustomerId) {
          setSelectedCustomerId(customers[0].id);
        }
      })
      .catch(console.error);
  }, []);

  // ─── Destination list & selection ─────────────────────
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [selectedDestinationId, setSelectedDestinationId] = useState(
    stored?.selectedDestinationId ?? '',
  );
  const [destDropdownOpen, setDestDropdownOpen] = useState(false);

  useEffect(() => {
    destinationsApi.list().then(setDestinations).catch(console.error);
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
      selectedDestinationId,
    });
  }, [
    payCurrency,
    receiveCurrency,
    payAmount,
    receiveAmount,
    editDirection,
    selectedCustomerId,
    selectedDestinationId,
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

  // ─── The selected customer's fee for the selected pair ─
  const [pairFee, setPairFee] = useState<CustomerPairFee | null>(null);

  useEffect(() => {
    if (!selectedCustomerId || payCurrency === receiveCurrency) {
      setPairFee(null);
      return;
    }
    let cancelled = false;
    customerFeesApi
      .getForCustomer(selectedCustomerId, payCurrency, receiveCurrency)
      .then((fee) => {
        if (!cancelled) setPairFee(fee.points > 0 || fee.percent > 0 ? fee : null);
      })
      .catch(() => {
        if (!cancelled) setPairFee(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCustomerId, payCurrency, receiveCurrency]);

  // Lookup returns backend-computed bid/ask/mid — no frontend spread math
  const pricingMap = useMemo(() => {
    const m = new Map<string, SpreadRow>();
    for (const row of pricing) m.set(row.quote, row);
    return m;
  }, [pricing]);

  // Rounding helper: apply per-pair rounding to a value
  // Rounding helper: FLOOR for amounts the customer receives (house-favourable)
  const applyRounding = useCallback((value: number, currency: string): number => {
    const cfg = pricingMap.get(currency);
    if (!cfg || cfg.roundingDecimals == null) return value;
    const factor = Math.pow(10, cfg.roundingDecimals);
    return Math.floor(value * factor) / factor;
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
    // Amounts may carry thousands separators (e.g. "5,101.90")
    const amount = parseFloat(sourceAmount.replace(/,/g, ''));
    if (isNaN(amount) || amount <= 0) return null;
    if (payCurrency === receiveCurrency)
      return { rate: 1, midRate: 1, feeRate: 1, feePoints: 0, feePercent: 0, equation: null, destCommission: 0, destCommissionType: 'PERCENTAGE' as const, computedPay: amount, computedReceive: amount };

    // All rates are BASE/QUOTE (how many QUOTE per 1 BASE).
    // Single-rate model: each pair has one rate (the mid) from the backend.
    const BASE_UNIT: Pick<SpreadRow, 'mid' | 'spreadFixed'> = { mid: 1, spreadFixed: 0 };
    const payPricing = payCurrency === baseCurrency ? BASE_UNIT : pricingMap.get(payCurrency);
    const recvPricing = receiveCurrency === baseCurrency ? BASE_UNIT : pricingMap.get(receiveCurrency);
    if (!payPricing || !recvPricing) return null;

    // The pair's rate in pay → receive orientation. Each leg's spread is a
    // discount to the customer: they pay the pay leg, receive the receive leg.
    const crossMid = recvPricing.mid / payPricing.mid;
    const crossAdj =
      (recvPricing.mid + (recvPricing.spreadFixed || 0)) /
      (payPricing.mid - (payPricing.spreadFixed || 0));

    // The customer's fee — % against the customer, their points as a spread
    // discount — in the orientation the fee was stored (mirrors the backend)
    const feeOffset = (mid: number) =>
      pairFee ? (mid * pairFee.percent) / 100 - pairFee.points * FEE_POINT_VALUE : 0;
    let feeRate: number;
    // TEMP: equation breakdown shown on the dashboard — remove when done debugging
    // `perPay` = the rate is quoted as receive-per-pay, so amount out = pay × rate
    let equation: { unit: string; perPay: boolean; terms: { label: string; value: number }[]; result: number };
    if (pairFee && pairFee.base === receiveCurrency) {
      feeRate = 1 / (1 / crossAdj + feeOffset(1 / crossMid));
      // Fee stored on the flipped pair — the linear equation lives in that orientation
      const invMid = 1 / crossMid;
      equation = {
        unit: `${payCurrency} per ${receiveCurrency}`,
        perPay: false,
        terms: [
          { label: 'market rate', value: invMid },
          { label: 'pair spread', value: 1 / crossAdj - invMid },
          { label: `fee ${pairFee.percent}%`, value: (invMid * pairFee.percent) / 100 },
          { label: `customer spread (${pairFee.points}pt)`, value: -pairFee.points * FEE_POINT_VALUE },
        ],
        result: 1 / feeRate,
      };
    } else {
      feeRate = crossAdj - feeOffset(crossMid);
      equation = {
        unit: `${receiveCurrency} per ${payCurrency}`,
        perPay: true,
        terms: [
          { label: 'market rate', value: crossMid },
          { label: 'pair spread', value: crossAdj - crossMid },
          { label: `fee ${pairFee?.percent ?? 0}%`, value: -(crossMid * (pairFee?.percent ?? 0)) / 100 },
          { label: `customer spread (${pairFee?.points ?? 0}pt)`, value: (pairFee?.points ?? 0) * FEE_POINT_VALUE },
        ],
        result: feeRate,
      };
    }

    // Destination commission (4th layer) — flat fee on final amount, not a rate modifier
    const dest = destinations.find((d) => d.id === selectedDestinationId);
    const destFlatFee = (commission: number, type: string) => {
      if (!commission || commission <= 0) return 0;
      if (type === 'FIXED') return commission;
      return 0; // percentage handled separately below
    };
    const destPercentage = dest && dest.commissionType === 'PERCENTAGE' && dest.commission > 0 ? dest.commission : 0;

    let computedPay: number;
    let computedReceive: number;

    if (editDirection === 'pay') {
      computedReceive = amount * feeRate;
      // Apply destination commission as flat fee or percentage on the converted amount
      if (dest) {
        if (destPercentage > 0) {
          computedReceive = computedReceive * (1 - destPercentage / 100);
        } else {
          computedReceive = computedReceive - destFlatFee(dest.commission, dest.commissionType);
        }
      }
      computedReceive = applyRounding(computedReceive, receiveCurrency);
      computedPay = amount;
    } else {
      computedPay = amount / feeRate;
      // Apply destination commission as flat fee or percentage on the converted amount
      if (dest) {
        if (destPercentage > 0) {
          computedPay = computedPay * (1 + destPercentage / 100);
        } else {
          computedPay = computedPay + destFlatFee(dest.commission, dest.commissionType);
        }
      }
      computedPay = applyRounding(computedPay, payCurrency);
      computedReceive = amount;
    }

    const customerRate = computedReceive / computedPay;

    return {
      rate: customerRate,
      midRate: crossMid,
      feeRate,
      feePoints: pairFee?.points ?? 0,
      feePercent: pairFee?.percent ?? 0,
      equation,
      destCommission: dest?.commission ?? 0,
      destCommissionType: dest?.commissionType ?? 'PERCENTAGE',
      computedPay,
      computedReceive,
    };
  }, [payAmount, receiveAmount, editDirection, payCurrency, receiveCurrency, baseCurrency, pricingMap, applyRounding, pairFee, destinations, selectedDestinationId]);

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
    const amt = parseFloat(sourceAmount.replace(/,/g, ''));

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
        destinationId: selectedDestinationId || undefined,
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
    if (!window.confirm('Reset the exchange form? Customer, amounts, and destination will be cleared.')) return;
    setPayCurrency(DEFAULT_PAY_CURRENCY);
    setReceiveCurrency(DEFAULT_RECEIVE_CURRENCY);
    setPayAmount(DEFAULT_PAY);
    setReceiveAmount('');
    setEditDirection('pay');
    setSelectedCustomerId('');
    setSelectedDestinationId('');
    setErrors({});
    // Persist effect will save cleared state so it stays cleared when navigating back
  }, []);

  // ─── Derived display values ───────────────────────────
  const selectedCustomer = customerList.find((c) => c.id === selectedCustomerId);
  const selectedDestination = destinations.find((d) => d.id === selectedDestinationId);

  const destLabel = (d: Destination) =>
    d.commissionType === 'FIXED' ? `${d.commission} raw` : `${d.commission}%`;

  const filteredCustomers = customerList.filter((c) => {
    if (!customerSearch) return true;
    const q = customerSearch.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.customerId.toLowerCase().includes(q);
  });

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_430px] gap-5 items-start">
      {/* ═══ Currency Exchange ═════════════════════════════ */}
      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold text-[15px]">Currency Exchange</h2>
          <span className="chip chip-blue">{ref}</span>
        </div>

        <div className="p-5 space-y-4">
          {/* ─── Customer ─────────────────────────────── */}
          <div>
            <label className="table-header block mb-2">
              Customer <span className="text-status-red">*</span>
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setCustomerDropdownOpen((v) => !v);
                  setCustomerSearch('');
                  setTimeout(() => customerSearchRef.current?.focus(), 0);
                }}
                className={cn('select-trigger', errors.customer && 'border-status-red')}
              >
                <span className="flex items-center gap-2 min-w-0">
                  {selectedCustomer ? (
                    <>
                      <Stars level={selectedCustomer.level} />
                      <span className="text-text-primary font-medium truncate">
                        {selectedCustomer.name}
                      </span>
                      <span className="text-text-muted font-mono text-xs flex-shrink-0">
                        ({selectedCustomer.customerId})
                      </span>
                    </>
                  ) : (
                    <span className="text-text-muted">Select a customer…</span>
                  )}
                </span>
                <ChevronDown
                  className={cn(
                    'w-4 h-4 text-text-muted transition-transform flex-shrink-0',
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
                      {filteredCustomers.map((c) => (
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
                          <span className="text-sm text-text-primary font-medium truncate">
                            {c.name}
                          </span>
                          <Stars level={c.level} />
                          <span className="text-xs text-text-muted font-mono ml-auto flex-shrink-0">
                            {c.customerId}
                          </span>
                        </button>
                      ))}
                      {filteredCustomers.length === 0 && (
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

          {/* ─── Pays / Receives ──────────────────────── */}
          <div className="flex items-start gap-3">
            {/* Customer pays */}
            <div className="flex-1 min-w-0">
              <label className="table-header block mb-2">Customer Pays</label>
              <div className="field-box" data-invalid={Boolean(errors.amount)}>
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
                    'field-input',
                    editDirection === 'pay' ? 'text-text-primary' : 'text-status-green',
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

            {/* Swap */}
            <div className="flex flex-col flex-shrink-0">
              <span aria-hidden className="table-header block mb-2 opacity-0 select-none">
                swap
              </span>
              <div className="h-[54px] flex items-center">
                <button
                  onClick={handleSwap}
                  className="w-10 h-10 rounded-full bg-primary flex items-center justify-center hover:bg-primary-hover transition-colors active:scale-95 shadow-glow-blue"
                  title="Swap currencies"
                >
                  <ArrowLeftRight className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>

            {/* Customer receives */}
            <div className="flex-1 min-w-0">
              <label className="table-header block mb-2">Customer Receives</label>
              <div className="field-box">
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
                    'field-input',
                    editDirection === 'receive' ? 'text-text-primary' : 'text-status-green',
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

          {/* ─── Destination ──────────────────────────── */}
          {destinations.length > 0 && (
            <div className="relative">
              <label className="table-header block mb-2">
                Destination{' '}
                <span className="normal-case tracking-normal text-text-muted">(optional)</span>
              </label>
              <button
                type="button"
                onClick={() => setDestDropdownOpen(!destDropdownOpen)}
                className="select-trigger"
              >
                <span
                  className={cn(
                    'truncate',
                    selectedDestination ? 'text-text-primary font-medium' : 'text-text-muted',
                  )}
                >
                  {selectedDestination
                    ? `${selectedDestination.name} — ${destLabel(selectedDestination)}`
                    : 'No destination — direct payout'}
                </span>
                <ChevronDown
                  className={cn(
                    'w-4 h-4 text-text-muted transition-transform flex-shrink-0',
                    destDropdownOpen && 'rotate-180',
                  )}
                />
              </button>
              {destDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setDestDropdownOpen(false)} />
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-terminal-card border border-terminal-border rounded-lg shadow-terminal-lg max-h-56 overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDestinationId('');
                        setDestDropdownOpen(false);
                      }}
                      className={cn(
                        'w-full text-left px-4 py-2.5 text-sm hover:bg-terminal-surface transition-colors',
                        !selectedDestinationId
                          ? 'bg-primary/10 text-primary font-semibold'
                          : 'text-text-muted',
                      )}
                    >
                      No destination — direct payout
                    </button>
                    {destinations.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => {
                          setSelectedDestinationId(d.id);
                          setDestDropdownOpen(false);
                        }}
                        className={cn(
                          'w-full text-left px-4 py-2.5 text-sm hover:bg-terminal-surface transition-colors flex items-center justify-between gap-3',
                          selectedDestinationId === d.id
                            ? 'bg-primary/10 text-primary font-semibold'
                            : 'text-text-primary',
                        )}
                      >
                        <span className="truncate">{d.name}</span>
                        <span className="text-text-muted text-xs font-mono flex-shrink-0">
                          {destLabel(d)}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ─── Quote panel ──────────────────────────── */}
          <div className="quote-panel">
            <div className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <span className="table-header">Market rate (mid)</span>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {conversionResult && (conversionResult.feePoints > 0 || conversionResult.feePercent > 0) && (
                    <span className="chip chip-amber">
                      Fee:
                      {conversionResult.feePercent > 0 && ` ${conversionResult.feePercent}%`}
                      {conversionResult.feePoints > 0 && ` − ${conversionResult.feePoints}pt`}
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-1.5 font-mono text-[12.5px] text-text-secondary tabular-nums">
                {conversionResult ? (
                  <>
                    1 {payCurrency} = {fmtRate(conversionResult.midRate, receiveCurrency)}{' '}
                    {receiveCurrency}
                    <span className="inline-block mx-2 w-px h-3 bg-terminal-border align-middle" />1{' '}
                    {receiveCurrency} = {fmtRate(1 / conversionResult.midRate, payCurrency)}{' '}
                    {payCurrency}
                  </>
                ) : (
                  '—'
                )}
              </div>
            </div>

            <div className="quote-row">
              <span className="table-header">Customer rate</span>
              <span className="font-mono text-[15px] font-semibold text-status-green tabular-nums">
                {conversionResult
                  ? `${fmtRate(conversionResult.feeRate, receiveCurrency)} ${receiveCurrency}`
                  : '—'}
              </span>
            </div>

            {/* TEMP: full equation breakdown — remove when done debugging */}
            {conversionResult?.equation && (
              <div className="px-4 py-3 border-t border-dashed border-amber-500/40 bg-amber-500/5">
                <div className="table-header text-amber-500 mb-1.5">Equation</div>
                <div className="font-mono text-[12px] text-text-secondary tabular-nums leading-relaxed">
                  {conversionResult.equation.terms
                    .map((t, i) => {
                      const v = parseFloat(t.value.toFixed(6));
                      const sign = i === 0 ? '' : v < 0 ? ' − ' : ' + ';
                      return `${sign}${Math.abs(v)} (${t.label})`;
                    })
                    .join('')}
                  {' = '}
                  <span className="text-status-green font-semibold">
                    {parseFloat(conversionResult.equation.result.toFixed(6))}
                  </span>{' '}
                  {conversionResult.equation.unit}
                </div>
                {/* Amount step: rate applied to what the customer pays */}
                <div className="font-mono text-[12px] text-text-secondary tabular-nums leading-relaxed mt-1">
                  {parseFloat(conversionResult.computedPay.toFixed(2))} {payCurrency}
                  {conversionResult.equation.perPay ? ' × ' : ' ÷ '}
                  {parseFloat(conversionResult.equation.result.toFixed(6))}
                  {' = '}
                  <span className="text-status-green font-semibold">
                    {parseFloat(conversionResult.computedReceive.toFixed(2))}
                  </span>{' '}
                  {receiveCurrency}
                  {conversionResult.destCommission > 0 && ' (incl. destination fee)'}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ─── Actions ────────────────────────────────── */}
        <div className="card-footer">
          <button
            type="button"
            onClick={handleClear}
            className="btn-outline text-sm font-semibold flex items-center gap-2"
          >
            <Eraser className="w-4 h-4" />
            Reset
          </button>
          <button
            onClick={handleProcess}
            disabled={submitted}
            className={cn(
              'text-sm font-semibold flex items-center gap-2 px-5 py-2.5 rounded-lg transition-all duration-150',
              submitted ? 'bg-status-green text-white cursor-default' : 'btn-primary',
            )}
          >
            <CheckCircle2 className="w-4 h-4" />
            {submitted ? 'Transaction Submitted!' : 'Process Transaction'}
          </button>
        </div>
      </div>

      {/* ═══ Live Exchange Rates ═══════════════════════════ */}
      {pricing.length > 0 && (
        <div className="card overflow-hidden">
          <div className="card-header">
            <h2 className="font-semibold text-[15px]">Live Exchange Rates</h2>
            <span className="flex items-center gap-1.5 text-xxs font-semibold uppercase tracking-wider text-status-green">
              <span className="w-1.5 h-1.5 rounded-full bg-status-green animate-pulse" />
              Live
            </span>
          </div>

          {/* Column headers */}
          <div className="flex items-center justify-between gap-3 px-5 py-2 border-b border-terminal-border bg-terminal-surface">
            <span className="table-header">Pair</span>
            <span className="table-header w-[110px] text-right">Rate</span>
          </div>

          <div className="divide-y divide-terminal-border max-h-[calc(100vh-220px)] overflow-y-auto">
            {pricing.map((row) => (
              <div
                key={row.pair}
                className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-terminal-surface transition-colors"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-text-primary text-[13px]">{row.pair}</div>
                  <div className="text-xxs text-text-muted mt-0.5 truncate">{row.quoteName}</div>
                </div>
                <span className="w-[110px] text-right font-mono text-[12px] tabular-nums text-status-green flex-shrink-0">
                  {formatRate(row.mid)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Currency Dropdown ──────────────────────────────────────
function CurrencyDropdown({
  value,
  onChange,
  open,
  setOpen,
  currencies,
  colorMap,
}: {
  value: string;
  onChange: (code: string) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
  currencies: Currency[];
  colorMap: Record<string, string>;
}) {
  return (
    <div className="relative flex-shrink-0 pr-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="bg-terminal-surface-2 border border-terminal-border rounded-md pl-1.5 pr-2 py-1.5 flex items-center gap-1.5 hover:bg-terminal-surface transition-colors"
      >
        <span
          className={cn(
            'w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold',
            colorMap[value] ?? 'bg-gray-600',
          )}
        >
          {value.slice(0, 2)}
        </span>
        <span className="font-semibold text-text-primary text-[13px]">{value}</span>
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
