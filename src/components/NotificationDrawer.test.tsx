import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import NotificationDrawer from './NotificationDrawer';
import type { AppNotification } from '../types';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const NOTES: AppNotification[] = [
  { id: 'n1', type: 'alert', message: 'Card payment due tomorrow', date: '2026-10-02', read: false },
  { id: 'n2', type: 'reminder', message: 'Rent is overdue by 2 days', date: '2026-10-01', read: true },
  { id: 'n3', type: 'system', message: 'Ledger balanced', date: '2026-09-30', read: true },
];

function renderDrawer(notifications = NOTES) {
  const onClearAll = vi.fn();
  const onMarkRead = vi.fn();
  const onClear = vi.fn();
  const utils = render(
    <NotificationDrawer
      notifications={notifications}
      onMarkRead={onMarkRead}
      onClear={onClear}
      onClearAll={onClearAll}
      isOpen
      onClose={vi.fn()}
    />,
  );
  const button = () => utils.getByRole('button', { name: /clear all|confirm/i });
  return { ...utils, button, onClearAll, onMarkRead, onClear };
}

describe('NotificationDrawer clear all', () => {
  it('offers clear all while the list has entries', () => {
    expect(renderDrawer().queryByRole('button', { name: /clear all/i })).toBeTruthy();
  });

  it('hides clear all when there is nothing to clear', () => {
    const { queryByRole, getByText } = renderDrawer([]);
    expect(queryByRole('button', { name: /clear all/i })).toBeNull();
    expect(getByText('All clear')).toBeTruthy();
  });

  it('needs a second deliberate click before the bulk delete runs', () => {
    const { button, onClearAll } = renderDrawer();

    fireEvent.click(button());
    expect(onClearAll).not.toHaveBeenCalled();
    expect(button().textContent).toMatch(/confirm/i);

    fireEvent.click(button());
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it('disarms itself if the confirmation is left hanging', () => {
    vi.useFakeTimers();
    const { button, onClearAll } = renderDrawer();

    fireEvent.click(button());
    act(() => {
      vi.advanceTimersByTime(3600);
    });

    expect(button().textContent).toMatch(/clear all/i);

    // The expired arm must not be a loaded gun: one click now only re-arms.
    fireEvent.click(button());
    expect(onClearAll).not.toHaveBeenCalled();
  });

  it('leaves the per-item actions intact', () => {
    const { getByText, onMarkRead, onClear } = renderDrawer();

    fireEvent.click(getByText('Read'));
    expect(onMarkRead).toHaveBeenCalledWith('n1');
    expect(onClear).not.toHaveBeenCalled();
  });
});
