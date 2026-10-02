import { describe, it, expect } from 'vitest';
import { deriveSyncStatus, type SyncStatusInput } from './syncStatus';

const view = (over: Partial<SyncStatusInput>) =>
  deriveSyncStatus({ phase: 'synced', isOnline: true, isReachable: true, error: null, ...over });

describe('deriveSyncStatus', () => {
  it('is green only when every change reached the cloud', () => {
    const v = view({ phase: 'synced' });
    expect(v.tone).toBe('synced');
    expect(v.dotClass).toBe('bg-[var(--success)]');
    expect(v.textClass).toBe('text-[var(--success)]');
    expect(v.label).toBe('Synced');
  });

  it('is orange while uploading and while waiting to upload', () => {
    expect(view({ phase: 'syncing' }).tone).toBe('pending');
    expect(view({ phase: 'syncing' }).dotClass).toContain('bg-amber-500');
    expect(view({ phase: 'idle' }).tone).toBe('pending');
    expect(view({ phase: 'idle' }).dotClass).toBe('bg-amber-500');
  });

  it('is gray when the database cannot be reached', () => {
    const v = view({ phase: 'error', error: 'RLS blocked the write' });
    expect(v.tone).toBe('unavailable');
    expect(v.dotClass).toContain('bg-[var(--ink-3)]');
    expect(v.textClass).toContain('text-[var(--ink-3)]');
    expect(v.detail).toBe('RLS blocked the write');
  });

  it('falls back to a usable detail when the error carries no message', () => {
    expect(view({ phase: 'error', error: null }).detail).toBeTruthy();
  });

  // A stale 'synced' phase from the last successful upload must not report green
  // while the cloud is currently unreachable — the user would believe unsent
  // edits are safe.
  it('connectivity outranks a leftover synced phase', () => {
    expect(view({ phase: 'synced', isOnline: false }).tone).toBe('unavailable');
    expect(view({ phase: 'synced', isReachable: false }).tone).toBe('unavailable');
  });

  it('distinguishes no internet from cloud unreachable', () => {
    expect(view({ phase: 'synced', isOnline: false }).label).toBe('Offline');
    expect(view({ phase: 'synced', isOnline: true, isReachable: false }).label).toBe('No cloud');
  });

  it('reports auto-sync being disabled as unavailable, not as an error', () => {
    const v = view({ phase: 'disabled' });
    expect(v.tone).toBe('unavailable');
    expect(v.label).toBe('Auto-sync off');
    expect(v.detail).toContain('Settings');
  });

  it('never returns an empty label or detail', () => {
    const phases = ['idle', 'syncing', 'synced', 'error', 'disabled'] as const;
    for (const phase of phases) {
      for (const isOnline of [true, false]) {
        for (const isReachable of [true, false]) {
          const v = view({ phase, isOnline, isReachable });
          expect(v.label.length).toBeGreaterThan(0);
          expect(v.detail.length).toBeGreaterThan(0);
          expect(v.dotClass.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('uses exactly three dot colours so the scheme stays readable at 8px', () => {
    const classes = new Set<string>();
    const phases = ['idle', 'syncing', 'synced', 'error', 'disabled'] as const;
    for (const phase of phases) {
      for (const isOnline of [true, false]) {
        for (const isReachable of [true, false]) {
          classes.add(view({ phase, isOnline, isReachable }).dotClass.replace(' animate-pulse', ''));
        }
      }
    }
    expect(classes.size).toBe(3);
  });
});
