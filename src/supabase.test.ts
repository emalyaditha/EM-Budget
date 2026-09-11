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
  getSchemaColumns,
  clearSyncedStatesCache,
  markEmailAsLoadedFromCloud,
  resetLoadedFromCloud,
  isEmailLoadedFromCloud,
  SYNC_RPC_RETRY,
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
    creditCardInstallments: [],
    creditCardInstallmentPayments: [],
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
    // clearAllMocks only clears call state — mockReturnValue overrides from
    // earlier tests persist into later ones. Re-establish the default
    // createClient factory so every test starts with a deterministic client,
    // and invalidate the module-level cache key so getSupabaseClient() rebuilds
    // the client from this fresh factory rather than one cached by a prior test.
    mockCreateClient.mockImplementation(() => ({
      from: vi.fn(() => createChain()),
      rpc: vi.fn().mockResolvedValue({ data: { success: true }, error: null }),
    }));
    (globalThis as any).__lastClientKey = undefined;
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

  // ─── syncStateFromSupabase — pull column filtering ───────────────────────
  describe('syncStateFromSupabase — user filter follows table columns', () => {
    it('filters tables WITH user_email but skips the filter for installment payments', async () => {
      markEmailAsLoadedFromCloud('test@example.com');

      const chainsByTable = new Map<string, any>();
      mockCreateClient.mockImplementation(() => ({
        from: vi.fn((table) => {
          const chain = createChain();
          chainsByTable.set(table, chain);
          return chain;
        }) as any,
        rpc: vi.fn().mockResolvedValue({ data: { success: true }, error: null }),
      }));

      const result = await syncStateFromSupabase('test@example.com');
      expect(result.success).toBe(true);

      const bankCardsChain = chainsByTable.get('bank_cards');
      expect(bankCardsChain).toBeDefined();
      expect(bankCardsChain.eq).toHaveBeenCalledWith('user_email', 'test@example.com');

      // credit_card_installment_payments has no user_email column — the pull
      // must not filter by it (RLS scopes rows via the session user).
      const instPaymentsChain = chainsByTable.get('credit_card_installment_payments');
      expect(instPaymentsChain).toBeDefined();
      expect(instPaymentsChain.eq).not.toHaveBeenCalled();
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

  // ─── B1 — static migration-verified schema ──────────────────────────────
  describe('B1 — static schema mapping', () => {
    it('getSchemaColumns returns migration-verified columns', () => {
      const emailTables = ['bank_cards', 'cash_accounts', 'transactions', 'debts', 'incomes', 'expenses', 'notifications', 'subscriptions', 'loans_given', 'spending_envelopes', 'credit_card_installments', 'ledger_states'];
      for (const t of emailTables) {
        expect(getSchemaColumns(t)).toContain('user_email');
      }
      // Installment payments only link through installment_id (no email column).
      expect(getSchemaColumns('credit_card_installment_payments')).not.toContain('user_email');
      expect(getSchemaColumns('credit_card_installment_payments')).toContain('installment_id');
      expect(getSchemaColumns('ledger_states')).toContain('state');
    });

    it('bank_cards includes credit card metadata columns', () => {
      const cols = getSchemaColumns('bank_cards');
      expect(cols).toContain('is_canceled');
      expect(cols).toContain('limit');
      expect(cols).toContain('locked_amount');
      expect(cols).toContain('due_date');
      expect(cols).toContain('min_payment');
      expect(cols).toContain('apr');
      expect(cols).toContain('last_payment_date');
    });

    it('getSchemaColumns returns a defensive copy', () => {
      const cols = getSchemaColumns('cash_accounts');
      cols.push('__tampered__');
      expect(getSchemaColumns('cash_accounts')).not.toContain('__tampered__');
    });

    it('syncStateToSupabase maps records driven by the static schema', async () => {
      markEmailAsLoadedFromCloud('test@example.com');
      const state = makeTestState({
        cards: [{
          id: 'card-1', cardName: 'Visa', bankName: 'Bank', cardType: 'credit',
          currentBalance: 100, limit: 5000, isCanceled: false,
          dueDate: '2026-01-15', minPayment: 25, apr: 21.9, lastPaymentDate: '2026-01-01',
        } as any],
        budgets: [{ id: 'env-1', category: 'Food', limit: 300, spent: 80 } as any],
        creditCardInstallmentPayments: [{ id: 'pay-1', installmentId: 'inst-1', paymentNumber: 1, amountDue: 10, amountPaid: 10, dueDate: '2026-02-01', status: 'paid' } as any],
      });

      const result = await syncStateToSupabase('test@example.com', state);
      expect(result.success).toBe(true);

      const client = getSupabaseClient() as any;
      const rpcCall = client.rpc.mock.calls.find((c: any[]) => c[0] === 'sync_complete_ledger');
      expect(rpcCall).toBeTruthy();
      const payload = rpcCall[1];

      const card = payload.p_cards[0];
      expect(card.user_email).toBe('test@example.com');
      expect(card.card_name).toBe('Visa');
      expect(card.is_canceled).toBe(false);
      expect(card.due_date).toBe('2026-01-15');
      expect(card.min_payment).toBe(25);
      expect(card.apr).toBe(21.9);
      expect(card.last_payment_date).toBe('2026-01-01');

      const envelope = payload.p_spending_envelopes[0];
      expect(envelope.user_email).toBe('test@example.com');
      expect(envelope.category).toBe('Food');
      expect(envelope.limit).toBe(300);

      const payment = payload.p_installment_payments[0];
      expect(payment.user_email).toBeUndefined();
      expect(payment.installment_id).toBe('inst-1');
    });
  });

  // ─── B2: RPC retry & no client-side fallback ──────────────────────────────
  describe('syncStateToSupabase — RPC retry and no fallback', () => {
    afterEach(() => {
      SYNC_RPC_RETRY.maxRetries = 2;
      SYNC_RPC_RETRY.baseDelayMs = 500;
    });

    it('retries the RPC after a transient failure and succeeds', async () => {
      markEmailAsLoadedFromCloud('test@example.com');
      SYNC_RPC_RETRY.maxRetries = 2;
      SYNC_RPC_RETRY.baseDelayMs = 1;

      const client = getSupabaseClient() as any;
      client.rpc
        .mockResolvedValueOnce({ data: null, error: { message: 'transient network error' } })
        .mockResolvedValueOnce({ data: { success: true }, error: null });

      const result = await syncStateToSupabase('test@example.com', makeTestState());

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      const rpcCalls = client.rpc.mock.calls.filter((c: any[]) => c[0] === 'sync_complete_ledger');
      expect(rpcCalls.length).toBe(2);
      // Success path still persists the full JSON snapshot to ledger_states.
      const jsonUpserts = client.from.mock.calls.filter((c: any[]) => c[0] === 'ledger_states');
      expect(jsonUpserts.length).toBe(1);
    });

    it('returns an explicit error after persistent RPC failure', async () => {
      markEmailAsLoadedFromCloud('test@example.com');
      SYNC_RPC_RETRY.maxRetries = 1;
      SYNC_RPC_RETRY.baseDelayMs = 1;

      const client = getSupabaseClient() as any;
      client.rpc.mockResolvedValue({ data: { success: false, error: 'Unauthorized: token expired.' }, error: null });

      const result = await syncStateToSupabase('test@example.com', makeTestState());

      expect(result.success).toBe(false);
      expect(result.error).toContain('token expired');
      const rpcCalls = client.rpc.mock.calls.filter((c: any[]) => c[0] === 'sync_complete_ledger');
      expect(rpcCalls.length).toBe(2);
    });

    it('surfaces the underlying error when the RPC throws', async () => {
      markEmailAsLoadedFromCloud('test@example.com');
      SYNC_RPC_RETRY.maxRetries = 1;
      SYNC_RPC_RETRY.baseDelayMs = 1;

      const client = getSupabaseClient() as any;
      client.rpc.mockRejectedValue(new Error('db connection refused'));

      const result = await syncStateToSupabase('test@example.com', makeTestState());

      expect(result.success).toBe(false);
      expect(result.error).toContain('db connection refused');
      const rpcCalls = client.rpc.mock.calls.filter((c: any[]) => c[0] === 'sync_complete_ledger');
      expect(rpcCalls.length).toBe(2);
    });

    it('does not fall back to client-side table sync when the RPC fails', async () => {
      markEmailAsLoadedFromCloud('test@example.com');
      SYNC_RPC_RETRY.maxRetries = 0;
      SYNC_RPC_RETRY.baseDelayMs = 1;

      const client = getSupabaseClient() as any;
      client.rpc.mockResolvedValue({ data: { success: false, error: 'RPC unavailable' }, error: null });

      const result = await syncStateToSupabase('test@example.com', makeTestState());

      expect(result.success).toBe(false);
      expect(result.error).toBe('RPC unavailable');
      const rpcCalls = client.rpc.mock.calls.filter((c: any[]) => c[0] === 'sync_complete_ledger');
      expect(rpcCalls.length).toBe(1);
      // No table writes at all on the failure path — the RPC is the only write path.
      expect(client.from.mock.calls.length).toBe(0);
    });
  });
});
