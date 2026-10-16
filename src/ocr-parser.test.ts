import { describe, it, expect } from 'vitest';
import { parseReceiptText } from './utils/freeOcrParser';

const localToday = () => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

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

describe('amounts with thousands separators', () => {
  // The regression that made every scanned bill over 999 come out wrong: the
  // old parser matched "1,25" out of "1,250.00" and recorded Rs 1.25.
  it('reads a grouped total as the full amount', () => {
    expect(parseReceiptText('Keells Super\nTOTAL: 1,250.00').amount).toBe(1250);
  });

  it('reads a grouped total without decimals', () => {
    expect(parseReceiptText('Cargills\nGRAND TOTAL 12,350').amount).toBe(12350);
  });

  it('reads European grouping where the comma is the decimal point', () => {
    expect(parseReceiptText('Lidl\nTOTAL 1.250,00').amount).toBe(1250);
  });

  it('reads lakh grouping', () => {
    expect(parseReceiptText('Ceylinco\nTotal 1,25,000').amount).toBe(125000);
  });

  it('keeps a plain two-decimal total', () => {
    expect(parseReceiptText('Shop\nTotal: 950.00').amount).toBe(950);
  });

  it('takes the grand total over a larger subtotal', () => {
    const text = 'Hotel\nSubtotal 1,300.00\nDiscount 350.00\nGRAND TOTAL 950.00';
    expect(parseReceiptText(text).amount).toBe(950);
  });

  it('ignores tendered cash and change', () => {
    const text = 'Grocery Mart\nCASH 2,000.00\nCHANGE 750.00\nTOTAL 1,250.00';
    expect(parseReceiptText(text).amount).toBe(1250);
  });

  it('ignores a card number fragment when a total exists', () => {
    const text = 'Pickme\nTotal: 950.00\nVISA **** 4321 8,000.00';
    expect(parseReceiptText(text).amount).toBe(950);
  });

  it('finds the total when the label and the figure wrap onto separate lines', () => {
    const text = 'Aroma Super\nGRAND TOTAL\n1,250.00\nVAT 187.50';
    expect(parseReceiptText(text).amount).toBe(1250);
  });

  it('never treats a percentage as an amount', () => {
    const text = 'Pharmacy\nTotal: 2,450.00\nGST 10%';
    expect(parseReceiptText(text).amount).toBe(2450);
  });

  it('falls back to the largest plain figure when nothing is labelled', () => {
    expect(parseReceiptText('Corner Shop\nRice 350.00\nMilk 480.50').amount).toBe(480.5);
  });
});

describe('dates', () => {
  // Both halves of the original bug: JS read 02/10/2026 as 10 February, and
  // toISOString() then shifted it a day earlier at UTC+05:30.
  it('reads day-first numeric dates', () => {
    expect(parseReceiptText('Shop\n02/10/2026\nTotal: 100.00').date).toBe('2026-10-02');
  });

  it('reads dotted dates instead of silently using today', () => {
    expect(parseReceiptText('Shop\n15.10.2026\nTotal: 100.00').date).toBe('2026-10-15');
  });

  it('resolves an ambiguous date as day-first for a rupee ledger', () => {
    expect(parseReceiptText('Shop\n10/11/2026\nTotal: 100.00', { currency: 'Rs.' }).date).toBe('2026-11-10');
  });

  it('resolves an ambiguous date as month-first for a dollar ledger', () => {
    expect(parseReceiptText('Shop\n10/11/2026\nTotal: 100.00', { currency: '$' }).date).toBe('2026-10-11');
  });

  it('does not need a hint when only one order is valid', () => {
    expect(parseReceiptText('Shop\n25/03/2026\nTotal: 100.00', { currency: '$' }).date).toBe('2026-03-25');
  });

  it('reads both month-name orders', () => {
    expect(parseReceiptText('Shop\nOct 2, 2026\nTotal: 100.00').date).toBe('2026-10-02');
    expect(parseReceiptText('Shop\n2 October 2026\nTotal: 100.00').date).toBe('2026-10-02');
  });

  it('rejects an impossible date and falls back to today rather than corrupting it', () => {
    expect(parseReceiptText('Shop\n31/02/2026\nTotal: 100.00').date).toBe(localToday());
  });

  it('defaults to the local calendar day, not the UTC one', () => {
    // A receipt with no date at all must not land on the previous day for a
    // user east of Greenwich.
    expect(parseReceiptText('Shop\nTotal: 100.00').date).toBe(localToday());
  });

  it('ignores a phone number that looks numeric but is not a date', () => {
    expect(parseReceiptText('Shop\nTel 0112 345 678\nTotal: 100.00').date).toBe(localToday());
  });
});

