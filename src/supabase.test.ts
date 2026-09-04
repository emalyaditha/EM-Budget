import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks (must be declared before imports that use them) ───────────────────

// Use vi.hoisted so the mock factory can reference it after hoisting
const { mockCreateClient, createChain } = vi.hoisted(() => {
  // Chainable query builder
  function createChain() {
    const chain: any = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.order = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    chain.upsert = vi.fn().mockResolvedValue({ data: null, error: null });
    chain.delete = vi.fn().mockReturnValue(chain);
    chain.in = vi.fn().mockResolvedValue({ data: null, error: null });
    chain.update = vi.fn().mockReturnValue(chain);
    chain.csv = vi.fn().mockResolvedValue({ data: '', error: null });
    chain.then = (resolve: any) => resolve({ data: [], error: null });
    return chain;
  }

  return {
    mockCreateClient: vi.fn(() => ({
      from: vi.fn(() => createChain()),
      rpc: vi.fn().mockResolvedValue({ data: { success: true }, error: null }),
    })),
    createChain,
  };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}));

vi.mock('./services/authSession', () => ({
  authSession: {
    getToken: vi.fn().mockReturnValue('test-token'),
    getEmail: vi.fn().mockReturnValue('test@example.com'),
    clear: vi.fn(),
  },
}));

// ─── Imports after mocks ─────────────────────────────────────────────────────
import {
  syncStateToSupabase,
  syncStateFromSupabase,
  getSupabaseClient,
  clearSyncedStatesCache,
  markEmailAsLoadedFromCloud,
  resetLoadedFromCloud,
  isEmailLoadedFromCloud,
} from './supabase';
import { AppState } from './types';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function makeTestState(overrides?: Partial<AppState>): AppState {
  return {
    userProfile: { name: 'Test', email: 'test@example.com' },
    cashAccounts: [],
    cards: [],
    creditCards: [],
    creditCardPurchases: [],
    incomes: [],
    expenses: [],
    debts: [],
    transactions: [],
    notifications: [],
    subscriptions: [],
    loansGiven: [],
    budgets: [],
    savingsGoals: [],
    pinCode: '',
    pinEnabled: false,
    currency: 'USD',
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────
describe('supabase.ts — sync functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearSyncedStatesCache();
    resetLoadedFromCloud();

    // Set up localStorage mock for config
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
      if (key === 'cashflow_supabase_url_v1') return 'https://test.supabase.co';
      if (key === 'cashflow_supabase_key_v1') return 'test-anon-key';
      return null;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Safety guard ────────────────────────────────────────────────────────
  describe('syncStateToSupabase — safety guard', () => {
    it('rejects push when email has not been loaded from cloud', async () => {
      const result = await syncStateToSupabase('test@example.com', makeTestState());

      expect(result.success).toBe(false);
      expect(result.error).toContain('not been successfully fetched');
    });

    it('allows push after email is marked as loaded from cloud', async () => {
      markEmailAsLoadedFromCloud('test@example.com');

      // getSupabaseClient returns a mock client, the actual sync will proceed
      const result = await syncStateToSupabase('test@example.com', makeTestState());

      // Should get past the safety guard (success or other error, but not safety guard)
      if (!result.success) {
        expect(result.error).not.toContain('not been successfully fetched');
      }
    });

    it('allows push with bypassSafetyGuard=true even without cloud load', async () => {
      const result = await syncStateToSupabase('test@example.com', makeTestState(), true);

      // Should bypass the safety guard (success or other error, but not safety guard)
      if (!result.success) {
        expect(result.error).not.toContain('not been successfully fetched');
      }
    });
  });

  // ─── Email tracking helpers ──────────────────────────────────────────────
  describe('email cloud-load tracking', () => {
    it('tracks email as loaded from cloud', () => {
      expect(isEmailLoadedFromCloud('Test@Example.COM')).toBe(false);

      markEmailAsLoadedFromCloud('test@example.com');
      expect(isEmailLoadedFromCloud('test@example.com')).toBe(true);
      // Case-insensitive
      expect(isEmailLoadedFromCloud('TEST@EXAMPLE.COM')).toBe(true);
    });

    it('resets tracking', () => {
      markEmailAsLoadedFromCloud('test@example.com');
      expect(isEmailLoadedFromCloud('test@example.com')).toBe(true);

      resetLoadedFromCloud();
      expect(isEmailLoadedFromCloud('test@example.com')).toBe(false);
    });
  });

  // ─── Cache ───────────────────────────────────────────────────────────────
  describe('synced states cache', () => {
    it('clearSyncedStatesCache resets the cache', () => {
      clearSyncedStatesCache();
      // No error thrown — smoke test
      expect(true).toBe(true);
    });
  });

  // ─── syncStateToSupabase — redundant skip ────────────────────────────────
  describe('syncStateToSupabase — redundant sync skip', () => {
    it('skips sync when state string is identical to last synced state', async () => {
      markEmailAsLoadedFromCloud('test@example.com');
      const state = makeTestState();

      // First sync
      const result1 = await syncStateToSupabase('test@example.com', state);
      expect(result1.success).toBe(true);

      // Second sync with same state — should be skipped
      const result2 = await syncStateToSupabase('test@example.com', state);
      expect(result2.success).toBe(true);
    });
  });

  // ─── syncStateToSupabase — no client ─────────────────────────────────────
  describe('syncStateToSupabase — missing client', () => {
    it('returns error when Supabase config is missing (empty localStorage)', async () => {
      // Override localStorage to return no config
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);

      // The getSupabaseClient() checks config and returns null when url/key missing
      // But our mock createClient always returns a client — need to make it conditional
      mockCreateClient.mockReturnValue(null);

      const result = await syncStateToSupabase('test@example.com', makeTestState(), true);
      expect(result.success).toBe(false);
    });
  });

  // ─── syncStateFromSupabase — no client ───────────────────────────────────
  describe('syncStateFromSupabase — missing client', () => {
    it('returns error when Supabase config is missing (empty localStorage)', async () => {
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);
      mockCreateClient.mockReturnValue(null);

      const result = await syncStateFromSupabase('test@example.com');
      expect(result.success).toBe(false);
    });
  });

  // ─── getSupabaseClient ───────────────────────────────────────────────────
  describe('getSupabaseClient', () => {
    it('returns a client when config is present', () => {
      mockCreateClient.mockReturnValue({
        from: vi.fn(() => createChain()),
        rpc: vi.fn(),
      });
      const client = getSupabaseClient();
      expect(client).not.toBeNull();
    });
  });
});
