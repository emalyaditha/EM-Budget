import { useMemo } from 'react';
import { CashAccount, BankCard, Debt } from '../types';
import { accountService } from '../services/accountService';

export function useAccounts(cashAccounts: CashAccount[], cards: BankCard[], debts: Debt[] = []) {
  const totalAssets = useMemo(() => {
    return accountService.calculateTotalAssets(cashAccounts, cards);
  }, [cashAccounts, cards]);

  const totalLiabilities = useMemo(() => {
    return accountService.calculateTotalLiabilities(cards, debts);
  }, [cards, debts]);

  const netWorth = useMemo(() => {
    return accountService.calculateNetWorth(cashAccounts, cards, debts);
  }, [cashAccounts, cards, debts]);

  return {
    totalAssets,
    totalLiabilities,
    netWorth,
  };
}
