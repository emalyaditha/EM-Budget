import React from 'react';

export interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
}

export function Skeleton({
  className = '',
  variant = 'text',
  width,
  height,
}: SkeletonProps) {
  const base = 'animate-pulse bg-[var(--bg-surface)] border border-[var(--border-primary)]/40';

  const variants = {
    text: 'rounded-md h-4 w-full',
    circular: 'rounded-full shrink-0',
    rectangular: 'rounded-2xl w-full h-24',
  };

  const style: React.CSSProperties = {
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
  };

  return <div className={`${base} ${variants[variant]} ${className}`} style={style} />;
}
