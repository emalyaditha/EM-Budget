import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppState } from './types';
import { DEFAULT_APP_STATE } from './initialData';

const URL_STORAGE_KEY = 'cashflow_supabase_url_v1';
const KEY_STORAGE_KEY = 'cashflow_supabase_key_v1';
const AUTO_SYNC_KEY = 'cashflow_supabase_auto_sync_v1';

// Default provided by the user
const DEFAULT_SUPABASE_URL = 'https://iivdlgbztzthjbjzzjna.supabase.co';

export function getSupabaseConfig() {
  const meta = import.meta as any;
  let url = localStorage.getItem(URL_STORAGE_KEY) || (meta.env && meta.env.VITE_SUPABASE_URL) || DEFAULT_SUPABASE_URL;
  if (url && !url.startsWith('http')) {
    url = DEFAULT_SUPABASE_URL;
  }
  const key = localStorage.getItem(KEY_STORAGE_KEY) || (meta.env && meta.env.VITE_SUPABASE_ANON_KEY) || '';
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
let currentSupabaseUrl: string | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) {
    return null;
  }
  try {
    if (!supabaseClientInstance || currentSupabaseUrl !== url) {
      supabaseClientInstance = createClient(url, key, {
        auth: {
          persistSession: false
        }
      });
      currentSupabaseUrl = url;
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
  debts: ['id', 'user_email', 'debt_source', 'total_amount', 'remaining_amount', 'due_date', 'notes', 'payments', 'updated_at'],
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

  let errorDetails: string[] = [];

  try {
    // 1. Core State Unified Backup - Insert row-by-row to maintain audit log history
    const { error: stateError } = await client
      .from('ledger_states')
      .insert({ 
        user_email: email, 
        state: state,
        updated_at: new Date().toISOString()
      });

    if (stateError) {
      throw stateError;
    }

    // 2. Synchronize Remote Bank Cards
    try {
      let cardsCols = await getColumnsForTable('bank_cards');
      if (cardsCols.length > 0) {
        let attempts = 0;
        let success = false;
        while (attempts < 3 && !success) {
          attempts++;
          if (state.cards && state.cards.length > 0) {
            const records = state.cards.map(card => {
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
                card_theme: card.cardTheme || 'obsidian',
                cardTheme: card.cardTheme || 'obsidian'
              });
              // PostgREST upsert determines columns from the FIRST object in the array.
              // If we omit is_canceled on the first item, it ignores is_canceled for ALL items.
              // Therefore, we MUST explicitly map it boolean across the board.
              mapped.is_canceled = Boolean(card.isCanceled === true || (card as any).is_canceled === true);
              
              // Clean up aliases so we don't send duplicate random columns
              delete mapped.is_cancelled;
              delete mapped.isCanceled;

              if (cardsCols.includes('limit')) {
                mapped.limit = card.limit !== undefined ? card.limit : null;
              }
              if (cardsCols.includes('is_limit_locked') || cardsCols.includes('isLimitLocked')) {
                const activeLockCol = cardsCols.includes('is_limit_locked') ? 'is_limit_locked' : 'isLimitLocked';
                mapped[activeLockCol] = card.isLimitLocked !== undefined ? Boolean(card.isLimitLocked) : true;
              }
              if (cardsCols.includes('is_frozen') || cardsCols.includes('isFrozen')) {
                const activeFrozenCol = cardsCols.includes('is_frozen') ? 'is_frozen' : 'isFrozen';
                mapped[activeFrozenCol] = card.isFrozen !== undefined ? Boolean(card.isFrozen) : false;
              }
              
              return mapped;
            });
            
            console.log("DEBUG: bank_cards upsert payload properties:", records.map(r => ({ id: r.id, is_canceled: r.is_canceled })));

            const { data, error: cardsErr } = await client.from('bank_cards').upsert(records, { onConflict: 'id' }).select();
            if (cardsErr) {
              console.warn('Supabase Bank Cards Sync Warning:', cardsErr);
              const errMsg = cardsErr.message || cardsErr.details || '';
              const missingCol = extractMissingColumn(errMsg, 'bank_cards');
              if (missingCol) {
                console.warn(`Self-healing: column '${missingCol}' does not exist on bank_cards in Postgres. Filtering it out and retrying!`);
                cardsCols = cardsCols.filter(c => c !== missingCol && c !== toCamelCase(missingCol) && c !== toSnakeCase(missingCol));
                if (!detectedColumnsCache) detectedColumnsCache = {};
                detectedColumnsCache['bank_cards'] = cardsCols;
                continue;
              }
              errorDetails.push(`Bank Cards Sync: ${cardsErr.message || cardsErr.details}`);
              break;
            } else {
              success = true;
            }
          } else {
            success = true;
          }
        }

        // Clean up cards removed locally
        const activeCardIds = (state.cards || []).map(c => c.id);
        const emailField = cardsCols.includes('user_email') ? 'user_email' : cardsCols.includes('userEmail') ? 'userEmail' : '';
        if (emailField) {
          if (activeCardIds.length > 0) {
            const { data: existing } = await client.from('bank_cards').select('id').eq(emailField, email);
            const toDelete = (existing || []).map((e: any) => e.id).filter((id: string) => !activeCardIds.includes(id));
            if (toDelete.length > 0) {
              // chunk up deletions if needed
              for (let i = 0; i < toDelete.length; i += 100) {
                const { error: delErr } = await client.from('bank_cards').delete().in('id', toDelete.slice(i, i + 100));
                if (delErr) console.warn('Supabase bank_cards delete warning:', delErr);
              }
            }
          } else {
            const { error: delErr } = await client.from('bank_cards').delete().eq(emailField, email);
            if (delErr) {
              console.warn('Supabase Bank Cards delete error:', delErr);
            }
          }
        }
      }
    } catch (cardSyncErr: any) {
      console.error('Error syncing individual bank_cards:', cardSyncErr);
      errorDetails.push(`Bank Cards block: ${cardSyncErr.message || cardSyncErr}`);
    }

    // 3. Synchronize Remote Cash Accounts
    try {
      const cashCols = await getColumnsForTable('cash_accounts');
      if (cashCols.length > 0) {
        if (state.cashAccounts && state.cashAccounts.length > 0) {
          const records = state.cashAccounts.map(acc => mapObjectToColumns(acc, cashCols, email, {
            id: acc.id,
            name: acc.name,
            balance: acc.balance
          }));
          const { error: cashErr } = await client.from('cash_accounts').upsert(records, { onConflict: 'id' });
          if (cashErr) {
            console.warn('Supabase Cash Accounts Sync Warning:', cashErr);
            errorDetails.push(`Cash Accounts Sync: ${cashErr.message || cashErr.details}`);
          }
        }

        // Clean up cash accounts removed locally
        const activeCashIds = (state.cashAccounts || []).map(a => a.id);
        const emailField = cashCols.includes('user_email') ? 'user_email' : cashCols.includes('userEmail') ? 'userEmail' : '';
        if (emailField) {
          if (activeCashIds.length > 0) {
            const { data: existing } = await client.from('cash_accounts').select('id').eq(emailField, email);
            const toDelete = (existing || []).map((e: any) => e.id).filter((id: string) => !activeCashIds.includes(id));
            if (toDelete.length > 0) {
              // chunk up deletions if needed
              for (let i = 0; i < toDelete.length; i += 100) {
                const { error: delErr } = await client.from('cash_accounts').delete().in('id', toDelete.slice(i, i + 100));
                if (delErr) console.warn('Supabase cash_accounts delete warning:', delErr);
              }
            }
          } else {
            const { error: delErr } = await client.from('cash_accounts').delete().eq(emailField, email);
            if (delErr) {
              console.warn('Supabase Cash Accounts delete error:', delErr);
            }
          }
        }
      }
    } catch (cashSyncErr: any) {
      console.error('Error syncing individual cash_accounts:', cashSyncErr);
      errorDetails.push(`Cash Accounts block: ${cashSyncErr.message || cashSyncErr}`);
    }

    // 4. Synchronize Remote Transactions
    try {
      const txCols = await getColumnsForTable('transactions');
      if (txCols.length > 0) {
        if (state.transactions && state.transactions.length > 0) {
          const records = state.transactions.map(tx => mapObjectToColumns(tx, txCols, email, {
            id: tx.id,
            type: tx.type,
            title: tx.title,
            amount: tx.amount,
            charge: tx.charge || 0,
            transfer_charge: tx.charge || 0,
            date: tx.date,
            category: tx.category,
            account_id: tx.accountId || null,
            accountId: tx.accountId || null,
            account_type: tx.accountType || null,
            accountType: tx.accountType || null,
            target_account_id: tx.targetAccountId || null,
            targetAccountId: tx.targetAccountId || null,
            target_account_type: tx.targetAccountType || null,
            targetAccountType: tx.targetAccountType || null,
            reference_id: tx.referenceId || null,
            referenceId: tx.referenceId || null
          }));
          const { error: txErr } = await client.from('transactions').upsert(records, { onConflict: 'id' });
          if (txErr) {
            console.warn('Supabase Transactions Sync Warning:', txErr);
            errorDetails.push(`Transactions Sync: ${txErr.message || txErr.details}`);
          }
        }

        // Clean up transactions removed locally
        const activeTxIds = (state.transactions || []).map(t => t.id);
        const emailField = txCols.includes('user_email') ? 'user_email' : txCols.includes('userEmail') ? 'userEmail' : '';
        if (emailField) {
          if (activeTxIds.length > 0) {
            const { data: existing } = await client.from('transactions').select('id').eq(emailField, email);
            const toDelete = (existing || []).map((e: any) => e.id).filter((id: string) => !activeTxIds.includes(id));
            if (toDelete.length > 0) {
              // chunk up deletions if needed
              for (let i = 0; i < toDelete.length; i += 100) {
                const { error: delErr } = await client.from('transactions').delete().in('id', toDelete.slice(i, i + 100));
                if (delErr) console.warn('Supabase transactions delete warning:', delErr);
              }
            }
          } else {
            const { error: delErr } = await client.from('transactions').delete().eq(emailField, email);
            if (delErr) {
              console.warn('Supabase Transactions delete error:', delErr);
            }
          }
        }
      }
    } catch (txSyncErr: any) {
      console.error('Error syncing individual transactions:', txSyncErr);
      errorDetails.push(`Transactions block: ${txSyncErr.message || txSyncErr}`);
    }

    // 5. Synchronize Remote Debts (Liabilities / Debt Accounts)
    try {
      const debtsCols = await getColumnsForTable('debts');
      if (debtsCols.length > 0) {
        if (state.debts && state.debts.length > 0) {
          const records = state.debts.map(debt => mapObjectToColumns(debt, debtsCols, email, {
            id: debt.id,
            debt_source: debt.debtSource,
            debtSource: debt.debtSource,
            total_amount: debt.totalAmount,
            totalAmount: debt.totalAmount,
            remaining_amount: debt.remainingAmount,
            remainingAmount: debt.remainingAmount,
            due_date: debt.dueDate,
            dueDate: debt.dueDate,
            notes: debt.notes || null,
            payments: debt.payments || []
          }));
          const { error: debtsErr } = await client.from('debts').upsert(records, { onConflict: 'id' });
          if (debtsErr) {
            console.warn('Supabase Debts Sync Warning:', debtsErr);
            errorDetails.push(`Debts Sync: ${debtsErr.message || debtsErr.details}`);
          }
        }

        // Clean up debts removed locally
        const activeDebtIds = (state.debts || []).map(d => d.id);
        const emailField = debtsCols.includes('user_email') ? 'user_email' : debtsCols.includes('userEmail') ? 'userEmail' : '';
        if (emailField) {
          if (activeDebtIds.length > 0) {
            const { data: existing } = await client.from('debts').select('id').eq(emailField, email);
            const toDelete = (existing || []).map((e: any) => e.id).filter((id: string) => !activeDebtIds.includes(id));
            if (toDelete.length > 0) {
              // chunk up deletions if needed
              for (let i = 0; i < toDelete.length; i += 100) {
                const { error: delErr } = await client.from('debts').delete().in('id', toDelete.slice(i, i + 100));
                if (delErr) console.warn('Supabase debts delete warning:', delErr);
              }
            }
          } else {
            const { error: delErr } = await client.from('debts').delete().eq(emailField, email);
            if (delErr) {
              console.warn('Supabase Debts delete error:', delErr);
            }
          }
        }
      }
    } catch (debtsSyncErr: any) {
      console.error('Error syncing individual debts:', debtsSyncErr);
      errorDetails.push(`Debts block: ${debtsSyncErr.message || debtsSyncErr}`);
    }

    // 6. Synchronize Remote Incomes
    try {
      const incomesCols = await getColumnsForTable('incomes');
      if (incomesCols.length > 0) {
        if (state.incomes && state.incomes.length > 0) {
          const records = state.incomes.map(inc => mapObjectToColumns(inc, incomesCols, email, {
            id: inc.id,
            amount: inc.amount,
            date: inc.date,
            source: inc.source,
            category: inc.category,
            target_account_id: inc.targetAccountId,
            targetAccountId: inc.targetAccountId,
            target_type: inc.targetType,
            targetType: inc.targetType
          }));
          const { error: incErr } = await client.from('incomes').upsert(records, { onConflict: 'id' });
          if (incErr) {
            console.warn('Supabase Incomes Sync Warning:', incErr);
            errorDetails.push(`Incomes Sync: ${incErr.message || incErr.details}`);
          }
        }

        // Clean up incomes removed locally
        const activeIncomeIds = (state.incomes || []).map(i => i.id);
        const emailField = incomesCols.includes('user_email') ? 'user_email' : incomesCols.includes('userEmail') ? 'userEmail' : '';
        if (emailField) {
          if (activeIncomeIds.length > 0) {
            const { data: existing } = await client.from('incomes').select('id').eq(emailField, email);
            const toDelete = (existing || []).map((e: any) => e.id).filter((id: string) => !activeIncomeIds.includes(id));
            if (toDelete.length > 0) {
              // chunk up deletions if needed
              for (let i = 0; i < toDelete.length; i += 100) {
                const { error: delErr } = await client.from('incomes').delete().in('id', toDelete.slice(i, i + 100));
                if (delErr) console.warn('Supabase incomes delete warning:', delErr);
              }
            }
          } else {
            const { error: delErr } = await client.from('incomes').delete().eq(emailField, email);
            if (delErr) {
              console.warn('Supabase Incomes delete error:', delErr);
            }
          }
        }
      }
    } catch (incSyncErr: any) {
      console.error('Error syncing individual incomes:', incSyncErr);
      errorDetails.push(`Incomes block: ${incSyncErr.message || incSyncErr}`);
    }

    // 7. Synchronize Remote Expenses
    try {
      const expensesCols = await getColumnsForTable('expenses');
      if (expensesCols.length > 0) {
        if (state.expenses && state.expenses.length > 0) {
          const records = state.expenses.map(exp => mapObjectToColumns(exp, expensesCols, email, {
            id: exp.id,
            title: exp.title,
            description: exp.description || null,
            amount: exp.amount,
            date: exp.date,
            category: exp.category,
            payment_method_id: exp.paymentMethodId,
            paymentMethodId: exp.paymentMethodId,
            payment_method_type: exp.paymentMethodType,
            paymentMethodType: exp.paymentMethodType
          }));
          const { error: expErr } = await client.from('expenses').upsert(records, { onConflict: 'id' });
          if (expErr) {
            console.warn('Supabase Expenses Sync Warning:', expErr);
            errorDetails.push(`Expenses Sync: ${expErr.message || expErr.details}`);
          }
        }

        // Clean up expenses removed locally
        const activeExpenseIds = (state.expenses || []).map(e => e.id);
        const emailField = expensesCols.includes('user_email') ? 'user_email' : expensesCols.includes('userEmail') ? 'userEmail' : '';
        if (emailField) {
          if (activeExpenseIds.length > 0) {
            const { data: existing } = await client.from('expenses').select('id').eq(emailField, email);
            const toDelete = (existing || []).map((e: any) => e.id).filter((id: string) => !activeExpenseIds.includes(id));
            if (toDelete.length > 0) {
              // chunk up deletions if needed
              for (let i = 0; i < toDelete.length; i += 100) {
                const { error: delErr } = await client.from('expenses').delete().in('id', toDelete.slice(i, i + 100));
                if (delErr) console.warn('Supabase expenses delete warning:', delErr);
              }
            }
          } else {
            const { error: delErr } = await client.from('expenses').delete().eq(emailField, email);
            if (delErr) {
              console.warn('Supabase Expenses delete error:', delErr);
            }
          }
        }
      }
    } catch (expSyncErr: any) {
      console.error('Error syncing individual expenses:', expSyncErr);
      errorDetails.push(`Expenses block: ${expSyncErr.message || expSyncErr}`);
    }

    // 8. Synchronize Remote Notifications
    try {
      const notificationsCols = await getColumnsForTable('notifications');
      if (notificationsCols.length > 0) {
        if (state.notifications && state.notifications.length > 0) {
          const records = state.notifications.map(notif => mapObjectToColumns(notif, notificationsCols, email, {
            id: notif.id,
            type: notif.type,
            message: notif.message,
            date: notif.date,
            read: notif.read
          }));
          const { error: notifErr } = await client.from('notifications').upsert(records, { onConflict: 'id' });
          if (notifErr) {
            console.warn('Supabase Notifications Sync Warning:', notifErr);
            errorDetails.push(`Notifications Sync: ${notifErr.message || notifErr.details}`);
          }
        }

        // Clean up notifications removed locally
        const activeNotifIds = (state.notifications || []).map(n => n.id);
        const emailField = notificationsCols.includes('user_email') ? 'user_email' : notificationsCols.includes('userEmail') ? 'userEmail' : '';
        if (emailField) {
          if (activeNotifIds.length > 0) {
            const { data: existing } = await client.from('notifications').select('id').eq(emailField, email);
            const toDelete = (existing || []).map((e: any) => e.id).filter((id: string) => !activeNotifIds.includes(id));
            if (toDelete.length > 0) {
              // chunk up deletions if needed
              for (let i = 0; i < toDelete.length; i += 100) {
                const { error: delErr } = await client.from('notifications').delete().in('id', toDelete.slice(i, i + 100));
                if (delErr) console.warn('Supabase notifications delete warning:', delErr);
              }
            }
          } else {
            const { error: delErr } = await client.from('notifications').delete().eq(emailField, email);
            if (delErr) {
              console.warn('Supabase Notifications delete error:', delErr);
            }
          }
        }
      }
    } catch (notifSyncErr: any) {
      console.error('Error syncing individual notifications:', notifSyncErr);
      errorDetails.push(`Notifications block: ${notifSyncErr.message || notifSyncErr}`);
    }

    // 9. Synchronize Remote Subscriptions
    try {
      const subscriptionsCols = await getColumnsForTable('subscriptions');
      if (subscriptionsCols.length > 0) {
        if (state.subscriptions && state.subscriptions.length > 0) {
          const records = state.subscriptions.map(sub => mapObjectToColumns(sub, subscriptionsCols, email, {
            id: sub.id,
            name: sub.name,
            amount: sub.amount,
            billing_cycle: sub.billingCycle,
            billingCycle: sub.billingCycle,
            due_date: sub.dueDate,
            dueDate: sub.dueDate,
            category: sub.category,
            status: sub.status,
            payment_method_id: sub.paymentMethodId || null,
            paymentMethodId: sub.paymentMethodId || null,
            payment_method_type: sub.paymentMethodType || null,
            paymentMethodType: sub.paymentMethodType || null,
            last_paid_date: sub.lastPaidDate || null,
            lastPaidDate: sub.lastPaidDate || null
          }));
          const { error: subErr } = await client.from('subscriptions').upsert(records, { onConflict: 'id' });
          if (subErr) {
            console.warn('Supabase Subscriptions Sync Warning:', subErr);
            errorDetails.push(`Subscriptions Sync: ${subErr.message || subErr.details}`);
          }
        }

        // Clean up subscriptions removed locally
        const activeSubIds = (state.subscriptions || []).map(s => s.id);
        const emailField = subscriptionsCols.includes('user_email') ? 'user_email' : subscriptionsCols.includes('userEmail') ? 'userEmail' : '';
        if (emailField) {
          if (activeSubIds.length > 0) {
            const { data: existing } = await client.from('subscriptions').select('id').eq(emailField, email);
            const toDelete = (existing || []).map((e: any) => e.id).filter((id: string) => !activeSubIds.includes(id));
            if (toDelete.length > 0) {
              for (let i = 0; i < toDelete.length; i += 100) {
                const { error: delErr } = await client.from('subscriptions').delete().in('id', toDelete.slice(i, i + 100));
                if (delErr) console.warn('Supabase subscriptions delete warning:', delErr);
              }
            }
          } else {
            const { error: delErr } = await client.from('subscriptions').delete().eq(emailField, email);
            if (delErr) {
              console.warn('Supabase Subscriptions delete error:', delErr);
            }
          }
        }
      }
    } catch (subSyncErr: any) {
      console.error('Error syncing individual subscriptions:', subSyncErr);
      errorDetails.push(`Subscriptions block: ${subSyncErr.message || subSyncErr}`);
    }

    // 10. Synchronize Remote Loans Given
    try {
      const loansCols = await getColumnsForTable('loans_given');
      if (loansCols.length > 0) {
        if (state.loansGiven && state.loansGiven.length > 0) {
          const records = state.loansGiven.map(loan => mapObjectToColumns(loan, loansCols, email, {
            id: loan.id,
            borrower_name: loan.borrowerName,
            borrowerName: loan.borrowerName,
            total_amount: loan.totalAmount,
            totalAmount: loan.totalAmount,
            remaining_amount: loan.remainingAmount,
            remainingAmount: loan.remainingAmount,
            date_given: loan.dateGiven,
            dateGiven: loan.dateGiven,
            source_account_id: loan.sourceAccountId,
            sourceAccountId: loan.sourceAccountId,
            source_account_type: loan.sourceAccountType,
            sourceAccountType: loan.sourceAccountType,
            source_account_name: loan.sourceAccountName,
            sourceAccountName: loan.sourceAccountName,
            status: loan.status,
            notes: loan.notes || null,
            settlements: loan.settlements || []
          }));
          const { error: loanErr } = await client.from('loans_given').upsert(records, { onConflict: 'id' });
          if (loanErr) {
            console.warn('Supabase Loans Given Sync Warning:', loanErr);
            errorDetails.push(`Loans Given Sync: ${loanErr.message || loanErr.details}`);
          }
        }

        // Clean up loans_given removed locally
        const activeLoanIds = (state.loansGiven || []).map(l => l.id);
        const emailField = loansCols.includes('user_email') ? 'user_email' : loansCols.includes('userEmail') ? 'userEmail' : '';
        if (emailField) {
          if (activeLoanIds.length > 0) {
            const { data: existing } = await client.from('loans_given').select('id').eq(emailField, email);
            const toDelete = (existing || []).map((e: any) => e.id).filter((id: string) => !activeLoanIds.includes(id));
            if (toDelete.length > 0) {
              for (let i = 0; i < toDelete.length; i += 100) {
                const { error: delErr } = await client.from('loans_given').delete().in('id', toDelete.slice(i, i + 100));
                if (delErr) console.warn('Supabase loans_given delete warning:', delErr);
              }
            }
          } else {
            const { error: delErr } = await client.from('loans_given').delete().eq(emailField, email);
            if (delErr) {
              console.warn('Supabase Loans Given delete error:', delErr);
            }
          }
        }
      }
    } catch (loansSyncErr: any) {
      console.error('Error syncing individual loans_given:', loansSyncErr);
      errorDetails.push(`Loans Given block: ${loansSyncErr.message || loansSyncErr}`);
    }

    if (errorDetails.length > 0) {
      return { success: false, error: errorDetails.join('; ') };
    }

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

    // Load loansGiven from the relational loans_given table first, fallback to ledger_states if missing
    let fetchedLoansGiven: any[] = [];
    try {
      const loansResult = await client.from('loans_given').select('*').eq('user_email', email);
      if (!loansResult.error && loansResult.data) {
        fetchedLoansGiven = loansResult.data.map(mapDatabaseResultToState);
      } else {
        if (loansResult.error) {
          console.warn('loans_given relational table read error or does not exist, falling back to ledger_states:', loansResult.error);
        }
        // Fallback to ledger_states
        const { data: latestStateData, error: stateErr } = await client
          .from('ledger_states')
          .select('state')
          .eq('user_email', email)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!stateErr && latestStateData && latestStateData.state) {
          const fullJsonStateStr = latestStateData.state as any;
          if (fullJsonStateStr.loansGiven) {
            fetchedLoansGiven = fullJsonStateStr.loansGiven;
          }
        }
      }
    } catch (e) {
      console.warn('Could not restore loans_given from database or ledger_states:', e);
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
      loansGiven: fetchedLoansGiven
    };

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

