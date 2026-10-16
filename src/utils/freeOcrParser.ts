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

export interface ParseOptions {
  /**
   * The ledger's display currency, used only to break date-order ties. A bill
   * saying 10/11/2026 is 1 November here and 10 October in the US, and the OCR
   * text itself carries no clue, so the one contextual signal we have is the
   * currency the user scans in.
   */
  currency?: string;
}

/** United States / Canadian order: month first. Everything else is day first. */
const MONTH_FIRST_CURRENCIES = ['$', 'usd', 'cad', 'usd$', 'c$'];

const CURRENCY_PREFIX = '(?:rs\\.?|lkr|inr|rp|rm|eur|gbp|usd|\\$|€|£|₹|৳|₱)';

/**
 * A money token with its separators intact. Deliberately excludes '/', so a date
 * can never be mistaken for an amount.
 */
const MONEY_TOKEN = /\d[\d.,]*\d%?|\d%?/g;

/**
 * Larger when the label is a stronger statement of "this is what was charged",
 * so a subtotal or a tendered-cash figure can never outrank a grand total.
 */
const TOTAL_LABELS: Array<[number, RegExp]> = [
  [
    6,
    /\b(grand\s+total|total\s+amount|net\s+payable|amount\s+payable|total\s+payable|balance\s+due|amount\s+due|total\s+due|final\s+total|payable\s+amount)\b/i,
  ],
  [5, /\b(net\s+total|total)\b/i],
  [4, /\b(amount|net\s+amount|payable|gross\s+total|to\s+pay)\b/i],
  [3, /\b(sub\s*-?\s*total|subtotal)\b/i],
];

/**
 * Amounts that appear on a receipt but are never what the customer paid. These
 * lines are skipped entirely when hunting for a total.
 */
const NOT_AN_AMOUNT =
  /\b(change|tendered|cash\s+in|balance\s+forward|round(?:ing)?\s+(?:off|adjust)|discount|promo|points?|loyalty|member\s*ship|expiry|expires|valid|limit|phone|tel|mobile|call|invoice\s*no|receipt\s*no|bill\s*no|reg\s*no|trn|tax\s*iden|page|item|qty|rate|unit|card|visa|master|amex|account|a\/c)\b/i;

