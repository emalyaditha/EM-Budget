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

export function ChartContainer({ title, subtitle, children, action, height = 300, className = '' }: ChartContainerProps) {
  return (
    <Card className={`flex flex-col ${className}`}>
      <div className="flex items-center justify-between pb-3">
        <div>
          <h3 className="text-[13px] font-bold tracking-tight text-[var(--ink)]">{title}</h3>
          {subtitle && <p className="mono text-[11px] text-[var(--ink-3)] mt-0.5">{subtitle}</p>}
        </div>
        {action && <div>{action}</div>}
      </div>
      <div className="ledger-rule mb-4" />
      <div className="flex-1 w-full" style={{ minHeight: height }}>{children}</div>
    </Card>
  );
}
