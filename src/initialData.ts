import { AppState, CashAccount, BankCard, CreditCard, CreditCardPurchase, Income, Expense, Debt, Transaction, AppNotification, Subscription, CreditCardInstallment, CreditCardInstallmentPayment } from './types';

export const INITIAL_CASH_ACCOUNTS: CashAccount[] = [];
export const INITIAL_CARDS: BankCard[] = [];
export const INITIAL_CREDIT_CARDS: CreditCard[] = [];
export const INITIAL_CREDIT_CARD_PURCHASES: CreditCardPurchase[] = [];
export const INITIAL_CREDIT_CARD_INSTALLMENTS: CreditCardInstallment[] = [];
export const INITIAL_CREDIT_CARD_INSTALLMENT_PAYMENTS: CreditCardInstallmentPayment[] = [];
export const INITIAL_INCOMES: Income[] = [];
export const INITIAL_EXPENSES: Expense[] = [];
export const INITIAL_DEBTS: Debt[] = [];
export const INITIAL_TRANSACTIONS: Transaction[] = [];
export const INITIAL_NOTIFICATIONS: AppNotification[] = [];
export const INITIAL_SUBSCRIPTIONS: Subscription[] = [];

export function createDefaultAppState(): AppState {
  return {
    cashAccounts: [],
    cards: [],
    creditCards: [],
    creditCardPurchases: [],
    creditCardInstallments: [],
    creditCardInstallmentPayments: [],
    incomes: [],
    expenses: [],
    debts: [],
    transactions: [],
    notifications: [],
    subscriptions: [],
    loansGiven: [],
    budgets: [],
    savingsGoals: [],
    userProfile: { name: 'User', email: 'user@example.com' },
    pinCode: '',
    pinEnabled: false,
    currency: 'Rs.',
  };
}

export const DEFAULT_APP_STATE: AppState = createDefaultAppState();
