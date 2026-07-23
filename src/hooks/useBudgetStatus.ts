import { useMemo } from 'react';
import { Budget, Transaction } from '../types';

export function useBudgetStatus(budgets: Budget[] = [], transactions: Transaction[] = []) {
  const budgetStatuses = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const currentMonthExpenses = transactions.filter((tx) => {
      const d = new Date(tx.date);
      return (
        d.getMonth() === currentMonth &&
        d.getFullYear() === currentYear &&
        (tx.type === 'expense' || tx.type === 'credit_card_charge')
      );
    });

    return budgets.map((b) => {
      const actualSpent = currentMonthExpenses
        .filter((tx) => tx.category === b.category)
        .reduce((sum, tx) => sum + tx.amount, 0);

      const usageRatio = b.limit > 0 ? actualSpent / b.limit : 0;
      const percentage = Math.round(usageRatio * 100);

      let status: 'normal' | 'attention' | 'critical' = 'normal';
      if (percentage >= 90) {
        status = 'critical';
      } else if (percentage >= 80) {
        status = 'attention';
      }

      return {
        ...b,
        actualSpent,
        remaining: Math.max(0, b.limit - actualSpent),
        percentage,
        status,
      };
    });
  }, [budgets, transactions]);

  return { budgetStatuses };
}
