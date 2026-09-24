import { useState, useMemo } from 'react';
import { Transaction } from '../types';

export function useTransactions(transactions: Transaction[]) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'INCOME' | 'EXPENSE' | 'TRANSFER'>('ALL');
  const [accountFilter, setAccountFilter] = useState('ALL');

  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = tx.title?.toLowerCase().includes(q);
        const matchesCategory = tx.category?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesCategory) return false;
      }
      if (categoryFilter !== 'ALL' && tx.category !== categoryFilter) {
        return false;
      }
      if (typeFilter !== 'ALL' && tx.type?.toUpperCase() !== typeFilter) {
        return false;
      }
      if (accountFilter !== 'ALL' && tx.accountId !== accountFilter) {
        return false;
      }
      return true;
    });
  }, [transactions, searchQuery, categoryFilter, typeFilter, accountFilter]);

  return {
    searchQuery,
    setSearchQuery,
    categoryFilter,
    setCategoryFilter,
    typeFilter,
    setTypeFilter,
    accountFilter,
    setAccountFilter,
    filteredTransactions
  };
}
