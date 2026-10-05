import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { AppState } from '../types';
import { todayLocal } from '../utils';
import Dashboard from './Dashboard';

afterEach(cleanup);

const STATE = {
  currency: 'Rs.',
  transactions: [
    { id: 't1', type: 'expense', title: 'Coffee today', amount: 450, date: todayLocal(), category: 'Food' },
    {
      id: 't2',
      type: 'expense',
      title: 'Car service',
      amount: 12000,
      date: `${Number(todayLocal().slice(0, 4)) - 1}-01-04`,
      category: 'Transport',
    },
  ],
  loansGiven: [],
  budgets: [],
  subscriptions: [],
  cashAccounts: [],
  cards: [],
} as unknown as AppState;

function renderDashboard() {
  return render(
    <Dashboard
      state={STATE}
      aggregateActiveWealth={0}
      totalCashAmount={0}
      totalDebitCardsAmount={0}
      currentMonthLabel="Month"
      currentMonthInflow={0}
      currentMonthOutflow={0}
      setActiveTab={() => {}}
      setEditingTransactionId={() => {}}
      onAddIncome={() => {}}
      onAddExpense={() => {}}
    />,
  );
}

describe('Dashboard transactions panel', () => {
  it('opens on Recent, which is today only', () => {
    renderDashboard();
    const panel = screen.getByRole('region', { name: 'Transactions' });
    expect(panel.textContent).toContain('Coffee today');
    expect(panel.textContent).not.toContain('Car service');
  });

  it('shows the whole ledger once View All is selected', () => {
    renderDashboard();
    fireEvent.click(screen.getByRole('tab', { name: 'View All' }));
    const panel = screen.getByRole('region', { name: 'Transactions' });
    expect(panel.textContent).toContain('Coffee today');
    expect(panel.textContent).toContain('Car service');
  });

  // A date-only ledger entry must not be dressed up as a midnight timestamp.
  it('renders the ledger date without an invented time', () => {
    renderDashboard();
    fireEvent.click(screen.getByRole('tab', { name: 'View All' }));
    expect(screen.getByRole('region', { name: 'Transactions' }).textContent).not.toMatch(/\d{1,2}:\d{2}\s?[AP]M/i);
  });
});
