import React, { useState, useEffect } from 'react';
import { AppState, CashAccount, BankCard, Income, Expense, Debt, Transaction, AppNotification, CategoryIncome, CategoryExpense, CreditCard as DbCreditCard, CreditCardPurchase, Subscription } from './types';
import { DEFAULT_APP_STATE } from './initialData';
import { exportStateAsJSON } from './utils';
import { 
  Plus, Search, Bell, CreditCard, Wallet, Percent, ChevronRight, 
  TrendingUp, User, Lock, Unlock, Settings, HelpCircle, RefreshCw, 
  FileDown, Share2, Landmark, ShieldAlert, ArrowUpRight, ArrowDownLeft,
  DollarSign, CircleDot, Database, CheckSquare, Zap, BadgeCheck, AlertCircle,
  Cloud, CloudOff, ArrowRightLeft
} from 'lucide-react';

import EmailLogin from './components/EmailLogin';
import NotificationDrawer from './components/NotificationDrawer';
import CashCardManagement from './components/CashCardManagement';
import InflowsOutflows from './components/InflowsOutflows';
import SubscriptionManagement from './components/SubscriptionManagement';
import FintechDashboard from './components/FintechDashboard';
import ProfileSection from './components/ProfileSection';
import DebtTracker from './components/DebtTracker';
import TransferFunds from './components/TransferFunds';
import CreditCardManagement from './components/CreditCardManagement';
import ReportsCentre from './components/ReportsCentre';
import SettingsModal from './components/SettingsModal';
import TransactionEditModal from './components/TransactionEditModal';
import { getSupabaseConfig, syncStateToSupabase, syncStateFromSupabase, forceCancelCardInSupabase } from './supabase';
import { useNotifications } from './context/NotificationContext';

