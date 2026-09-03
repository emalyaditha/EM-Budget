import React, { useMemo, useState } from 'react';
import { AlertTriangle, AlertCircle, Bell, X, ChevronDown, ChevronUp } from 'lucide-react';
import { computeAlerts, FinanceAlert } from '../lib/alerts';
import { AppState } from '../types';

interface AlertsPanelProps {
  state: AppState;
}

const SEVERITY_ICON: Record<FinanceAlert['severity'], React.ReactNode> = {
  critical: <AlertCircle size={14} className="text-[var(--danger)] shrink-0" />,
  warning: <AlertTriangle size={14} className="text-amber-500 shrink-0" />,
  info: <Bell size={14} className="text-[var(--ink-3)] shrink-0" />,
};

export function AlertsPanel({ state }: AlertsPanelProps) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const alerts = useMemo(
    () => computeAlerts(state, Date.now()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.budgets, state.subscriptions, state.debts, state.savingsGoals, state.currency]
  );

  const visible = useMemo(
    () => alerts.filter((a) => !dismissed.has(a.id)).slice(0, 6),
    [alerts, dismissed]
  );

  if (visible.length === 0) return null;

  const dismissAll = () => {
    setDismissed((prev) => {
      const next = new Set(prev);
      visible.forEach((a) => next.add(a.id));
      return next;
    });
  };

  return (
    <div className="card-flat p-3 space-y-2 border-amber-500/20">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--ink)] hover:opacity-80"
          aria-expanded={open}
        >
          <Bell size={13} />
          {visible.length} alert{visible.length === 1 ? '' : 's'}
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
        <button
          onClick={dismissAll}
          className="inline-flex items-center gap-1 text-[11px] text-[var(--ink-3)] hover:text-[var(--ink)]"
          aria-label="Dismiss all alerts"
        >
          <X size={12} /> Dismiss
        </button>
      </div>

      {open && (
        <ul className="space-y-2 pt-1">
          {visible.map((a) => (
            <li key={a.id} className="flex items-start gap-2 text-[12px] leading-4">
              {SEVERITY_ICON[a.severity]}
              <div className="min-w-0">
                <p className="font-semibold text-[var(--ink)]">{a.title}</p>
                <p className="text-[var(--ink-2)]">{a.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}