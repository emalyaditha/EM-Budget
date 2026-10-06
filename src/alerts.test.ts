import { describe, it, expect } from 'vitest';
import { computeAlerts, daysRemaining, BUDGET_WARN_AT } from './lib/alerts';
import { DEFAULT_APP_STATE } from './initialData';
import type { AppState } from './types';

// Fixed reference "today" (local midnight) so the engine is deterministic.
const TODAY_MS = new Date(2026, 8, 3).getTime(); // 2026-09-03 00:00 local

function baseState(): AppState {
  return structuredClone(DEFAULT_APP_STATE);
}

function isoWithOffset(days: number): string {
  const d = new Date(TODAY_MS + days * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** A real expense row. Budget usage is derived from the ledger, not from
 *  `budget.spent` — nothing in the app ever wrote that field, so an envelope
 *  created with a non-zero `spent` was still reporting itself as untouched. */
function expense(
  id: string,
  category: string,
  amount: number,
  date = isoWithOffset(0),
): AppState['transactions'][number] {
  return {
    id,
    type: 'expense',
    title: `${category} spend`,
    amount,
    date,
    category,
    accountId: 'cash-1',
    accountType: 'cash',
  };
}

function budget(id: string, category: string, limit: number): AppState['budgets'][number] {
  return {
    id,
    category: category as AppState['budgets'][number]['category'],
    limit,
    spent: 0,
    icon: '',
    subBreakdown: [],
  };
}

describe('computeAlerts', () => {
  it('returns no alerts for an empty, healthy ledger', () => {
    expect(computeAlerts(baseState(), TODAY_MS)).toEqual([]);
  });

  it('raises a critical alert when a budget limit is fully spent', () => {
    const state = baseState();
    state.budgets = [budget('b1', 'Food', 100)];
    state.transactions = [expense('t1', 'Food', 120)];
    const alerts = computeAlerts(state, TODAY_MS);
    expect(alerts.some((a) => a.type === 'budget' && a.severity === 'critical' && a.title.includes('Food'))).toBe(true);
  });

  it('raises a warning when a budget crosses the warn threshold', () => {
    const state = baseState();
    state.budgets = [budget('b1', 'Shopping', 200)];
    state.transactions = [expense('t1', 'Shopping', 200 * BUDGET_WARN_AT)];
    const alerts = computeAlerts(state, TODAY_MS);
    expect(alerts.some((a) => a.type === 'budget' && a.severity === 'warning')).toBe(true);
  });

  it('does not alert for budgets comfortably under the threshold', () => {
    const state = baseState();
    state.budgets = [budget('b1', 'Transport', 300)];
    state.transactions = [expense('t1', 'Transport', 30)];
    expect(computeAlerts(state, TODAY_MS)).toEqual([]);
  });

  it('counts only this month against an envelope, not the whole ledger', () => {
    const state = baseState();
    state.budgets = [budget('b1', 'Food', 100)];
    // 900 of Food from an earlier month, 20 this month: the envelope is at 20%,
    // not at 920%. Summing all history is what made every budget read as blown.
    state.transactions = [expense('t-old', 'Food', 900, '2026-01-15'), expense('t1', 'Food', 20)];
    expect(computeAlerts(state, TODAY_MS)).toEqual([]);
  });

  it('ignores a negative row when working out what an envelope has been charged', () => {
    const state = baseState();
    state.budgets = [budget('b1', 'Transfer Fee', 100)];
    // A transfer's outgoing leg is stored negative and is not spending; taking its
    // absolute value charged the envelope for money that stayed in the household.
    state.transactions = [expense('t-out', 'Transfer Fee', -500)];
    expect(computeAlerts(state, TODAY_MS)).toEqual([]);
  });

  it('flags an active subscription due today as critical', () => {
    const state = baseState();
    state.subscriptions = [
      {
        id: 's1',
        name: 'Netflix',
        amount: 15,
        billingCycle: 'Monthly',
        dueDate: isoWithOffset(0),
        category: 'Entertainment',
        status: 'Active',
      },
    ];
    const alerts = computeAlerts(state, TODAY_MS);
    expect(alerts.some((a) => a.type === 'bill' && a.severity === 'critical' && a.title.includes('today'))).toBe(true);
  });

  it('flags an active subscription due tomorrow as a warning', () => {
    const state = baseState();
    state.subscriptions = [
      {
        id: 's1',
        name: 'Fitness Gym',
        amount: 40,
        billingCycle: 'Monthly',
        dueDate: isoWithOffset(1),
        category: 'Other',
        status: 'Active',
      },
    ];
    const alerts = computeAlerts(state, TODAY_MS);
    expect(alerts.some((a) => a.type === 'bill' && a.severity === 'warning' && a.title.includes('1 day'))).toBe(true);
  });

  // The window is the day before and the day itself — anything further out is
  // still next week's problem and only lengthens the list to dismiss.
  it('stays quiet for a bill that is not due within the next day', () => {
    const state = baseState();
    state.subscriptions = [
      {
        id: 's1',
        name: 'Fitness Gym',
        amount: 40,
        billingCycle: 'Monthly',
        dueDate: isoWithOffset(2),
        category: 'Other',
        status: 'Active',
      },
    ];
    expect(computeAlerts(state, TODAY_MS)).toEqual([]);
  });

  it('ignores paused or cancelled subscriptions', () => {
    const state = baseState();
    state.subscriptions = [
      {
        id: 's1',
        name: 'Old Plan',
        amount: 9,
        billingCycle: 'Monthly',
        dueDate: isoWithOffset(0),
        category: 'Other',
        status: 'Cancelled',
      },
    ];
    expect(computeAlerts(state, TODAY_MS)).toEqual([]);
  });

  it('flags an outstanding debt as it comes due', () => {
    const state = baseState();
    state.debts = [
      {
        id: 'd1',
        debtSource: 'Bank Loan',
        totalAmount: 5000,
        remainingAmount: 1200,
        dueDate: isoWithOffset(1),
        notes: '',
        payments: [],
      },
    ];
    const alerts = computeAlerts(state, TODAY_MS);
    expect(alerts.some((a) => a.type === 'debt' && a.title.includes('Bank Loan'))).toBe(true);
  });

  it('skips debt alerts for fully repaid debts', () => {
    const state = baseState();
    state.debts = [
      {
        id: 'd1',
        debtSource: 'Old Debt',
        totalAmount: 100,
        remainingAmount: 0,
        dueDate: isoWithOffset(0),
        notes: '',
        payments: [],
        status: 'Fully Repaid',
      },
    ];
    expect(computeAlerts(state, TODAY_MS)).toEqual([]);
  });

  it('does not produce alerts when no debts/subscriptions/budgets exist', () => {
    const state = baseState();
    state.debts = [];
    state.subscriptions = [];
    state.budgets = [];
    expect(computeAlerts(state, TODAY_MS)).toEqual([]);
  });
});

describe('daysRemaining', () => {
  it('calculates a positive future delta', () => {
    expect(daysRemaining(isoWithOffset(3), TODAY_MS)).toBe(3);
  });

  it('returns 0 for today', () => {
    expect(daysRemaining(isoWithOffset(0), TODAY_MS)).toBe(0);
  });
});
