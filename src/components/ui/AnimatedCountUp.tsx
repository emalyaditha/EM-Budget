import React, { useState } from 'react';

export function AnimatedCountUp({
  value,
  duration = 1200,
  prefix = '',
  suffix = '',
}: {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
}) {
  const [displayValue, setDisplayValue] = useState(0);

  React.useEffect(() => {
    let startTimestamp: number | null = null;
    const startValue = displayValue;
    const endValue = value;
    let rafId = 0;
    let cancelled = false;

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
    <span className="tabular-nums font-semibold">
      {prefix}
      {Math.round(displayValue).toLocaleString()}
      {suffix}
    </span>
  );
}
