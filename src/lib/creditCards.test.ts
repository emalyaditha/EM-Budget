import { describe, it, expect } from 'vitest';
import {
  advanceDueDate,
  cycleWindowStart,
  computeMinimumPayment,
  paymentsInCycle,
  maybeRollCard,
  isMinimumSatisfied,
} from './creditCards';
import { BankCard, Transaction } from '../types';

function makeTx(overrides: Partial<Transaction>): Transaction {
  return {
    id: 'trans-1',
    type: 'debt_payment',
    title: 'Credit Card Settlement: Sampath Visa',
    amount: 0,
    date: '2026-08-20',
    category: 'Debt Repayment',
    accountId: 'cash-1',
    accountType: 'cash',
    targetAccountId: 'card-1',
    targetAccountType: 'card',
    ...overrides,
  };
}

function makeCard(overrides: Partial<BankCard> = {}): BankCard {
  return {
    id: 'card-1',
    cardName: 'Sampath Visa',
    bankName: 'Sampath Bank',
    cardType: 'Credit',
    currentBalance: -52751.87,
    limit: 50000,
    dueDate: '2026-09-07',
    minPayment: 6190.62,
    apr: 24,
    ...overrides,
  };
}

describe('advanceDueDate', () => {
  it('advances a normal date by one month', () => {
    expect(advanceDueDate('2026-09-07')).toBe('2026-10-07');
  });

  it('clamps Jan 31 to Feb 28 (non-leap)', () => {
    expect(advanceDueDate('2026-01-31')).toBe('2026-02-28');
  });

  it('clamps Jan 31 to Feb 29 (leap year)', () => {
    expect(advanceDueDate('2028-01-31')).toBe('2028-02-29');
  });

  it('clamps Mar 31 to Apr 30', () => {
    expect(advanceDueDate('2026-03-31')).toBe('2026-04-30');
  });

  it('clamps Aug 31 to Sep 30', () => {
    expect(advanceDueDate('2026-08-31')).toBe('2026-09-30');
  });

  it('wraps Dec 31 into January of the next year', () => {
    expect(advanceDueDate('2026-12-31')).toBe('2027-01-31');
  });

  it('returns the input unchanged when the date is invalid', () => {
    expect(advanceDueDate('')).toBe('');
    expect(advanceDueDate('not-a-date')).toBe('not-a-date');
  });
});

describe('cycleWindowStart', () => {
  it('shifts back exactly one month', () => {
    expect(cycleWindowStart('2026-09-07')).toBe('2026-08-07');
  });

  it('clamps month-end targets', () => {
    expect(cycleWindowStart('2026-03-31')).toBe('2026-02-28');
  });

  it('wraps into the previous year', () => {
    expect(cycleWindowStart('2026-01-15')).toBe('2025-12-15');
  });
});

describe('computeMinimumPayment', () => {
  it('computes 5% of the balance under the limit', () => {
    expect(computeMinimumPayment(-20000, 50000)).toBe(1000);
  });

  it('computes 5% of limit plus the excess when over the limit', () => {
    expect(computeMinimumPayment(-52751.87, 50000)).toBe(5251.87);
  });

  it('applies the 5% rule when the balance equals the limit', () => {
    expect(computeMinimumPayment(-50000, 50000)).toBe(2500);
  });

  it('floors the result at 250', () => {
    expect(computeMinimumPayment(-1500)).toBe(250);
    expect(computeMinimumPayment(-1500, 50000)).toBe(250);
  });

  it('keeps values above the floor', () => {
    expect(computeMinimumPayment(-8400)).toBe(420);
  });

  it('rounds to 2 decimal places', () => {
    expect(computeMinimumPayment(-6666.66)).toBe(333.33);
  });

  it('returns 0 for a positive (credit) balance', () => {
    expect(computeMinimumPayment(5000)).toBe(0);
    expect(computeMinimumPayment(0, 50000)).toBe(0);
  });

  it('works without a configured limit', () => {
    expect(computeMinimumPayment(-20000)).toBe(1000);
  });
});

describe('paymentsInCycle', () => {
  it('sums debt_payment transactions to the card within the window', () => {
    const txs: Transaction[] = [
      makeTx({ amount: 3000, date: '2026-08-20' }),
      makeTx({ amount: 1000.5, date: '2026-08-25' }),
    ];
    expect(paymentsInCycle(txs, 'card-1', '2026-09-07')).toBe(4000.5);
  });

  it('ignores payments dated before the window start', () => {
    const txs: Transaction[] = [makeTx({ amount: 3000, date: '2026-07-01' })];
    expect(paymentsInCycle(txs, 'card-1', '2026-09-07')).toBe(0);
  });

  it('includes payments dated exactly on the window start', () => {
    const txs: Transaction[] = [makeTx({ amount: 3000, date: '2026-08-07' })];
    expect(paymentsInCycle(txs, 'card-1', '2026-09-07')).toBe(3000);
  });

  it('ignores payments on or after the due date', () => {
    const txs: Transaction[] = [makeTx({ amount: 3000, date: '2026-09-07' })];
    expect(paymentsInCycle(txs, 'card-1', '2026-09-07')).toBe(0);
  });

  it('ignores payments to other cards and non-debt_payment types', () => {
    const txs: Transaction[] = [
      makeTx({ amount: 3000, targetAccountId: 'card-other' }),
      makeTx({ amount: 5000, type: 'expense' }),
    ];
    expect(paymentsInCycle(txs, 'card-1', '2026-09-07')).toBe(0);
  });

  it('returns 0 when no due date is given', () => {
    expect(paymentsInCycle([makeTx({ amount: 3000 })], 'card-1', '')).toBe(0);
  });
});

