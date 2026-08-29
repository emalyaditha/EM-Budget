import React from 'react';
import { Button } from './Button';

export interface EmptyStateProps { icon?: React.ReactNode; title: string; description?: string; actionLabel?: string; onAction?: () => void; className?: string; }

export function EmptyState({ icon, title, description, actionLabel, onAction, className = '' }: EmptyStateProps) {
  return (
    <div className={`empty flex flex-col items-center justify-center ${className}`}>
      {icon && <div className="w-10 h-10 rounded-full bg-[var(--surface-2)] border border-[var(--line)] text-[var(--ink-2)] flex items-center justify-center mb-3 shrink-0">{icon}</div>}
      <h4 className="text-[13px] font-bold text-[var(--ink)]">{title}</h4>
      {description && <p className="mono text-[12px] text-[var(--ink-2)] mt-1 max-w-sm text-center leading-5">{description}</p>}
      {actionLabel && onAction && <Button variant="primary" size="sm" onClick={onAction} className="mt-4">{actionLabel}</Button>}
    </div>
  );
}
