import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = 'USD'): string {
  const symbols: Record<string, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
    CHF: 'CHF ',
    CAD: 'C$',
    AUD: 'A$',
  };
  const symbol = symbols[currency] ?? currency + ' ';
  return `${symbol}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

/**
 * Format an exchange rate for display.
 * Adapts decimal places to magnitude: >=1000 → 2dp, >=1 → 4dp, <1 → 6dp.
 * Returns '—' for zero/falsy values.
 */
export function formatRate(n: number): string {
  if (!n) return '—';
  if (n >= 1000)
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1)
    return n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return n.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 });
}

/**
 * Format a monetary amount for display (always 2 decimal places).
 */
export function formatAmount(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}
