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
  change?: {
    value: number;
    period?: string;
    isPositiveGood?: boolean;
  };
  icon?: React.ReactNode;
  infoTooltip?: string;
  className?: string;
  variant?: 'default' | 'surface' | 'outline';
}

export function StatCard({
  title,
  value,
  currency = '',
  subtitle,
  change,
  icon,
  infoTooltip,
  className = '',
  variant = 'default',
}: StatCardProps) {
  const isPositive = change ? change.value >= 0 : false;
  const isGood = change
    ? change.isPositiveGood !== false
      ? isPositive
      : !isPositive
    : true;

  return (
    <Card variant={variant} padding="md" className={`flex flex-col justify-between ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-[var(--text-secondary)]">{title}</span>
          {infoTooltip && (
            <Tooltip content={infoTooltip}>
              <Info size={13} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] cursor-help" />
            </Tooltip>
          )}
        </div>
        {icon && (
          <div className="w-8 h-8 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-primary)] text-[var(--text-secondary)] flex items-center justify-center shrink-0">
            {icon}
          </div>
        )}
      </div>

      <div className="mt-3">
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold font-mono tracking-tight text-[var(--text-primary)]">
            {currency}
            {typeof value === 'number'
              ? value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              : value}
          </span>
        </div>

        <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--border-primary)]/50 text-[11px]">
          {change ? (
            <div className="flex items-center gap-1">
              <Badge variant={isGood ? 'success' : 'danger'} size="sm">
                {isPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                {Math.abs(change.value)}%
              </Badge>
              {change.period && <span className="text-[var(--text-muted)] text-[10px]">{change.period}</span>}
            </div>
          ) : (
            <span className="text-[10px] text-[var(--text-muted)] font-mono">{subtitle || 'Live Metrics'}</span>
          )}
        </div>
      </div>
    </Card>
  );
}
