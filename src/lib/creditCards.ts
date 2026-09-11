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
import { addMoney, subtractMoney, sumMoney } from './money';

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
 * The day of the month on which the bank deducts the credit-card payment.
 * The 15th is the authoritative payment/deduction date — NOT the 7th, the 8th,
 * or any other day.
 */
export const DEDUCTION_DAY = 15;

/**
 * Returns the authoritative deduction date for a card's billing cycle: the
 * 15th of the month that contains the card's due date.
 *
 * e.g. dueDate "2026-09-07" or "2026-09-15" both yield "2026-09-15".
 * Returns the input unchanged when it is malformed.
 */
export function deductionDate(dueDate: string): string {
  const parts = parseDateParts(dueDate);
  if (!parts) return dueDate;
  return formatDate(parts.year, parts.month, DEDUCTION_DAY);
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
 * Returns the anchor date for a card's billing window. When a card carries a
 * statement close (payment cut-off) date it takes precedence — the cycle opens
 * one calendar month before that cut-off — otherwise the window is anchored on
 * the due date (unchanged previous behaviour). Returns '' when neither date is
 * configured.
 */
export function cycleAnchor(card: { dueDate?: string; statementCloseDate?: string }): string {
  return card.statementCloseDate || card.dueDate || '';
}

/**
 * Sums all debt_payment transactions made TO a card within the billing window
 * that precedes the given anchor date: [cycleWindowStart(anchor), dueDate].
 *
 * When `anchorDate` is provided it is used to derive the window start (useful
 * when a card carries a statement close / cut-off date that differs from the
 * due date). When omitted the window is computed from `dueDate` alone, which is
 * fully backward compatible with prior call-sites.
 *
 * The window is inclusive of the due date — the due date is the last day of
 * the cycle, so payments made on it still count toward that cycle's minimum.
 *
 * Matches on targetAccountId/targetAccountType rather than title so the window
 * is robust to card renames.
 */
export function paymentsInCycle(
  transactions: Transaction[],
  cardId: string,
  dueDate: string,
  anchorDate?: string,
): number {
  if (!dueDate) return 0;
  const anchor = anchorDate || dueDate;
  const windowStart = cycleWindowStart(anchor);

  return sumMoney(
    (transactions || [])
      .filter(t =>
        t.type === 'debt_payment' &&
        t.targetAccountId === cardId &&
        t.targetAccountType === 'card' &&
        t.date >= windowStart &&
        t.date <= dueDate
      )
      .map(t => t.amount)
  );
}

/**
 * True when cumulative payments already made TO the card within the current
 * billing window cover the configured minimum. Used to show a "min paid"
 * indicator in the UI.
 */
export function isMinimumSatisfied(card: BankCard, transactions: Transaction[]): boolean {
  if (!card.dueDate || !card.minPayment || card.minPayment <= 0) return false;
  return paymentsInCycle(transactions, card.id, card.dueDate, cycleAnchor(card)) >= card.minPayment;
}

/**
 * Days between two YYYY-MM-DD dates (start inclusive, end exclusive), computed
 * with pure arithmetic so timezone/date-parsing quirks can't drift the result.
 * Returns 0 when either date is malformed.
 */
export function daysBetween(start: string, end: string): number {
  const a = parseDateParts(start);
  const b = parseDateParts(end);
  if (!a || !b) return 0;
  const startUtc = Date.UTC(a.year, a.month - 1, a.day);
  const endUtc = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((endUtc - startUtc) / 86400000);
}

/**
 * Revolving interest applied to a carried (negative) balance over a billing
 * cycle, per the Sampath daily-balance rule: interest = |balance| * APR/365
 * * number of days, compounded into the balance at cycle end. Rounded to 2
 * decimal places. Returns 0 for credit balances, unset APR, or no elapsed days.
 */
export function interestForCycle(balance: number, aprPercent: number, days: number): number {
  if (balance >= 0 || !(aprPercent > 0) || days <= 0) return 0;
  const raw = Math.abs(balance) * (aprPercent / 100 / 365) * days;
  return Math.round(raw * 100) / 100;
}

/**
 * Late payment fee per the Sampath official tariff: Rs. 1,200 or 5% of the
 * minimum amount due, whichever is higher. Returns 0 when no minimum is set.
 */
export function latePaymentFee(minPayment?: number): number {
  if (!minPayment || minPayment <= 0) return 0;
  return Math.round(Math.max(1200, 0.05 * minPayment) * 100) / 100;
}

/**
 * Decides what happens to a card's billing cycle when a payment of `amount`
 * is recorded against it:
 *
 * - No due date configured -> no change ({}).
 * - Balance fully settled  -> clear both dueDate and minPayment.
 * - Otherwise              -> no change ({}).
 *
 * The cycle itself (advancing the due date, recomputing the minimum, and
 * applying interest / late fees) is settled once, at the end of the cycle,
 * by runCycleRollover — see the note there.
 */
export function maybeRollCard(
  card: BankCard,
  _transactions: Transaction[],
  amount: number
): { dueDate?: string; minPayment?: number } {
  if (!card.dueDate) return {};
  const newBalance = addMoney(card.currentBalance, amount);
  return newBalance >= 0 ? { dueDate: undefined, minPayment: undefined } : {};
}

/** A charge produced by a cycle-end rollover, ready to be persisted as a
 * Charge plus a credit_card_charge transaction. */
export interface CycleChargeDraft {
  type: 'Interest Charge' | 'Late Payment Fee';
  name: string;
  amount: number;
  appliedDate: string;
  description?: string;
}

/** Result of closing out a card's billing cycle on the day after its due date. */
export interface CycleRolloverResult {
  currentBalance: number;
  dueDate?: string;
  minPayment?: number;
  charges: CycleChargeDraft[];
}

/**
 * Closes out a card's billing cycle on the deduction day — the 15th of the
 * month that contains the card's due date (see DEDUCTION_DAY / deductionDate).
 * The 15th is the authoritative payment/deduction date, so no charge is ever
 * recorded before it, and the cycle closes ON the 15th (inclusive):
 *
 * - Interest applies to any carried (revolving) balance at the stored APR,
 *   computed on a daily basis over the cycle's length and added to the balance.
 * - If the minimum wasn't paid during the ended cycle, the Sampath late
 *   payment fee (Rs. 1,200 or 5% of the minimum, whichever is higher) is also
 *   added to the balance.
 * - The charges are returned as CycleChargeDraft entries (the caller persists
 *   them), the due date advances one month, and the minimum is recomputed on
 *   the new balance. The charges carry the deduction date as their appliedDate.
 * - A balance that fully settles from the charges clears dueDate and minPayment.
 *
 * Returns undefined while the cycle is still open (today < the deduction date)
 * or when the card has no due date. Callers must deduplicate by card + deduction
 * date (e.g. a rollover reference key) so the rollover runs exactly once per cycle.
 */
export function runCycleRollover(
  card: BankCard,
  transactions: Transaction[],
  today: string
): CycleRolloverResult | undefined {
  if (!card.dueDate) return undefined;
  const cycleEnd = deductionDate(card.dueDate);
  if (today < cycleEnd) return undefined;

  // The cycle anchor: a card with a statement close (payment cut-off) date
  // opens its billing window one calendar month before that cut-off; without
  // one the window is anchored on the due date (previous behaviour).
  const anchor = cycleAnchor(card) || cycleEnd;

  const outstanding = card.currentBalance < 0 ? Math.abs(card.currentBalance) : 0;
  const cyclePayments = paymentsInCycle(transactions, card.id, cycleEnd, anchor);
  const minOk = !card.minPayment || card.minPayment <= 0 || cyclePayments >= card.minPayment;

  const charges: CycleChargeDraft[] = [];

  const cycleDays = daysBetween(cycleWindowStart(anchor), anchor);
  const interest = interestForCycle(card.currentBalance, card.apr, cycleDays);
  if (outstanding > 0 && interest > 0) {
    charges.push({
      type: 'Interest Charge',
      name: 'Revolving Interest',
      amount: interest,
      appliedDate: cycleEnd,
      description: `${card.apr}% p.a. on the carried balance for the ${cycleEnd} cycle`,
    });
  }

  if (!minOk && outstanding > 0) {
    const fee = latePaymentFee(card.minPayment);
    if (fee > 0) {
      charges.push({
        type: 'Late Payment Fee',
        name: 'Late Payment Fee',
        amount: fee,
        appliedDate: cycleEnd,
        description: `Pays to ${cycleEnd}: minimum of ${card.minPayment.toLocaleString()} not paid`,
      });
    }
  }

  const chargeTotal = sumMoney(charges.map(c => c.amount));
  const newBalance = subtractMoney(card.currentBalance, chargeTotal);

  if (newBalance >= 0) {
    return { currentBalance: newBalance, dueDate: undefined, minPayment: undefined, charges };
  }

  return {
    currentBalance: newBalance,
    dueDate: advanceDueDate(cycleEnd),
    minPayment: computeMinimumPayment(newBalance, card.limit),
    charges,
  };
}