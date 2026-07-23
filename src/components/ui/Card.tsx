import React from 'react';
import { motion, HTMLMotionProps } from 'motion/react';

export interface CardProps extends HTMLMotionProps<'div'> {
  children: React.ReactNode;
  variant?: 'default' | 'surface' | 'outline' | 'interactive';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  className?: string;
  hoverEffect?: boolean;
}

export function Card({
  children,
  variant = 'default',
  padding = 'md',
  className = '',
  hoverEffect = false,
  ...props
}: CardProps) {
  const base = 'rounded-2xl border transition-all duration-200 overflow-hidden';
  
  const variants = {
    default: 'bg-[var(--bg-card)] border-[var(--border-primary)] shadow-[var(--shadow-soft)] text-[var(--text-primary)]',
    surface: 'bg-[var(--bg-surface)] border-[var(--border-primary)] text-[var(--text-primary)]',
    outline: 'bg-transparent border-[var(--border-primary)] text-[var(--text-primary)]',
    interactive: 'bg-[var(--bg-card)] border-[var(--border-primary)] hover:border-[var(--accent-primary)]/40 hover:shadow-lg cursor-pointer text-[var(--text-primary)]',
  };

  const paddings = {
    none: 'p-0',
    sm: 'p-4',
    md: 'p-5 sm:p-6',
    lg: 'p-6 sm:p-8',
  };

  return (
    <motion.div
      whileHover={hoverEffect ? { y: -2 } : undefined}
      className={`${base} ${variants[variant]} ${paddings[padding]} ${className}`}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function CardHeader({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex flex-col space-y-1.5 mb-4 ${className}`}>{children}</div>;
}

export function CardTitle({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <h3 className={`text-base sm:text-lg font-bold font-display tracking-tight text-[var(--text-primary)] ${className}`}>{children}</h3>;
}

export function CardDescription({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-xs text-[var(--text-secondary)] ${className}`}>{children}</p>;
}

export function CardContent({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={className}>{children}</div>;
}

export function CardFooter({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex items-center pt-4 mt-4 border-t border-[var(--border-primary)] ${className}`}>{children}</div>;
}
