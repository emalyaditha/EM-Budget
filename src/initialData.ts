import { AppState, CashAccount, BankCard, CreditCard, CreditCardPurchase, Income, Expense, Debt, Transaction, AppNotification, Subscription } from './types';

export const INITIAL_CASH_ACCOUNTS: CashAccount[] = [];
export const INITIAL_CARDS: BankCard[] = [];
export const INITIAL_CREDIT_CARDS: CreditCard[] = [];
export const INITIAL_CREDIT_CARD_PURCHASES: CreditCardPurchase[] = [];
export const INITIAL_INCOMES: Income[] = [];
export const INITIAL_EXPENSES: Expense[] = [];
export const INITIAL_DEBTS: Debt[] = [];
export const INITIAL_TRANSACTIONS: Transaction[] = [];
export const INITIAL_NOTIFICATIONS: AppNotification[] = [];
export const INITIAL_SUBSCRIPTIONS: Subscription[] = [];

export const DEFAULT_APP_STATE: AppState = {
  cashAccounts: INITIAL_CASH_ACCOUNTS,
  cards: INITIAL_CARDS,
  creditCards: INITIAL_CREDIT_CARDS,
  creditCardPurchases: INITIAL_CREDIT_CARD_PURCHASES,
  incomes: INITIAL_INCOMES,
  expenses: INITIAL_EXPENSES,
  debts: INITIAL_DEBTS,
  transactions: INITIAL_TRANSACTIONS,
  notifications: INITIAL_NOTIFICATIONS,
  subscriptions: INITIAL_SUBSCRIPTIONS,
  loansGiven: [],
  budgets: [
    {
      id: 'b1',
      category: 'Food',
      limit: 500,
      spent: 240,
      icon: '🍔',
      subBreakdown: [
        { name: 'Restaurants', spent: 120 },
        { name: 'Coffee shops', spent: 40 },
        { name: 'Grocery Stores', spent: 80 }
      ]
    },
    {
      id: 'b2',
      category: 'Transport',
      limit: 150,
      spent: 45,
      icon: '🚗',
      subBreakdown: [
        { name: 'Ride Hailing', spent: 25 },
        { name: 'Fuel', spent: 20 }
      ]
    },
    {
      id: 'b3',
      category: 'Entertainment',
      limit: 200,
      spent: 180,
      icon: '🍿',
      subBreakdown: [
        { name: 'Cinema', spent: 50 },
        { name: 'Netflix Subscription', spent: 30 },
        { name: 'Gaming', spent: 100 }
      ]
    },
    {
      id: 'b4',
      category: 'Utilities',
      limit: 400,
      spent: 350,
      icon: '⚡',
      subBreakdown: [
        { name: 'Internet Provider', spent: 80 },
        { name: 'Electricity Utility', spent: 170 },
        { name: 'Water Service', spent: 100 }
      ]
    },
    {
      id: 'b5',
      category: 'Shopping',
      limit: 300,
      spent: 335,
      icon: '🛍️',
      subBreakdown: [
        { name: 'Apparel & Clothes', spent: 215 },
        { name: 'Electronics Gadgets', spent: 120 }
      ]
    }
  ],
  savingsGoals: [
    {
      id: 'g1',
      name: 'Emergency Nest Egg',
      target: 10000,
      current: 4500,
      targetDate: '2026-12-31'
    },
    {
      id: 'g2',
      name: 'Tokyo Autumn Expedition',
      target: 5000,
      current: 5000, // completed for a celebratory confetti micro-interaction!
      targetDate: '2026-09-30'
    },
    {
      id: 'g3',
      name: 'High Performance Laptop',
      target: 2500,
      current: 1250,
      targetDate: '2026-07-15'
    }
  ],
  userProfile: { name: 'User', email: 'user@example.com' },
  pinCode: '',
  pinEnabled: false,
  currency: 'Rs.',
};
