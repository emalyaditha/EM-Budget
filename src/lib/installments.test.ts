import { describe, it, expect } from 'vitest';
import {
  calculateInstallmentFee,
  calculateMonthlyPayment,
  generateInstallmentSchedule,
  isCardEligibleForInstallment,
  getInstallmentProgress,
  formatFeeBreakdown,
  SAMPATH_ESP_FEES,
} from './installments';
import { BankCard, CreditCardInstallment, CreditCardInstallmentPayment } from '../types';

describe('installments', () => {
  describe('calculateInstallmentFee', () => {
    it('returns 0 for 6-month plan', () => {
      expect(calculateInstallmentFee(50000, 6)).toBe(0);
    });

    it('calculates 7.5% fee for 12-month plan', () => {
      expect(calculateInstallmentFee(50000, 12)).toBe(3750);
    });

    it('calculates 15% fee for 24-month plan', () => {
      expect(calculateInstallmentFee(50000, 24)).toBe(7500);
    });

    it('calculates 30% fee for 48-month plan', () => {
      expect(calculateInstallmentFee(50000, 48)).toBe(15000);
    });

    it('rounds fee to 2 decimal places', () => {
      expect(calculateInstallmentFee(3333, 12)).toBe(249.98);
    });

    it('returns 0 for unknown tenure', () => {
      expect(calculateInstallmentFee(50000, 36 as any)).toBe(0);
    });
  });

  describe('calculateMonthlyPayment', () => {
    it('divides amount by tenure', () => {
      expect(calculateMonthlyPayment(50000, 6)).toBeCloseTo(8333.33, 1);
      expect(calculateMonthlyPayment(50000, 12)).toBeCloseTo(4166.67, 1);
      expect(calculateMonthlyPayment(50000, 24)).toBeCloseTo(2083.33, 1);
      expect(calculateMonthlyPayment(50000, 48)).toBeCloseTo(1041.67, 1);
    });

    it('rounds to 2 decimal places', () => {
      expect(calculateMonthlyPayment(10000, 6)).toBe(1666.67);
    });
  });

  describe('generateInstallmentSchedule', () => {
    it('generates correct number of payments', () => {
      const schedule = generateInstallmentSchedule('inst-1', 5000, 6, '2026-09-05');
      expect(schedule).toHaveLength(6);
    });

    it('sets correct payment numbers', () => {
      const schedule = generateInstallmentSchedule('inst-1', 5000, 6, '2026-09-05');
      schedule.forEach((p, i) => {
        expect(p.paymentNumber).toBe(i + 1);
      });
    });

    it('sets correct installmentId', () => {
      const schedule = generateInstallmentSchedule('inst-1', 5000, 6, '2026-09-05');
      schedule.forEach(p => {
        expect(p.installmentId).toBe('inst-1');
      });
    });

    it('sets correct due dates (monthly from start)', () => {
      const schedule = generateInstallmentSchedule('inst-1', 5000, 3, '2026-09-05');
      expect(schedule[0].dueDate).toBe('2026-10-05');
      expect(schedule[1].dueDate).toBe('2026-11-05');
      expect(schedule[2].dueDate).toBe('2026-12-05');
    });

    it('initializes with pending status', () => {
      const schedule = generateInstallmentSchedule('inst-1', 5000, 6, '2026-09-05');
      schedule.forEach(p => {
        expect(p.status).toBe('pending');
        expect(p.amountPaid).toBe(0);
      });
    });

    it('does not include id field', () => {
      const schedule = generateInstallmentSchedule('inst-1', 5000, 6, '2026-09-05');
      schedule.forEach(p => {
        expect(p).not.toHaveProperty('id');
      });
    });
  });

  describe('isCardEligibleForInstallment', () => {
    const creditCard: BankCard = {
      id: 'card-1',
      cardName: 'Sampath Visa',
      bankName: 'Sampath',
      cardType: 'Credit',
      currentBalance: -20000,
      limit: 50000,
    };

    const debitCard: BankCard = {
      id: 'card-2',
      cardName: 'Debit Card',
      bankName: 'Sampath',
      cardType: 'Debit',
      currentBalance: 10000,
    };

    it('rejects non-credit cards', () => {
      const result = isCardEligibleForInstallment(debitCard, 10000);
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('Only credit cards');
    });

    it('accepts valid credit card with sufficient limit', () => {
      const result = isCardEligibleForInstallment(creditCard, 10000);
      expect(result.eligible).toBe(true);
    });

    it('rejects cancelled cards', () => {
      const card = { ...creditCard, isCanceled: true };
      const result = isCardEligibleForInstallment(card, 10000);
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('cancelled');
    });

    it('rejects frozen cards', () => {
      const card = { ...creditCard, isFrozen: true };
      const result = isCardEligibleForInstallment(card, 10000);
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('frozen');
    });

    it('rejects amounts below minimum (Rs. 5,000)', () => {
      const result = isCardEligibleForInstallment(creditCard, 4999);
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('Minimum');
    });

    it('accepts amounts at minimum (Rs. 5,000)', () => {
      const result = isCardEligibleForInstallment(creditCard, 5000);
      expect(result.eligible).toBe(true);
    });

    it('rejects over-limit cards', () => {
      const overLimitCard = { ...creditCard, currentBalance: -55000, limit: 50000 };
      const result = isCardEligibleForInstallment(overLimitCard, 10000);
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('over limit');
    });

    it('rejects when purchase exceeds available credit', () => {
      // Available = 50000 + (-20000) = 30000
      const result = isCardEligibleForInstallment(creditCard, 35000);
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('exceeds available');
    });
  });

  describe('getInstallmentProgress', () => {
    const installment: CreditCardInstallment = {
      id: 'inst-1',
      cardId: 'card-1',
      purchaseId: 'ccp-1',
      originalAmount: 30000,
      tenureMonths: 6,
      processingFee: 0,
      monthlyPayment: 5000,
      startDate: '2026-09-05',
      status: 'active',
      nextPaymentDate: '2026-12-05',
      paymentsMade: 3,
    };

    const payments: CreditCardInstallmentPayment[] = [
      { id: 'p1', installmentId: 'inst-1', paymentNumber: 1, amountDue: 5000, amountPaid: 5000, dueDate: '2026-10-05', paidDate: '2026-10-04', status: 'paid' },
      { id: 'p2', installmentId: 'inst-1', paymentNumber: 2, amountDue: 5000, amountPaid: 5000, dueDate: '2026-11-05', paidDate: '2026-11-03', status: 'paid' },
      { id: 'p3', installmentId: 'inst-1', paymentNumber: 3, amountDue: 5000, amountPaid: 5000, dueDate: '2026-12-05', paidDate: '2026-12-05', status: 'paid' },
      { id: 'p4', installmentId: 'inst-1', paymentNumber: 4, amountDue: 5000, amountPaid: 0, dueDate: '2027-01-05', status: 'pending' },
      { id: 'p5', installmentId: 'inst-1', paymentNumber: 5, amountDue: 5000, amountPaid: 0, dueDate: '2027-02-05', status: 'pending' },
      { id: 'p6', installmentId: 'inst-1', paymentNumber: 6, amountDue: 5000, amountPaid: 0, dueDate: '2027-03-05', status: 'pending' },
    ];

    it('returns correct paid count', () => {
      const progress = getInstallmentProgress(installment, payments);
      expect(progress.paid).toBe(3);
    });

    it('returns correct total count', () => {
      const progress = getInstallmentProgress(installment, payments);
      expect(progress.total).toBe(6);
    });

    it('returns correct percentage', () => {
      const progress = getInstallmentProgress(installment, payments);
      expect(progress.percentage).toBe(50);
    });

    it('returns next pending due date', () => {
      const progress = getInstallmentProgress(installment, payments);
      expect(progress.nextDue).toBe('2027-01-05');
    });

    it('returns null nextDue when all paid', () => {
      const allPaid = payments.map(p => ({ ...p, status: 'paid' as const }));
      const progress = getInstallmentProgress(installment, allPaid);
      expect(progress.nextDue).toBeNull();
    });

    it('handles installment with no payments', () => {
      const progress = getInstallmentProgress(installment, []);
      expect(progress.paid).toBe(0);
      expect(progress.total).toBe(0);
      expect(progress.percentage).toBe(0);
      expect(progress.nextDue).toBeNull();
    });
  });

  describe('formatFeeBreakdown', () => {
    it('returns correct breakdown for 6-month plan', () => {
      const breakdown = formatFeeBreakdown(50000, 6);
      expect(breakdown.processingFee).toBe(0);
      expect(breakdown.monthlyPayment).toBeCloseTo(8333.33, 1);
      expect(breakdown.totalCost).toBe(50000);
      expect(breakdown.feePercent).toBe(0);
    });

    it('returns correct breakdown for 12-month plan', () => {
      const breakdown = formatFeeBreakdown(50000, 12);
      expect(breakdown.processingFee).toBe(3750);
      expect(breakdown.totalCost).toBe(53750);
      expect(breakdown.feePercent).toBe(7.5);
    });

    it('returns correct breakdown for 24-month plan', () => {
      const breakdown = formatFeeBreakdown(50000, 24);
      expect(breakdown.processingFee).toBe(7500);
      expect(breakdown.totalCost).toBe(57500);
      expect(breakdown.feePercent).toBe(15);
    });

    it('returns correct breakdown for 48-month plan', () => {
      const breakdown = formatFeeBreakdown(50000, 48);
      expect(breakdown.processingFee).toBe(15000);
      expect(breakdown.totalCost).toBe(65000);
      expect(breakdown.feePercent).toBe(30);
    });
  });
});
