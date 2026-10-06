import type {
  AppState,
  Transaction,
  CashAccount,
  BankCard,
  Debt,
  LoanGiven,
  Subscription,
  Budget,
  SavingsGoal,
  Income,
  Expense,
} from './types';
import { downloadBlob, escapeCsvRow } from './lib/download';
import { sumMoney, subtractMoney, toMinorUnits } from './lib/money';
import { logger } from './lib/logger';

// Local-timezone "YYYY-MM-DD" day key. Replaces the widespread
// `new Date().toISOString().split('T')[0]` pattern, which returns the UTC date
// and can be YESTERDAY for UTC+5:30 users in the morning — misdating entries and
// filing them under the wrong month or chart column.
export function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function todayLocal(): string {
  return localDayKey(new Date());
}

// An alert is worth surfacing for its own day and the one before it, and for
// nothing older. Everything the app files as a notification carries a ledger
// day, so without this window a cleared entry that the cloud still had, or a
// note from last month, kept returning to the top of the list forever.
const ALERT_LOOKBACK_DAYS = 1;

/** Midnight, local time, for a ledger day (`YYYY-MM-DD`) or a full timestamp.
 *  A bare day is parsed from its parts on purpose: `new Date('2026-10-04')` is
 *  read as UTC midnight, which is the previous evening for a UTC+5:30 reader. */
function dayStartMs(value: string): number | null {
  const trimmed = value.trim();
  const parts = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (parts) return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])).getTime();
  const instant = Date.parse(trimmed);
  if (isNaN(instant)) return null;
  return new Date(instant).setHours(0, 0, 0, 0);
}

/** True when a ledger day falls in the same calendar month as `nowMs`. Month
 *  figures used to test `date.includes('-10-')`, which matched October of every
 *  year on record and inflated every monthly total in the app. */
export function isInCurrentMonth(iso: string | undefined, nowMs: number = Date.now()): boolean {
  if (!iso) return false;
  const day = dayStartMs(iso);
  if (day === null || isNaN(day)) return false;
  const now = new Date(nowMs);
  const then = new Date(day);
  return then.getFullYear() === now.getFullYear() && then.getMonth() === now.getMonth();
}

/** True when a ledger day (`YYYY-MM-DD`, or a timestamp) is today or yesterday. */
export function isAlertDayRecent(iso: string | undefined, nowMs: number = Date.now()): boolean {
  if (!iso) return false;
  const day = dayStartMs(iso);
  if (day === null || isNaN(day)) return false;
  const today = new Date(nowMs).setHours(0, 0, 0, 0);
  return day <= today && today - day <= ALERT_LOOKBACK_DAYS * 86400000;
}

/** Advance a ledger day (`YYYY-MM-DD`, or a timestamp) by whole months, clamped to
 *  the last day of the target month. `Date#setMonth` overflows instead: a schedule
 *  due on the 31st rolled to Mar 3 because Feb 31 does not exist, pushing every
 *  short-month due date a few days into the following month — which is what feeds
 *  late-fee and installment-due logic.
 *  The clamp is one-way. A rolled Feb 28 advances to Mar 28, not Mar 31, because
 *  nothing in the data model remembers the original anniversary day. */
export function addMonthsClamped(iso: string, months: number): string {
  const start = dayStartMs(iso);
  if (start === null) return iso;
  const src = new Date(start);
  const target = new Date(src.getFullYear(), src.getMonth() + months, 1);
  const lastDayOfTarget = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return localDayKey(new Date(target.getFullYear(), target.getMonth(), Math.min(src.getDate(), lastDayOfTarget)));
}

const STORAGE_KEY = 'cashflow_manager_state_v1';
const STORAGE_OWNER_KEY = 'cashflow_manager_state_owner_v1';
const STORAGE_DIRTY_OWNER_KEY = 'cashflow_manager_state_dirty_owner_v1';

// Durable "local is ahead of cloud" marker.
//
// Mobile browsers do not reliably fire beforeunload (a swiped-away tab on iOS /
// Android Chrome is simply killed), so an in-flight or debounced push can be lost
// with no hook left to retry it. On the next boot the app cannot tell whether the
// local mirror is merely stale or holds edits the cloud has never seen — and the
// hydration path replaces local with cloud unless it knows the difference. This
// flag closes that gap: it is set the instant state changes and cleared only when
// the server confirms the push, so an interrupted sync survives the reload.
export function markStateDirty(ownerEmail?: string) {
  if (!ownerEmail) return;
  try {
    localStorage.setItem(STORAGE_DIRTY_OWNER_KEY, ownerEmail.trim().toLowerCase());
  } catch (error) {
    logger.error('Failed to record unsynced state marker:', error);
  }
}

