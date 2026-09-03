import { AppState } from '../types';

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface FinanceAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  type: 'budget' | 'bill' | 'debt' | 'goal';
}

// Budget usage thresholds (fraction of the limit spent) mapped to severities.
export const BUDGET_WARN_AT = 0.8; // 80% spent -> warning
export const BUDGET_CRITICAL_AT = 1.0; // 100%+ spent -> critical

// How many days ahead a due date should raise a "coming due" alert.
export const DUE_SOON_DAYS = 3;

function parseDay(iso: string): number {
  // Parse a calendar date ("YYYY-MM-DD") at LOCAL midnight so it aligns with
  // the local-midnight reference day. Using Date.parse interprets the string
  // as UTC, which off-by-ones the delta for non-UTC timezones.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (m) {
    const ms = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
    return isNaN(ms) ? -1 : ms;
  }
  const t = Date.parse(iso);
  return isNaN(t) ? -1 : t;
}

function daysUntil(dateStr: string, todayMs: number): number {
  const t = parseDay(dateStr);
  if (t < 0) return Infinity;
  return Math.ceil((t - todayMs) / 86400000);
}

function formatMoney(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

/**
 * Pure, deterministic alert engine. Given the app state and a reference day
 * (local midnight ms), returns a list of actionable financial alerts.
 */
export function computeAlerts(state: AppState, todayMs: number = Date.now()): FinanceAlert[] {
  const alerts: FinanceAlert[] = [];
  const currency = state.currency || 'Rs.';

  // 1. Budget alerts
  for (const b of state.budgets || []) {
    if (b.limit <= 0) continue;
    const pct = b.spent / b.limit;
    if (pct >= BUDGET_CRITICAL_AT) {
      alerts.push({
        id: `budget-over-${b.id}`,
        severity: 'critical',
        title: `${b.category} budget exceeded`,
        detail: `Spent ${formatMoney(b.spent, currency)} of ${formatMoney(b.limit, currency)} (${Math.round(pct * 100)}%).`,
        type: 'budget',
      });
    } else if (pct >= BUDGET_WARN_AT) {
      alerts.push({
        id: `budget-close-${b.id}`,
        severity: 'warning',
        title: `${b.category} budget almost reached`,
        detail: `Spent ${formatMoney(b.spent, currency)} of ${formatMoney(b.limit, currency)} (${Math.round(pct * 100)}%).`,
        type: 'budget',
      });
    }
  }

  // 2. Recurring bill / subscription due soon
  for (const s of state.subscriptions || []) {
    if (s.status !== 'Active' || !s.dueDate) continue;
    const d = daysUntil(s.dueDate, todayMs);
    if (d >= 0 && d <= DUE_SOON_DAYS) {
      alerts.push({
        id: `bill-due-${s.id}`,
        severity: d === 0 ? 'critical' : 'warning',
        title: `${s.name} due ${d === 0 ? 'today' : `in ${d} day${d === 1 ? '' : 's'}`}`,
        detail: `${formatMoney(s.amount, currency)} (${s.billingCycle}).`,
        type: 'bill',
      });
    }
  }

  // 3. Debt due soon / overdue
  for (const dt of state.debts || []) {
    if (dt.status === 'Fully Repaid' || !dt.dueDate) continue;
    const d = daysUntil(dt.dueDate, todayMs);
    if (d >= 0 && d <= DUE_SOON_DAYS && dt.remainingAmount > 0) {
      alerts.push({
        id: `debt-due-${dt.id}`,
        severity: d === 0 ? 'critical' : 'warning',
        title: `Debt from ${dt.debtSource} due ${d === 0 ? 'today' : `in ${d} day${d === 1 ? '' : 's'}`}`,
        detail: `${formatMoney(dt.remainingAmount, currency)} remaining.`,
        type: 'debt',
      });
    }
  }

  // 4. Savings goal behind schedule (if it has a target date)
  for (const g of state.savingsGoals || []) {
    if (!g.targetDate || g.target <= 0 || g.current >= g.target) continue;
    const d = daysUntil(g.targetDate, todayMs);
    if (d < 0) continue; // already at/past date; not treated as a due-soon alert
    if (d <= 7) {
      alerts.push({
        id: `goal-soon-${g.id}`,
        severity: 'info',
        title: `Goal "${g.name}" closes soon`,
        detail: `${formatMoney(g.current, currency)} saved of ${formatMoney(g.target, currency)} with ${d} day${d === 1 ? '' : 's'} left.`,
        type: 'goal',
      });
    }
  }

  return alerts;
}

// Delta between today's local date and the reference day, exported for tests.
export function daysRemaining(dateStr: string, todayMs: number = Date.now()): number {
  return daysUntil(dateStr, todayMs);
}