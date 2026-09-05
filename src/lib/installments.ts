import { BankCard, CreditCardInstallment, CreditCardInstallmentPayment } from '../types';

export const SAMPATH_ESP_FEES: Record<number, number> = {
  6: 0,
  12: 7.5,
  24: 15,
  48: 30,
};

export function calculateInstallmentFee(amount: number, tenureMonths: number): number {
  const feePercent = SAMPATH_ESP_FEES[tenureMonths] || 0;
  return Math.round(amount * feePercent / 100 * 100) / 100;
}

export function calculateMonthlyPayment(amount: number, tenureMonths: number): number {
  return Math.round(amount / tenureMonths * 100) / 100;
}

export function generateInstallmentSchedule(
  installmentId: string,
  monthlyPayment: number,
  tenureMonths: number,
  startDate: string
): Omit<CreditCardInstallmentPayment, 'id'>[] {
  const payments: Omit<CreditCardInstallmentPayment, 'id'>[] = [];
  const start = new Date(startDate);

  for (let i = 1; i <= tenureMonths; i++) {
    const dueDate = new Date(start);
    dueDate.setMonth(dueDate.getMonth() + i);

    payments.push({
      installmentId,
      paymentNumber: i,
      amountDue: monthlyPayment,
      amountPaid: 0,
      dueDate: dueDate.toISOString().split('T')[0],
      status: 'pending',
    });
  }
  return payments;
}

export function isCardEligibleForInstallment(
  card: BankCard,
  purchaseAmount: number
): { eligible: boolean; reason?: string } {
  if (card.cardType !== 'Credit') {
    return { eligible: false, reason: 'Only credit cards support installment plans' };
  }
  if (card.isCanceled) {
    return { eligible: false, reason: 'Card is cancelled' };
  }
  if (card.isFrozen) {
    return { eligible: false, reason: 'Card is frozen' };
  }
  if (purchaseAmount < 5000) {
    return { eligible: false, reason: 'Minimum installment amount is Rs. 5,000' };
  }
  const outstanding = card.currentBalance < 0 ? Math.abs(card.currentBalance) : 0;
  if (outstanding > (card.limit || 0)) {
    return {
      eligible: false,
      reason: `Card is over limit by Rs. ${(outstanding - (card.limit || 0)).toFixed(2)}. Pay down balance before creating installment plans.`,
    };
  }
  const available = (card.limit || 0) + card.currentBalance;
  if (purchaseAmount > available) {
    return { eligible: false, reason: `Purchase exceeds available credit of Rs. ${available.toFixed(2)}` };
  }
  return { eligible: true };
}

export function getInstallmentProgress(
  installment: CreditCardInstallment,
  payments: CreditCardInstallmentPayment[]
): { paid: number; total: number; percentage: number; nextDue: string | null } {
  const sorted = payments
    .filter(p => p.installmentId === installment.id)
    .sort((a, b) => a.paymentNumber - b.paymentNumber);

  const paid = sorted.filter(p => p.status === 'paid').length;
  const total = sorted.length;
  const percentage = total > 0 ? Math.round((paid / total) * 100) : 0;
  const nextPending = sorted.find(p => p.status === 'pending');

  return {
    paid,
    total,
    percentage,
    nextDue: nextPending?.dueDate || null,
  };
}

export function formatFeeBreakdown(amount: number, tenureMonths: number): {
  processingFee: number;
  monthlyPayment: number;
  totalCost: number;
  feePercent: number;
} {
  const processingFee = calculateInstallmentFee(amount, tenureMonths);
  const monthlyPayment = calculateMonthlyPayment(amount, tenureMonths);
  const totalCost = amount + processingFee;
  const feePercent = SAMPATH_ESP_FEES[tenureMonths] || 0;

  return { processingFee, monthlyPayment, totalCost, feePercent };
}