export function clearStateDirty(ownerEmail?: string) {
  if (!ownerEmail) return;
  try {
    if (isStateDirty(ownerEmail)) localStorage.removeItem(STORAGE_DIRTY_OWNER_KEY);
  } catch (error) {
    logger.error('Failed to clear unsynced state marker:', error);
  }
}

export function isStateDirty(ownerEmail?: string): boolean {
  if (!ownerEmail) return false;
  try {
    const dirtyOwner = (localStorage.getItem(STORAGE_DIRTY_OWNER_KEY) || '').trim().toLowerCase();
    return dirtyOwner !== '' && dirtyOwner === ownerEmail.trim().toLowerCase();
  } catch {
    return false;
  }
}

const DELETED_IDS_KEY = 'cashflow_manager_deleted_ids_v1';

// Deletion tombstones. A merge that unions local and cloud by id has no way to
// distinguish "this record was deleted locally" from "this record was never seen
// locally", so any cloud copy of a deleted row is resurrected on the next sync.
// Deletions therefore need their own durable record, kept until a push confirms
// the removal reached the server.
function readTombstones(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(DELETED_IDS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string[]> = {};
    for (const [email, ids] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(ids)) out[email.trim().toLowerCase()] = ids.filter((x): x is string => typeof x === 'string');
    }
    return out;
  } catch {
    return {};
  }
}

export function recordDeletions(ownerEmail: string | undefined, ids: Iterable<string>) {
  if (!ownerEmail) return;
  const newIds = [...ids];
  if (newIds.length === 0) return;
  try {
    const key = ownerEmail.trim().toLowerCase();
    const all = readTombstones();
    const existing = new Set(all[key] || []);
    for (const id of newIds) existing.add(id);
    all[key] = [...existing];
    localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(all));
  } catch (error) {
    logger.error('Failed to record deletion tombstones:', error);
  }
}

export function getTombstonedIds(ownerEmail?: string): Set<string> {
  if (!ownerEmail) return new Set();
  return new Set(readTombstones()[ownerEmail.trim().toLowerCase()] || []);
}

export function clearTombstones(ownerEmail?: string) {
  if (!ownerEmail) return;
  try {
    const key = ownerEmail.trim().toLowerCase();
    const all = readTombstones();
    if (!(key in all)) return;
    delete all[key];
    localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(all));
  } catch (error) {
    logger.error('Failed to clear deletion tombstones:', error);
  }
}

// Closed alerts. Unlike ledger rows these are not worth a tombstone that
// survives a push — the point of closing one is that it stops nagging for the
// day it was raised and the day before, so a dismissal is stamped with its day
// and simply stops being honoured once it falls outside that window.
const DISMISSED_ALERTS_KEY = 'cashflow_manager_dismissed_alerts_v1';

