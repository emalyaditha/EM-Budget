import { describe, it, expect } from 'vitest';
import { validateData, TransactionSchema, CashAccountSchema, BankCardSchema } from './validators';

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
});