describe('maybeRollCard', () => {
  it('does not roll on a partial payment below the minimum', () => {
    const card = makeCard();
    expect(maybeRollCard(card, [], 3000)).toEqual({});
  });

  it('rolls when payments in the cycle reach the minimum exactly', () => {
    const card = makeCard();
    const earlier = makeTx({ amount: 3000, date: '2026-08-20' });
    const result = maybeRollCard(card, [earlier], 3190.62);
    expect(result).toEqual({
      dueDate: '2026-10-07',
      minPayment: 2478.06,
    });
  });

  it('rolls when a single payment covers the minimum', () => {
    const card = makeCard({ currentBalance: -10000, minPayment: 5000 });
    const result = maybeRollCard(card, [], 5000);
    expect(result).toEqual({
      dueDate: '2026-10-07',
      minPayment: 250,
    });
  });

  it('clears due date and minimum when the card is fully settled', () => {
    const card = makeCard({ currentBalance: -3000, minPayment: 5000 });
    expect(maybeRollCard(card, [], 5000)).toEqual({
      dueDate: undefined,
      minPayment: undefined,
    });
  });

  it('clears due date and minimum on an exact payoff', () => {
    const card = makeCard({ currentBalance: -6190.62 });
    expect(maybeRollCard(card, [], 6190.62)).toEqual({
      dueDate: undefined,
      minPayment: undefined,
    });
  });

  it('does nothing when the card has no due date', () => {
    const card = makeCard({ dueDate: undefined });
    expect(maybeRollCard(card, [], 6190.62)).toEqual({});
  });

  it('does not count payments outside the billing window', () => {
    const card = makeCard();
    const stale = makeTx({ amount: 3000, date: '2026-07-01' });
    expect(maybeRollCard(card, [stale], 3000)).toEqual({});
  });

  it('counts payments dated exactly on the window start', () => {
    const card = makeCard();
    const boundary = makeTx({ amount: 3000, date: '2026-08-07' });
    expect(maybeRollCard(card, [boundary], 3190.62)).toEqual({
      dueDate: '2026-10-07',
      minPayment: 2478.06,
    });
  });

  it('does not roll when minPayment is not configured', () => {
    const card = makeCard({ minPayment: undefined, currentBalance: -20000 });
    expect(maybeRollCard(card, [], 1000)).toEqual({});
  });

  it('balances paid from another card still roll the target card', () => {
    const card = makeCard();
    const result = maybeRollCard(card, [], 6190.62);
    expect(result.dueDate).toBe('2026-10-07');
    expect(result.minPayment).toBe(2328.06);
  });
});

describe('isMinimumSatisfied', () => {
  it('is false when the card has no due date', () => {
    const card = makeCard({ dueDate: undefined });
    expect(isMinimumSatisfied(card, [makeTx({ amount: 10000 })])).toBe(false);
  });

  it('is false when no minimum is configured', () => {
    const card = makeCard({ minPayment: undefined });
    expect(isMinimumSatisfied(card, [makeTx({ amount: 999999 })])).toBe(false);
  });

  it('is false when payments in the window are below the minimum', () => {
    const card = makeCard();
    expect(isMinimumSatisfied(card, [makeTx({ amount: 1000 })])).toBe(false);
  });

  it('is true when cumulative in-window payments reach the minimum exactly', () => {
    const card = makeCard();
    const inWindow = makeTx({ amount: 6190.62, date: '2026-08-20' });
    expect(isMinimumSatisfied(card, [inWindow])).toBe(true);
  });

  it('is true when cumulative in-window payments exceed the minimum', () => {
    const card = makeCard();
    const t1 = makeTx({ amount: 3000, date: '2026-08-15' });
    const t2 = makeTx({ amount: 3190.62, date: '2026-09-01' });
    expect(isMinimumSatisfied(card, [t1, t2])).toBe(true);
  });

  it('excludes payments outside the billing window', () => {
    const card = makeCard();
    const stale = makeTx({ amount: 6190.62, date: '2026-07-01' });
    expect(isMinimumSatisfied(card, [stale])).toBe(false);
  });
});