const DEFAULT_LOCALE = typeof navigator !== 'undefined' ? navigator.language : 'en-LK';

let baseCurrencyCode = 'LKR';
let displaySymbol = 'Rs.';

export function setBaseCurrency(code: string, symbol?: string) {
  baseCurrencyCode = code;
  if (symbol) displaySymbol = symbol;
}

export function getDisplaySymbol(): string {
  return displaySymbol;
}

export function formatMoney(amount: number, currencyCode = baseCurrencyCode, locale = DEFAULT_LOCALE): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${displaySymbol} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

export function formatMoneyCompact(amount: number, currencyCode = baseCurrencyCode, locale = DEFAULT_LOCALE): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(amount);
  } catch {
    return formatMoney(amount, currencyCode, locale);
  }
}
