import React, { useState } from 'react';

export function AnimatedCountUp({
  value,
  duration = 1200,
  prefix = '',
  suffix = '',
  className = 'tabular-nums font-semibold',
}: {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const [displayValue, setDisplayValue] = useState(0);

  React.useEffect(() => {
    let startTimestamp: number | null = null;
    const startValue = displayValue;
    const endValue = value;
    let rafId = 0;
    let cancelled = false;

    // The global reduced-motion clamp only touches CSS animation/transition
    // durations, which does not reach requestAnimationFrame at all.
    const reduceMotion =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      setDisplayValue(endValue);
      return;
    }

    const step = (timestamp: number) => {
      if (cancelled) return;
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const easeProgress = progress * (2 - progress);
      const currentValue = startValue + easeProgress * (endValue - startValue);
      setDisplayValue(currentValue);

      if (progress < 1) {
        rafId = window.requestAnimationFrame(step);
      } else {
        setDisplayValue(endValue);
      }
    };

    rafId = window.requestAnimationFrame(step);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
    };
    // displayValue is intentionally omitted: the animation must run once per
    // `value` change, not restart on every internal frame update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  return (
    <span className={className}>
      {prefix}
      {Math.round(displayValue).toLocaleString()}
      {suffix}
    </span>
  );
}
