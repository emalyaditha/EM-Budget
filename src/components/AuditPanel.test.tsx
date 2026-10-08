import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { BankCard, CashAccount, Debt, Subscription, Transaction } from '../types';
import { todayLocal } from '../utils';
import AuditPanel from './AuditPanel';

afterEach(cleanup);

/** A calendar day in the reader's own timezone, as the ledger stores it. Every offset used here
 *  is at least two days from today, so the panel's `new Date('YYYY-MM-DD')` → UTC parse followed
 *  by `setHours(0,0,0,0)` cannot flip a fault across the boundary a test is standing on. */
const day = (offset: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const CURRENCY = 'Rs.';

/** The component interpolates `toLocaleString()` straight into its sentences, so the expected
 *  strings are built the same way: the assertion is about the sentence, not the groupings. */
const grouped = (n: number): string => n.toLocaleString();

const cash = (id: string, name: string, balance: number): CashAccount => ({ id, name, balance });

const creditCard = (id: string, cardName: string, currentBalance: number, limit: number): BankCard => ({
  id,
  cardName,
  bankName: 'Bank',
  cardType: 'Credit',
  currentBalance,
  limit,
});

const debitCard = (id: string, cardName: string, currentBalance: number, extra: Partial<BankCard> = {}): BankCard => ({
  id,
  cardName,
  bankName: 'Bank',
  cardType: 'Debit',
  currentBalance,
  ...extra,
});

const sub = (
  id: string,
  name: string,
  dueDate: string,
  status: Subscription['status'] = 'Active',
  amount = 1200,
): Subscription => ({ id, name, amount, billingCycle: 'Monthly', dueDate, category: 'Insurance', status });

const debt = (
  id: string,
  debtSource: string,
  remainingAmount: number,
  dueDate: string,
  status: Debt['status'] = 'Active',
): Debt => ({
  id,
  debtSource,
  totalAmount: remainingAmount,
  remainingAmount,
  dueDate,
  notes: '',
  payments: [],
  status,
});

const expense = (id: string, title: string, date: string, amount = 1200): Transaction => ({
  id,
  type: 'expense',
  title,
  amount,
  date,
  category: 'Utilities',
});

const EMPTY = {
  transactions: [] as Transaction[],
  subscriptions: [] as Subscription[],
  debts: [] as Debt[],
  cashAccounts: [] as CashAccount[],
  cards: [] as BankCard[],
  currency: CURRENCY,
};

type Props = typeof EMPTY;

const score = () => screen.getByText(/^\d+\/100$/).textContent;
const rating = () => screen.getByText(/^(Excellent|Fair|Action Needed)$/).textContent;
const has = (text: string) => screen.queryByText(text) !== null;
const aligned = (done: number, total: number) => screen.getByText(`${done} / ${total} Verified`);
const payForm = () => screen.getByRole('button', { name: /Verify & Log Settle Record/ }).closest('form');

/** Both write handlers are passed by default, because their absence hides the buttons. */
function panel(over: Partial<Props> = {}, handlers: { withToggle?: boolean; withPay?: boolean } = {}) {
  const onToggleSubscriptionStatus = handlers.withToggle === false ? undefined : vi.fn();
  const onPaySubscription = handlers.withPay === false ? undefined : vi.fn();
  render(
    <AuditPanel
      {...EMPTY}
      {...over}
      onToggleSubscriptionStatus={onToggleSubscriptionStatus}
      onPaySubscription={onPaySubscription}
    />,
  );
  return { onToggleSubscriptionStatus, onPaySubscription };
}

describe('health score', () => {
  it('starts at a pristine hundred when there is nothing to audit', () => {
    panel();
    expect(score()).toBe('100/100');
    expect(rating()).toBe('Excellent');
    expect(has('All Clear! Ledger Aligned')).toBe(true);
  });

  /** Each fault is isolated in its own render: the deductions are documented per branch, so a
   *  test that stacked them all could not tell a lost −3 from a lost −12. */
  const FAULTS: { name: string; props: Partial<Props>; deduct: number; title: string }[] = [
    {
      name: 'overdue subscription with no payment',
      props: { subscriptions: [sub('s1', 'Netflix', day(-5))] },
      deduct: 10,
      title: 'Overdue Subscription: Netflix',
    },
    {
      name: 'overdrawn cash account',
      props: { cashAccounts: [cash('c1', 'Paying', -250)] },
      deduct: 10,
      title: 'Overdrawn Cash Account: Paying',
    },
    {
      name: 'cash account below the 5,000 threshold',
      props: { cashAccounts: [cash('c1', 'Paying', 4500)] },
      deduct: 3,
      title: 'Low Cash Balance: Paying',
    },
    {
      name: 'credit card over its limit',
      props: { cards: [creditCard('k1', 'Visa', -11000, 10000)] },
      deduct: 12,
      title: 'Credit Card Overlimit: Visa',
    },
    {
      name: 'credit card above 85% utilization',
      props: { cards: [creditCard('k1', 'Visa', -9000, 10000)] },
      deduct: 5,
      title: 'High Credit Utilization: Visa',
    },
    {
      name: 'overdrawn debit card',
      props: { cards: [debitCard('k1', 'Debit', -500)] },
      deduct: 8,
      title: 'Overdrawn Debit Card: Debit',
    },
    {
      name: 'debit card with a low balance',
      props: { cards: [debitCard('k1', 'Debit', 2000)] },
      deduct: 2,
      title: 'Low Debit Card Balance: Debit',
    },
    {
      name: 'overdue debt',
      props: { debts: [debt('d1', 'Car loan', 40000, day(-5))] },
      deduct: 10,
      title: 'Overdue Outstanding Debt: Car loan',
    },
  ];

  it.each(FAULTS)('$name costs exactly $deduct', ({ props, deduct, title }) => {
    panel(props);
    expect(score()).toBe(`${100 - deduct}/100`);
    expect(has(title)).toBe(true);
  });

  it('lets an allowance decide whether an overdrawn debit card is a danger or merely low', () => {
    // `allowNegativeBalance` only suppresses the −8 danger; the −2 low-balance warning still
    // fires, because the branch it falls through to is a plain `< 5000` test.
    panel({ cards: [debitCard('k1', 'Debit', -500, { allowNegativeBalance: true })] });
    expect(score()).toBe('98/100');
    expect(has('Overdrawn Debit Card: Debit')).toBe(false);
    expect(has('Low Debit Card Balance: Debit')).toBe(true);
  });

  it('never reports a negative score, and drops to Action Needed on the way', () => {
    panel({ debts: Array.from({ length: 12 }, (_, i) => debt(`d${i}`, `Loan ${i}`, 1000, day(-5))) });
    expect(score()).toBe('0/100');
    expect(rating()).toBe('Action Needed');
    expect(screen.getAllByText(/Overdue Outstanding Debt: Loan/)).toHaveLength(12);
  });

  it('bands the rating at 90 and 70, and the 70 edge is still Fair', () => {
    const overdrafts = (n: number) => Array.from({ length: n }, (_, i) => cash(`c${i}`, `A${i}`, -1));

    panel({ cashAccounts: overdrafts(2) }); // −20
    expect(score()).toBe('80/100');
    expect(rating()).toBe('Fair');

    cleanup();
    panel({ cashAccounts: overdrafts(3) }); // −30, the boundary itself
    expect(score()).toBe('70/100');
    expect(rating()).toBe('Fair');

    cleanup();
    panel({ cashAccounts: overdrafts(4) }); // −40
    expect(score()).toBe('60/100');
    expect(rating()).toBe('Action Needed');
  });

  it('quotes a negative balance without its sign, because formatMoney is unsigned', () => {
    panel({ cashAccounts: [cash('c1', 'Paying', -250)] });
    expect(has('Account balance is negative (Rs.250). Check if expenses are over-recorded.')).toBe(true);
  });
});

describe('cancellations, pauses and the counts', () => {
  it('audits neither a cancelled subscription nor a cancelled card, and drops both from the pills', () => {
    panel({
      subscriptions: [sub('s1', 'Netflix', day(-5), 'Cancelled')],
      cards: [debitCard('k1', 'Old Debit', -9000, { isCanceled: true })],
    });
    expect(score()).toBe('100/100');
    expect(aligned(0, 0)).toBeTruthy();
    expect(screen.getByText(/0 Accounts Tracked/)).toBeTruthy();
    expect(has('Netflix')).toBe(false);
    expect(has('Old Debit')).toBe(false);
    expect(has('Critical Warning')).toBe(false);
  });

  it('reads a paused subscription as Paused and never as overdue', () => {
    panel({ subscriptions: [sub('s1', 'Netflix', day(-5), 'Paused')] });
    expect(score()).toBe('100/100');
    expect(screen.getByText('Paused')).toBeTruthy();
    expect(has('Overdue Subscription: Netflix')).toBe(false);
    // Overdue needs `Active`, and reconciliation needs a payment, so a pause is neither.
    expect(aligned(0, 1)).toBeTruthy();
  });

  it('counts only outstanding debts as liabilities', () => {
    panel({ debts: [debt('d1', 'Paid off', 0, day(20), 'Fully Repaid'), debt('d2', 'Still owed', 5000, day(20))] });
    expect(screen.getByText(/1 Outstanding Liabilities/)).toBeTruthy();
  });

  it('asks for a status alignment instead of charging points for it', () => {
    panel({ debts: [debt('d1', 'Car loan', 0, day(20), 'Active')] });
    expect(score()).toBe('100/100');
    expect(has('Status Align Recommended: Car loan')).toBe(true);
  });

  it('treats a sub-cent remainder as repaid, and prefers overdue over alignment', () => {
    // compareMoney rounds to minor units, so 0.004 is "zero" to this panel.
    panel({ debts: [debt('d1', 'Dust', 0.004, day(20))] });
    expect(has('Status Align Recommended: Dust')).toBe(true);
    expect(score()).toBe('100/100');

    cleanup();
    // Overdue is tested first, and 0.004 is still > 0, so old dust stays a danger.
    panel({ debts: [debt('d2', 'Dust', 0.004, day(-5))] });
    expect(score()).toBe('90/100');
    expect(has('Overdue Outstanding Debt: Dust')).toBe(true);
    expect(has('Status Align Recommended: Dust')).toBe(false);
  });
});

describe('the payment-matching window', () => {
  const overdue: Partial<Props> = { subscriptions: [sub('s1', 'Netflix', day(-5))] };

  it('accepts a payment on the last day of its window', () => {
    panel({ ...overdue, transactions: [expense('t1', 'Netflix', day(20))] }); // due + 25
    expect(score()).toBe('100/100');
    expect(screen.getByText('Verified & Aligned')).toBeTruthy();
    expect(aligned(1, 1)).toBeTruthy();
  });

  it('rejects a payment the day after its window ends', () => {
    panel({ ...overdue, transactions: [expense('t1', 'Netflix', day(21))] }); // due + 26
    expect(score()).toBe('90/100');
    expect(screen.getByText('Missing Payment')).toBeTruthy();
    expect(aligned(0, 1)).toBeTruthy();
  });

  it('rejects a payment landed before its window opens', () => {
    panel({
      subscriptions: [sub('s1', 'Netflix', day(10))],
      transactions: [expense('t1', 'Netflix', day(-6))], // due − 16
    });
    expect(screen.getByText('Active & Tracked')).toBeTruthy();
    expect(aligned(0, 1)).toBeTruthy();
  });

  it('ignores income rows even when the title and the date both match', () => {
    panel({ ...overdue, transactions: [{ ...expense('t1', 'Netflix', day(0)), type: 'income' }] });
    expect(score()).toBe('90/100');
    expect(screen.getByText('Missing Payment')).toBeTruthy();
  });

  it('matches either direction of substring, including the settle-suffix form', () => {
    panel({ ...overdue, transactions: [expense('t1', 'Netflix subscription settle: January', day(0))] });
    expect(screen.getByText('Verified & Aligned')).toBeTruthy();

    cleanup();
    panel({ ...overdue, transactions: [expense('t2', 'Netf', day(0))] });
    expect(screen.getByText('Verified & Aligned')).toBeTruthy();
  });
});

describe('bulletin tabs', () => {
  const MIXED: Partial<Props> = {
    cashAccounts: [cash('c1', 'Paying', -250)],
    debts: [debt('d1', 'Car loan', 40000, day(-5))],
    subscriptions: [sub('s1', 'Netflix', day(-5))],
  };
  const CASH_ISSUE = 'Overdrawn Cash Account: Paying';
  const DEBT_ISSUE = 'Overdue Outstanding Debt: Car loan';

  it('filters the bulletins to the selected section and back', () => {
    panel(MIXED);
    fireEvent.click(screen.getByRole('button', { name: 'Accounts' }));
    expect(has(CASH_ISSUE)).toBe(true);
    expect(has(DEBT_ISSUE)).toBe(false);
    expect(has('Overdue Subscription: Netflix')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Debts' }));
    expect(has(DEBT_ISSUE)).toBe(true);
    expect(has(CASH_ISSUE)).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Subscriptions' }));
    expect(has('Overdue Subscription: Netflix')).toBe(true);
    expect(has(DEBT_ISSUE)).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(has(CASH_ISSUE)).toBe(true);
    expect(has(DEBT_ISSUE)).toBe(true);
  });

  it('says All Clear when the selected section has nothing to report', () => {
    panel({ cashAccounts: [cash('c1', 'Paying', 90000)] });
    fireEvent.click(screen.getByRole('button', { name: 'Debts' }));
    expect(has('All Clear! Ledger Aligned')).toBe(true);
  });
});

describe('the settle flyout', () => {
  const missing: Partial<Props> = { subscriptions: [sub('s1', 'Netflix', day(-5))] };

  it('defaults to the first cash account and hands the whole form to the app', () => {
    const { onPaySubscription } = panel({
      ...missing,
      cashAccounts: [cash('c1', 'Salary account', 90000), cash('c2', 'Savings', 90000)],
      cards: [debitCard('k1', 'Debit', 90000), debitCard('k9', 'Retired', 90000, { isCanceled: true })],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Log Settle' }));
    expect(screen.getByText(/Log a payment for/)).toBeTruthy();
    expect(screen.getAllByText('Netflix')).toHaveLength(2); // ledger row and the flyout's line
    const select = screen.getByRole('combobox');
    expect(select.value).toBe('cash:c1');
    // The payee list is both wallets, minus the card the owner already retired.
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['cash:c1', 'cash:c2', 'card:k1']);

    fireEvent.submit(payForm()!);
    expect(onPaySubscription).toHaveBeenCalledWith('s1', 'c1', 'cash', todayLocal(), 0);
    // A settled subscription closes the flyout itself.
    expect(screen.queryByRole('button', { name: /Verify & Log Settle Record/ })).toBeNull();
  });

  it('falls back to the first card when the ledger holds no cash account', () => {
    const { onPaySubscription } = panel({ ...missing, cards: [debitCard('k1', 'Debit', 90000)] });
    fireEvent.click(screen.getByRole('button', { name: 'Log Settle' }));
    const select = screen.getByRole('combobox');
    expect(select.value).toBe('card:k1');
    fireEvent.submit(payForm()!);
    expect(onPaySubscription).toHaveBeenCalledWith('s1', 'k1', 'card', todayLocal(), 0);
  });

  it('carries the edited date and surcharge, and clears the surcharge afterwards', () => {
    const { onPaySubscription } = panel({ ...missing, cashAccounts: [cash('c1', 'Salary', 90000)] });
    fireEvent.click(screen.getByRole('button', { name: 'Log Settle' }));
    fireEvent.change(screen.getByDisplayValue(todayLocal()), { target: { value: '2030-01-05' } });
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '250' } });
    fireEvent.submit(payForm()!);
    expect(onPaySubscription).toHaveBeenCalledWith('s1', 'c1', 'cash', '2030-01-05', 250);

    // Reopening clears the surcharge — and only the surcharge. The date the owner typed is
    // still there, because `handleSettleSubmit` resets `bankCharge` but not `settleDate`.
    fireEvent.click(screen.getByRole('button', { name: 'Log Settle' }));
    expect((screen.getByPlaceholderText('0') as HTMLInputElement).value).toBe('');
    expect(screen.getByDisplayValue('2030-01-05')).toBeTruthy();
  });

  it('closes without recording anything', () => {
    const { onPaySubscription } = panel({ ...missing, cashAccounts: [cash('c1', 'Salary', 90000)] });
    fireEvent.click(screen.getByRole('button', { name: 'Log Settle' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close [x]' }));
    expect(screen.queryByRole('button', { name: /Verify & Log Settle Record/ })).toBeNull();
    expect(onPaySubscription).not.toHaveBeenCalled();
  });

  it('offers neither a settle path nor a write path when the app withholds the handlers', () => {
    panel(missing, { withPay: false, withToggle: false });
    expect(screen.queryByRole('button', { name: 'Log Settle' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
  });

  it('submits nothing when there is no account to pay from', () => {
    const { onPaySubscription } = panel(missing);
    fireEvent.click(screen.getByRole('button', { name: 'Log Settle' }));
    fireEvent.submit(payForm()!);
    expect(onPaySubscription).not.toHaveBeenCalled();
    // The flyout stays open: the guard returns before the reset as well as before the call.
    expect(screen.queryByRole('button', { name: /Verify & Log Settle Record/ })).not.toBeNull();
  });

  it('toggles a subscription through the handler the app supplies', () => {
    const { onToggleSubscriptionStatus } = panel({ subscriptions: [sub('s1', 'Netflix', day(5), 'Paused')] });
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }));
    expect(onToggleSubscriptionStatus).toHaveBeenCalledWith('s1', 'Paused');
  });
});

describe('the wallet balance sheet and the cycle map', () => {
  it('bands every wallet, with cancelled rows excluded', () => {
    panel({
      cashAccounts: [cash('c1', 'Healthy', 90000), cash('c2', 'Thin', 2000)],
      cards: [
        creditCard('k1', 'Over', -11000, 10000),
        creditCard('k2', 'Busy', -9000, 10000),
        creditCard('k3', 'Calm', -1000, 10000),
        debitCard('k4', 'Gone', -1, { isCanceled: true }),
      ],
    });
    expect(screen.getAllByText('Low Balance')).toHaveLength(1); // only the thin cash account
    expect(screen.getAllByText('Critical Warning')).toHaveLength(1);
    expect(screen.getAllByText('Low Reserve')).toHaveLength(1);
    expect(screen.getAllByText('Nominal Balance')).toHaveLength(2); // healthy cash + calm credit
    expect(has('Gone')).toBe(false);
    expect(screen.getByText(/5 Accounts Tracked/)).toBeTruthy();
    // A credit row shows what is owed, never the negative sign it is stored with.
    expect(screen.getByText(`Rs.${grouped(11000)}`)).toBeTruthy();
  });

  it('lists every non-cancelled subscription in the cycle map, with its cost and cycle', () => {
    panel({ subscriptions: [sub('s1', 'Netflix', day(5)), sub('s2', 'NowTV', day(5), 'Cancelled')] });
    expect(screen.getByText('Active & Tracked')).toBeTruthy();
    expect(has('NowTV')).toBe(false);
    expect(screen.getByText(`Rs.${grouped(1200)} (Monthly)`)).toBeTruthy();
  });

  it('says so when there are no subscriptions registered at all', () => {
    panel();
    expect(screen.getByText(/No registered recurring subscriptions/)).toBeTruthy();
  });
});
