import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import type { AppState } from '../../types';
import { calculateNetWorth } from '../../utils';
import { buildHeroWallets, WalletDeck } from './WalletDeck';
import { DashboardHero } from './DashboardHero';

afterEach(cleanup);

const STATE = {
  cashAccounts: [
    { id: 'c1', name: 'Cash box', balance: 1200 },
    { id: 'c2', name: 'Bank pocket', balance: 300 },
  ],
  cards: [
    { id: 'd1', bankName: 'NDB', cardName: 'NDB NetX', cardType: 'Debit', currentBalance: 5000, lockedAmount: 750 },
    { id: 'd2', bankName: 'HNB', cardName: 'HNB Visa', cardType: 'Debit', currentBalance: 800, isCanceled: true },
    { id: 'r1', bankName: 'Commercial Bank', cardName: 'CB Smart', cardType: 'Credit', currentBalance: -38420 },
  ],
} as unknown as AppState;

describe('buildHeroWallets', () => {
  const wallets = buildHeroWallets(STATE);

  it('lists cash first, then debit, then credit, skipping cancelled cards', () => {
    expect(wallets.map((w) => w.id)).toEqual(['cash:c1', 'cash:c2', 'card:d1', 'card:r1']);
    expect(wallets.map((w) => w.kind)).toEqual(['cash', 'cash', 'debit', 'credit']);
  });

  it('nets a debit card against its locked amount, like calculateNetWorth does', () => {
    expect(wallets.find((w) => w.id === 'card:d1')?.amount).toBe(4250);
  });

  it('keeps a credit balance signed so the hero can read it as a liability', () => {
    expect(wallets.find((w) => w.id === 'card:r1')?.amount).toBe(-38420);
  });

  it('sums to exactly the net-worth cash + debit figures', () => {
    const worth = calculateNetWorth(STATE);
    const sum = wallets.filter((w) => w.kind !== 'credit').reduce((total, w) => total + w.amount, 0);
    expect(sum).toBeCloseTo(worth.cash + worth.debitCards, 10);
  });
});

describe('WalletDeck', () => {
  const wallets = buildHeroWallets(STATE);

  it('renders nothing for a single wallet — there is nothing to peek out', () => {
    const { container } = render(
      <WalletDeck wallets={wallets.slice(0, 1)} currency="Rs." selectedId="" onSelect={() => {}} />,
    );
    expect(container.querySelector('.deck')).toBeNull();
  });

  it('shows at most two peer faces no matter how many accounts exist', () => {
    const many = [...wallets, ...wallets, ...wallets];
    const { container } = render(<WalletDeck wallets={many} currency="Rs." selectedId="" onSelect={() => {}} />);
    expect(container.querySelectorAll('.deck-face')).toHaveLength(2);
  });

  it('rotates the selected wallet into the slot nearest the hero', () => {
    const { container } = render(
      <WalletDeck wallets={wallets} currency="Rs." selectedId="card:r1" onSelect={() => {}} />,
    );
    const nearest = container.querySelector('.deck-face[data-depth="1"] button');
    expect(nearest?.textContent).toContain('Commercial Bank');
  });

  it('selects a peer when its exposed lip is pressed', () => {
    const picked: string[] = [];
    const { container } = render(
      <WalletDeck wallets={wallets} currency="Rs." selectedId="" onSelect={(id) => picked.push(id)} />,
    );
    fireEvent.click(container.querySelector('.deck-face[data-depth="1"] button') as HTMLElement);
    expect(picked).toEqual(['cash:c1']);
  });
});

describe('DashboardHero wallet selection', () => {
  const wallets = buildHeroWallets(STATE);

  // The count-up lands on its final value in its first frame under reduced
  // motion, which keeps these assertions off the animation clock.
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query }) as unknown as MediaQueryList);
  });
  afterEach(() => vi.unstubAllGlobals());

  function renderHero() {
    return render(
      <DashboardHero
        currency="Rs."
        aggregateActiveWealth={1000}
        totalCashAmount={1500}
        totalDebitCardsAmount={4250}
        wallets={wallets}
      />,
    );
  }

  it('defaults to every wallet and reports cash + debit together', () => {
    const { container } = renderHero();
    expect(container.textContent).toContain('Available Balance');
    expect(container.textContent).toContain('5,750');
    expect(container.querySelector('.deck')).not.toBeNull();
  });

  it('names the liability and never renders a minus sign for it', () => {
    const { container } = renderHero();
    fireEvent.change(container.querySelector('select') as HTMLSelectElement, { target: { value: 'card:r1' } });
    expect(container.textContent).toContain('Owed · Commercial Bank');
    expect(container.textContent).toContain('38,420');
    expect(container.textContent).not.toContain('-');
  });

  it('renders no deck and no chip when the ledger has no accounts', () => {
    const { container } = render(
      <DashboardHero currency="Rs." aggregateActiveWealth={0} totalCashAmount={0} totalDebitCardsAmount={0} />,
    );
    expect(container.querySelector('.deck')).toBeNull();
    expect(container.querySelector('select')).toBeNull();
    expect(container.textContent).toContain('Available Balance');
  });
});