function moneyValue(token: string): number | null {
  const s = token.trim();
  if (s.endsWith('%')) return null;
  if (!/^\d[\d.,]*$/.test(s)) return null;

  const groups = s.split(/[.,]/);
  const tail = groups[groups.length - 1];

  // More than one separator with every interior group three digits wide: the
  // last separator is the decimal point and the rest group thousands. This also
  // resolves lakh grouping (1,25,000) correctly, since joining the digits is
  // order-independent.
  if (groups.length > 1 && tail.length === 2) {
    const value = Number.parseFloat(`${groups.slice(0, -1).join('')}.${tail}`);
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  }
  // Three trailing digits means thousands grouping, not a fraction: 1,250 and
  // 12.350 are both one thousand two hundred and fifty, never a third of
  // something.
  if (groups.length > 1 && tail.length === 3) {
    const value = Number(s.replace(/[.,]/g, ''));
    return Number.isFinite(value) ? value : null;
  }
  if (groups.length > 1 && tail.length > 3) return null;

  const value = Number.parseFloat(s.replace(/[.,]/g, ''));
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

/** The last plausible amount on a line, which is where receipts put the total. */
function lineAmount(line: string): number | null {
  const tokens = line.match(MONEY_TOKEN) || [];
  for (let i = tokens.length - 1; i >= 0; i--) {
    const value = moneyValue(tokens[i]);
    if (value !== null && value > 0 && value < 1e9) return value;
  }
  return null;
}

function extractAmount(text: string, lines: string[]): number {
  let bestTier = 0;
  let best = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const tier = TOTAL_LABELS.find(([, re]) => re.test(line))?.[0] ?? 0;
    if (!tier) continue;

    let value = NOT_AN_AMOUNT.test(line) ? null : lineAmount(line);
    // Labels and figures wrap onto separate lines constantly: "Total" alone,
    // then the number under it. Only a nearby value counts as that label's.
    if (value === null) {
      for (let j = i + 1; j <= i + 2 && j < lines.length; j++) {
        if (TOTAL_LABELS.some(([, re]) => re.test(lines[j]))) break;
        if (NOT_AN_AMOUNT.test(lines[j])) continue;
        const following = lineAmount(lines[j]);
        if (following !== null) {
          value = following;
          break;
        }
      }
    }
    if (value !== null && (tier > bestTier || (tier === bestTier && value > best))) {
      bestTier = tier;
      best = value;
    }
  }

  if (best > 0) return best;

  // Nothing was labelled. Fall back to the largest two-decimal figure that is
  // not sitting on a line about cards, charges or quantities.
  let fallback = 0;
  for (const line of lines) {
    if (NOT_AN_AMOUNT.test(line) || /\d{3,}[.,]\d{3}[.,]?\d*/.test(line)) continue;
    for (const token of line.match(MONEY_TOKEN) || []) {
      if (!/[.,]\d{2}$/.test(token)) continue;
      const value = moneyValue(token);
      if (value !== null && value > fallback) fallback = value;
    }
  }
  if (fallback > 0) return fallback;

  const currencyTagged = text.match(new RegExp(`${CURRENCY_PREFIX}\\s*(\\d[\\d.,]*)`, 'gi')) || [];
  for (const entry of currencyTagged) {
    const value = moneyValue(entry.replace(new RegExp(CURRENCY_PREFIX, 'gi'), ''));
    if (value !== null && value > fallback) fallback = value;
  }
  return fallback;
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function isoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Built from the parts rather than from a Date, so no timezone can move it.
  // A receipt dated 2 October must record 2 October in Colombo and in London.
  if (day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

function numericDate(a: string, b: string, c: string, dayFirst: boolean): string | null {
  const expand = (twoDigit: string) => {
    const n = Number(twoDigit);
    return twoDigit.length === 4 ? n : n <= 69 ? 2000 + n : 1900 + n;
  };

  if (a.length === 4) {
    return isoDate(Number(a), Number(b), Number(c));
  }
  if (c.length !== 2 && c.length !== 4) return null;

  const year = expand(c);
  const first = Number(a);
  const second = Number(b);
  if (first > 31 || second > 31) return null;

  // Only one component being above 12 settles the order outright; the hint is
  // used for the genuinely ambiguous cases like 10/11/2026.
  const order: [number, number] =
    first > 12 ? [first, second] : second > 12 ? [second, first] : dayFirst ? [first, second] : [second, first];
  return isoDate(year, order[1], order[0]);
}

function todayLocalIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function extractDate(text: string, dayFirst: boolean): string {
  const today = todayLocalIso();
  const farFuture = `${Number(today.slice(0, 4)) + 1}-12-31`;

  const accept = (iso: string | null) => {
    if (!iso) return null;
    return iso >= '2000-01-01' && iso <= farFuture ? iso : null;
  };

  const numeric = text.match(/\b(\d{1,4})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,4})\b/);
  if (numeric) {
    const found = accept(numericDate(numeric[1], numeric[2], numeric[3], dayFirst));
    if (found) return found;
  }

  const MONTH = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec';
  const dayThenMonth = text.match(
    new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH})[a-z]*\\.?,?\\s+(\\d{4})\\b`, 'i'),
  );
  if (dayThenMonth) {
    const found = accept(
      isoDate(Number(dayThenMonth[3]), MONTHS[dayThenMonth[2].toLowerCase()], Number(dayThenMonth[1])),
    );
    if (found) return found;
  }

  const monthThenDay = text.match(
    new RegExp(`\\b(${MONTH})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'i'),
  );
  if (monthThenDay) {
    const found = accept(
      isoDate(Number(monthThenDay[3]), MONTHS[monthThenDay[1].toLowerCase()], Number(monthThenDay[2])),
    );
    if (found) return found;
  }

  return today;
}

/**
 * Money coming in must be positively asserted. Words like "refund", "deposit"
 * and "bonus" appear all over ordinary expense receipts ("No refunds", "Advance
 * deposit", "Bonus gift"), and reading those as income inverts the sign of a
 * transaction, which is the single most damaging mistake a scan can make.
 */
