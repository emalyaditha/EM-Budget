import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(', ');

function getFocusable(el: HTMLElement): HTMLElement[] {
  return Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (node) => !node.hasAttribute('disabled') && node.getAttribute('aria-hidden') !== 'true',
  );
}

/**
 * Traps keyboard focus inside the attached container while enabled, restores focus
 * to the previously-focused element on cleanup, and optionally closes on Escape.
 *
 * - Maintains a cyclic Tab/Shift+Tab order over focusable descendants of the container.
 * - On enable, moves focus into the dialog and remembers the element that had focus
 *   before so it can be restored when the dialog closes.
 * - Returns a `ref` to attach to the dialog root element.
 */
export function useFocusTrap<T extends HTMLElement>(enabled: boolean, onEscape?: () => void) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;
    const container = ref.current;
    if (!container) return undefined;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Initial focus: prefer the container itself (has tabindex) else first focusable.
    const focusables = getFocusable(container);
    if (container.tabIndex >= 0) container.focus();
    else focusables[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onEscape?.();
        return;
      }
      if (e.key !== 'Tab') return;

      const nodes = getFocusable(container);
      if (nodes.length === 0) {
        e.preventDefault();
        return;
      }

      e.preventDefault();
      const current = document.activeElement as HTMLElement | null;
      const index = current && container.contains(current) ? nodes.indexOf(current) : -1;

      let nextIndex: number;
      if (e.shiftKey) {
        nextIndex = index <= 0 ? nodes.length - 1 : index - 1;
      } else {
        nextIndex = index === -1 || index === nodes.length - 1 ? 0 : index + 1;
      }
      nodes[nextIndex].focus();
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, [enabled, onEscape]);

  return ref;
}
