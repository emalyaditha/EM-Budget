import React from 'react';
import { Card } from './Card';

export interface ChartContainerProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  height?: number | string;
  className?: string;
}

export function ChartContainer({
  title,
  subtitle,
  children,
  action,
  height = 300,
  className = '',
}: ChartContainerProps) {
  return (
    <Card className={`flex flex-col ${className}`}>
      <div className="flex items-center justify-between pb-4 border-b border-[var(--border-primary)]/60">
        <div>
          <h3 className="text-sm font-bold font-display text-[var(--text-primary)]">{title}</h3>
          {subtitle && <p className="text-xs text-[var(--text-secondary)] mt-0.5">{subtitle}</p>}
        </div>
        {action && <div>{action}</div>}
      </div>

      <div className="pt-4 flex-1 w-full" style={{ minHeight: height }}>
        {children}
      </div>
    </Card>
  );
}
