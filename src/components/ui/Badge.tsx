import React from 'react';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'neutral' | 'success' | 'danger' | 'warning' | 'accent' | 'outline';
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
  className?: string;
}

export function Badge({
  children,
  variant = 'neutral',
  size = 'md',
  icon,
  className = '',
}: BadgeProps) {
  const base = 'inline-flex items-center font-medium font-mono rounded-full gap-1.5 transition-colors shrink-0';

  const variants = {
    neutral: 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-primary)]',
    success: 'bg-[var(--success)]/10 text-[var(--success)] border border-[var(--success)]/20',
    danger: 'bg-[var(--danger)]/10 text-[var(--danger)] border border-[var(--danger)]/20',
    warning: 'bg-[var(--warning)]/10 text-[var(--warning)] border border-[var(--warning)]/20',
    accent: 'bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] border border-[var(--accent-primary)]/20',
    outline: 'bg-transparent text-[var(--text-secondary)] border border-[var(--border-primary)]',
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-2.5 py-1 text-xs',
  };

  return (
    <span className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}>
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{children}</span>
    </span>
  );
}
