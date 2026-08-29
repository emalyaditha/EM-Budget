import React, { useState } from 'react';

export interface TooltipProps { content: React.ReactNode; children: React.ReactNode; position?: 'top' | 'bottom' | 'left' | 'right'; }

export function Tooltip({ content, children, position = 'top' }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const positions: Record<string,string> = { top: 'bottom-full left-1/2 -translate-x-1/2 mb-2', bottom: 'top-full left-1/2 -translate-x-1/2 mt-2', left: 'right-full top-1/2 -translate-y-1/2 mr-2', right: 'left-full top-1/2 -translate-y-1/2 ml-2' };
  return (
    <div className="relative inline-flex" onMouseEnter={() => setIsVisible(true)} onMouseLeave={() => setIsVisible(false)} onFocus={() => setIsVisible(true)} onBlur={() => setIsVisible(false)}>
      {children}
      {isVisible && <div role="tooltip" className={`absolute z-40 px-2.5 py-1.5 mono text-[11px] text-[var(--ink)] bg-[var(--surface)] border border-[var(--line)] rounded-lg shadow-xl whitespace-nowrap pointer-events-none ${positions[position]}`}>{content}</div>}
    </div>
  );
}
