export type CategoryIncome = 'Salary' | 'Freelance' | 'Business' | 'Bonus' | 'Commission' | 'Loan Settle' | 'Other';
export type CategoryExpense = 'Food' | 'Transport' | 'Shopping' | 'Utilities' | 'Rent' | 'Entertainment' | 'Medical' | 'Education' | 'Insurance' | 'Loan' | 'Bank Charges & Interest' | 'Other';

export interface CashAccount {
  id: string;
  name: string;
  balance: number;
}

export interface Charge {
  id: string;
  name: string;
  amount: number;
  type: 'Interest Charge' | 'Late Payment Fee' | 'Over-Limit Fee' | 'Annual Fee' | 'Custom Charge';
  appliedDate: string; // ISO format date string
  isRecurring?: boolean;
  recurringInterval?: 'Monthly' | 'Yearly' | 'Custom';
  description?: string;
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
  isFrozen?: boolean; // Stateful "Card Freezing" (Soft Lock)
  allowNegativeBalance?: boolean;
  charges?: Charge[];
  lockedAmount?: number; // Held/locked amount of Debit Card (money locked by the bank)
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
  category?: CategoryExpense;
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
  accountId?: string;
  accountType?: 'cash' | 'card';
  accountName?: string;
  status?: 'Active' | 'Closed' | 'Fully Repaid';
}

export interface Transaction {
  id: string;
  type: 'income' | 'expense' | 'debt_payment' | 'deposit' | 'withdrawal' | 'transfer' | 'credit_card_charge' | 'financing';
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

export interface LoanSettlement {
  id: string;
  loanId: string;
  amount: number;
  date: string;
  receivedInId: string;
  receivedInType: 'cash' | 'card';
  receivedInName: string;
}

export interface LoanGiven {
  id: string;
  borrowerName: string;
  totalAmount: number;
  remainingAmount: number;
  dateGiven: string;
  sourceAccountId: string;
  sourceAccountType: 'cash' | 'card';
  sourceAccountName: string;
  status: 'Active' | 'Partially Settled' | 'Settled';
  notes: string;
  settlements: LoanSettlement[];
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
  instanceType?: string; // e.g. "Web Service", "PostgreSQL", "Background worker" etc
}

export interface Budget {
  id: string;
  category: CategoryExpense;
  limit: number;
  spent: number;
  icon: string;
  subBreakdown: { name: string; spent: number }[];
}

export interface SavingsGoal {
  id: string;
  name: string;
  target: number;
  current: number;
  targetDate: string;
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
  loansGiven: LoanGiven[];
  budgets?: Budget[]; // Added premium feature budgets list
  savingsGoals?: SavingsGoal[]; // Added savings goals list
  pinCode: string;
  pinEnabled: boolean;
  currency: string;
}