const INCOME_PHRASES =
  /\b(refund\s+(?:issued|processed|credited|approved|completed)|credit\s+(?:note|entry|memo|advice)|payment\s+received|amount\s+received|cash\s+received|proceeds\s+of)\b/i;

const INCOME_DOCUMENTS =
  /\b(salary|payslip|pay\s*slip|payroll|wages|net\s+pay|earnings|commission|freelance|dividend|interest\s+earned|profit\s+share|reimburse\w*|top\s*-?\s*up)\b/i;

/** Anything from these lists is a document the holder was billed. */
const BILL_SIGNALS =
  /\b(items?|qty|subtotal|discount|cash|card|visa|master|amex|change|tendered|vat|gst|nsdl|payment\s+mode|thank\s+you|receipt|invoice|bill|billed\s+to|served\s+by|table|guests?)\b/i;

function extractType(text: string): 'income' | 'expense' {
  if (INCOME_PHRASES.test(text)) return 'income';
  if (!INCOME_DOCUMENTS.test(text)) return 'expense';
  // A payslip has almost none of these; a bill that happens to carry a
  // reimbursement line has several, and the bill is what the user scanned.
  const billHits = (text.match(new RegExp(BILL_SIGNALS.source, 'gi')) || []).length;
  return billHits >= 3 ? 'expense' : 'income';
}

