import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  markStateDirty,
  clearStateDirty,
  isStateDirty,
  recordDeletions,
  getTombstonedIds,
  clearTombstones,
  isAlertDayRecent,
  isInCurrentMonth,
  budgetSpendingForMonth,
  ledgerBalanceEffect,
  applyGoalAllocation,
  addMonthsClamped,
  applyRepayment,
  isSpendingRow,
  recordDismissedAlerts,
  getDismissedAlertIds,
} from './utils';

const DISMISSED_KEY = 'cashflow_manager_dismissed_alerts_v1';

/** Local calendar day `offset` days from today, in the `YYYY-MM-DD` the ledger stores. */
function dayOffset(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// The global test setup stubs localStorage with bare vi.fn()s that discard
// writes, so back it with a real map — these functions only mean anything if
// the value actually survives the write.
function installFakeStorage() {
  const store = new Map<string, string>();
  const ls = globalThis.localStorage as unknown as Record<string, ReturnType<typeof vi.fn>>;
  ls.getItem = vi.fn((key: string) => (store.has(key) ? store.get(key)! : null));
  ls.setItem = vi.fn((key: string, value: string) => {
    store.set(key, String(value));
  });
  ls.removeItem = vi.fn((key: string) => {
    store.delete(key);
  });
  ls.clear = vi.fn(() => store.clear());
  return store;
}

describe('unsynced-state marker', () => {
  beforeEach(() => installFakeStorage());

  it('is set by an edit and released only by a confirmed push', () => {
    markStateDirty('a@example.com');
    expect(isStateDirty('a@example.com')).toBe(true);

    clearStateDirty('a@example.com');
    expect(isStateDirty('a@example.com')).toBe(false);
  });

  it('is scoped to its owner so a shared device cannot cross signals', () => {
    markStateDirty('a@example.com');
    expect(isStateDirty('b@example.com')).toBe(false);
  });

  it('ignores a clear request from a different owner', () => {
    markStateDirty('a@example.com');
    clearStateDirty('B@example.com');
    expect(isStateDirty('a@example.com')).toBe(true);
  });

  it('matches owners case-insensitively', () => {
    markStateDirty('A@Example.COM');
    expect(isStateDirty('a@example.com')).toBe(true);
  });

  it('treats a missing email as never dirty', () => {
    markStateDirty(undefined);
    expect(isStateDirty(undefined)).toBe(false);
    expect(isStateDirty('')).toBe(false);
  });
});

describe('deletion tombstones', () => {
  beforeEach(() => installFakeStorage());

  it('survives the read-back so a killed tab can suppress cloud resurrection', () => {
    recordDeletions('a@example.com', ['tx-1', 'debt-2']);
    expect(getTombstonedIds('a@example.com')).toEqual(new Set(['tx-1', 'debt-2']));
  });

  it('accumulates without dropping earlier deletions', () => {
    recordDeletions('a@example.com', ['tx-1']);
    recordDeletions('a@example.com', ['tx-2']);
    expect([...getTombstonedIds('a@example.com')].sort()).toEqual(['tx-1', 'tx-2']);
  });

  it('releases every tombstone once the server confirms', () => {
    recordDeletions('a@example.com', ['tx-1', 'tx-2']);
    clearTombstones('a@example.com');
    expect(getTombstonedIds('a@example.com').size).toBe(0);
  });

  it('does not leak deletions across accounts', () => {
    recordDeletions('a@example.com', ['tx-1']);
    expect(getTombstonedIds('b@example.com').size).toBe(0);

    clearTombstones('b@example.com');
    expect(getTombstonedIds('a@example.com')).toEqual(new Set(['tx-1']));
  });

  it('is a no-op for an empty id list', () => {
    recordDeletions('a@example.com', []);
    expect(getTombstonedIds('a@example.com').size).toBe(0);
  });

  it('discards a corrupt store instead of throwing', () => {
    localStorage.setItem('cashflow_manager_deleted_ids_v1', '{"a@example.com": [1, "ok"}');
    expect(getTombstonedIds('a@example.com').size).toBe(0);

    localStorage.setItem('cashflow_manager_deleted_ids_v1', '[1,2,3]');
    expect(getTombstonedIds('a@example.com').size).toBe(0);
  });

  it('ignores non-string ids when parsing', () => {
    localStorage.setItem('cashflow_manager_deleted_ids_v1', JSON.stringify({ 'a@example.com': ['ok', 7, null] }));
    expect(getTombstonedIds('a@example.com')).toEqual(new Set(['ok']));
  });
});

describe('isAlertDayRecent', () => {
  it('covers the day itself and the day before', () => {
    expect(isAlertDayRecent(dayOffset(0))).toBe(true);
    expect(isAlertDayRecent(dayOffset(-1))).toBe(true);
  });

  it('drops anything older, and anything not yet due', () => {
    expect(isAlertDayRecent(dayOffset(-2))).toBe(false);
    expect(isAlertDayRecent(dayOffset(1))).toBe(false);
  });

  it('reads a full timestamp as its local day', () => {
    expect(isAlertDayRecent(new Date().toISOString())).toBe(true);
    expect(isAlertDayRecent(new Date(Date.now() - 3 * 86400000).toISOString())).toBe(false);
  });

  it('is false for a missing or unreadable date', () => {
    expect(isAlertDayRecent(undefined)).toBe(false);
    expect(isAlertDayRecent('')).toBe(false);
    expect(isAlertDayRecent('not a date')).toBe(false);
  });
});

describe('dismissed alerts', () => {
  beforeEach(() => installFakeStorage());

  it('survives the read-back so a closed alert stays closed across remounts', () => {
    recordDismissedAlerts('a@example.com', ['budget-over-1']);
    expect(getDismissedAlertIds('a@example.com')).toEqual(new Set(['budget-over-1']));
  });

  it('is scoped to its owner', () => {
    recordDismissedAlerts('a@example.com', ['bill-due-1']);
    expect(getDismissedAlertIds('b@example.com').size).toBe(0);
  });

  it('stops honouring a closure once it falls outside the two-day window', () => {
    localStorage.setItem(
      DISMISSED_KEY,
      JSON.stringify({ 'a@example.com': { old: dayOffset(-3), recent: dayOffset(-1) } }),
    );
    expect(getDismissedAlertIds('a@example.com')).toEqual(new Set(['recent']));
  });

  it('prunes expired closures while writing a new one', () => {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify({ 'a@example.com': { old: dayOffset(-9) } }));
    recordDismissedAlerts('a@example.com', ['fresh']);
    const stored = JSON.parse(localStorage.getItem(DISMISSED_KEY)!) as Record<string, Record<string, string>>;
    expect(Object.keys(stored['a@example.com'])).toEqual(['fresh']);
  });

  it('discards a corrupt store instead of throwing', () => {
    localStorage.setItem(DISMISSED_KEY, '{"a@example.com": {"x"');
    expect(getDismissedAlertIds('a@example.com').size).toBe(0);
    localStorage.setItem(DISMISSED_KEY, '[1,2,3]');
    expect(getDismissedAlertIds('a@example.com').size).toBe(0);
  });
});

