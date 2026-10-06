import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { CashAccount } from '../types';
import { NotificationProvider } from '../context/NotificationContext';
import CashCardManagement from './CashCardManagement';

afterEach(cleanup);

const WALLETS: CashAccount[] = [{ id: 'w1', name: 'Office safe', balance: 200 } as CashAccount];

function renderWallets(onEditCashAccount = vi.fn()) {
  render(
    <NotificationProvider>
      <CashCardManagement
        cashAccounts={WALLETS}
        cards={[]}
        onAddCashAccount={() => {}}
        onEditCashAccount={onEditCashAccount}
        onAddCard={() => {}}
        onDeleteCard={() => {}}
        onDeleteCashAccount={() => {}}
        currency="Rs."
        onUpdateCard={() => {}}
      />
    </NotificationProvider>,
  );
  return { onEditCashAccount };
}

function openSetBalance() {
  fireEvent.click(screen.getByRole('button', { name: 'Set balance for Office safe' }));
}

function box(name: string): HTMLInputElement {
  return screen.getByRole('spinbutton', { name }) as HTMLInputElement;
}

function pressConfirm() {
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
}

describe('Wallet balance correction', () => {
  it('states the true figure instead of moving an amount', () => {
    const { onEditCashAccount } = renderWallets();
    openSetBalance();
    // The box opens on what the wallet records today, so the correction is the real
    // number rather than a guess at the difference.
    expect(box('New balance').value).toBe('200');
    fireEvent.change(box('New balance'), { target: { value: '3200' } });
    pressConfirm();
    expect(onEditCashAccount).toHaveBeenCalledWith('w1', 3200);
  });

  it('does not mistake a stated balance for a deposit amount', () => {
    // Regression guard: a prefill leaking into the deposit path would add the whole
    // balance to itself.
    const { onEditCashAccount } = renderWallets();
    openSetBalance();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Deposit' }));
    expect(box('Amount').value).toBe('');
    fireEvent.change(box('Amount'), { target: { value: '500' } });
    pressConfirm();
    expect(onEditCashAccount).toHaveBeenCalledWith('w1', 700);
  });

  it('lets an empty wallet be recorded as nothing', () => {
    const { onEditCashAccount } = renderWallets();
    openSetBalance();
    fireEvent.change(box('New balance'), { target: { value: '0' } });
    pressConfirm();
    expect(onEditCashAccount).toHaveBeenCalledWith('w1', 0);
  });

  it('refuses a negative wallet and moves nothing', () => {
    const { onEditCashAccount } = renderWallets();
    openSetBalance();
    fireEvent.change(box('New balance'), { target: { value: '-5' } });
    pressConfirm();
    expect(onEditCashAccount).not.toHaveBeenCalled();
    expect(screen.queryByText('A wallet cannot hold negative cash')).toBeTruthy();
  });

  it('shows what the wallet records before the change is saved', () => {
    renderWallets();
    openSetBalance();
    const hint = Array.from(document.querySelectorAll('span')).find((el) =>
      (el.textContent || '').startsWith('This wallet records'),
    );
    expect(hint?.textContent).toContain('Rs.200');
  });
});
