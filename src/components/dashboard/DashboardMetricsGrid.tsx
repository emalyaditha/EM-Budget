import { Plus, Plane, Target, Wallet } from "lucide-react";
import { SavingsGoal } from "../../types";

interface EnvelopeItem {
  id: string;
  category: string;
  icon: string;
  spent: number;
  limit: number;
  remaining: number;
  percent: number;
}

interface DashboardMetricsGridProps {
  liveBudgetTray: EnvelopeItem[];
  currency: string;
  onNavigateToBudgets: () => void;
  savingsGoals?: SavingsGoal[];
  onNavigateToGoals?: () => void;
  onNewGoal?: () => void;
}

export function DashboardMetricsGrid({
  currency,
  onNavigateToGoals,
  onNavigateToBudgets,
  savingsGoals,
  onNewGoal,
}: DashboardMetricsGridProps) {
  const handleNavigate = onNavigateToGoals ?? onNavigateToBudgets;
  const goals: Array<{ id: string; name: string; target: number; current: number; icon: React.ReactNode }> =
    savingsGoals && savingsGoals.length > 0
      ? savingsGoals.slice(0, 3).map((g, i) => ({
          id: g.id,
          name: g.name,
          target: g.target,
          current: g.current,
          icon: i === 0 ? <Plane size={14} /> : i === 1 ? <Target size={14} /> : <Wallet size={14} />,
        }))
      : [];

  return (
    <div className="card p-5 sm:p-6 flex flex-col gap-5 rounded-[20px] text-left overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[18px] sm:text-[20px] font-bold tracking-tight leading-none text-[var(--ink)]">My savings goals</h2>
        <span className="mono text-[10px] px-2.5 py-1 rounded-full border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink-2)]">
          {goals.length} active
        </span>
      </div>

      <button
        type="button"
        onClick={onNewGoal ?? handleNavigate}
        className="mw-nueva w-full rounded-[20px] p-4 flex items-center justify-between gap-4 text-left hover:opacity-95 transition-opacity border border-black/5"
      >
        <div className="min-w-0">
          <p className="text-[15px] font-bold tracking-tight leading-none text-[#0A0A0C]">New goal</p>
          <p className="mono text-[11px] font-medium text-[#0A0A0C]/60 mt-1">Create a new goal</p>
        </div>
        <span className="w-9 h-9 rounded-full bg-[var(--accent)] text-[var(--accent-fg)] flex items-center justify-center shrink-0">
          <Plus size={16} strokeWidth={2.2} />
        </span>
      </button>

      <div className="space-y-3">
        <h3 className="eyebrow !text-[11px]">Goal list</h3>
        <div className="space-y-3">
          {goals.length === 0 ? (
            <div className="py-10 text-center border border-dashed border-[var(--line)] rounded-xl bg-[var(--surface-2)]/40 px-4">
              <p className="eyebrow">No goals yet</p>
              <p className="mono text-[11px] text-[var(--ink-2)] mt-1">Tap New goal to start — esta tarjeta queda como pin Janvis (empty state elegante).</p>
            </div>
          ) : (
            goals.map((g) => {
              const pct = Math.min(100, Math.round((g.current / g.target) * 100));
              return (
                <div key={g.id} className="bg-[var(--surface-2)] border border-[var(--line)] rounded-[16px] p-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-7 h-7 rounded-full bg-[var(--surface)] border border-[var(--line)] grid place-items-center shrink-0 text-[var(--ink-2)]">
                        {g.icon}
                      </span>
                      <p className="mono text-[13px] font-bold truncate text-[var(--ink)]">{g.name}</p>
                    </div>
                    <span className="mono text-[11px] font-bold tabular-nums text-[var(--ink)]">{pct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--surface-3)] overflow-hidden">
                    <div className="h-full mw-progress" style={{ width: pct + '%' }} />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <p className="eyebrow !text-[8px]">Target</p>
                      <p className="mono text-[11px] font-bold tabular-nums text-[var(--ink)]">{currency}{g.target.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="eyebrow !text-[8px]">Saved</p>
                      <p className="mono text-[11px] font-bold tabular-nums text-[var(--ink)]">{currency}{g.current.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="eyebrow !text-[8px]">Progress</p>
                      <p className="mono text-[11px] font-bold tabular-nums text-[var(--ink)]">{pct}%</p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <button
          type="button"
          onClick={handleNavigate}
          className="w-full text-center mono text-[11px] font-medium text-[var(--ink-2)] hover:text-[var(--ink)] transition-colors py-1"
        >
          View all goals →
        </button>
      </div>
    </div>
  );
}
