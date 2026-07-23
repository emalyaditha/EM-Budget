import React from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: SelectOption[];
  error?: string;
  leftIcon?: React.ReactNode;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, error, leftIcon, className = '', id, children, ...props }, ref) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="flex flex-col space-y-1.5 w-full text-left">
        {label && (
          <label htmlFor={selectId} className="text-xs font-medium text-[var(--text-secondary)]">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <div className="absolute left-3.5 text-[var(--text-muted)] pointer-events-none flex items-center justify-center">
              {leftIcon}
            </div>
          )}
          <select
            id={selectId}
            ref={ref}
            className={`w-full appearance-none bg-[var(--bg-surface)] text-[var(--text-primary)] border rounded-xl text-xs font-medium transition-all duration-150 focus:outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-primary)]/20 disabled:opacity-50 disabled:cursor-not-allowed ${
              leftIcon ? 'pl-10' : 'pl-3.5'
            } pr-10 py-2.5 ${
              error ? 'border-[var(--danger)]' : 'border-[var(--border-primary)]'
            } ${className}`}
            {...props}
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </option>
            ))}
            {children}
          </select>
          <div className="absolute right-3.5 text-[var(--text-muted)] pointer-events-none flex items-center justify-center">
            <ChevronDown size={14} />
          </div>
        </div>
        {error && <p className="text-[11px] text-[var(--danger)] font-medium">{error}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';
