/**
 * Credit-card cycle rollover helpers.
 *
 * Implements the Sampath official minimum-payment rule:
 *   - 5% of the Total Outstanding, or
 *   - 5% of the Credit Limit PLUS the amount by which the Outstanding
 *     exceeds the Credit Limit, when the Outstanding is over the limit,
 * with a standing-order floor of Rs. 250.
 */
import { BankCard, Transaction } from '../types';
import { addMoney, sumMoney } from './money';

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Number of days in a given month (1-12), leap-year aware.
 */
export function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 2:
      return isLeapYear(year) ? 29 : 28;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    default:
      return 31;
  }
}

function parseDateParts(dateStr: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '');
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Advances a YYYY-MM-DD date by exactly one calendar month.
 *
 * Month-end dates are clamped to the last day of the target month
 * (e.g. 2026-01-31 -> 2026-02-28, 2028-01-31 -> 2028-02-29, 2026-08-31 -> 2026-09-30).
 * Built on pure arithmetic so it never suffers from Date/setMonth overflow.
 */
export function advanceDueDate(dueDate: string): string {
  const parts = parseDateParts(dueDate);
  if (!parts) return dueDate;
  const { year, month, day } = parts;

  let targetYear = year;
  let targetMonth = month + 1;
  if (targetMonth > 12) {
    targetYear += 1;
    targetMonth = 1;
  }

  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  return formatDate(targetYear, targetMonth, targetDay);
}

/**
 * Shifts a YYYY-MM-DD date back by exactly one calendar month (same clamping
 * rules as advanceDueDate). Used to anchor the billing window for a due date.
 */
export function cycleWindowStart(dueDate: string): string {
  const parts = parseDateParts(dueDate);
  if (!parts) return dueDate;
  const { year, month, day } = parts;

  let targetYear = year;
  let targetMonth = month - 1;
  if (targetMonth < 1) {
    targetYear -= 1;
    targetMonth = 12;
  }

  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  return formatDate(targetYear, targetMonth, targetDay);
}

/**
 * Computes the minimum payment due per the Sampath official rule.
 *
 * - Positive/zero balance (no debt) -> 0.
 * - Under the credit limit -> 5% of the outstanding balance.
 * - Over the credit limit -> 5% of the credit limit plus the excess.
 * - Always at least Rs. 250, rounded to 2 decimal places.
 */
export function computeMinimumPayment(balance: number, limit?: number): number {
  if (balance >= 0) return 0;
  const abs = Math.abs(balance);

  let raw: number;
  if (limit && limit > 0 && abs > limit) {
    raw = 0.05 * limit + (abs - limit);
  } else {
    raw = 0.05 * abs;
  }

  const rounded = Math.round(raw * 100) / 100;
  return Math.max(rounded, 250);
}

/**
 * Sums all debt_payment transactions made TO a card within the billing window
 * that precedes the given due date: [cycleWindowStart(dueDate), dueDate).
 *
 * Matches on targetAccountId/targetAccountType rather than title so the window
 * is robust to card renames.
 */
export function paymentsInCycle(transactions: Transaction[], cardId: string, dueDate: string): number {
  if (!dueDate) return 0;
  const windowStart = cycleWindowStart(dueDate);

  return sumMoney(
    (transactions || [])
      .filter(t =>
        t.type === 'debt_payment' &&
        t.targetAccountId === cardId &&
        t.targetAccountType === 'card' &&
        t.date >= windowStart &&
        t.date < dueDate
      )
      .map(t => t.amount)
  );
}

/**
 * Decides what happens to a card's billing cycle when a payment of `amount`
 * is recorded against it:
 *
 * - No due date configured       -> no change ({}).
 * - Balance fully settled        -> clear both dueDate and minPayment.
 * - Cumulative cycle payments (previous in-window payments + this one) reach
 *   the configured minimum AND minPayment > 0
 *                                 -> roll the due date forward one month and
 *                                    recompute the next minimum.
 * - Otherwise                    -> no change ({}).
 *
 * Always returns both keys or neither, so spread into a card never half-updates.
 */
export function maybeRollCard(
  card: BankCard,
  transactions: Transaction[],
  amount: number
): { dueDate?: string; minPayment?: number } {
  if (!card.dueDate) return {};

  const newBalance = addMoney(card.currentBalance, amount);
  if (newBalance >= 0) {
    return { dueDate: undefined, minPayment: undefined };
  }

  const cumulativeCyclePayments = addMoney(paymentsInCycle(transactions, card.id, card.dueDate), amount);
  if (card.minPayment && card.minPayment > 0 && cumulativeCyclePayments >= card.minPayment) {
    return {
      dueDate: advanceDueDate(card.dueDate),
      minPayment: computeMinimumPayment(newBalance, card.limit)
    };
  }

  return {};
}