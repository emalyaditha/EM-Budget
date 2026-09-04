import React, { useState, useEffect, lazy } from 'react';
import { apiUrl, safeJson, fetchWithTimeout } from "./lib/api";
import { motion, AnimatePresence } from 'motion/react';
import { AppState, CashAccount, BankCard, Income, Expense, Debt, Transaction, AppNotification, CategoryIncome, CategoryExpense, CreditCard as DbCreditCard, CreditCardPurchase, Subscription, LoanGiven, LoanSettlement } from './types';
import { DEFAULT_APP_STATE } from './initialData';
import { exportStateAsJSON, generateUniqueId, todayLocal } from './utils';
import { addMoney, subtractMoney, compareMoney } from './lib/money';
import { authSession } from './services/authSession';
import { 
  Plus, Search, Bell, CreditCard, Wallet, LayoutDashboard, 
  TrendingUp, User, Lock, Unlock, Settings, RefreshCw, 
  ArrowUpRight, CircleDot, CheckSquare, Zap, 
  Cloud, CloudOff, Sun, Moon, LogOut, MoreHorizontal
} from 'lucide-react';

import EmailLogin from './components/EmailLogin';
import LockScreen from './components/LockScreen';
import NotificationDrawer from './components/NotificationDrawer';
import ProfileSection from './components/ProfileSection';
import SettingsModal from './components/SettingsModal';
import TransactionEditModal from './components/TransactionEditModal';
import { CommandPalette } from './components/CommandPalette';
import { BottomNavigation } from './components/BottomNavigation';

// Heavy tab sections are code-split (loaded on demand) to speed up initial load.
const BudgetsSection = lazy(() => import('./components/BudgetsSection'));
const GoalsSection = lazy(() => import('./components/GoalsSection'));
const CashCardManagement = lazy(() => import('./components/CashCardManagement'));
const InflowsOutflows = lazy(() => import('./components/InflowsOutflows'));
const SubscriptionManagement = lazy(() => import('./components/SubscriptionManagement'));
const DebtTracker = lazy(() => import('./components/DebtTracker'));
const LoansTracker = lazy(() => import('./components/LoansTracker'));
const TransferFunds = lazy(() => import('./components/TransferFunds'));
const CreditCardManagement = lazy(() => import('./components/CreditCardManagement'));
const ReportsCentre = lazy(() => import('./components/ReportsCentre'));
const Dashboard = lazy(() => import('./components/Dashboard'));
import LazyTab from './components/LazyTab';
import { getSupabaseConfig, syncStateToSupabase, syncStateFromSupabase, forceCancelCardInSupabase, resetLoadedFromCloud, ensureSupabaseConfigFromBackend, refreshSubscriptionsFromBackend } from './supabase';
import { useNotifications } from './context/NotificationContext';
import { useTheme } from './context/ThemeContext';
import { getAppLockStatus, checkTrustedDevice, issueTrustedDevice, revokeAllDevices, AppLockStatus } from './lib/appLock';
import { EXPENSE_COLORS, calculateNetWorth } from './utils';
import { toMinorUnits } from './lib/money';
import { validateData, CashAccountSchema, BankCardSchema, TransactionSchema, DebtSchema, SubscriptionSchema } from './validators';
import { useOnlineStatus } from './hooks/useOnlineStatus';

// Merge locally-held subscriptions with ones freshly fetched from the backend
// (by id), preferring the fetched values then filling in any local-only rows.
// Returns a fresh array (immutability).
function mergeSubscriptionsList(local: Subscription[], fetched: Subscription[]): Subscription[] {
  const byId = new Map<string, Subscription>();
  for (const s of fetched || []) {
    if (s && s.id && !byId.has(s.id)) byId.set(s.id, s);
  }
  for (const s of local || []) {
    if (s && s.id && !byId.has(s.id)) byId.set(s.id, s);
  }
  return Array.from(byId.values());
}

