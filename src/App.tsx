import React, { useState, useEffect } from 'react';
import { AppState, CashAccount, BankCard, Income, Expense, Debt, Transaction, AppNotification, CategoryIncome, CategoryExpense, CreditCard as DbCreditCard, CreditCardPurchase, Subscription, LoanGiven, LoanSettlement } from './types';
import { DEFAULT_APP_STATE } from './initialData';
import { exportStateAsJSON } from './utils';
import { 
  Plus, Search, Bell, CreditCard, Wallet, Percent, ChevronRight, 
  TrendingUp, User, Lock, Unlock, Settings, HelpCircle, RefreshCw, 
  FileDown, Share2, Landmark, ShieldAlert, ArrowUpRight, ArrowDownLeft,
  DollarSign, CircleDot, Database, CheckSquare, Zap, BadgeCheck, AlertCircle,
  Cloud, CloudOff, ArrowRightLeft, Sun, Moon, Menu
} from 'lucide-react';

import EmailLogin from './components/EmailLogin';
import NotificationDrawer from './components/NotificationDrawer';
import CashCardManagement from './components/CashCardManagement';
import InflowsOutflows from './components/InflowsOutflows';
import SubscriptionManagement from './components/SubscriptionManagement';
import Dashboard from './components/Dashboard';
import ProfileSection from './components/ProfileSection';
import DebtTracker from './components/DebtTracker';
import LoansTracker from './components/LoansTracker';
import TransferFunds from './components/TransferFunds';
import CreditCardManagement from './components/CreditCardManagement';
import ReportsCentre from './components/ReportsCentre';
import SettingsModal from './components/SettingsModal';
import TransactionEditModal from './components/TransactionEditModal';
import BudgetsSection from './components/BudgetsSection';
import GoalsSection from './components/GoalsSection';
import { CategorySpreadAnalysis } from './components/Charts';
import { getSupabaseConfig, syncStateToSupabase, syncStateFromSupabase, forceCancelCardInSupabase, resetLoadedFromCloud } from './supabase';
import { useNotifications } from './context/NotificationContext';
import { useTheme } from './context/ThemeContext';
import { EXPENSE_COLORS } from './utils';

