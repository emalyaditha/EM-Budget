export type CategoryIncome = 'Salary' | 'Freelance' | 'Business' | 'Bonus' | 'Commission' | 'Other';
export type CategoryExpense = 'Food' | 'Transport' | 'Shopping' | 'Utilities' | 'Rent' | 'Entertainment' | 'Medical' | 'Education' | 'Insurance' | 'Other';

export interface CashAccount {
  id: string;
  name: string;
  balance: number;
}

export interface BankCard {
  id: string;
  cardName: string;
  bankName: string;
  cardType: 'Debit' | 'Credit';
  currentBalance: number;
  limit?: number; // Added limit for credit cards
  isLimitLocked?: boolean; // True to lock the limit
  cardNumber?: string; // masked card number e.g. **** 4242
  isCanceled?: boolean; // Support soft delete / cancel status
  cardTheme?: string;
}

export interface CreditCard {
  id: string;
  name: string;
  balance: number; // The amount owed (liability)
  limit: number;
  dueDate: string;
  minPayment: number;
}

export interface CreditCardPurchase {
  id: string;
  cardId: string;
  amount: number;
  description: string;
  merchant: string;
  date: string;
}

export interface Income {
  id: string;
  amount: number;
  date: string;
  source: string;
  category: CategoryIncome;
  targetAccountId: string; // ID of either CashAccount or BankCard
  targetType: 'cash' | 'card';
}

export interface Expense {
  id: string;
  title: string;
  description: string;
  amount: number;
  date: string;
  category: CategoryExpense;
  paymentMethodId: string; // ID of CashAccount or BankCard
  paymentMethodType: 'cash' | 'card';
}

export interface DebtPayment {
  id: string;
  debtId: string;
  amount: number;
  date: string;
  paidFromId: string;
  paidFromType: 'cash' | 'card';
}

export interface Debt {
  id: string;
  debtSource: string;
  totalAmount: number;
  remainingAmount: number;
  dueDate: string;
  notes: string;
  payments: DebtPayment[];
}

export interface Transaction {
  id: string;
  type: 'income' | 'expense' | 'debt_payment' | 'deposit' | 'withdrawal' | 'transfer';
  title: string;
  amount: number;
  charge?: number; // Optional transfer fee / charge
  date: string;
  category: string;
  accountId?: string; // Cash or Card ID
  accountType?: 'cash' | 'card';
  targetAccountId?: string; // for transfer/deposit/withdrawal
  targetAccountType?: 'cash' | 'card';
  referenceId?: string; // ID of income, expense, debt payment
}

export interface AppNotification {
  id: string;
  type: 'reminder' | 'alert' | 'system';
  message: string;
  date: string;
  read: boolean;
}

export interface Subscription {
  id: string;
  name: string;
  amount: number;
  billingCycle: 'Monthly' | 'Yearly';
  dueDate: string; // "YYYY-MM-DD" or standard calendar date
  category: CategoryExpense;
  status: 'Active' | 'Paused' | 'Cancelled';
  paymentMethodId?: string;
  paymentMethodType?: 'cash' | 'card';
  lastPaidDate?: string; // YYYY-MM-DD string
}

export interface UserProfile {
  name: string;
  email: string;
  avatarUrl?: string;
}

export interface AppState {
  userProfile: UserProfile;
  cashAccounts: CashAccount[];
  cards: BankCard[];
  creditCards: CreditCard[];
  creditCardPurchases: CreditCardPurchase[];
  incomes: Income[];
  expenses: Expense[];
  debts: Debt[];
  transactions: Transaction[];
  notifications: AppNotification[];
  subscriptions: Subscription[]; // Added subscriptions list
  pinCode: string;
  pinEnabled: boolean;
  currency: string;
}