/** owner email -> alert id -> the local day it was closed. */
function readDismissedAlerts(): Record<string, Record<string, string>> {
  try {
    const raw = localStorage.getItem(DISMISSED_ALERTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, Record<string, string>> = {};
    for (const [email, byId] of Object.entries(parsed as Record<string, unknown>)) {
      if (!byId || typeof byId !== 'object' || Array.isArray(byId)) continue;
      const clean: Record<string, string> = {};
      for (const [id, day] of Object.entries(byId as Record<string, unknown>)) {
        if (typeof day === 'string') clean[id] = day;
      }
      out[email.trim().toLowerCase()] = clean;
    }
    return out;
  } catch {
    return {};
  }
}

export function recordDismissedAlerts(ownerEmail: string | undefined, ids: Iterable<string>) {
  if (!ownerEmail) return;
  const newIds = [...ids];
  if (newIds.length === 0) return;
  try {
    const key = ownerEmail.trim().toLowerCase();
    const all = readDismissedAlerts();
    const day = todayLocal();
    // Re-reading the window here also prunes, so the record cannot grow without
    // bound on a long-lived device.
    const mine: Record<string, string> = {};
    for (const [id, closedDay] of Object.entries(all[key] || {})) {
      if (isAlertDayRecent(closedDay)) mine[id] = closedDay;
    }
    for (const id of newIds) mine[id] = day;
    all[key] = mine;
    localStorage.setItem(DISMISSED_ALERTS_KEY, JSON.stringify(all));
  } catch (error) {
    logger.error('Failed to record dismissed alerts:', error);
  }
}

/** Ids this account has closed that are still inside the today-or-yesterday window. */
export function getDismissedAlertIds(ownerEmail?: string, nowMs: number = Date.now()): Set<string> {
  if (!ownerEmail) return new Set();
  const mine = readDismissedAlerts()[ownerEmail.trim().toLowerCase()] || {};
  return new Set(
    Object.entries(mine)
      .filter(([, closedDay]) => isAlertDayRecent(closedDay, nowMs))
      .map(([id]) => id),
  );
}

// Synchronize state with offline-first client-side storage. The mirror is
// tagged with the owning account so a shared device never paints one user's
// ledger for another (the boot fast-path reads this mirror before the cloud
// sync completes, so the owner check must be enforced here).
export function saveStateToStorage(state: AppState, ownerEmail?: string) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (ownerEmail) localStorage.setItem(STORAGE_OWNER_KEY, ownerEmail.trim().toLowerCase());
  } catch (error) {
    logger.error('Failed to preserve financial state offline:', error);
  }
}

export function loadStateFromStorage(defaultState: AppState, ownerEmail?: string): AppState {
  try {
    const serialized = localStorage.getItem(STORAGE_KEY);
    if (!serialized) return defaultState;
    // Owner guard: a mirror written by a different account must not be shown
    // for this user. Drop it instead of revealing another user's data.
    const owner = (localStorage.getItem(STORAGE_OWNER_KEY) || '').trim().toLowerCase();
    if (ownerEmail && owner && owner !== ownerEmail.trim().toLowerCase()) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_OWNER_KEY);
      return defaultState;
    }
    const parsed = JSON.parse(serialized);

    // Check if the persisted data is the old default seed test data (containing specific seed IDs)
    const containsOldSeedData =
      (parsed.cashAccounts && parsed.cashAccounts.some((a: { id?: string }) => a.id === 'cash-wallet')) ||
      (parsed.cards && parsed.cards.some((c: { id?: string }) => c.id === 'card-hnb'));

    if (containsOldSeedData) {
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
    logger.error('Failed to retrieve financial state, reverting to genesis defaults:', error);
    return defaultState;
  }
}

const RESTORE_BACKUP_KEY = 'em_budget_restore_backup_v1';

export function savePreRestoreBackup(state: AppState) {
  try {
    localStorage.setItem(RESTORE_BACKUP_KEY, JSON.stringify(state));
  } catch (error) {
    logger.error('Failed to preserve pre-restore backup:', error);
  }
}

export function generateUniqueId(prefix = ''): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    const uuid = crypto.randomUUID();
    return prefix ? `${prefix}-${uuid}` : uuid;
  }
  const rand = Math.random().toString(36).substring(2, 9);
  return prefix ? `${prefix}-${Date.now()}-${rand}` : `${Date.now()}-${rand}`;
}

// Download state as backup JSON file
export function exportStateAsJSON(state: AppState, userEmail?: string) {
  // Strip sensitive security PIN from exports
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured solely to omit it from sanitizedState
  const { pinCode, ...sanitizedState } = state;
  const payload = {
    version: 'EM_BUDGET_SECURE_EX_V1',
    exportedBy: userEmail || 'Anonymous',
    exportedAt: new Date().toISOString(),
    data: sanitizedState,
  };
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', dataStr);
  const stamp = new Date().toISOString().split('T')[0];
  const emailPrefix = userEmail ? `${userEmail.split('@')[0]}_` : '';
  downloadBlob(
    JSON.stringify(payload, null, 2),
    `em_budget_${emailPrefix}backup_${stamp}.json`,
    'application/json;charset=utf-8',
  );
}

