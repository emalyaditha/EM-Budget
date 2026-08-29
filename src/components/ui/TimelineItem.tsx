import React from 'react';
import { Badge } from './Badge';

export interface TimelineItemProps {
  title: string; subtitle?: string; amount: number; currency: string; type: string; date: string; category?: string; accountName?: string; icon?: React.ReactNode; isLast?: boolean; onClick?: () => void;
}

export function TimelineItem({ title, subtitle, amount, currency, type, date, category, accountName, icon, isLast = false, onClick }: TimelineItemProps) {
  const isIncome = type === 'income' || type === 'deposit';
  const isExpense = type === 'expense' || type === 'credit_card_charge' || type === 'withdrawal';
  const amountColor = isIncome ? 'text-[var(--success)]' : isExpense ? 'text-[var(--danger)]' : 'text-[var(--ink)]';
  const formattedAmount = `${isIncome ? '+' : isExpense ? '-' : ''}${currency}${Math.abs(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return (
    <div onClick={onClick} className={`relative flex items-start gap-3 p-3 rounded-xl border border-transparent hover:bg-[var(--surface-2)] hover:border-[var(--line)] transition-colors cursor-pointer ${onClick ? 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]' : ''}`} tabIndex={onClick ? 0 : undefined} onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}>
      {!isLast && <div className="absolute left-7 top-10 bottom-0 w-px bg-[var(--line)]" aria-hidden />}
      <div className="relative z-10 w-8 h-8 rounded-full bg-[var(--surface-2)] border border-[var(--line)] text-[var(--ink-2)] flex items-center justify-center shrink-0">{icon}</div>
      <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><h4 className="text-[12px] font-semibold text-[var(--ink)] truncate">{title}</h4>{category && <Badge variant="neutral" size="sm" className="hidden sm:inline-flex">{category}</Badge>}</div>
          <div className="mono text-[10px] text-[var(--ink-3)] flex items-center gap-1.5 mt-0.5"><span>{date}</span>{accountName && <><span className="text-[var(--line-strong)]">/</span><span className="truncate">{accountName}</span></>}</div>
        </div>
        <div className="text-left sm:text-right shrink-0 mono"><span className={`text-[12px] font-bold ${amountColor}`}>{formattedAmount}</span>{subtitle && <p className="text-[10px] text-[var(--ink-3)] mt-0.5 truncate">{subtitle}</p>}</div>
      </div>
    </div>
  );
}