const CATEGORY_RULES: Array<[string, RegExp]> = [
  [
    'Food',
    /\b(restaurant|cafe|coffee|diner|bakery|kitchen|take\s*away|takeaway|fast\s*food|pizza|burger|curry|roti|noodles|tea\s*shop|canteen|eatery|butchers?|seafood|luncheon|lunch|dinner|breakfast|snack|juice|ice\s*cream|starbucks|mcdonald'?s|kfc)\b/i,
  ],
  [
    'Shopping',
    /\b(supermarket|super|grocery|groceries|mart|mini\s*market|convenience|department\s*store|hypermarket|pro\s*shop|boutique|clothing|apparel|fashion|laundry|dry\s*cleaning)\b/i,
  ],
  [
    'Transport',
    /\b(fuel|petrol|diesel|gas\s*station|tank\s*lorry|toll|parking|taxi|cab|rickshaw|bus\s*(?:fare|pass|stand|terminal)|railway|train|ferry|tyre|vehicle|garage|transport|uber|bolt)\b/i,
  ],
  [
    'Utilities',
    /\b(electricity|electric\s*board|power\s*(?:station|loom|cut)|water\s*(?:board|bill)|internet|broadband|wi-?fi|telecom|telephone|mobile\s*(?:top|recharge|bill)|prepaid|dialog|mobitel|hut|slt)\b/i,
  ],
  ['Rent', /\b(rent|lease|landlord|tenancy|maintenance\s*charge|housing)\b/i],
  [
    'Medical',
    /\b(hospital|clinic|pharmacy|medical|doctor|physician|surgery|laboratory|lab|diagnostic|dental|consultation|prescription|health)\b/i,
  ],
  [
    'Entertainment',
    /\b(cinema|movie|theatre|theater|concert|karaoke|arcade|gaming|game|netflix|spotify|youtube|steam|playstation|xbox)\b/i,
  ],
  [
    'Education',
    /\b(tuition|school|college|university|institute|academy|course|classroom|textbook|books|stationery|library)\b/i,
  ],
  ['Insurance', /\b(insurance|policy|premium|underwriting)\b/i],
  [
    'Travel',
    /\b(hotel|guest\s*house|resort|lodge|accommodation|booking|airline|flight|airport|travel|tour|holiday|safari)\b/i,
  ],
];

function extractCategory(text: string, inferredType: string): string {
  if (inferredType === 'income') {
    if (/\b(salary|payroll|payslip|wages|net\s+pay)\b/i.test(text)) return 'Salary';
    if (/\bcommission\b/i.test(text)) return 'Commission';
    if (/\bfreelance\b/i.test(text)) return 'Freelance';
    if (/\bdividend\b/i.test(text)) return 'Dividend';
    return 'Other';
  }
  // Match the merchant line before the body: a pharmacy receipt that lists
  // "rice" as a product is still Medical, and a hotel that lists "rice" is
  // still Travel.
  const heading = text.split('\n').slice(0, 3).join('\n');
  for (const [category, re] of CATEGORY_RULES) if (re.test(heading)) return category;
  for (const [category, re] of CATEGORY_RULES) if (re.test(text)) return category;
  return 'Other';
}

const NON_MERCHANT = new RegExp(
  [
    `^\\s*${CURRENCY_PREFIX}`,
    '\\b(receipt|tax\\s*invoice|invoice|cash\\s*bill|e\\s*&\\s*o\\.?e|welcome|thank\\s+you|thanks|attention|dear|terms|conditions|note|reminder|powered\\s+by|generated|print(?:ed)?\\s*(?:date|time)|date|time|tel|phone|mobile|fax|email|www\\.|http|\\.lk|\\.com|reg\\s*no|gst\\s*no|vat\\s*no|trn|branch|outlet|pos\\s*id|counter|cashier|served\\s+by|customer|billed\\s+to|card|visa|master|amex|account|qty|item|rate|unit|price|amount|subtotal|total|discount|cash|change|tendered|balance|paid|payable|due|sg|gst|nsdl)\\b',
  ].join('|'),
  'i',
);

/** A merchant name, not an address, a phone number or the total line. */
function looksLikeAddress(line: string) {
  return (
    /\b(road|rd|lane|aven|avenue|street|st|place|flats?|building|colombo|gampaha|kandy|negombo|jaffna|pette)\b/i.test(
      line,
    ) ||
    /\b\d{3,}\s*(?:main|road|\/)/i.test(line) ||
    /(?:^|\s)no\.?\s*\d/i.test(line)
  );
}

function extractTitle(lines: string[]): string {
  for (let i = 0; i < Math.min(lines.length, 8); i++) {
    const raw = lines[i];
    // Receipts merge the merchant with a timestamp on one line: take the name.
    const segments = raw
      .split(/\s+[-–|]\s+|\s*\t\s*|\s{3,}/)
      .map((s) => s.trim())
      .filter(Boolean);

    for (const candidate of segments.length ? segments : [raw]) {
      const squeezed = candidate.replace(/\s+/g, ' ').trim();
      if (!squeezed || squeezed.length > 42) continue;
      if (NON_MERCHANT.test(squeezed)) continue;
      if (squeezed.replace(/[^a-zA-Z]/g, '').length < 3) continue;
      if (/\d/.test(squeezed.replace(/\b\d{1,2}[.,]\d{2}\b/g, '')) && /\d{3,}/.test(squeezed)) continue;
      if (looksLikeAddress(squeezed)) continue;
      if ((squeezed.match(MONEY_TOKEN)?.length || 0) > 1) continue;
      const cleaned = squeezed
        .replace(/[^\p{L}\p{N}\s&',.-]/gu, '')
        .trim()
        .slice(0, 40);
      if (cleaned) return cleaned;
    }
  }
  return 'Scanned Receipt';
}

/**
 * Parses raw OCR text from a receipt or bill photo into a structured
 * transaction. Every rule here is working around how thermal-print receipts
 * actually come out of OCR, so changes need a realistic sample, not a tidy one.
 */
export function parseReceiptText(rawText: string = '', options: ParseOptions = {}): ScannedTransaction {
  const safeText = typeof rawText === 'string' ? rawText : '';
  const lines = safeText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const currency = (options.currency || '').toLowerCase();
  const dayFirst = !MONTH_FIRST_CURRENCIES.includes(currency);

  const transactionType = extractType(safeText);
  return {
    transactionType,
    title: extractTitle(lines),
    amount: extractAmount(safeText, lines),
    date: extractDate(safeText, dayFirst),
    category: extractCategory(safeText, transactionType),
    description: lines.slice(0, 8).join(' | ').slice(0, 150),
    rawText: safeText,
  };
}
