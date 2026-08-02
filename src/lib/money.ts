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
  if (cents === null || cents === undefined || isNaN(cents)) return "0.00";
  return (cents / 100).toFixed(2);
}

/**
 * Converts an amount in minor units (integer cents) back to major units as a float.
 */
export function fromMinorUnits(cents: number | null | undefined): number {
  if (cents === null || cents === undefined || isNaN(cents)) return 0;
  return cents / 100;
}

/**
 * Adds two amounts in major units without floating-point drift.
 */
export function addMoney(a: number, b: number): number {
  return (toMinorUnits(a) + toMinorUnits(b)) / 100;
}

/**
 * Subtracts `b` from `a` in major units without floating-point drift.
 */
export function subtractMoney(a: number, b: number): number {
  return (toMinorUnits(a) - toMinorUnits(b)) / 100;
}

/**
 * Multiplies an amount in major units by a multiplier without floating-point drift.
 */
export function multiplyMoney(a: number, b: number): number {
  return (toMinorUnits(a) * toMinorUnits(b)) / 10000;
}

/**
 * Compares two amounts in major units, returning negative, zero, or positive.
 */
export function compareMoney(a: number, b: number): number {
  return toMinorUnits(a) - toMinorUnits(b);
}

/**
 * Sums an array of amounts in major units without floating-point drift.
 */
export function sumMoney(values: number[]): number {
  const totalCents = values.reduce((acc, value) => acc + toMinorUnits(value), 0);
  return totalCents / 100;
}