// Export Transactions to CSV / Excel spreadsheet
export function exportTransactionsToCSV(transactions: Transaction[], currency: string = 'Rs.') {
  const headers = ['Transaction ID', 'Type', 'Title', 'Amount', 'Date', 'Category', 'Paid From'];
  const rows = transactions.map((t) => [
    t.id,
    t.type.toUpperCase(),
    t.title,
    `${currency} ${t.amount}`,
    t.date,
    t.category,
    t.accountId ? `${t.accountType === 'card' ? 'Card' : 'Cash Account'}: ${t.accountId}` : 'N/A',
  ]);

  const csvContent = [escapeCsvRow(headers), ...rows.map(escapeCsvRow)].join('\n');
  const stamp = todayLocal();
  downloadBlob(csvContent, `finance_statement_${stamp}.csv`, 'text/csv;charset=utf-8;');
}

// ---- Collection CSV export helpers (formula-injection sanitized) ----

function exportCollectionAsCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const csvContent = [escapeCsvRow(headers), ...rows.map(escapeCsvRow)].join('\n');
  const stamp = todayLocal();
  downloadBlob(csvContent, `${filename}_${stamp}.csv`, 'text/csv;charset=utf-8;');
}

export function exportCashAccountsCSV(accounts: CashAccount[], currency: string = 'Rs.') {
  exportCollectionAsCSV(
    'cash_accounts',
    ['Account ID', 'Name', 'Balance'],
    accounts.map((a) => [a.id, a.name, `${currency} ${a.balance}`]),
  );
}

export function exportCardsCSV(cards: BankCard[], currency: string = 'Rs.') {
  exportCollectionAsCSV(
    'cards',
    ['Card ID', 'Card Name', 'Bank', 'Type', 'Current Balance', 'Limit', 'Status'],
    cards.map((c) => [
      c.id,
      c.cardName,
      c.bankName,
      c.cardType,
      `${currency} ${c.currentBalance}`,
      c.limit != null ? `${currency} ${c.limit}` : '',
      c.isCanceled ? 'Cancelled' : c.isFrozen ? 'Frozen' : 'Active',
    ]),
  );
}

export function exportDebtsCSV(debts: Debt[], currency: string = 'Rs.') {
  exportCollectionAsCSV(
    'debts',
    ['Debt ID', 'Source', 'Total', 'Remaining', 'Due Date', 'Status'],
    debts.map((d) => [
      d.id,
      d.debtSource,
      `${currency} ${d.totalAmount}`,
      `${currency} ${d.remainingAmount}`,
      d.dueDate,
      d.status || 'Active',
    ]),
  );
}

export function exportLoansCSV(loans: LoanGiven[], currency: string = 'Rs.') {
  exportCollectionAsCSV(
    'loans_given',
    ['Loan ID', 'Borrower', 'Total', 'Remaining', 'Date Given', 'Status'],
    loans.map((l) => [
      l.id,
      l.borrowerName,
      `${currency} ${l.totalAmount}`,
      `${currency} ${l.remainingAmount}`,
      l.dateGiven,
      l.status,
    ]),
  );
}

export function exportSubscriptionsCSV(subs: Subscription[], currency: string = 'Rs.') {
  exportCollectionAsCSV(
    'subscriptions',
    ['Plan ID', 'Name', 'Amount', 'Billing Cycle', 'Due Date', 'Status'],
    subs.map((s) => [s.id, s.name, `${currency} ${s.amount}`, s.billingCycle, s.dueDate, s.status]),
  );
}

export function exportBudgetsCSV(budgets: Budget[], currency: string = 'Rs.') {
  exportCollectionAsCSV(
    'budgets',
    ['Budget ID', 'Category', 'Limit', 'Spent', 'Remaining'],
    budgets.map((b) => [
      b.id,
      b.category,
      `${currency} ${b.limit}`,
      `${currency} ${b.spent}`,
      `${currency} ${Math.max(0, b.limit - b.spent)}`,
    ]),
  );
}

export function exportGoalsCSV(goals: SavingsGoal[], currency: string = 'Rs.') {
  exportCollectionAsCSV(
    'goals',
    ['Goal ID', 'Name', 'Target', 'Current', 'Target Date', 'Progress %'],
    goals.map((g) => [
      g.id,
      g.name,
      `${currency} ${g.target}`,
      `${currency} ${g.current}`,
      g.targetDate,
      g.target > 0 ? `${Math.round((g.current / g.target) * 100)}%` : '',
    ]),
  );
}