create policy "Allow read accessibility on subscriptions" on public.subscriptions for select using (true);
create policy "Allow insert/upsert accessibility on subscriptions" on public.subscriptions for insert with check (true);
create policy "Allow update accessibility on subscriptions" on public.subscriptions for update using (true);
create policy "Allow delete accessibility on subscriptions" on public.subscriptions for delete using (true);

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

create policy "Allow read accessibility on loans_given" on public.loans_given for select using (true);
create policy "Allow insert/upsert accessibility on loans_given" on public.loans_given for insert with check (true);
create policy "Allow update accessibility on loans_given" on public.loans_given for update using (true);
create policy "Allow delete accessibility on loans_given" on public.loans_given for delete using (true);

-- 1. CREATE CORE STATE MATRIX FOR FLUTTER <-> REACT STATE SYNC (Appends row-by-row history list)
create table if not exists public.ledger_states (
  id uuid default gen_random_uuid() primary key,
  user_email text not null,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Note: If you previously created ledger_states table with a UNIQUE constraint on user_email, run this to drop the unique constraint so multiple rows can be stored:
-- alter table public.ledger_states drop constraint if exists ledger_states_user_email_key;

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
create policy "Allow read accessibility on auth_accounts" on public.auth_accounts for select using (true);
create policy "Allow insert accessibility on auth_accounts" on public.auth_accounts for insert with check (true);
create policy "Allow update accessibility on auth_accounts" on public.auth_accounts for update using (true);

-- 11. SETUP PUBLIC BYPASS CRUD POLICIES (React Client-Side Syncing Enabled)
create policy "Allow read accessibility on states" on public.ledger_states for select using (true);
create policy "Allow insert/upsert accessibility on states" on public.ledger_states for insert with check (true);
create policy "Allow update accessibility on states" on public.ledger_states for update using (true);

create policy "Allow read accessibility on cards" on public.bank_cards for select using (true);
create policy "Allow insert/upsert accessibility on cards" on public.bank_cards for insert with check (true);
create policy "Allow update accessibility on cards" on public.bank_cards for update using (true);
create policy "Allow delete accessibility on cards" on public.bank_cards for delete using (true);

create policy "Allow read accessibility on cash" on public.cash_accounts for select using (true);
create policy "Allow insert/upsert accessibility on cash" on public.cash_accounts for insert with check (true);
create policy "Allow update accessibility on cash" on public.cash_accounts for update using (true);
create policy "Allow delete accessibility on cash" on public.cash_accounts for delete using (true);

create policy "Allow read accessibility on tx" on public.transactions for select using (true);
create policy "Allow insert/upsert accessibility on tx" on public.transactions for insert with check (true);
create policy "Allow update accessibility on tx" on public.transactions for update using (true);
create policy "Allow delete accessibility on tx" on public.transactions for delete using (true);

create policy "Allow read accessibility on debts" on public.debts for select using (true);
create policy "Allow insert/upsert accessibility on debts" on public.debts for insert with check (true);
create policy "Allow update accessibility on debts" on public.debts for update using (true);
create policy "Allow delete accessibility on debts" on public.debts for delete using (true);

create policy "Allow read accessibility on incomes" on public.incomes for select using (true);
create policy "Allow insert/upsert accessibility on incomes" on public.incomes for insert with check (true);
create policy "Allow update accessibility on incomes" on public.incomes for update using (true);
create policy "Allow delete accessibility on incomes" on public.incomes for delete using (true);

create policy "Allow read accessibility on expenses" on public.expenses for select using (true);
create policy "Allow insert/upsert accessibility on expenses" on public.expenses for insert with check (true);
create policy "Allow update accessibility on expenses" on public.expenses for update using (true);
create policy "Allow delete accessibility on expenses" on public.expenses for delete using (true);

create policy "Allow read accessibility on notifications" on public.notifications for select using (true);
create policy "Allow insert/upsert accessibility on notifications" on public.notifications for insert with check (true);
create policy "Allow update accessibility on notifications" on public.notifications for update using (true);
create policy "Allow delete accessibility on notifications" on public.notifications for delete using (true);
`;
}

/**
 * Returns the upgrade migration query for live database tables
 */
export function getSupabaseUpgradeSQLScript(): string {
  return `-- ⚠️ DATABASE UPGRADE MIGRATION
-- To update your live Supabase database instantly, go to your Supabase Dashboard > SQL Editor and copy-paste the matching upgrade migration query below:

alter table public.bank_cards add column if not exists "limit" numeric;
alter table public.bank_cards add column if not exists is_limit_locked boolean default true;
alter table public.bank_cards add column if not exists card_theme text default 'obsidian';
alter table public.transactions add column if not exists charge numeric default 0;
alter table public.transactions add column if not exists transfer_charge numeric default 0;
alter table public.auth_accounts add column if not exists name text;

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

create policy "Allow read accessibility on subscriptions" on public.subscriptions for select using (true);
create policy "Allow insert/upsert accessibility on subscriptions" on public.subscriptions for insert with check (true);
create policy "Allow update accessibility on subscriptions" on public.subscriptions for update using (true);
create policy "Allow delete accessibility on subscriptions" on public.subscriptions for delete using (true);

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

create policy "Allow read accessibility on loans_given" on public.loans_given for select using (true);
create policy "Allow insert/upsert accessibility on loans_given" on public.loans_given for insert with check (true);
create policy "Allow update accessibility on loans_given" on public.loans_given for update using (true);
create policy "Allow delete accessibility on loans_given" on public.loans_given for delete using (true);
`;
}
