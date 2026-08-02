import { describe, it, expect } from 'vitest';
import { addMoney, subtractMoney, multiplyMoney, compareMoney, sumMoney, toMinorUnits, fromMinorUnits } from './lib/money';

describe('Money helpers (integer minor units)', () => {
  it('addMoney avoids float drift', () => {
    expect(addMoney(0.1, 0.2)).toBe(0.3);
    expect(addMoney(10.05, 20.10)).toBe(30.15);
  });

  it('subtractMoney avoids float drift', () => {
    expect(subtractMoney(0.3, 0.1)).toBe(0.2);
    expect(subtractMoney(100.50, 50.25)).toBe(50.25);
  });

  it('multiplyMoney produces correct results', () => {
    expect(multiplyMoney(10.25, 3)).toBe(30.75);
    expect(multiplyMoney(0.10, 0.5)).toBe(0.05);
  });

  it('compareMoney correctly orders values', () => {
    expect(compareMoney(10.00, 10.00)).toBe(0);
    expect(compareMoney(10.00, 5.00)).toBeGreaterThan(0);
    expect(compareMoney(5.00, 10.00)).toBeLessThan(0);
  });

  it('sumMoney returns correct total', () => {
    expect(sumMoney([10.50, 20.25, 30.10])).toBe(60.85);
    expect(sumMoney([])).toBe(0);
    expect(sumMoney([0.1, 0.2, 0.3])).toBe(0.6);
  });

  it('toMinorUnits and fromMinorUnits round-trip', () => {
    const original = 123.45;
    expect(fromMinorUnits(toMinorUnits(original))).toBe(original);
    expect(toMinorUnits(original)).toBe(12345);
  });

  it('addMoney handles credit card overpayment scenario', () => {
    const outstanding = 500.00;
    const payment = 750.00;
    const overpayment = subtractMoney(payment, outstanding);
    expect(overpayment).toBe(250.00);
    const resultingBalance = addMoney(-outstanding, payment);
    expect(resultingBalance).toBe(250.00);
  });

  it('sumMoney handles many small values without drift', () => {
    const amounts = Array.from({ length: 100 }, () => 0.01);
    expect(sumMoney(amounts)).toBe(1.00);
  });
});

describe('Credit card payment logic (pure functions)', () => {
  function computeOverpayment(currentBalance: number, amount: number): number {
    if (currentBalance >= 0) return 0;
    const outstanding = Math.abs(currentBalance);
    return amount > outstanding ? subtractMoney(amount, outstanding) : 0;
  }

  function applyCardPayment(currentBalance: number, paymentAmount: number): number {
    return addMoney(currentBalance, paymentAmount);
  }

  it('detects overpayment correctly', () => {
    expect(computeOverpayment(-300, 500)).toBe(200);
    expect(computeOverpayment(-300, 300)).toBe(0);
    expect(computeOverpayment(-300, 200)).toBe(0);
    expect(computeOverpayment(100, 50)).toBe(0);
    expect(computeOverpayment(0, 100)).toBe(0);
    expect(computeOverpayment(-500, 600)).toBe(100);
  });

  it('applies payment to reduce debt', () => {
    expect(applyCardPayment(-500, 200)).toBe(-300);
    expect(applyCardPayment(-500, 500)).toBe(0);
    expect(applyCardPayment(-500, 600)).toBe(100);
  });

  it('applies payment from source card (increases source debt)', () => {
    const sourceBalance = -200;
    const paymentFromSource = 300;
    expect(applyCardPayment(sourceBalance, -paymentFromSource)).toBe(-500);
  });

  it('handles edge: payment exactly equals outstanding', () => {
    expect(computeOverpayment(-500, 500)).toBe(0);
    expect(applyCardPayment(-500, 500)).toBe(0);
  });
});

describe('Debt increase logic (pure functions)', () => {
  function increaseDebt(currentRemaining: number, additionalAmount: number): number {
    return addMoney(currentRemaining, additionalAmount);
  }

  it('increases remaining debt correctly', () => {
    expect(increaseDebt(1000, 500)).toBe(1500);
    expect(increaseDebt(0, 500)).toBe(500);
  });

  it('increases total debt and remaining debt consistently', () => {
    const total = 2000;
    const remaining = 1500;
    const addition = 500;
    expect(addMoney(total, addition)).toBe(2500);
    expect(increaseDebt(remaining, addition)).toBe(2000);
  });
});

describe('Transfer logic (pure functions)', () => {
  function transfer(fromBalance: number, toBalance: number, amount: number, fee: number = 0): { from: number; to: number } {
    return {
      from: subtractMoney(fromBalance, addMoney(amount, fee)),
      to: addMoney(toBalance, amount),
    };
  }

  it('transfers money between accounts', () => {
    const result = transfer(1000, 500, 200);
    expect(result.from).toBe(800);
    expect(result.to).toBe(700);
  });

  it('handles transfer with fee', () => {
    const result = transfer(1000, 500, 200, 5.50);
    expect(result.from).toBe(794.50);
    expect(result.to).toBe(700);
  });

  it('handles zero-amount transfer', () => {
    const result = transfer(1000, 500, 0);
    expect(result.from).toBe(1000);
    expect(result.to).toBe(500);
  });
});
