import React from 'react';

interface ProgressRingProps {
  percent: number;
  size?: number;
  stroke?: number;
  tone?: 'safe' | 'warning' | 'danger';
  label?: React.ReactNode;
}

const TONE_VAR: Record<NonNullable<ProgressRingProps['tone']>, string> = {
  safe: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
};

export function ProgressRing({ percent, size = 56, stroke = 7, tone = 'safe', label }: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-grid place-items-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={TONE_VAR[tone]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (clamped / 100) * c}
          style={{ transition: 'stroke-dashoffset 0.4s ease-out' }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center">
        {label ?? <span className="money text-[11px] font-bold text-[var(--ink)]">{Math.round(clamped)}%</span>}
      </span>
    </span>
  );
}

export function ProgressBarThick({
  percent,
  tone = 'safe',
}: {
  percent: number;
  tone?: NonNullable<ProgressRingProps['tone']>;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <span className="block w-full h-3 rounded-full bg-[var(--surface-3)] overflow-hidden">
      <span
        className="block h-full rounded-full"
        style={{
          width: `${clamped}%`,
          background: TONE_VAR[tone],
          transition: 'width 0.4s ease-out',
        }}
        aria-hidden
      />
    </span>
  );
}

export function toneForPercent(pct: number): NonNullable<ProgressRingProps['tone']> {
  if (pct >= 100) return 'danger';
  if (pct >= 80) return 'warning';
  return 'safe';
}
