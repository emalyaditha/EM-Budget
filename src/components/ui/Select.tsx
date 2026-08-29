import React from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectOption { value: string; label: string; disabled?: boolean; }
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
      <div className="flex flex-col gap-1.5 w-full text-left">
        {label && <label htmlFor={selectId} className="eyebrow">{label}</label>}
        <div className="relative flex items-center">
          {leftIcon && <div className="absolute left-3.5 text-[var(--ink-3)] pointer-events-none flex items-center justify-center">{leftIcon}</div>}
          <select id={selectId} ref={ref} className={`input !pr-10 appearance-none ${leftIcon ? '!pl-10' : ''} ${error ? '!border-[var(--danger)]' : ''} ${className}`} {...props}>
            {options.map((opt) => <option key={opt.value} value={opt.value} disabled={opt.disabled}>{opt.label}</option>)}
            {children}
          </select>
          <div className="absolute right-3.5 text-[var(--ink-3)] pointer-events-none flex items-center justify-center"><ChevronDown size={14} /></div>
        </div>
        {error && <p className="text-[11px] text-[var(--danger)]">{error}</p>}
      </div>
    );
  }
);
Select.displayName = 'Select';
