import { AppState, Transaction } from './types';

const STORAGE_KEY = 'cashflow_manager_state_v1';

// Synchronize state with offline-first client-side storage
export function saveStateToStorage(state: AppState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Failed to preserve financial state offline:', error);
  }
}

export function loadStateFromStorage(defaultState: AppState): AppState {
  try {
    const serialized = localStorage.getItem(STORAGE_KEY);
    if (!serialized) return defaultState;
    const parsed = JSON.parse(serialized);
    
    // Check if the persisted data is the old default seed test data (containing specific seed IDs)
    const containsOldSeedData = 
      (parsed.cashAccounts && parsed.cashAccounts.some((a: any) => a.id === 'cash-wallet')) ||
      (parsed.cards && parsed.cards.some((c: any) => c.id === 'card-hnb'));

    if (containsOldSeedData) {
      console.log('🧹 Old test seed data detected. Resetting local database to clean state list.');
      localStorage.removeItem(STORAGE_KEY);
      return defaultState;
    }

    // Ensure vital nodes exist
    return {
      ...defaultState,
      ...parsed,
      cashAccounts: parsed.cashAccounts || defaultState.cashAccounts,
      cards: parsed.cards || defaultState.cards,
      creditCards: parsed.creditCards || defaultState.creditCards || [],
      creditCardPurchases: parsed.creditCardPurchases || defaultState.creditCardPurchases || [],
      incomes: parsed.incomes || defaultState.incomes,
      expenses: parsed.expenses || defaultState.expenses,
      debts: parsed.debts || defaultState.debts,
      transactions: parsed.transactions || defaultState.transactions,
      notifications: parsed.notifications || defaultState.notifications,
      subscriptions: parsed.subscriptions || defaultState.subscriptions || [],
      loansGiven: parsed.loansGiven || defaultState.loansGiven || [],
      budgets: parsed.budgets || defaultState.budgets || [],
      savingsGoals: parsed.savingsGoals || defaultState.savingsGoals || [],
    };
  } catch (error) {
    console.error('Failed to retrieve financial state, reverting to genesis defaults:', error);
    return defaultState;
  }
}

// Download state as backup JSON file
export function exportStateAsJSON(state: AppState, userEmail?: string) {
  const payload = {
    version: "EM_BUDGET_SECURE_EX_V1",
    exportedBy: userEmail || "Anonymous",
    exportedAt: new Date().toISOString(),
    data: state
  };
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  const stamp = new Date().toISOString().split('T')[0];
  const emailPrefix = userEmail ? `${userEmail.split('@')[0]}_` : '';
  downloadAnchor.setAttribute("download", `em_budget_${emailPrefix}backup_${stamp}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

// Export Transactions to CSV / Excel spreadsheet
export function exportTransactionsToCSV(transactions: Transaction[], currency: string = 'Rs.') {
  const headers = ['Transaction ID', 'Type', 'Title', 'Amount', 'Date', 'Category', 'Paid Form'];
  const rows = transactions.map(t => [
    t.id,
    t.type.toUpperCase(),
    t.title.replace(/"/g, '""'),
    `${currency} ${t.amount}`,
    t.date,
    t.category,
    t.accountId ? `${t.accountType === 'card' ? 'Card' : 'Cash Account'}: ${t.accountId}` : 'N/A'
  ]);

  const csvContent = "data:text/csv;charset=utf-8," 
    + [headers.join(','), ...rows.map(e => e.map(val => `"${val}"`).join(','))].join('\n');
    
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  const stamp = new Date().toISOString().split('T')[0];
  link.setAttribute("download", `finance_statement_${stamp}.csv`);
  document.body.appendChild(link);
  link.click();
  link.remove();
}

// Standard category colors configuration
export const EXPENSE_COLORS: Record<string, string> = {
  Food: '#F59E0B',        // Amber
  Transport: '#3B82F6',   // Blue
  Shopping: '#EC4899',    // Pink
  Utilities: '#A855F7',   // Purple
  Rent: '#EF4444',        // Red
  Entertainment: '#14B8A6', // Teal
  Medical: '#3B82F6',     // Blue
  Education: '#6366F1',   // Indigo
  'Bank Charges & Interest': '#E11D48', // Crimson/Rose
  Other: '#6B7280',       // Gray
};

export const INCOME_COLORS: Record<string, string> = {
  Salary: '#10B981',      // Green
  Freelance: '#06B6D4',   // Cyan
  Business: '#3B82F6',    // Blue
  Bonus: '#F59E0B',       // Gold
  Commission: '#84CC16',  // Lime
  Other: '#6B7280',       // Gray
};

export interface NetWorthBreakdown {
  cash: number;
  debitCards: number;
  creditCardAssets: number;
  creditCardLiabilities: number;
  debts: number;
  loansGiven: number;
  netWorth: number;
}

export function calculateNetWorth(state: Partial<AppState>): NetWorthBreakdown {
  const cashAccounts = state.cashAccounts || [];
  const cards = state.cards || [];
  const debts = state.debts || [];
  const loansGiven = state.loansGiven || [];

  const cash = cashAccounts.reduce((sum, c) => sum + c.balance, 0);
  
  const debitCards = cards
    .filter(c => !c.isCanceled && c.cardType === 'Debit')
    .reduce((sum, c) => sum + (c.currentBalance - (Number(c.lockedAmount) || 0)), 0);

  const creditCardLiabilities = cards
    .filter(c => !c.isCanceled && c.cardType === 'Credit')
    .reduce((sum, c) => sum + (c.currentBalance < 0 ? Math.abs(c.currentBalance) : 0), 0);

  const creditCardAssets = cards
    .filter(c => !c.isCanceled && c.cardType === 'Credit')
    .reduce((sum, c) => sum + (c.currentBalance > 0 ? c.currentBalance : 0), 0);

  const debtsAmount = debts.reduce((sum, d) => sum + d.remainingAmount, 0);
  const loansGivenAmount = loansGiven.reduce((sum, l) => sum + (l.remainingAmount !== undefined ? l.remainingAmount : l.totalAmount), 0);

  const netWorth = cash + debitCards + creditCardAssets - creditCardLiabilities - debtsAmount + loansGivenAmount;

  return {
    cash,
    debitCards,
    creditCardAssets,
    creditCardLiabilities,
    debts: debtsAmount,
    loansGiven: loansGivenAmount,
    netWorth
  };
}
