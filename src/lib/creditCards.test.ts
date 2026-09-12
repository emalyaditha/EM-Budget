import { describe, it, expect } from 'vitest';
import {
  advanceDueDate,
  cycleAnchor,
  cycleWindowStart,
  computeMinimumPayment,
  paymentsInCycle,
  maybeRollCard,
  isMinimumSatisfied,
  daysBetween,
  interestForCycle,
  latePaymentFee,
  runCycleRollover,
  deductionDate,
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

  it('counts payments dated on the due date itself (last day of the cycle)', () => {
    const txs: Transaction[] = [makeTx({ amount: 3000, date: '2026-09-07' })];
    expect(paymentsInCycle(txs, 'card-1', '2026-09-07')).toBe(3000);
  });

  it('ignores payments dated after the due date', () => {
    const txs: Transaction[] = [makeTx({ amount: 3000, date: '2026-09-08' })];
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
  it('does nothing on a partial payment below the minimum', () => {
    const card = makeCard();
    expect(maybeRollCard(card, [], 3000)).toEqual({});
  });

  it('does not roll the due date at payment time — cycles close at their end', () => {
    const card = makeCard();
    const earlier = makeTx({ amount: 3000, date: '2026-08-20' });
    expect(maybeRollCard(card, [earlier], 3190.62)).toEqual({});
  });

  it('keeps the due date when a payment covers the minimum but leaves a balance', () => {
    const card = makeCard({ currentBalance: -10000, minPayment: 5000 });
    expect(maybeRollCard(card, [], 5000)).toEqual({});
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

  it('clears due date on an overpayment into credit', () => {
    const card = makeCard({ currentBalance: -5000 });
    expect(maybeRollCard(card, [], 6000)).toEqual({
      dueDate: undefined,
      minPayment: undefined,
    });
  });

  it('does nothing when the card has no due date', () => {
    const card = makeCard({ dueDate: undefined });
    expect(maybeRollCard(card, [], 6190.62)).toEqual({});
  });
});

describe('daysBetween', () => {
  it('counts full calendar days between dates', () => {
    expect(daysBetween('2026-08-07', '2026-09-07')).toBe(31);
  });

  it('returns 0 for the same day', () => {
    expect(daysBetween('2026-09-07', '2026-09-07')).toBe(0);
  });

  it('works across a year boundary', () => {
    expect(daysBetween('2026-12-25', '2027-01-01')).toBe(7);
  });

  it('returns 0 when either date is malformed', () => {
    expect(daysBetween('', '2026-09-07')).toBe(0);
    expect(daysBetween('2026-09-07', 'not-a-date')).toBe(0);
  });
});

describe('interestForCycle', () => {
  it('computes daily-balance interest on a carried balance', () => {
    expect(interestForCycle(-20000, 24, 31)).toBe(407.67);
  });

  it('returns 0 for a credit (positive) balance', () => {
    expect(interestForCycle(5000, 24, 31)).toBe(0);
  });

  it('returns 0 when the APR is unset or zero', () => {
    expect(interestForCycle(-20000, 0, 31)).toBe(0);
    expect(interestForCycle(-20000, NaN, 31)).toBe(0);
  });

  it('returns 0 when no days have elapsed', () => {
    expect(interestForCycle(-20000, 24, 0)).toBe(0);
  });

  it('rounds to 2 decimal places', () => {
    expect(interestForCycle(-3333.33, 20, 10)).toBe(18.26);
  });
});

describe('latePaymentFee', () => {
  it('applies the Rs. 1,200 floor when 5% of the minimum is below it', () => {
    expect(latePaymentFee(1000)).toBe(1200);
  });

  it('applies 5% of the minimum when that is higher than Rs. 1,200', () => {
    expect(latePaymentFee(50000)).toBe(2500);
  });

  it('returns 0 when no minimum is configured', () => {
    expect(latePaymentFee(undefined)).toBe(0);
    expect(latePaymentFee(0)).toBe(0);
  });
});

describe('deductionDate', () => {
  it('maps any due date to the 15th of its month', () => {
    expect(deductionDate('2026-09-07')).toBe('2026-09-15');
    expect(deductionDate('2026-09-15')).toBe('2026-09-15');
    expect(deductionDate('2026-09-01')).toBe('2026-09-15');
    expect(deductionDate('2026-09-30')).toBe('2026-09-15');
    expect(deductionDate('2026-12-31')).toBe('2026-12-15');
    expect(deductionDate('2027-01-02')).toBe('2027-01-15');
  });

  it('returns the input unchanged for malformed dates', () => {
    expect(deductionDate('')).toBe('');
    expect(deductionDate('not-a-date')).toBe('not-a-date');
  });
});

describe('runCycleRollover', () => {
  it('does nothing before the deduction day (the 15th) even after the old due date passes', () => {
    const card = makeCard();
    expect(runCycleRollover(card, [], '2026-09-06')).toBeUndefined();
    expect(runCycleRollover(card, [], '2026-09-07')).toBeUndefined();
    expect(runCycleRollover(card, [], '2026-09-08')).toBeUndefined();
    expect(runCycleRollover(card, [], '2026-09-14')).toBeUndefined();
  });

  it('does nothing when the card has no due date', () => {
    const card = makeCard({ dueDate: undefined });
    expect(runCycleRollover(card, [], '2026-09-15')).toBeUndefined();
  });

  it('charges interest on the carried balance when the minimum was paid — dated the 15th', () => {
    const card = makeCard({ currentBalance: -20000, limit: 50000, minPayment: 1000 });
    const paid = makeTx({ amount: 1000, date: '2026-08-20' });
    expect(runCycleRollover(card, [paid], '2026-09-15')).toEqual({
      currentBalance: -20407.67,
      dueDate: '2026-10-07',
      minPayment: 1020.38,
      charges: [
        {
          type: 'Interest Charge',
          name: 'Revolving Interest',
          amount: 407.67,
          appliedDate: '2026-09-15',
          description: '24% p.a. on the carried balance for the 2026-09-15 cycle',
        },
      ],
    });
  });

  it('adds the Sampath late fee when the minimum was not paid — charges dated the 15th', () => {
    const card = makeCard({ currentBalance: -20000, limit: 50000, minPayment: 1000 });
    expect(runCycleRollover(card, [], '2026-09-15')).toEqual({
      currentBalance: -21607.67,
      dueDate: '2026-10-07',
      minPayment: 1080.38,
      charges: [
        {
          type: 'Interest Charge',
          name: 'Revolving Interest',
          amount: 407.67,
          appliedDate: '2026-09-15',
          description: '24% p.a. on the carried balance for the 2026-09-15 cycle',
        },
        {
          type: 'Late Payment Fee',
          name: 'Late Payment Fee',
          amount: 1200,
          appliedDate: '2026-09-15',
          description: 'Pays to 2026-09-15: minimum of 1,000 not paid',
        },
      ],
    });
  });

  it('applies the 5% late fee when it exceeds Rs. 1,200', () => {
    const card = makeCard({ currentBalance: -20000, limit: 50000, minPayment: 50000 });
    expect(runCycleRollover(card, [], '2026-09-15').charges[1]).toEqual({
      type: 'Late Payment Fee',
      name: 'Late Payment Fee',
      amount: 2500,
      appliedDate: '2026-09-15',
      description: 'Pays to 2026-09-15: minimum of 50,000 not paid',
    });
  });

  it('skips the late fee when the minimum is not configured, interest still applies', () => {
    const card = makeCard({ currentBalance: -20000, limit: 50000, minPayment: undefined });
    const result = runCycleRollover(card, [], '2026-09-15');
    expect(result?.charges).toHaveLength(1);
    expect(result?.charges[0].type).toBe('Interest Charge');
  });

  it('charges no interest when the APR is unset, just advances the cycle', () => {
    const card = makeCard({ currentBalance: -20000, limit: 50000, apr: 0, minPayment: 1000 });
    const paid = makeTx({ amount: 1000, date: '2026-08-20' });
    expect(runCycleRollover(card, [paid], '2026-09-15')).toEqual({
      currentBalance: -20000,
      dueDate: '2026-10-07',
      minPayment: 1000,
      charges: [],
    });
  });

  it('clears the cycle when the balance fully settles from the rollover', () => {
    const card = makeCard({ currentBalance: 100, limit: 50000, dueDate: '2026-09-07', minPayment: 1000 });
    expect(runCycleRollover(card, [], '2026-09-15')).toEqual({
      currentBalance: 100,
      dueDate: undefined,
      minPayment: undefined,
      charges: [],
    });
  });

  it('keeps the due date fixed when it is already the 15th', () => {
    const card = makeCard({ dueDate: '2026-09-15', currentBalance: -20000, limit: 50000, minPayment: 1000 });
    const paid = makeTx({ amount: 1000, date: '2026-08-20' });
    expect(runCycleRollover(card, [paid], '2026-09-15')).toEqual({
      currentBalance: -20407.67,
      dueDate: '2026-10-15',
      minPayment: 1020.38,
      charges: [
        {
          type: 'Interest Charge',
          name: 'Revolving Interest',
          amount: 407.67,
          appliedDate: '2026-09-15',
          description: '24% p.a. on the carried balance for the 2026-09-15 cycle',
        },
      ],
    });
  });

it('rolls a late-open cycle on the deduction date — charge dated the 15th, next cycle from the 7th', () => {
    const card = makeCard({ currentBalance: -20000, limit: 50000, minPayment: 1000 });
    const paid = makeTx({ amount: 1000, date: '2026-08-20' });
    expect(runCycleRollover(card, [paid], '2026-09-20')).toEqual({
      currentBalance: -20407.67,
      dueDate: '2026-10-07',
      minPayment: 1020.38,
      charges: [
        {
          type: 'Interest Charge',
          name: 'Revolving Interest',
          amount: 407.67,
          appliedDate: '2026-09-15',
          description: '24% p.a. on the carried balance for the 2026-09-15 cycle',
        },
      ],
    });
  });

  it('uses a stable deduction-date reference key so the app dedupes one rollover per cycle', () => {
    const card = makeCard();
    const first = runCycleRollover(card, [], '2026-09-20');
    const second = runCycleRollover(card, [], '2026-09-20');
    expect(second).toEqual(first);
    expect(`rollover::${card.id}::${deductionDate(card.dueDate!)}`).toBe('rollover::card-1::2026-09-15');
  });

  it('rolls multiple cards independently on their own 15th', () => {
    const cardA = makeCard({ dueDate: '2026-09-07' });
    const cardB = makeCard({ id: 'card-2', dueDate: '2026-10-02', currentBalance: -22222, limit: 80000, minPayment: undefined, apr: 0 });
    expect(runCycleRollover(cardA, [], '2026-09-15')).toBeDefined();
    expect(runCycleRollover(cardB, [], '2026-09-15')).toBeUndefined();
    const b15 = runCycleRollover(cardB, [], '2026-10-15')!;
    expect(b15.dueDate).toBe('2026-11-02');
    expect(b15.charges).toHaveLength(0);
  });

  it('pays no late fee when the minimum is paid by the 5th — inside the manual window', () => {
    const card = makeCard({ currentBalance: -20000, limit: 50000, minPayment: 1000 });
    const paid = makeTx({ amount: 1000, date: '2026-09-05' });
    const result = runCycleRollover(card, [paid], '2026-09-15')!;
    expect(result.currentBalance).toBe(-20407.67);
    expect(result.charges.map(c => c.type)).toEqual(['Interest Charge']);
  });

  it('pays no late fee when the minimum is paid on the 7th — the due date is inclusive', () => {
    const card = makeCard({ currentBalance: -20000, limit: 50000, minPayment: 1000 });
    const paid = makeTx({ amount: 1000, date: '2026-09-07' });
    const result = runCycleRollover(card, [paid], '2026-09-15')!;
    expect(result.currentBalance).toBe(-20407.67);
    expect(result.charges.map(c => c.type)).toEqual(['Interest Charge']);
  });

  it('pays no late fee when only the 15th deduction lands — it is the bank debit, not a manual payment', () => {
    const card = makeCard({ currentBalance: -20000, limit: 50000, minPayment: 1000 });
    const deduction = makeTx({ amount: 1000, date: '2026-09-15' });
    const result = runCycleRollover(card, [deduction], '2026-09-15')!;
    expect(result.currentBalance).toBe(-20407.67);
    expect(result.charges.map(c => c.type)).toEqual(['Interest Charge']);
  });

  it('charges the late fee for a manual payment dated the 12th — after the 7th window closes', () => {
    const card = makeCard({ currentBalance: -20000, limit: 50000, minPayment: 1000 });
    const late = makeTx({ amount: 1000, date: '2026-09-12' });
    const result = runCycleRollover(card, [late], '2026-09-15')!;
    expect(result.currentBalance).toBe(-21607.67);
    expect(result.charges.map(c => c.type)).toEqual(['Interest Charge', 'Late Payment Fee']);
  });

  it('is idempotent — repeating the rollover produces the identical result and charges', () => {
    const card = makeCard({ currentBalance: -20000, limit: 50000, minPayment: 1000 });
    const first = runCycleRollover(card, [], '2026-09-15');
    const second = runCycleRollover(card, [], '2026-09-15');
    expect(second).toEqual(first);
    expect(second!.charges).toHaveLength(2);
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

  it('anchors the window on the statement close date when set', () => {
    const card = makeCard({ dueDate: '2026-09-07', statementCloseDate: '2026-08-15' });
    // 2026-08-20 is inside the window anchored at 2026-08-15
    const inWindow = makeTx({ amount: 6190.62, date: '2026-08-20' });
    expect(isMinimumSatisfied(card, [inWindow])).toBe(true);
  });

  it('excludes payments before the statement close window start when set', () => {
    const card = makeCard({ dueDate: '2026-09-07', statementCloseDate: '2026-08-15' });
    // 2026-07-01 is before the window start 2026-07-15 anchored on the cut-off
    const stale = makeTx({ amount: 6190.62, date: '2026-07-01' });
    expect(isMinimumSatisfied(card, [stale])).toBe(false);
  });
});

describe('cycleAnchor', () => {
  it('prefers the statement close date over the due date', () => {
    expect(cycleAnchor({ dueDate: '2026-09-07', statementCloseDate: '2026-08-15' })).toBe('2026-08-15');
  });

  it('falls back to the due date when no cut-off is set', () => {
    expect(cycleAnchor({ dueDate: '2026-09-07' })).toBe('2026-09-07');
  });

  it('returns empty when neither date is set', () => {
    expect(cycleAnchor({})).toBe('');
  });
});

describe('paymentsInCycle with statement close anchor', () => {
  it('opens the window one month before the anchor date', () => {
    const txs: Transaction[] = [makeTx({ amount: 3000, date: '2026-08-20' })];
    // anchor 2026-08-15 -> window start 2026-07-15, so 2026-08-20 counts
    expect(paymentsInCycle(txs, 'card-1', '2026-09-07', '2026-08-15')).toBe(3000);
  });

  it('excludes payments before the anchored window start', () => {
    const txs: Transaction[] = [makeTx({ amount: 3000, date: '2026-07-01' })];
    expect(paymentsInCycle(txs, 'card-1', '2026-09-07', '2026-08-15')).toBe(0);
  });
});