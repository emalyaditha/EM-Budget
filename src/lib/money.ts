/**
 * Safely converts an amount in major units (e.g., dollars/euros as a float/string/number)
 * to minor units (cents) as an integer to prevent floating-point precision errors.
 */
export function toMinorUnits(amount: number | string | null | undefined): number {
  if (amount === null || amount === undefined) return 0;
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return 0;
  // Multiply by 100 and round to nearest integer to resolve precision issues (e.g. 19.99 * 100 = 1998.9999999999998)
  return Math.round(num * 100);
}

/**
 * Safely converts an amount in minor units (cents as integer)
 * to a standard decimal string representation in major units (e.g. "19.99" or "0.00").
 */
export function toMajorUnits(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || isNaN(cents)) return '0.00';
  return (cents / 100).toFixed(2);
}

export function addMoney(a: number, b: number): number {
  return (toMinorUnits(a) + toMinorUnits(b)) / 100;
}

export function subtractMoney(a: number, b: number): number {
  return (toMinorUnits(a) - toMinorUnits(b)) / 100;
}

export function sumMoney(amounts: number[]): number {
  const totalCents = amounts.reduce((acc, val) => acc + toMinorUnits(val), 0);
  return totalCents / 100;
}

export function compareMoney(a: number, b: number): number {
  return toMinorUnits(a) - toMinorUnits(b);
}

export function multiplyMoney(amount: number, factor: number): number {
  return Math.round(toMinorUnits(amount) * factor) / 100;
}

export interface FormatMoneyOptions {
  /** Minimum decimal places shown (default 0). */
  minFractionDigits?: number;
  /** Maximum decimal places shown (default 2). Use 0 for rounded display. */
  maxFractionDigits?: number;
  /** Render a leading '-' for negative values. Off by default: the app conveys
   *  direction with red/green coloring, never with sign characters. */
  signed?: boolean;
}

/**
 * Single source of truth for rendering a money value: "Rs.1,234.50".
 * Always strips the sign from the number itself (unless `signed`) so amounts
 * never render as "Rs.-500"; direction belongs to the surrounding color.
 */
export function formatMoney(currency: string, amount: number, options: FormatMoneyOptions = {}): string {
  const { minFractionDigits = 0, maxFractionDigits = 2, signed = false } = options;
  const safe = Number.isFinite(amount) ? amount : 0;
  const digits = Math.min(minFractionDigits, maxFractionDigits);
  const body = Math.abs(safe).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: maxFractionDigits,
  });
  return `${signed && safe < 0 ? '-' : ''}${currency}${body}`;
}