describe('isInCurrentMonth', () => {
  // A fixed local "today" — every case below is written against this calendar.
  const NOW = new Date(2026, 9, 4, 9, 30).getTime(); // 2026-10-04 09:30 local

  it('accepts a day in the same month and rejects one outside it', () => {
    expect(isInCurrentMonth('2026-10-01', NOW)).toBe(true);
    expect(isInCurrentMonth('2026-10-31', NOW)).toBe(true);
    expect(isInCurrentMonth('2026-09-30', NOW)).toBe(false);
    expect(isInCurrentMonth('2026-11-01', NOW)).toBe(false);
  });

  it('rejects the same month of a different year', () => {
    // The old test was `date.includes('-10-')`, which let October of every year on
    // record into every monthly total — the reason a fresh month showed old money.
    expect(isInCurrentMonth('2025-10-14', NOW)).toBe(false);
    expect(isInCurrentMonth('2027-10-14', NOW)).toBe(false);
  });

  it('reads a bare day in the local calendar, not as UTC midnight', () => {
    // `new Date('2026-10-04')` is 00:00 UTC — the evening of the 3rd for a
    // UTC-5 reader, and still the 4th for UTC+5:30. The day must mean what it says.
    expect(isInCurrentMonth('2026-10-04', new Date(2026, 9, 4, 0, 0).getTime())).toBe(true);
  });

  it('keeps a timestamp in the month its own clock says it is in', () => {
    expect(isInCurrentMonth('2026-10-04T23:59:00', NOW)).toBe(true);
    expect(isInCurrentMonth('2026-09-30T23:59:00', NOW)).toBe(false);
  });

  it('treats a missing or unparseable day as out of period', () => {
    expect(isInCurrentMonth(undefined, NOW)).toBe(false);
    expect(isInCurrentMonth('', NOW)).toBe(false);
    expect(isInCurrentMonth('not a date', NOW)).toBe(false);
  });
});

function row(over: Record<string, unknown>) {
  return {
    id: 't',
    type: 'expense',
    title: 'Row',
    amount: 10,
    date: '2026-10-02',
    category: 'Food',
    ...over,
  } as never;
}

