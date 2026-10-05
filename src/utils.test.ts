import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  markStateDirty,
  clearStateDirty,
  isStateDirty,
  recordDeletions,
  getTombstonedIds,
  clearTombstones,
  isAlertDayRecent,
  recordDismissedAlerts,
  getDismissedAlertIds,
} from './utils';

const DISMISSED_KEY = 'cashflow_manager_dismissed_alerts_v1';

/** Local calendar day `offset` days from today, in the `YYYY-MM-DD` the ledger stores. */
function dayOffset(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// The global test setup stubs localStorage with bare vi.fn()s that discard
// writes, so back it with a real map — these functions only mean anything if
// the value actually survives the write.
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
  return store;
}

describe('unsynced-state marker', () => {
  beforeEach(() => installFakeStorage());

  it('is set by an edit and released only by a confirmed push', () => {
    markStateDirty('a@example.com');
    expect(isStateDirty('a@example.com')).toBe(true);

    clearStateDirty('a@example.com');
    expect(isStateDirty('a@example.com')).toBe(false);
  });

  it('is scoped to its owner so a shared device cannot cross signals', () => {
    markStateDirty('a@example.com');
    expect(isStateDirty('b@example.com')).toBe(false);
  });

  it('ignores a clear request from a different owner', () => {
    markStateDirty('a@example.com');
    clearStateDirty('B@example.com');
    expect(isStateDirty('a@example.com')).toBe(true);
  });

  it('matches owners case-insensitively', () => {
    markStateDirty('A@Example.COM');
    expect(isStateDirty('a@example.com')).toBe(true);
  });

  it('treats a missing email as never dirty', () => {
    markStateDirty(undefined);
    expect(isStateDirty(undefined)).toBe(false);
    expect(isStateDirty('')).toBe(false);
  });
});

describe('deletion tombstones', () => {
  beforeEach(() => installFakeStorage());

  it('survives the read-back so a killed tab can suppress cloud resurrection', () => {
    recordDeletions('a@example.com', ['tx-1', 'debt-2']);
    expect(getTombstonedIds('a@example.com')).toEqual(new Set(['tx-1', 'debt-2']));
  });

  it('accumulates without dropping earlier deletions', () => {
    recordDeletions('a@example.com', ['tx-1']);
    recordDeletions('a@example.com', ['tx-2']);
    expect([...getTombstonedIds('a@example.com')].sort()).toEqual(['tx-1', 'tx-2']);
  });

  it('releases every tombstone once the server confirms', () => {
    recordDeletions('a@example.com', ['tx-1', 'tx-2']);
    clearTombstones('a@example.com');
    expect(getTombstonedIds('a@example.com').size).toBe(0);
  });

  it('does not leak deletions across accounts', () => {
    recordDeletions('a@example.com', ['tx-1']);
    expect(getTombstonedIds('b@example.com').size).toBe(0);

    clearTombstones('b@example.com');
    expect(getTombstonedIds('a@example.com')).toEqual(new Set(['tx-1']));
  });

  it('is a no-op for an empty id list', () => {
    recordDeletions('a@example.com', []);
    expect(getTombstonedIds('a@example.com').size).toBe(0);
  });

  it('discards a corrupt store instead of throwing', () => {
    localStorage.setItem('cashflow_manager_deleted_ids_v1', '{"a@example.com": [1, "ok"}');
    expect(getTombstonedIds('a@example.com').size).toBe(0);

    localStorage.setItem('cashflow_manager_deleted_ids_v1', '[1,2,3]');
    expect(getTombstonedIds('a@example.com').size).toBe(0);
  });

  it('ignores non-string ids when parsing', () => {
    localStorage.setItem('cashflow_manager_deleted_ids_v1', JSON.stringify({ 'a@example.com': ['ok', 7, null] }));
    expect(getTombstonedIds('a@example.com')).toEqual(new Set(['ok']));
  });
});

describe('isAlertDayRecent', () => {
  it('covers the day itself and the day before', () => {
    expect(isAlertDayRecent(dayOffset(0))).toBe(true);
    expect(isAlertDayRecent(dayOffset(-1))).toBe(true);
  });

  it('drops anything older, and anything not yet due', () => {
    expect(isAlertDayRecent(dayOffset(-2))).toBe(false);
    expect(isAlertDayRecent(dayOffset(1))).toBe(false);
  });

  it('reads a full timestamp as its local day', () => {
    expect(isAlertDayRecent(new Date().toISOString())).toBe(true);
    expect(isAlertDayRecent(new Date(Date.now() - 3 * 86400000).toISOString())).toBe(false);
  });

  it('is false for a missing or unreadable date', () => {
    expect(isAlertDayRecent(undefined)).toBe(false);
    expect(isAlertDayRecent('')).toBe(false);
    expect(isAlertDayRecent('not a date')).toBe(false);
  });
});

describe('dismissed alerts', () => {
  beforeEach(() => installFakeStorage());

  it('survives the read-back so a closed alert stays closed across remounts', () => {
    recordDismissedAlerts('a@example.com', ['budget-over-1']);
    expect(getDismissedAlertIds('a@example.com')).toEqual(new Set(['budget-over-1']));
  });

  it('is scoped to its owner', () => {
    recordDismissedAlerts('a@example.com', ['bill-due-1']);
    expect(getDismissedAlertIds('b@example.com').size).toBe(0);
  });

  it('stops honouring a closure once it falls outside the two-day window', () => {
    localStorage.setItem(
      DISMISSED_KEY,
      JSON.stringify({ 'a@example.com': { old: dayOffset(-3), recent: dayOffset(-1) } }),
    );
    expect(getDismissedAlertIds('a@example.com')).toEqual(new Set(['recent']));
  });

  it('prunes expired closures while writing a new one', () => {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify({ 'a@example.com': { old: dayOffset(-9) } }));
    recordDismissedAlerts('a@example.com', ['fresh']);
    const stored = JSON.parse(localStorage.getItem(DISMISSED_KEY)!) as Record<string, Record<string, string>>;
    expect(Object.keys(stored['a@example.com'])).toEqual(['fresh']);
  });

  it('discards a corrupt store instead of throwing', () => {
    localStorage.setItem(DISMISSED_KEY, '{"a@example.com": {"x"');
    expect(getDismissedAlertIds('a@example.com').size).toBe(0);
    localStorage.setItem(DISMISSED_KEY, '[1,2,3]');
    expect(getDismissedAlertIds('a@example.com').size).toBe(0);
  });
});
