export type SyncPhase = 'idle' | 'syncing' | 'synced' | 'error' | 'disabled';

export type SyncTone = 'synced' | 'pending' | 'unavailable';

export interface SyncStatusInput {
  phase: SyncPhase;
  isOnline: boolean;
  isReachable: boolean;
  error?: string | null;
}

export interface SyncStatusView {
  tone: SyncTone;
  dotClass: string;
  textClass: string;
  label: string;
  detail: string;
}

const TONE_CLASS: Record<SyncTone, { dot: string; text: string }> = {
  synced: { dot: 'bg-[var(--success)]', text: 'text-[var(--success)]' },
  // Orange means "your data is not in the cloud yet" — either mid-upload or
  // waiting for the safety guard to allow the first push.
  pending: { dot: 'bg-amber-500', text: 'text-amber-500' },
  // Gray is deliberately not red: a cloud that cannot be reached is not a
  // broken ledger, and the local mirror still holds every edit.
  unavailable: { dot: 'bg-[var(--ink-3)]', text: 'text-[var(--ink-3)]' },
};

function view(tone: SyncTone, label: string, detail: string, pulse: boolean): SyncStatusView {
  const cls = TONE_CLASS[tone];
  return {
    tone,
    dotClass: pulse ? `${cls.dot} animate-pulse` : cls.dot,
    textClass: pulse ? `${cls.text} animate-pulse` : cls.text,
    label,
    detail,
  };
}

// One derivation shared by the avatar dot, the header pill and the footer. They
// previously each re-implemented the mapping and had already drifted apart (the
// footer accounted for connectivity, the pill did not).
//
// Connectivity is checked before `phase` deliberately: while the cloud is
// unreachable the push is never even attempted, so a leftover 'synced' phase
// from the last successful upload must not be reported as green.
export function deriveSyncStatus({ phase, isOnline, isReachable, error }: SyncStatusInput): SyncStatusView {
  if (!isOnline) {
    return view(
      'unavailable',
      'Offline',
      'No internet connection. Changes are saved on this device and will sync when you reconnect.',
      true,
    );
  }

  if (!isReachable) {
    return view(
      'unavailable',
      'No cloud',
      'The database could not be reached. Your changes are safe on this device.',
      true,
    );
  }

  if (phase === 'error') {
    return view(
      'unavailable',
      'Sync error',
      // No promise of an automatic retry: once the push's own backoff is
      // exhausted nothing re-attempts it until the next edit or reconnect.
      error || 'The database rejected the upload. Your changes are safe on this device.',
      true,
    );
  }

  if (phase === 'disabled') {
    return view(
      'unavailable',
      'Auto-sync off',
      'Cloud sync is turned off in Settings. This ledger lives only on this device.',
      false,
    );
  }

  if (phase === 'syncing') {
    return view('pending', 'Syncing', 'Uploading your changes to the cloud…', true);
  }

  if (phase === 'idle') {
    return view('pending', 'Not synced', 'Waiting for the cloud copy before your changes can be uploaded.', false);
  }

  return view('synced', 'Synced', 'Every change is saved to the cloud.', false);
}