describe('income vs expense', () => {
  // Inverting the sign is the worst thing a scan can do to a budget.
  it('keeps a "non-refundable" notice on an expense', () => {
    const result = parseReceiptText('AROMA SUPER MARKET\nNon-refundable\nTotal: 2,450.00');
    expect(result.transactionType).toBe('expense');
  });

  it('keeps a "Buy 1 Get 1 Bonus Gift" offer on an expense', () => {
    expect(parseReceiptText('KFC\nBuy 1 Get 1 Bonus Gift\nTotal: 1,890.00').transactionType).toBe('expense');
  });

  it('keeps an advance deposit on a hotel bill as an expense', () => {
    const text = 'Hotel Reservations\nAdvance deposit received\nCASH 5,000.00\nTOTAL 15,000.00';
    expect(parseReceiptText(text).transactionType).toBe('expense');
  });

  it('does not read a bank "deposit" line on a statement-style bill as income', () => {
    expect(parseReceiptText('Petrol Station\nBag deposit 50.00\nTotal: 6,200.00').transactionType).toBe('expense');
  });

  it('reads an issued refund as income', () => {
    expect(parseReceiptText('Book Store\nRefund issued to your card\n1,500.00').transactionType).toBe('income');
  });

  it('reads a credit note as income', () => {
    expect(parseReceiptText('Supplier\nCREDIT NOTE\nAmount 12,500.00').transactionType).toBe('income');
  });
});

describe('categories and titles', () => {
  // The old rules had no word boundaries, so /bus/ matched BUSINESS.
  it('does not categorise "BUSINESS LUNCHEON" as Transport', () => {
    expect(parseReceiptText('Grand Pass\nBUSINESS LUNCHEON\nTotal: 800.00').category).not.toBe('Transport');
  });

  it('does not categorise a butchers as Shopping via a substring', () => {
    expect(parseReceiptText('BUTCHERS\nBeef 1,200.00\nTotal: 1,200.00').category).toBe('Food');
  });

  it('prefers the merchant heading over a product line', () => {
    const text = 'Navaloka Pharmacy\nRice 120.00\nParacetamol 340.00\nTotal: 460.00';
    expect(parseReceiptText(text).category).toBe('Medical');
  });

  it('takes the merchant from a header that also carries a date', () => {
    const text = 'AROMA SUPER - Date: 02/10/2026\n123 Galle Road Colombo\nTotal: 500.00';
    const result = parseReceiptText(text);
    expect(result.title).toBe('AROMA SUPER');
    expect(result.date).toBe('2026-10-02');
  });

  it('skips an address line rather than using it as the merchant', () => {
    const text = 'SUPER SAVE\nNo 42, Main Road, Negombo\nTotal: 500.00';
    expect(parseReceiptText(text).title).toBe('SUPER SAVE');
  });

  it('never uses the total line as the merchant', () => {
    const text = 'Welcome!\nThank you for shopping\nTel: 0112 345 678\nTotal: 500.00';
    expect(parseReceiptText(text).title).toBe('Scanned Receipt');
  });
});

describe('realistic garbled scan', () => {
  it('survives lowercase l-for-1 and lost separators', () => {
    // The digit garble is the realistic failure: OCR reads a 1 as a lowercase L
    // on thermal print, which is exactly where the old separator handling broke.
    const text = [
      'KEELLS SUPER',
      'NO 12B GALLE RD',
      'DATE : 02/10/2026  14:22',
      'BASMATI RICE  5Kg   l,250.00',
      'FRESH MILK lL      480.00',
      'SUBTOTAL        l,730.00',
      'DISCOUNT          80.00',
      'TOTAL           Rs. 1,650.00',
      'CASH            2,000.00',
      'CHANGE            350.00',
      'THANK YOU. NO REFUNDS AFTER 7 DAYS',
    ].join('\n');
    const result = parseReceiptText(text, { currency: 'Rs.' });
    expect(result.title).toBe('KEELLS SUPER');
    expect(result.date).toBe('2026-10-02');
    expect(result.amount).toBe(1650);
    expect(result.transactionType).toBe('expense');
    expect(result.category).toBe('Shopping');
  });
});
