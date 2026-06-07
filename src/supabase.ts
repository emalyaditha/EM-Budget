import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppState } from './types';
import { DEFAULT_APP_STATE } from './initialData';

const URL_STORAGE_KEY = 'cashflow_supabase_url_v1';
const KEY_STORAGE_KEY = 'cashflow_supabase_key_v1';
const AUTO_SYNC_KEY = 'cashflow_supabase_auto_sync_v1';

// Synchronized states cache to prevent redundant pushes
let lastSyncedStatesCache: { [email: string]: string } = {};

export function clearSyncedStatesCache() {
  lastSyncedStatesCache = {};
}

// Default provided by the user
const DEFAULT_SUPABASE_URL = 'https://iivdlgbztzthjbjzzjna.supabase.co';

export function getSupabaseConfig() {
  const meta = import.meta as any;
  const isProd = !!(meta.env && meta.env.PROD);
  
  let url = (meta.env && meta.env.VITE_SUPABASE_URL) || DEFAULT_SUPABASE_URL;
  let key = (meta.env && meta.env.VITE_SUPABASE_ANON_KEY) || '';
  
  // Only allow client-side LocalStorage override in non-production environments
  if (!isProd) {
    const localUrl = localStorage.getItem(URL_STORAGE_KEY);
    const localKey = localStorage.getItem(KEY_STORAGE_KEY);
    if (localUrl) url = localUrl;
    if (localKey) key = localKey;
  }
  
  if (url && !url.startsWith('https://') && !url.startsWith('http://')) {
    url = DEFAULT_SUPABASE_URL;
  }
  
  const storedAutoSync = localStorage.getItem(AUTO_SYNC_KEY);
  const autoSync = storedAutoSync === null ? true : storedAutoSync === 'true';
  return { url, key, autoSync };
}

export function saveSupabaseConfig(url: string, key: string, autoSync: boolean) {
  localStorage.setItem(URL_STORAGE_KEY, url);
  localStorage.setItem(KEY_STORAGE_KEY, key);
  localStorage.setItem(AUTO_SYNC_KEY, String(autoSync));
}

let supabaseClientInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) {
    return null;
  }
  try {
    const token = localStorage.getItem('auth_session_token');
    const email = localStorage.getItem('auth_user_email') || '';
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
  bank_cards: ['id', 'user_email', 'card_name', 'bank_name', 'card_type', 'current_balance', 'card_number', 'is_canceled', 'limit', 'is_limit_locked', 'is_frozen', 'card_theme', 'updated_at'],
  cash_accounts: ['id', 'user_email', 'name', 'balance', 'updated_at'],
  transactions: ['id', 'user_email', 'type', 'title', 'amount', 'charge', 'transfer_charge', 'date', 'category', 'account_id', 'account_type', 'target_account_id', 'target_account_type', 'reference_id', 'updated_at'],
  debts: ['id', 'user_email', 'debt_source', 'total_amount', 'remaining_amount', 'due_date', 'notes', 'payments', 'account_id', 'account_type', 'account_name', 'updated_at'],
  incomes: ['id', 'user_email', 'amount', 'date', 'source', 'category', 'target_account_id', 'target_type', 'updated_at'],
  expenses: ['id', 'user_email', 'title', 'description', 'amount', 'date', 'category', 'payment_method_id', 'payment_method_type', 'updated_at'],
  notifications: ['id', 'user_email', 'type', 'message', 'date', 'read', 'updated_at'],
  subscriptions: ['id', 'user_email', 'name', 'amount', 'billing_cycle', 'due_date', 'category', 'status', 'payment_method_id', 'payment_method_type', 'last_paid_date', 'updated_at'],
  loans_given: ['id', 'user_email', 'borrower_name', 'total_amount', 'remaining_amount', 'date_given', 'source_account_id', 'source_account_type', 'source_account_name', 'status', 'notes', 'settlements', 'updated_at']
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
        const swagger = await response.json();
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
  
  // Set timestamp marker
  if (columns.includes('updated_at')) {
    result['updated_at'] = new Date().toISOString();
  } else if (columns.includes('updatedAt')) {
    result['updatedAt'] = new Date().toISOString();
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
 * Updates the user name in the auth_accounts table
 */
export async function updateAuthAccountName(email: string, name: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    await client.from('auth_accounts').update({ name }).eq('email', email);
    console.log(`Updated name for ${email} in auth_accounts.`);
  } catch(err) {
    console.warn(`Failed to update name in auth_accounts`, err);
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
    const tables = ['ledger_states', 'bank_cards', 'cash_accounts', 'transactions', 'debts', 'incomes', 'expenses', 'notifications', 'subscriptions'];
    
    for (const table of tables) {
      let emailCol = 'user_email';
      if (['incomes', 'expenses', 'debts', 'notifications', 'transactions'].includes(table)) {
        emailCol = 'userEmail';
      }
      
      let { error } = await client.from(table).delete().eq(emailCol, email);
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
export async function syncStateToSupabase(email: string, state: AppState): Promise<{ success: boolean; error?: string }> {
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

  let errorDetails: string[] = [];

  try {
    // 1. Map all arrays for modern transactional database sync
    const cardsCols = await getColumnsForTable('bank_cards');
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
      last_paid_date: sub.lastPaidDate || null
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

    // 2. ATTEMPT TRANSACTIONAL SINGLE-TRIP RPC
    try {
      const { data: rpcRes, error: rpcErr } = await client.rpc('sync_complete_ledger', {
        p_email: email,
        p_state: state,
        p_cards: recordsCards,
        p_cash_accounts: recordsCash,
        p_transactions: recordsTx,
        p_debts: recordsDebts,
        p_incomes: recordsIncomes,
        p_expenses: recordsExpenses,
        p_notifications: recordsNotifications,
        p_subscriptions: recordsSubscriptions,
        p_loans_given: recordsLoans
      });

      if (!rpcErr) {
        console.log('[TRANSACTIONAL SYNC ENGINE] Successfully synced entire ledger atomically using single-trip Postgres Transaction!');
        lastSyncedStatesCache[cacheKey] = currentStateString;
        return { success: true };
      }

      const errMsg = (rpcErr.message || '').toLowerCase();
      const errCode = String(rpcErr.code || '');
      const isMissingRpc = 
        errCode === 'PGRST501' ||
        errCode === '42883' ||
        errCode === 'PGRST601' ||
        errMsg.includes('does not exist') ||
        errMsg.includes('could not find') ||
        errMsg.includes('schema cache') ||
        errMsg.includes('function');

      if (!isMissingRpc) {
        console.error('[TRANSACTIONAL SYNC ENGINE] Transactional RPC execution failed on DB:', rpcErr);
        throw rpcErr;
      }
      console.warn('[TRANSACTIONAL SYNC ENGINE] sync_complete_ledger RPC is not defined in distant DB. Falling back to sequential client table-sync...');
    } catch (rpcExecErr: any) {
      const errMsg = (rpcExecErr.message || '').toLowerCase();
      const errCode = String(rpcExecErr.code || '');
      const isMissingRpc = 
        errCode === 'PGRST501' ||
        errCode === '42883' ||
        errCode === 'PGRST601' ||
        errMsg.includes('does not exist') ||
        errMsg.includes('could not find') ||
        errMsg.includes('schema cache') ||
        errMsg.includes('function');

      if (!isMissingRpc) {
        throw rpcExecErr;
      }
    }

    // 3. FALLBACK BACKWARD-COMPATIBILITY: CHUNKED PARALLEL CLIENT SYNCHRONIZER
    const { error: stateError } = await client
      .from('ledger_states')
      .insert({ 
        user_email: email, 
        state: state,
        updated_at: new Date().toISOString()
      });

    if (stateError) throw stateError;

    // A. Sync Bank Cards
    if (cardsCols.length > 0) {
      if (recordsCards.length > 0) {
        const { error: cardErr } = await client.from('bank_cards').upsert(recordsCards, { onConflict: 'id' });
        if (cardErr) errorDetails.push(`Cards: ${cardErr.message}`);
      }
      const activeCardIds = (state.cards || []).map(c => c.id);
      const emailField = cardsCols.includes('user_email') ? 'user_email' : 'userEmail';
      if (activeCardIds.length > 0) {
        const { data: existing } = await client.from('bank_cards').select('id').eq(emailField, email);
        const toDelete = (existing || []).map((e: any) => e.id).filter((id: string) => !activeCardIds.includes(id));
        if (toDelete.length > 0) {
          await client.from('bank_cards').delete().in('id', toDelete);
        }
      } else {
        await client.from('bank_cards').delete().eq(emailField, email);
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
        const { error: txErr } = await client.from('transactions').upsert(recordsTx, { onConflict: 'id' });
        if (txErr) errorDetails.push(`Transactions: ${txErr.message}`);
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
        const { error: debtsErr } = await client.from('debts').upsert(recordsDebts, { onConflict: 'id' });
        if (debtsErr) errorDetails.push(`Debts: ${debtsErr.message}`);
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

    if (errorDetails.length > 0) {
      return { success: false, error: errorDetails.join('; ') };
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
  for (const key of Object.keys(item)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = item[key];
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
      // More robust column detection (case-insensitive check)
      const userCol = cols.find(c => c.toLowerCase() === 'user_email' || c.toLowerCase() === 'useremail');
      const emailField = userCol || 'user_email'; // Default to user_email
      
      const { data, error } = await client.from(tableName).select('*').eq(emailField, email);
      if (error) {
        if (error.code === '42P01') {
          console.warn(`Table ${tableName} does not exist, skipped.`);
          return [];
        }
        throw error;
      }
      return data || [];
    };

    const [cards, cash, transactions, debts, incomes, expenses, notifications] = await Promise.all([
      fetchTable('bank_cards'),
      fetchTable('cash_accounts'),
      fetchTable('transactions'),
      fetchTable('debts'),
      fetchTable('incomes'),
      fetchTable('expenses'),
      fetchTable('notifications')
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

    // Fetch profile name from auth_accounts to correctly restore user name
    let profileName = 'User';
    try {
      const { data: authAcc } = await client.from('auth_accounts').select('name').eq('email', email).maybeSingle();
      if (authAcc && authAcc.name) {
        profileName = authAcc.name;
      }
    } catch (e) {
      console.warn('Could not load profile name from auth_accounts:', e);
    }

    // Load auxiliary state (budgets, savingsGoals, and fallback loansGiven) from ledger_states first
    let fetchedBudgets: any[] = [];
    let fetchedSavingsGoals: any[] = [];
    let fetchedLoansGiven: any[] = [];
    try {
      const { data: latestStateData, error: stateErr } = await client
        .from('ledger_states')
        .select('state')
        .eq('user_email', email)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!stateErr && latestStateData && latestStateData.state) {
        const fullJsonStateStr = typeof latestStateData.state === 'string'
          ? JSON.parse(latestStateData.state)
          : latestStateData.state;
        if (fullJsonStateStr) {
          if (Array.isArray(fullJsonStateStr.budgets)) {
            fetchedBudgets = fullJsonStateStr.budgets;
          }
          if (Array.isArray(fullJsonStateStr.savingsGoals)) {
            fetchedSavingsGoals = fullJsonStateStr.savingsGoals;
          }
          if (Array.isArray(fullJsonStateStr.loansGiven)) {
            fetchedLoansGiven = fullJsonStateStr.loansGiven;
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

    // Construct the AppState from individual tables with mapping applied
    const reconstructedState: AppState = {
      ...DEFAULT_APP_STATE, // Use initial structure
      userProfile: {
        name: profileName,
        email: email
      },
      cards: cards.map(mapDatabaseResultToState),
      cashAccounts: cash.map(mapDatabaseResultToState),
      transactions: transactions.map(mapDatabaseResultToState),
      debts: debts.map(mapDatabaseResultToState),
      incomes: incomes.map(mapDatabaseResultToState),
      expenses: expenses.map(mapDatabaseResultToState),
      notifications: notifications.map(mapDatabaseResultToState),
      subscriptions: fetchedSubs.map(mapDatabaseResultToState),
      loansGiven: fetchedLoansGiven,
      budgets: fetchedBudgets.length > 0 ? fetchedBudgets : DEFAULT_APP_STATE.budgets,
      savingsGoals: fetchedSavingsGoals.length > 0 ? fetchedSavingsGoals : DEFAULT_APP_STATE.savingsGoals
    };

    const cacheKey = email.trim().toLowerCase();
    lastSyncedStatesCache[cacheKey] = JSON.stringify(reconstructedState);

    return { success: true, state: reconstructedState };
  } catch (err: any) {
    console.error('Supabase State Pull Error:', err);
    return { success: false, error: err.message || 'Database transaction error.' };
  }
}

/**
 * Returns the copyable SQL commands for setting up Supabase
 */
export function getSupabaseSQLScript(): string {
  return `-- ⚠️ DATABASE UPGRADE MIGRATION (RUN THIS IN YOUR SQL EDITOR IF YOU HAVE AN EXISTING DB):
alter table public.bank_cards add column if not exists "limit" numeric;
alter table public.bank_cards add column if not exists is_limit_locked boolean default true;
alter table public.bank_cards add column if not exists is_frozen boolean default false;
alter table public.bank_cards add column if not exists card_theme text default 'obsidian';
alter table public.transactions add column if not exists charge numeric default 0;
alter table public.transactions add column if not exists transfer_charge numeric default 0;
alter table public.auth_accounts add column if not exists name text;
alter table public.debts add column if not exists account_id text;
alter table public.debts add column if not exists account_type text;
alter table public.debts add column if not exists account_name text;

-- ENABLE CRYPTO EXTENSION
create extension if not exists pgcrypto;

-- CREATE CRYPTOGRAPHIC SESSION VERIFIER
create or replace function public.verify_user_token(headers json) returns text as $$
declare
  token text;
  email text;
  parts text[];
  payload_str text;
  signature text;
  expected_signature text;
  payload json;
  expires_at bigint;
  secret text;
begin
  if headers is null then
    return null;
  end if;
  
  -- Extracted headers from connection
  token := headers->>'x-session-token';
  email := headers->>'x-user-email';
  if token is null or email is null then
    return null;
  end if;
  
  -- Split token by '.' which divides HMAC text payload and signature
  parts := string_to_array(token, '.');
  if array_length(parts, 1) != 2 then
    return null;
  end if;
  
  payload_str := parts[1];
  signature := parts[2];
  
  -- Get secret from database configuration or local fallback
  secret := coalesce(nullif(current_setting('app.settings.session_secret', true), ''), 'vault_secure_suite_signature_key_2026_x92');
  
  -- Compute the expected cryptographic signature
  expected_signature := encode(hmac(payload_str, secret, 'sha256'), 'hex');
  if signature != expected_signature then
    return null;
  end if;
  
  -- Translate the base64url payload safe conversion
  payload_str := rpad(replace(replace(payload_str, '-', '+'), '_', '/'), (ceil(length(payload_str) / 4.0) * 4)::integer, '=');
  payload := convert_from(decode(payload_str, 'base64'), 'utf-8')::json;
  
  -- Prevent session replay expiration bounds
  expires_at := (payload->>'expiresAt')::bigint;
  if expires_at < (date_part('epoch', now()) * 1000)::bigint then
    return null;
  end if;
  
  -- Clean validated email response
  if lower(payload->>'email') = lower(email) then
    return email;
  end if;
  
  return null;
exception
  when others then
    return null;
end;
$$ language plpgsql security definer;

-- CREATE CRYPTOGRAPHIC SYSTEM BYPASS VERIFIER
create or replace function public.verify_system_signature(headers json) returns boolean as $$
declare
  token text;
  parts text[];
  payload_str text;
  signature text;
  expected_signature text;
  secret text;
begin
  if headers is null then
    return false;
  end if;
  
  token := headers->>'x-system-token';
  if token is null then
    return false;
  end if;
  
  parts := string_to_array(token, '.');
  if array_length(parts, 1) != 2 then
    return false;
  end if;
  
  payload_str := parts[1];
  signature := parts[2];
  
  secret := coalesce(nullif(current_setting('app.settings.session_secret', true), ''), 'vault_secure_suite_signature_key_2026_x92');
  expected_signature := encode(hmac(payload_str, secret, 'sha256'), 'hex');
  
  return signature = expected_signature;
exception
  when others then
    return false;
end;
$$ language plpgsql security definer;

-- 1. AUTHENTICATION AND AUTH TOKENS TABLES OR TABLES TO STORE OTP & DEVICE DATA
create table if not exists public.auth_otps (
  email text not null primary key,
  otp text not null,
  expires_at timestamp with time zone not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.auth_device_tokens (
  token text not null primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.auth_rate_limits (
  key text not null primary key,
  count integer not null default 1,
  reset_time timestamp with time zone not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS for auth helper tables
alter table public.auth_otps enable row level security;
alter table public.auth_device_tokens enable row level security;
alter table public.auth_rate_limits enable row level security;

drop policy if exists "Internal system access on auth_otps" on public.auth_otps;
drop policy if exists "Secure system access on auth_otps" on public.auth_otps;
create policy "Secure system access on auth_otps" on public.auth_otps for all
using (public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

drop policy if exists "Internal system access on auth_device_tokens" on public.auth_device_tokens;
drop policy if exists "Secure system access on auth_device_tokens" on public.auth_device_tokens;
create policy "Secure system access on auth_device_tokens" on public.auth_device_tokens for all
using (public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

drop policy if exists "Secure system access on auth_rate_limits" on public.auth_rate_limits;
create policy "Secure system access on auth_rate_limits" on public.auth_rate_limits for all
using (public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

-- Upgrade script for subscriptions:
create table if not exists public.subscriptions (
  id text not null primary key,
  user_email text not null,
  name text not null,
  amount numeric not null default 0,
  billing_cycle text not null, -- 'Monthly' | 'Yearly'
  due_date text not null, -- YYYY-MM-DD or standard date format
  category text not null,
  status text not null, -- 'Active' | 'Paused' | 'Cancelled'
  payment_method_id text,
  payment_method_type text,
  last_paid_date text,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.subscriptions enable row level security;

-- Upgrade script for loans_given:
create table if not exists public.loans_given (
  id text not null primary key,
  user_email text not null,
  borrower_name text not null,
  total_amount numeric not null default 0,
  remaining_amount numeric not null default 0,
  date_given text not null,
  source_account_id text not null,
  source_account_type text not null,
  source_account_name text not null,
  status text not null, -- 'Active' | 'Partially Settled' | 'Settled'
  notes text,
  settlements jsonb not null default '[]'::jsonb,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.loans_given enable row level security;

-- 1. CREATE CORE STATE MATRIX FOR FLUTTER <-> REACT STATE SYNC (Appends row-by-row history list)
create table if not exists public.ledger_states (
  id uuid default gen_random_uuid() primary key,
  user_email text not null,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. CREATE RELATIONAL BANK CARDS TABLE
create table if not exists public.bank_cards (
  id text not null primary key,
  user_email text not null,
  card_name text not null,
  bank_name text not null,
  card_type text not null, -- 'Debit' | 'Credit'
  current_balance numeric not null default 0,
  "limit" numeric,
  is_limit_locked boolean not null default true,
  is_frozen boolean not null default false,
  card_theme text not null default 'obsidian',
  card_number text,
  is_canceled boolean not null default false,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. CREATE RELATIONAL CASH ACCOUNTS TABLE
create table if not exists public.cash_accounts (
  id text not null primary key,
  user_email text not null,
  name text not null,
  balance numeric not null default 0,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. CREATE RELATIONAL TRANSACTIONS TABLE
create table if not exists public.transactions (
  id text not null primary key,
  user_email text not null,
  type text not null, -- 'income' | 'expense' | 'debt_payment' | ...
  title text not null,
  amount numeric not null default 0,
  charge numeric not null default 0,
  transfer_charge numeric not null default 0,
  date text not null,
  category text not null,
  account_id text,
  account_type text, -- 'cash' | 'card'
  target_account_id text,
  target_account_type text,
  reference_id text,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. CREATE RELATIONAL DEBTS TABLE
create table if not exists public.debts (
  id text not null primary key,
  user_email text not null,
  debt_source text not null,
  total_amount numeric not null default 0,
  remaining_amount numeric not null default 0,
  due_date text not null,
  notes text,
  payments jsonb default '[]'::jsonb,
  account_id text,
  account_type text,
  account_name text,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 6. CREATE RELATIONAL INCOMES TABLE
create table if not exists public.incomes (
  id text not null primary key,
  user_email text not null,
  amount numeric not null default 0,
  date text not null,
  source text not null,
  category text not null,
  target_account_id text not null,
  target_type text not null, -- 'cash' | 'card'
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 7. CREATE RELATIONAL EXPENSES TABLE
create table if not exists public.expenses (
  id text not null primary key,
  user_email text not null,
  title text not null,
  description text,
  amount numeric not null default 0,
  date text not null,
  category text not null,
  payment_method_id text not null,
  payment_method_type text not null, -- 'cash' | 'card'
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 8. CREATE RELATIONAL NOTIFICATIONS TABLE
create table if not exists public.notifications (
  id text not null primary key,
  user_email text not null,
  type text not null, -- 'reminder' | 'alert' | 'system'
  message text not null,
  date text not null,
  read boolean not null default false,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 9. ENABLE ROW LEVEL SECURITY (RLS) FOR ALL REPOSITORIES
alter table public.ledger_states enable row level security;
alter table public.bank_cards enable row level security;
alter table public.cash_accounts enable row level security;
alter table public.transactions enable row level security;
alter table public.debts enable row level security;
alter table public.incomes enable row level security;
alter table public.expenses enable row level security;
alter table public.notifications enable row level security;
alter table public.loans_given enable row level security;

-- 10. CREATE RELATIONAL AUTH ACCOUNTS TABLE
create table if not exists public.auth_accounts (
  id uuid default gen_random_uuid() primary key,
  email text not null unique,
  password_hash text not null,
  name text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ENABLE RLS FOR AUTH ACCOUNTS
alter table public.auth_accounts enable row level security;

-- SETUP POLICIES FOR AUTH ACCOUNTS
create policy "Secure select on auth_accounts" on public.auth_accounts for select using (email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure insert on auth_accounts" on public.auth_accounts for insert with check (public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure update on auth_accounts" on public.auth_accounts for update using (email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));

-- 11. SETUP SECURE TENANT ISOLATION POLICIES (React Client-Side Syncing Enabled)
create policy "Secure select on states" on public.ledger_states for select using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure insert on states" on public.ledger_states for insert with check (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure update on states" on public.ledger_states for update using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));

create policy "Secure select on cards" on public.bank_cards for select using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure insert on cards" on public.bank_cards for insert with check (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure update on cards" on public.bank_cards for update using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure delete on cards" on public.bank_cards for delete using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));

create policy "Secure select on cash" on public.cash_accounts for select using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure insert on cash" on public.cash_accounts for insert with check (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure update on cash" on public.cash_accounts for update using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure delete on cash" on public.cash_accounts for delete using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));

create policy "Secure select on tx" on public.transactions for select using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure insert on tx" on public.transactions for insert with check (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure update on tx" on public.transactions for update using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure delete on tx" on public.transactions for delete using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));

create policy "Secure select on debts" on public.debts for select using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure insert on debts" on public.debts for insert with check (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure update on debts" on public.debts for update using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure delete on debts" on public.debts for delete using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));

create policy "Secure select on incomes" on public.incomes for select using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure insert on incomes" on public.incomes for insert with check (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure update on incomes" on public.incomes for update using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure delete on incomes" on public.incomes for delete using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));

create policy "Secure select on expenses" on public.expenses for select using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure insert on expenses" on public.expenses for insert with check (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure update on expenses" on public.expenses for update using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure delete on expenses" on public.expenses for delete using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));

create policy "Secure select on notifications" on public.notifications for select using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure insert on notifications" on public.notifications for insert with check (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure update on notifications" on public.notifications for update using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure delete on notifications" on public.notifications for delete using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));

create policy "Secure select on subscriptions" on public.subscriptions for select using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure insert on subscriptions" on public.subscriptions for insert with check (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure update on subscriptions" on public.subscriptions for update using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure delete on subscriptions" on public.subscriptions for delete using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));

create policy "Secure select on loans_given" on public.loans_given for select using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure insert on loans_given" on public.loans_given for insert with check (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure update on loans_given" on public.loans_given for update using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure delete on loans_given" on public.loans_given for delete using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));

-- CRYPTOGRAPHICALLY SECURED SINGLE-TRIP TRANSACTIONAL LEDGER SYNC ENGINE
CREATE OR REPLACE FUNCTION public.sync_complete_ledger(
  p_email text,
  p_state jsonb,
  p_cards jsonb,
  p_cash_accounts jsonb,
  p_transactions jsonb,
  p_debts jsonb,
  p_incomes jsonb,
  p_expenses jsonb,
  p_notifications jsonb,
  p_subscriptions jsonb,
  p_loans_given jsonb
) RETURNS jsonb AS $$
DECLARE
  v_caller_email text;
  v_item jsonb;
BEGIN
  -- Authenticate cryptographic token
  v_caller_email := public.verify_user_token(nullif(current_setting('request.headers', true), '')::json);
  IF v_caller_email IS NULL OR lower(v_caller_email) != lower(p_email) THEN
    RAISE EXCEPTION 'Cryptographic Session Token Mismatch or Expired. Access Denied.';
  END IF;

  -- 1. Upsert Unified State
  INSERT INTO public.ledger_states (user_email, state, updated_at)
  VALUES (p_email, p_state, timezone('utc'::text, now()))
  ON CONFLICT (user_email) DO UPDATE
  SET state = EXCLUDED.state, updated_at = EXCLUDED.updated_at;

  -- 2. Synchronize Cards
  IF p_cards IS NOT NULL THEN
    -- Delete card records removed in client
    DELETE FROM public.bank_cards
    WHERE user_email = p_email 
      AND id NOT IN (SELECT jsonb_array_elements(p_cards)->>'id');

    -- Upsert card records
    FOR v_item IN SELECT jsonb_array_elements(p_cards) LOOP
      INSERT INTO public.bank_cards (
        id, user_email, card_name, bank_name, card_type, card_number, card_theme, current_balance, is_canceled, updated_at
      ) VALUES (
        v_item->>'id',
        p_email,
        v_item->>'card_name',
        v_item->>'bank_name',
        v_item->>'card_type',
        v_item->>'card_number',
        coalesce(v_item->>'card_theme', 'obsidian'),
        (v_item->>'current_balance')::numeric,
        coalesce((v_item->>'is_canceled')::boolean, false),
        timezone('utc'::text, now())
      ) ON CONFLICT (id) DO UPDATE SET
        card_name = EXCLUDED.card_name,
        bank_name = EXCLUDED.bank_name,
        card_type = EXCLUDED.card_type,
        card_number = EXCLUDED.card_number,
        card_theme = EXCLUDED.card_theme,
        current_balance = EXCLUDED.current_balance,
        is_canceled = EXCLUDED.is_canceled,
        updated_at = EXCLUDED.updated_at;
    END LOOP;
  ELSE
    DELETE FROM public.bank_cards WHERE user_email = p_email;
  END IF;

  -- 3. Synchronize Cash Accounts
  IF p_cash_accounts IS NOT NULL THEN
    DELETE FROM public.cash_accounts
    WHERE user_email = p_email 
      AND id NOT IN (SELECT jsonb_array_elements(p_cash_accounts)->>'id');

    FOR v_item IN SELECT jsonb_array_elements(p_cash_accounts) LOOP
      INSERT INTO public.cash_accounts (
        id, user_email, name, balance, updated_at
      ) VALUES (
        v_item->>'id',
        p_email,
        v_item->>'name',
        (v_item->>'balance')::numeric,
        timezone('utc'::text, now())
      ) ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        balance = EXCLUDED.balance,
        updated_at = EXCLUDED.updated_at;
    END LOOP;
  ELSE
    DELETE FROM public.cash_accounts WHERE user_email = p_email;
  END IF;

  -- 4. Synchronize Transactions
  IF p_transactions IS NOT NULL THEN
    DELETE FROM public.transactions
    WHERE user_email = p_email 
      AND id NOT IN (SELECT jsonb_array_elements(p_transactions)->>'id');

    FOR v_item IN SELECT jsonb_array_elements(p_transactions) LOOP
      INSERT INTO public.transactions (
        id, user_email, type, title, amount, charge, transfer_charge, date, category, account_id, account_type, target_account_id, target_account_type, reference_id, updated_at
      ) VALUES (
        v_item->>'id',
        p_email,
        v_item->>'type',
        v_item->>'title',
        (v_item->>'amount')::numeric,
        coalesce((v_item->>'charge')::numeric, 0),
        coalesce((v_item->>'transfer_charge')::numeric, 0),
        v_item->>'date',
        v_item->>'category',
        v_item->>'account_id',
        v_item->>'account_type',
        v_item->>'target_account_id',
        v_item->>'target_account_type',
        v_item->>'reference_id',
        timezone('utc'::text, now())
      ) ON CONFLICT (id) DO UPDATE SET
        type = EXCLUDED.type,
        title = EXCLUDED.title,
        amount = EXCLUDED.amount,
        charge = EXCLUDED.charge,
        transfer_charge = EXCLUDED.transfer_charge,
        date = EXCLUDED.date,
        category = EXCLUDED.category,
        account_id = EXCLUDED.account_id,
        account_type = EXCLUDED.account_type,
        target_account_id = EXCLUDED.target_account_id,
        target_account_type = EXCLUDED.target_account_type,
        reference_id = EXCLUDED.reference_id,
        updated_at = EXCLUDED.updated_at;
    END LOOP;
  ELSE
    DELETE FROM public.transactions WHERE user_email = p_email;
  END IF;

  -- 5. Synchronize Debts
  IF p_debts IS NOT NULL THEN
    DELETE FROM public.debts
    WHERE user_email = p_email 
      AND id NOT IN (SELECT jsonb_array_elements(p_debts)->>'id');

    FOR v_item IN SELECT jsonb_array_elements(p_debts) LOOP
      INSERT INTO public.debts (
        id, user_email, debt_source, total_amount, remaining_amount, due_date, notes, payments, account_id, account_type, account_name, updated_at
      ) VALUES (
        v_item->>'id',
        p_email,
        v_item->>'debt_source',
        (v_item->>'total_amount')::numeric,
        (v_item->>'remaining_amount')::numeric,
        v_item->>'due_date',
        v_item->>'notes',
        coalesce((v_item->'payments'), '[]'::jsonb),
        v_item->>'account_id',
        v_item->>'account_type',
        v_item->>'account_name',
        timezone('utc'::text, now())
      ) ON CONFLICT (id) DO UPDATE SET
        debt_source = EXCLUDED.debt_source,
        total_amount = EXCLUDED.total_amount,
        remaining_amount = EXCLUDED.remaining_amount,
        due_date = EXCLUDED.due_date,
        notes = EXCLUDED.notes,
        payments = EXCLUDED.payments,
        account_id = EXCLUDED.account_id,
        account_type = EXCLUDED.account_type,
        account_name = EXCLUDED.account_name,
        updated_at = EXCLUDED.updated_at;
    END LOOP;
  ELSE
    DELETE FROM public.debts WHERE user_email = p_email;
  END IF;

  -- 6. Synchronize Incomes
  IF p_incomes IS NOT NULL THEN
    DELETE FROM public.incomes
    WHERE user_email = p_email 
      AND id NOT IN (SELECT jsonb_array_elements(p_incomes)->>'id');

    FOR v_item IN SELECT jsonb_array_elements(p_incomes) LOOP
      INSERT INTO public.incomes (
        id, user_email, amount, date, source, category, target_account_id, target_type, updated_at
      ) VALUES (
        v_item->>'id',
        p_email,
        (v_item->>'amount')::numeric,
        v_item->>'date',
        v_item->>'source',
        v_item->>'category',
        v_item->>'target_account_id',
        v_item->>'target_type',
        timezone('utc'::text, now())
      ) ON CONFLICT (id) DO UPDATE SET
        amount = EXCLUDED.amount,
        date = EXCLUDED.date,
        source = EXCLUDED.source,
        category = EXCLUDED.category,
        target_account_id = EXCLUDED.target_account_id,
        target_type = EXCLUDED.target_type,
        updated_at = EXCLUDED.updated_at;
    END LOOP;
  ELSE
    DELETE FROM public.incomes WHERE user_email = p_email;
  END IF;

  -- 7. Synchronize Expenses
  IF p_expenses IS NOT NULL THEN
    DELETE FROM public.expenses
    WHERE user_email = p_email 
      AND id NOT IN (SELECT jsonb_array_elements(p_expenses)->>'id');

    FOR v_item IN SELECT jsonb_array_elements(p_expenses) LOOP
      INSERT INTO public.expenses (
        id, user_email, title, description, amount, date, category, payment_method_id, payment_method_type, updated_at
      ) VALUES (
        v_item->>'id',
        p_email,
        v_item->>'title',
        v_item->>'description',
        (v_item->>'amount')::numeric,
        v_item->>'date',
        v_item->>'category',
        v_item->>'payment_method_id',
        v_item->>'payment_method_type',
        timezone('utc'::text, now())
      ) ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        amount = EXCLUDED.amount,
        date = EXCLUDED.date,
        category = EXCLUDED.category,
        payment_method_id = EXCLUDED.payment_method_id,
        payment_method_type = EXCLUDED.payment_method_type,
        updated_at = EXCLUDED.updated_at;
    END LOOP;
  ELSE
    DELETE FROM public.expenses WHERE user_email = p_email;
  END IF;

  -- 8. Synchronize Notifications
  IF p_notifications IS NOT NULL THEN
    DELETE FROM public.notifications
    WHERE user_email = p_email 
      AND id NOT IN (SELECT jsonb_array_elements(p_notifications)->>'id');

    FOR v_item IN SELECT jsonb_array_elements(p_notifications) LOOP
      INSERT INTO public.notifications (
        id, user_email, type, message, date, read, updated_at
      ) VALUES (
        v_item->>'id',
        p_email,
        v_item->>'type',
        v_item->>'message',
        v_item->>'date',
        coalesce((v_item->>'read')::boolean, false),
        timezone('utc'::text, now())
      ) ON CONFLICT (id) DO UPDATE SET
        type = EXCLUDED.type,
        message = EXCLUDED.message,
        date = EXCLUDED.date,
        read = EXCLUDED.read,
        updated_at = EXCLUDED.updated_at;
    END LOOP;
  ELSE
    DELETE FROM public.notifications WHERE user_email = p_email;
  END IF;

  -- 9. Synchronize Subscriptions
  IF p_subscriptions IS NOT NULL THEN
    DELETE FROM public.subscriptions
    WHERE user_email = p_email 
      AND id NOT IN (SELECT jsonb_array_elements(p_subscriptions)->>'id');

    FOR v_item IN SELECT jsonb_array_elements(p_subscriptions) LOOP
      INSERT INTO public.subscriptions (
        id, user_email, name, amount, billing_cycle, due_date, category, status, payment_method_id, payment_method_type, last_paid_date, updated_at
      ) VALUES (
        v_item->>'id',
        p_email,
        v_item->>'name',
        (v_item->>'amount')::numeric,
        v_item->>'billing_cycle',
        v_item->>'due_date',
        v_item->>'category',
        v_item->>'status',
        v_item->>'payment_method_id',
        v_item->>'payment_method_type',
        v_item->>'last_paid_date',
        timezone('utc'::text, now())
      ) ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        amount = EXCLUDED.amount,
        billing_cycle = EXCLUDED.billing_cycle,
        due_date = EXCLUDED.due_date,
        category = EXCLUDED.category,
        status = EXCLUDED.status,
        payment_method_id = EXCLUDED.payment_method_id,
        payment_method_type = EXCLUDED.payment_method_type,
        last_paid_date = EXCLUDED.last_paid_date,
        updated_at = EXCLUDED.updated_at;
    END LOOP;
  ELSE
    DELETE FROM public.subscriptions WHERE user_email = p_email;
  END IF;

  -- 10. Synchronize Loans Given
  IF p_loans_given IS NOT NULL THEN
    DELETE FROM public.loans_given
    WHERE user_email = p_email 
      AND id NOT IN (SELECT jsonb_array_elements(p_loans_given)->>'id');

    FOR v_item IN SELECT jsonb_array_elements(p_loans_given) LOOP
      INSERT INTO public.loans_given (
        id, user_email, borrower_name, total_amount, remaining_amount, date_given, source_account_id, source_account_type, source_account_name, status, notes, settlements, updated_at
      ) VALUES (
        v_item->>'id',
        p_email,
        v_item->>'borrower_name',
        (v_item->>'total_amount')::numeric,
        (v_item->>'remaining_amount')::numeric,
        v_item->>'date_given',
        v_item->>'source_account_id',
        v_item->>'source_account_type',
        v_item->>'source_account_name',
        v_item->>'status',
        v_item->>'notes',
        coalesce((v_item->'settlements'), '[]'::jsonb),
        timezone('utc'::text, now())
      ) ON CONFLICT (id) DO UPDATE SET
        borrower_name = EXCLUDED.borrower_name,
        total_amount = EXCLUDED.total_amount,
        remaining_amount = EXCLUDED.remaining_amount,
        date_given = EXCLUDED.date_given,
        source_account_id = EXCLUDED.source_account_id,
        source_account_type = EXCLUDED.source_account_type,
        source_account_name = EXCLUDED.source_account_name,
        status = EXCLUDED.status,
        notes = EXCLUDED.notes,
        settlements = EXCLUDED.settlements,
        updated_at = EXCLUDED.updated_at;
    END LOOP;
  ELSE
    DELETE FROM public.loans_given WHERE user_email = p_email;
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. ADD DATABASE INTEGRITY CONSTRAINTS (FOREIGN KEYS AND CASCADE DELETIONS)
alter table public.ledger_states drop constraint if exists ledger_states_user_email_key cascade;
alter table public.ledger_states add constraint ledger_states_user_email_key unique (user_email);

alter table public.ledger_states drop constraint if exists ledger_states_user_email_fkey cascade;
alter table public.ledger_states add constraint ledger_states_user_email_fkey foreign key (user_email) references public.auth_accounts(email) on delete cascade;

alter table public.bank_cards drop constraint if exists bank_cards_user_email_fkey cascade;
alter table public.bank_cards add constraint bank_cards_user_email_fkey foreign key (user_email) references public.auth_accounts(email) on delete cascade;

alter table public.cash_accounts drop constraint if exists cash_accounts_user_email_fkey cascade;
alter table public.cash_accounts add constraint cash_accounts_user_email_fkey foreign key (user_email) references public.auth_accounts(email) on delete cascade;

alter table public.transactions drop constraint if exists transactions_user_email_fkey cascade;
alter table public.transactions add constraint transactions_user_email_fkey foreign key (user_email) references public.auth_accounts(email) on delete cascade;

alter table public.debts drop constraint if exists debts_user_email_fkey cascade;
alter table public.debts add constraint debts_user_email_fkey foreign key (user_email) references public.auth_accounts(email) on delete cascade;

alter table public.incomes drop constraint if exists incomes_user_email_fkey cascade;
alter table public.incomes add constraint incomes_user_email_fkey foreign key (user_email) references public.auth_accounts(email) on delete cascade;

alter table public.expenses drop constraint if exists expenses_user_email_fkey cascade;
alter table public.expenses add constraint expenses_user_email_fkey foreign key (user_email) references public.auth_accounts(email) on delete cascade;

alter table public.notifications drop constraint if exists notifications_user_email_fkey cascade;
alter table public.notifications add constraint notifications_user_email_fkey foreign key (user_email) references public.auth_accounts(email) on delete cascade;

alter table public.subscriptions drop constraint if exists subscriptions_user_email_fkey cascade;
alter table public.subscriptions add constraint subscriptions_user_email_fkey foreign key (user_email) references public.auth_accounts(email) on delete cascade;

alter table public.loans_given drop constraint if exists loans_given_user_email_fkey cascade;
alter table public.loans_given add constraint loans_given_user_email_fkey foreign key (user_email) references public.auth_accounts(email) on delete cascade;

-- 13. ADD PERFORMANCE INDEXES ON FREQUENT QUERY PATHS
create index if not exists idx_ledger_states_user_email on public.ledger_states(user_email);
create index if not exists idx_bank_cards_user_email on public.bank_cards(user_email);
create index if not exists idx_cash_accounts_user_email on public.cash_accounts(user_email);
create index if not exists idx_transactions_user_email on public.transactions(user_email);
create index if not exists idx_debts_user_email on public.debts(user_email);
create index if not exists idx_incomes_user_email on public.incomes(user_email);
create index if not exists idx_expenses_user_email on public.expenses(user_email);
create index if not exists idx_notifications_user_email on public.notifications(user_email);
create index if not exists idx_subscriptions_user_email on public.subscriptions(user_email);
create index if not exists idx_loans_given_user_email on public.loans_given(user_email);
`;
}

/**
 * Returns the upgrade migration query for live database tables
 */
export function getSupabaseUpgradeSQLScript(): string {
  return `-- ⚠️ DATABASE UPGRADE MIGRATION
-- To update your live Supabase database instantly, go to your Supabase Dashboard > SQL Editor and copy-paste the matching upgrade migration query below:

-- ADD HIGH-PERFORMANCE TRANSACTION TRANSACTION ENGINE TO PREVIOUS DATABASES
CREATE OR REPLACE FUNCTION public.sync_complete_ledger(
  p_email text,
  p_state jsonb,
  p_cards jsonb,
  p_cash_accounts jsonb,
  p_transactions jsonb,
  p_debts jsonb,
  p_incomes jsonb,
  p_expenses jsonb,
  p_notifications jsonb,
  p_subscriptions jsonb,
  p_loans_given jsonb
) RETURNS jsonb AS $$
DECLARE
  v_caller_email text;
  v_item jsonb;
BEGIN
  -- Authenticate cryptographic token
  v_caller_email := public.verify_user_token(nullif(current_setting('request.headers', true), '')::json);
  IF v_caller_email IS NULL OR lower(v_caller_email) != lower(p_email) THEN
    RAISE EXCEPTION 'Cryptographic Session Token Mismatch or Expired. Access Denied.';
  END IF;

  -- 1. Upsert Unified State
  INSERT INTO public.ledger_states (user_email, state, updated_at)
  VALUES (p_email, p_state, timezone('utc'::text, now()))
  ON CONFLICT (user_email) DO UPDATE
  SET state = EXCLUDED.state, updated_at = EXCLUDED.updated_at;

  -- 2. Synchronize Cards
  IF p_cards IS NOT NULL THEN
    -- Delete card records removed in client
    DELETE FROM public.bank_cards
    WHERE user_email = p_email 
      AND id NOT IN (SELECT jsonb_array_elements(p_cards)->>'id');

    -- Upsert card records
    FOR v_item IN SELECT jsonb_array_elements(p_cards) LOOP
      INSERT INTO public.bank_cards (
        id, user_email, card_name, bank_name, card_type, card_number, card_theme, current_balance, is_canceled, updated_at
      ) VALUES (
        v_item->>'id',
        p_email,
        v_item->>'card_name',
        v_item->>'bank_name',
        v_item->>'card_type',
        v_item->>'card_number',
        coalesce(v_item->>'card_theme', 'obsidian'),
        (v_item->>'current_balance')::numeric,
        coalesce((v_item->>'is_canceled')::boolean, false),
        timezone('utc'::text, now())
      ) ON CONFLICT (id) DO UPDATE SET
        card_name = EXCLUDED.card_name,
        bank_name = EXCLUDED.bank_name,
        card_type = EXCLUDED.card_type,
        card_number = EXCLUDED.card_number,
        card_theme = EXCLUDED.card_theme,
        current_balance = EXCLUDED.current_balance,
        is_canceled = EXCLUDED.is_canceled,
        updated_at = EXCLUDED.updated_at;
    END LOOP;
  ELSE
    DELETE FROM public.bank_cards WHERE user_email = p_email;
  END IF;

  -- 3. Synchronize Cash Accounts
  IF p_cash_accounts IS NOT NULL THEN
    DELETE FROM public.cash_accounts
    WHERE user_email = p_email 
      AND id NOT IN (SELECT jsonb_array_elements(p_cash_accounts)->>'id');

    FOR v_item IN SELECT jsonb_array_elements(p_cash_accounts) LOOP
      INSERT INTO public.cash_accounts (
        id, user_email, name, balance, updated_at
      ) VALUES (
        v_item->>'id',
        p_email,
        v_item->>'name',
        (v_item->>'balance')::numeric,
        timezone('utc'::text, now())
      ) ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        balance = EXCLUDED.balance,
        updated_at = EXCLUDED.updated_at;
    END LOOP;
  ELSE
    DELETE FROM public.cash_accounts WHERE user_email = p_email;
  END IF;

  -- 4. Synchronize Transactions
  IF p_transactions IS NOT NULL THEN
    DELETE FROM public.transactions
    WHERE user_email = p_email 
      AND id NOT IN (SELECT jsonb_array_elements(p_transactions)->>'id');

    FOR v_item IN SELECT jsonb_array_elements(p_transactions) LOOP
      INSERT INTO public.transactions (
        id, user_email, type, title, amount, charge, transfer_charge, date, category, account_id, account_type, target_account_id, target_account_type, reference_id, updated_at
      ) VALUES (
        v_item->>'id',
        p_email,
        v_item->>'type',
        v_item->>'title',
        (v_item->>'amount')::numeric,
        coalesce((v_item->>'charge')::numeric, 0),
        coalesce((v_item->>'transfer_charge')::numeric, 0),
        v_item->>'date',
        v_item->>'category',
        v_item->>'account_id',
        v_item->>'account_type',
        v_item->>'target_account_id',
        v_item->>'target_account_type',
        v_item->>'reference_id',
        timezone('utc'::text, now())
      ) ON CONFLICT (id) DO UPDATE SET
        type = EXCLUDED.type,
        title = EXCLUDED.title,
        amount = EXCLUDED.amount,
        charge = EXCLUDED.charge,
        transfer_charge = EXCLUDED.transfer_charge,
        date = EXCLUDED.date,
        category = EXCLUDED.category,
        account_id = EXCLUDED.account_id,
        account_type = EXCLUDED.account_type,
        target_account_id = EXCLUDED.target_account_id,
        target_account_type = EXCLUDED.target_account_type,
        reference_id = EXCLUDED.reference_id,
        updated_at = EXCLUDED.updated_at;
    END LOOP;
  ELSE
    DELETE FROM public.transactions WHERE user_email = p_email;
  END IF;

  -- 5. Synchronize Debts
  IF p_debts IS NOT NULL THEN
    DELETE FROM public.debts
    WHERE user_email = p_email 
      AND id NOT IN (SELECT jsonb_array_elements(p_debts)->>'id');

    FOR v_item IN SELECT jsonb_array_elements(p_debts) LOOP
      INSERT INTO public.debts (
        id, user_email, debt_source, total_amount, remaining_amount, due_date, notes, payments, account_id, account_type, account_name, updated_at
      ) VALUES (
        v_item->>'id',
        p_email,
        v_item->>'debt_source',
        (v_item->>'total_amount')::numeric,
        (v_item->>'remaining_amount')::numeric,
        v_item->>'due_date',
        v_item->>'notes',
        coalesce((v_item->'payments'), '[]'::jsonb),
        v_item->>'account_id',
        v_item->>'account_type',
        v_item->>'account_name',
        timezone('utc'::text, now())
      ) ON CONFLICT (id) DO UPDATE SET
        debt_source = EXCLUDED.debt_source,
        total_amount = EXCLUDED.total_amount,
        remaining_amount = EXCLUDED.remaining_amount,
        due_date = EXCLUDED.due_date,
        notes = EXCLUDED.notes,
        payments = EXCLUDED.payments,
        account_id = EXCLUDED.account_id,
        account_type = EXCLUDED.account_type,
        account_name = EXCLUDED.account_name,
        updated_at = EXCLUDED.updated_at;
    END LOOP;
  ELSE
    DELETE FROM public.debts WHERE user_email = p_email;
  END IF;

  -- 6. Synchronize Incomes
  IF p_incomes IS NOT NULL THEN
    DELETE FROM public.incomes
    WHERE user_email = p_email 
      AND id NOT IN (SELECT jsonb_array_elements(p_incomes)->>'id');

    FOR v_item IN SELECT jsonb_array_elements(p_incomes) LOOP
      INSERT INTO public.incomes (
        id, user_email, amount, date, source, category, target_account_id, target_type, updated_at
      ) VALUES (
        v_item->>'id',
        p_email,
        (v_item->>'amount')::numeric,
        v_item->>'date',
        v_item->>'source',
        v_item->>'category',
        v_item->>'target_account_id',
        v_item->>'target_type',
        timezone('utc'::text, now())
      ) ON CONFLICT (id) DO UPDATE SET
        amount = EXCLUDED.amount,
        date = EXCLUDED.date,
        source = EXCLUDED.source,
        category = EXCLUDED.category,
        target_account_id = EXCLUDED.target_account_id,
        target_type = EXCLUDED.target_type,
        updated_at = EXCLUDED.updated_at;
    END LOOP;
  ELSE
    DELETE FROM public.incomes WHERE user_email = p_email;
  END IF;

  -- 7. Synchronize Expenses
  IF p_expenses IS NOT NULL THEN
    DELETE FROM public.expenses
    WHERE user_email = p_email 
      AND id NOT IN (SELECT jsonb_array_elements(p_expenses)->>'id');

    FOR v_item IN SELECT jsonb_array_elements(p_expenses) LOOP
      INSERT INTO public.expenses (
        id, user_email, title, description, amount, date, category, payment_method_id, payment_method_type, updated_at
      ) VALUES (
        v_item->>'id',
        p_email,
        v_item->>'title',
        v_item->>'description',
        (v_item->>'amount')::numeric,
        v_item->>'date',
        v_item->>'category',
        v_item->>'payment_method_id',
        v_item->>'payment_method_type',
        timezone('utc'::text, now())
      ) ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        amount = EXCLUDED.amount,
        date = EXCLUDED.date,
        category = EXCLUDED.category,
        payment_method_id = EXCLUDED.payment_method_id,
        payment_method_type = EXCLUDED.payment_method_type,
        updated_at = EXCLUDED.updated_at;
    END LOOP;
  ELSE
    DELETE FROM public.expenses WHERE user_email = p_email;
  END IF;

  -- 8. Synchronize Notifications
  IF p_notifications IS NOT NULL THEN
    DELETE FROM public.notifications
    WHERE user_email = p_email 
      AND id NOT IN (SELECT jsonb_array_elements(p_notifications)->>'id');

    FOR v_item IN SELECT jsonb_array_elements(p_notifications) LOOP
      INSERT INTO public.notifications (
        id, user_email, type, message, date, read, updated_at
      ) VALUES (
        v_item->>'id',
        p_email,
        v_item->>'type',
        v_item->>'message',
        v_item->>'date',
        coalesce((v_item->>'read')::boolean, false),
        timezone('utc'::text, now())
      ) ON CONFLICT (id) DO UPDATE SET
        type = EXCLUDED.type,
        message = EXCLUDED.message,
        date = EXCLUDED.date,
        read = EXCLUDED.read,
        updated_at = EXCLUDED.updated_at;
    END LOOP;
  ELSE
    DELETE FROM public.notifications WHERE user_email = p_email;
  END IF;

  -- 9. Synchronize Subscriptions
  IF p_subscriptions IS NOT NULL THEN
    DELETE FROM public.subscriptions
    WHERE user_email = p_email 
      AND id NOT IN (SELECT jsonb_array_elements(p_subscriptions)->>'id');

    FOR v_item IN SELECT jsonb_array_elements(p_subscriptions) LOOP
      INSERT INTO public.subscriptions (
        id, user_email, name, amount, billing_cycle, due_date, category, status, payment_method_id, payment_method_type, last_paid_date, updated_at
      ) VALUES (
        v_item->>'id',
        p_email,
        v_item->>'name',
        (v_item->>'amount')::numeric,
        v_item->>'billing_cycle',
        v_item->>'due_date',
        v_item->>'category',
        v_item->>'status',
        v_item->>'payment_method_id',
        v_item->>'payment_method_type',
        v_item->>'last_paid_date',
        timezone('utc'::text, now())
      ) ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        amount = EXCLUDED.amount,
        billing_cycle = EXCLUDED.billing_cycle,
        due_date = EXCLUDED.due_date,
        category = EXCLUDED.category,
        status = EXCLUDED.status,
        payment_method_id = EXCLUDED.payment_method_id,
        payment_method_type = EXCLUDED.payment_method_type,
        last_paid_date = EXCLUDED.last_paid_date,
        updated_at = EXCLUDED.updated_at;
    END LOOP;
  ELSE
    DELETE FROM public.subscriptions WHERE user_email = p_email;
  END IF;

  -- 10. Synchronize Loans Given
  IF p_loans_given IS NOT NULL THEN
    DELETE FROM public.loans_given
    WHERE user_email = p_email 
      AND id NOT IN (SELECT jsonb_array_elements(p_loans_given)->>'id');

    FOR v_item IN SELECT jsonb_array_elements(p_loans_given) LOOP
      INSERT INTO public.loans_given (
        id, user_email, borrower_name, total_amount, remaining_amount, date_given, source_account_id, source_account_type, source_account_name, status, notes, settlements, updated_at
      ) VALUES (
        v_item->>'id',
        p_email,
        v_item->>'borrower_name',
        (v_item->>'total_amount')::numeric,
        (v_item->>'remaining_amount')::numeric,
        v_item->>'date_given',
        v_item->>'source_account_id',
        v_item->>'source_account_type',
        v_item->>'source_account_name',
        v_item->>'status',
        v_item->>'notes',
        coalesce((v_item->'settlements'), '[]'::jsonb),
        timezone('utc'::text, now())
      ) ON CONFLICT (id) DO UPDATE SET
        borrower_name = EXCLUDED.borrower_name,
        total_amount = EXCLUDED.total_amount,
        remaining_amount = EXCLUDED.remaining_amount,
        date_given = EXCLUDED.date_given,
        source_account_id = EXCLUDED.source_account_id,
        source_account_type = EXCLUDED.source_account_type,
        source_account_name = EXCLUDED.source_account_name,
        status = EXCLUDED.status,
        notes = EXCLUDED.notes,
        settlements = EXCLUDED.settlements,
        updated_at = EXCLUDED.updated_at;
    END LOOP;
  ELSE
    DELETE FROM public.loans_given WHERE user_email = p_email;
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

alter table public.bank_cards add column if not exists "limit" numeric;
alter table public.bank_cards add column if not exists is_limit_locked boolean default true;
alter table public.bank_cards add column if not exists card_theme text default 'obsidian';
alter table public.transactions add column if not exists charge numeric default 0;
alter table public.transactions add column if not exists transfer_charge numeric default 0;
alter table public.auth_accounts add column if not exists name text;
alter table public.debts add column if not exists account_id text;
alter table public.debts add column if not exists account_type text;
alter table public.debts add column if not exists account_name text;

-- ENABLE CRYPTO EXTENSION
create extension if not exists pgcrypto;

-- CREATE CRYPTOGRAPHIC SESSION VERIFIER
create or replace function public.verify_user_token(headers json) returns text as $$
declare
  token text;
  email text;
  parts text[];
  payload_str text;
  signature text;
  expected_signature text;
  payload json;
  expires_at bigint;
  secret text;
begin
  if headers is null then
    return null;
  end if;
  
  -- Extracted headers from connection
  token := headers->>'x-session-token';
  email := headers->>'x-user-email';
  if token is null or email is null then
    return null;
  end if;
  
  -- Split token by '.' which divides HMAC text payload and signature
  parts := string_to_array(token, '.');
  if array_length(parts, 1) != 2 then
    return null;
  end if;
  
  payload_str := parts[1];
  signature := parts[2];
  
  -- Get secret from database configuration or local fallback
  secret := coalesce(nullif(current_setting('app.settings.session_secret', true), ''), 'vault_secure_suite_signature_key_2026_x92');
  
  -- Compute the expected cryptographic signature
  expected_signature := encode(hmac(payload_str, secret, 'sha256'), 'hex');
  if signature != expected_signature then
    return null;
  end if;
  
  -- Translate the base64url payload safe conversion
  payload_str := rpad(replace(replace(payload_str, '-', '+'), '_', '/'), (ceil(length(payload_str) / 4.0) * 4)::integer, '=');
  payload := convert_from(decode(payload_str, 'base64'), 'utf-8')::json;
  
  -- Prevent session replay expiration bounds
  expires_at := (payload->>'expiresAt')::bigint;
  if expires_at < (date_part('epoch', now()) * 1000)::bigint then
    return null;
  end if;
  
  -- Clean validated email response
  if lower(payload->>'email') = lower(email) then
    return email;
  end if;
  
  return null;
exception
  when others then
    return null;
end;
$$ language plpgsql security definer;

-- Upgrade script for subscriptions:
create table if not exists public.subscriptions (
  id text not null primary key,
  user_email text not null,
  name text not null,
  amount numeric not null default 0,
  billing_cycle text not null, -- 'Monthly' | 'Yearly'
  due_date text not null, -- YYYY-MM-DD or standard date format
  category text not null,
  status text not null, -- 'Active' | 'Paused' | 'Cancelled'
  payment_method_id text,
  payment_method_type text,
  last_paid_date text,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.subscriptions enable row level security;

-- Upgrade script for loans_given:
create table if not exists public.loans_given (
  id text not null primary key,
  user_email text not null,
  borrower_name text not null,
  total_amount numeric not null default 0,
  remaining_amount numeric not null default 0,
  date_given text not null,
  source_account_id text not null,
  source_account_type text not null,
  source_account_name text not null,
  status text not null, -- 'Active' | 'Partially Settled' | 'Settled'
  notes text,
  settlements jsonb not null default '[]'::jsonb,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.loans_given enable row level security;

-- DROP AND RE-CREATE SECURED RLS tenant isolation policies
drop policy if exists "Secure select on subscriptions" on public.subscriptions;
drop policy if exists "Secure insert on subscriptions" on public.subscriptions;
drop policy if exists "Secure update on subscriptions" on public.subscriptions;
drop policy if exists "Secure delete on subscriptions" on public.subscriptions;

drop policy if exists "Allow read accessibility on subscriptions" on public.subscriptions;
drop policy if exists "Allow insert/upsert accessibility on subscriptions" on public.subscriptions;
drop policy if exists "Allow update accessibility on subscriptions" on public.subscriptions;
drop policy if exists "Allow delete accessibility on subscriptions" on public.subscriptions;

create policy "Secure select on subscriptions" on public.subscriptions for select using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure insert on subscriptions" on public.subscriptions for insert with check (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure update on subscriptions" on public.subscriptions for update using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure delete on subscriptions" on public.subscriptions for delete using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));

drop policy if exists "Secure select on loans_given" on public.loans_given;
drop policy if exists "Secure insert on loans_given" on public.loans_given;
drop policy if exists "Secure update on loans_given" on public.loans_given;
drop policy if exists "Secure delete on loans_given" on public.loans_given;

drop policy if exists "Allow read accessibility on loans_given" on public.loans_given;
drop policy if exists "Allow insert/upsert accessibility on loans_given" on public.loans_given;
drop policy if exists "Allow update accessibility on loans_given" on public.loans_given;
drop policy if exists "Allow delete accessibility on loans_given" on public.loans_given;

create policy "Secure select on loans_given" on public.loans_given for select using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure insert on loans_given" on public.loans_given for insert with check (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure update on loans_given" on public.loans_given for update using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure delete on loans_given" on public.loans_given for delete using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json));

-- DATABASE UPGRADE - SYSTEM BYPASS VERIFIER, RATE LIMIT TABLE, FOREIGN KEYS, CASCADE DELETE AND PERFORMANCE INDEXES
create or replace function public.verify_system_signature(headers json) returns boolean as $$
declare
  token text;
  parts text[];
  payload_str text;
  signature text;
  expected_signature text;
  secret text;
begin
  if headers is null then
    return false;
  end if;
  
  token := headers->>'x-system-token';
  if token is null then
    return false;
  end if;
  
  parts := string_to_array(token, '.');
  if array_length(parts, 1) != 2 then
    return false;
  end if;
  
  payload_str := parts[1];
  signature := parts[2];
  
  secret := coalesce(nullif(current_setting('app.settings.session_secret', true), ''), 'vault_secure_suite_signature_key_2026_x92');
  expected_signature := encode(hmac(payload_str, secret, 'sha256'), 'hex');
  
  return signature = expected_signature;
exception
  when others then
    return false;
end;
$$ language plpgsql security definer;

create table if not exists public.auth_rate_limits (
  key text not null primary key,
  count integer not null default 1,
  reset_time timestamp with time zone not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.auth_rate_limits enable row level security;

-- Setup OTP and Device policy locks with System Cryptographic verification signature
drop policy if exists "Internal system access on auth_otps" on public.auth_otps;
drop policy if exists "Secure system access on auth_otps" on public.auth_otps;
create policy "Secure system access on auth_otps" on public.auth_otps for all
using (public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

drop policy if exists "Internal system access on auth_device_tokens" on public.auth_device_tokens;
drop policy if exists "Secure system access on auth_device_tokens" on public.auth_device_tokens;
create policy "Secure system access on auth_device_tokens" on public.auth_device_tokens for all
using (public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

drop policy if exists "Secure system access on auth_rate_limits" on public.auth_rate_limits;
create policy "Secure system access on auth_rate_limits" on public.auth_rate_limits for all
using (public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

-- Hardening auth_accounts insert check policy
drop policy if exists "Secure insert on auth_accounts" on public.auth_accounts;
create policy "Secure insert on auth_accounts" on public.auth_accounts for insert
with check (public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

-- Add Unique database constraint to allow server ledger state upserts
alter table public.ledger_states drop constraint if exists ledger_states_user_email_key cascade;
alter table public.ledger_states add constraint ledger_states_user_email_key unique (user_email);

-- Add database cascade deletions constraints
alter table public.ledger_states drop constraint if exists ledger_states_user_email_fkey cascade;
alter table public.ledger_states add constraint ledger_states_user_email_fkey foreign key (user_email) references public.auth_accounts(email) on delete cascade;

alter table public.bank_cards drop constraint if exists bank_cards_user_email_fkey cascade;
alter table public.bank_cards add constraint bank_cards_user_email_fkey foreign key (user_email) references public.auth_accounts(email) on delete cascade;

alter table public.cash_accounts drop constraint if exists cash_accounts_user_email_fkey cascade;
alter table public.cash_accounts add constraint cash_accounts_user_email_fkey foreign key (user_email) references public.auth_accounts(email) on delete cascade;

alter table public.transactions drop constraint if exists transactions_user_email_fkey cascade;
alter table public.transactions add constraint transactions_user_email_fkey foreign key (user_email) references public.auth_accounts(email) on delete cascade;

alter table public.debts drop constraint if exists debts_user_email_fkey cascade;
alter table public.debts add constraint debts_user_email_fkey foreign key (user_email) references public.auth_accounts(email) on delete cascade;

alter table public.incomes drop constraint if exists incomes_user_email_fkey cascade;
alter table public.incomes add constraint incomes_user_email_fkey foreign key (user_email) references public.auth_accounts(email) on delete cascade;

alter table public.expenses drop constraint if exists expenses_user_email_fkey cascade;
alter table public.expenses add constraint expenses_user_email_fkey foreign key (user_email) references public.auth_accounts(email) on delete cascade;

alter table public.notifications drop constraint if exists notifications_user_email_fkey cascade;
alter table public.notifications add constraint notifications_user_email_fkey foreign key (user_email) references public.auth_accounts(email) on delete cascade;

alter table public.subscriptions drop constraint if exists subscriptions_user_email_fkey cascade;
alter table public.subscriptions add constraint subscriptions_user_email_fkey foreign key (user_email) references public.auth_accounts(email) on delete cascade;

alter table public.loans_given drop constraint if exists loans_given_user_email_fkey cascade;
alter table public.loans_given add constraint loans_given_user_email_fkey foreign key (user_email) references public.auth_accounts(email) on delete cascade;

-- Performance indexes setup
create index if not exists idx_ledger_states_user_email on public.ledger_states(user_email);
create index if not exists idx_bank_cards_user_email on public.bank_cards(user_email);
create index if not exists idx_cash_accounts_user_email on public.cash_accounts(user_email);
create index if not exists idx_transactions_user_email on public.transactions(user_email);
create index if not exists idx_debts_user_email on public.debts(user_email);
create index if not exists idx_incomes_user_email on public.incomes(user_email);
create index if not exists idx_expenses_user_email on public.expenses(user_email);
create index if not exists idx_notifications_user_email on public.notifications(user_email);
create index if not exists idx_subscriptions_user_email on public.subscriptions(user_email);
create index if not exists idx_loans_given_user_email on public.loans_given(user_email);
`;
}
