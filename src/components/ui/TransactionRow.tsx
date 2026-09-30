import React from 'react';
import { CategoryChip } from './CategoryChip';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';

interface TransactionRowProps {
  title: string;
  subtitle?: string;
  category: string;
  amountText: string;
  isIncome: boolean;
  onClick?: () => void;
  trailing?: React.ReactNode;
}

export function TransactionRow({
  title,
  subtitle,
  category,
  amountText,
  isIncome,
  onClick,
  trailing,
}: TransactionRowProps) {
  return (
    <button type="button" className="tx-row w-full text-left pressable" onClick={onClick}>
      <CategoryChip category={category} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold tracking-tight text-[var(--ink)] truncate">{title}</span>
        <span className="block text-[11px] text-[var(--ink-3)] mt-0.5 truncate">
          {subtitle ?? ''}
          {subtitle ? ' · ' : ''}
          {category}
        </span>
      </span>
      <span className="text-right shrink-0">
        <span
          className="money inline-flex items-center gap-1 text-[13px] font-bold"
          style={{ color: isIncome ? 'var(--success)' : 'var(--danger)' }}
        >
          {isIncome ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}
          {amountText}
        </span>
        {trailing}
      </span>
    </button>
  );
}