export default function App() {
  const { showConfirm, showToast } = useNotifications();
  const { theme, toggleTheme } = useTheme();
  // 1. Core State
  const [state, setState] = useState<AppState>(DEFAULT_APP_STATE);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'accounts' | 'inflow_outflow' | 'budgets' | 'goals' | 'debts' | 'loans' | 'reports'>('dashboard');
  const [isNavCollapsed, setIsNavCollapsed] = useState(false);
  
  // Modals & Panels Toggles
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [newPinCode, setNewPinCode] = useState('');
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  // Supabase real-time status tracker
  const [realtimeSyncStatus, setRealtimeSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error' | 'disabled'>('idle');
  const [realtimeSyncError, setRealtimeSyncError] = useState<string | null>(null);

  // States for Unified search & filters on history
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterAccount, setFilterAccount] = useState<string>('all');

  const migrateStateCards = (loadedState: AppState): AppState => {
    if (!loadedState || !loadedState.cards) return loadedState;
    const migratedCards = loadedState.cards.map(card => {
      if (card.cardType === 'Credit' && card.currentBalance > 0) {
        console.log(`MIGRATION: Auto-healing credit card "${card.cardName}" with positive balance ${card.currentBalance} to negative balance ${-card.currentBalance}`);
        return {
          ...card,
          currentBalance: -card.currentBalance
        };
      }
      return card;
    });
    return {
      ...loadedState,
      cards: migratedCards
    };
  };

  // Verify remembered device on mount
  useEffect(() => {
    const verifyDevice = async () => {
      // Load system-provided environments on mount ONLY if not already customized by user in localStorage
      try {
        const urlOverride = localStorage.getItem('cashflow_supabase_url_v1');
        const keyOverride = localStorage.getItem('cashflow_supabase_key_v1');
        if (!urlOverride || !keyOverride) {
          const confResp = await fetch('/api/config');
          if (confResp.ok) {
            const confData = await confResp.json();
            if (confData.supabaseUrl && confData.supabaseKey) {
              localStorage.setItem('cashflow_supabase_url_v1', confData.supabaseUrl);
              localStorage.setItem('cashflow_supabase_key_v1', confData.supabaseKey);
            }
          }
        }
      } catch (err) {
        console.warn("Failed retrieving dynamic server environments:", err);
      }

      const email = localStorage.getItem('auth_user_email');
      const token = localStorage.getItem('auth_session_token');
      
      if (email && token) {
        setUserEmail(email);
        try {
          const result = await syncStateFromSupabase(email);
          if (result.success && result.state) {
            setState(migrateStateCards(result.state));
            setIsUnlocked(true);
          } else {
            console.warn("Could not sync from database, allowing offline fallback mode:", result.error);
            setIsUnlocked(true);
          }
        } catch (err) {
          console.warn("Fatal error syncing from database, continuing offline...", err);
          setIsUnlocked(true);
        }
      } else {
        setIsUnlocked(false);
      }
      setIsCheckingAuth(false);
    };

    verifyDevice();
  }, []);

  // Synchronize state with Storage whenever it edits
  const updateState = (updater: (prev: AppState) => AppState) => {
    setState(oldState => {
      const nextState = updater(oldState);
      const sanitizedTransactions = nextState.transactions.map((t): Transaction => {
        if (t.type === 'income') {
          const tCategoryLower = (t.category || '').toLowerCase().trim();
          const tTitleLower = (t.title || '').toLowerCase().trim();
          const isRefDebt = t.referenceId && (t.referenceId.startsWith('debt-') || t.referenceId.startsWith('inc_debt') || t.referenceId.startsWith('tx_debt'));
          
          const isLendingFinancing = 
            tCategoryLower.includes('borrow') || 
            tCategoryLower.includes('financing') || 
            tCategoryLower.includes('loan') || 
            tCategoryLower.includes('debt') ||
            tTitleLower.includes('borrowed') || 
            tTitleLower.includes('loan received') || 
            tTitleLower.includes('cash advance') ||
            isRefDebt;
            
          if (isLendingFinancing) {
            return {
              ...t,
              type: 'financing'
            };
          }
        }
        return t;
      });
      return {
        ...nextState,
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
  }, [state, isSettingsOpen, isUnlocked, userEmail]);

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

      let finalCashAccounts = [...prev.cashAccounts];
      if (cashAccountId) {
        const account = finalCashAccounts.find(a => a.id === cashAccountId);
        if (account) {
          const factor = amount > 0 ? -1 : 1; // saving (amount > 0) decrements wallet, withdrawing (amount < 0) increments wallet
          const absAmount = Math.abs(amount);
          if (factor < 0 && account.balance < absAmount) {
            showToast('Insufficient wallet reserves for allocation transfer', 'error');
            return prev;
          }
          account.balance += (absAmount * factor);
        }
      }

      const updatedGoals = (prev.savingsGoals || []).map(g => {
        if (g.id === id) {
          const newCurrent = Math.max(0, g.current + amount);
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
    const incomeId = `inc-${Date.now()}`;
    const transactionId = `trans-${Date.now()}`;

    const newIncome: Income = {
      id: incomeId,
      amount,
      date,
      source,
      category,
      targetAccountId,
      targetType,
    };

    updateState(prev => {
      // 1. Increment target account balances
      let updatedCash = [...prev.cashAccounts];
      let updatedCards = [...prev.cards];

      if (targetType === 'cash') {
        updatedCash = updatedCash.map(c => 
          c.id === targetAccountId ? { ...c, balance: c.balance + amount } : c
        );
      } else {
        updatedCards = updatedCards.map(c => 
          c.id === targetAccountId ? { ...c, currentBalance: c.currentBalance + amount } : c
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
      };

      // 3. Optional balance threshold triggers
      const newNotif: AppNotification = {
        id: `nt-${Date.now()}`,
        type: 'system',
        message: `Ledger balanced: Income of ${prev.currency} ${amount.toLocaleString()} credited to ${nameOfTarget}.`,
        date: new Date().toISOString().split('T')[0],
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
    paymentMethodType: 'cash' | 'card'
  ) => {
    const expenseId = `exp-${Date.now()}`;
    const transactionId = `trans-${Date.now()}`;

    const newExpense: Expense = {
      id: expenseId,
      title,
      description,
      amount,
      date,
      category,
      paymentMethodId,
      paymentMethodType,
    };

    updateState(prev => {
      // 1. Deduct target account balances
      let updatedCash = [...prev.cashAccounts];
      let updatedCards = [...prev.cards];
      let newAlertNotifications: AppNotification[] = [];

      if (paymentMethodType === 'cash') {
        updatedCash = updatedCash.map(c => {
          if (c.id === paymentMethodId) {
            const nextVal = c.balance - amount;
            if (nextVal < 5000) {
              newAlertNotifications.push({
                id: `nt-alert-${Date.now()}`,
                type: 'alert',
                message: `Low balance alert! ${c.name} is critically low: ${prev.currency} ${nextVal.toLocaleString()}`,
                date: new Date().toISOString().split('T')[0],
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
            const nextVal = c.currentBalance - amount;
            
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
                date: new Date().toISOString().split('T')[0],
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
      };

      return {
        ...prev,
        expenses: [...prev.expenses, newExpense],
        cashAccounts: updatedCash,
        cards: updatedCards,
        transactions: [newTransaction, ...prev.transactions],
        notifications: [...newAlertNotifications, ...prev.notifications],
      };
    });
  };

  // Rule: Debt Registered
  const handleAddDebt = (debtData: Omit<Debt, 'id' | 'payments' | 'remainingAmount'>) => {
    const debtId = `debt-${Date.now()}`;
    const newDebt: Debt = {
      ...debtData,
      id: debtId,
      remainingAmount: debtData.totalAmount,
      payments: [],
      status: debtData.totalAmount === 0 ? 'Fully Repaid' : 'Active',
    };

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
          date: new Date().toISOString().split('T')[0],
          category: 'Other',
          accountId: debtData.accountId,
          accountType: debtData.accountType,
          referenceId: debtId,
        };
        newTransactions.unshift(newTx);
      }

      const newNotif: AppNotification = {
        id: `nt-${Date.now()}`,
        type: 'reminder',
        message: `Debt due alert set! Repay principal Rs. ${debtData.totalAmount.toLocaleString()} to ${debtData.debtSource} before ${debtData.dueDate}.`,
        date: new Date().toISOString().split('T')[0],
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
        date: new Date().toISOString().split('T')[0],
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
  const handleAddLoan = (loanData: Omit<LoanGiven, 'id' | 'remainingAmount' | 'status' | 'settlements'>) => {
    const loanId = `loan_given_${Date.now()}`;
    const newLoan: LoanGiven = {
      ...loanData,
      id: loanId,
      remainingAmount: loanData.totalAmount,
      status: 'Active',
      settlements: [],
    };

    updateState(prev => {
      // 1. Deduct funds from selected account
      let updatedCash = [...prev.cashAccounts];
      let updatedCards = [...prev.cards];

      if (loanData.sourceAccountType === 'cash') {
        updatedCash = updatedCash.map(c =>
          c.id === loanData.sourceAccountId ? { ...c, balance: c.balance - loanData.totalAmount } : c
        );
      } else {
        updatedCards = updatedCards.map(c =>
          c.id === loanData.sourceAccountId ? { ...c, currentBalance: c.currentBalance - loanData.totalAmount } : c
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
      };

      // 4. Notification
      const newNotif: AppNotification = {
        id: `nt_loan_${Date.now()}`,
        type: 'system',
        message: `Registered loan given to ${loanData.borrowerName}: model tracks Rs. ${loanData.totalAmount.toLocaleString()} receivable.`,
        date: new Date().toISOString().split('T')[0],
        read: false,
      };

      return {
        ...prev,
        cashAccounts: updatedCash,
        cards: updatedCards,
        loansGiven: [...(prev.loansGiven || []), newLoan],
        transactions: [newTx, ...prev.transactions],
        expenses: [newExp, ...prev.expenses],
        notifications: [newNotif, ...prev.notifications],
      };
    });
  };

  const handleMakeLoanSettlement = (
    loanId: string,
    amount: number,
    receivedInId: string,
    receivedInType: 'cash' | 'card',
    receivedInName: string
  ) => {
    const settlementId = `setl_${Date.now()}`;
    const settlementDate = new Date().toISOString().split('T')[0];

    updateState(prev => {
      // Find the loan item to capture borrower info
      const targetLoan = (prev.loansGiven || []).find(l => l.id === loanId);
      if (!targetLoan) return prev;

      // 1. Credit the received account
      let updatedCash = [...prev.cashAccounts];
      let updatedCards = [...prev.cards];

      if (receivedInType === 'cash') {
        updatedCash = updatedCash.map(c =>
          c.id === receivedInId ? { ...c, balance: c.balance + amount } : c
        );
      } else {
        updatedCards = updatedCards.map(c =>
          c.id === receivedInId ? { ...c, currentBalance: c.currentBalance + amount } : c
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
      };

      // 5. Notification
      const newNotif: AppNotification = {
        id: `nt_setl_${Date.now()}`,
        type: 'system',
        message: `Processed loan settlement installment of Rs. ${amount.toLocaleString()} from ${targetLoan.borrowerName}, credited to ${receivedInName}.`,
        date: settlementDate,
        read: false,
      };

      return {
        ...prev,
        cashAccounts: updatedCash,
        cards: updatedCards,
        loansGiven: updatedLoans,
        transactions: [newTx, ...prev.transactions],
        incomes: [newInc, ...prev.incomes],
        notifications: [newNotif, ...prev.notifications],
      };
    });
  };

  const handleDeleteLoan = (loanId: string) => {
    updateState(prev => {
      const loanToDelete = (prev.loansGiven || []).find(l => l.id === loanId);
      if (!loanToDelete) return prev;

      // 1. Refund the deducted funds
      let updatedCash = [...prev.cashAccounts];
      let updatedCards = [...prev.cards];

      if (loanToDelete.sourceAccountType === 'cash') {
        updatedCash = updatedCash.map(c =>
          c.id === loanToDelete.sourceAccountId ? { ...c, balance: c.balance + loanToDelete.totalAmount } : c
        );
      } else {
        updatedCards = updatedCards.map(c =>
          c.id === loanToDelete.sourceAccountId ? { ...c, currentBalance: c.currentBalance + loanToDelete.totalAmount } : c
        );
      }

      // 2. Add an audit transaction record
      const refundTransaction: Transaction = {
        id: `trans-refund-${Date.now()}`,
        type: 'deposit',
        title: `Loan Refund: ${loanToDelete.borrowerName}`,
        amount: loanToDelete.totalAmount,
        date: new Date().toISOString().split('T')[0],
        category: 'Loan Refund',
        accountId: loanToDelete.sourceAccountId,
        accountType: loanToDelete.sourceAccountType,
        referenceId: loanId,
      };

      // 3. Optional: Remove associated transaction/expense if needed (for now just refund)
      return {
        ...prev,
        cashAccounts: updatedCash,
        cards: updatedCards,
        loansGiven: (prev.loansGiven || []).filter(l => l.id !== loanId),
        transactions: [refundTransaction, ...prev.transactions],
        // Note: We might want to remove the transaction here too, but the user didn't explicitly ask for that. Simple refund first.
      };
    });
  };

  const handleIncreaseLoan = (
    loanId: string,
    amount: number,
    sourceAccountId: string,
    sourceAccountType: 'cash' | 'card',
    sourceAccountName: string,
    notes?: string
  ) => {
    updateState(prev => {
      // Find the loan item to capture borrower info
      const targetLoan = (prev.loansGiven || []).find(l => l.id === loanId);
      if (!targetLoan) return prev;

      // 1. Deduct funds from selected account
      let updatedCash = [...prev.cashAccounts];
      let updatedCards = [...prev.cards];

      if (sourceAccountType === 'cash') {
        updatedCash = updatedCash.map(c =>
          c.id === sourceAccountId ? { ...c, balance: c.balance - amount } : c
        );
      } else {
        updatedCards = updatedCards.map(c =>
          c.id === sourceAccountId ? { ...c, currentBalance: c.currentBalance - amount } : c
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
      const txId = `tx_loan_add_${Date.now()}`;
      const newTx: Transaction = {
        id: txId,
        type: 'expense',
        title: `Lent More: ${targetLoan.borrowerName}`,
        amount: amount,
        date: new Date().toISOString().split('T')[0],
        category: 'Loan',
        accountId: sourceAccountId,
        accountType: sourceAccountType,
        referenceId: loanId,
      };

      // 4. Create Expense entry
      const newExp: Expense = {
        id: `exp_loan_add_${Date.now()}`,
        title: `Lent More to ${targetLoan.borrowerName}`,
        description: `Lent additional capital. Notes: ${notes || 'Added principal'}`,
        amount: amount,
        date: new Date().toISOString().split('T')[0],
        category: 'Loan',
        paymentMethodId: sourceAccountId,
        paymentMethodType: sourceAccountType,
      };

      // 5. Notification
      const newNotif: AppNotification = {
        id: `nt_loan_add_${Date.now()}`,
        type: 'system',
        message: `Dispatched additional Rs. ${amount.toLocaleString()} to ${targetLoan.borrowerName} under existing loan agreement.`,
        date: new Date().toISOString().split('T')[0],
        read: false,
      };

      return {
        ...prev,
        cashAccounts: updatedCash,
        cards: updatedCards,
        loansGiven: updatedLoans,
        transactions: [newTx, ...prev.transactions],
        expenses: [newExp, ...prev.expenses],
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
      id: `sub-${Date.now()}`,
    };
    updateState(prev => ({
      ...prev,
      subscriptions: [...(prev.subscriptions || []), newSub],
    }));
  };

  const handleDeleteSubscription = (id: string) => {
    updateState(prev => {
      const subToDelete = (prev.subscriptions || []).find(s => s.id === id);
      if (!subToDelete) return prev;

      const auditTransaction: Transaction = {
        id: `trans-sub-del-${Date.now()}`,
        type: 'expense',
        title: `Subscription Cancelled: ${subToDelete.name}`,
        amount: 0,
        date: new Date().toISOString().split('T')[0],
        category: 'Subscription Deletion',
        referenceId: id,
      };

      return {
        ...prev,
        subscriptions: (prev.subscriptions || []).filter(sub => sub.id !== id),
        transactions: [auditTransaction, ...prev.transactions],
      };
    });
  };

  const handleToggleSubscriptionStatus = (id: string, currentStatus: 'Active' | 'Paused' | 'Cancelled') => {
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
    paymentDate: string
  ) => {
    updateState(prev => {
      const sub = (prev.subscriptions || []).find(s => s.id === subId);
      if (!sub) return prev;

      // Deduct TARGET card/cash balances
      let updatedCash = [...prev.cashAccounts];
      let updatedCards = [...prev.cards];
      let newAlertNotifications: AppNotification[] = [];

      let accountName = '';
      if (accountType === 'cash') {
        updatedCash = updatedCash.map(c => {
          if (c.id === accountId) {
            accountName = c.name;
            const nextVal = c.balance - sub.amount;
            if (nextVal < 5000) {
              newAlertNotifications.push({
                id: `nt-alert-${Date.now()}`,
                type: 'alert',
                message: `Low balance alert! ${c.name} is critically low: ${prev.currency} ${nextVal.toLocaleString()}`,
                date: new Date().toISOString().split('T')[0],
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
            const nextVal = c.currentBalance - sub.amount;
            if (nextVal < 10000) {
              newAlertNotifications.push({
                id: `nt-alert-${Date.now()}`,
                type: 'alert',
                message: `Low balance alert! Card ${c.cardName} balance is low: ${prev.currency} ${nextVal.toLocaleString()}`,
                date: new Date().toISOString().split('T')[0],
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
      };

      // Add a nice confirmation system notification
      const systemNotif: AppNotification = {
        id: `nt-sys-${Date.now()}`,
        type: 'system',
        message: `Subscription paid: ${sub.name} is settled (${prev.currency} ${sub.amount.toLocaleString()}). Next due: ${nextDueDateStr}.`,
        date: new Date().toISOString().split('T')[0],
        read: false,
      };

      return {
        ...prev,
        subscriptions: updatedSubscriptions,
        expenses: [...prev.expenses, newExpense],
        cashAccounts: updatedCash,
        cards: updatedCards,
        transactions: [newTransaction, ...prev.transactions],
        notifications: [systemNotif, ...newAlertNotifications, ...prev.notifications],
      };
    });
  };

  const handleAddCreditCardPurchase = (purchase: Omit<CreditCardPurchase, 'id'>) => {
    updateState(prev => {
        const updatedCards = prev.cards.map(c => c.id === purchase.cardId ? { ...c, currentBalance: c.currentBalance - purchase.amount } : c);
        
        const newTransaction: Transaction = {
          id: `trans-${Date.now()}`,
          type: 'expense',
          title: `Credit Card Purchase: ${purchase.description}`,
          amount: purchase.amount,
          date: purchase.date,
          category: 'Shopping', // Default category
          accountId: purchase.cardId,
          accountType: 'card',
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
      let overpaymentMsg = '';
      updateState(prev => {
          let updatedCash = prev.cashAccounts.map(c => 
            (fromType === 'cash' && c.id === fromId) ? { ...c, balance: c.balance - amount } : c
          );
          
          let updatedCards = prev.cards.map(c => {
            let cBal = c.currentBalance;
            if (fromType === 'card' && c.id === fromId) {
                cBal -= amount; // We paid using this card, so its balance decreases (debt increases)
            }
            if (c.id === cardId) {
                const outstanding = c.currentBalance < 0 ? Math.abs(c.currentBalance) : 0;
                if (amount > outstanding) {
                    overpaymentMsg = `Note: Payment of ${prev.currency}${amount.toLocaleString()} exceeds outstanding debt of ${prev.currency}${outstanding.toLocaleString()}, resulting in a positive credit balance of ${prev.currency}${(amount - outstanding).toLocaleString()}.`;
                }
                cBal += amount; // We paid off this card, so its balance increases (debt decreases)
            }
            return { ...c, currentBalance: cBal };
          });
          
          const targetCard = prev.cards.find(c => c.id === cardId);
          const newTransaction: Transaction = {
            id: `trans-${Date.now()}`,
            type: 'debt_payment',
            title: `Credit Card Settlement: ${targetCard?.cardName || 'Card'}`,
            amount: amount,
            date: new Date().toISOString().split('T')[0],
            category: 'Debt Repayment',
            accountId: fromId,
            accountType: fromType,
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

      let updatedDebt = { 
        ...debt, 
        totalAmount: Number(debt.totalAmount || 0) + Number(amount || 0),
        remainingAmount: Number(debt.remainingAmount || 0) + Number(amount || 0),
        status: (Number(debt.remainingAmount || 0) + Number(amount || 0)) > 0 ? 'Active' : debt.status
      };

      if (newAccountId && newAccountType && !debt.accountId) {
        updatedDebt.accountId = newAccountId;
        updatedDebt.accountType = newAccountType;
        updatedDebt.accountName = newAccountType === 'cash' 
          ? prev.cashAccounts.find(c => c.id === newAccountId)?.name 
          : prev.cards.find(c => c.id === newAccountId)?.bankName;
      }

      let updatedCash = [...prev.cashAccounts];
      let updatedCards = [...prev.cards];
      const newTransactions = [...prev.transactions];

      if (updatedDebt.accountId && updatedDebt.accountType) {
        if (updatedDebt.accountType === 'cash') {
          updatedCash = updatedCash.map(c =>
            c.id === updatedDebt.accountId ? { ...c, balance: Number(c.balance) + Number(amount) } : c
          );
        } else {
          updatedCards = updatedCards.map(c =>
            c.id === updatedDebt.accountId ? { ...c, currentBalance: Number(c.currentBalance) + Number(amount) } : c
          );
        }

        // Add transaction for additional borrowed liability funds
        const txId = `tx_debt_inc_${Date.now()}`;
        const newTx: Transaction = {
          id: txId,
          type: 'financing',
          title: `Borrowed More: ${updatedDebt.debtSource}`,
          amount: amount,
          date: new Date().toISOString().split('T')[0],
          category: 'Other',
          accountId: updatedDebt.accountId,
          accountType: updatedDebt.accountType,
          referenceId: debtId,
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
    paidFromType: 'cash' | 'card'
  ) => {
    const paymentId = `dp-${Date.now()}`;
    const transactionId = `trans-${Date.now()}`;
    const paymentDate = new Date().toISOString().split('T')[0];

    updateState(prev => {
      // 1. Deduct principal accounts
      let updatedCash = [...prev.cashAccounts];
      let updatedCards = [...prev.cards];

      if (paidFromType === 'cash') {
        updatedCash = updatedCash.map(c => 
          c.id === paidFromId ? { ...c, balance: c.balance - amount } : c
        );
      } else {
        updatedCards = updatedCards.map(c => 
          c.id === paidFromId ? { ...c, currentBalance: c.currentBalance - amount } : c
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
      };

      const systemAlert: AppNotification = {
        id: `nt-${Date.now()}`,
        type: 'system',
        message: `Settle Repayment: Reduced loan from ${matchedDebt?.debtSource} by Rs. ${amount.toLocaleString()}.`,
        date: paymentDate,
        read: false,
      };

      return {
        ...prev,
        cashAccounts: updatedCash,
        cards: updatedCards,
        debts: updatedDebts,
        transactions: [newTransaction, ...prev.transactions],
        notifications: [systemAlert, ...prev.notifications],
      };
    });
  };

  // Core cash account list modifiers
  const handleAddCashAccount = (name: string, balance: number) => {
    const newAcct: CashAccount = {
      id: `cash-${Date.now()}`,
      name,
      balance,
    };
    updateState(prev => ({
      ...prev,
      cashAccounts: [...prev.cashAccounts, newAcct],
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
        updatedTrans = [{
          id: `trans-adjust-${Date.now()}`,
          type: delta > 0 ? 'deposit' : 'withdrawal',
          title: `Balance adjustment: ${match?.name || 'Cash'}`,
          amount: Math.abs(delta),
          date: new Date().toISOString().split('T')[0],
          category: 'Adjustment',
          accountId: id,
          accountType: 'cash',
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
      id: `card-${Date.now()}`,
    };
    updateState(prev => ({
      ...prev,
      cards: [...prev.cards, rawCard],
    }));
  };

  const handleDeleteCard = (idToDelete: string) => {
    console.log(`DEBUG: Soft-canceling card with id: "${idToDelete}"`);
    
    // Explicit guaranteed database override for this critical action
    if (userEmail) forceCancelCardInSupabase(userEmail, idToDelete);

    updateState(prev => {
      const updatedCards = prev.cards.map(card => {
        if (String(card.id) === String(idToDelete)) {
          console.log("DEBUG: Matching card found inside mapped state, setting isCanceled to true", card);
          return { ...card, isCanceled: true };
        }
        return card;
      });
      return {
        ...prev,
        cards: updatedCards,
      };
    });
  };

  const handleDeleteCashAccount = (id: string) => {
    updateState(prev => {
      const accountToDelete = prev.cashAccounts.find(c => c.id === id);
      if (accountToDelete && accountToDelete.balance !== 0) {
        showToast('error', `Cannot delete account "${accountToDelete.name}" with balance ${prev.currency} ${accountToDelete.balance.toLocaleString()}. Please clear funds first.`);
        return prev;
      }
      
      if (!accountToDelete) return prev;
      
      const auditTransaction: Transaction = {
        id: `trans-cash-del-${Date.now()}`,
        type: 'expense',
        title: `Cash Account Deleted: ${accountToDelete.name}`,
        amount: 0,
        date: new Date().toISOString().split('T')[0],
        category: 'Account Deletion',
        referenceId: id,
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

      const auditTransaction: Transaction = {
        id: `trans-del-${Date.now()}`,
        type: 'expense',
        title: `Transaction Deleted: ${tx.title}`,
        amount: 0,
        date: new Date().toISOString().split('T')[0],
        category: 'Transaction Deletion',
        referenceId: txId,
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
        updatedCash = updatedCash.map(c => c.id === fromId ? { ...c, balance: c.balance - amount - charge } : c);
      } else {
        updatedCards = updatedCards.map(c => c.id === fromId ? { ...c, currentBalance: c.currentBalance - amount - charge } : c);
      }

      // Add to destination
      if (toType === 'cash') {
        updatedCash = updatedCash.map(c => c.id === toId ? { ...c, balance: c.balance + amount } : c);
      } else {
        updatedCards = updatedCards.map(c => c.id === toId ? { ...c, currentBalance: c.currentBalance + amount } : c);
      }

      // 3. Transactions
      const fromName = fromType === 'cash' ? prev.cashAccounts.find(x => x.id === fromId)?.name || 'Cash' : prev.cards.find(x => x.id === fromId)?.cardName || 'Bank Card';
      const toName = toType === 'cash' ? prev.cashAccounts.find(x => x.id === toId)?.name || 'Cash' : prev.cards.find(x => x.id === toId)?.cardName || 'Bank Card';

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

      let updatedIncomes = [...prev.incomes];
      let updatedExpenses = [...prev.expenses];
      let updatedDebts = [...prev.debts];

      if (tx.type === 'income') {
      } else if (tx.type === 'expense') {
        updatedExpenses = updatedExpenses.map(e => e.id === tx.referenceId ? {
          ...e, amount: newData.amount, title: newData.title, date: newData.date, category: newData.category,
          paymentMethodId: newData.accountId, paymentMethodType: newData.accountType
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
              payments: d.payments.map(p => p.id === tx.referenceId ? { 
                ...p, amount: newData.amount, date: newData.date, paidFromId: newData.accountId, paidFromType: newData.accountType 
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
          ...newData
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

  const totalCashAmount = state.cashAccounts.reduce((sum, c) => sum + c.balance, 0);
  const totalDebitCardsAmount = state.cards.filter(c => !c.isCanceled && c.cardType === 'Debit').reduce((sum, c) => sum + (c.currentBalance - (Number(c.lockedAmount) || 0)), 0);
  const totalCreditCardsDebt = state.cards.filter(c => !c.isCanceled && c.cardType === 'Credit').reduce((sum, c) => sum + (c.currentBalance < 0 ? Math.abs(c.currentBalance) : 0), 0);
  const totalCreditCardsAsset = state.cards.filter(c => !c.isCanceled && c.cardType === 'Credit').reduce((sum, c) => sum + (c.currentBalance > 0 ? c.currentBalance : 0), 0);
  const totalCreditCardsAmount = totalCreditCardsDebt;
  const totalDebtsAmount = state.debts.reduce((sum, d) => sum + d.remainingAmount, 0);
  const totalLoansGiven = (state.loansGiven || []).reduce((sum, l) => sum + l.totalAmount, 0);
  const aggregateActiveWealth = totalCashAmount + totalDebitCardsAmount + totalCreditCardsAsset - totalCreditCardsAmount - totalDebtsAmount + totalLoansGiven;

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
      const dateCompare = b.date.localeCompare(a.date);
      if (dateCompare !== 0) return dateCompare;
      const aNum = parseInt(a.id.replace(/\D/g, ''), 10);
      const bNum = parseInt(b.id.replace(/\D/g, ''), 10);
      if (!isNaN(aNum) && !isNaN(bNum)) return bNum - aNum;
      return b.id.localeCompare(a.id);
    });

  // Render loading state while validating device identity
  if (isCheckingAuth) {
    return (
      <div id="auth-loading-screen" className="min-h-screen bg-[#050505] text-white flex flex-col justify-center items-center p-6 font-mono select-none">
        <div className="flex flex-col items-center gap-4 text-center animate-pulse">
          <div className="w-12 h-12 bg-zinc-950/80 border border-zinc-800 rounded-2xl flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-zinc-700 rounded-full border-t-blue-400 animate-spin" />
          </div>
          <div>
            <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">Secure Connection</span>
            <p className="text-zinc-500 text-[10px] mt-1.5">Checking trusted owner device...</p>
          </div>
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
    <div id="full-workspace-view" className="min-h-screen bg-[#050505] text-white flex flex-col justify-between font-sans selection:bg-white selection:text-black antialiased">
      
      {/* 1. TOP HEADER BRAND RAIL */}
      <header className="px-6 py-4 bg-[var(--bg-sidebar)] border-b border-[var(--border-primary)] flex justify-between items-center z-20" id="header-brand-rail">
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 100 100" className="w-9 h-9 shrink-0 select-none animate-fade-in" fill="none" xmlns="http://www.w3.org/2000/svg" id="em-logo">
            <rect width="100" height="100" rx="22" fill="black" stroke="#27272a" strokeWidth="4px" />
            <path d="M 34 22 C 26 22, 22 26, 22 34 L 22 44 C 22 48, 18 50, 14 50 C 18 50, 22 52, 22 56 L 22 66 C 22 74, 26 78, 34 78" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <path d="M 66 22 C 74 22, 78 26, 78 34 L 78 44 C 78 48, 82 50, 86 50 C 82 50, 78 52, 78 56 L 78 66 C 78 74, 74 78, 66 78" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <text x="50" y="58" fill="white" fontSize="22" fontWeight="900" fontFamily='"Inter", ui-sans-serif, system-ui, sans-serif' textAnchor="middle" letterSpacing="-0.02em">
              EM
            </text>
          </svg>
          <div>
            <h1 className="text-sm font-black tracking-tight text-[var(--text-primary)] uppercase flex items-center gap-1.5 leading-none">
              EM Budget
            </h1>
            <p className="text-[9px] text-[var(--text-secondary)] font-mono mt-1">Owner Device Secured</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Supabase Sync Badge Indicator */}
          {realtimeSyncStatus === 'syncing' && (
            <div className="px-2.5 py-1.5 rounded-lg border border-amber-900/60 bg-amber-950/20 text-amber-400 text-[10px] font-bold flex items-center gap-1.5 font-mono">
              <RefreshCw size={11} className="animate-spin" />
              <span>SYNCING...</span>
            </div>
          )}

          {realtimeSyncStatus === 'synced' && (
            <div className="px-2.5 py-1.5 rounded-lg border border-[var(--accent-primary)]/20 border-[var(--accent-primary)]/50 text-[var(--accent-primary)] text-[10px] font-bold flex items-center gap-1.5 font-mono">
              <Cloud size={11} />
              <span>CLOUD SYNCED</span>
            </div>
          )}

          {realtimeSyncStatus === 'error' && (
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="px-2.5 py-1.5 rounded-lg border border-red-900/60 bg-red-950/15 text-red-400 text-[10px] font-bold flex items-center gap-1.5 font-mono hover:bg-red-950/30 transition-all cursor-pointer"
              title={`Sync Error: ${realtimeSyncError || 'Details in Settings.'}`}
            >
              <CloudOff size={11} className="animate-pulse text-red-400" />
              <span>SYNC ERROR</span>
            </button>
          )}

          {realtimeSyncStatus === 'disabled' && (
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="px-2.5 py-1.5 rounded-lg border border-zinc-800 bg-zinc-950/40 text-zinc-400 text-[10px] font-bold flex items-center gap-1.5 font-mono hover:text-white hover:border-zinc-700 transition-all cursor-pointer"
              title="Cloud Synchronization is disabled or off. Click to configure."
            >
              <Database size={11} />
              <span>CLOUD: MANUAL</span>
            </button>
          )}

          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 hover:text-white hover:border-zinc-500 transition-all cursor-pointer flex items-center justify-center shrink-0"
            title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
            aria-label="Toggle theme"
            id="theme-toggle"
          >
            {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
          </button>

          {/* Profile Mark */}
          <button
            onClick={() => setIsProfileOpen(true)}
            className="w-8 h-8 rounded-full bg-[var(--accent-primary)] flex items-center justify-center text-white font-bold hover:bg-[var(--accent-primary)]/90 transition-all cursor-pointer"
            title="Profile"
            id="header-profile-trigger"
          >
            {state.userProfile?.name?.charAt(0) || 'U'}
          </button>
        </div>
      </header>

      {/* Profile Modal */}
      {isProfileOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setIsProfileOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm">
            <ProfileSection 
              state={state} 
              updateState={updateState}
              onOpenSettings={() => { setIsProfileOpen(false); setIsSettingsOpen(true); }}
              onLogout={() => {
                localStorage.removeItem('auth_user_email');
                localStorage.removeItem('auth_session_token');
                localStorage.removeItem('auth_device_token');
                resetLoadedFromCloud();
                setState(DEFAULT_APP_STATE);
                setIsUnlocked(false);
                setIsProfileOpen(false);
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
            // Always store session secure token and email for the duration of current session context
            localStorage.setItem('auth_user_email', email);
            localStorage.setItem('auth_session_token', token);
            if (rememberMe && deviceToken) {
              localStorage.setItem('auth_device_token', deviceToken);
            }
            setUserEmail(email);
            try {
              // Fetch from Supabase immediately after successful login
              const result = await syncStateFromSupabase(email);
              if (result.success && result.state) {
                setState(migrateStateCards(result.state));
              } else if (result.error) {
                console.warn("Could not sync from database:", result.error);
                // Continue anyway
              }
            } catch (err) {
              console.warn("Fatal error syncing from database, continuing offline...", err);
            }
            setIsUnlocked(true);
            setActiveTab('dashboard');
          }}
        />
      )}

      {/* 2. DUAL LAYOUT: MAIN VIEWPORT */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start relative pb-28 lg:pb-12">
        
        {/* =================== COLUMN 1: ACCESS MODULES & ACTIVE OPERATIONS =================== */}
        <section className={`col-span-1 ${isNavCollapsed ? 'lg:col-span-1' : 'lg:col-span-3'} order-3 lg:order-1 space-y-6 w-full transition-all duration-300`} id="desktop-control-column">
          
          {/* Navigation Menu (Visible on Desktop / Large screens, hidden on Mobile) */}
          <div className={`bg-zinc-900/50 border border-zinc-850 backdrop-blur-md p-4 sm:p-5 rounded-[28px] space-y-4 shadow-2xl hidden lg:block animate-fade-in transition-all duration-300`}>
            <div className="flex items-center justify-between pointer-events-auto">
              {!isNavCollapsed && (
                <span className="text-[10px] sm:text-[11px] font-mono tracking-widest text-[var(--text-secondary)] uppercase font-bold flex items-center gap-1.5 animate-fade-in">
                  <span className="w-1.5 h-1.5 bg-[var(--accent-primary)] rounded-full animate-pulse" />
                  COMMAND CENTER
                </span>
              )}
              <button 
                onClick={() => setIsNavCollapsed(!isNavCollapsed)}
                className={`p-1.5 rounded-lg bg-[#070707] hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white transition-all duration-200 cursor-pointer flex items-center justify-center ${isNavCollapsed ? 'mx-auto' : 'ml-auto'}`}
                title={isNavCollapsed ? "Expand Sidebar Layout" : "Collapse Sidebar Layout"}
              >
                <Zap size={12} className={`text-indigo-400 ${isNavCollapsed ? 'animate-pulse' : ''}`} />
              </button>
            </div>

            <nav className="flex flex-col gap-2" id="web-sidebar-navigation">
              {[
                { tab: 'dashboard', icon: <Percent size={15} />, label: 'Overview Hub' },
                { tab: 'accounts', icon: <Wallet size={15} />, label: 'Wallets Portfolio' },
                { tab: 'inflow_outflow', icon: <Plus size={15} />, label: 'Ledger Registry' },
                { tab: 'budgets', icon: <CheckSquare size={15} />, label: 'Smart Budgets' },
                { tab: 'debts', icon: <CircleDot size={15} />, label: 'Track Liabilities' },
                { tab: 'loans', icon: <ArrowUpRight size={15} />, label: 'Track Loans Given' },
                { tab: 'reports', icon: <TrendingUp size={15} />, label: 'Reports Centre' },
              ].map((item) => (
                <button
                  key={item.tab}
                  onClick={() => setActiveTab(item.tab as any)}
                  className={`w-full py-3.5 px-4 rounded-2xl font-sans font-bold text-xs flex items-center gap-3.5 transition-all duration-300 cursor-pointer border ${
                    activeTab === item.tab
                      ? 'bg-[var(--accent-primary)] border-[var(--accent-primary)] text-white shadow-lg hover:scale-[1.01]'
                      : 'text-zinc-400 bg-transparent border-transparent hover:text-white hover:border-zinc-800 hover:bg-zinc-900/60'
                  } ${isNavCollapsed ? 'justify-center px-1' : ''}`}
                  title={isNavCollapsed ? item.label : undefined}
                >
                  <span className={`shrink-0 ${activeTab === item.tab ? 'text-white scale-110' : 'text-zinc-500'}`}>
                    {item.icon}
                  </span>
                  {!isNavCollapsed && <span className="truncate">{item.label}</span>}
                </button>
              ))}
            </nav>
          </div>

          {/* Secure Environment Security Vault Identity Card */}
          {isNavCollapsed ? (
            <div className="bg-zinc-900/50 border border-zinc-850 p-3 rounded-2xl shadow-sm hidden lg:flex items-center justify-center animate-fade-in text-blue-400 hover:scale-105 duration-200 cursor-pointer" title={`Secured Connection for ${userEmail}`}>
              <Lock size={14} className="animate-pulse" />
            </div>
          ) : (
            <div className="bg-card text-card-foreground border border-zinc-200 dark:border-zinc-850 p-5 rounded-[24px] space-y-4 shadow-xl hidden lg:block animate-fade-in">
              <h3 className="text-[10px] tracking-wider text-blue-500 dark:text-blue-400 font-mono font-bold uppercase flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                SECURITY VAULT ACTIVE
              </h3>
              <div className="space-y-3">
                <div className="p-3 bg-muted border border-zinc-200 dark:border-zinc-900 rounded-xl space-y-1">
                  <span className="text-[9px] text-muted-foreground block uppercase font-mono font-bold">DEVICE HOLDER</span>
                  <span className="text-xs font-mono font-bold text-card-foreground break-all truncate block">{userEmail || 'Client Local Only'}</span>
                </div>
                <div className="flex justify-between items-center text-[10px] text-muted-foreground font-mono border-t border-zinc-200 dark:border-zinc-900 pt-3">
                  <span>State Syncing</span>
                  <span className="text-blue-500 dark:text-blue-400 font-bold uppercase">Active</span>
                </div>
                <div className="flex justify-between items-center text-[10px] text-muted-foreground font-mono">
                  <span>Status Indicator</span>
                  <span className={realtimeSyncStatus === 'synced' ? 'text-indigo-500 dark:text-indigo-400 font-bold uppercase' : 'text-amber-500 dark:text-amber-400 font-bold uppercase'}>
                    {realtimeSyncStatus ? realtimeSyncStatus.toUpperCase() : 'IDLE'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {!isNavCollapsed && activeTab === 'dashboard' && (
            <div className="hidden lg:block animate-fade-in pt-6">
              <CategorySpreadAnalysis categories={appCategoryChartList} currency={state.currency} layout="vertical" />
            </div>
          )}
        </section>

        {/* =================== COLUMN 2: FINANCIAL WEB CONTENT (WIDESCREEN EXPANSION) =================== */}
        <section className={`col-span-1 ${isNavCollapsed ? 'lg:col-span-11' : 'lg:col-span-9'} order-1 lg:order-2 space-y-6 w-full transition-all duration-350 animate-fade-in`} id="central-web-canvas">
          
          {/* Header block for current active tab */}
          {activeTab !== 'dashboard' && (
            <div className="flex justify-between items-center bg-zinc-900/50 border border-zinc-850 p-6 rounded-[28px] shadow-xl">
              <div className="min-w-0 pr-3 space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] font-sans">
                  {activeTab === 'accounts' ? 'Wallets Core' :
                   activeTab === 'inflow_outflow' ? 'Ledger Action' :
                   activeTab === 'budgets' ? 'Limit Envelopes' :
                   activeTab === 'goals' ? 'Aspirations & Vaults' :
                   activeTab === 'debts' ? 'Track Liabilities' :
                   activeTab === 'loans' ? 'Vault Asset Ledger' : 'Diagnostics Reports'}
                </span>
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[var(--text-primary)] capitalize leading-none">
                  {activeTab === 'accounts' ? 'Wallets' :
                   activeTab === 'inflow_outflow' ? 'Register & Recurring' :
                   activeTab === 'budgets' ? 'Smart Budgets' :
                   activeTab === 'goals' ? 'Savings Jars' :
                   activeTab === 'debts' ? 'Liabilities' :
                   activeTab === 'loans' ? 'Loans Given' : 'Reports'}
                </h1>
                {activeTab === 'loans' && (
                  <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed max-w-xl hidden md:block">
                    Register and monitor personal funds lent to others. Record individual settle records, and automatically back credit balances back into your ledger account suites.
                  </p>
                )}
              </div>

              {/* Notifications trigger bell */}
              <button
                onClick={() => setIsNotifOpen(true)}
                className="p-2 sm:p-3 bg-zinc-900 border border-zinc-800 rounded-full text-zinc-300 hover:text-white hover:border-zinc-500 relative cursor-pointer shadow-md transition-all flex items-center justify-center shrink-0"
              >
                <Bell size={15} />
                {state.notifications.filter(n => !n.read).length > 0 && (
                  <span className="absolute top-0 right-0 w-2 h-2 bg-emerald-400 border-2 border-zinc-900 rounded-full animate-pulse" />
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
              <p className="text-[11px] text-zinc-350 leading-relaxed">
                Your local ledger tracks couldn't synchronize instantly to Supabase. This is why some newly created Cash Wallets or cards/transactions might not appear in your database table.
              </p>
              <div className="bg-black/50 p-3 rounded-xl border border-red-950/50 space-y-1 font-mono text-[10px]">
                <span className="text-zinc-500 font-bold block uppercase">REJECTED CODE:</span>
                <span className="text-red-400 font-semibold block break-words">{realtimeSyncError || 'Supabase Connection Rejected.'}</span>
              </div>
              <div className="pt-1.5 space-y-2">
                <span className="text-[10px] uppercase font-bold text-zinc-400 block font-mono">3-STEP DIAGNOSTICS & RESOLUTION GUIDE:</span>
                <ol className="list-decimal list-inside text-[10px] text-zinc-400 space-y-1 leading-normal">
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
                <Dashboard 
                  state={state} 
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
                />
              )}

              {/* =================== CASE: TAB: BUDGETS =================== */}
              {activeTab === 'budgets' && (
                <BudgetsSection 
                  budgets={computedBudgets}
                  currency={state.currency}
                  onUpdateBudgetLimit={handleUpdateBudgetLimit}
                  onAddBudget={handleAddBudget}
                  onRemoveBudget={handleRemoveBudget}
                  onClearAllBudgets={handleClearAllBudgets}
                />
              )}

              {/* =================== CASE: TAB: GOALS =================== */}
              {activeTab === 'goals' && (
                <GoalsSection 
                  goals={state.savingsGoals || []}
                  currency={state.currency}
                  cashAccounts={state.cashAccounts}
                  onAddGoal={handleAddGoal}
                  onModifyGoalFunds={handleModifyGoalFunds}
                  onRemoveGoal={handleRemoveGoal}
                  onClearAllGoals={handleClearAllGoals}
                />
              )}

              {/* =================== CASE: TAB: ACCOUNTS =================== */}
              {activeTab === 'accounts' && (
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
              )}

              {/* =================== CASE: TAB: INFLOWS_OUTFLOWS =================== */}
              {activeTab === 'inflow_outflow' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  <div className="col-span-1 lg:col-span-5 w-full">
                    <InflowsOutflows
                      cashAccounts={state.cashAccounts}
                      cards={state.cards}
                      onAddIncome={handleAddIncome}
                      onAddExpense={handleAddExpense}
                      currency={state.currency}
                    />
                  </div>
                  <div className="col-span-1 lg:col-span-7 w-full">
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
              )}

              {/* =================== CASE: TAB: DEBTS =================== */}
              {activeTab === 'debts' && (
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
                    onPayCard={handlePayCreditCard}
                    onAddPurchase={handleAddCreditCardPurchase}
                    onUpdateCard={handleUpdateCard}
                  />
                </div>
              )}

              {/* =================== CASE: TAB: LOANS =================== */}
              {activeTab === 'loans' && (
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
              )}

              {/* =================== CASE: TAB: REPORTS =================== */}
              {activeTab === 'reports' && (
                <ReportsCentre
                  transactions={state.transactions}
                  incomes={state.incomes}
                  expenses={state.expenses}
                  debts={state.debts}
                  currency={state.currency}
                  cashAccounts={state.cashAccounts}
                  cards={state.cards}
                  onSelectTransaction={(id) => setEditingTransactionId(id)}
                />
              )}

            </div>

            {/* =================== MOBILE BOTTOM BAR NAVIGATOR =================== */}
            <nav className="fixed bottom-4 inset-x-4 bg-card/85 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 rounded-3xl pb-3 pt-2.5 flex justify-around items-center z-30 shadow-[0_4px_22px_rgba(20,20,30,0.08)] dark:shadow-[0_10px_35px_rgba(0,0,0,0.4)] lg:hidden">
              {[
                { tab: 'dashboard', icon: <Percent size={15} />, label: 'Dashboard' },
                { tab: 'accounts', icon: <Wallet size={15} />, label: 'Wallets' },
                { tab: 'inflow_outflow', icon: <Plus size={15} />, label: 'Transact' },
                { tab: 'reports', icon: <TrendingUp size={15} />, label: 'Reports' },
              ].map((item) => {
                const isActive = activeTab === item.tab;
                return (
                  <button
                    key={item.tab}
                    onClick={() => {
                      setActiveTab(item.tab as any);
                      setIsMobileNavOpen(false);
                    }}
                    className="flex flex-col items-center gap-1.5 relative cursor-pointer group"
                  >
                    <div className={`p-2.5 rounded-2xl transition-all duration-300 flex items-center justify-center ${
                      isActive && !isMobileNavOpen
                        ? 'bg-[var(--accent-primary)] text-white shadow-md scale-105 border border-[var(--accent-primary)]' 
                        : 'bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-805 text-zinc-500 dark:text-zinc-400 group-hover:bg-zinc-200 dark:group-hover:bg-zinc-800 group-hover:text-zinc-800 dark:group-hover:text-zinc-200'
                    }`}>
                      {item.icon}
                    </div>
                    <span className={`text-[8.5px] uppercase tracking-wider transition-colors duration-300 ${
                      isActive && !isMobileNavOpen
                        ? 'text-[var(--accent-primary)] font-extrabold font-sans' 
                        : 'text-zinc-500 dark:text-zinc-400 font-medium font-sans group-hover:text-zinc-700 dark:group-hover:text-zinc-300'
                    }`}>
                      {item.label}
                    </span>
                    {isActive && !isMobileNavOpen && (
                      <span className="absolute -bottom-1.5 w-1.5 h-1.5 bg-[var(--accent-primary)] rounded-full animate-pulse" />
                    )}
                  </button>
                );
              })}
              
              {/* Added native Menu button node for extra capabilities */}
              <button
                onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
                className="flex flex-col items-center gap-1.5 relative cursor-pointer group"
              >
                <div className={`p-2.5 rounded-2xl transition-all duration-300 flex items-center justify-center ${
                  isMobileNavOpen
                    ? 'bg-indigo-600 text-white shadow-md scale-105 border border-indigo-500' 
                    : 'bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-805 text-zinc-500 dark:text-zinc-400 group-hover:bg-zinc-200 dark:group-hover:bg-zinc-800 group-hover:text-zinc-800 dark:group-hover:text-zinc-200'
                }`}>
                  <Menu size={15} />
                </div>
                <span className={`text-[8.5px] uppercase tracking-wider transition-colors duration-300 ${
                  isMobileNavOpen
                    ? 'text-indigo-500 font-extrabold' 
                    : 'text-zinc-500 dark:text-zinc-400 font-medium group-hover:text-zinc-700 dark:group-hover:text-zinc-300'
                }`}>
                  More
                </span>
                {isMobileNavOpen && (
                  <span className="absolute -bottom-1.5 w-1.5 h-1.5 bg-indigo-550 rounded-full animate-pulse" />
                )}
              </button>
            </nav>

            {/* =================== MOBILE CORE SLIDE-UP HUB DRAWER =================== */}
            {isMobileNavOpen && (
              <div id="mobile-core-nav-drawer" className="fixed inset-0 bg-black/60 dark:bg-[#020205]/90 backdrop-blur-sm z-50 flex flex-col justify-end transition-all duration-350 lg:hidden">
                {/* Backdrop Dismiss Trigger */}
                <div className="absolute inset-0 cursor-pointer" onClick={() => setIsMobileNavOpen(false)} />
                
                <div className="bg-card border-t border-[var(--border-primary)] rounded-t-[32px] max-h-[85%] flex flex-col overflow-hidden shadow-2xl relative z-10 w-full animate-fade-in-up">
                  
                  {/* Slide Indicator Accent */}
                  <div className="w-12 h-1 bg-zinc-300 dark:bg-zinc-800 rounded-full mx-auto my-3.5 shrink-0 cursor-pointer" onClick={() => setIsMobileNavOpen(false)} />
                  
                  {/* Header Title Information */}
                  <div className="px-6 pb-4 border-b border-[var(--border-primary)] flex justify-between items-center shrink-0">
                    <div>
                      <span className="text-[9px] text-[var(--accent-primary)] font-mono font-bold tracking-widest uppercase block mb-0.5">EXPLORE CAPABILITIES</span>
                      <h4 className="text-sm font-extrabold text-[var(--text-primary)]">Command Hub Menu</h4>
                    </div>
                    <button
                      onClick={() => setIsMobileNavOpen(false)}
                      className="px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-205 dark:border-zinc-800 text-[10px] font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                  
                  {/* Drawer Content Body: Grid & Quick stats */}
                  <div className="flex-1 overflow-y-auto p-5 space-y-5 select-none" style={{ scrollbarWidth: 'thin' }}>
                    
                    {/* Compact Interactive Quick Statistics */}
                    <div className="p-4 bg-zinc-950/65 dark:bg-[#050508]/80 border border-zinc-900/60 rounded-2xl flex justify-around items-center gap-3">
                      <div className="text-center">
                        <span className="text-[8px] text-[var(--text-secondary)] font-mono uppercase block mb-0.5">NET WORTH</span>
                        <span className="text-xs font-mono font-bold text-white leading-none">
                          {state.currency}{aggregateActiveWealth.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                      <div className="w-px h-6 bg-zinc-900" />
                      <div className="text-center">
                        <span className="text-[8px] text-[var(--text-secondary)] font-mono uppercase block mb-0.5">CASHFLOW</span>
                        <span className={`text-xs font-mono font-bold leading-none ${(currentMonthInflow - currentMonthOutflow) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {(currentMonthInflow - currentMonthOutflow) >= 0 ? '+' : ''}{state.currency}{(currentMonthInflow - currentMonthOutflow).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                      <div className="w-px h-6 bg-zinc-900" />
                      <div className="text-center">
                        <span className="text-[8px] text-[var(--text-secondary)] font-mono uppercase block mb-0.5">SAVINGS RATE</span>
                        <span className="text-xs font-semibold font-mono text-[var(--accent-primary)] leading-none">
                          {currentMonthInflow > 0 ? Math.round(((currentMonthInflow - currentMonthOutflow) / currentMonthInflow) * 100) : 0}%
                        </span>
                      </div>
                    </div>
                    
                    {/* Navigation list selection */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] text-[var(--text-secondary)] font-mono uppercase block px-1 mb-2">FEATURES & VIEWS</span>
                      
                      <div className="grid grid-cols-2 gap-2.5">
                        {[
                          { tab: 'dashboard', icon: <Percent size={15} className="text-amber-500" />, title: 'Dashboard', desc: 'Main indicators' },
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
                                  ? 'bg-[var(--accent-primary)] border-[var(--accent-primary)] text-white'
                                  : 'bg-zinc-100 dark:bg-zinc-900/60 border-zinc-200 dark:border-zinc-850 text-[var(--text-primary)] hover:border-zinc-700'
                              }`}
                            >
                              <div className="flex justify-between items-center w-full">
                                <span className={isActive ? 'text-white' : ''}>{item.icon}</span>
                                {isActive && <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />}
                              </div>
                              <div>
                                <span className="text-[11px] font-bold block">{item.title}</span>
                                <span className={`text-[8.5px] block ${isActive ? 'text-white/85 font-medium' : 'text-[var(--text-secondary)]'}`}>{item.desc}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    
                    {/* Action controllers & theme preferences */}
                    <div className="space-y-1.5 pt-1.5 border-t border-[var(--border-primary)]">
                      <span className="text-[10px] text-[var(--text-secondary)] font-mono uppercase block px-1 mb-2">QUICK CONTROLS</span>
                      
                      <div className="grid grid-cols-3 gap-2">
                        {/* Profile settings control */}
                        <button
                          onClick={() => {
                            setIsProfileOpen(true);
                            setIsMobileNavOpen(false);
                          }}
                          className="py-3 px-1.5 bg-zinc-100 dark:bg-zinc-900/60 border border-zinc-205 dark:border-zinc-850 text-[var(--text-primary)] rounded-[14px] flex flex-col items-center gap-1.5 hover:border-zinc-700 transition-all cursor-pointer text-center"
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
                          className="py-3 px-1.5 bg-zinc-100 dark:bg-zinc-900/60 border border-zinc-205 dark:border-zinc-850 text-[var(--text-primary)] rounded-[14px] flex flex-col items-center gap-1.5 hover:border-zinc-700 transition-all cursor-pointer text-center"
                        >
                          <Settings size={14} className="text-zinc-400" />
                          <span className="text-[9px] font-bold block">Settings</span>
                        </button>
                        
                        {/* Interactive toggle theme */}
                        <button
                          onClick={() => {
                            toggleTheme();
                          }}
                          className="py-3 px-1.5 bg-zinc-100 dark:bg-zinc-900/60 border border-zinc-205 dark:border-zinc-850 text-[var(--text-primary)] rounded-[14px] flex flex-col items-center gap-1.5 hover:border-zinc-700 transition-all cursor-pointer text-center"
                        >
                          {theme === 'light' ? (
                            <>
                              <Moon size={14} className="text-indigo-400" />
                              <span className="text-[9px] font-bold block">Dark Theme</span>
                            </>
                          ) : (
                            <>
                              <Sun size={14} className="text-amber-400" />
                              <span className="text-[9px] font-bold block">Light Theme</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                    
                    {/* Device connectivity diagnostics tracker */}
                    <div className="pt-2 px-2 text-center">
                      <span className="text-[7.5px] text-[var(--text-muted)] font-mono uppercase block">SECURE DEVICE PROTOCOL ACTIVE — OWNER MIRROR IN SYNC</span>
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
                localStorage.removeItem('auth_user_email');
                localStorage.removeItem('auth_session_token');
                localStorage.removeItem('auth_device_token');
                resetLoadedFromCloud();
                setState(DEFAULT_APP_STATE);
                setIsUnlocked(false);
                setIsSettingsOpen(false);
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

      {/* 3. WORKSPACE FOOTER CORE STATUS */}
      <footer className="bg-[var(--bg-sidebar)] border-t border-[var(--border-primary)] px-6 py-3.5 z-10 flex flex-col md:flex-row justify-between items-center text-[11px] text-[var(--text-secondary)] font-mono gap-3">
        <div className="flex items-center gap-2">
          <CircleDot size={12} className="text-emerald-400 animate-pulse" />
          <span>Local database mirror synchronized fully.</span>
        </div>
        <div className="flex gap-4">
          <span>© 2026 — Designed & Developed by <a href="https://emalyaditha.com/" target="_blank" rel="noopener noreferrer" className="text-[var(--text-primary)] hover:underline transition-colors">Emal Yaditha</a>. All rights reserved.</span>
        </div>
      </footer>

    </div>
  );
}
