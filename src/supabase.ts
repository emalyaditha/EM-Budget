import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppState } from './types';
import { DEFAULT_APP_STATE } from './initialData';
import { authSession } from './services/authSession';
import { safeJson } from './lib/api';

const URL_STORAGE_KEY = 'cashflow_supabase_url_v1';
const KEY_STORAGE_KEY = 'cashflow_supabase_key_v1';
const AUTO_SYNC_KEY = 'cashflow_supabase_auto_sync_v1';

// Synchronized states cache to prevent redundant pushes
let lastSyncedStatesCache: { [email: string]: string } = {};

export function clearSyncedStatesCache() {
  lastSyncedStatesCache = {};
}

// Session safety guard to prevent background pushes with empty state before a successful fetch
const loadedFromCloudEmails = new Set<string>();

export function markEmailAsLoadedFromCloud(email: string) {
  loadedFromCloudEmails.add(email.trim().toLowerCase());
}

export function isEmailLoadedFromCloud(email: string): boolean {
  return loadedFromCloudEmails.has(email.trim().toLowerCase());
}

export function resetLoadedFromCloud() {
  loadedFromCloudEmails.clear();
}

// Default provided by the user
export function getSupabaseConfig() {
  const meta = import.meta as any;
  
  let url = (localStorage.getItem(URL_STORAGE_KEY) || (meta.env && meta.env.VITE_SUPABASE_URL) || '').trim();
  let key = (localStorage.getItem(KEY_STORAGE_KEY) || (meta.env && meta.env.VITE_SUPABASE_ANON_KEY) || '').trim();
  
  // Guard against stringified 'undefined' or 'null'
  if (url === 'undefined' || url === 'null') url = '';
  if (key === 'undefined' || key === 'null') key = '';

  // Auto-swapped or misconfigured variable detection
  if (url.startsWith('eyJ') && (key.startsWith('http://') || key.startsWith('https://'))) {
    const temp = url;
    url = key;
    key = temp;
  }

  // Decode JWT to extract the Project Reference ID if URL is a JWT
  if (url.startsWith('eyJ')) {
    try {
      const parts = url.split('.');
      if (parts.length >= 2) {
        const payloadStr = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
        const payload = JSON.parse(payloadStr);
        if (payload && payload.ref) {
          if (!key || key === '' || key === url) {
            key = url;
          }
          url = `https://${payload.ref}.supabase.co`;
        }
      }
    } catch (e) {
      console.error('[Supabase Autocorrect] Failed to decode JWT payload:', e);
    }
  }

  const storedAutoSync = localStorage.getItem(AUTO_SYNC_KEY);
  const autoSync = storedAutoSync === null ? true : storedAutoSync === 'true';
  
  if (!url) {
    console.warn('[CONFIG] Supabase URL is missing!');
  } else if (!url.startsWith('https://') && !url.startsWith('http://')) {
    console.warn('[CONFIG] Supabase URL must start with http:// or https://');
  }
  
  if (!key) {
    console.warn('[CONFIG] Supabase ANON Key is missing!');
  }
  
  return { url, key, autoSync };
}

export function saveSupabaseConfig(url: string, key: string, autoSync: boolean) {
  localStorage.setItem(URL_STORAGE_KEY, url.trim());
  localStorage.setItem(KEY_STORAGE_KEY, key.trim());
  localStorage.setItem(AUTO_SYNC_KEY, String(autoSync));
}

// Resolve Supabase config from the backend when the current device has no
// build-time VITE_ env vars baked in and nothing saved in localStorage yet.
// The anon key is public (VITE_ prefix), so /api/config returns it freely.
export async function ensureSupabaseConfigFromBackend(): Promise<void> {
  const current = getSupabaseConfig();
  if (current.url && current.key) return;
  try {
    const base = (import.meta as any).env?.VITE_API_URL || '';
    const res = await fetch(`${base}/api/config`, { method: 'GET', headers: { Accept: 'application/json' } });
    const data = await safeJson(res);
    if (!data) return;
    const newUrl = (data.supabaseUrl || '').trim();
    const newKey = (data.supabaseKey || '').trim();
    if (!newUrl) return;
    const cfg = getSupabaseConfig();
    saveSupabaseConfig(newUrl, newKey || cfg.key, cfg.autoSync);
  } catch (e) {
    console.warn('[Config] Failed to auto-load Supabase config from backend:', e);
  }
}