export function exportIncomesCSV(incomes: Income[], currency: string = 'Rs.') {
  exportCollectionAsCSV(
    'incomes',
    ['Income ID', 'Source', 'Category', 'Amount', 'Date'],
    incomes.map((i) => [i.id, i.source, i.category, `${currency} ${i.amount}`, i.date]),
  );
}

export function exportExpensesCSV(expenses: Expense[], currency: string = 'Rs.') {
  exportCollectionAsCSV(
    'expenses',
    ['Expense ID', 'Title', 'Category', 'Amount', 'Date'],
    expenses.map((e) => [e.id, e.title, e.category, `${currency} ${e.amount}`, e.date]),
  );
}

// Standard category colors configuration
export const EXPENSE_COLORS: Record<string, string> = {
  Food: '#F59E0B', // Amber
  Transport: '#3B82F6', // Blue
  Shopping: '#EC4899', // Pink
  Utilities: '#A855F7', // Purple
  Rent: '#EF4444', // Red
  Entertainment: '#14B8A6', // Teal
  Medical: '#10B981', // Green
  Education: '#6366F1', // Indigo
  'Bank Charges & Interest': '#E11D48', // Crimson/Rose
  Other: '#6B7280', // Gray
};

// Canonical category lists. These are the single source of truth for category
// <select>s across the app. They must match the zod enums in
// src/validators/index.ts so that exact-string budget/audit matching works.
export const EXPENSE_CATEGORIES = [
  'Food',
  'Transport',
  'Shopping',
  'Utilities',
  'Rent',
  'Entertainment',
  'Medical',
  'Education',
  'Insurance',
  'Loan',
  'Bank Charges & Interest',
  'Other',
] as const;

export const INCOME_CATEGORIES = [
  'Salary',
  'Freelance',
  'Business',
  'Bonus',
  'Commission',
  'Loan Settle',
  'Other',
] as const;

export interface NetWorthBreakdown {
  cash: number;
  debitCards: number;
  creditCardAssets: number;
  creditCardLiabilities: number;
  savings: number;
  debts: number;
  loansGiven: number;
  netWorth: number;
}

/** The one definition of "this row bought something".
 *
 *  Several surfaces compute spending and each wrote its own predicate, so they drifted:
 *  the Reports "Spending velocity" chart summed every row of any type, which made a
 *  salary, a sideways transfer between two of your own wallets and a balance
 *  correction all look like purchases. Expense *and* a positive amount — the deletion
 *  and subscription-deletion audit rows are expense-shaped but carry 0, so they would
 *  otherwise appear as 0-value categories in the spread chart.
 */
export function isSpendingRow(t: Transaction): boolean {
  return t.type === 'expense' && t.amount > 0;
}

/** What a monthly envelope has actually been charged this month.
 *
 *  Both budget surfaces used to sum every row the user ever recorded against a
 *  monthly limit — which is how a budget reading "277% spent" appeared while
 *  nothing had been bought this month — and both treated any negative amount as
 *  spending, so moving money sideways between two of your own wallets counted as
 *  buying something. Only a positive expense dated in this month is spending.
 *  Subscriptions bill once a cycle, so an active one counts in full. */
export function budgetSpendingForMonth(
  category: string,
  transactions: Transaction[],
  subscriptions: Subscription[],
  nowMs: number = Date.now(),
): { spent: number; items: { name: string; spent: number }[] } {
  const wanted = category.toLowerCase().trim();

  const matchingTx = transactions.filter((t) => {
    if (!isSpendingRow(t) || !t.category) return false;
    return t.category.toLowerCase().trim() === wanted && isInCurrentMonth(t.date, nowMs);
  });

  const matchingSubs = subscriptions.filter((s) => {
    if (s.status !== 'Active' || !s.category) return false;
    return s.category.toLowerCase().trim() === wanted;
  });

  return {
    spent: sumMoney([...matchingTx.map((t) => t.amount), ...matchingSubs.map((s) => s.amount)]),
    items: [
      ...matchingTx.map((t) => ({ name: t.title || 'Transaction spend', spent: t.amount })),
      ...matchingSubs.map((s) => ({ name: `${s.name} (Subscription)`, spent: s.amount })),
    ],
  };
}

/** The signed effect a ledger row has on the balance of the account it names:
 *  positive credits it, negative debits it. Every handler that creates a row and
 *  every reversal must agree on this or an edit leaves the balance and the ledger
 *  disagreeing. A transfer is the one case where the stored amount's sign carries
 *  meaning, so its direction is read from the category it was created with — an
 *  edit form always submits a positive amount and would otherwise turn the "out"
 *  leg into an "in" leg. */
