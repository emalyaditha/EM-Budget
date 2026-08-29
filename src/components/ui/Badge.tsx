import React from 'react';

export interface BadgeProps { children: React.ReactNode; variant?: 'neutral' | 'success' | 'danger' | 'warning' | 'accent' | 'outline'; size?: 'sm' | 'md'; icon?: React.ReactNode; className?: string; }

export function Badge({ children, variant = 'neutral', size = 'md', icon, className = '' }: BadgeProps) {
  const base = 'inline-flex items-center mono rounded-full gap-1.5 border shrink-0';
  const variants: Record<string,string> = {
    neutral: 'bg-[var(--surface-2)] text-[var(--ink-2)] border-[var(--line)]',
    success: 'bg-[var(--success-bg)] text-[var(--success)] border-[var(--line)]',
    danger: 'bg-[var(--danger-bg)] text-[var(--danger)] border-[var(--line)]',
    warning: 'bg-[var(--warning-bg)] text-[var(--warning)] border-[var(--line)]',
    accent: 'bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]',
    outline: 'bg-transparent text-[var(--ink-2)] border-[var(--line)]',
  };
  const sizes: Record<string,string> = { sm: 'px-2 py-0.5 text-[10px]', md: 'px-2.5 py-1 text-[11px]' };
  return <span className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}>{icon && <span className="shrink-0">{icon}</span>}<span>{children}</span></span>;
}
