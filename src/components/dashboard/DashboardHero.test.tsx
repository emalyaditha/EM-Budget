import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { DashboardHero } from './DashboardHero';
import type { HeroWallet } from './WalletDeck';

afterEach(cleanup);

function renderHero(todayOutflow: number) {
  return render(
    <DashboardHero currency="Rs." aggregateActiveWealth={1000} userName="Test User" todayOutflow={todayOutflow} />,
  );
}

describe('DashboardHero "Spent · today" pill', () => {
  it('shows the day total when expenses exist', () => {
    const { container } = renderHero(530);
    expect(container.textContent).toContain('Spent · today');
    expect(container.textContent).toContain('530');
    expect(container.textContent).not.toContain('No spend yet');
  });

  it('shows a placeholder when nothing was spent today', () => {
    const { container } = renderHero(0);
    expect(container.textContent).toContain('No spend yet');
  });

  it('keeps the month tiles intact', () => {
    const { container } = renderHero(120);
    expect(container.textContent).toContain('Income · month');
    expect(container.textContent).toContain('Spent · month');
  });
});

const wallets: HeroWallet[] = [
  { id: 'cash:a', kind: 'cash', name: 'Wallets', subname: 'Cash wallet', amount: 200 },
  { id: 'cash:b', kind: 'cash', name: 'Savings', subname: 'Cash wallet', amount: 3000 },
];

describe('DashboardHero single-wallet view', () => {
  function renderDeck() {
    return render(
      <DashboardHero currency="Rs." aggregateActiveWealth={3200} totalCashAmount={3200} wallets={wallets} />,
    );
  }

  it('opens on the aggregate, not on one account', () => {
    const { container } = renderDeck();
    expect(container.textContent).toContain('Available Balance');
    expect(container.textContent).not.toContain('All wallets Rs.3,200');
  });

  it('keeps the aggregate on screen while one account is shown, and restores it on tap', () => {
    const { container, getByLabelText, getByRole } = renderDeck();
    const select = getByLabelText('Choose which wallet the balance shows');
    fireEvent.change(select, { target: { value: 'cash:a' } });

    expect(container.textContent).toContain('Available · Wallets');
    expect(container.textContent).toContain('All wallets Rs.3,200');

    fireEvent.click(getByRole('button', { name: /All wallets/ }));
    expect(container.textContent).toContain('Available Balance');
  });
});
