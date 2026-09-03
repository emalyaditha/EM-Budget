import { describe, it, expect } from 'vitest';
import { parseReceiptText } from './utils/freeOcrParser';

describe('parseReceiptText (free OCR parser)', () => {
  it('extracts merchant title from the top non-generic line', () => {
    const result = parseReceiptText('Welcome to\nTAX INVOICE\nThe Coffee House\nSome street\nTotal: 12.50');
    expect(result.title).toBe('The Coffee House');
  });

  it('falls back to a generic title when all lines are generic labels', () => {
    const result = parseReceiptText('RECEIPT\nThank you\nwww.example.com');
    expect(result.title).toBe('Scanned Receipt');
  });

  it('extracts the amount from a TOTAL line', () => {
    const result = parseReceiptText('Grocery Mart\nTOTAL: 45.90\nCard **** 1234');
    expect(result.amount).toBe(45.9);
  });

  it('prefers the largest TOTAL match over generic two-decimal numbers', () => {
    const result = parseReceiptText('Items\n12.00\n18.50\nGRAND TOTAL: 98.75');
    expect(result.amount).toBe(98.75);
  });

  it('classifies restaurant/food text as the Food expense category', () => {
    const result = parseReceiptText('Burger King\nTotal: 9.99');
    expect(result.transactionType).toBe('expense');
    expect(result.category).toBe('Food');
  });

  it('classifies salary text as income / Salary', () => {
    const result = parseReceiptText('Acme Corp\nPAYSLIP\nSalary deposit\nGross: 5000.00');
    expect(result.transactionType).toBe('income');
    expect(result.category).toBe('Salary');
  });

  it('extracts a YYYY-MM-DD date from the text', () => {
    const result = parseReceiptText('Access Parking\n2024-05-14\nTotal: 4.00');
    expect(result.date).toBe('2024-05-14');
  });

  it('handles empty input gracefully without throwing', () => {
    const result = parseReceiptText('');
    expect(result.transactionType).toBe('expense');
    expect(result.amount).toBe(0);
    expect(result.category).toBe('Other');
  });

  it('keeps a second-decimal amount within the sensible range', () => {
    const result = parseReceiptText('Store\nAmount Due: 129.99');
    expect(result.amount).toBeLessThan(1000000);
    expect(result.amount).toBeCloseTo(129.99, 1);
  });
});