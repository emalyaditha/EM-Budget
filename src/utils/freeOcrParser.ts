export interface ScannedTransaction {
  transactionType: 'income' | 'expense';
  title: string;
  amount: number;
  date: string;
  category: string;
  description: string;
  bankCharge?: number;
  rawText?: string;
}

/**
 * Parses raw OCR text extracted from a receipt/bill image into a structured transaction.
 */
export function parseReceiptText(rawText: string): ScannedTransaction {
  const lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // 1. Identify Merchant / Title (usually one of the first few lines that isn't just numbers/dates)
  let title = 'Scanned Receipt';
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const line = lines[i];
    // Skip lines with generic receipt labels
    if (
      !/receipt|tax invoice|cash bill|welcome|thank you|tel|phone|www\.|http|date|time/i.test(
        line
      ) &&
      line.replace(/[^a-zA-Z]/g, '').length >= 3
    ) {
      title = line.replace(/[^a-zA-Z0-9 &',.-]/g, '').substring(0, 40);
      break;
    }
  }

  // 2. Extract Date (YYYY-MM-DD or MM/DD/YYYY or DD-MM-YYYY or Mon DD YYYY)
  let date = new Date().toISOString().split('T')[0]; // Default to today
  const dateRegexes = [
    /\b(20\d{2})[-/.](0[1-9]|1[0-2])[-/.](0[1-9]|[12]\d|3[01])\b/, // YYYY-MM-DD
    /\b(0[1-9]|1[0-2])[-/.](0[1-9]|[12]\d|3[01])[-/.](20\d{2})\b/, // MM/DD/YYYY
    /\b(0[1-9]|[12]\d|3[01])[-/.](0[1-9]|1[0-2])[-/.](20\d{2})\b/, // DD/MM/YYYY
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(0[1-9]|[12]\d|3[01]),?\s+(20\d{2})\b/i,
  ];

  for (const regex of dateRegexes) {
    const match = rawText.match(regex);
    if (match) {
      try {
        const parsedDate = new Date(match[0]);
        if (!isNaN(parsedDate.getTime())) {
          date = parsedDate.toISOString().split('T')[0];
          break;
        }
      } catch {
        // Fallback to today
      }
    }
  }

  // 3. Extract Amount
  let amount = 0;
  // Look specifically for lines containing TOTAL, NET, AMOUNT DUE, BALANCE DUE, PAID
  const totalLineRegex = /(?:total|net|amount due|balance due|grand total|paid|amount)\b[:\s]*[$€£₹Rp]?[ba\s]*([0-9]{1,6}(?:[.,][0-9]{2})?)/gi;
  let totalMatches: number[] = [];
  let lineMatch;

  while ((lineMatch = totalLineRegex.exec(rawText)) !== null) {
    if (lineMatch[1]) {
      const parsedVal = parseFloat(lineMatch[1].replace(',', '.'));
      if (!isNaN(parsedVal) && parsedVal > 0) {
        totalMatches.push(parsedVal);
      }
    }
  }

  if (totalMatches.length > 0) {
    // Usually the largest or last explicit TOTAL match is the final amount
    amount = Math.max(...totalMatches);
  } else {
    // Generic fallback: find all numbers with 2 decimal places and take the highest sensible one
    const genericAmountRegex = /\b([0-9]{1,5}[.,][0-9]{2})\b/g;
    const amounts: number[] = [];
    let gMatch;
    while ((gMatch = genericAmountRegex.exec(rawText)) !== null) {
      const num = parseFloat(gMatch[1].replace(',', '.'));
      if (!isNaN(num) && num > 0 && num < 1000000) {
        amounts.push(num);
      }
    }
    if (amounts.length > 0) {
      amount = Math.max(...amounts);
    }
  }

  // 4. Determine Transaction Type & Category
  let transactionType: 'income' | 'expense' = 'expense';
  let category = 'Other';

  const lower = rawText.toLowerCase();

  // Income keywords
  if (
    /salary|paystub|payroll|freelance|commission|deposit|income|dividend|bonus|refund/i.test(
      lower
    )
  ) {
    transactionType = 'income';
    if (/salary|payroll|paystub/i.test(lower)) category = 'Salary';
    else if (/freelance/i.test(lower)) category = 'Freelance';
    else if (/commission/i.test(lower)) category = 'Commission';
    else if (/bonus/i.test(lower)) category = 'Bonus';
    else category = 'Other';
  } else {
    // Expense categories
    if (/restaurant|cafe|coffee|food|burger|pizza|diner|kitchen|bakery|eat/i.test(lower)) {
      category = 'Food';
    } else if (/supermarket|grocery|mart|walmart|target|costco|store/i.test(lower)) {
      category = 'Shopping';
    } else if (/fuel|gas|petrol|shell|chevron|uber|lyft|taxi|transit|subway|bus/i.test(lower)) {
      category = 'Transport';
    } else if (/electric|water|power|utility|internet|wifi|broadband|telecom|phone|mobile/i.test(lower)) {
      category = 'Utilities';
    } else if (/rent|lease|housing|landlord/i.test(lower)) {
      category = 'Rent';
    } else if (/hospital|clinic|pharmacy|drug|health|doctor|med/i.test(lower)) {
      category = 'Medical';
    } else if (/cinema|movie|theatre|game|spotify|netflix|steam/i.test(lower)) {
      category = 'Entertainment';
    } else if (/tuition|school|college|university|course|book/i.test(lower)) {
      category = 'Education';
    } else if (/insurance|policy|premium/i.test(lower)) {
      category = 'Insurance';
    }
  }

  // 5. Description
  const description = lines.slice(0, 8).join(' | ').substring(0, 150);

  return {
    transactionType,
    title,
    amount,
    date,
    category,
    description,
    rawText,
  };
}
