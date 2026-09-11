import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useFocusTrap } from './useFocusTrap';

function TrapHarness({ enabled, onEscape }: { enabled: boolean; onEscape?: () => void }) {
  const ref = useFocusTrap<HTMLDivElement>(enabled, onEscape);
  return (
    <>
      <button type="button">trigger-before</button>
      <div ref={ref} tabIndex={-1}>
        <button type="button">first</button>
        <button type="button">second</button>
        <button type="button">last</button>
      </div>
      <button type="button">outside</button>
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useFocusTrap', () => {
  it('moves focus into the dialog when enabled', () => {
    render(<TrapHarness enabled />);
    // container has tabindex >= 0 (-1 is not >= 0), so first focusable gets focus
    expect((document.activeElement as HTMLElement).textContent).toBe('first');
  });

  it('traps Tab within the dialog and wraps to the first element at the end', () => {
    render(<TrapHarness enabled />);
    const first = screen.getByText('first');
    first.focus();
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Tab' });
    // focus moves to second (middle)
    expect((document.activeElement as HTMLElement).textContent).toBe('second');
    // move to last
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Tab' });
    expect((document.activeElement as HTMLElement).textContent).toBe('last');
    // Tab again from last wraps to first
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Tab' });
    expect((document.activeElement as HTMLElement).textContent).toBe('first');
  });

  it('traps Shift+Tab and wraps to the last element at the start', () => {
    render(<TrapHarness enabled />);
    const first = screen.getByText('first');
    const last = screen.getByText('last');
    first.focus();
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Tab', shiftKey: true });
    expect((document.activeElement as HTMLElement).textContent).toBe('last');
    last.focus();
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Tab', shiftKey: true });
    expect((document.activeElement as HTMLElement).textContent).toBe('second');
  });

  it('restores focus to the previously-focused element when the dialog closes', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'trigger-before';
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = render(<TrapHarness enabled />);
    // focus should now be inside the trap
    expect((document.activeElement as HTMLElement).textContent).toBe('first');

    unmount();
    // focus restored to the trigger that had focus before the trap mounted
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('calls onEscape when Escape is pressed', () => {
    const onEscape = vi.fn();
    render(<TrapHarness enabled onEscape={onEscape} />);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' });
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('does not trap focus when disabled', () => {
    render(<TrapHarness enabled={false} />);
    const outside = screen.getByText('outside');
    outside.focus();
    fireEvent.keyDown(outside, { key: 'Tab' });
    // no trap behavior; focus handling defaults to browser
    expect(document.activeElement).toBe(outside);
  });
});
