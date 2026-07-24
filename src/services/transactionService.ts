import { Transaction, Income, Expense, DebtPayment, AppState } from '../types';

export const transactionService = {
  getFilteredTransactions: (
    transactions: Transaction[],
    searchQuery: string = '',
    categoryFilter: string = 'all',
    typeFilter: string = 'all',
    accountFilter: string = 'all'
  ): Transaction[] => {
    return transactions.filter((tx) => {
      const matchesSearch =
        searchQuery === '' ||
        tx.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tx.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tx.amount.toString().includes(searchQuery);

      const matchesCategory = categoryFilter === 'all' || tx.category === categoryFilter;
      const matchesType = typeFilter === 'all' || tx.type === typeFilter;
      const matchesAccount =
        accountFilter === 'all' ||
        tx.accountId === accountFilter ||
        tx.targetAccountId === accountFilter;

      return matchesSearch && matchesCategory && matchesType && matchesAccount;
    });
  },

  sortTransactionsByDate: (transactions: Transaction[], order: 'asc' | 'desc' = 'desc'): Transaction[] => {
    return [...transactions].sort((a, b) => {
      const timeA = new Date(a.date).getTime();
      const timeB = new Date(b.date).getTime();
      if (!isNaN(timeA) && !isNaN(timeB) && timeA !== timeB) {
        return order === 'desc' ? timeB - timeA : timeA - timeB;
      }

      const dateCompare = (b.date || '').localeCompare(a.date || '');
      if (dateCompare !== 0) {
        return order === 'desc' ? dateCompare : -dateCompare;
      }

      const aNum = parseInt((a.id || '').replace(/\D/g, ''), 10);
      const bNum = parseInt((b.id || '').replace(/\D/g, ''), 10);
      if (!isNaN(aNum) && !isNaN(bNum) && aNum !== bNum) {
        return order === 'desc' ? bNum - aNum : aNum - bNum;
      }

      return order === 'desc' ? (b.id || '').localeCompare(a.id || '') : (a.id || '').localeCompare(b.id || '');
    });
  },

  getMonthlyTotals: (transactions: Transaction[]) => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const monthlyTx = transactions.filter((tx) => {
      const d = new Date(tx.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    const income = monthlyTx
      .filter((tx) => tx.type === 'income' || tx.type === 'deposit')
      .reduce((acc, tx) => acc + tx.amount, 0);

    const expense = monthlyTx
      .filter((tx) => tx.type === 'expense' || tx.type === 'credit_card_charge' || tx.type === 'withdrawal')
      .reduce((acc, tx) => acc + tx.amount, 0);

    return { income, expense, netCashFlow: income - expense };
  },
};
