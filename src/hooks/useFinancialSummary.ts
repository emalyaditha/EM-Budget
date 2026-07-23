import { useMemo } from 'react';
import { AppState } from '../types';
import { accountService } from '../services/accountService';
import { transactionService } from '../services/transactionService';
import { analyticsService } from '../services/analyticsService';

export function useFinancialSummary(state: AppState) {
  const assets = useMemo(() => {
    return accountService.calculateTotalAssets(state.cashAccounts, state.cards);
  }, [state.cashAccounts, state.cards]);

  const liabilities = useMemo(() => {
    return accountService.calculateTotalLiabilities(state.cards, state.debts);
  }, [state.cards, state.debts]);

  const netWorth = assets - liabilities;

  const monthlyTotals = useMemo(() => {
    return transactionService.getMonthlyTotals(state.transactions);
  }, [state.transactions]);

  const monthlySubscriptionCost = useMemo(() => {
    return analyticsService.getMonthlySubscriptionCost(state.subscriptions || []);
  }, [state.subscriptions]);

  const debtProgress = useMemo(() => {
    const totalOriginalDebt = (state.debts || []).reduce((acc, d) => acc + d.totalAmount, 0);
    const totalRemainingDebt = (state.debts || []).reduce((acc, d) => acc + d.remainingAmount, 0);
    if (totalOriginalDebt === 0) return 100;
    const paid = totalOriginalDebt - totalRemainingDebt;
    return Math.round((paid / totalOriginalDebt) * 100);
  }, [state.debts]);

  return {
    assets,
    liabilities,
    netWorth,
    monthlyTotals,
    monthlySubscriptionCost,
    debtProgress,
  };
}
