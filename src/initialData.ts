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
  userProfile: { name: 'User', email: 'user@example.com' },
  pinCode: '',
  pinEnabled: false,
  currency: 'Rs.',
};
