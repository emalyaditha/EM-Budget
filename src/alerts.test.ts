import { describe, it, expect } from 'vitest';
import { computeAlerts, daysRemaining, BUDGET_WARN_AT } from './lib/alerts';
import { DEFAULT_APP_STATE } from './initialData';
import { AppState } from './types';

// Fixed reference "today" (local midnight) so the engine is deterministic.
const TODAY_MS = new Date(2026, 8, 3).getTime(); // 2026-09-03 00:00 local

function baseState(): AppState {
  return structuredClone(DEFAULT_APP_STATE);
}

function isoWithOffset(days: number): string {
  const d = new Date(TODAY_MS + days * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('computeAlerts', () => {
  it('returns no alerts for an empty, healthy ledger', () => {
    expect(computeAlerts(baseState(), TODAY_MS)).toEqual([]);
  });

  it('raises a critical alert when a budget limit is fully spent', () => {
    const state = baseState();
    state.budgets = [{ id: 'b1', category: 'Food', limit: 100, spent: 120, icon: '', subBreakdown: [] }];
    const alerts = computeAlerts(state, TODAY_MS);
    expect(alerts.some((a) => a.type === 'budget' && a.severity === 'critical' && a.title.includes('Food'))).toBe(true);
  });

  it('raises a warning when a budget crosses the warn threshold', () => {
    const state = baseState();
    state.budgets = [{ id: 'b1', category: 'Shopping', limit: 200, spent: 200 * BUDGET_WARN_AT, icon: '', subBreakdown: [] }];
    const alerts = computeAlerts(state, TODAY_MS);
    expect(alerts.some((a) => a.type === 'budget' && a.severity === 'warning')).toBe(true);
  });

  it('does not alert for budgets comfortably under the threshold', () => {
    const state = baseState();
    state.budgets = [{ id: 'b1', category: 'Transport', limit: 300, spent: 30, icon: '', subBreakdown: [] }];
    expect(computeAlerts(state, TODAY_MS)).toEqual([]);
  });

  it('flags an active subscription due today as critical', () => {
    const state = baseState();
    state.subscriptions = [{
      id: 's1', name: 'Netflix', amount: 15, billingCycle: 'Monthly',
      dueDate: isoWithOffset(0), category: 'Entertainment', status: 'Active',
    }];
    const alerts = computeAlerts(state, TODAY_MS);
    expect(alerts.some((a) => a.type === 'bill' && a.severity === 'critical' && a.title.includes('today'))).toBe(true);
  });

  it('flags an active subscription due within the soon-window as a warning', () => {
    const state = baseState();
    state.subscriptions = [{
      id: 's1', name: 'Fitness Gym', amount: 40, billingCycle: 'Monthly',
      dueDate: isoWithOffset(2), category: 'Other', status: 'Active',
    }];
    const alerts = computeAlerts(state, TODAY_MS);
    expect(alerts.some((a) => a.type === 'bill' && a.severity === 'warning' && a.title.includes('2 days'))).toBe(true);
  });

  it('ignores paused or cancelled subscriptions', () => {
    const state = baseState();
    state.subscriptions = [{
      id: 's1', name: 'Old Plan', amount: 9, billingCycle: 'Monthly',
      dueDate: isoWithOffset(0), category: 'Other', status: 'Cancelled',
    }];
    expect(computeAlerts(state, TODAY_MS)).toEqual([]);
  });

  it('flags an outstanding debt as it comes due', () => {
    const state = baseState();
    state.debts = [{
      id: 'd1', debtSource: 'Bank Loan', totalAmount: 5000, remainingAmount: 1200,
      dueDate: isoWithOffset(1), notes: '', payments: [],
    }];
    const alerts = computeAlerts(state, TODAY_MS);
    expect(alerts.some((a) => a.type === 'debt' && a.title.includes('Bank Loan'))).toBe(true);
  });

  it('skips debt alerts for fully repaid debts', () => {
    const state = baseState();
    state.debts = [{
      id: 'd1', debtSource: 'Old Debt', totalAmount: 100, remainingAmount: 0,
      dueDate: isoWithOffset(0), notes: '', payments: [], status: 'Fully Repaid',
    }];
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