export function ledgerBalanceEffect(type: Transaction['type'], category: string | undefined, amount: number): number {
  const magnitude = Math.abs(Number(amount) || 0);
  switch (type) {
    case 'income':
    case 'deposit':
    case 'financing':
      return magnitude;
    case 'expense':
    case 'debt_payment':
    case 'withdrawal':
    case 'credit_card_charge':
      return -magnitude;
    case 'transfer':
      return category === 'Transfer In' ? magnitude : -magnitude;
    default:
      return 0;
  }
}

/** How moving money between a wallet and a savings jar changes both sides.
 *
 *  The jar and the wallet must move equal and opposite, or the household silently
 *  gains or loses the difference — funding used to credit both, which invented the
 *  full amount. A jar also cannot hand back more than it holds, so a withdrawal is
 *  clamped to the jar before the wallet is credited rather than after.
 *
 *  Returns null when nothing would move.
 */
export function applyGoalAllocation(
  goalCurrent: number,
  walletBalance: number,
  amount: number,
): { committed: number; goal: number; wallet: number } | null {
  const jarCents = toMinorUnits(goalCurrent);
  const requestedCents = toMinorUnits(amount);
  const committed = Math.max(-jarCents, requestedCents) / 100;
  if (committed === 0) return null;
  return {
    committed,
    goal: (jarCents + toMinorUnits(committed)) / 100,
    wallet: subtractMoney(walletBalance, committed),
  };
}

/** What a repayment actually settles.
 *
 *  You cannot hand over more than is owed. Both repayment paths used to clamp only
 *  the balance: a debt payment deducted the whole typed figure from the wallet while
 *  the debt stopped at zero (the surplus vanished), and a loan settlement banked the
 *  whole typed figure while the loan stopped at zero (the surplus was invented).
 *  Clamping here, once, keeps the two sides the same distance apart — and means
 *  deleting the row later restores exactly what was settled.
 */
export function applyRepayment(outstanding: number, requested: number): { applied: number; remaining: number } {
  const owed = Math.max(0, Number(outstanding) || 0);
  const asked = Math.max(0, Number(requested) || 0);
  const applied = Math.min(asked, owed);
  return { applied, remaining: subtractMoney(owed, applied) };
}

export function calculateNetWorth(state: Partial<AppState>): NetWorthBreakdown {
  const cashAccounts = state.cashAccounts || [];
  const cards = state.cards || [];
  const debts = state.debts || [];
  const loansGiven = state.loansGiven || [];
  const savingsGoals = state.savingsGoals || [];

  const cash = sumMoney(cashAccounts.map((c) => c.balance));

  const debitCards = sumMoney(
    cards
      .filter((c) => !c.isCanceled && c.cardType === 'Debit')
      .map((c) => c.currentBalance - (Number(c.lockedAmount) || 0)),
  );

  const creditCards = cards.filter((c) => !c.isCanceled && c.cardType === 'Credit');

  const creditCardLiabilities = sumMoney(
    creditCards.filter((c) => c.currentBalance < 0).map((c) => Math.abs(c.currentBalance)),
  );

  const creditCardAssets = sumMoney(creditCards.filter((c) => c.currentBalance > 0).map((c) => c.currentBalance));

  const debtsAmount = sumMoney(debts.map((d) => d.remainingAmount));
  const loansGivenAmount = sumMoney(
    loansGiven.map((l) => (l.remainingAmount !== undefined ? l.remainingAmount : l.totalAmount)),
  );

  // A savings jar is money the owner still has — funding one moves it out of the
  // wallet, so leaving it out of the sum would report a household that got poorer
  // by every allocation it made.
  const savings = sumMoney(savingsGoals.map((g) => g.current || 0));

  const netWorth = sumMoney([
    cash,
    debitCards,
    creditCardAssets,
    savings,
    loansGivenAmount,
    -creditCardLiabilities,
    -debtsAmount,
  ]);

  return {
    cash,
    debitCards,
    creditCardAssets,
    creditCardLiabilities,
    savings,
    debts: debtsAmount,
    loansGiven: loansGivenAmount,
    netWorth,
  };
}