export default function App() {
  const { showConfirm, showToast } = useNotifications();
  const { theme, toggleTheme } = useTheme();
  // 1. Core State
  const [state, setState] = useState<AppState>(DEFAULT_APP_STATE);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isAppLocked, setIsAppLocked] = useState(false);
  const [isAppLockInit, setIsAppLockInit] = useState(false);
  const [appLockStatus, setAppLockStatus] = useState<AppLockStatus | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'accounts' | 'inflow_outflow' | 'budgets' | 'goals' | 'debts' | 'loans' | 'reports'>('dashboard');
  const [isNavCollapsed, setIsNavCollapsed] = useState(false);
  
  // Modals & Panels Toggles
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [newPinCode, setNewPinCode] = useState('');
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

  // Supabase real-time status tracker
  const [realtimeSyncStatus, setRealtimeSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error' | 'disabled'>('idle');
  const [realtimeSyncError, setRealtimeSyncError] = useState<string | null>(null);

  // Offline detection
  const { url: supabaseUrl } = getSupabaseConfig();
  const { isOnline, isSupabaseReachable } = useOnlineStatus(supabaseUrl || undefined);

  // States for Unified search & filters on history
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterAccount, setFilterAccount] = useState<string>('all');

  const reconcileSubscriptionsWithTransactions = (subscriptions: Subscription[], transactions: Transaction[]): Subscription[] => {
    if (!subscriptions || !transactions) return subscriptions || [];
    return subscriptions.map(sub => {
      if (sub.status === 'Cancelled') return sub;

      let currentDueDate = sub.dueDate;
      let lastPaid = sub.lastPaidDate;
      let paymentMethodId = sub.paymentMethodId;
      let paymentMethodType = sub.paymentMethodType;

      // Find all expense transactions matching this subscription
      const matchingTx = transactions.filter(t => {
        if (t.type !== 'expense') return false;
        
        const lowerTitle = (t.title || '').toLowerCase().trim();
        const lowerSubName = (sub.name || '').toLowerCase().trim();
        
        // Exact, containing, or common variations
        const isNameMatch = lowerTitle === lowerSubName ||
                            lowerTitle.includes(lowerSubName) ||
                            lowerSubName.includes(lowerTitle) ||
                            lowerTitle.replace(/subscription\s*(settle|payment)?:?\s*/g, '') === lowerSubName;
        
        return isNameMatch;
      });

      // Sort matching transactions by date ascending, so we can process payments in chronological order
      const sortedTx = [...matchingTx].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

      // Process each transaction to see if it qualifies to advance the due date
      for (const tx of sortedTx) {
        if (!tx.date) continue;
        
        const txTime = new Date(tx.date).getTime();
        const dueTime = new Date(currentDueDate).getTime();
        
        // Window is [-15 days, 25 days] around the due date
        const diffDays = (txTime - dueTime) / (1000 * 60 * 60 * 24);
        
        if (diffDays >= -15 && diffDays <= 25) {
          // Advance currentDueDate by cycle
          const dueObj = new Date(currentDueDate);
          if (sub.billingCycle === 'Monthly') {
            dueObj.setMonth(dueObj.getMonth() + 1);
          } else {
            dueObj.setFullYear(dueObj.getFullYear() + 1);
          }
          currentDueDate = dueObj.toISOString().split('T')[0];
          lastPaid = tx.date;
          paymentMethodId = tx.accountId;
          paymentMethodType = tx.accountType;
        }
      }

      return {
        ...sub,
        dueDate: currentDueDate,
        lastPaidDate: lastPaid,
        paymentMethodId,
        paymentMethodType
      };
    });
  };

  const migrateStateCards = (loadedState: AppState): AppState => {
    if (!loadedState) return loadedState;
    const nextState = { ...loadedState };

    // 1. Normalizing card balances (existing migration logic)
    if (nextState.cards) {
      nextState.cards = nextState.cards.map(card => {
        if (card.cardType === 'Credit' && card.currentBalance > 0) {
          console.log(`MIGRATION: Auto-healing credit card "${card.cardName}" with positive balance ${card.currentBalance} to negative balance ${-card.currentBalance}`);
          return {
            ...card,
            currentBalance: -card.currentBalance
          };
        }
        return card;
      });
    }

    // 2. Normalizing "Other font-sans" category typo to "Other"
    if (nextState.transactions) {
      nextState.transactions = nextState.transactions.map(t => {
        if (t.category === 'Other font-sans') {
          return { ...t, category: 'Other' };
        }
        return t;
      });
    }

    if (nextState.expenses) {
      nextState.expenses = nextState.expenses.map(e => {
        if ((e.category as string) === 'Other font-sans') {
          return { ...e, category: 'Other' };
        }
        return e;
      });
    }

    if (nextState.subscriptions) {
      nextState.subscriptions = nextState.subscriptions.map(s => {
        if ((s.category as string) === 'Other font-sans') {
          return { ...s, category: 'Other' };
        }
        return s;
      });
    }

    if (nextState.budgets) {
      nextState.budgets = nextState.budgets.map(b => {
        if ((b.category as string) === 'Other font-sans') {
          return { ...b, category: 'Other' };
        }
        return b;
      });
    }

    // 3. Auto-reconcile subscriptions with transactions on state pull/migration
    if (nextState.subscriptions && nextState.transactions) {
      nextState.subscriptions = reconcileSubscriptionsWithTransactions(
        nextState.subscriptions,
        nextState.transactions
      );
    }

    return nextState;
  };

  // App Lock: decide whether this account needs the lock-screen gate.
  // Returns true when the app-lock screen must be shown.
  const determineAppLock = async (email: string): Promise<boolean> => {
    try {
      const [status, trusted] = await Promise.all([getAppLockStatus(email), checkTrustedDevice()]);
      setAppLockStatus(status);
      const enabled = !!status?.appLockEnabled;
      // Always-ask mode overrides the trusted-device shortcut, so a remembered
      // browser still has to unlock on every app open.
      const alwaysLockOnOpen = !!status?.lockOnOpen;
      if (enabled && (alwaysLockOnOpen || !trusted.trusted)) {
        setIsAppLocked(true);
        return true;
      }
      setIsAppLocked(false);
      return false;
    } catch (err) {
      console.warn("App-lock check failed, defaulting to no lock:", err);
      setIsAppLocked(false);
      return false;
    }
  };

  // Full logout: clear stored credentials, revoke trusted-device cookie(s) for
  // this account so a future login goes back through the app-lock gate.
  const handleLogout = () => {
    const email = userEmail;
    localStorage.removeItem('auth_user_email');
    localStorage.removeItem('auth_session_token');
    localStorage.removeItem('auth_device_token');
    authSession.clear();
    resetLoadedFromCloud();
    setState(DEFAULT_APP_STATE);
    setIsUnlocked(false);
    setIsAppLocked(false);
    setIsAppLockInit(false);
    setIsProfileOpen(false);
    setIsSettingsOpen(false);
    if (email) {
      try { void revokeAllDevices(email); } catch (err) { console.warn("Could not revoke trusted devices on logout:", err); }
    }
  };

  // Verify remembered device on mount
  useEffect(() => {
    const verifyDevice = async () => {
      // Global safety net: the entire mount flow must finish within 12s.
      // If any step hangs (backend unreachable, Supabase unreachable), we
      // still show the login/PIN screen instead of leaving the user staring
      // at "Checking session" indefinitely.
      const MOUNT_TIMEOUT_MS = 12000;
      const mountDeadline = Date.now() + MOUNT_TIMEOUT_MS;

      const timeLeft = () => Math.max(0, mountDeadline - Date.now());

      // Load system-provided environments on mount to ensure fresh configuration matches backend
      try {
        const confResp = await fetchWithTimeout(apiUrl('/api/config'), { credentials: 'include' }, Math.min(4000, timeLeft()));
        if (confResp.ok) {
          const confData = await safeJson(confResp);
          if (confData?.supabaseUrl && confData?.supabaseKey) {
            localStorage.setItem('cashflow_supabase_url_v1', confData.supabaseUrl);
            localStorage.setItem('cashflow_supabase_key_v1', confData.supabaseKey);
          }
        }
      } catch (err) {
        console.warn("Failed retrieving dynamic server environments:", err);
      }

      const email = localStorage.getItem('auth_user_email');
      const token = localStorage.getItem('auth_session_token');
      
      if (email && token) {
        try {
          setIsAppLockInit(true);
          const vRes = await fetchWithTimeout(apiUrl('/api/auth/verify-session'), {
            credentials: 'include',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, token })
          }, Math.min(6000, timeLeft()));
          const vData = await safeJson(vRes);
          if (vData?.success) {
            authSession.setToken(token);
            authSession.setEmail(email);
            setUserEmail(email);

            // Ensure Supabase config is available before sync.
            await ensureSupabaseConfigFromBackend();

            // Run the three heavy async operations in parallel — they are
            // independent of each other and all depend only on the verified
            // session.  Each has its own timeout; the global deadline above
            // prevents the whole block from exceeding ~12 s.
            const syncPromise = syncStateFromSupabase(email);
            const subsPromise = refreshSubscriptionsFromBackend(email, token);
            const lockPromise = determineAppLock(email);

            const [result, backendSubs] = await Promise.all([syncPromise, subsPromise]);

            if (result.success && result.state) {
              setState(migrateStateCards(result.state));
            }
            if (backendSubs && backendSubs.length > 0) {
              setState(prev => ({ ...prev, subscriptions: mergeSubscriptionsList(prev.subscriptions, backendSubs) }));
            }

            // determineAppLock already ran in parallel — its side effects
            // (setIsAppLocked) are safe to apply now.
            await lockPromise;

            setIsUnlocked(true);
            setIsAppLockInit(false);
          } else {
            console.warn("Session token expired or invalid:", vData?.error);
            localStorage.removeItem('auth_session_token');
            authSession.clear();
            setIsUnlocked(false);
            setIsAppLocked(false);
            setIsAppLockInit(false);
          }
        } catch (err) {
          console.warn("Fatal error verifying session token:", err);
          setIsUnlocked(false);
          setIsAppLocked(false);
          setIsAppLockInit(false);
        }
      } else {
        setIsUnlocked(false);
        setIsAppLockInit(false);
      }
      setIsCheckingAuth(false);
    };

    verifyDevice();
  }, []);

  // App Lock: auto re-lock after 60 seconds of inactivity while the workspace
  // is visible and unlocked. One shared debounced listener resets a single
  // timer whenever the user is active. The effect returns early (and tears down
  // the listener/timer) while the lock screen is showing, so it never re-triggers
  // while already locked. It only runs after login/unlock, not on the login flow.
  useEffect(() => {
    if (!isUnlocked || isAppLocked) return;
    // Default to 1 minute; overridable per-account in Settings -> App Lock.
    const LOCK_MINUTES = appLockStatus?.lockIdleMinutes ?? 1;
    const LOCK_MS = Math.max(1, LOCK_MINUTES) * 60 * 1000;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleLock = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => setIsAppLocked(true), LOCK_MS);
    };
    const events: (keyof WindowEventMap)[] = ['mousemove', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach((ev) => window.addEventListener(ev, scheduleLock, { passive: true }));
    scheduleLock();
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, scheduleLock));
      if (idleTimer) clearTimeout(idleTimer);
    };
  }, [isUnlocked, isAppLocked, appLockStatus?.lockIdleMinutes]);

  // Scroll to the top of the page when the active tab/view changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    const mainEl = document.getElementById('full-workspace-view');
    if (mainEl) {
      mainEl.scrollTop = 0;
    }
  }, [activeTab]);

  // Warm the Dashboard (default landing tab) chunk during idle so the first
  // view after login paints instantly instead of showing the loading skeleton.
  useEffect(() => {
    const warm = () => {
      import('./components/Dashboard').catch(() => {});
    };
    const w = window as any;
    if (w.requestIdleCallback) {
      w.requestIdleCallback(warm, { timeout: 3000 });
      return;
    }
    const t = window.setTimeout(warm, 200);
    return () => window.clearTimeout(t);
  }, []);

  // Synchronize state with Storage whenever it edits
  const updateState = (updater: (prev: AppState) => AppState) => {
    setState(oldState => {
      const nextState = updater(oldState);
      const sanitizedTransactions = nextState.transactions;

      // Reconcile subscriptions automatically with updated transactions
      const reconciledSubscriptions = reconcileSubscriptionsWithTransactions(
        nextState.subscriptions || [],
        sanitizedTransactions
      );

      return {
        ...nextState,
        subscriptions: reconciledSubscriptions,
        transactions: sanitizedTransactions
      };
    });
  };

  // Automatic background push to Supabase if config exists and auto-sync is checked
  useEffect(() => {
    if (!isUnlocked) {
      setRealtimeSyncStatus('idle');
      return;
    }

    const { url, key, autoSync } = getSupabaseConfig();
    
    if (!url || !key) {
      setRealtimeSyncStatus('disabled');
      return;
    }
    
    if (!autoSync) {
      setRealtimeSyncStatus('disabled');
      return;
    }

    if (!isOnline || !isSupabaseReachable) {
      setRealtimeSyncStatus('error');
      setRealtimeSyncError(isOnline ? 'Cloud service unreachable.' : 'No internet connection.');
      return;
    }

    setRealtimeSyncStatus('syncing');
    setRealtimeSyncError(null);

    const syncTimeout = setTimeout(() => {
      if (!userEmail) return;
      syncStateToSupabase(userEmail, state)
        .then(res => {
          if (!res.success) {
            console.warn('Real-time Supabase Auto-sync warned:', res.error);
            setRealtimeSyncStatus('error');
            setRealtimeSyncError(res.error || 'Failed to sync check RLS/Table');
          } else {
            console.log('Real-time Supabase Auto-sync success!');
            setRealtimeSyncStatus('synced');
            setRealtimeSyncError(null);
          }
        })
        .catch(err => {
          console.error('Real-time Supabase Auto-sync failed:', err);
          setRealtimeSyncStatus('error');
          setRealtimeSyncError(err.message || 'Database error.');
        });
    }, 1500);

    return () => clearTimeout(syncTimeout);
  }, [state, isSettingsOpen, isUnlocked, userEmail, isOnline, isSupabaseReachable]);

  // Budgets & Savings goals action logic
  const handleUpdateBudgetLimit = (id: string, limit: number) => {
    updateState(prev => {
      const updatedBudgets = (prev.budgets || []).map(b => b.id === id ? { ...b, limit } : b);
      showToast('Budget allocation limit adjusted successfully', 'success');
      return { ...prev, budgets: updatedBudgets };
    });
  };

  const handleAddBudget = (category: CategoryExpense, limit: number, icon: string) => {
    updateState(prev => {
      const existing = (prev.budgets || []).find(b => b.category === category);
      if (existing) {
        showToast(`Budget allocation for ${category} already exists. Adjusting limit.`, 'warning');
        return prev;
      }
      const newBudget = {
        id: 'b' + Date.now(),
        category,
        limit,
        spent: 0,
        icon,
        subBreakdown: []
      };
      showToast(`Monitoring created for category: ${category}`, 'success');
      return { ...prev, budgets: [...(prev.budgets || []), newBudget] };
    });
  };

  const handleRemoveBudget = (id: string) => {
    updateState(prev => {
      const updatedBudgets = (prev.budgets || []).filter(b => b.id !== id);
      showToast('Budget category deleted successfully', 'success');
      return { ...prev, budgets: updatedBudgets };
    });
  };

  const handleAddGoal = (name: string, target: number, targetDate: string) => {
    updateState(prev => {
      const newGoal = {
        id: 'g' + Date.now(),
        name,
        target,
        current: 0,
        targetDate
      };
      showToast(`Savings Jar: ${name} established!`, 'success');
      return { ...prev, savingsGoals: [...(prev.savingsGoals || []), newGoal] };
    });
  };

  const handleModifyGoalFunds = (id: string, amount: number, cashAccountId: string | null) => {
    updateState(prev => {
      const targetGoal = (prev.savingsGoals || []).find(g => g.id === id);
      if (!targetGoal) return prev;

      let finalCashAccounts = prev.cashAccounts;
      if (cashAccountId) {
        const account = prev.cashAccounts.find(a => a.id === cashAccountId);
        if (account) {
          const factor = amount > 0 ? -1 : 1; // saving (amount > 0) decrements wallet, withdrawing (amount < 0) increments wallet
          const absAmount = Math.abs(amount);
          if (factor < 0 && compareMoney(account.balance, absAmount) < 0) {
            showToast('Insufficient wallet reserves for allocation transfer', 'error');
            return prev;
          }
          const newBal = (toMinorUnits(account.balance) + (toMinorUnits(absAmount) * factor)) / 100;
          finalCashAccounts = prev.cashAccounts.map(a => a.id === cashAccountId ? { ...a, balance: newBal } : a);
        }
      }

      const updatedGoals = (prev.savingsGoals || []).map(g => {
        if (g.id === id) {
          const newCurrent = Math.max(0, (toMinorUnits(g.current) + toMinorUnits(amount)) / 100);
          return { ...g, current: newCurrent };
        }
        return g;
      });

      showToast(amount > 0 ? 'Reserves transferred into savings jar' : 'Reserves returned back to liquid wallet', 'success');
      return { 
        ...prev, 
        cashAccounts: finalCashAccounts,
        savingsGoals: updatedGoals 
      };
    });
  };

  const handleRemoveGoal = (id: string) => {
    updateState(prev => {
      const updatedGoals = (prev.savingsGoals || []).filter(g => g.id !== id);
      showToast('Savings jar goal deleted successfully', 'success');
      return { ...prev, savingsGoals: updatedGoals };
    });
  };

  const handleClearAllBudgets = () => {
    updateState(prev => {
      return { ...prev, budgets: [] };
    });
    showToast('All spending envelopes deleted successfully', 'success');
  };

  const handleClearAllGoals = () => {
    updateState(prev => {
      return { ...prev, savingsGoals: [] };
    });
    showToast('All savings jars deleted successfully', 'success');
  };

  // 2. FINANCIAL IMPLEMENTATION LOGICS (SMART AUTOMATION RULES)

  // Rule: Add Income Inflow
  const handleAddIncome = (
    amount: number,
    date: string,
    source: string,
    category: CategoryIncome,
    targetAccountId: string,
    targetType: 'cash' | 'card'
  ) => {
    const incomeId = generateUniqueId('inc');
    const transactionId = generateUniqueId('trans');

    const nowIso = new Date().toISOString();

    const newIncome: Income = {
      id: incomeId,
      amount,
      date,
      source,
      category,
      targetAccountId,
      targetType,
      updated_at: nowIso,
      updatedAt: nowIso,
    };

    const newTransaction: Transaction = {
      id: transactionId,
      type: 'income',
      title: source,
      amount,
      date,
      category,
      accountId: targetAccountId,
      accountType: targetType,
      referenceId: incomeId,
      updated_at: nowIso,
      updatedAt: nowIso,
    };

    const validation = validateData(TransactionSchema, newTransaction);
    if (!validation.success) {
      showToast(validation.error, 'error');
      return;
    }

    updateState(prev => {
      // 1. Increment target account balances
      let updatedCash = [...prev.cashAccounts];
      let updatedCards = [...prev.cards];

      if (targetType === 'cash') {
        updatedCash = updatedCash.map(c => 
          c.id === targetAccountId ? { ...c, balance: (toMinorUnits(c.balance) + toMinorUnits(amount)) / 100 } : c
        );
      } else {
        updatedCards = updatedCards.map(c => 
          c.id === targetAccountId ? { ...c, currentBalance: (toMinorUnits(c.currentBalance) + toMinorUnits(amount)) / 100 } : c
        );
      }

      // 2. Draft Transaction Record
      const nameOfTarget = targetType === 'cash' 
        ? prev.cashAccounts.find(x => x.id === targetAccountId)?.name || 'Cash'
        : prev.cards.find(x => x.id === targetAccountId)?.cardName || 'Bank Card';

      const newTransaction: Transaction = {
        id: transactionId,
        type: 'income',
        title: source,
        amount,
        date,
        category,
        accountId: targetAccountId,
        accountType: targetType,
        referenceId: incomeId,
        updated_at: nowIso,
        updatedAt: nowIso,
      };

      // 3. Optional balance threshold triggers
      const newNotif: AppNotification = {
        id: `nt-${Date.now()}`,
        type: 'system',
        message: `Ledger balanced: Income of ${prev.currency} ${amount.toLocaleString()} credited to ${nameOfTarget}.`,
        date: todayLocal(),
        read: false,
      };

      return {
        ...prev,
        incomes: [...prev.incomes, newIncome],
        cashAccounts: updatedCash,
        cards: updatedCards,
        transactions: [newTransaction, ...prev.transactions],
        notifications: [newNotif, ...prev.notifications],
      };
    });
  };

  // Rule: Add Expense / Invoice
  const handleAddExpense = (
    title: string,
    description: string,
    amount: number,
    date: string,
    category: CategoryExpense,
    paymentMethodId: string,
    paymentMethodType: 'cash' | 'card',
    bankCharge: number = 0
  ) => {
    const expenseId = generateUniqueId('exp');
    const transactionId = generateUniqueId('trans');

    const nowIso = new Date().toISOString();

    const newExpense: Expense = {
      id: expenseId,
      title,
      description,
      amount,
      date,
      category,
      paymentMethodId,
      paymentMethodType,
      updated_at: nowIso,
      updatedAt: nowIso,
    };

    const newTransaction: Transaction = {
      id: transactionId,
      type: 'expense',
      title,
      amount,
      date,
      category,
      accountId: paymentMethodId,
      accountType: paymentMethodType,
      referenceId: expenseId,
      charge: bankCharge > 0 ? bankCharge : undefined,
      updated_at: nowIso,
      updatedAt: nowIso,
    };

    const validation = validateData(TransactionSchema, newTransaction);
    if (!validation.success) {
      showToast(validation.error, 'error');
      return;
    }

    updateState(prev => {
      // 1. Deduct target account balances
      let updatedCash = [...prev.cashAccounts];
      let updatedCards = [...prev.cards];
      const newAlertNotifications: AppNotification[] = [];

      const totalDeductionCents = toMinorUnits(amount) + toMinorUnits(bankCharge);
      const totalDeduction = totalDeductionCents / 100;

      if (paymentMethodType === 'cash') {
        updatedCash = updatedCash.map(c => {
          if (c.id === paymentMethodId) {
            const nextVal = (toMinorUnits(c.balance) - totalDeductionCents) / 100;
            if (nextVal < 5000) {
              newAlertNotifications.push({
                id: `nt-alert-${Date.now()}`,
                type: 'alert',
                message: `Low balance alert! ${c.name} is critically low: ${prev.currency} ${nextVal.toLocaleString()}`,
                date: todayLocal(),
                read: false,
              });
            }
            return { ...c, balance: nextVal };
          }
          return c;
        });
      } else {
        updatedCards = updatedCards.map(c => {
          if (c.id === paymentMethodId) {
            const isCredit = c.cardType === 'Credit';
            const nextVal = (toMinorUnits(c.currentBalance) - totalDeductionCents) / 100;
            
            const isLow = isCredit 
              ? (c.limit !== undefined && (c.limit + nextVal) < 1000)
              : (nextVal < 10000);
            
            if (isLow) {
              const alertMsg = isCredit
                ? `Credit card alert! Card ${c.cardName} available credit is low: ${prev.currency} ${((c.limit ?? 0) + nextVal).toLocaleString()}`
                : `Low balance alert! Card ${c.cardName} balance is low: ${prev.currency} ${nextVal.toLocaleString()}`;
              newAlertNotifications.push({
                id: `nt-alert-${Date.now()}`,
                type: 'alert',
                message: alertMsg,
                date: todayLocal(),
                read: false,
              });
            }
            return { ...c, currentBalance: nextVal };
          }
          return c;
        });
      }

      // 2. Draft Transaction Record
      const newTransaction: Transaction = {
        id: transactionId,
        type: 'expense',
        title,
        amount,
        date,
        category,
        accountId: paymentMethodId,
        accountType: paymentMethodType,
        referenceId: expenseId,
        charge: bankCharge > 0 ? bankCharge : undefined,
        updated_at: nowIso,
        updatedAt: nowIso,
      };

      const newExpenses = [...prev.expenses, newExpense];
      const newTransactions = [newTransaction];

      if (bankCharge > 0) {
        const chargeExpenseId = generateUniqueId('exp-charge');
        const chargeTransactionId = generateUniqueId('trans-charge');

        const chargeExpense: Expense = {
          id: chargeExpenseId,
          title: `Bank Charge: ${title}`,
          description: `Automatic bank charge fee for: ${title}`,
          amount: bankCharge,
          date,
          category: 'Bank Charges & Interest',
          paymentMethodId,
          paymentMethodType,
          updated_at: nowIso,
          updatedAt: nowIso,
        };

        const chargeTransaction: Transaction = {
          id: chargeTransactionId,
          type: 'expense',
          title: `Bank Charge: ${title}`,
          amount: bankCharge,
          date,
          category: 'Bank Charges & Interest',
          accountId: paymentMethodId,
          accountType: paymentMethodType,
          referenceId: chargeExpenseId,
          updated_at: nowIso,
          updatedAt: nowIso,
        };

        newExpenses.push(chargeExpense);
        newTransactions.push(chargeTransaction);
      }

      return {
        ...prev,
        expenses: newExpenses,
        cashAccounts: updatedCash,
        cards: updatedCards,
        transactions: [...newTransactions, ...prev.transactions],
        notifications: [...newAlertNotifications, ...prev.notifications],
      };
    });
  };

  // Rule: Debt Registered
  const handleAddDebt = (debtData: Omit<Debt, 'id' | 'payments' | 'remainingAmount'>) => {
    const debtId = `debt-${Date.now()}`;
    const nowIso = new Date().toISOString();
    const newDebt: Debt = {
      ...debtData,
      id: debtId,
      remainingAmount: debtData.totalAmount,
      payments: [],
      status: debtData.totalAmount === 0 ? 'Fully Repaid' : 'Active',
      updated_at: nowIso,
      updatedAt: nowIso,
    };

    const validation = validateData(DebtSchema, newDebt);
    if (!validation.success) {
      showToast((validation as any).error, 'error');
      return;
    }

    updateState(prev => {
      let updatedCash = [...prev.cashAccounts];
      let updatedCards = [...prev.cards];
      const newTransactions = [...prev.transactions];

      if (debtData.accountId && debtData.accountType) {
        if (debtData.accountType === 'cash') {
          updatedCash = updatedCash.map(c =>
            c.id === debtData.accountId ? { ...c, balance: c.balance + debtData.totalAmount } : c
          );
        } else {
          updatedCards = updatedCards.map(c =>
            c.id === debtData.accountId ? { ...c, currentBalance: c.currentBalance + debtData.totalAmount } : c
          );
        }

        // Add transaction for incoming liability funds
        const txId = `tx_debt_in_${Date.now()}`;
        const newTx: Transaction = {
          id: txId,
          type: 'financing',
          title: `Borrowed: ${debtData.debtSource}`,
          amount: debtData.totalAmount,
          date: todayLocal(),
          category: 'Other',
          accountId: debtData.accountId,
          accountType: debtData.accountType,
          referenceId: debtId,
          updated_at: nowIso,
          updatedAt: nowIso,
        };
        newTransactions.unshift(newTx);
      }

      const newNotif: AppNotification = {
        id: `nt-${Date.now()}`,
        type: 'reminder',
        message: `Debt due alert set! Repay principal ${prev.currency} ${debtData.totalAmount.toLocaleString()} to ${debtData.debtSource} before ${debtData.dueDate}.`,
        date: todayLocal(),
        read: false,
      };

      return {
        ...prev,
        debts: [...prev.debts, newDebt],
        cashAccounts: updatedCash,
        cards: updatedCards,
        transactions: newTransactions,
        notifications: [newNotif, ...prev.notifications],
      };
    });
  };

  const handleDeleteDebt = (debtId: string) => {
    updateState(prev => {
      const debtToDelete = prev.debts.find(d => d.id === debtId);
      if (!debtToDelete) return prev;

      let updatedCash = [...prev.cashAccounts];
      let updatedCards = [...prev.cards];

      // 1. Reverse initial balance addition
      if (debtToDelete.accountId && debtToDelete.accountType) {
        if (debtToDelete.accountType === 'cash') {
          updatedCash = updatedCash.map(c =>
            c.id === debtToDelete.accountId ? { ...c, balance: c.balance - debtToDelete.totalAmount } : c
          );
        } else {
          updatedCards = updatedCards.map(c =>
            c.id === debtToDelete.accountId ? { ...c, currentBalance: c.currentBalance - debtToDelete.totalAmount } : c
          );
        }
      }

      // 2. Reverse any payments made on this debt
      if (debtToDelete.payments && debtToDelete.payments.length > 0) {
        debtToDelete.payments.forEach(p => {
          if (p.paidFromType === 'cash') {
            updatedCash = updatedCash.map(c =>
              c.id === p.paidFromId ? { ...c, balance: c.balance + p.amount } : c
            );
          } else {
            updatedCards = updatedCards.map(c =>
              c.id === p.paidFromId ? { ...c, currentBalance: c.currentBalance + p.amount } : c
            );
          }
        });
      }

      // 3. Remove transactions referencing this debt or any of its payments
      const paymentIds = (debtToDelete.payments || []).map(p => p.id);
      const updatedTransactions = prev.transactions.filter(tx => 
        tx.referenceId !== debtId && !paymentIds.includes(tx.referenceId || '')
      );

      const newNotif: AppNotification = {
        id: `nt_del_debt_${Date.now()}`,
        type: 'system',
        message: `Liability to ${debtToDelete.debtSource} was deleted. Balance adjustments successfully reversed.`,
        date: todayLocal(),
        read: false,
      };

      return {
        ...prev,
        debts: prev.debts.filter(d => d.id !== debtId),
        cashAccounts: updatedCash,
        cards: updatedCards,
        transactions: updatedTransactions,
        notifications: [newNotif, ...prev.notifications],
      };
    });
  };

  // Loans Receivables Actions
  const handleAddLoan = (
    loanData: Omit<LoanGiven, 'id' | 'remainingAmount' | 'status' | 'settlements'>,
    bankCharge: number = 0
  ) => {
    const loanId = `loan_given_${Date.now()}`;
    const nowIso = new Date().toISOString();
    const newLoan: LoanGiven = {
      ...loanData,
      id: loanId,
      remainingAmount: loanData.totalAmount,
      status: 'Active',
      settlements: [],
      updated_at: nowIso,
      updatedAt: nowIso,
    };

    updateState(prev => {
      // 1. Deduct funds from selected account
      let updatedCash = [...prev.cashAccounts];
      let updatedCards = [...prev.cards];

      const totalDeduction = loanData.totalAmount + bankCharge;

      if (loanData.sourceAccountType === 'cash') {
        updatedCash = updatedCash.map(c =>
          c.id === loanData.sourceAccountId ? { ...c, balance: c.balance - totalDeduction } : c
        );
      } else {
        updatedCards = updatedCards.map(c =>
          c.id === loanData.sourceAccountId ? { ...c, currentBalance: c.currentBalance - totalDeduction } : c
        );
      }

      // 2. Create Transaction log
      const txId = `tx_loan_${Date.now()}`;
      const newTx: Transaction = {
        id: txId,
        type: 'expense',
        title: `Asset Loan: ${loanData.borrowerName}`,
        amount: loanData.totalAmount,
        date: loanData.dateGiven,
        category: 'Loan',
        accountId: loanData.sourceAccountId,
        accountType: loanData.sourceAccountType,
        referenceId: loanId,
        charge: bankCharge > 0 ? bankCharge : undefined,
        updated_at: nowIso,
        updatedAt: nowIso,
      };

      // 3. Create Expense entry
      const newExp: Expense = {
        id: `exp_loan_${Date.now()}`,
        title: `Loan Given: ${loanData.borrowerName}`,
        description: `Lent capital. Notes: ${loanData.notes}`,
        amount: loanData.totalAmount,
        date: loanData.dateGiven,
        category: 'Loan',
        paymentMethodId: loanData.sourceAccountId,
        paymentMethodType: loanData.sourceAccountType,
        updated_at: nowIso,
        updatedAt: nowIso,
      };

      const newExpenses = [newExp, ...prev.expenses];
      const newTransactions = [newTx];

      if (bankCharge > 0) {
        const chargeExpenseId = `exp-charge-${Date.now()}`;
        const chargeTransactionId = `trans-charge-${Date.now()}`;

        const chargeExpense: Expense = {
          id: chargeExpenseId,
          title: `Bank Charge: Loan to ${loanData.borrowerName}`,
          description: `Automatic bank charge fee for giving a loan`,
          amount: bankCharge,
          date: loanData.dateGiven,
          category: 'Bank Charges & Interest',
          paymentMethodId: loanData.sourceAccountId,
          paymentMethodType: loanData.sourceAccountType,
          updated_at: nowIso,
          updatedAt: nowIso,
        };

        const chargeTransaction: Transaction = {
          id: chargeTransactionId,
          type: 'expense',
          title: `Bank Charge: Loan to ${loanData.borrowerName}`,
          amount: bankCharge,
          date: loanData.dateGiven,
          category: 'Bank Charges & Interest',
          accountId: loanData.sourceAccountId,
          accountType: loanData.sourceAccountType,
          referenceId: chargeExpenseId,
          updated_at: nowIso,
          updatedAt: nowIso,
        };

        newExpenses.unshift(chargeExpense);
        newTransactions.push(chargeTransaction);
      }

      // 4. Notification
      const newNotif: AppNotification = {
        id: `nt_loan_${Date.now()}`,
        type: 'system',
        message: `Registered loan given to ${loanData.borrowerName}: model tracks ${prev.currency} ${loanData.totalAmount.toLocaleString()} receivable.`,
        date: todayLocal(),
        read: false,
      };

      return {
        ...prev,
        cashAccounts: updatedCash,
        cards: updatedCards,
        loansGiven: [...(prev.loansGiven || []), newLoan],
        transactions: [...newTransactions, ...prev.transactions],
        expenses: newExpenses,
        notifications: [newNotif, ...prev.notifications],
      };
    });
  };

  const handleMakeLoanSettlement = (
    loanId: string,
    amount: number,
    receivedInId: string,
    receivedInType: 'cash' | 'card',
    receivedInName: string,
    bankCharge: number = 0
  ) => {
    const settlementId = `setl_${Date.now()}`;
    const settlementDate = todayLocal();
    const nowIso = new Date().toISOString();

    updateState(prev => {
      // Find the loan item to capture borrower info
      const targetLoan = (prev.loansGiven || []).find(l => l.id === loanId);
      if (!targetLoan) return prev;

      // 1. Credit the received account
      let updatedCash = [...prev.cashAccounts];
      let updatedCards = [...prev.cards];

      const netCredited = amount - bankCharge;

      if (receivedInType === 'cash') {
        updatedCash = updatedCash.map(c =>
          c.id === receivedInId ? { ...c, balance: c.balance + netCredited } : c
        );
      } else {
        updatedCards = updatedCards.map(c =>
          c.id === receivedInId ? { ...c, currentBalance: c.currentBalance + netCredited } : c
        );
      }

      // 2. Add settlement item
      const newSettlement: LoanSettlement = {
        id: settlementId,
        loanId,
        amount,
        date: settlementDate,
        receivedInId,
        receivedInType,
        receivedInName,
        updated_at: nowIso,
        updatedAt: nowIso,
      };

      const updatedLoans: LoanGiven[] = (prev.loansGiven || []).map(loan => {
        if (loan.id === loanId) {
          const newRemaining = Math.max(0, loan.remainingAmount - amount);
          const newStatus = newRemaining <= 0 ? 'Settled' : 'Partially Settled';
          return {
            ...loan,
            remainingAmount: newRemaining,
            status: newStatus,
            settlements: [...(loan.settlements || []), newSettlement],
            updated_at: nowIso,
            updatedAt: nowIso,
          };
        }
        return loan;
      });

      // 3. Create Transaction log
      const txId = `tx_setl_${Date.now()}`;
      const newTx: Transaction = {
        id: txId,
        type: 'income',
        title: `Loan Settle Recv: ${targetLoan.borrowerName}`,
        amount: amount,
        date: settlementDate,
        category: 'Loan Settle',
        accountId: receivedInId,
        accountType: receivedInType,
        referenceId: settlementId,
        charge: bankCharge > 0 ? bankCharge : undefined,
        updated_at: nowIso,
        updatedAt: nowIso,
      };

      // 4. Create Income entry
      const newInc: Income = {
        id: `inc_setl_${Date.now()}`,
        amount,
        date: settlementDate,
        source: `Loan settlement received from ${targetLoan.borrowerName}`,
        category: 'Loan Settle',
        targetAccountId: receivedInId,
        targetType: receivedInType,
        updated_at: nowIso,
        updatedAt: nowIso,
      };

      const newExpenses = [...prev.expenses];
      const newTransactions = [newTx];

      if (bankCharge > 0) {
        const chargeExpenseId = `exp-charge-${Date.now()}`;
        const chargeTransactionId = `trans-charge-${Date.now()}`;

        const chargeExpense: Expense = {
          id: chargeExpenseId,
          title: `Bank Charge: Loan Settle ${targetLoan.borrowerName}`,
          description: `Automatic transaction fee on loan settlement deposit`,
          amount: bankCharge,
          date: settlementDate,
          category: 'Bank Charges & Interest',
          paymentMethodId: receivedInId,
          paymentMethodType: receivedInType,
          updated_at: nowIso,
          updatedAt: nowIso,
        };

        const chargeTransaction: Transaction = {
          id: chargeTransactionId,
          type: 'expense',
          title: `Bank Charge: Loan Settle ${targetLoan.borrowerName}`,
          amount: bankCharge,
          date: settlementDate,
          category: 'Bank Charges & Interest',
          accountId: receivedInId,
          accountType: receivedInType,
          referenceId: chargeExpenseId,
          updated_at: nowIso,
          updatedAt: nowIso,
        };

        newExpenses.unshift(chargeExpense);
        newTransactions.push(chargeTransaction);
      }

      // 5. Notification
      const newNotif: AppNotification = {
        id: `nt_setl_${Date.now()}`,
        type: 'system',
        message: `Processed loan settlement installment of ${prev.currency} ${amount.toLocaleString()} from ${targetLoan.borrowerName}, credited to ${receivedInName}.`,
        date: settlementDate,
        read: false,
      };

      return {
        ...prev,
        cashAccounts: updatedCash,
        cards: updatedCards,
        loansGiven: updatedLoans,
        expenses: newExpenses,
        transactions: [...newTransactions, ...prev.transactions],
        incomes: [newInc, ...prev.incomes],
        notifications: [newNotif, ...prev.notifications],
      };
    });
  };

  const handleDeleteLoan = (loanId: string) => {
    updateState(prev => {
      const loanToDelete = (prev.loansGiven || []).find(l => l.id === loanId);
      if (!loanToDelete) return prev;

      // 1. Refund the deducted funds (totalAmount + bankCharge from the original transaction)
      let updatedCash = [...prev.cashAccounts];
      let updatedCards = [...prev.cards];

      // Find the original loan transaction to recover the bankCharge
      const loanTx = prev.transactions.find(t => t.referenceId === loanId && t.category === 'Loan');
      const bankCharge = loanTx?.charge || 0;

      const totalRefund = loanToDelete.totalAmount + bankCharge;

      if (loanToDelete.sourceAccountType === 'cash') {
        updatedCash = updatedCash.map(c =>
          c.id === loanToDelete.sourceAccountId ? { ...c, balance: c.balance + totalRefund } : c
        );
      } else {
        updatedCards = updatedCards.map(c =>
          c.id === loanToDelete.sourceAccountId ? { ...c, currentBalance: c.currentBalance + totalRefund } : c
        );
      }

      // 2. Reverse all settlements - deduct from accounts that received settlement funds
      if (loanToDelete.settlements && loanToDelete.settlements.length > 0) {
        for (const settlement of loanToDelete.settlements) {
          const netCredited = settlement.amount; // The settlement amount credited to the account
          if (settlement.receivedInType === 'cash') {
            updatedCash = updatedCash.map(c =>
              c.id === settlement.receivedInId ? { ...c, balance: c.balance - netCredited } : c
            );
          } else {
            updatedCards = updatedCards.map(c =>
              c.id === settlement.receivedInId ? { ...c, currentBalance: c.currentBalance - netCredited } : c
            );
          }
        }
      }

      // 3. Add an audit transaction record
      const nowIso = new Date().toISOString();
      const refundTransaction: Transaction = {
        id: `trans-refund-${Date.now()}`,
        type: 'deposit',
        title: `Loan Refund: ${loanToDelete.borrowerName}`,
        amount: loanToDelete.totalAmount,
        date: todayLocal(),
        category: 'Loan Refund',
        accountId: loanToDelete.sourceAccountId,
        accountType: loanToDelete.sourceAccountType,
        referenceId: loanId,
        updated_at: nowIso,
        updatedAt: nowIso,
      };

      // 4. Remove settlement-related transactions
      const settlementIds = (loanToDelete.settlements || []).map(s => s.id);
      const updatedTransactions = prev.transactions.filter(tx =>
        tx.referenceId !== loanId && !settlementIds.includes(tx.referenceId || '')
      );

      return {
        ...prev,
        cashAccounts: updatedCash,
        cards: updatedCards,
        loansGiven: (prev.loansGiven || []).filter(l => l.id !== loanId),
        transactions: [refundTransaction, ...updatedTransactions],
      };
    });
  };

  const handleIncreaseLoan = (
    loanId: string,
    amount: number,
    sourceAccountId: string,
    sourceAccountType: 'cash' | 'card',
    sourceAccountName: string,
    notes?: string,
    bankCharge: number = 0
  ) => {
    updateState(prev => {
      // Find the loan item to capture borrower info
      const targetLoan = (prev.loansGiven || []).find(l => l.id === loanId);
      if (!targetLoan) return prev;

      // 1. Deduct funds from selected account
      let updatedCash = [...prev.cashAccounts];
      let updatedCards = [...prev.cards];

      const totalDeduction = amount + bankCharge;

      if (sourceAccountType === 'cash') {
        updatedCash = updatedCash.map(c =>
          c.id === sourceAccountId ? { ...c, balance: c.balance - totalDeduction } : c
        );
      } else {
        updatedCards = updatedCards.map(c =>
          c.id === sourceAccountId ? { ...c, currentBalance: c.currentBalance - totalDeduction } : c
        );
      }

      // 2. Update remaining amount & totalAmount
      const updatedLoans: LoanGiven[] = (prev.loansGiven || []).map(loan => {
        if (loan.id === loanId) {
          const freshNotes = loan.notes 
            ? `${loan.notes} | Added Lent Amount: ${notes}` 
            : `Added Lent Amount: ${notes}`;
          const newTotal = loan.totalAmount + amount;
          const newRemaining = loan.remainingAmount + amount;
          const newStatus = newRemaining <= 0 ? 'Settled' : 'Partially Settled';
          return {
            ...loan,
            remainingAmount: newRemaining,
            totalAmount: newTotal,
            status: newStatus,
            notes: freshNotes,
          };
        }
        return loan;
      });

      // 3. Create Transaction log
      const nowIso = new Date().toISOString();
      const txId = `tx_loan_add_${Date.now()}`;
      const newTx: Transaction = {
        id: txId,
        type: 'expense',
        title: `Lent More: ${targetLoan.borrowerName}`,
        amount: amount,
        date: todayLocal(),
        category: 'Loan',
        accountId: sourceAccountId,
        accountType: sourceAccountType,
        referenceId: loanId,
        charge: bankCharge > 0 ? bankCharge : undefined,
        updated_at: nowIso,
        updatedAt: nowIso,
      };

      // 4. Create Expense entry
      const newExp: Expense = {
        id: `exp_loan_add_${Date.now()}`,
        title: `Lent More to ${targetLoan.borrowerName}`,
        description: `Lent additional capital. Notes: ${notes || 'Added principal'}`,
        amount: amount,
        date: todayLocal(),
        category: 'Loan',
        paymentMethodId: sourceAccountId,
        paymentMethodType: sourceAccountType,
        updated_at: nowIso,
        updatedAt: nowIso,
      };

      const newExpenses = [newExp, ...prev.expenses];
      const newTransactions = [newTx];

      if (bankCharge > 0) {
        const chargeExpenseId = `exp-charge-${Date.now()}`;
        const chargeTransactionId = `trans-charge-${Date.now()}`;

        const chargeExpense: Expense = {
          id: chargeExpenseId,
          title: `Bank Charge: Lent More ${targetLoan.borrowerName}`,
          description: `Automatic bank charge fee for lending additional capital`,
          amount: bankCharge,
          date: todayLocal(),
          category: 'Bank Charges & Interest',
          paymentMethodId: sourceAccountId,
          paymentMethodType: sourceAccountType,
          updated_at: nowIso,
          updatedAt: nowIso,
        };

        const chargeTransaction: Transaction = {
          id: chargeTransactionId,
          type: 'expense',
          title: `Bank Charge: Lent More ${targetLoan.borrowerName}`,
          amount: bankCharge,
          date: todayLocal(),
          category: 'Bank Charges & Interest',
          accountId: sourceAccountId,
          accountType: sourceAccountType,
          referenceId: chargeExpenseId,
          updated_at: nowIso,
          updatedAt: nowIso,
        };

        newExpenses.unshift(chargeExpense);
        newTransactions.push(chargeTransaction);
      }

      // 5. Notification
      const newNotif: AppNotification = {
        id: `nt_loan_add_${Date.now()}`,
        type: 'system',
        message: `Dispatched additional ${prev.currency} ${amount.toLocaleString()} to ${targetLoan.borrowerName} under existing loan agreement.`,
        date: todayLocal(),
        read: false,
      };

      return {
        ...prev,
        cashAccounts: updatedCash,
        cards: updatedCards,
        loansGiven: updatedLoans,
        transactions: [...newTransactions, ...prev.transactions],
        expenses: newExpenses,
        notifications: [newNotif, ...prev.notifications],
      };
    });
  };

  const handleAddCreditCard = (card: Omit<DbCreditCard, 'id'>) => {
      updateState(prev => ({
          ...prev,
          creditCards: [...prev.creditCards, { ...card, id: `cc-${Date.now()}` } as DbCreditCard]
      }));
  };

  const handleUpdateCard = (updatedCard: BankCard) => {
    updateState(prev => ({
      ...prev,
      cards: prev.cards.map(c => c.id === updatedCard.id ? updatedCard : c)
    }));
  };

  const handleApplyCardCharge = (cardId: string, charge: any) => {
    updateState(prev => {
      const transactionId = `trans-${Date.now()}`;
      const nowIso = new Date().toISOString();
      const newTransaction: Transaction = {
        id: transactionId,
        type: 'credit_card_charge',
        title: `Credit Card Charge: ${charge.name} (${charge.type})`,
        amount: charge.amount,
        date: charge.appliedDate,
        category: 'Bank Charges & Interest',
        accountId: cardId,
        accountType: 'card',
        referenceId: charge.id,
        updated_at: nowIso,
        updatedAt: nowIso,
      };

      const updatedCards = prev.cards.map(c => {
        if (c.id === cardId) {
          const nextCharges = c.charges ? [...c.charges, charge] : [charge];
          return {
            ...c,
            currentBalance: c.currentBalance - charge.amount,
            charges: nextCharges
          };
        }
        return c;
      });

      return {
        ...prev,
        cards: updatedCards,
        transactions: [newTransaction, ...prev.transactions]
      };
    });
    showToast('success', 'Credit card charge applied and transaction recorded!');
  };

  const handleDeleteCardCharge = (cardId: string, chargeId: string) => {
    updateState(prev => {
      const card = prev.cards.find(c => c.id === cardId);
      if (!card) return prev;

      const chargeToDelete = (card.charges || []).find(ch => ch.id === chargeId);
      if (!chargeToDelete) return prev;

      const updatedCards = prev.cards.map(c => {
        if (c.id === cardId) {
          return {
            ...c,
            currentBalance: c.currentBalance + chargeToDelete.amount,
            charges: (c.charges || []).filter(ch => ch.id !== chargeId)
          };
        }
        return c;
      });

      const updatedTransactions = prev.transactions.filter(
        t => !(t.type === 'credit_card_charge' && t.referenceId === chargeId)
      );

      return {
        ...prev,
        cards: updatedCards,
        transactions: updatedTransactions
      };
    });
    showToast('success', 'Charge removed and transaction reversed.');
  };

  // Subscriptions Actions Setup
  const handleAddSubscription = (subData: Omit<Subscription, 'id'>) => {
    const newSub: Subscription = {
      ...subData,
      id: generateUniqueId('sub'),
    };
    const validation = validateData(SubscriptionSchema, newSub);
    if (!validation.success) {
      showToast(validation.error, 'error');
      return;
    }
    updateState(prev => ({
      ...prev,
      subscriptions: [...(prev.subscriptions || []), validation.data],
    }));
  };

  const handleDeleteSubscription = (id: string) => {
    updateState(prev => {
      const subToDelete = (prev.subscriptions || []).find(s => s.id === id);
      if (!subToDelete) return prev;

      const nowIso = new Date().toISOString();
      const auditTransaction: Transaction = {
        id: `trans-sub-del-${Date.now()}`,
        type: 'expense',
        title: `Subscription Cancelled: ${subToDelete.name}`,
        amount: 0,
        date: todayLocal(),
        category: 'Subscription Deletion',
        referenceId: id,
        updated_at: nowIso,
        updatedAt: nowIso,
      };

      return {
        ...prev,
        subscriptions: (prev.subscriptions || []).filter(sub => sub.id !== id),
        transactions: [auditTransaction, ...prev.transactions],
      };
    });
  };

  const handleToggleSubscriptionStatus = (id: string, currentStatus: 'Active' | 'Paused' | 'Cancelled') => {
    if (currentStatus === 'Cancelled') return; // Cannot resurrect a cancelled subscription
    updateState(prev => ({
      ...prev,
      subscriptions: (prev.subscriptions || []).map(sub => {
        if (sub.id === id) {
          const nextStatus: 'Active' | 'Paused' | 'Cancelled' = currentStatus === 'Active' ? 'Paused' : 'Active';
          return { ...sub, status: nextStatus };
        }
        return sub;
      }),
    }));
  };

  const handlePaySubscription = (
    subId: string,
    accountId: string,
    accountType: 'cash' | 'card',
    paymentDate: string,
    bankCharge: number = 0
  ) => {
    updateState(prev => {
      const sub = (prev.subscriptions || []).find(s => s.id === subId);
      if (!sub) return prev;

      // Deduct TARGET card/cash balances
      let updatedCash = [...prev.cashAccounts];
      let updatedCards = [...prev.cards];
      const newAlertNotifications: AppNotification[] = [];

      const totalDeductionCents = toMinorUnits(sub.amount) + toMinorUnits(bankCharge);
      const totalDeduction = totalDeductionCents / 100;

      let accountName = '';
      if (accountType === 'cash') {
        updatedCash = updatedCash.map(c => {
          if (c.id === accountId) {
            accountName = c.name;
            const nextVal = (toMinorUnits(c.balance) - totalDeductionCents) / 100;
            if (nextVal < 5000) {
              newAlertNotifications.push({
                id: `nt-alert-${Date.now()}`,
                type: 'alert',
                message: `Low balance alert! ${c.name} is critically low: ${prev.currency} ${nextVal.toLocaleString()}`,
                date: todayLocal(),
                read: false,
              });
            }
            return { ...c, balance: nextVal };
          }
          return c;
        });
      } else {
        updatedCards = updatedCards.map(c => {
          if (c.id === accountId) {
            accountName = `${c.bankName} - ${c.cardName}`;
            const nextVal = (toMinorUnits(c.currentBalance) - totalDeductionCents) / 100;
            if (nextVal < 10000) {
              newAlertNotifications.push({
                id: `nt-alert-${Date.now()}`,
                type: 'alert',
                message: `Low balance alert! Card ${c.cardName} balance is low: ${prev.currency} ${nextVal.toLocaleString()}`,
                date: todayLocal(),
                read: false,
              });
            }
            return { ...c, currentBalance: nextVal };
          }
          return c;
        });
      }

      // Update next due date and lastPaidDate for the paid subscription
      const currentDueDate = new Date(sub.dueDate);
      if (sub.billingCycle === 'Monthly') {
        currentDueDate.setMonth(currentDueDate.getMonth() + 1);
      } else {
        currentDueDate.setFullYear(currentDueDate.getFullYear() + 1);
      }
      const nextDueDateStr = currentDueDate.toISOString().split('T')[0];

      const updatedSubscriptions = (prev.subscriptions || []).map(s => {
        if (s.id === subId) {
          return {
            ...s,
            dueDate: nextDueDateStr,
            lastPaidDate: paymentDate,
            paymentMethodId: accountId,
            paymentMethodType: accountType,
          };
        }
        return s;
      });

      // Draft unified Expense item
      const nowIso = new Date().toISOString();
      const expenseId = `exp-${Date.now()}`;
      const transactionId = `trans-${Date.now()}`;
      const newExpense: Expense = {
        id: expenseId,
        title: `Subscription: ${sub.name}`,
        description: `Recurring payment plan: ${sub.billingCycle} - paid from ${accountName}`,
        amount: sub.amount,
        date: paymentDate,
        category: sub.category,
        paymentMethodId: accountId,
        paymentMethodType: accountType,
        updated_at: nowIso,
        updatedAt: nowIso,
      };

      // Draft unified Journal ledger transaction record
      const newTransaction: Transaction = {
        id: transactionId,
        type: 'expense',
        title: `Subscription Settle: ${sub.name}`,
        amount: sub.amount,
        date: paymentDate,
        category: sub.category,
        accountId,
        accountType,
        referenceId: expenseId,
        charge: bankCharge > 0 ? bankCharge : undefined,
        updated_at: nowIso,
        updatedAt: nowIso,
      };

      const newExpenses = [...prev.expenses, newExpense];
      const newTransactions = [newTransaction];

      if (bankCharge > 0) {
        const chargeExpenseId = `exp-charge-${Date.now()}`;
        const chargeTransactionId = `trans-charge-${Date.now()}`;

        const chargeExpense: Expense = {
          id: chargeExpenseId,
          title: `Bank Charge: Subscription ${sub.name}`,
          description: `Automatic transaction fee on subscription card payment`,
          amount: bankCharge,
          date: paymentDate,
          category: 'Bank Charges & Interest',
          paymentMethodId: accountId,
          paymentMethodType: accountType,
          updated_at: nowIso,
          updatedAt: nowIso,
        };

        const chargeTransaction: Transaction = {
          id: chargeTransactionId,
          type: 'expense',
          title: `Bank Charge: Subscription ${sub.name}`,
          amount: bankCharge,
          date: paymentDate,
          category: 'Bank Charges & Interest',
          accountId,
          accountType,
          referenceId: chargeExpenseId,
          updated_at: nowIso,
          updatedAt: nowIso,
        };

        newExpenses.push(chargeExpense);
        newTransactions.push(chargeTransaction);
      }

      // Add a nice confirmation system notification
      const systemNotif: AppNotification = {
        id: `nt-sys-${Date.now()}`,
        type: 'system',
        message: `Subscription paid: ${sub.name} is settled (${prev.currency} ${sub.amount.toLocaleString()}). Next due: ${nextDueDateStr}.`,
        date: todayLocal(),
        read: false,
      };

      return {
        ...prev,
        subscriptions: updatedSubscriptions,
        expenses: newExpenses,
        cashAccounts: updatedCash,
        cards: updatedCards,
        transactions: [...newTransactions, ...prev.transactions],
        notifications: [systemNotif, ...newAlertNotifications, ...prev.notifications],
      };
    });
  };

  const handleAddCreditCardPurchase = (purchase: Omit<CreditCardPurchase, 'id'>) => {
    updateState(prev => {
        const updatedCards = prev.cards.map(c => c.id === purchase.cardId ? { ...c, currentBalance: c.currentBalance - purchase.amount } : c);
        
        const nowIso = new Date().toISOString();
        const newTransaction: Transaction = {
          id: `trans-${Date.now()}`,
          type: 'expense',
          title: `Credit Card Purchase: ${purchase.description}`,
          amount: purchase.amount,
          date: purchase.date,
          category: 'Shopping', // Default category
          accountId: purchase.cardId,
          accountType: 'card',
          updated_at: nowIso,
          updatedAt: nowIso,
        };
        
        return {
            ...prev,
            cards: updatedCards,
            creditCardPurchases: [...prev.creditCardPurchases, { ...purchase, id: `ccp-${Date.now()}` } as CreditCardPurchase],
            transactions: [newTransaction, ...prev.transactions]
        };
    });
    showToast('success', 'Purchase recorded successfully!');
  };

  const handlePayCreditCard = (cardId: string, amount: number, fromId: string, fromType: 'cash' | 'card') => {
      if (fromType === 'card' && fromId === cardId) {
        showToast('Cannot pay a credit card using the same card as source.', 'error');
        return;
      }
      let overpaymentMsg = '';
      updateState(prev => {
          const updatedCash = prev.cashAccounts.map(c => 
            (fromType === 'cash' && c.id === fromId) ? { ...c, balance: subtractMoney(c.balance, amount) } : c
          );
          
          const updatedCards = prev.cards.map(c => {
            let cBal = c.currentBalance;
            if (fromType === 'card' && c.id === fromId) {
                cBal = subtractMoney(cBal, amount); // We paid using this card, so balance decreases
            }
            if (c.id === cardId) {
                const outstanding = c.currentBalance < 0 ? Math.abs(c.currentBalance) : 0;
                if (amount > outstanding) {
                    overpaymentMsg = `Note: Payment of ${prev.currency}${amount.toLocaleString()} exceeds outstanding debt of ${prev.currency}${outstanding.toLocaleString()}, resulting in a positive credit balance of ${prev.currency}${(subtractMoney(amount, outstanding)).toLocaleString()}.`;
                }
                cBal = addMoney(cBal, amount); // We paid off this card
            }
            return { ...c, currentBalance: cBal };
          });
          
          const targetCard = prev.cards.find(c => c.id === cardId);
          const nowIso = new Date().toISOString();
          const newTransaction: Transaction = {
            id: generateUniqueId('trans'),
            type: 'debt_payment',
            title: `Credit Card Settlement: ${targetCard?.cardName || 'Card'}`,
            amount: amount,
            date: todayLocal(),
            category: 'Debt Repayment',
            accountId: fromId,
            accountType: fromType,
            updated_at: nowIso,
            updatedAt: nowIso,
          };
          
          return {
              ...prev,
              cashAccounts: updatedCash,
              cards: updatedCards,
              transactions: [newTransaction, ...prev.transactions]
          };
      });
      showToast('success', overpaymentMsg ? `Payment recorded! ${overpaymentMsg}` : 'Payment recorded successfully!');
  };

  const handleIncreaseDebt = (debtId: string, amount: number, newAccountId?: string, newAccountType?: 'cash' | 'card') => {
    updateState(prev => {
      const debt = prev.debts.find(d => d.id === debtId);
      if (!debt) return prev;

      let accountName: string | undefined;
      const targetAccountIdResolved = newAccountId || debt.accountId;
      const targetAccountTypeResolved = newAccountType || debt.accountType;
      if (targetAccountIdResolved && targetAccountTypeResolved) {
        if (targetAccountTypeResolved === 'cash') accountName = prev.cashAccounts.find(c => c.id === targetAccountIdResolved)?.name;
        else accountName = prev.cards.find(c => c.id === targetAccountIdResolved)?.bankName || prev.cards.find(c => c.id === targetAccountIdResolved)?.cardName;
      }
      const incEntry = { id: `inc-${Date.now()}`, amount, date: todayLocal(), accountName };

      const updatedDebt = { 
        ...debt, 
        totalAmount: Number(debt.totalAmount || 0) + Number(amount || 0),
        remainingAmount: Number(debt.remainingAmount || 0) + Number(amount || 0),
        status: (Number(debt.remainingAmount || 0) + Number(amount || 0)) > 0 ? 'Active' : debt.status,
        increaseHistory: [...(debt.increaseHistory || []), incEntry],
      };

      // Determine which account to update
      const targetAccountId = newAccountId || debt.accountId;
      const targetAccountType = newAccountType || debt.accountType;

      let updatedCash = [...prev.cashAccounts];
      let updatedCards = [...prev.cards];
      const newTransactions = [...prev.transactions];

      if (targetAccountId && targetAccountType) {
        if (targetAccountType === 'cash') {
          updatedCash = updatedCash.map(c =>
            c.id === targetAccountId ? { ...c, balance: (toMinorUnits(c.balance) + toMinorUnits(amount)) / 100 } : c
          );
        } else {
          updatedCards = updatedCards.map(c =>
            c.id === targetAccountId ? { ...c, currentBalance: (toMinorUnits(c.currentBalance) + toMinorUnits(amount)) / 100 } : c
          );
        }

        // Add transaction for additional borrowed liability funds
        const nowIso = new Date().toISOString();
        const txId = `tx_debt_inc_${Date.now()}`;
        const newTx: Transaction = {
          id: txId,
          type: 'financing',
          title: `Borrowed More: ${updatedDebt.debtSource}`,
          amount: amount,
          date: todayLocal(),
          category: 'Other',
          accountId: targetAccountId,
          accountType: targetAccountType,
          referenceId: debtId,
          updated_at: nowIso,
          updatedAt: nowIso,
        };
        newTransactions.unshift(newTx);
      }

      return {
        ...prev,
        cashAccounts: updatedCash,
        cards: updatedCards,
        transactions: newTransactions,
        debts: prev.debts.map(d => d.id === debtId ? updatedDebt : d)
      };
    });
  };

  // Rule: Partial Debt Repayment Deductions
  const handleMakeDebtPayment = (
    debtId: string,
    amount: number,
    paidFromId: string,
    paidFromType: 'cash' | 'card',
    bankCharge: number = 0
  ) => {
    const paymentId = `dp-${Date.now()}`;
    const transactionId = `trans-${Date.now()}`;
    const paymentDate = todayLocal();

    updateState(prev => {
      // 1. Deduct principal accounts
      let updatedCash = [...prev.cashAccounts];
      let updatedCards = [...prev.cards];

      const totalDeduction = amount + bankCharge;

      if (paidFromType === 'cash') {
        updatedCash = updatedCash.map(c => 
          c.id === paidFromId ? { ...c, balance: c.balance - totalDeduction } : c
        );
      } else {
        updatedCards = updatedCards.map(c => 
          c.id === paidFromId ? { ...c, currentBalance: c.currentBalance - totalDeduction } : c
        );
      }

      // 2. Reduce remaining debt
      const updatedDebts = prev.debts.map(debt => {
        if (debt.id === debtId) {
          const newPayment = {
            id: paymentId,
            debtId,
            amount,
            date: paymentDate,
            paidFromId,
            paidFromType,
          };
          const nextRemaining = Math.max(0, Number(debt.remainingAmount || 0) - Number(amount || 0));
          return {
            ...debt,
            remainingAmount: nextRemaining,
            payments: [...debt.payments, newPayment],
            status: nextRemaining === 0 ? 'Fully Repaid' : (debt.status || 'Active'),
          };
        }
        return debt;
      });

      const matchedDebt = prev.debts.find(d => d.id === debtId);
      const nowIso = new Date().toISOString();
      const newTransaction: Transaction = {
        id: transactionId,
        type: 'debt_payment',
        title: `Debt Repayment - ${matchedDebt?.debtSource || 'Private Loan'}`,
        amount,
        date: paymentDate,
        category: 'Debt Repayment',
        accountId: paidFromId,
        accountType: paidFromType,
        referenceId: paymentId,
        charge: bankCharge > 0 ? bankCharge : undefined,
        updated_at: nowIso,
        updatedAt: nowIso,
      };

      const newExpenses = [...prev.expenses];
      const newTransactions = [newTransaction];

      if (bankCharge > 0) {
        const chargeExpenseId = `exp-charge-${Date.now()}`;
        const chargeTransactionId = `trans-charge-${Date.now()}`;

        const chargeExpense: Expense = {
          id: chargeExpenseId,
          title: `Bank Charge: Repay ${matchedDebt?.debtSource || 'Private Loan'}`,
          description: `Automatic bank charge fee for debt repayment`,
          amount: bankCharge,
          date: paymentDate,
          category: 'Bank Charges & Interest',
          paymentMethodId: paidFromId,
          paymentMethodType: paidFromType,
          updated_at: nowIso,
          updatedAt: nowIso,
        };

        const chargeTransaction: Transaction = {
          id: chargeTransactionId,
          type: 'expense',
          title: `Bank Charge: Repay ${matchedDebt?.debtSource || 'Private Loan'}`,
          amount: bankCharge,
          date: paymentDate,
          category: 'Bank Charges & Interest',
          accountId: paidFromId,
          accountType: paidFromType,
          referenceId: chargeExpenseId,
          updated_at: nowIso,
          updatedAt: nowIso,
        };

        newExpenses.push(chargeExpense);
        newTransactions.push(chargeTransaction);
      }

      const systemAlert: AppNotification = {
        id: `nt-${Date.now()}`,
        type: 'system',
        message: `Settle Repayment: Reduced loan from ${matchedDebt?.debtSource} by ${prev.currency} ${amount.toLocaleString()}.`,
        date: paymentDate,
        read: false,
      };

      return {
        ...prev,
        cashAccounts: updatedCash,
        cards: updatedCards,
        expenses: newExpenses,
        debts: updatedDebts,
        transactions: [...newTransactions, ...prev.transactions],
        notifications: [systemAlert, ...prev.notifications],
      };
    });
  };

  // Core cash account list modifiers
  const handleAddCashAccount = (name: string, balance: number) => {
    const newAcct: CashAccount = {
      id: generateUniqueId('cash'),
      name,
      balance,
    };
    const validation = validateData(CashAccountSchema, newAcct);
    if (!validation.success) {
      showToast(validation.error, 'error');
      return;
    }
    updateState(prev => ({
      ...prev,
      cashAccounts: [...prev.cashAccounts, validation.data],
    }));
  };

  const handleEditCashAccount = (id: string, newBalance: number) => {
    updateState(prev => {
      const match = prev.cashAccounts.find(c => c.id === id);
      const delta = match ? newBalance - match.balance : 0;

      const updatedCash = prev.cashAccounts.map(c => 
        c.id === id ? { ...c, balance: newBalance } : c
      );

      // Log adjustments trace on Transactions Audit ledger
      let updatedTrans = [...prev.transactions];
      if (delta !== 0) {
        const nowIso = new Date().toISOString();
        updatedTrans = [{
          id: generateUniqueId('trans-adjust'),
          type: delta > 0 ? 'deposit' : 'withdrawal',
          title: `Balance adjustment: ${match?.name || 'Cash'}`,
          amount: Math.abs(delta),
          date: todayLocal(),
          category: 'Adjustment',
          accountId: id,
          accountType: 'cash',
          updated_at: nowIso,
          updatedAt: nowIso,
        }, ...prev.transactions];
      }

      return {
        ...prev,
        cashAccounts: updatedCash,
        transactions: updatedTrans,
      };
    });
  };

  const handleAddCard = (newCardData: Omit<BankCard, 'id'>) => {
    const rawCard: BankCard = {
      ...newCardData,
      id: generateUniqueId('card'),
    };
    const validation = validateData(BankCardSchema, rawCard);
    if (!validation.success) {
      showToast(validation.error, 'error');
      return;
    }
    updateState(prev => ({
      ...prev,
      cards: [...prev.cards, validation.data],
    }));
  };

  const handleDeleteCard = async (idToDelete: string) => {
    updateState(prev => {
      const updatedCards = prev.cards.map(card => {
        if (String(card.id) === String(idToDelete)) {
          return { ...card, isCanceled: true };
        }
        return card;
      });
      return {
        ...prev,
        cards: updatedCards,
      };
    });

    // Explicit guaranteed database override for this critical action; await so
    // a network/RLS failure is surfaced instead of silently keeping the card live.
    if (userEmail) {
      try {
        await forceCancelCardInSupabase(userEmail, idToDelete);
      } catch (err: any) {
        showToast('Failed to sync card cancellation to cloud: ' + (err?.message || 'unknown error'), 'error');
      }
    }
  };

  const handleDeleteCashAccount = (id: string) => {
    updateState(prev => {
      const accountToDelete = prev.cashAccounts.find(c => c.id === id);
      if (accountToDelete && accountToDelete.balance !== 0) {
        showToast('error', `Cannot delete account "${accountToDelete.name}" with balance ${prev.currency} ${accountToDelete.balance.toLocaleString()}. Please clear funds first.`);
        return prev;
      }
      
      if (!accountToDelete) return prev;
      
      const nowIso = new Date().toISOString();
      const auditTransaction: Transaction = {
        id: `trans-cash-del-${Date.now()}`,
        type: 'expense',
        title: `Cash Account Deleted: ${accountToDelete.name}`,
        amount: 0,
        date: todayLocal(),
        category: 'Account Deletion',
        referenceId: id,
        updated_at: nowIso,
        updatedAt: nowIso,
      };

      return {
        ...prev,
        cashAccounts: prev.cashAccounts.filter(c => c.id !== id),
        transactions: [auditTransaction, ...prev.transactions],
      };
    });
  };

  // Notification Modifiers
  const handleDeleteTransaction = (txId: string) => {
    updateState(prev => {
      const tx = prev.transactions.find(t => t.id === txId);
      if (!tx) return prev;

      let updatedCash = [...prev.cashAccounts];
      let updatedCards = [...prev.cards];
      let updatedIncomes = [...prev.incomes];
      let updatedExpenses = [...prev.expenses];
      let updatedDebts = [...prev.debts];
      let updatedCreditCardPurchases = [...prev.creditCardPurchases];

      const reverseAmount = (amount: number, accountId: string, accountType: string, isIncome: boolean) => {
        if (accountType === 'cash') {
          updatedCash = updatedCash.map(c => 
            c.id === accountId ? { ...c, balance: c.balance + (isIncome ? -amount : amount) } : c
          );
        } else if (accountType === 'card') {
          updatedCards = updatedCards.map(c => 
            c.id === accountId ? { ...c, currentBalance: c.currentBalance + (isIncome ? -amount : amount) } : c
          );
        }
      };

      if (tx.type === 'income') {
        updatedIncomes = updatedIncomes.filter(i => i.id !== tx.referenceId);
        if (tx.accountId && tx.accountType) reverseAmount(tx.amount, tx.accountId, tx.accountType, true);
      } else if (tx.type === 'expense') {
        if (tx.title.startsWith('Credit Card Purchase:')) {
          // Liability purchase: previously subtracted from balance, need to add back
          updatedCards = updatedCards.map(c => c.id === tx.accountId ? { ...c, currentBalance: c.currentBalance + tx.amount } : c);
          updatedCreditCardPurchases = updatedCreditCardPurchases.filter(p => p.id !== tx.referenceId);
        } else {
          updatedExpenses = updatedExpenses.filter(e => e.id !== tx.referenceId);
          if (tx.accountId && tx.accountType) reverseAmount(tx.amount, tx.accountId, tx.accountType, false);
        }
      } else if (tx.type === 'credit_card_charge') {
        updatedCards = updatedCards.map(c => c.id === tx.accountId ? {
          ...c,
          currentBalance: c.currentBalance + tx.amount,
          charges: (c.charges || []).filter(ch => ch.id !== tx.referenceId)
        } : c);
      } else if (tx.type === 'debt_payment') {
        if (tx.title.startsWith('Credit Card Settlement:')) {
          // Put the money back into the source wallet/account that made the payment
          if (tx.accountId && tx.accountType) {
            reverseAmount(tx.amount, tx.accountId, tx.accountType, false);
          }
          // Restore the outstanding balance of the settled credit card (subtract the settled amount from the card)
          const cardNamePart = tx.title.replace('Credit Card Settlement:', '').trim();
          const targetCc = prev.cards.find(c => c.cardName === cardNamePart && c.cardType === 'Credit');
          if (targetCc) {
            updatedCards = updatedCards.map(c => c.id === targetCc.id ? { ...c, currentBalance: c.currentBalance - tx.amount } : c);
          }
        } else {
          if (tx.accountId && tx.accountType) reverseAmount(tx.amount, tx.accountId, tx.accountType, false);
          updatedDebts = updatedDebts.map(d => {
            const removedPayment = d.payments?.find(p => p.id === tx.referenceId);
            if (removedPayment) {
              const nextRemaining = d.remainingAmount + Math.abs(removedPayment.amount);
              return {
                ...d,
                remainingAmount: nextRemaining,
                payments: d.payments.filter(p => p.id !== tx.referenceId),
                status: nextRemaining > 0 ? 'Active' : d.status
              };
            }
            return d;
          });
        }
      } else if (tx.type === 'deposit') {
        if (tx.accountId) reverseAmount(tx.amount, tx.accountId, 'cash', true);
      } else if (tx.type === 'withdrawal') {
        if (tx.accountId) reverseAmount(tx.amount, tx.accountId, 'cash', false);
      }

      const nowIso = new Date().toISOString();
      const auditTransaction: Transaction = {
        id: `trans-del-${Date.now()}`,
        type: 'expense',
        title: `Transaction Deleted: ${tx.title}`,
        amount: 0,
        date: todayLocal(),
        category: 'Transaction Deletion',
        referenceId: txId,
        updated_at: nowIso,
        updatedAt: nowIso,
      };

      return {
        ...prev,
        transactions: [auditTransaction, ...prev.transactions.filter(t => t.id !== txId)],
        cashAccounts: updatedCash,
        cards: updatedCards,
        incomes: updatedIncomes,
        expenses: updatedExpenses,
        debts: updatedDebts,
        creditCardPurchases: updatedCreditCardPurchases
      };
    });
    setEditingTransactionId(null);
  };

  // Rule: Internal Transfers
  const handleTransferFunds = (
    fromId: string,
    fromType: 'cash' | 'card',
    toId: string,
    toType: 'cash' | 'card',
    amount: number,
    note: string,
    date: string,
    charge: number = 0
  ) => {
    if (fromId === toId && fromType === toType) {
      showToast('error', "Source and destination accounts cannot be the same.");
      return;
    }

    const transferId = `trans-grp-${Date.now()}`;
    const transOutId = `trans-${Date.now()}-out`;
    const transInId = `trans-${Date.now()}-in`;

    updateState(prev => {
      // 1. Validate balance
      let sourceAccountBalance = 0;
      if (fromType === 'cash') {
        sourceAccountBalance = prev.cashAccounts.find(c => c.id === fromId)?.balance || 0;
      } else {
        sourceAccountBalance = prev.cards.find(c => c.id === fromId)?.currentBalance || 0;
      }

      if (sourceAccountBalance < amount + charge) {
        showToast('error', "Insufficient balance in the source account including transfer charges.");
        return prev;
      }

      // 2. Perform transfer
      let updatedCash = [...prev.cashAccounts];
      let updatedCards = [...prev.cards];

      // Deduct from source (amount + charge)
      if (fromType === 'cash') {
        updatedCash = updatedCash.map(c => c.id === fromId ? { ...c, balance: (toMinorUnits(c.balance) - toMinorUnits(amount) - toMinorUnits(charge)) / 100 } : c);
      } else {
        updatedCards = updatedCards.map(c => c.id === fromId ? { ...c, currentBalance: (toMinorUnits(c.currentBalance) - toMinorUnits(amount) - toMinorUnits(charge)) / 100 } : c);
      }

      // Add to destination
      if (toType === 'cash') {
        updatedCash = updatedCash.map(c => c.id === toId ? { ...c, balance: (toMinorUnits(c.balance) + toMinorUnits(amount)) / 100 } : c);
      } else {
        updatedCards = updatedCards.map(c => c.id === toId ? { ...c, currentBalance: (toMinorUnits(c.currentBalance) + toMinorUnits(amount)) / 100 } : c);
      }

      // 3. Transactions
      const fromName = fromType === 'cash' ? prev.cashAccounts.find(x => x.id === fromId)?.name || 'Cash' : prev.cards.find(x => x.id === fromId)?.cardName || 'Bank Card';
      const toName = toType === 'cash' ? prev.cashAccounts.find(x => x.id === toId)?.name || 'Cash' : prev.cards.find(x => x.id === toId)?.cardName || 'Bank Card';

      const nowIso = new Date().toISOString();

      const transOut: Transaction = {
        id: transOutId,
        type: 'transfer',
        title: `Transfer to ${toName}: ${note}`,
        amount: -amount,
        charge,
        date,
        category: 'Transfer Out',
        accountId: fromId,
        accountType: fromType,
        targetAccountId: toId,
        targetAccountType: toType,
        referenceId: transferId,
        updated_at: nowIso,
        updatedAt: nowIso,
      };

      const transIn: Transaction = {
        id: transInId,
        type: 'transfer',
        title: `Transfer from ${fromName}: ${note}`,
        amount: amount,
        charge,
        date,
        category: 'Transfer In',
        accountId: toId,
        accountType: toType,
        targetAccountId: fromId,
        targetAccountType: fromType,
        referenceId: transferId,
        updated_at: nowIso,
        updatedAt: nowIso,
      };

      const newTransactions: Transaction[] = [transOut, transIn];

      if (charge > 0) {
        const transFeeId = `trans-${Date.now()}-char`;
        const transFee: Transaction = {
          id: transFeeId,
          type: 'expense',
          title: `Transfer Fee/Charge: ${fromName} to ${toName}`,
          amount: -charge,
          date,
          category: 'Transfer Fee',
          accountId: fromId,
          accountType: fromType,
          referenceId: transferId,
          updated_at: nowIso,
          updatedAt: nowIso,
        };
        newTransactions.push(transFee);
      }

      return {
        ...prev,
        cashAccounts: updatedCash,
        cards: updatedCards,
        transactions: [...newTransactions, ...prev.transactions],
      };
    });
  };
  const handleEditTransaction = (txId: string, newData: any) => {
    updateState(prev => {
      const tx = prev.transactions.find(t => t.id === txId);
      if (!tx) return prev;

      let updatedCash = [...prev.cashAccounts];
      let updatedCards = [...prev.cards];

      const changeBalance = (amountAdded: number, accountId: string, accountType: string) => {
        if (accountType === 'cash') {
          updatedCash = updatedCash.map(c => 
            c.id === accountId ? { ...c, balance: c.balance + amountAdded } : c
          );
        } else if (accountType === 'card') {
          updatedCards = updatedCards.map(c => 
            c.id === accountId ? { ...c, currentBalance: c.currentBalance + amountAdded } : c
          );
        }
      };

      // 1. Reverse the old transaction
      if (tx.type === 'income' || tx.type === 'deposit' || tx.type === 'financing') {
        if (tx.accountId && tx.accountType) changeBalance(-tx.amount, tx.accountId, tx.accountType);
      } else if (tx.type === 'expense' || tx.type === 'debt_payment' || tx.type === 'withdrawal') {
        if (tx.accountId && tx.accountType) changeBalance(tx.amount, tx.accountId, tx.accountType);
      }

      // 2. Apply the new transaction
      if (tx.type === 'income' || tx.type === 'deposit' || tx.type === 'financing') {
        changeBalance(newData.amount, newData.accountId, newData.accountType);
      } else if (tx.type === 'expense' || tx.type === 'debt_payment' || tx.type === 'withdrawal') {
        changeBalance(-newData.amount, newData.accountId, newData.accountType);
      }

      const updatedIncomes = [...prev.incomes];
      let updatedExpenses = [...prev.expenses];
      let updatedDebts = [...prev.debts];

      const nowIso = new Date().toISOString();

      if (tx.type === 'income') {
        /* No linked income record update required */
      } else if (tx.type === 'expense') {
        updatedExpenses = updatedExpenses.map(e => e.id === tx.referenceId ? {
          ...e, amount: newData.amount, title: newData.title, date: newData.date, category: newData.category,
          paymentMethodId: newData.accountId, paymentMethodType: newData.accountType,
          updated_at: nowIso, updatedAt: nowIso
        } : e);
      } else if (tx.type === 'debt_payment') {
        updatedDebts = updatedDebts.map(d => {
          const removedPayment = d.payments?.find(p => p.id === tx.referenceId);
          if (removedPayment) {
            const difference = newData.amount - tx.amount;
            const nextRemaining = Math.max(0, d.remainingAmount - difference);
            return {
              ...d,
              remainingAmount: nextRemaining,
              updated_at: nowIso,
              updatedAt: nowIso,
              payments: d.payments.map(p => p.id === tx.referenceId ? { 
                ...p, amount: newData.amount, date: newData.date, paidFromId: newData.accountId, paidFromType: newData.accountType,
                updated_at: nowIso, updatedAt: nowIso
              } : p),
              status: nextRemaining === 0 ? 'Fully Repaid' : 'Active'
            };
          }
          return d;
        });
      }

      return {
        ...prev,
        cashAccounts: updatedCash,
        cards: updatedCards,
        incomes: updatedIncomes,
        expenses: updatedExpenses,
        debts: updatedDebts,
        transactions: prev.transactions.map(t => t.id === txId ? {
          ...t,
          ...newData,
          updated_at: nowIso,
          updatedAt: nowIso
        } : t)
      };
    });
    setEditingTransactionId(null);
  };

  const handleMarkNotificationRead = (id: string) => {
    updateState(prev => ({
      ...prev,
      notifications: prev.notifications.map(n => n.id === id ? { ...n, read: true } : n),
    }));
  };

  const handleClearNotification = (id: string) => {
    updateState(prev => ({
      ...prev,
      notifications: prev.notifications.filter(n => n.id !== id),
    }));
  };

  // Reset demo setup
  const triggerResetDemo = () => {
    showConfirm({
      message: 'Are you sure you want to restore all ledger books to initial demo genesis states? This replaces modifications.',
      onConfirm: () => {
        updateState(() => DEFAULT_APP_STATE);
        showToast('success', 'Ledger re-seeded beautifully.');
      }
    });
  };

  // JSON state upload restoration
  const handleJSONRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const loadedJson = JSON.parse(event.target?.result as string);
        
        let stateToLoad: any = null;
        let originalOwner = '';
        
        if (loadedJson.version === 'EM_BUDGET_SECURE_EX_V1' && loadedJson.data) {
          stateToLoad = loadedJson.data;
          originalOwner = loadedJson.exportedBy || '';
        } else if (loadedJson.cashAccounts && loadedJson.cards && loadedJson.transactions) {
          stateToLoad = loadedJson;
        }

        if (stateToLoad) {
          const sanitizedState: AppState = {
            ...DEFAULT_APP_STATE,
            ...stateToLoad,
            cashAccounts: stateToLoad.cashAccounts || [],
            cards: stateToLoad.cards || [],
            creditCards: stateToLoad.creditCards || [],
            creditCardPurchases: stateToLoad.creditCardPurchases || [],
            incomes: stateToLoad.incomes || [],
            expenses: stateToLoad.expenses || [],
            debts: stateToLoad.debts || [],
            transactions: stateToLoad.transactions || [],
            notifications: stateToLoad.notifications || [],
            subscriptions: stateToLoad.subscriptions || [],
            loansGiven: stateToLoad.loansGiven || [],
            budgets: stateToLoad.budgets || DEFAULT_APP_STATE.budgets || [],
            savingsGoals: stateToLoad.savingsGoals || DEFAULT_APP_STATE.savingsGoals || [],
          };
          updateState(() => sanitizedState);
          
          if (originalOwner && originalOwner !== 'Anonymous') {
            showToast('success', `Personal ledger belonging to ${originalOwner} imported successfully! All records linked to your active identity.`);
          } else {
            showToast('success', 'Database restored successfully! Ledger tracks have re-balanced.');
          }

          // Trigger manual push to ensure data is synced to cloud immediately
          const { autoSync } = getSupabaseConfig();
          if (autoSync && userEmail) {
            syncStateToSupabase(userEmail, stateToLoad, true).then(res => {
              if (res.success) {
                showToast('success', 'Imported data pushed to cloud automatically!');
              } else {
                console.warn('Auto-push failed after import:', res.error);
                showToast('error', 'Imported data failed to push to cloud.');
              }
            });
          }
        } else {
          showToast('error', 'Invalid backup file. Requisite database structures were missing.');
        }
      } catch (err) {
        showToast('error', 'File decode failure. Try with a valid export JSON backup.');
      }
    };
    reader.readAsText(file);
  };

  // 3. AGGREGATES & BALANCES COMPUTERS
  const now = new Date();
  const currentMonthLabel = now.toLocaleString('default', { month: 'long' });
  const currentMonthFormat = `-${String(now.getMonth() + 1).padStart(2, '0')}-`;

  const netWorthBreakdown = calculateNetWorth(state);
  const totalCashAmount = netWorthBreakdown.cash;
  const totalDebitCardsAmount = netWorthBreakdown.debitCards;
  const totalCreditCardsAmount = netWorthBreakdown.creditCardLiabilities;
  const totalDebtsAmount = netWorthBreakdown.debts;
  const totalLoansGiven = netWorthBreakdown.loansGiven;
  const aggregateActiveWealth = netWorthBreakdown.netWorth;

  const currentMonthInflow = state.transactions
    .filter(t => t.type === 'income' && t.date.includes(currentMonthFormat))
    .reduce((sum, t) => sum + t.amount, 0);

  const currentMonthOutflow = state.transactions
    .filter(t => t.type === 'expense' && t.date.includes(currentMonthFormat))
    .reduce((sum, t) => sum + t.amount, 0);

  // Compute live budgets dynamically from database transactions and subscriptions
  const computedBudgets = (state.budgets || []).map(budget => {
    const budgetCategoryLower = budget.category.toLowerCase().trim();
    
    // Sum transactions under this category
    const matchingTx = state.transactions.filter(t => {
      if (!t.category) return false;
      const tCategoryLower = t.category.toLowerCase().trim();
      return tCategoryLower === budgetCategoryLower && 
             (t.type === 'expense' || t.amount < 0);
    });

    const txSpentSum = matchingTx.reduce((sum, t) => sum + Math.abs(t.amount), 0);

    // Sum active subscriptions under this category
    const matchingSubs = (state.subscriptions || []).filter(s => {
      if (!s.category || s.status !== 'Active') return false;
      return s.category.toLowerCase().trim() === budgetCategoryLower;
    });

    const subsSpentSum = matchingSubs.reduce((sum, s) => sum + s.amount, 0);

    const totalSpent = txSpentSum + subsSpentSum;

    // Map itemized records
    const subBreakdown = [
      ...matchingTx.map(t => ({
        name: t.title || 'Transaction spend',
        spent: Math.abs(t.amount)
      })),
      ...matchingSubs.map(s => ({
        name: `${s.name} (Subscription)`,
        spent: s.amount
      }))
    ];

    return {
      ...budget,
      spent: (matchingTx.length > 0 || matchingSubs.length > 0) ? totalSpent : budget.spent,
      subBreakdown: subBreakdown.length > 0 ? subBreakdown : (budget.subBreakdown || [])
    };
  });

  // 4. TRANSACTION FILTERING METHOD
  const filteredHistory = [...state.transactions]
    .filter(t => {
      const matchesSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            t.category.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesType = filterType === 'all' || t.type === filterType;
      const matchesAccount = filterAccount === 'all' || t.accountId === filterAccount;

      return matchesSearch && matchesType && matchesAccount;
    })
    .sort((a, b) => {
      const getTs = (item: any): number => {
        const raw = item.updated_at || item.updatedAt || item.created_at || item.createdAt || item.date;
        if (!raw) return 0;
        const time = new Date(raw).getTime();
        return isNaN(time) ? 0 : time;
      };

      const timeA = getTs(a);
      const timeB = getTs(b);
      if (timeA !== timeB) return timeB - timeA;

      const dateCompare = b.date.localeCompare(a.date);
      if (dateCompare !== 0) return dateCompare;
      const aNum = parseInt(a.id.replace(/\D/g, ''), 10);
      const bNum = parseInt(b.id.replace(/\D/g, ''), 10);
      if (!isNaN(aNum) && !isNaN(bNum)) return bNum - aNum;
      return b.id.localeCompare(a.id);
    });

  // Minimal auth gate — center card with mono
  if (isCheckingAuth || isAppLockInit) {
    return (
      <div id="auth-loading-screen" className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-6">
        <div className="card p-8 text-center w-full max-w-[360px]">
          <div className="w-7 h-7 rounded-full border border-[var(--line)] border-t-[var(--ink)] animate-spin mx-auto motion-reduce:animate-none" aria-hidden />
          <p className="eyebrow mt-4">{isCheckingAuth ? 'Checking session' : 'Unlocking vault'}</p>
          <p className="mono text-[12px] text-[var(--ink-2)] mt-1.5">{isCheckingAuth ? 'Verifying secure device…' : 'Checking app locks…'}</p>
        </div>
      </div>
    );
  }

  // Spend category calculations for Category Spread Analysis
  const expensesByCategory: Record<string, number> = {};
  state.transactions
    .filter(t => t.type === 'expense')
    .forEach(t => {
      expensesByCategory[t.category] = (expensesByCategory[t.category] || 0) + Math.abs(t.amount);
    });

  const totalExpenseCategorySum = Object.values(expensesByCategory).reduce((s, v) => s + v, 0) || 1;
  const appCategoryChartList = Object.entries(expensesByCategory).map(([name, val]) => {
    const percentage = Math.round((val / totalExpenseCategorySum) * 100);
    return {
      name,
      value: val,
      percentage,
      color: EXPENSE_COLORS[name] || '#6B7280',
    };
  }).sort((a, b) => b.value - a.value).slice(0, 4);

  return (
    <div id="full-workspace-view" className="min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-[var(--bg)] text-[var(--ink)] flex flex-col lg:flex-row font-sans selection:bg-[var(--ink)] selection:text-[var(--bg)] antialiased relative">
      
      {/* ======================= DOCKED LEFT SIDEBAR NAVIGATION (Desktop Only) ======================= */}
      {isUnlocked && (
        <aside className={`hidden lg:flex flex-col h-screen fixed top-0 left-0 bg-[var(--surface)] border-r border-[var(--line)] backdrop-blur-xl transition-all duration-300 z-30 p-5 ${
          isNavCollapsed ? 'w-20' : 'w-64'
        } justify-between overflow-y-auto select-none`} id="docked-desktop-sidebar">
          <div className="space-y-6">
            {/* Logo/Brand block */}
            <div className={`flex items-center gap-3 ${isNavCollapsed ? 'justify-center' : ''}`}>
              <svg viewBox="0 0 100 100" className="w-10 h-10 shrink-0 select-none animate-fade-in transition-all duration-200" fill="none" xmlns="http://www.w3.org/2000/svg" id="sidebar-logo">
                <rect width="100" height="100" rx="22" fill="black" stroke="#52525b" strokeWidth="4px" />
                <path d="M 34 22 C 26 22, 22 26, 22 34 L 22 44 C 22 48, 18 50, 14 50 C 18 50, 22 52, 22 56 L 22 66 C 22 74, 26 78, 34 78" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                <path d="M 66 22 C 74 22, 78 26, 78 34 L 78 44 C 78 48, 82 50, 86 50 C 82 50, 78 52, 78 56 L 78 66 C 78 74, 74 78, 66 78" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                <text x="50" y="52" fill="white" fontSize="26" fontWeight="900" fontFamily='"Inter", ui-sans-serif, system-ui, sans-serif' textAnchor="middle" dominantBaseline="central" letterSpacing="-0.02em">
                  EM
                </text>
              </svg>
              {!isNavCollapsed && (
                <div className="animate-fade-in text-left">
                  <h1 className="text-sm font-black tracking-tight text-[var(--ink)] uppercase leading-none">
                    EM Budget
                  </h1>
                  <p className="text-[10px] text-[var(--ink-2)] mono mt-1 font-medium">Owner Device Secured</p>
                </div>
              )}
            </div>

            {/* Collapse Trigger button */}
            <div className="flex justify-between items-center pointer-events-auto">
              {!isNavCollapsed && (
                <span className="eyebrow flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-[var(--ink)] rounded-full animate-pulse" />
                  COMMAND CENTER
                </span>
              )}
              <button 
                onClick={() => setIsNavCollapsed(!isNavCollapsed)}
                className={`p-1.5 rounded-lg bg-[var(--surface-2)] hover:bg-[var(--surface)] border border-[var(--line)] text-[var(--ink-2)] hover:text-[var(--ink)] transition-all duration-200 cursor-pointer flex items-center justify-center ${isNavCollapsed ? 'mx-auto' : 'ml-auto'}`}
                title={isNavCollapsed ? "Expand Sidebar Layout" : "Collapse Sidebar Layout"}
              >
                <Zap size={11} className="text-indigo-400" />
              </button>
            </div>

            {/* Nav Menu */}
            <nav className="flex flex-col gap-1.5">
              {[
                { tab: 'dashboard', icon: <LayoutDashboard size={14} />, label: 'Overview Hub' },
                { tab: 'accounts', icon: <Wallet size={14} />, label: 'Wallets Portfolio' },
                { tab: 'inflow_outflow', icon: <Plus size={14} />, label: 'Ledger Registry' },
                { tab: 'budgets', icon: <CheckSquare size={14} />, label: 'Smart Budgets' },
                { tab: 'goals', icon: <CircleDot size={14} />, label: 'Savings Jars' },
                { tab: 'debts', icon: <CircleDot size={14} />, label: 'Track Liabilities' },
                { tab: 'loans', icon: <ArrowUpRight size={14} />, label: 'Track Loans Given' },
                { tab: 'reports', icon: <TrendingUp size={14} />, label: 'Reports Centre' },
              ].map((item) => (
                <button
                  key={item.tab}
                  onClick={() => setActiveTab(item.tab as any)}
                  className={`w-full py-3 px-3.5 rounded-xl font-sans font-bold text-xs flex items-center gap-3.5 transition-all duration-200 cursor-pointer border ${
                    activeTab === item.tab
                      ? 'bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-fg)] shadow-md font-extrabold'
                      : 'text-[var(--ink-2)] bg-transparent border-transparent hover:text-[var(--ink)] hover:border-[var(--line)] hover:bg-[var(--surface-2)]'
                  } ${isNavCollapsed ? 'justify-center px-1' : ''}`}
                  title={isNavCollapsed ? item.label : undefined}
                >
                  <span className={`shrink-0 ${activeTab === item.tab ? 'text-[var(--accent-fg)] scale-105' : 'text-[var(--ink-2)]'}`}>
                    {item.icon}
                  </span>
                  {!isNavCollapsed && <span className="truncate text-left">{item.label}</span>}
                </button>
              ))}
            </nav>
          </div>

          <div className="space-y-4">
            <AnimatePresence>
              {isMoreMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-lg p-2 space-y-1"
                >
                  {/* Toggle Theme */}
                  <button
                    onClick={() => {
                      toggleTheme();
                      setIsMoreMenuOpen(false);
                    }}
                    className="w-full text-left py-2 px-2.5 hover:bg-[var(--surface-2)] rounded-xl text-xs font-semibold text-[var(--ink-2)] hover:text-[var(--ink)] transition-all flex items-center gap-2.5 cursor-pointer"
                  >
                    {theme === 'dark' ? (
                      <>
                        <Sun size={13} className="text-yellow-400" />
                        <span>Switch to Light</span>
                      </>
                    ) : (
                      <>
                        <Moon size={13} className="text-indigo-400" />
                        <span>Switch to Dark</span>
                      </>
                    )}
                  </button>

                  {/* Logout Button */}
                  <button
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      handleLogout();
                    }}
                    className="w-full text-left py-2 px-2.5 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-[var(--danger)] hover:text-rose-600 dark:hover:text-rose-400 rounded-xl text-xs font-semibold transition-all flex items-center gap-2.5 cursor-pointer border-t border-[var(--line)] pt-2 mt-1"
                  >
                    <LogOut size={13} />
                    <span>Disconnect Session</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Sidebar bottom control buttons */}
            {!isNavCollapsed ? (
              <div className="flex items-center justify-between border-t border-[var(--line)]/60 pt-3.5 relative" id="desktop-sidebar-bottom-trigger">
                {/* Profile Card Trigger */}
                <button
                  onClick={() => setIsProfileOpen(true)}
                  className="flex items-center gap-2 text-left hover:opacity-80 transition-all cursor-pointer overflow-hidden shrink min-w-0"
                >
                  <div className="w-7 h-7 rounded-full bg-[var(--ink)] text-[var(--accent-fg)] font-bold overflow-hidden border border-[var(--line)] flex items-center justify-center shrink-0">
                    {state.userProfile?.avatarUrl ? (
                      <img 
                        src={state.userProfile.avatarUrl} 
                        alt={state.userProfile.name} 
                        className="w-full h-full object-cover" 
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      state.userProfile?.name?.charAt(0) || 'U'
                    )}
                  </div>
                  <div className="truncate text-left min-w-0">
                    <p className="text-[11px] font-bold text-[var(--ink)] leading-none truncate">{state.userProfile?.name || 'Owner Profile'}</p>
                    <p className="text-[8.5px] text-[var(--ink-2)] mono leading-none mt-1 truncate">{userEmail || 'Local Vault'}</p>
                  </div>
                </button>

                {/* More Icon Trigger */}
                <button 
                  onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
                  className={`p-2 rounded-lg border transition-all cursor-pointer flex items-center justify-center shrink-0 ${
                    isMoreMenuOpen 
                      ? 'bg-[var(--ink)] border-[var(--ink)] text-[var(--accent-fg)]' 
                      : 'bg-[var(--surface-2)] hover:bg-[var(--surface)] border-[var(--line)] text-[var(--ink-2)] hover:text-[var(--ink)]'
                  }`}
                  title="More Options"
                  id="sidebar-more-button-desktop"
                >
                  <MoreHorizontal size={13} />
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 border-t border-[var(--line)] pt-3.5 relative" id="desktop-sidebar-bottom-trigger-collapsed">
                <button 
                  onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
                  className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-center ${
                    isMoreMenuOpen
                      ? 'bg-[var(--ink)] border-[var(--ink)] text-[var(--accent-fg)]'
                      : 'bg-[var(--surface-2)] hover:bg-[var(--surface)] border-[var(--line)] text-[var(--ink-2)] hover:text-[var(--ink)]'
                  }`}
                  title="More Options"
                  id="sidebar-more-button-desktop-collapsed"
                >
                  <MoreHorizontal size={13} />
                </button>
              </div>
            )}
          </div>
        </aside>
      )}

      {/* ======================= CONTENT WRAPPER CANVAS AREA ======================= */}
      <div className={`flex-1 flex flex-col min-h-[100dvh] w-full max-w-full overflow-x-hidden transition-all duration-300 ${
        isUnlocked ? (isNavCollapsed ? 'lg:pl-20' : 'lg:pl-64') : ''
      }`}>
        
        {/* Top header — minimal sticky h-14, hairline ledger rule */}
        <header className="sticky top-0 z-20 h-14 bg-[var(--surface)]/80 backdrop-blur supports-[backdrop-filter]:bg-[var(--surface)]/80 border-b border-[var(--line)] flex items-center justify-between gap-3 px-4 md:px-6" id="header-brand-rail">
          {/* left: breadcrumb eyebrow */}
          <div className="flex items-center gap-3 min-w-0">
            <span className="hidden sm:inline-flex w-8 h-8 rounded-full bg-[var(--surface-2)] border border-[var(--line)] items-center justify-center text-[10px] font-bold text-[var(--ink-2)] shrink-0" aria-hidden>EM</span>
            <div className="min-w-0">
              <p className="eyebrow leading-none truncate">
                {activeTab === 'dashboard' ? 'Overview' : activeTab === 'accounts' ? 'Wallets' : activeTab === 'inflow_outflow' ? 'Ledger' : activeTab === 'budgets' ? 'Budgets' : activeTab === 'goals' ? 'Goals' : activeTab === 'debts' ? 'Liabilities' : activeTab === 'loans' ? 'Loans Given' : 'Reports'} <span className="text-[var(--line-strong)] mx-1">/</span> <span className="text-[var(--ink)]">{activeTab === 'dashboard' ? 'Net worth' : activeTab === 'accounts' ? 'Portfolio' : activeTab === 'inflow_outflow' ? 'Inflow · Outflow' : activeTab}</span>
              </p>
              <p className="mono text-[11px] text-[var(--ink-3)] leading-none mt-1 hidden sm:block truncate">{userEmail || 'Local vault'}</p>
            </div>
          </div>

          {/* center: sync pill */}
          <div className="hidden md:flex items-center justify-center flex-1 px-4">
            {(() => {
              let label: string;
              let dot: string;
              if (!isOnline) {
                label = 'No internet';
                dot = 'bg-[var(--danger)] animate-pulse';
              } else if (!isSupabaseReachable) {
                label = 'Cloud unreachable';
                dot = 'bg-amber-500 animate-pulse';
              } else if (realtimeSyncStatus === 'syncing') {
                label = 'Syncing';
                dot = 'bg-amber-500 animate-pulse';
              } else if (realtimeSyncStatus === 'synced') {
                label = 'Synced';
                dot = 'bg-[var(--success)]';
              } else if (realtimeSyncStatus === 'error') {
                label = 'Sync error';
                dot = 'bg-[var(--danger)] animate-pulse';
              } else if (realtimeSyncStatus === 'disabled') {
                label = 'Offline';
                dot = 'bg-[var(--ink-3)]';
              } else {
                label = 'Idle';
                dot = 'bg-[var(--ink-3)]';
              }
              return (
                <span className="mono text-[11px] inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink-2)]" title={realtimeSyncError || label}>
                  <span className={`w-1.5 h-1.5 rounded-full ${dot} motion-reduce:animate-none`} aria-hidden />
                  {label}
                </span>
              );
            })()}
          </div>

          {/* right: controls */}
          <div className="flex items-center gap-2 shrink-0">
            {/* theme toggle — pill with 180ms rotate */}
            <button
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="w-8 h-8 rounded-full bg-[var(--surface-2)] border border-[var(--line)] text-[var(--ink-2)] hover:text-[var(--ink)] flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            >
              <motion.span
                key={theme}
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="flex items-center justify-center"
              >
                {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
              </motion.span>
            </button>

            {/* command / search */}
            <button
              onClick={() => setIsCommandPaletteOpen(true)}
              aria-label="Open command palette"
              className="hidden sm:inline-flex items-center gap-1.5 btn-ghost px-3 py-1.5 text-[12px] h-8"
            >
              <Search size={13} />
              <span className="hidden lg:inline">Search</span>
              <span className="mono text-[10px] px-1 py-0.5 rounded border border-[var(--line)] bg-[var(--surface-2)] hidden lg:inline">⌘K</span>
            </button>
            {/* mobile search icon */}
            <button
              onClick={() => setIsCommandPaletteOpen(true)}
              aria-label="Search"
              className="sm:hidden w-8 h-8 rounded-full bg-[var(--surface-2)] border border-[var(--line)] text-[var(--ink-2)] hover:text-[var(--ink)] flex items-center justify-center"
            >
              <Search size={14} />
            </button>

            {/* notifications */}
            <button
              onClick={() => setIsNotifOpen(true)}
              aria-label={`Notifications${state.notifications.filter(n => !n.read).length ? ` (${state.notifications.filter(n => !n.read).length} unread)` : ''}`}
              className="relative w-8 h-8 rounded-full bg-[var(--surface-2)] border border-[var(--line)] text-[var(--ink-2)] hover:text-[var(--ink)] flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
              id="header-notification-trigger"
            >
              <Bell size={14} />
              {state.notifications.filter(n => !n.read).length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-[var(--danger)] border-2 border-[var(--surface)] rounded-full motion-reduce:animate-none" aria-hidden />
              )}
            </button>

            {/* profile avatar */}
            <button
              onClick={() => setIsProfileOpen(true)}
              aria-label="Open profile"
              className="w-8 h-8 rounded-full overflow-hidden border border-[var(--line)] bg-[var(--surface-2)] flex items-center justify-center text-[11px] font-bold text-[var(--ink)] hover:border-[var(--line-strong)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
              id="header-profile-trigger"
            >
              {state.userProfile?.avatarUrl ? (
                <img src={state.userProfile.avatarUrl} alt={state.userProfile.name || 'Profile'} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <span>{(state.userProfile?.name?.charAt(0) || 'U').toUpperCase()}</span>
              )}
            </button>
          </div>
        </header>

        {/* Profile Modal */}
        {isProfileOpen && (
          <div className="fixed inset-0 bg-[var(--ink)]/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4" onClick={() => setIsProfileOpen(false)}>
            <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm">
              <ProfileSection 
                state={state} 
                updateState={updateState}
                onOpenSettings={() => { setIsProfileOpen(false); setIsSettingsOpen(true); }}
                onLogout={() => {
                  handleLogout();
                }}
                onClose={() => setIsProfileOpen(false)}
              />
            </div>
          </div>
        )}

        {/* ======================= RE-LOCK SCREEN INTERACTION ======================= */}
        {!isUnlocked && (
          <EmailLogin
            onUnlocked={async (email, token, rememberMe, deviceToken) => {
              authSession.setToken(token);
              authSession.setEmail(email);
              localStorage.setItem('auth_user_email', email);
              localStorage.setItem('auth_session_token', token);
              if (rememberMe && deviceToken) {
                localStorage.setItem('auth_device_token', deviceToken);
                authSession.setDeviceToken(deviceToken);
              }
              setUserEmail(email);
              try {
                await ensureSupabaseConfigFromBackend();
                const result = await syncStateFromSupabase(email);
                if (result.success && result.state) {
                  setState(migrateStateCards(result.state));
                }
                const backendSubs = await refreshSubscriptionsFromBackend(email, token);
                if (backendSubs && backendSubs.length > 0) {
                  setState(prev => ({ ...prev, subscriptions: mergeSubscriptionsList(prev.subscriptions, backendSubs) }));
                }
              } catch (err) {
                console.warn("Fatal error syncing from database, continuing offline...", err);
              }
              setIsUnlocked(true);
              setActiveTab('dashboard');
              // App-lock is intentionally NOT gated here: after a fresh password
              // login the user goes straight into the app. The lock screen is
              // shown only on reload/app-reopen (see verifyDevice mount gate) or
              // after the 60-second idle timeout (see idle re-lock effect below).
              // Remember this device for future app-lock skips
              if (rememberMe) {
                try { await issueTrustedDevice(email); } catch (err) { console.warn("Could not issue trusted-device cookie:", err); }
              }
            }}
          />
        )}

        {/* ======================= APP-LOCK GATE ======================= */}
        {isUnlocked && isAppLocked && (
          <LockScreen
            email={userEmail}
            appLockEnabled={!!appLockStatus?.appLockEnabled}
            pinEnabled={!!appLockStatus?.pinEnabled}
            hasBiometric={(appLockStatus?.biometricCount || 0) > 0}
            onUnlocked={() => setIsAppLocked(false)}
            onSwitchAccount={() => handleLogout()}
            onForgotPin={() => handleLogout()}
          />
        )}

        {/* 2. MAIN VIEWPORT AREA */}
        <main className="flex-1 w-full max-w-[1500px] mx-auto p-4 md:p-8 space-y-6 relative pb-28 lg:pb-12 text-left">
          
          {/* =================== WEB CONTENT CANVAS =================== */}
          <section className="space-y-6 w-full animate-fade-in" id="central-web-canvas">
          
          {/* Header block for current active tab */}
          {activeTab !== 'dashboard' && (
            <div className="card flex justify-between items-center p-6">
              <div className="min-w-0 pr-3 space-y-1">
                <span className="eyebrow">
                  {activeTab === 'accounts' ? 'Wallets Core' :
                   activeTab === 'inflow_outflow' ? 'Ledger Action' :
                   activeTab === 'budgets' ? 'Limit Envelopes' :
                   activeTab === 'goals' ? 'Aspirations & Vaults' :
                   activeTab === 'debts' ? 'Track Liabilities' :
                   activeTab === 'loans' ? 'Vault Asset Ledger' : 'Diagnostics Reports'}
                </span>
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[var(--ink)] capitalize leading-none">
                  {activeTab === 'accounts' ? 'Wallets' :
                   activeTab === 'inflow_outflow' ? 'Register & Recurring' :
                   activeTab === 'budgets' ? 'Smart Budgets' :
                   activeTab === 'goals' ? 'Savings Jars' :
                   activeTab === 'debts' ? 'Liabilities' :
                   activeTab === 'loans' ? 'Loans Given' : 'Reports'}
                </h1>
                {activeTab === 'loans' && (
                  <p className="text-xs text-[var(--ink-2)] mt-1.5 leading-relaxed max-w-xl hidden md:block">
                    Register and monitor personal funds lent to others. Record individual settle records, and automatically back credit balances back into your ledger account suites.
                  </p>
                )}
              </div>

              {/* Notifications trigger bell */}
              <button
                onClick={() => setIsNotifOpen(true)}
                className="p-2 sm:p-3 bg-[var(--surface-2)] border border-[var(--line)] rounded-full text-[var(--ink-2)] hover:text-[var(--ink)] hover:border-[var(--line-strong)] relative cursor-pointer shadow-sm transition-all flex items-center justify-center shrink-0"
              >
                <Bell size={15} />
                {state.notifications.filter(n => !n.read).length > 0 && (
                  <span className="absolute top-0 right-0 w-2 h-2 bg-emerald-500 border-2 border-[var(--surface)] rounded-full animate-pulse" />
                )}
              </button>
            </div>
          )}

          {/* Supabase Error Diagnostics Banner */}
          {realtimeSyncStatus === 'error' && (
            <div className="bg-red-950/20 border border-red-900/60 p-5 rounded-[24px] space-y-3 shadow-lg animate-fade-in" id="supabase-sync-error-diagnostic-panel">
              <div className="flex gap-2 items-center text-red-500 font-bold text-xs">
                <CloudOff size={15} className="shrink-0" />
                <span>REAL-TIME CLOUD SYNC ERROR DETECTED</span>
              </div>
              <p className="text-[11px] text-[var(--ink-2)] leading-relaxed">
                Your local ledger tracks couldn't synchronize instantly to Supabase. This is why some newly created Cash Wallets or cards/transactions might not appear in your database table.
              </p>
              <div className="bg-[var(--surface-2)] p-3 rounded-xl border border-[var(--line)] space-y-1 mono text-[10px]">
                <span className="text-[var(--ink-2)] font-bold block uppercase">Rejected Code:</span>
                <span className="text-red-400 font-semibold block break-words">{realtimeSyncError || 'Supabase Connection Rejected.'}</span>
              </div>
              <div className="pt-1.5 space-y-2">
                <span className="eyebrow block">3-Step Diagnostics & Resolution Guide:</span>
                <ol className="list-decimal list-inside text-[10px] text-[var(--ink-2)] space-y-1 leading-normal">
                  <li>Press <strong>Settings</strong> and confirm that your saved <strong>Supabase Secret Anon Key</strong> corresponds to your project credentials securely.</li>
                  <li>Make sure the <code className="text-teal-400 font-mono">ledger_states</code> core table exists in your database table schemas.</li>
                  <li>Copy and run the 1-click database generation SQL script directly inside your <strong>Supabase SQL Editor</strong> (under Settings).</li>
                </ol>
              </div>
            </div>
          )}

          {/* Active Canvas Body */}
          <div className="space-y-6 pb-24 lg:pb-0">

              {/* =================== CASE: TAB: DASHBOARD =================== */}
              {activeTab === 'dashboard' && (
                <LazyTab>
                  <Dashboard 
                    state={state} 
                    userEmail={userEmail}
                    aggregateActiveWealth={aggregateActiveWealth}
                    totalCashAmount={totalCashAmount}
                    totalDebitCardsAmount={totalDebitCardsAmount}
                    totalCreditCardsAmount={totalCreditCardsAmount}
                    totalDebtsAmount={totalDebtsAmount}
                    totalLoansGiven={totalLoansGiven}
                    currentMonthLabel={currentMonthLabel}
                    currentMonthInflow={currentMonthInflow}
                    currentMonthOutflow={currentMonthOutflow}
                    setActiveTab={setActiveTab}
                    setEditingTransactionId={setEditingTransactionId}
                    onProfileClick={() => setIsProfileOpen(true)}
                    onNotificationClick={() => setIsNotifOpen(true)}
                    onAddIncome={handleAddIncome}
                    onAddExpense={handleAddExpense}
                  />
                </LazyTab>
              )}

              {/* =================== CASE: TAB: BUDGETS =================== */}
              {activeTab === 'budgets' && (
                <LazyTab>
                  <BudgetsSection 
                    budgets={computedBudgets}
                    currency={state.currency}
                    onUpdateBudgetLimit={handleUpdateBudgetLimit}
                    onAddBudget={handleAddBudget}
                    onRemoveBudget={handleRemoveBudget}
                    onClearAllBudgets={handleClearAllBudgets}
                  />
                </LazyTab>
              )}

              {/* =================== CASE: TAB: GOALS =================== */}
              {activeTab === 'goals' && (
                <LazyTab>
                  <GoalsSection 
                    goals={state.savingsGoals || []}
                    currency={state.currency}
                    cashAccounts={state.cashAccounts}
                    onAddGoal={handleAddGoal}
                    onModifyGoalFunds={handleModifyGoalFunds}
                    onRemoveGoal={handleRemoveGoal}
                    onClearAllGoals={handleClearAllGoals}
                  />
                </LazyTab>
              )}

              {/* =================== CASE: TAB: ACCOUNTS =================== */}
              {activeTab === 'accounts' && (
                <LazyTab>
                  <div className="space-y-6">
                    <CashCardManagement
                      cashAccounts={state.cashAccounts}
                      cards={state.cards}
                      onAddCashAccount={handleAddCashAccount}
                      onEditCashAccount={handleEditCashAccount}
                      onAddCard={handleAddCard}
                      onDeleteCard={handleDeleteCard}
                      onDeleteCashAccount={handleDeleteCashAccount}
                      currency={state.currency}
                      onUpdateCard={handleUpdateCard}
                      onApplyCardCharge={handleApplyCardCharge}
                      onDeleteCardCharge={handleDeleteCardCharge}
                    />
                    <TransferFunds
                      cashAccounts={state.cashAccounts}
                      cards={state.cards}
                      currency={state.currency}
                      onTransferFunds={handleTransferFunds}
                    />
                  </div>
                </LazyTab>
              )}

              {/* =================== CASE: TAB: INFLOWS_OUTFLOWS =================== */}
              {activeTab === 'inflow_outflow' && (
                <LazyTab>
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    <div className="col-span-1 lg:col-span-5 xl:col-span-4 w-full">
                      <InflowsOutflows
                        cashAccounts={state.cashAccounts}
                        cards={state.cards}
                        onAddIncome={handleAddIncome}
                        onAddExpense={handleAddExpense}
                        currency={state.currency}
                      />
                    </div>
                    <div className="col-span-1 lg:col-span-7 xl:col-span-8 w-full">
                      <SubscriptionManagement
                        subscriptions={state.subscriptions || []}
                        cashAccounts={state.cashAccounts}
                        cards={state.cards}
                        currency={state.currency}
                        onAddSubscription={handleAddSubscription}
                        onDeleteSubscription={handleDeleteSubscription}
                        onToggleSubscriptionStatus={handleToggleSubscriptionStatus}
                        onPaySubscription={handlePaySubscription}
                      />
                    </div>
                  </div>
                </LazyTab>
              )}

              {/* =================== CASE: TAB: DEBTS =================== */}
              {activeTab === 'debts' && (
                <LazyTab>
                  <div className="space-y-6">
                    <DebtTracker
                      debts={state.debts}
                      cashAccounts={state.cashAccounts}
                      cards={state.cards}
                      onAddDebt={handleAddDebt}
                      onIncreaseDebt={handleIncreaseDebt}
                      onMakeDebtPayment={handleMakeDebtPayment}
                      onDeleteDebt={handleDeleteDebt}
                      currency={state.currency}
                    />
                    <CreditCardManagement
                      creditCards={state.cards.filter(c => c.cardType === 'Credit')}
                      cashAccounts={state.cashAccounts}
                      cards={state.cards}
                      currency={state.currency}
                      transactions={state.transactions}
                      creditCardPurchases={state.creditCardPurchases}
                      onPayCard={handlePayCreditCard}
                      onAddPurchase={handleAddCreditCardPurchase}
                      onUpdateCard={handleUpdateCard}
                    />
                  </div>
                </LazyTab>
              )}

              {/* =================== CASE: TAB: LOANS =================== */}
              {activeTab === 'loans' && (
                <LazyTab>
                  <div className="space-y-6">
                    <LoansTracker
                      loans={state.loansGiven || []}
                      cashAccounts={state.cashAccounts}
                      cards={state.cards}
                      onAddLoan={handleAddLoan}
                      onAddSettlement={handleMakeLoanSettlement}
                      onDeleteLoan={handleDeleteLoan}
                      onIncreaseLoan={handleIncreaseLoan}
                      currency={state.currency}
                    />
                  </div>
                </LazyTab>
              )}

              {/* =================== CASE: TAB: REPORTS =================== */}
              {activeTab === 'reports' && (
                <LazyTab>
                  <ReportsCentre
                    transactions={state.transactions}
                    incomes={state.incomes}
                    expenses={state.expenses}
                    debts={state.debts}
                    loansGiven={state.loansGiven || []}
                    currency={state.currency}
                    cashAccounts={state.cashAccounts}
                    cards={state.cards}
                    onSelectTransaction={(id) => setEditingTransactionId(id)}
                    subscriptions={state.subscriptions || []}
                    onToggleSubscriptionStatus={handleToggleSubscriptionStatus}
                    onPaySubscription={handlePaySubscription}
                  />
                </LazyTab>
              )}

            </div>

            {/* =================== MOBILE CORE SLIDE-UP HUB DRAWER =================== */}
            {isMobileNavOpen && (
              <div id="mobile-core-nav-drawer" className="fixed inset-0 bg-black/60 dark:bg-[#020205]/90 backdrop-blur-sm z-50 flex flex-col justify-end transition-all duration-350 lg:hidden">
                {/* Backdrop Dismiss Trigger */}
                <div className="absolute inset-0 cursor-pointer" onClick={() => setIsMobileNavOpen(false)} />
                
                <div className="bg-[var(--surface)] border-t border-[var(--line)] rounded-t-[32px] max-h-[85%] flex flex-col overflow-hidden shadow-2xl relative z-10 w-full animate-fade-in-up">
                  
                  {/* Slide Indicator Accent */}
                  <div className="w-12 h-1 bg-[var(--line-strong)] rounded-full mx-auto my-3.5 shrink-0 cursor-pointer" onClick={() => setIsMobileNavOpen(false)} />
                  
                  {/* Header Title Information */}
                  <div className="px-6 pb-4 border-b border-[var(--line)] flex justify-between items-center shrink-0">
                    <div>
                      <span className="eyebrow block mb-0.5">Explore Capabilities</span>
                      <h4 className="text-sm font-extrabold text-[var(--ink)]">Command Hub Menu</h4>
                    </div>
                    <button
                      onClick={() => setIsMobileNavOpen(false)}
                      className="px-3 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--line)] text-[10px] font-bold text-[var(--ink-2)] hover:text-[var(--ink)] cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                  
                  {/* Drawer Content Body: Grid & Quick stats */}
                  <div className="flex-1 overflow-y-auto p-5 space-y-5 select-none" style={{ scrollbarWidth: 'thin' }}>
                    
                    {/* Compact Interactive Quick Statistics */}
                    <div className="p-4 bg-[var(--surface-2)] border border-[var(--line)] rounded-2xl flex justify-around items-center gap-3">
                      <div className="text-center">
                        <span className="eyebrow block mb-0.5">Net Worth</span>
                        <span className="text-xs font-mono font-bold text-[var(--ink)] leading-none">
                          {state.currency}{aggregateActiveWealth.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                      <div className="w-px h-6 bg-[var(--line)]" />
                      <div className="text-center">
                        <span className="eyebrow block mb-0.5">Cashflow</span>
                        <span className={`text-xs mono font-bold leading-none ${(currentMonthInflow - currentMonthOutflow) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--danger)]'}`}>
                          {(currentMonthInflow - currentMonthOutflow) >= 0 ? '+' : ''}{state.currency}{(currentMonthInflow - currentMonthOutflow).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                      <div className="w-px h-6 bg-[var(--line)]" />
                      <div className="text-center">
                        <span className="eyebrow block mb-0.5">Savings Rate</span>
                        <span className="text-xs font-semibold mono text-[var(--ink)] leading-none">
                          {currentMonthInflow > 0 ? Math.round(((currentMonthInflow - currentMonthOutflow) / currentMonthInflow) * 100) : 0}%
                        </span>
                      </div>
                    </div>
                    
                    {/* Navigation list selection */}
                    <div className="space-y-1.5">
                      <span className="eyebrow block px-1 mb-2">Features & Views</span>
                      
                      <div className="grid grid-cols-2 gap-2.5">
                        {[
                          { tab: 'dashboard', icon: <LayoutDashboard size={15} className="text-amber-500" />, title: 'Dashboard', desc: 'Main indicators' },
                          { tab: 'accounts', icon: <Wallet size={15} className="text-blue-500" />, title: 'Wallets Port', desc: 'Manage assets' },
                          { tab: 'inflow_outflow', icon: <Plus size={15} className="text-emerald-500" />, title: 'Ledger Registry', desc: 'New entries' },
                          { tab: 'budgets', icon: <CheckSquare size={15} className="text-purple-500" />, title: 'Smart Budgets', desc: 'Expenses envelope' },
                          { tab: 'goals', icon: <CheckSquare size={15} className="text-rose-500" />, title: 'Savings Jars', desc: 'Track progress' },
                          { tab: 'debts', icon: <CircleDot size={15} className="text-orange-500" />, title: 'Track Liabilities', desc: 'Debts timeline' },
                          { tab: 'loans', icon: <ArrowUpRight size={15} className="text-teal-400" />, title: 'Track Loans', desc: 'Lent records' },
                          { tab: 'reports', icon: <TrendingUp size={15} className="text-indigo-400" />, title: 'Reports Centre', desc: 'Trend analyses' },
                        ].map((item) => {
                          const isActive = activeTab === item.tab;
                          return (
                            <button
                              key={item.tab}
                              onClick={() => {
                                setActiveTab(item.tab as any);
                                setIsMobileNavOpen(false);
                              }}
                              className={`p-3.5 rounded-2xl flex flex-col items-start gap-1.5 text-left border cursor-pointer transition-all ${
                                isActive
                                  ? 'bg-[var(--ink)] border-[var(--ink)] text-[var(--accent-fg)]'
                                  : 'bg-[var(--surface-2)] border-[var(--line)] text-[var(--ink)] hover:border-[var(--line-strong)]'
                              }`}
                            >
                              <div className="flex justify-between items-center w-full">
                                <span className={isActive ? 'text-[var(--accent-fg)]' : ''}>{item.icon}</span>
                                {isActive && <span className="w-1.5 h-1.5 bg-[var(--accent-fg)] rounded-full animate-pulse" />}
                              </div>
                              <div>
                                <span className="text-[11px] font-bold block">{item.title}</span>
                                <span className={`text-[8.5px] block ${isActive ? 'text-[var(--accent-fg)]/80 font-medium' : 'text-[var(--ink-2)]'}`}>{item.desc}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    
                    {/* Action controllers & theme preferences */}
                    <div className="space-y-1.5 pt-1.5 border-t border-[var(--line)]">
                      <span className="eyebrow block px-1 mb-2">Quick Controls</span>
                      
                      <div className="grid grid-cols-3 gap-2">
                        {/* Profile settings control */}
                        <button
                          onClick={() => {
                            setIsProfileOpen(true);
                            setIsMobileNavOpen(false);
                          }}
                          className="py-3 px-1.5 bg-[var(--surface-2)] border border-[var(--line)] text-[var(--ink)] rounded-[14px] flex flex-col items-center gap-1.5 hover:border-[var(--line-strong)] transition-all cursor-pointer text-center"
                        >
                          <User size={14} className="text-indigo-400" />
                          <span className="text-[9px] font-bold block">My Profile</span>
                        </button>
                        
                        {/* Database Sync config */}
                        <button
                          onClick={() => {
                            setIsSettingsOpen(true);
                            setIsMobileNavOpen(false);
                          }}
                          className="py-3 px-1.5 bg-[var(--surface-2)] border border-[var(--line)] text-[var(--ink)] rounded-[14px] flex flex-col items-center gap-1.5 hover:border-[var(--line-strong)] transition-all cursor-pointer text-center"
                        >
                          <Settings size={14} className="text-[var(--ink-2)]" />
                          <span className="text-[9px] font-bold block">Settings</span>
                        </button>
                        
                        {/* Notification Alerts Center */}
                        <button
                          onClick={() => {
                            setIsNotifOpen(true);
                            setIsMobileNavOpen(false);
                          }}
                          className="py-3 px-1.5 bg-[var(--surface-2)] border border-[var(--line)] text-[var(--ink)] rounded-[14px] flex flex-col items-center gap-1.5 hover:border-[var(--line-strong)] transition-all cursor-pointer text-center relative"
                        >
                          <Bell size={14} className="text-amber-400" />
                          <span className="text-[9px] font-bold block">Alerts</span>
                          {state.notifications.filter(n => !n.read).length > 0 && (
                            <span className="absolute top-2 right-4 w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                          )}
                        </button>
                      </div>
                    </div>
                    
                    {/* Device connectivity diagnostics tracker */}
                    <div className="pt-2 px-2 text-center">
                      <span className="eyebrow block">Secure device protocol active — owner mirror in sync</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Notification sheet slideover drawer */}
            <NotificationDrawer
              notifications={state.notifications}
              onMarkRead={handleMarkNotificationRead}
              onClear={handleClearNotification}
              isOpen={isNotifOpen}
              onClose={() => setIsNotifOpen(false)}
            />

            {/* System Settings overlay modal */}
            <SettingsModal
              state={state}
              userEmail={userEmail}
              updateState={updateState}
              exportStateAsJSON={exportStateAsJSON}
              handleJSONRestore={handleJSONRestore}
              isOpen={isSettingsOpen}
              onClose={() => setIsSettingsOpen(false)}
              onLogout={() => {
                handleLogout();
              }}
            />

        </section>

      </main>

      {editingTransactionId && (
        <TransactionEditModal
          transaction={state.transactions.find(t => t.id === editingTransactionId) || null}
          cashAccounts={state.cashAccounts}
          cards={state.cards}
          onClose={() => setEditingTransactionId(null)}
          onDelete={handleDeleteTransaction}
          onSave={handleEditTransaction}
          currency={state.currency}
        />
      )}

      {/* Global Command Palette System */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelectAction={(actionId) => {
          if (actionId === 'add-expense' || actionId === 'add-income') {
            setActiveTab('inflow_outflow');
          } else if (actionId === 'transfer-funds' || actionId === 'add-card') {
            setActiveTab('accounts');
          } else if (actionId === 'nav-dashboard') {
            setActiveTab('dashboard');
          } else if (actionId === 'nav-transactions') {
            setActiveTab('reports');
          } else if (actionId === 'nav-budgets') {
            setActiveTab('budgets');
          } else if (actionId === 'nav-reports') {
            setActiveTab('reports');
          }
        }}
      />

      {/* Mobile Bottom Navigation Bar */}
      <BottomNavigation
        activeTab={
          activeTab === 'accounts'
            ? 'wallets'
            : activeTab === 'inflow_outflow'
            ? 'transactions'
            : activeTab === 'reports'
            ? 'reports'
            : 'dashboard'
        }
        isMoreOpen={isMobileNavOpen}
        onTabChange={(tabId) => {
          setIsMobileNavOpen(false);
          if (tabId === 'home' || tabId === 'dashboard') setActiveTab('dashboard');
          else if (tabId === 'wallets') setActiveTab('accounts');
          else if (tabId === 'transactions') setActiveTab('inflow_outflow');
          else if (tabId === 'reports') setActiveTab('reports');
        }}
        onMoreClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
        onQuickActionClick={() => setIsCommandPaletteOpen(true)}
      />

      {/* 3. WORKSPACE FOOTER CORE STATUS */}
        <footer className="bg-[var(--surface)] border-t border-[var(--line)] px-6 py-3.5 z-10 flex flex-col md:flex-row justify-between items-center text-[11px] text-[var(--ink-2)] mono gap-3">
        <div className="flex items-center gap-2">
          <CircleDot size={12} className="text-emerald-400 animate-pulse" />
          <span>Local database mirror synchronized fully.</span>
        </div>
        <div className="flex gap-4">
          <span>© 2026 — Designed & Developed by <a href="https://emalyaditha.com/" target="_blank" rel="noopener noreferrer" className="text-[var(--ink)] hover:underline transition-colors">Emal Yaditha</a>. All rights reserved.</span>
        </div>
      </footer>

      </div> {/* End of content wrapper canvas area */}
    </div>
  );
}
