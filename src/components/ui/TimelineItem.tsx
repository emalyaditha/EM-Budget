import React from 'react';
import { Badge } from './Badge';

export interface TimelineItemProps {
  title: string;
  subtitle?: string;
  amount: number;
  currency: string;
  type: 'income' | 'expense' | 'transfer' | 'debt_payment' | 'deposit' | 'withdrawal' | string;
  date: string;
  category?: string;
  accountName?: string;
  icon?: React.ReactNode;
  isLast?: boolean;
  onClick?: () => void;
}

export function TimelineItem({
  title,
  subtitle,
  amount,
  currency,
  type,
  date,
  category,
  accountName,
  icon,
  isLast = false,
  onClick,
}: TimelineItemProps) {
  const isIncome = type === 'income' || type === 'deposit';
  const isExpense = type === 'expense' || type === 'credit_card_charge' || type === 'withdrawal';

  const amountColor = isIncome
    ? 'text-[var(--success)]'
    : isExpense
    ? 'text-[var(--danger)]'
    : 'text-[var(--text-primary)]';

  const formattedAmount = `${isIncome ? '+' : isExpense ? '-' : ''}${currency}${Math.abs(amount).toLocaleString(
    undefined,
    { minimumFractionDigits: 2, maximumFractionDigits: 2 }
  )}`;

  return (
    <div
      onClick={onClick}
      className={`relative flex items-start gap-3.5 p-3 sm:p-3.5 rounded-xl hover:bg-[var(--bg-surface)]/60 transition-all cursor-pointer group ${
        onClick ? 'hover:scale-[1.005]' : ''
      }`}
    >
      {/* Line connecting nodes */}
      {!isLast && (
        <div className="absolute left-6 top-10 bottom-0 w-px bg-[var(--border-primary)] group-hover:bg-[var(--border-secondary)] transition-colors" />
      )}

      {/* Node Icon */}
      <div className="relative z-10 w-8 h-8 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-primary)] text-[var(--text-primary)] flex items-center justify-center shrink-0 shadow-sm group-hover:border-[var(--accent-primary)]/40 transition-colors">
        {icon}
      </div>

      {/* Main details */}
      <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-semibold text-[var(--text-primary)] truncate font-display">{title}</h4>
            {category && (
              <Badge variant="neutral" size="sm" className="hidden sm:inline-flex text-[9px]">
                {category}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[var(--text-muted)] font-mono">
            <span>{date}</span>
            {accountName && (
              <>
                <span>•</span>
                <span className="truncate">{accountName}</span>
              </>
            )}
          </div>
        </div>

        {/* Amount */}
        <div className="text-left sm:text-right shrink-0 font-mono">
          <span className={`text-xs font-bold ${amountColor}`}>{formattedAmount}</span>
          {subtitle && <p className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}
