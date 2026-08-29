import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, leftIcon, rightIcon, helperText, className = '', id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
    return (
      <div className="flex flex-col gap-1.5 w-full text-left">
        {label && <label htmlFor={inputId} className="eyebrow">{label}</label>}
        <div className="relative flex items-center">
          {leftIcon && <div className="absolute left-3.5 text-[var(--ink-3)] pointer-events-none flex items-center justify-center">{leftIcon}</div>}
          <input id={inputId} ref={ref} className={`input ${leftIcon ? '!pl-10' : ''} ${rightIcon ? '!pr-10' : ''} ${error ? '!border-[var(--danger)] focus:!border-[var(--danger)]' : ''} ${className}`} {...props} />
          {rightIcon && <div className="absolute right-3.5 text-[var(--ink-3)] flex items-center justify-center">{rightIcon}</div>}
        </div>
        {error && <p className="text-[11px] text-[var(--danger)]">{error}</p>}
        {helperText && !error && <p className="text-[11px] text-[var(--ink-3)]">{helperText}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';
