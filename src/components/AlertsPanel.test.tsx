import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { AppState } from '../types';
import { AlertsPanel } from './AlertsPanel';

// The global setup stubs localStorage with bare vi.fn()s that discard writes,
// so back it with a real map — dismissal only means anything if it survives.
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
}

const STATE = {
  currency: 'Rs.',
  userProfile: { email: 'owner@example.com' },
  budgets: [{ id: 'b1', category: 'Food', limit: 100, spent: 140 }],
  subscriptions: [],
  debts: [],
  savingsGoals: [],
} as unknown as AppState;

/** The panel only exists while it has something to say, so its presence is the
 *  user-visible fact; the expanded list proves the alert was really there. */
const dismissButton = () => screen.queryByRole('button', { name: 'Dismiss all alerts' });

beforeEach(installFakeStorage);
afterEach(cleanup);

describe('AlertsPanel dismissal', () => {
  it('lists the alert before it is closed', () => {
    render(<AlertsPanel state={STATE} />);
    fireEvent.click(screen.getByRole('button', { name: /^1 alert/ }));
    expect(screen.getByText('Food budget exceeded')).toBeTruthy();
  });

  it('stays closed after the panel unmounts and comes back', () => {
    const first = render(<AlertsPanel state={STATE} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss all alerts' }));
    expect(dismissButton()).toBeNull();

    // Leaving the dashboard and returning is what used to bring it back.
    first.unmount();
    render(<AlertsPanel state={STATE} />);
    expect(dismissButton()).toBeNull();
  });

  it('still shows an alert a different account has not closed', () => {
    render(<AlertsPanel state={STATE} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss all alerts' }));
    cleanup();

    const other = { ...STATE, userProfile: { email: 'roommate@example.com' } } as unknown as AppState;
    render(<AlertsPanel state={other} />);
    expect(dismissButton()).not.toBeNull();
  });
});