// Pull the user's subscriptions from the database through the backend, which
// uses the service-role key (bypasses RLS). Returns the canonical Subscription
// objects, or [] on any failure so callers can proceed harmlessly.
export async function refreshSubscriptionsFromBackend(email: string, token: string): Promise<any[]> {
  try {
    const base = (import.meta as any).env?.VITE_API_URL || '';
    const res = await fetch(`${base}/api/sync/refresh-subscriptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ email }),
    });
    const data = await safeJson(res);
    if (data && data.success && Array.isArray(data.subscriptions)) {
      return data.subscriptions;
    }
    return [];
  } catch (e) {
    console.warn('[Sync] Backend subscription refresh failed:', e);
    return [];
  }
}

let supabaseClientInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  const { url, key } = getSupabaseConfig();
  if (!url || !key || (!url.startsWith('https://') && !url.startsWith('http://'))) {
    return null;
  }
  try {
    const token = authSession.getToken() || localStorage.getItem('auth_session_token');
    const email = authSession.getEmail() || localStorage.getItem('auth_user_email') || '';
    const clientKey = `${url}:${token}:${email}`;

    if (!supabaseClientInstance || (globalThis as any).__lastClientKey !== clientKey) {
      const config: any = {
        auth: {
          persistSession: false
        }
      };

      if (token) {
        config.global = {
          headers: {
            'x-user-email': email,
            'x-session-token': token
          }
        };
      }

      supabaseClientInstance = createClient(url, key, config);
      (globalThis as any).__lastClientKey = clientKey;
    }
    return supabaseClientInstance;
  } catch (error) {
    console.error('Failed to create Supabase client:', error);
    return null;
  }
}

// Fallback column list if Supabase REST OpenAPI inspection is unavailable
const FALLBACK_COLUMNS: { [tableName: string]: string[] } = {
  bank_cards: ['id', 'user_email', 'card_name', 'bank_name', 'card_type', 'current_balance', 'card_number', 'is_canceled', 'limit', 'is_limit_locked', 'is_frozen', 'card_theme', 'updated_at', 'locked_amount'],
  cash_accounts: ['id', 'user_email', 'name', 'balance', 'updated_at'],
  transactions: ['id', 'user_email', 'type', 'title', 'amount', 'charge', 'transfer_charge', 'date', 'category', 'account_id', 'account_type', 'target_account_id', 'target_account_type', 'reference_id', 'updated_at'],
  debts: ['id', 'user_email', 'debt_source', 'total_amount', 'remaining_amount', 'due_date', 'notes', 'payments', 'account_id', 'account_type', 'account_name', 'updated_at'],
  incomes: ['id', 'user_email', 'amount', 'date', 'source', 'category', 'target_account_id', 'target_type', 'updated_at'],
  expenses: ['id', 'user_email', 'title', 'description', 'amount', 'date', 'category', 'payment_method_id', 'payment_method_type', 'updated_at'],
  notifications: ['id', 'user_email', 'type', 'message', 'date', 'read', 'updated_at'],
  subscriptions: ['id', 'user_email', 'name', 'amount', 'billing_cycle', 'due_date', 'category', 'status', 'payment_method_id', 'payment_method_type', 'last_paid_date', 'updated_at'],
  loans_given: ['id', 'user_email', 'borrower_name', 'total_amount', 'remaining_amount', 'date_given', 'source_account_id', 'source_account_type', 'source_account_name', 'status', 'notes', 'settlements', 'updated_at'],
  spending_envelopes: ['id', 'user_email', 'category', 'limit', 'spent', 'icon', 'sub_breakdown', 'updated_at']
};

let detectedColumnsCache: { [tableName: string]: string[] } | null = null;

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function toSnakeCase(str: string): string {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase();
}

/**
 * Intelligent helper to identify if an error originates from a column missing in the remote DB schema.
 * Supports PostgREST missing column cache errors and standard Postgres relation errors.
 */
function extractMissingColumn(errorMsg: string, tableName: string): string | null {
  if (!errorMsg) return null;
  
  // Pattern 1: Could not find the 'column_name' column of 'table_name' in the schema cache
  const cacheRegex = new RegExp(`Could not find the '([^']+)' column of '${tableName}'`, 'i');
  let match = errorMsg.match(cacheRegex);
  if (match && match[1]) {
    return match[1];
  }
  
  // Pattern 2: column "column_name" of relation "table_name" does not exist
  const postgresRegex = new RegExp(`column "([^"]+)" of relation "${tableName}" does not exist`, 'i');
  match = errorMsg.match(postgresRegex);
  if (match && match[1]) {
    return match[1];
  }

  // Pattern 3: column "column_name" does not exist
  const genericRegex = /column "([^"]+)" does not exist/i;
  match = genericRegex.exec(errorMsg);
  if (match && match[1]) {
    return match[1];
  }

  return null;
}

/**
 * Automatically inspects empty table metadata via Supabase/PostgREST OpenAPI or CSV headers to find exactly what columns exist
 */
