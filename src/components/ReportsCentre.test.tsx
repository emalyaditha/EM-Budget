import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { Transaction } from '../types';
import { todayLocal } from '../utils';
import ReportsCentre from './ReportsCentre';

afterEach(cleanup);

const TODAY = todayLocal();

/** One purchase, one salary, one balance correction and one deletion stamp, all on
 *  the same day. Only the purchase is spending — the other three used to be counted
 *  as spending by the "Spending velocity" chart, which summed every row of any type. */
const ROWS: Transaction[] = [
  {
    id: 'x1',
    type: 'expense',
    title: 'Groceries',
    amount: 500,
    date: TODAY,
    category: 'Food',
    updated_at: TODAY,
    updatedAt: TODAY,
  },
  {
    id: 'x2',
    type: 'income',
    title: 'Salary',
    amount: 100000,
    date: TODAY,
    category: 'Salary',
    updated_at: TODAY,
    updatedAt: TODAY,
  },
  {
    id: 'x3',
    type: 'deposit',
    title: 'Balance adjustment: Wallet',
    amount: 71050,
    date: TODAY,
    category: 'Adjustment',
    updated_at: TODAY,
    updatedAt: TODAY,
  },
  {
    id: 'x4',
    type: 'expense',
    title: 'Transaction Deleted: Coffee',
    amount: 0,
    date: TODAY,
    category: 'Transaction Deletion',
    updated_at: TODAY,
    updatedAt: TODAY,
  },
];

function renderReports(transactions: Transaction[] = ROWS) {
  return render(
    <ReportsCentre
      transactions={transactions}
      incomes={[]}
      expenses={[]}
      debts={[]}
      loansGiven={[]}
      cashAccounts={[]}
      cards={[]}
      currency="Rs."
      onSelectTransaction={() => {}}
    />,
  );
}

describe('Reports Centre monthly figures', () => {
  it('counts only purchases in the spending velocity series', () => {
    const { container } = renderReports();
    // The velocity chart stamps each plotted point with `<date>: <currency> <value>`.
    const points = Array.from(container.querySelectorAll('title'))
      .map((t) => t.textContent || '')
      .filter((text) => text.startsWith(TODAY));
    expect(points).toEqual([`${TODAY}: Rs. 500`]);
  });

  it('reports the month net of the purchase alone', () => {
    const { container } = renderReports();
    // A salary and a hand-corrected balance must not be spent money, and the purchase
    // must still be taken off the surplus: 100,000 in, 500 out.
    expect(container.textContent).toContain('Rs.99,500');
    expect(container.textContent).toContain('SettledRs.500');
  });

  it('leaves zero-amount audit stamps out of the category breakdown', () => {
    const { container } = renderReports();
    const spread = Array.from(container.querySelectorAll('.card')).find((el) =>
      (el.textContent || '').includes('Breakdown of expenses by category'),
    );
    expect(spread).toBeDefined();
    expect(spread!.textContent).toContain('Food');
    // The deletion and adjustment stamps are listed in the ledger below, but they are
    // not spending categories and used to appear here at 0%.
    expect(spread!.textContent).not.toContain('Transaction Deletion');
    expect(spread!.textContent).not.toContain('Adjustment');
  });
});