export default function App() {
  const { showConfirm, showToast } = useNotifications();
  // 1. Core State
  const [state, setState] = useState<AppState>(DEFAULT_APP_STATE);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'accounts' | 'inflow_outflow' | 'debts' | 'reports'>('dashboard');
  
  // Modals & Panels Toggles
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [newPinCode, setNewPinCode] = useState('');
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');

  // Supabase real-time status tracker
  const [realtimeSyncStatus, setRealtimeSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error' | 'disabled'>('idle');
  const [realtimeSyncError, setRealtimeSyncError] = useState<string | null>(null);

  // States for Unified search & filters on history
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterAccount, setFilterAccount] = useState<string>('all');

  // Verify remembered device on mount
  useEffect(() => {
    const verifyDevice = async () => {
      const email = localStorage.getItem('auth_user_email');
      const token = localStorage.getItem('auth_session_token');
      
      if (email && token) {
        setUserEmail(email);
        try {
          const result = await syncStateFromSupabase(email);
          if (result.success && result.state) {
            setState(result.state);
            setIsUnlocked(true);
          } else {
            console.warn("Could not sync from database:", result.error);
            localStorage.removeItem('auth_user_email');
            localStorage.removeItem('auth_session_token');
            setIsUnlocked(false);
          }
        } catch (err) {
          console.warn("Fatal error syncing from database, continuing offline...", err);
          setIsUnlocked(false);
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
    setState(updater);
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
  }, [state, isSettingsOpen, isUnlocked]);

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
            const nextVal = c.currentBalance - amount;
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
    const newDebt: Debt = {
      ...debtData,
      id: `debt-${Date.now()}`,
      remainingAmount: debtData.totalAmount,
      payments: [],
    };

    updateState(prev => {
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
    updateState(prev => ({
      ...prev,
      subscriptions: (prev.subscriptions || []).filter(sub => sub.id !== id),
    }));
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
        const updatedCards = prev.cards.map(c => c.id === purchase.cardId ? { ...c, currentBalance: c.currentBalance + purchase.amount } : c);
        
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
      updateState(prev => {
          let updatedCash = [...prev.cashAccounts];
          let updatedCards = [...prev.cards];
          
          if (fromType === 'cash') {
              updatedCash = updatedCash.map(c => c.id === fromId ? { ...c, balance: c.balance - amount } : c);
          } else {
              updatedCards = updatedCards.map(c => c.id === fromId ? { ...c, currentBalance: c.currentBalance - amount } : c);
          }
          
          const updatedCardsFinal = updatedCards.map(c => c.id === cardId ? { ...c, currentBalance: c.currentBalance - amount } : c);
          
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
              cards: updatedCardsFinal,
              transactions: [newTransaction, ...prev.transactions]
          };
      });
      showToast('success', 'Payment recorded successfully!');
  };

  const handleIncreaseDebt = (debtId: string, amount: number) => {
    updateState(prev => {
      return {
        ...prev,
        debts: prev.debts.map(d => d.id === debtId ? { 
          ...d, 
          totalAmount: d.totalAmount + amount,
          remainingAmount: d.remainingAmount + amount
        } : d)
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
          return {
            ...debt,
            remainingAmount: Math.max(0, debt.remainingAmount - amount),
            payments: [...debt.payments, newPayment],
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
    updateState(prev => ({
      ...prev,
      cashAccounts: prev.cashAccounts.filter(c => c.id !== id),
    }));
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
          // Liability purchase: previously added to balance, need to subtract
          updatedCards = updatedCards.map(c => c.id === tx.accountId ? { ...c, currentBalance: c.currentBalance - tx.amount } : c);
          updatedCreditCardPurchases = updatedCreditCardPurchases.filter(p => p.id !== tx.referenceId);
        } else {
          updatedExpenses = updatedExpenses.filter(e => e.id !== tx.referenceId);
          if (tx.accountId && tx.accountType) reverseAmount(tx.amount, tx.accountId, tx.accountType, false);
        }
      } else if (tx.type === 'debt_payment') {
        if (tx.title.startsWith('Credit Card Settlement:')) {
          // Put the money back into the source wallet/account that made the payment
          if (tx.accountId && tx.accountType) {
            reverseAmount(tx.amount, tx.accountId, tx.accountType, false);
          }
          // Restore the outstanding balance of the settled credit card (add the settled amount back to the card)
          const cardNamePart = tx.title.replace('Credit Card Settlement:', '').trim();
          const targetCc = prev.cards.find(c => c.cardName === cardNamePart && c.cardType === 'Credit');
          if (targetCc) {
            updatedCards = updatedCards.map(c => c.id === targetCc.id ? { ...c, currentBalance: c.currentBalance + tx.amount } : c);
          }
        } else {
          if (tx.accountId && tx.accountType) reverseAmount(tx.amount, tx.accountId, tx.accountType, false);
          updatedDebts = updatedDebts.map(d => {
            const removedPayment = d.payments?.find(p => p.id === tx.referenceId);
            if (removedPayment) {
              return {
                ...d,
                remainingAmount: d.remainingAmount + Math.abs(removedPayment.amount),
                payments: d.payments.filter(p => p.id !== tx.referenceId)
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

      return {
        ...prev,
        transactions: prev.transactions.filter(t => t.id !== txId),
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
      if (tx.type === 'income' || tx.type === 'deposit') {
        if (tx.accountId && tx.accountType) changeBalance(-tx.amount, tx.accountId, tx.accountType);
      } else if (tx.type === 'expense' || tx.type === 'debt_payment' || tx.type === 'withdrawal') {
        if (tx.accountId && tx.accountType) changeBalance(tx.amount, tx.accountId, tx.accountType);
      }

      // 2. Apply the new transaction
      if (tx.type === 'income' || tx.type === 'deposit') {
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
            return {
              ...d,
              remainingAmount: d.remainingAmount - difference,
              payments: d.payments.map(p => p.id === tx.referenceId ? { 
                ...p, amount: newData.amount, date: newData.date, paidFromId: newData.accountId, paidFromType: newData.accountType 
              } : p)
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
          updateState(() => stateToLoad);
          
          if (originalOwner && originalOwner !== 'Anonymous') {
            showToast('success', `Personal ledger belonging to ${originalOwner} imported successfully! All records linked to your active identity.`);
          } else {
            showToast('success', 'Database restored successfully! Ledger tracks have re-balanced.');
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
  const totalDebitCardsAmount = state.cards.filter(c => !c.isCanceled && c.cardType === 'Debit').reduce((sum, c) => sum + c.currentBalance, 0);
  const totalCreditCardsAmount = state.cards.filter(c => !c.isCanceled && c.cardType === 'Credit').reduce((sum, c) => sum + c.currentBalance, 0);
  const totalDebtsAmount = state.debts.reduce((sum, d) => sum + d.remainingAmount, 0);
  const aggregateActiveWealth = totalCashAmount + totalDebitCardsAmount - totalCreditCardsAmount - totalDebtsAmount;

  const currentMonthInflow = state.transactions
    .filter(t => t.type === 'income' && t.date.includes(currentMonthFormat))
    .reduce((sum, t) => sum + t.amount, 0);

  const currentMonthOutflow = state.transactions
    .filter(t => t.type === 'expense' && t.date.includes(currentMonthFormat))
    .reduce((sum, t) => sum + t.amount, 0);

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
            <div className="w-6 h-6 border-2 border-zinc-700 rounded-full border-t-emerald-400 animate-spin" />
          </div>
          <div>
            <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">Secure Connection</span>
            <p className="text-zinc-500 text-[10px] mt-1.5">Checking trusted owner device...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="full-workspace-view" className="min-h-screen bg-[#050505] text-white flex flex-col justify-between font-sans selection:bg-white selection:text-black antialiased">
      
      {/* 1. TOP HEADER BRAND RAIL */}
      <header className="px-6 py-4 bg-[#050505] border-b border-zinc-900 flex justify-between items-center z-20" id="header-brand-rail">
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 100 100" className="w-9 h-9 shrink-0" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="100" height="100" rx="22" fill="black" stroke="#27272a" strokeWidth="4px" />
            <text x="50" y="63" fill="white" fontSize="42" fontWeight="900" fontFamily='"Inter", ui-sans-serif, system-ui, sans-serif' textAnchor="middle">
              <tspan fill="#ffffff" fontWeight="bold" fontFamily="monospace">{"{"}</tspan>
              <tspan fill="white" fontWeight="900" fontFamily="sans-serif">EM</tspan>
              <tspan fill="#ffffff" fontWeight="bold" fontFamily="monospace">{"}"}</tspan>
            </text>
          </svg>
          <div>
            <h1 className="text-sm font-black tracking-tight text-white uppercase flex items-center gap-1.5 leading-none">
              EM Budget
            </h1>
            <p className="text-[9px] text-zinc-500 font-mono mt-1">Owner Device Secured</p>
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
            <div className="px-2.5 py-1.5 rounded-lg border border-emerald-950/20 border-emerald-900/50 text-emerald-400 text-[10px] font-bold flex items-center gap-1.5 font-mono">
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

          {/* Profile Mark */}
          <button
            onClick={() => setIsProfileOpen(true)}
            className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold hover:bg-indigo-700 transition-all cursor-pointer"
            title="Profile"
            id="header-profile-trigger"
          >
            {state.userProfile.name.charAt(0)}
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
            />
          </div>
        </div>
      )}

      {/* ======================= RE-LOCK SCREEN INTERACTION ======================= */}
      {!isUnlocked && (
        <EmailLogin
          onUnlocked={async (email, rememberMe) => {
            if (rememberMe) {
              localStorage.setItem('auth_user_email', email);
              localStorage.setItem('auth_session_token', `token_vault_session_${Date.now()}`);
            }
            setUserEmail(email);
            try {
              // Fetch from Supabase immediately after successful login
              const result = await syncStateFromSupabase(email);
              if (result.success && result.state) {
                setState(result.state);
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
        <section className="col-span-1 lg:col-span-3 order-3 lg:order-1 space-y-6 w-full" id="desktop-control-column">
          
          {/* Navigation Menu (Visible on Desktop / Large screens, hidden on Mobile) */}
          <div className="bg-zinc-900/50 border border-zinc-850 p-6 rounded-[24px] space-y-4 shadow-xl hidden lg:block animate-fade-in shadow-xl">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
              Application Menu
            </h3>
            <nav className="flex flex-col gap-1.5" id="web-sidebar-navigation">
              {[
                { tab: 'dashboard', icon: <Percent size={15} />, label: 'Overview Hub' },
                { tab: 'accounts', icon: <Wallet size={15} />, label: 'Wallets Portfolio' },
                { tab: 'inflow_outflow', icon: <Plus size={15} />, label: 'Ledger Registry' },
                { tab: 'debts', icon: <CircleDot size={15} />, label: 'Track Liabilities' },
                { tab: 'reports', icon: <TrendingUp size={15} />, label: 'Reports Centre' },
              ].map((item) => (
                <button
                  key={item.tab}
                  onClick={() => setActiveTab(item.tab as any)}
                  className={`w-full py-3 px-4 rounded-xl font-mono font-bold text-xs flex items-center gap-3 transition-all cursor-pointer border ${
                    activeTab === item.tab
                      ? 'bg-white border-white text-black shadow-md'
                      : 'text-zinc-400 bg-transparent border-transparent hover:text-white hover:border-zinc-800 hover:bg-zinc-900/40'
                  }`}
                >
                  <span className={`${activeTab === item.tab ? 'text-black' : 'text-zinc-500'}`}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
          </div>

          {/* Secure Environment Security Vault Identity Card (Visible on Desktop, hidden on Mobile) */}
          <div className="bg-zinc-900/50 border border-zinc-850 p-6 rounded-[24px] space-y-4 shadow-xl hidden lg:block animate-fade-in">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
              Identity Security Vault
            </h3>
            <div className="space-y-3">
              <div className="p-3 bg-[#050505] border border-zinc-800 rounded-xl space-y-1">
                <span className="text-[9px] text-[#8aa8bb] block uppercase font-mono font-bold">Secured Connection</span>
                <span className="text-xs font-mono font-bold text-zinc-300 break-all">{userEmail || 'Client Local Only'}</span>
              </div>
              <div className="flex justify-between items-center text-[10px] text-zinc-400 font-mono border-t border-zinc-850/60 pt-3">
                <span>Identity Session</span>
                <span className="text-emerald-450 text-emerald-400 font-bold uppercase">Active</span>
              </div>
              <div className="flex justify-between items-center text-[10px] text-zinc-400 font-mono">
                <span>Synchronicity</span>
                <span className={realtimeSyncStatus === 'synced' ? 'text-emerald-400 font-bold uppercase' : 'text-amber-400 font-bold uppercase'}>
                  {realtimeSyncStatus ? realtimeSyncStatus.toUpperCase() : 'IDLE'}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* =================== COLUMN 2: FINANCIAL WEB CONTENT (WIDESCREEN EXPANSION) =================== */}
        <section className="col-span-1 lg:col-span-9 xl:col-span-9 order-1 lg:order-2 space-y-6 w-full animate-fade-in" id="central-web-canvas">
          
          {/* Header block for current active tab */}
          {activeTab !== 'dashboard' && (
            <div className="flex justify-between items-center bg-zinc-900/50 border border-zinc-850 p-4 sm:p-6 rounded-[28px] shadow-xl">
              <div className="min-w-0 pr-3">
                <span className="text-[10px] tracking-widest text-[#8aa8bb] font-mono font-bold uppercase block mr-1 truncate">
                  {activeTab === 'accounts' ? 'Wallets Core' :
                   activeTab === 'inflow_outflow' ? 'Ledger Action' :
                   activeTab === 'debts' ? 'Track Liabilities' : 'Diagnostics Reports'}
                </span>
                <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white capitalize leading-tight truncate">
                  {activeTab === 'accounts' ? 'Wallets' :
                   activeTab === 'inflow_outflow' ? 'Register' :
                   activeTab === 'debts' ? 'Liabilities' : 'Reports'}
                </h2>
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
          <div className="space-y-6">

              {/* =================== CASE: TAB: DASHBOARD =================== */}
              {activeTab === 'dashboard' && (
                <FintechDashboard 
                  state={state} 
                  aggregateActiveWealth={aggregateActiveWealth}
                  totalCashAmount={totalCashAmount}
                  totalDebitCardsAmount={totalDebitCardsAmount}
                  totalCreditCardsAmount={totalCreditCardsAmount}
                  totalDebtsAmount={totalDebtsAmount}
                  currentMonthLabel={currentMonthLabel}
                  currentMonthInflow={currentMonthInflow}
                  currentMonthOutflow={currentMonthOutflow}
                  setActiveTab={setActiveTab}
                  setEditingTransactionId={setEditingTransactionId}
                  onProfileClick={() => setIsProfileOpen(true)}
                  onNotificationClick={() => setIsNotifOpen(true)}
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
                <div className="grid grid-cols-1 lg:grid-cols-12 xl:grid-cols-1 gap-6 items-start">
                  <div className="col-span-1 lg:col-span-5 xl:col-span-12 w-full">
                    <InflowsOutflows
                      cashAccounts={state.cashAccounts}
                      cards={state.cards}
                      onAddIncome={handleAddIncome}
                      onAddExpense={handleAddExpense}
                      currency={state.currency}
                    />
                  </div>
                  <div className="col-span-1 lg:col-span-7 xl:col-span-12 w-full">
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
            <nav className="fixed bottom-0 inset-x-0 bg-[#050505]/95 backdrop-blur-md border-t border-zinc-850 pb-5 pt-2 flex justify-around items-center z-30 shadow-2xl lg:hidden">
              {[
                { tab: 'dashboard', icon: <Percent size={16} />, label: 'Summary' },
                { tab: 'accounts', icon: <Wallet size={16} />, label: 'Wallets' },
                { tab: 'inflow_outflow', icon: <Plus size={16} />, label: 'Register' },
                { tab: 'debts', icon: <CircleDot size={16} />, label: 'Liabilities' },
                { tab: 'reports', icon: <TrendingUp size={16} />, label: 'Reports' },
              ].map((item) => (
                <button
                  key={item.tab}
                  onClick={() => setActiveTab(item.tab as any)}
                  className={`flex flex-col items-center gap-1 transition-all ${
                    activeTab === item.tab ? 'text-white font-bold' : 'text-zinc-500 hover:text-zinc-400'
                  }`}
                >
                  <div className={`p-1.5 rounded-xl transition-all ${activeTab === item.tab ? 'bg-zinc-800 border border-zinc-700 shadow-md text-white' : 'text-zinc-400'}`}>
                    {item.icon}
                  </div>
                  <span className="text-[9px] uppercase tracking-widest font-semibold font-mono">{item.label}</span>
                </button>
              ))}
            </nav>

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
      <footer className="bg-[#050505] border-t border-zinc-900 px-6 py-3.5 z-10 flex flex-col md:flex-row justify-between items-center text-[11px] text-zinc-500 font-mono gap-3">
        <div className="flex items-center gap-2">
          <CircleDot size={12} className="text-emerald-400 animate-pulse" />
          <span>Local database mirror synchronized fully.</span>
        </div>
        <div className="flex gap-4">
          <span>© 2026 — Designed & Developed by <a href="https://emalyaditha.com/" target="_blank" rel="noopener noreferrer" className="text-zinc-300 hover:text-white transition-colors underline">Emal Yaditha</a>. All rights reserved.</span>
        </div>
      </footer>

    </div>
  );
}
