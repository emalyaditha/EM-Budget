import { Transaction, CategoryExpense, Subscription } from '../types';

export const analyticsService = {
  getExpensesByCategory: (transactions: Transaction[]) => {
    const expenses = transactions.filter(
      (tx) => tx.type === 'expense' || tx.type === 'credit_card_charge' || tx.type === 'withdrawal'
    );

    const categoryMap: Record<string, number> = {};

    expenses.forEach((tx) => {
      const cat = tx.category || 'Other';
      categoryMap[cat] = (categoryMap[cat] || 0) + tx.amount;
    });

    return Object.entries(categoryMap).map(([name, value]) => ({
      name,
      value,
    }));
  },

  getMonthlySubscriptionCost: (subscriptions: Subscription[]): number => {
    return subscriptions
      .filter((sub) => sub.status === 'Active')
      .reduce((sum, sub) => {
        if (sub.billingCycle === 'Monthly') {
          return sum + sub.amount;
        } else if (sub.billingCycle === 'Yearly') {
          return sum + sub.amount / 12;
        }
        return sum + sub.amount;
      }, 0);
  },
};
