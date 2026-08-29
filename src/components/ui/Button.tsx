import React from 'react';
import { motion, HTMLMotionProps } from 'motion/react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  children?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'accent' | 'success';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
  className?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ children, variant = 'primary', size = 'md', isLoading = false, leftIcon, rightIcon, fullWidth = false, className = '', disabled, ...props }, ref) => {
    const base = 'inline-flex items-center justify-center font-medium rounded-full transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer select-none motion-reduce:transition-none';
    const variants: Record<string,string> = {
      primary: 'btn-primary',
      accent: 'btn-primary',
      success: 'bg-[var(--success)] text-white border border-[var(--success)] hover:brightness-95 font-semibold shadow-sm',
      secondary: 'btn-ghost',
      outline: 'btn-ghost',
      ghost: 'bg-transparent text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)] border border-transparent',
      danger: 'bg-[var(--danger)] text-white border border-[var(--danger)] hover:brightness-95 font-semibold rounded-full',
    };
    const sizes: Record<string,string> = {
      sm: 'px-3 py-1.5 text-xs gap-1.5 h-8',
      md: 'px-4 py-2 text-xs gap-2 h-9',
      lg: 'px-6 py-2.5 text-sm gap-2 h-10',
      icon: 'p-2 w-8 h-8',
    };
    return (
      <motion.button
        ref={ref}
        whileHover={{ scale: disabled || isLoading ? 1 : 1.01 }}
        whileTap={{ scale: disabled || isLoading ? 1 : 0.99 }}
        transition={{ duration: 0.15 }}
        className={`${base} ${variants[variant] || variants.primary} ${sizes[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <>{leftIcon && <span className="shrink-0">{leftIcon}</span>}{children && <span>{children}</span>}{rightIcon && <span className="shrink-0">{rightIcon}</span>}</>}
      </motion.button>
    );
  }
);
Button.displayName = 'Button';