describe('budgetSpendingForMonth', () => {
  const NOW = new Date(2026, 9, 4, 9, 30).getTime();

  it('charges the envelope with this month only', () => {
    const spent = budgetSpendingForMonth(
      'Food',
      [
        row({ id: 'a', amount: 40 }),
        row({ id: 'b', amount: 7, date: '2025-10-02' }),
        row({ id: 'c', amount: 5, date: '2026-09-29' }),
      ],
      [],
      NOW,
    );
    expect(spent.spent).toBe(40);
    expect(spent.items.map((i) => i.name)).toEqual(['Row']);
  });

  it('adds every active subscription in the category, and no other status', () => {
    const subs = [
      {
        id: 's1',
        name: 'Netflix',
        amount: 15,
        billingCycle: 'Monthly',
        dueDate: '2026-10-05',
        category: 'Entertainment',
        status: 'Active',
      },
      {
        id: 's2',
        name: 'Old plan',
        amount: 99,
        billingCycle: 'Monthly',
        dueDate: '2026-10-05',
        category: 'Entertainment',
        status: 'Cancelled',
      },
    ] as never;
    const spent = budgetSpendingForMonth('Entertainment', [], subs as never, NOW);
    expect(spent.spent).toBe(15);
    expect(spent.items[0].name).toBe('Netflix (Subscription)');
  });

  it('does not count a negative or non-expense row as spending', () => {
    // A transfer's outgoing leg is stored negative and its fee used to be too, so
    // the old absolute-value sum charged envelopes for money that never left home.
    const spent = budgetSpendingForMonth(
      'Transfer Fee',
      [
        row({ category: 'Transfer Fee', amount: -500 }),
        row({ category: 'Transfer Fee', type: 'transfer', amount: 500 }),
      ],
      [],
      NOW,
    );
    expect(spent.spent).toBe(0);
  });

  it('tiles the category name, and adds in cents rather than as floats', () => {
    const spent = budgetSpendingForMonth(' food ', [row({ amount: 0.1 }), row({ amount: 0.2 })], [], NOW);
    expect(spent.spent).toBe(0.3);
  });
});

describe('ledgerBalanceEffect', () => {
  it('credits the account for money coming in', () => {
    expect(ledgerBalanceEffect('income', 'Salary', 500)).toBe(500);
    expect(ledgerBalanceEffect('deposit', 'Loan Refund', 500)).toBe(500);
    expect(ledgerBalanceEffect('financing', 'Loan', 500)).toBe(500);
  });

  it('debits the account for money going out, whatever sign the row stores', () => {
    expect(ledgerBalanceEffect('expense', 'Food', 500)).toBe(-500);
    expect(ledgerBalanceEffect('expense', 'Transfer Fee', -500)).toBe(-500);
    expect(ledgerBalanceEffect('credit_card_charge', 'Bank Charges & Interest', 50)).toBe(-50);
    expect(ledgerBalanceEffect('debt_payment', 'Debt Repayment', 250)).toBe(-250);
  });

  it('reads a transfer leg from its category, not its sign', () => {
    // The edit form always submits a positive amount, so the stored sign cannot
    // survive an edit — and using it turned an edited "out" leg into an "in" one.
    expect(ledgerBalanceEffect('transfer', 'Transfer Out', -1000)).toBe(-1000);
    expect(ledgerBalanceEffect('transfer', 'Transfer Out', 1000)).toBe(-1000);
    expect(ledgerBalanceEffect('transfer', 'Transfer In', 1000)).toBe(1000);
  });

  it('leaves an unknown type alone', () => {
    expect(ledgerBalanceEffect('nonsense' as never, 'Food', 100)).toBe(0);
  });
});

describe('applyGoalAllocation', () => {
  it('moves money from the wallet into the jar without creating any', () => {
    // Funding used to credit both sides, so a 500 allocation showed up as 500 of
    // new money in the wallet *and* 500 in the jar.
    expect(applyGoalAllocation(0, 2000, 500)).toEqual({ committed: 500, goal: 500, wallet: 1500 });
  });

  it('returns the money the other way on a withdrawal', () => {
    expect(applyGoalAllocation(500, 1500, -200)).toEqual({ committed: -200, goal: 300, wallet: 1700 });
  });

  it('will not let a jar pay out more than it holds', () => {
    // The old order of operations clamped only the jar, so the wallet was credited
    // for the whole request and the difference was invented.
    expect(applyGoalAllocation(50, 1000, -500)).toEqual({ committed: -50, goal: 0, wallet: 1050 });
  });

  it('does nothing when an empty jar is asked to withdraw', () => {
    expect(applyGoalAllocation(0, 1000, -500)).toBeNull();
  });

  it('keeps both sides in exact cents', () => {
    const move = applyGoalAllocation(0, 20, 19.99);
    expect(move).not.toBeNull();
    expect(move!.wallet).toBe(0.01);
    expect(move!.goal).toBe(19.99);
    // The household is worth exactly what it was before the transfer.
    expect(move!.wallet + move!.goal).toBe(20);
  });
});

