import { useMemo, useState } from 'react';
import { Transaction } from '../types';
import { transactionService } from '../services/transactionService';

export function useTransactions(transactions: Transaction[]) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState('all');

  const filteredTransactions = useMemo(() => {
    const filtered = transactionService.getFilteredTransactions(
      transactions,
      searchQuery,
      categoryFilter,
      typeFilter,
      accountFilter
    );
    return transactionService.sortTransactionsByDate(filtered, 'desc');
  }, [transactions, searchQuery, categoryFilter, typeFilter, accountFilter]);

  const monthlyTotals = useMemo(() => {
    return transactionService.getMonthlyTotals(transactions);
  }, [transactions]);

  return {
    searchQuery,
    setSearchQuery,
    categoryFilter,
    setCategoryFilter,
    typeFilter,
    setTypeFilter,
    accountFilter,
    setAccountFilter,
    filteredTransactions,
    monthlyTotals,
  };
}
