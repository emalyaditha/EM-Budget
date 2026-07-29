/** Money helpers — store/compare in integer minor units (cents) to avoid float drift. */
const SCALE = 100;

export function toMinorUnits(amount: number): number {
  return Math.round(amount * SCALE);
}

export function fromMinorUnits(minor: number): number {
  return minor / SCALE;
}

export function addMoney(a: number, b: number): number {
  return fromMinorUnits(toMinorUnits(a) + toMinorUnits(b));
}

export function subtractMoney(a: number, b: number): number {
  return fromMinorUnits(toMinorUnits(a) - toMinorUnits(b));
}

export function multiplyMoney(amount: number, factor: number): number {
  return fromMinorUnits(Math.round(toMinorUnits(amount) * factor));
}

export function compareMoney(a: number, b: number): number {
  return toMinorUnits(a) - toMinorUnits(b);
}

export function sumMoney(amounts: number[]): number {
  return fromMinorUnits(amounts.reduce((sum, n) => sum + toMinorUnits(n), 0));
}
