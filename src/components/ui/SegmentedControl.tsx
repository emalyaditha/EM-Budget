import { motion } from 'motion/react';

interface SegmentedOption<T extends string> {
  id: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (id: T) => void;
  layoutId: string;
  ariaLabel: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  layoutId,
  ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-1 p-1 rounded-full bg-[var(--surface-2)] border border-[var(--line)]"
    >
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.id)}
            className={`relative px-3.5 py-1.5 rounded-full text-[11px] font-bold tracking-tight cursor-pointer transition-colors ${
              active ? 'text-[var(--accent-fg)]' : 'text-[var(--ink-2)] hover:text-[var(--ink)]'
            }`}
          >
            {active && (
              <motion.span
                layoutId={`seg-${layoutId}`}
                transition={{ type: 'spring', damping: 30, stiffness: 400 }}
                className="absolute inset-0 rounded-full bg-[var(--accent)]"
              />
            )}
            <span className="relative z-10 whitespace-nowrap">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
