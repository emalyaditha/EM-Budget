import React from 'react';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`p-8 sm:p-12 text-center border border-dashed border-[var(--border-primary)] rounded-2xl bg-[var(--bg-card)] flex flex-col items-center justify-center ${className}`}>
      {icon && (
        <div className="w-12 h-12 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-primary)] text-[var(--accent-primary)] flex items-center justify-center mb-4 shrink-0 shadow-sm">
          {icon}
        </div>
      )}
      <h4 className="text-sm font-bold text-[var(--text-primary)] font-display">{title}</h4>
      {description && <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-sm">{description}</p>}
      {actionLabel && onAction && (
        <Button variant="accent" size="sm" onClick={onAction} className="mt-4">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
