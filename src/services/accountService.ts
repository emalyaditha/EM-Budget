import { CashAccount, BankCard, Debt, AppState } from '../types';

export const accountService = {
  calculateTotalAssets: (cashAccounts: CashAccount[], cards: BankCard[]): number => {
    const cashTotal = cashAccounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);
    const debitTotal = cards
      .filter((card) => card.cardType === 'Debit' && !card.isCanceled)
      .reduce((sum, card) => sum + (card.currentBalance || 0), 0);

    return cashTotal + debitTotal;
  },

  calculateTotalLiabilities: (cards: BankCard[], debts: Debt[]): number => {
    const creditCardOwed = cards
      .filter((card) => card.cardType === 'Credit' && !card.isCanceled)
      .reduce((sum, card) => sum + (card.currentBalance || 0), 0);

    const activeDebts = debts
      .filter((debt) => debt.status !== 'Closed' && debt.status !== 'Fully Repaid')
      .reduce((sum, debt) => sum + (debt.remainingAmount || 0), 0);

    return creditCardOwed + activeDebts;
  },

  calculateNetWorth: (cashAccounts: CashAccount[], cards: BankCard[], debts: Debt[]): number => {
    const assets = accountService.calculateTotalAssets(cashAccounts, cards);
    const liabilities = accountService.calculateTotalLiabilities(cards, debts);
    return assets - liabilities;
  },
};
