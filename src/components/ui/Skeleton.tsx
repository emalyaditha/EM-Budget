import React from 'react';

export interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
}

export function Skeleton({ className = '', variant = 'text', width, height }: SkeletonProps) {
  const base = 'skeleton border border-[var(--line)] motion-reduce:animate-none';
  const variants: Record<string, string> = {
    text: 'rounded-[var(--r-sm)] h-4 w-full',
    circular: 'rounded-full shrink-0',
    rectangular: 'rounded-[var(--r-md)] w-full h-24',
  };
  const style: React.CSSProperties = { ...(width ? { width } : {}), ...(height ? { height } : {}) };
  return <div className={`${base} ${variants[variant]} ${className}`} style={style} />;
}