describe('addMonthsClamped', () => {
  it('keeps the day of the month when the target month has one', () => {
    expect(addMonthsClamped('2026-10-15', 1)).toBe('2026-11-15');
    expect(addMonthsClamped('2026-12-31', 1)).toBe('2027-01-31');
  });

  it('clamps a day the target month does not have, instead of overflowing', () => {
    // `Date#setMonth` resolved Feb 31 to Mar 3, so a subscription or installment
    // due at month end was billed three days into the following month.
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2026-03-31', 1)).toBe('2026-04-30');
  });

  it('clamps to the 29th in a leap year', () => {
    expect(addMonthsClamped('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonthsClamped('2024-02-29', 12)).toBe('2025-02-28');
  });

  it('advances a whole year for a yearly cycle without drifting', () => {
    expect(addMonthsClamped('2026-05-05', 12)).toBe('2027-05-05');
    expect(addMonthsClamped('2026-01-31', 12)).toBe('2027-01-31');
  });

  it('walks a twelve-month schedule without losing the month end', () => {
    const start = '2026-10-31';
    const schedule = [1, 2, 3, 4, 5].map((i) => addMonthsClamped(start, i));
    expect(schedule).toEqual(['2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28', '2027-03-31']);
  });

  it('leaves an unparseable day exactly as it was', () => {
    expect(addMonthsClamped('not-a-date', 1)).toBe('not-a-date');
  });
});

describe('applyRepayment', () => {
  it('settles exactly what is asked when enough is owed', () => {
    expect(applyRepayment(5000, 1200)).toEqual({ applied: 1200, remaining: 3800 });
  });

  it('closes a balance to the penny', () => {
    expect(applyRepayment(1200, 1200)).toEqual({ applied: 1200, remaining: 0 });
  });

  it('cannot repay more than is outstanding', () => {
    // The wallet used to move the whole typed figure while the balance clamped at
    // zero, so the surplus was either destroyed (a debt) or invented (a loan).
    expect(applyRepayment(200, 1000)).toEqual({ applied: 200, remaining: 0 });
  });

  it('moves nothing against a balance that is already clear', () => {
    expect(applyRepayment(0, 500)).toEqual({ applied: 0, remaining: 0 });
  });

  it('treats a corrupt negative balance as nothing owed', () => {
    expect(applyRepayment(-1500, 500)).toEqual({ applied: 0, remaining: 0 });
  });

  it('keeps the two sides the same distance apart', () => {
    const { applied, remaining } = applyRepayment(300, 1000);
    // Whatever left the wallet is exactly what cleared the balance.
    expect(applied + remaining).toBe(300);
  });

  it('lands on exact cents', () => {
    expect(applyRepayment(0.3, 0.1)).toEqual({ applied: 0.1, remaining: 0.2 });
  });
});

describe('isSpendingRow', () => {
  it('accepts a purchase that moved money', () => {
    expect(isSpendingRow(row({ type: 'expense', amount: 450 }))).toBe(true);
  });

  it('rejects money that merely changed pockets or was never spent', () => {
    // Money in, a sideways move, and the stamps the app writes when a row is deleted
    // or a balance is corrected by hand. None of them bought anything.
    for (const bad of [
      row({ type: 'income', amount: 100000 }),
      row({ type: 'deposit', amount: 71050 }),
      row({ type: 'withdrawal', amount: 71050 }),
      row({ type: 'transfer', amount: 2000 }),
      row({ type: 'financing', amount: 5000 }),
      row({ type: 'debt_payment', amount: 900 }),
      row({ type: 'expense', amount: 0, category: 'Transaction Deletion' }),
      row({ type: 'expense', amount: -450 }),
    ]) {
      expect(isSpendingRow(bad)).toBe(false);
    }
  });

  it('is the rule the envelopes charge themselves with', () => {
    // Reports and the budget tray must agree about what counts, or the same month
    // shows two different spending totals.
    const rows = [
      row({ id: 'keep', amount: 40 }),
      row({ id: 'drop', type: 'transfer', amount: 4000 }),
      row({ id: 'stamp', amount: 0 }),
    ];
    const counted = rows.filter(isSpendingRow).map((t) => t.id);
    expect(budgetSpendingForMonth('Food', rows, [], new Date(2026, 9, 4).getTime()).spent).toBe(
      counted.reduce((s, id) => s + (id === 'keep' ? 40 : 0), 0),
    );
  });
});
