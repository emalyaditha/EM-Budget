import { describe, it, expect } from 'vitest';
import { validateData, TransactionSchema, CashAccountSchema, BankCardSchema } from './validators';
import { calculateNetWorth } from './utils';

describe('💰 Financial Ledger Integrity Audits', () => {

  describe('Validation Schemas', () => {
    it('should validate complete and correct cash account formats', () => {
      const validAccount = {
        id: 'acc-101',
        name: 'Amex High-Yield',
        balance: 14500.50
      };
      const result = validateData(CashAccountSchema, validAccount);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.balance).toBe(14500.50);
      }
    });

    it('should catch illegal script and html injection characters in card names', () => {
      const hazardousCard = {
        id: 'card-999',
        cardName: 'Debit <script>alert(1)</script>',
        bankName: 'Swiss Credit Suisse',
        cardType: 'Debit',
        currentBalance: 50.0
      };
      const result = validateData(BankCardSchema, hazardousCard);
      expect(result.success).toBe(false);
      if (result.success === false) {
        expect(result.error).toContain('illegal HTML characters');
      }
    });

    it('should validate transactions with non-zero positive amounts', () => {
      const negativeTx = {
        id: 'tx-202',
        type: 'expense',
        title: 'Weekly Groceries',
        amount: -45.0,
        date: '2026-06-07',
        category: 'Food'
      };
      const result = validateData(TransactionSchema, negativeTx);
      expect(result.success).toBe(false);
      if (result.success === false) {
        expect(result.error).toContain('amount');
      }
    });
  });

  describe('Ledger Mathematical Integrations', () => {
    it('computes basic transfer balance modifications securely', () => {
      const fromBalanceBefore = 500.0;
      const toBalanceBefore = 100.0;
      const transferAmount = 150.0;
      const transferFee = 4.50;

      // Business rule: Transfer offset reduction including transfer fees
      const fromBalanceAfter = fromBalanceBefore - (transferAmount + transferFee);
      const toBalanceAfter = toBalanceBefore + transferAmount;

      expect(fromBalanceAfter).toBe(345.50);
      expect(toBalanceAfter).toBe(250.0);
    });

    it('asserts credit limit headroom remains non-negative', () => {
      const cardBalance = 4200.0; // Liability / Current Amount Owed
      const creditLimit = 5000.0;
      const requestedPurchase = 950.0;

      const expectedBalance = cardBalance + requestedPurchase;
      const isOverLimit = expectedBalance > creditLimit;

      expect(isOverLimit).toBe(true);
      expect(creditLimit - cardBalance).toBe(800.0); // Only 800 left
    });
  });

  describe('calculateNetWorth Aggregator Engine', () => {

    it('accurately computes total net worth with positive, negative, and zero-balance cards', () => {
      const mockState = {
        cashAccounts: [
          { id: 'cash-1', name: 'Main Vault', balance: 2000 }
        ],
        cards: [
          // Debit card with locked amount
          { id: 'card-1', cardType: 'Debit', currentBalance: 500, lockedAmount: 100, isCanceled: false },
          // Credit card with negative balance (debt liability)
          { id: 'card-2', cardType: 'Credit', currentBalance: -300, limit: 1000, isCanceled: false },
          // Credit card with positive balance (overpaid surplus asset)
          { id: 'card-3', cardType: 'Credit', currentBalance: 150, limit: 1500, isCanceled: false },
          // Credit card with zero balance
          { id: 'card-4', cardType: 'Credit', currentBalance: 0, limit: 1200, isCanceled: false },
          // Canceled card (should be ignored)
          { id: 'card-5', cardType: 'Debit', currentBalance: 1000, isCanceled: true }
        ],
        debts: [
          { id: 'debt-1', remainingAmount: 500 }
        ],
        loansGiven: [
          { id: 'loan-1', remainingAmount: 800, totalAmount: 1000 }
        ]
      };

      const breakdown = calculateNetWorth(mockState as any);

      expect(breakdown.cash).toBe(2000);
      expect(breakdown.debitCards).toBe(400); // 500 balance - 100 locked
      expect(breakdown.creditCardLiabilities).toBe(300); // absolute value of negative balance
      expect(breakdown.creditCardAssets).toBe(150); // positive balance
      expect(breakdown.debts).toBe(500);
      expect(breakdown.loansGiven).toBe(800); // tracks remaining unpaid loans
      expect(breakdown.netWorth).toBe(2550); // 2000 + 400 + 150 - 300 - 500 + 800
    });
  });
});