async function getColumnsForTable(tableName: string): Promise<string[]> {
  if (detectedColumnsCache && detectedColumnsCache[tableName]) {
    return detectedColumnsCache[tableName];
  }
  const client = getSupabaseClient();
  if (!client) return FALLBACK_COLUMNS[tableName] || [];
  
  // Method A: Quick CSV header lookup to find existing database columns instantly
  try {
    const { data, error } = await client.from(tableName).select('*').limit(0).csv();
    if (error) {
      if (error.code === '42P01' || (error.message && error.message.includes('does not exist'))) {
        console.warn(`Table ${tableName} does not exist in the remote database yet (Error 42P01: undefined table).`);
        if (!detectedColumnsCache) detectedColumnsCache = {};
        detectedColumnsCache[tableName] = [];
        return [];
      }
    }
    if (!error && typeof data === 'string' && data.trim()) {
      const firstLine = data.split('\n')[0].trim();
      const cols = firstLine.split(',').map(c => c.replace(/^["']|["']$/g, '').trim()).filter(Boolean);
      if (cols.length > 0) {
        if (tableName === 'bank_cards' && !cols.includes('is_canceled')) cols.push('is_canceled');
        if (!detectedColumnsCache) detectedColumnsCache = {};
        detectedColumnsCache[tableName] = cols;
        console.log(`Detected database columns for ${tableName} via CSV headers:`, cols);
        return cols;
      }
    }
  } catch (csvErr) {
    console.warn(`Could not fetch columns via CSV headers for ${tableName}:`, csvErr);
  }

  // Method B: Swagger model endpoint backup
  const { url, key } = getSupabaseConfig();
  if (url && key) {
    try {
      const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url;
      const response = await fetch(`${cleanUrl}/rest/v1/`, {
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${key}`
        }
      });
      if (response.ok) {
        const swagger = await safeJson(response);
        if (!swagger) return FALLBACK_COLUMNS[tableName] || [];
        const tableDef = swagger.definitions?.[tableName];
        if (tableDef && tableDef.properties) {
          const cols = Object.keys(tableDef.properties);
          if (tableName === 'bank_cards' && !cols.includes('is_canceled')) cols.push('is_canceled');
          if (!detectedColumnsCache) detectedColumnsCache = {};
          detectedColumnsCache[tableName] = cols;
          return cols;
        }
      }
    } catch (err) {
      console.warn(`Could not auto-detect columns for table ${tableName} via Swagger. Using fallbacks.`, err);
    }
  }
  return FALLBACK_COLUMNS[tableName] || [];
}

/**
 * Intelligent mapper that dynamically translates camelCase to snake_case properties
 * depending on what columns actually exist in the user's Supabase table.
 */
function mapObjectToColumns(item: any, columns: string[], email: string, mappingRules: { [key: string]: any }): any {
  const result: any = {};
  
  // Set identity binding
  if (columns.includes('user_email')) {
    result['user_email'] = email;
  } else if (columns.includes('userEmail')) {
    result['userEmail'] = email;
  }
  
  // Set timestamp marker: ONLY default to current timestamp if the item DOES NOT ALREADY HAVE an updated_at or updatedAt value or date!
  const getExistingTs = (obj: any): string | undefined => {
    if (!obj) return undefined;
    const ts = obj.updated_at || obj.updatedAt || obj.created_at || obj.createdAt;
    if (ts) return ts;
    if (obj.date) {
      try {
        const d = new Date(obj.date);
        if (!isNaN(d.getTime())) return d.toISOString();
      } catch {
        // ignore
      }
      return obj.date;
    }
    if (obj.dateGiven) {
      try {
        const d = new Date(obj.dateGiven);
        if (!isNaN(d.getTime())) return d.toISOString();
      } catch {
        // ignore
      }
      return obj.dateGiven;
    }
    return undefined;
  };

  const existingTimestamp = getExistingTs(item);
  if (columns.includes('updated_at')) {
    result['updated_at'] = existingTimestamp || new Date().toISOString();
  } else if (columns.includes('updatedAt')) {
    result['updatedAt'] = existingTimestamp || new Date().toISOString();
  }

  // Pre-load explicit mapping overrides
  for (const [colName, val] of Object.entries(mappingRules)) {
    // If the database has it
    if (columns.includes(colName)) {
      result[colName] = val;
    }
  }

  // Set individual properties matching either format
  for (const col of columns) {
    if (col === 'user_email' || col === 'userEmail' || col === 'updated_at' || col === 'updatedAt') {
      continue;
    }
    if (result[col] !== undefined) {
      continue;
    }
    if (item[col] !== undefined) {
      result[col] = item[col];
      continue;
    }
    
    // Automatically match snake <-> camel casings
    const camel = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    const snake = col.replace(/([A-Z])/g, '_$1').toLowerCase();
    
    if (item[camel] !== undefined) {
      result[col] = item[camel];
    } else if (item[snake] !== undefined) {
      result[col] = item[snake];
    }
  }

  return result;
}

/**
 * Explicitly forces a card cancellation directly in the database
 */
export async function forceCancelCardInSupabase(email: string, cardId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    const { data, error } = await client.from('bank_cards').update({ is_canceled: true }).eq('user_email', email).eq('id', cardId).select();
    if (error) {
      console.warn(`Supabase explicit cancel update failed:`, error);
    } else {
      console.log(`DEBUG: Forced canceled status for card ${cardId} in DB. Result:`, data);
    }
  } catch(err) {
    console.warn(`Failed to execute explicit card cancel override`, err);
  }
}

/**
 * Updates the user name and optional avatar_url in the auth_accounts table
 */
export async function updateAuthAccountName(email: string, name: string, avatarUrl?: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    const updatePayload: any = { name };
    if (avatarUrl !== undefined) {
      updatePayload.avatar_url = avatarUrl;
    }
    const { error } = await client.from('auth_accounts').update(updatePayload).eq('email', email);
    if (error) {
      if (error.message && (error.message.includes('column') || error.message.includes('not found') || error.message.includes('does not exist'))) {
        console.warn('avatar_url column missing from auth_accounts, falling back to name-only update...');
        await client.from('auth_accounts').update({ name }).eq('email', email);
      } else {
        throw error;
      }
    }
    console.log(`Updated profile for ${email} in auth_accounts.`);
  } catch(err) {
    console.warn(`Failed to update profile in auth_accounts`, err);
    throw err;
  }
}

/**
 * Truncates all user data from the database completely.
 */
export async function truncateAllDataInSupabase(email: string): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Supabase URL or Anon Key is missing or invalid.' };
  }

  try {
    const tables = ['ledger_states', 'bank_cards', 'cash_accounts', 'transactions', 'debts', 'incomes', 'expenses', 'notifications', 'subscriptions', 'spending_envelopes'];
    
    for (const table of tables) {
      let emailCol = 'user_email';
      if (['incomes', 'expenses', 'debts', 'notifications', 'transactions'].includes(table)) {
        emailCol = 'userEmail';
      }
      
      const { error } = await client.from(table).delete().eq(emailCol, email);
      if (error && error.message.includes(`column "${emailCol}" does not exist`)) {
        const fallbackCol = emailCol === 'userEmail' ? 'user_email' : 'userEmail';
        const { error: err2 } = await client.from(table).delete().eq(fallbackCol, email);
      }
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || JSON.stringify(err) };
  }
}

/**
 * Pushes the current application state to the supabase ledger_states table
 * AND synchronizes all relational tables: bank_cards, cash_accounts, transactions
 */
export async function syncStateToSupabase(email: string, state: AppState, bypassSafetyGuard = false): Promise<{ success: boolean; error?: string }> {
  // 0. Safety check: prevent overwriting the database if the state was never loaded in this session
  if (!bypassSafetyGuard && !isEmailLoadedFromCloud(email)) {
    console.warn('[SYNC SAFETY GUARD] Aborted push/auto-sync because the database state has not been successfully pulled or synchronized in this session yet. This prevents blank local state from destroying existing user data.');
    return { success: false, error: 'Database state has not been successfully fetched in this session.' };
  }

  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Supabase URL or Anon Key is missing or invalid.' };
  }

  const currentStateString = JSON.stringify(state);
  const cacheKey = email.trim().toLowerCase();
  if (lastSyncedStatesCache[cacheKey] === currentStateString) {
    console.log('[PERFORMANCE OPTIMIZATION] Skipping redundant syncStateToSupabase - local state unchanged.');
    return { success: true };
  }

  const errorDetails: string[] = [];

  try {
    // 1. Map all arrays for modern transactional database sync
    const cardsCols = await getColumnsForTable('bank_cards');
    const spendingEnvelopesCols = await getColumnsForTable('spending_envelopes');
    
    const recordsSpendingEnvelopes = (state.budgets || []).map(b => mapObjectToColumns(b, spendingEnvelopesCols, email, {
      id: b.id,
      category: b.category,
      limit: b.limit,
      spent: b.spent || 0,
      icon: b.icon || 'TrendingUp',
      sub_breakdown: b.subBreakdown || []
    }));

    const recordsCards = (state.cards || []).map(card => {
      const mapped = mapObjectToColumns(card, cardsCols, email, {
        id: card.id,
        current_balance: card.currentBalance,
        currentBalance: card.currentBalance,
        card_name: card.cardName,
        cardName: card.cardName,
        bank_name: card.bankName,
        bankName: card.bankName,
        card_type: card.cardType,
        cardType: card.cardType,
        card_number: card.cardNumber || null,
        cardNumber: card.cardNumber || null,
        card_theme: card.cardTheme || 'obsidian'
      });
      mapped.is_canceled = Boolean(card.isCanceled === true || (card as any).is_canceled === true);
      delete mapped.is_cancelled;
      delete mapped.isCanceled;
      if (cardsCols.includes('limit')) mapped.limit = card.limit !== undefined ? card.limit : null;
      if (cardsCols.includes('is_limit_locked')) mapped.is_limit_locked = card.isLimitLocked !== undefined ? Boolean(card.isLimitLocked) : true;
      if (cardsCols.includes('is_frozen')) mapped.is_frozen = card.isFrozen !== undefined ? Boolean(card.isFrozen) : false;
      if (cardsCols.includes('locked_amount')) mapped.locked_amount = card.lockedAmount !== undefined ? card.lockedAmount : null;
      return mapped;
    });

    const cashCols = await getColumnsForTable('cash_accounts');
    const recordsCash = (state.cashAccounts || []).map(acc => mapObjectToColumns(acc, cashCols, email, {
      id: acc.id,
      name: acc.name,
      balance: acc.balance
    }));

    const txCols = await getColumnsForTable('transactions');
    const recordsTx = (state.transactions || []).map(tx => mapObjectToColumns(tx, txCols, email, {
      id: tx.id,
      type: tx.type,
      title: tx.title,
      amount: tx.amount,
      charge: tx.charge || 0,
      transfer_charge: (tx as any).transferCharge || tx.charge || 0,
      date: tx.date,
      category: tx.category,
      account_id: tx.accountId || null,
      accountType: tx.accountType || null,
      account_type: tx.accountType || null,
      target_account_id: tx.targetAccountId || null,
      targetAccountType: tx.targetAccountType || null,
      target_account_type: tx.targetAccountType || null,
      reference_id: tx.referenceId || null
    }));

    const debtsCols = await getColumnsForTable('debts');
    const recordsDebts = (state.debts || []).map(debt => mapObjectToColumns(debt, debtsCols, email, {
      id: debt.id,
      debt_source: debt.debtSource,
      total_amount: debt.totalAmount,
      remaining_amount: debt.remainingAmount,
      due_date: debt.dueDate,
      notes: debt.notes || null,
      payments: debt.payments || [],
      account_id: debt.accountId || null,
      account_type: debt.accountType || null,
      account_name: debt.accountName || null
    }));

    const incomesCols = await getColumnsForTable('incomes');
    const recordsIncomes = (state.incomes || []).map(inc => mapObjectToColumns(inc, incomesCols, email, {
      id: inc.id,
      amount: inc.amount,
      date: inc.date,
      source: inc.source,
      category: inc.category,
      target_account_id: inc.targetAccountId,
      target_type: inc.targetType
    }));

    const expensesCols = await getColumnsForTable('expenses');
    const recordsExpenses = (state.expenses || []).map(exp => mapObjectToColumns(exp, expensesCols, email, {
      id: exp.id,
      title: exp.title,
      description: exp.description || null,
      amount: exp.amount,
      date: exp.date,
      category: exp.category,
      payment_method_id: exp.paymentMethodId,
      payment_method_type: exp.paymentMethodType
    }));

    const notificationsCols = await getColumnsForTable('notifications');
    const recordsNotifications = (state.notifications || []).map(notif => mapObjectToColumns(notif, notificationsCols, email, {
      id: notif.id,
      type: notif.type,
      message: notif.message,
      date: notif.date,
      read: notif.read
    }));

    const subscriptionsCols = await getColumnsForTable('subscriptions');
    const recordsSubscriptions = (state.subscriptions || []).map(sub => mapObjectToColumns(sub, subscriptionsCols, email, {
      id: sub.id,
      name: sub.name,
      amount: sub.amount,
      billing_cycle: sub.billingCycle,
      due_date: sub.dueDate,
      category: sub.category,
      status: sub.status,
      payment_method_id: sub.paymentMethodId || null,
      payment_method_type: sub.paymentMethodType || null,
      last_paid_date: sub.lastPaidDate || null,
      instance_type: sub.instanceType || null
    }));

    const loansCols = await getColumnsForTable('loans_given');
    const recordsLoans = (state.loansGiven || []).map(loan => mapObjectToColumns(loan, loansCols, email, {
      id: loan.id,
      borrower_name: loan.borrowerName,
      total_amount: loan.totalAmount,
      remaining_amount: loan.remainingAmount,
      date_given: loan.dateGiven,
      source_account_id: loan.sourceAccountId,
      source_account_type: loan.sourceAccountType,
      source_account_name: loan.sourceAccountName,
      status: loan.status,
      notes: loan.notes || null,
      settlements: loan.settlements || []
    }));

    const sanitizedState = { ...state, pinCode: '' };

    // 2. ATTEMPT TRANSACTIONAL SINGLE-TRIP RPC
    try {
      const { data: rpcRes, error: rpcErr } = await client.rpc('sync_complete_ledger', {
        p_email: email,
        p_state: sanitizedState,
        p_cards: recordsCards,
        p_cash_accounts: recordsCash,
        p_transactions: recordsTx,
        p_debts: recordsDebts,
        p_incomes: recordsIncomes,
        p_expenses: recordsExpenses,
        p_notifications: recordsNotifications,
        p_subscriptions: recordsSubscriptions,
        p_loans_given: recordsLoans,
        p_spending_envelopes: recordsSpendingEnvelopes
      });

      const rpcSuccess = !rpcErr && rpcRes && (rpcRes as any).success !== false;

      if (rpcSuccess) {
        console.log('[TRANSACTIONAL SYNC ENGINE] Successfully synced entire ledger atomically using single-trip Postgres Transaction!');
        lastSyncedStatesCache[cacheKey] = currentStateString;
        // Always persist the full state JSON snapshot (including subscriptions) to
        // ledger_states.state, even though the RPC succeeded. The app falls back to
        // this JSON when relational-table reads are blocked (e.g. RLS), so it must
        // be kept current or subscriptions can be lost from the restored view.
        try {
          await client
            .from('ledger_states')
            .upsert({ user_email: email, state: sanitizedState, updated_at: new Date().toISOString() }, { onConflict: 'user_email' });
        } catch (jsonErr) {
          console.warn('[SYNC] ledger_states snapshot upsert failed after RPC:', jsonErr);
        }
        return { success: true };
      }

      const rpcErrorMsg = rpcErr ? rpcErr.message : (rpcRes ? (rpcRes as any).error : 'Unknown RPC result structure');
      console.warn('[TRANSACTIONAL SYNC ENGINE] RPC call failed:', rpcErr || rpcRes);
      console.warn(`[TRANSACTIONAL SYNC ENGINE] sync_complete_ledger SQL function had an issue: ${rpcErrorMsg}. Falling back to robust sequential client-side table sync...`);
    } catch (rpcExecErr: any) {
      console.warn('[TRANSACTIONAL SYNC ENGINE] Transactional RPC execution failed with exception:', rpcExecErr);
      console.warn('[TRANSACTIONAL SYNC ENGINE] Falling back to robust sequential client-side table-by-table sync...');
    }

    // 3. FALLBACK BACKWARD-COMPATIBILITY: CHUNKED PARALLEL CLIENT SYNCHRONIZER
    console.log('[SYNC] Upserting state to ledger_states...');
    
    const payload = { 
        user_email: email, 
        state: sanitizedState,
        updated_at: new Date().toISOString()
    };
    console.log('[SYNC] ledger_states payload:', payload);

    const { error: stateError } = await client
      .from('ledger_states')
      .upsert(payload, { onConflict: 'user_email' });

    if (stateError) {
      console.error('[SYNC] State Upsert Error:', stateError);
      throw stateError;
    }
    console.log('[SYNC] ledger_states upsert successful.');

    // A. Sync Bank Cards
    if (cardsCols.length > 0) {
      if (recordsCards.length > 0) {
        console.log(`[SYNC] Upserting ${recordsCards.length} cards...`);
        const { error: cardErr } = await client.from('bank_cards').upsert(recordsCards, { onConflict: 'id' });
        
        if (cardErr) {
          console.error('[SYNC] Card Upsert Error:', cardErr);
          errorDetails.push(`Cards: ${cardErr.message}`);
        }
      }
      const activeCardIds = (state.cards || []).map(c => c.id);
      const emailField = cardsCols.includes('user_email') ? 'user_email' : 'userEmail';
      if (activeCardIds.length > 0) {
        const { data: existing, error: fetchErr } = await client.from('bank_cards').select('id').eq(emailField, email);
        if (fetchErr) {
            console.error('[SYNC] Card Fetch for Delete Error:', fetchErr);
            errorDetails.push(`Cards fetch for delete: ${fetchErr.message}`);
        }
        
        const toDelete = (existing || []).map((e: any) => e.id).filter((id: string) => !activeCardIds.includes(id));
        if (toDelete.length > 0) {
          const { error: delErr } = await client.from('bank_cards').delete().in('id', toDelete);
          if (delErr) {
            console.error('[SYNC] Card Delete Error:', delErr);
            errorDetails.push(`Cards delete error: ${delErr.message}`);
          }
        }
      } else {
        const { error: delAllErr } = await client.from('bank_cards').delete().eq(emailField, email);
        if (delAllErr) {
          console.error('[SYNC] Card Delete All Error:', delAllErr);
          errorDetails.push(`Cards delete all error: ${delAllErr.message}`);
        }
      }
    }

    // B. Sync Cash Accounts
    if (cashCols.length > 0) {
      if (recordsCash.length > 0) {
        const { error: cashErr } = await client.from('cash_accounts').upsert(recordsCash, { onConflict: 'id' });
        if (cashErr) errorDetails.push(`Cash: ${cashErr.message}`);
      }
      const activeCashIds = (state.cashAccounts || []).map(c => c.id);
      const emailField = cashCols.includes('user_email') ? 'user_email' : 'userEmail';
      if (activeCashIds.length > 0) {
        const { data: existing } = await client.from('cash_accounts').select('id').eq(emailField, email);
        const toDelete = (existing || []).map((e: any) => e.id).filter((id: string) => !activeCashIds.includes(id));
        if (toDelete.length > 0) {
          await client.from('cash_accounts').delete().in('id', toDelete);
        }
      } else {
        await client.from('cash_accounts').delete().eq(emailField, email);
      }
    }

    // C. Sync Transactions
    if (txCols.length > 0) {
      if (recordsTx.length > 0) {
        console.log(`[SYNC] Upserting ${recordsTx.length} transactions...`);
        let { error: txErr } = await client.from('transactions').upsert(recordsTx, { onConflict: 'id' });
        
        if (txErr && txErr.message && txErr.message.toLowerCase().includes('could not find')) {
          console.warn('[TRANSACTIONAL SYNC ENGINE] Schema mismatch on transactions identified. Stripping new experimental columns and retrying natively...');
          const fallbackRecords = recordsTx.map(r => {
            const safe = { ...r };
            delete safe.charge;
            delete safe.transfer_charge;
            return safe;
          });
          const retryRes = await client.from('transactions').upsert(fallbackRecords, { onConflict: 'id' });
          txErr = retryRes.error;
        }

        if (txErr) {
          console.error('[SYNC] Transaction Upsert Error:', txErr);
          errorDetails.push(`Transactions: ${txErr.message}`);
        }
      }
      const activeTxIds = (state.transactions || []).map(t => t.id);
      const emailField = txCols.includes('user_email') ? 'user_email' : 'userEmail';
      if (activeTxIds.length > 0) {
        const { data: existing } = await client.from('transactions').select('id').eq(emailField, email);
        const toDelete = (existing || []).map((e: any) => e.id).filter((id: string) => !activeTxIds.includes(id));
        if (toDelete.length > 0) {
          for (let i = 0; i < toDelete.length; i += 100) {
            await client.from('transactions').delete().in('id', toDelete.slice(i, i + 100));
          }
        }
      } else {
        await client.from('transactions').delete().eq(emailField, email);
      }
    }

    // D. Sync Debts
    if (debtsCols.length > 0) {
      if (recordsDebts.length > 0) {
        console.log(`[SYNC] Upserting ${recordsDebts.length} debts...`);
        let { error: debtsErr } = await client.from('debts').upsert(recordsDebts, { onConflict: 'id' });
        
        if (debtsErr && debtsErr.message && debtsErr.message.toLowerCase().includes('could not find')) {
          console.warn('[TRANSACTIONAL SYNC ENGINE] Schema mismatch on debts identified. Stripping new experimental columns and retrying natively...');
          const fallbackRecords = recordsDebts.map(r => {
            const safe = { ...r };
            delete safe.account_id;
            delete safe.account_type;
            delete safe.account_name;
            return safe;
          });
          const retryRes = await client.from('debts').upsert(fallbackRecords, { onConflict: 'id' });
          debtsErr = retryRes.error;
        }

        if (debtsErr) {
          console.error('[SYNC] Debt Upsert Error:', debtsErr);
          errorDetails.push(`Debts: ${debtsErr.message}`);
        }
      }
      const activeDebtIds = (state.debts || []).map(d => d.id);
      const emailField = debtsCols.includes('user_email') ? 'user_email' : 'userEmail';
      if (activeDebtIds.length > 0) {
        const { data: existing } = await client.from('debts').select('id').eq(emailField, email);
        const toDelete = (existing || []).map((e: any) => e.id).filter((id: string) => !activeDebtIds.includes(id));
        if (toDelete.length > 0) {
          await client.from('debts').delete().in('id', toDelete);
        }
      } else {
        await client.from('debts').delete().eq(emailField, email);
      }
    }

    // E. Sync Incomes
    if (incomesCols.length > 0) {
      if (recordsIncomes.length > 0) {
        const { error: incErr } = await client.from('incomes').upsert(recordsIncomes, { onConflict: 'id' });
        if (incErr) errorDetails.push(`Incomes: ${incErr.message}`);
      }
      const activeIncomeIds = (state.incomes || []).map(i => i.id);
      const emailField = incomesCols.includes('user_email') ? 'user_email' : 'userEmail';
      if (activeIncomeIds.length > 0) {
        const { data: existing } = await client.from('incomes').select('id').eq(emailField, email);
        const toDelete = (existing || []).map((e: any) => e.id).filter((id: string) => !activeIncomeIds.includes(id));
        if (toDelete.length > 0) {
          await client.from('incomes').delete().in('id', toDelete);
        }
      } else {
        await client.from('incomes').delete().eq(emailField, email);
      }
    }

    // F. Sync Expenses
    if (expensesCols.length > 0) {
      if (recordsExpenses.length > 0) {
        const { error: expErr } = await client.from('expenses').upsert(recordsExpenses, { onConflict: 'id' });
        if (expErr) errorDetails.push(`Expenses: ${expErr.message}`);
      }
      const activeExpenseIds = (state.expenses || []).map(e => e.id);
      const emailField = expensesCols.includes('user_email') ? 'user_email' : 'userEmail';
      if (activeExpenseIds.length > 0) {
        const { data: existing } = await client.from('expenses').select('id').eq(emailField, email);
        const toDelete = (existing || []).map((e: any) => e.id).filter((id: string) => !activeExpenseIds.includes(id));
        if (toDelete.length > 0) {
          await client.from('expenses').delete().in('id', toDelete);
        }
      } else {
        await client.from('expenses').delete().eq(emailField, email);
      }
    }

    // G. Sync Notifications
    if (notificationsCols.length > 0) {
      if (recordsNotifications.length > 0) {
        const { error: notifErr } = await client.from('notifications').upsert(recordsNotifications, { onConflict: 'id' });
        if (notifErr) errorDetails.push(`Notifications: ${notifErr.message}`);
      }
      const activeNotifIds = (state.notifications || []).map(n => n.id);
      const emailField = notificationsCols.includes('user_email') ? 'user_email' : 'userEmail';
      if (activeNotifIds.length > 0) {
        const { data: existing } = await client.from('notifications').select('id').eq(emailField, email);
        const toDelete = (existing || []).map((e: any) => e.id).filter((id: string) => !activeNotifIds.includes(id));
        if (toDelete.length > 0) {
          await client.from('notifications').delete().in('id', toDelete);
        }
      } else {
        await client.from('notifications').delete().eq(emailField, email);
      }
    }

    // H. Sync Subscriptions
    if (subscriptionsCols.length > 0) {
      if (recordsSubscriptions.length > 0) {
        const { error: subErr } = await client.from('subscriptions').upsert(recordsSubscriptions, { onConflict: 'id' });
        if (subErr) errorDetails.push(`Subscriptions: ${subErr.message}`);
      }
      const activeSubIds = (state.subscriptions || []).map(s => s.id);
      const emailField = subscriptionsCols.includes('user_email') ? 'user_email' : 'userEmail';
      if (activeSubIds.length > 0) {
        const { data: existing } = await client.from('subscriptions').select('id').eq(emailField, email);
        const toDelete = (existing || []).map((e: any) => e.id).filter((id: string) => !activeSubIds.includes(id));
        if (toDelete.length > 0) {
          await client.from('subscriptions').delete().in('id', toDelete);
        }
      } else {
        await client.from('subscriptions').delete().eq(emailField, email);
      }
    }

    // I. Sync Loans Given
    if (loansCols.length > 0) {
      if (recordsLoans.length > 0) {
        const { error: loanErr } = await client.from('loans_given').upsert(recordsLoans, { onConflict: 'id' });
        if (loanErr) errorDetails.push(`Loans Given: ${loanErr.message}`);
      }
      const activeLoanIds = (state.loansGiven || []).map(l => l.id);
      const emailField = loansCols.includes('user_email') ? 'user_email' : 'userEmail';
      if (activeLoanIds.length > 0) {
        const { data: existing } = await client.from('loans_given').select('id').eq(emailField, email);
        const toDelete = (existing || []).map((e: any) => e.id).filter((id: string) => !activeLoanIds.includes(id));
        if (toDelete.length > 0) {
          await client.from('loans_given').delete().in('id', toDelete);
        }
      } else {
        await client.from('loans_given').delete().eq(emailField, email);
      }
    }

    // J. Sync Spending Envelopes
    if (spendingEnvelopesCols.length > 0) {
      if (recordsSpendingEnvelopes.length > 0) {
        const { error: seErr } = await client.from('spending_envelopes').upsert(recordsSpendingEnvelopes, { onConflict: 'id' });
        if (seErr) errorDetails.push(`Spending Envelopes: ${seErr.message}`);
      }
      const activeSeIds = (state.budgets || []).map(b => b.id);
      const emailField = spendingEnvelopesCols.includes('user_email') ? 'user_email' : 'userEmail';
      if (activeSeIds.length > 0) {
        const { data: existing } = await client.from('spending_envelopes').select('id').eq(emailField, email);
        const toDelete = (existing || []).map((e: any) => e.id).filter((id: string) => !activeSeIds.includes(id));
        if (toDelete.length > 0) {
          await client.from('spending_envelopes').delete().in('id', toDelete);
        }
      } else {
        await client.from('spending_envelopes').delete().eq(emailField, email);
      }
    }

    if (errorDetails.length > 0) {
      console.warn('[SYNC AUXILIARY TABLE WARNINGS] Master state saved to ledger_states successfully, but some relational tables had sync warnings:', errorDetails.join('; '));
    }

    lastSyncedStatesCache[cacheKey] = currentStateString;
    return { success: true };
  } catch (err: any) {
    console.error('Supabase State Push Error:', err);
    return { success: false, error: err.message || 'Database transaction error.' };
  }
}


/**
 * Generic mapper to convert database snake_case records to camelCase for AppState.
 */
function mapDatabaseResultToState(item: any): any {
  const result: any = {};
  const numericFields = new Set([
    'totalAmount', 'remainingAmount', 'amount', 'balance', 
    'currentBalance', 'limit', 'charge', 'transferCharge', 'lockedAmount'
  ]);

  for (const key of Object.keys(item)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    
    let val = item[key];
    if (numericFields.has(camelKey)) {
      if (typeof val === 'string') {
        const parsed = Number(val);
        val = isNaN(parsed) ? 0 : parsed;
      } else if (typeof val === 'number' && isNaN(val)) {
        val = 0;
      } else if (val === null || val === undefined) {
        val = 0;
      }
    }
    
    result[camelKey] = val;
  }
  
  // Safe-guard aliases for common typos and boolean transformations
  if (result.isCancelled !== undefined && result.isCanceled === undefined) {
    result.isCanceled = result.isCancelled;
  }
  if (result.isFrozen === undefined) {
    result.isFrozen = false;
  } else {
    result.isFrozen = Boolean(result.isFrozen);
  }
  
  const timestamp = item.updated_at || item.updatedAt || item.created_at || item.createdAt;
  if (timestamp) {
    result.updated_at = timestamp;
    result.updatedAt = timestamp;
  }
  
  return result;
}

/**
 * Pulls the latest state from the supabase ledger_states table AND all relational tables.
 */
export async function syncStateFromSupabase(email: string): Promise<{ success: boolean; state?: AppState; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Supabase URL or Anon Key is missing or invalid.' };
  }

  try {
    // 1. Force reconstruction of AppState from relational tables to ensure complete data sync.
    console.warn('Syncing state from relational tables...');
    
    const fetchTable = async (tableName: string) => {
      const cols = await getColumnsForTable(tableName);
      if (!cols || cols.length === 0) {
        console.warn(`Table ${tableName} does not exist in the remote database yet, skipping query.`);
        return [];
      }
      // More robust column detection (case-insensitive check)
      const userCol = cols.find(c => c.toLowerCase() === 'user_email' || c.toLowerCase() === 'useremail');
      const emailField = userCol || 'user_email'; // Default to user_email
      
      const { data, error } = await client.from(tableName).select('*').eq(emailField, email);
      if (error) {
        if (error.code === '42P01' || (error.message && (error.message.includes('does not exist') || error.message.includes('schema cache')))) {
          console.warn(`Table ${tableName} does not exist, skipped.`);
          return [];
        }
        throw error;
      }
      return data || [];
    };

    const [cards, cash, transactions, debts, incomes, expenses, notifications, envelopes] = await Promise.all([
      fetchTable('bank_cards'),
      fetchTable('cash_accounts'),
      fetchTable('transactions'),
      fetchTable('debts'),
      fetchTable('incomes'),
      fetchTable('expenses'),
      fetchTable('notifications'),
      fetchTable('spending_envelopes')
    ]);

    // Fault-tolerant loading for subscriptions
    let fetchedSubs: any[] = [];
    try {
      const subResult = await client.from('subscriptions').select('*').eq('user_email', email);
      if (!subResult.error && subResult.data) {
        fetchedSubs = subResult.data;
      } else if (subResult.error) {
        console.warn('Subscriptions table fetch skipped or table does not exist:', subResult.error);
      }
    } catch (e) {
      console.warn('Subscriptions table fetch skipped or table does not exist:', e);
    }

    // Fetch profile name and optional avatar from auth_accounts to correctly restore user profile
    let profileName = 'User';
    let profileAvatarUrl = '';
    try {
      const { data: authAcc } = await client.from('auth_accounts').select('*').eq('email', email).maybeSingle();
      if (authAcc) {
        if (authAcc.name) profileName = authAcc.name;
        if (authAcc.avatar_url) profileAvatarUrl = authAcc.avatar_url;
      }
    } catch (e) {
      console.warn('Could not load profile info from auth_accounts:', e);
    }

    // Load auxiliary state (budgets, savingsGoals, and fallback loansGiven) from ledger_states first
    let fullJsonStateStr: any = null;
    let fetchedBudgets: any[] | null = null;
    let fetchedSavingsGoals: any[] | null = null;
    let fetchedLoansGiven: any[] | null = null;
    let fetchedAvatarUrl: string | undefined = undefined;
    let hasLedgerStateRecord = false;
    try {
      const { data: latestStateData, error: stateErr } = await client
        .from('ledger_states')
        .select('state')
        .eq('user_email', email)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!stateErr && latestStateData) {
        hasLedgerStateRecord = true;
        if (latestStateData.state) {
          fullJsonStateStr = typeof latestStateData.state === 'string'
            ? JSON.parse(latestStateData.state)
            : latestStateData.state;
          if (fullJsonStateStr) {
            if (fullJsonStateStr.userProfile && fullJsonStateStr.userProfile.avatarUrl) {
              fetchedAvatarUrl = fullJsonStateStr.userProfile.avatarUrl;
            }
            if (Array.isArray(fullJsonStateStr.budgets)) {
              fetchedBudgets = fullJsonStateStr.budgets;
            } else {
              fetchedBudgets = [];
            }
            if (Array.isArray(fullJsonStateStr.savingsGoals)) {
              fetchedSavingsGoals = fullJsonStateStr.savingsGoals;
            } else {
              fetchedSavingsGoals = [];
            }
            if (Array.isArray(fullJsonStateStr.loansGiven)) {
              fetchedLoansGiven = fullJsonStateStr.loansGiven;
            } else {
              fetchedLoansGiven = [];
            }
          }
        }
      }
    } catch (e) {
      console.warn('Could not restore auxiliary fields from ledger_states:', e);
    }

    // Load active loansGiven from the relational loans_given table first, fallback to the ledger_states list
    try {
      const loansResult = await client.from('loans_given').select('*').eq('user_email', email);
      if (!loansResult.error && loansResult.data && loansResult.data.length > 0) {
        fetchedLoansGiven = loansResult.data.map(mapDatabaseResultToState);
      }
    } catch (e) {
      console.warn('Could not restore loans_given from database:', e);
    }

    // Determine if the user has a real database setup (to differentiate new users from loaded empty states)
    const hasUserDatabaseRecords = hasLedgerStateRecord || 
                                   cards.length > 0 || 
                                   cash.length > 0 || 
                                   transactions.length > 0 || 
                                   debts.length > 0;

    // Helper helper to map or fallback to ledger_states json
    const getListField = (tableData: any[], jsonField: any[] | undefined): any[] => {
      if (tableData && tableData.length > 0) {
        return tableData.map(mapDatabaseResultToState);
      }
      if (jsonField && Array.isArray(jsonField) && jsonField.length > 0) {
        return jsonField;
      }
      return [];
    };

    // Subscriptions can come from two sources: the relational `subscriptions`
    // table and the `ledger_states.state` JSON snapshot. Either one may be
    // blocked/empty (e.g. RLS blocks the relational read), so union both by id
    // to guarantee nothing is lost when reconstructing state from the database.
    const mergeSubscriptions = (relational: any[], jsonField: any[] | undefined): any[] => {
      const relationalMapped = relational && relational.length > 0 ? relational.map(mapDatabaseResultToState) : [];
      const jsonArr = jsonField && Array.isArray(jsonField) ? jsonField : [];
      const byId = new Map<string, any>();
      for (const s of [...relationalMapped, ...jsonArr]) {
        if (s && s.id) {
          const existing = byId.get(s.id);
          if (!existing) byId.set(s.id, s);
          else if (relationalMapped.some((r: any) => r && r.id === s.id)) byId.set(s.id, s);
        }
      }
      return Array.from(byId.values());
    };

    // Construct the AppState from individual tables with mapping applied, falling back to fullJsonStateStr if tables are empty
    const reconstructedState: AppState = {
      ...DEFAULT_APP_STATE, // Use initial structure
      userProfile: {
        name: profileName,
        email: email,
        avatarUrl: profileAvatarUrl || fetchedAvatarUrl || undefined
      },
      cards: getListField(cards, fullJsonStateStr?.cards),
      cashAccounts: getListField(cash, fullJsonStateStr?.cashAccounts),
      transactions: getListField(transactions, fullJsonStateStr?.transactions),
      debts: getListField(debts, fullJsonStateStr?.debts),
      incomes: getListField(incomes, fullJsonStateStr?.incomes),
      expenses: getListField(expenses, fullJsonStateStr?.expenses),
      notifications: getListField(notifications, fullJsonStateStr?.notifications),
      subscriptions: mergeSubscriptions(fetchedSubs, fullJsonStateStr?.subscriptions),
      loansGiven: fetchedLoansGiven && fetchedLoansGiven.length > 0
        ? fetchedLoansGiven
        : (fullJsonStateStr && Array.isArray(fullJsonStateStr.loansGiven) ? fullJsonStateStr.loansGiven : []),
      budgets: envelopes && envelopes.length > 0 
        ? envelopes.map(mapDatabaseResultToState) 
        : (fetchedBudgets && fetchedBudgets.length > 0 
            ? fetchedBudgets 
            : (fullJsonStateStr && Array.isArray(fullJsonStateStr.budgets) && fullJsonStateStr.budgets.length > 0 
                ? fullJsonStateStr.budgets 
                : (hasUserDatabaseRecords ? [] : DEFAULT_APP_STATE.budgets))),
      savingsGoals: fetchedSavingsGoals && fetchedSavingsGoals.length > 0 
        ? fetchedSavingsGoals 
        : (fullJsonStateStr && Array.isArray(fullJsonStateStr.savingsGoals) && fullJsonStateStr.savingsGoals.length > 0 
            ? fullJsonStateStr.savingsGoals 
            : (hasUserDatabaseRecords ? [] : DEFAULT_APP_STATE.savingsGoals)),
      pinCode: fullJsonStateStr && typeof fullJsonStateStr.pinCode === 'string' ? fullJsonStateStr.pinCode : DEFAULT_APP_STATE.pinCode,
      pinEnabled: fullJsonStateStr && typeof fullJsonStateStr.pinEnabled === 'boolean' ? fullJsonStateStr.pinEnabled : DEFAULT_APP_STATE.pinEnabled,
      currency: fullJsonStateStr && typeof fullJsonStateStr.currency === 'string' ? fullJsonStateStr.currency : DEFAULT_APP_STATE.currency,
    };

    const cacheKey = email.trim().toLowerCase();
    lastSyncedStatesCache[cacheKey] = JSON.stringify(reconstructedState);
    markEmailAsLoadedFromCloud(email);

    return { success: true, state: reconstructedState };
  } catch (err: any) {
    console.error('Supabase State Pull Error:', err);
    return { success: false, error: err.message || 'Database transaction error.' };
  }
}


export function getSupabaseSQLScript(): string {
  return `-- SQL Migrations are now managed on the backend and located in /supabase/migrations/20260725_init.sql\n-- The Settings panel will dynamically fetch the fresh script from the server.`;
}
