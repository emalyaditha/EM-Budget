import React from 'react';
import { motion, HTMLMotionProps } from 'motion/react';

export interface CardProps extends HTMLMotionProps<'div'> {
  children: React.ReactNode;
  variant?: 'default' | 'surface' | 'outline' | 'interactive';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  className?: string;
  hoverEffect?: boolean;
}

export function Card({ children, variant = 'default', padding = 'md', className = '', hoverEffect = false, ...props }: CardProps) {
  const base = 'card overflow-hidden motion-reduce:transition-none';
  const variants: Record<string,string> = {
    default: '',
    surface: 'bg-[var(--surface-2)]',
    outline: 'bg-transparent border-dashed',
    interactive: 'cursor-pointer hover:border-[var(--line-strong)]',
  };
  const paddings: Record<string,string> = { none: 'p-0', sm: 'p-4', md: 'p-5 sm:p-6', lg: 'p-6 sm:p-8' };
  return (
    <motion.div whileHover={hoverEffect ? { y: -1 } : undefined} transition={{ duration: 0.15 }} className={`${base} ${variants[variant]} ${paddings[padding]} ${className}`} {...props}>
      {children}
    </motion.div>
  );
}
export function CardHeader({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex flex-col space-y-1.5 mb-4 ${className}`}>{children}</div>;
}
export function CardTitle({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <h3 className={`text-[14px] font-bold tracking-tight text-[var(--ink)] ${className}`}>{children}</h3>;
}
export function CardDescription({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-[12px] text-[var(--ink-2)] ${className}`}>{children}</p>;
}
export function CardContent({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={className}>{children}</div>;
}
export function CardFooter({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex items-center pt-4 mt-4 border-t border-[var(--line)] ${className}`}>{children}</div>;
}
