import React from 'react';
import { Card } from './Card';
import { Badge } from './Badge';
import { ArrowUpRight, ArrowDownRight, Info } from 'lucide-react';
import { Tooltip } from './Tooltip';

export interface StatCardProps {
  title: string;
  value: string | number;
  currency?: string;
  subtitle?: string;
  change?: { value: number; period?: string; isPositiveGood?: boolean; };
  icon?: React.ReactNode;
  infoTooltip?: string;
  className?: string;
  variant?: 'default' | 'surface' | 'outline';
}

export function StatCard({ title, value, currency = '', subtitle, change, icon, infoTooltip, className = '', variant = 'default' }: StatCardProps) {
  const isPositive = change ? change.value >= 0 : false;
  const isGood = change ? (change.isPositiveGood !== false ? isPositive : !isPositive) : true;
  return (
    <Card variant={variant} padding="md" className={`flex flex-col justify-between ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-1.5">
          <span className="eyebrow">{title}</span>
          {infoTooltip && <Tooltip content={infoTooltip}><Info size={11} className="text-[var(--ink-3)] hover:text-[var(--ink-2)] cursor-help" /></Tooltip>}
        </div>
        {icon && <div className="w-7 h-7 rounded-full bg-[var(--surface-2)] border border-[var(--line)] text-[var(--ink-2)] flex items-center justify-center shrink-0">{icon}</div>}
      </div>
      <div className="mt-3">
        <div className="flex items-baseline gap-1">
          <span className="mono text-[18px] font-bold tracking-tight text-[var(--ink)]">{currency}{typeof value === 'number' ? value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : value}</span>
        </div>
        <div className="ledger-rule my-2" />
        <div className="flex items-center justify-between mono text-[11px]">
          {change ? (
            <span className="flex items-center gap-1">
              <Badge variant={isGood ? 'success' : 'danger'} size="sm">{isPositive ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}{Math.abs(change.value)}%</Badge>
              {change.period && <span className="text-[var(--ink-3)]">{change.period}</span>}
            </span>
          ) : (
            <span className="text-[var(--ink-3)]">{subtitle || 'Live'}</span>
          )}
        </div>
      </div>
    </Card>
  );
}
