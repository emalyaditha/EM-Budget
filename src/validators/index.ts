import { z } from 'zod';

// Category Definitions matching types.ts
export const CategoryIncomeSchema = z.enum([
  'Salary',
  'Freelance',
  'Business',
  'Bonus',
  'Commission',
  'Loan Settle',
  'Other'
]);

export const CategoryExpenseSchema = z.enum([
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
  'Other'
]);

// 1. CashAccount Schema
export const CashAccountSchema = z.object({
  id: z.string().min(1, 'ID is required'),
  name: z.string()
    .min(3, 'Account name must be at least 3 characters')
    .max(50, 'Account name must be under 50 characters')
    .refine(val => !/[<>{}]/.test(val), {
      message: 'Account name contains illegal HTML characters'
    }),
  balance: z.number().finite().default(0)
});

// 2. BankCard Schema
export const BankCardSchema = z.object({
  id: z.string().min(1, 'ID is required'),
  cardName: z.string()
    .min(3, 'Card name must be at least 3 characters')
    .max(40, 'Card name must be under 40 characters')
    .refine(val => !/[<>{}]/.test(val), {
      message: 'Card name contains illegal HTML characters'
    }),
  bankName: z.string()
    .min(2, 'Bank name must be at least 2 characters')
    .max(50, 'Bank name must be under 50 characters')
    .refine(val => !/[<>{}]/.test(val), {
      message: 'Bank name contains illegal HTML characters'
    }),
  cardType: z.enum(['Debit', 'Credit']),
  currentBalance: z.number().finite(),
  limit: z.number().finite().nonnegative('Limit must be greater than or equal to 0').optional(),
  isLimitLocked: z.boolean().optional().default(true),
  cardNumber: z.string().regex(/^(\*\*\*\* \d{4}|\d{16})$/, 'Card number must be 16 digits or masked standard (**** 1234)').optional(),
  isCanceled: z.boolean().optional().default(false),
  cardTheme: z.string().optional().default('obsidian'),
  isFrozen: z.boolean().optional().default(false)
});

// 3. Transaction Schema
export const TransactionSchema = z.object({
  id: z.string().min(1, 'ID is required'),
  type: z.enum(['income', 'expense', 'debt_payment', 'deposit', 'withdrawal', 'transfer']),
  title: z.string().min(3, 'Title is too short').max(100, 'Title is too long'),
  amount: z.number().finite().positive('Transaction amount must be a positive number'),
  charge: z.number().finite().nonnegative('Charge cannot be negative').optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Invalid date format (must be YYYY-MM-DD)'),
  category: z.string().min(1, 'Category is required'),
  accountId: z.string().optional(),
  accountType: z.enum(['cash', 'card']).optional(),
  targetAccountId: z.string().optional(),
  targetAccountType: z.enum(['cash', 'card']).optional(),
  referenceId: z.string().optional()
});

// 4. Debt & Payments Schemas
export const DebtPaymentSchema = z.object({
  id: z.string().min(1, 'ID is required'),
  debtId: z.string().min(1),
  amount: z.number().finite().positive('Payment must be positive'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  paidFromId: z.string().min(1),
  paidFromType: z.enum(['cash', 'card'])
});

export const DebtSchema = z.object({
  id: z.string().min(1, 'ID is required'),
  debtSource: z.string().min(3, 'Debt source too short').max(60),
  totalAmount: z.number().finite().positive('Total debt amount must be positive'),
  remainingAmount: z.number().finite().nonnegative(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  notes: z.string().max(500).default(''),
  payments: z.array(DebtPaymentSchema).default([]),
  accountId: z.string().optional(),
  accountType: z.enum(['cash', 'card']).optional(),
  accountName: z.string().optional(),
  status: z.enum(['Active', 'Closed', 'Fully Repaid']).optional().default('Active')
});

// 5. Subscription Schema
export const SubscriptionSchema = z.object({
  id: z.string().min(1, 'ID is required'),
  name: z.string().min(3, 'Name is too short').max(60),
  amount: z.number().finite().positive('Subscription charge must be positive'),
  billingCycle: z.enum(['Monthly', 'Yearly']),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  category: CategoryExpenseSchema,
  status: z.enum(['Active', 'Paused', 'Cancelled']).default('Active'),
  paymentMethodId: z.string().min(1),
  paymentMethodType: z.enum(['cash', 'card']),
  lastPaidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional()
});

// Helper function to safely run verification and format errors cleanly
export function validateData<T>(schema: z.Schema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  } else {
    const formattedError = result.error.issues.map(err => `${err.path.join('.') || 'Root'}: ${err.message}`).join('; ');
    return { success: false, error: formattedError };
  }
}
