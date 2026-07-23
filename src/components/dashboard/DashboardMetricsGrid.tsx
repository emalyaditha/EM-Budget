import React from 'react';
import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';

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
}

export function DashboardMetricsGrid({
  liveBudgetTray,
  currency,
  onNavigateToBudgets
}: DashboardMetricsGridProps) {
  return (
    <div className="space-y-5">
      <div className="flex justify-between items-end px-1">
        <div className="text-left space-y-1">
          <h2 className="text-2xl font-bold font-display tracking-tight text-[var(--text-primary)]">Spending Envelopes</h2>
          <p className="text-xs text-[var(--text-secondary)] font-sans">Active monthly envelope controls and limits</p>
        </div>
        <button 
          onClick={onNavigateToBudgets}
          className="text-xs font-bold text-[var(--accent-primary)] hover:underline flex items-center gap-1.5 transition-all"
        >
          <span>Budgets Portal</span>
          <ArrowRight size={14} className="stroke-[2.5]" />
        </button>
      </div>

      {/* Categories grid/slider */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="category-spend-slider-tray">
        {liveBudgetTray.length > 0 ? (
          liveBudgetTray.slice(0, 4).map((category) => {
            const ratio = category.spent / category.limit;
            const isWarning = ratio >= 0.8 && ratio <= 1.0;
            const isOver = ratio > 1.0;

            return (
              <motion.div
                key={category.id}
                whileHover={{ y: -3 }}
                className={`bg-[var(--bg-card)] border rounded-[20px] p-5 flex flex-col justify-between h-44 text-left transition-all relative ${
                  isOver 
                    ? 'border-[var(--negative)] shadow-[0_0_15px_rgba(239,68,68,0.08)]' 
                    : 'border-[var(--border-primary)] hover:border-[var(--border-secondary)] shadow-[var(--shadow-soft)]'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <span className="text-lg w-9 h-9 bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-xl flex items-center justify-center shrink-0">
                      {category.icon}
                    </span>
                    <div className="min-w-0">
                      <span className="text-xs font-extrabold text-[var(--text-primary)] truncate block font-display">{category.category}</span>
                      <span className="text-[9px] font-mono text-[var(--text-muted)] uppercase block mt-0.5">Envelope Limit</span>
                    </div>
                  </div>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                    isOver 
                      ? 'bg-[var(--negative)]/10 text-[var(--negative)] border border-[var(--negative)]/15' 
                      : isWarning 
                        ? 'bg-amber-400/10 text-amber-500 border border-amber-400/15' 
                        : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-primary)]'
                  }`}>
                    {category.percent}%
                  </span>
                </div>

                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-[var(--text-secondary)]">Spent</span>
                    <span className="font-extrabold text-[var(--text-primary)]">
                      {currency}{category.spent.toLocaleString()}
                    </span>
                  </div>

                  {/* Thermometer Progress Bar with Dashed 80% & 90% Markers */}
                  <div className="w-full h-2.5 bg-[var(--bg-surface)] rounded-full overflow-hidden border border-[var(--border-primary)] relative">
                    <div className="absolute top-0 bottom-0 left-[80%] w-[1px] border-l border-dashed border-[var(--text-muted)]/40 z-10" />
                    <div className="absolute top-0 bottom-0 left-[90%] w-[1px] border-l border-dashed border-[var(--text-muted)]/40 z-10" />
                    
                    <div 
                      className={`h-full rounded-full transition-all duration-700 ${
                        isOver 
                          ? 'bg-[var(--negative)]' 
                          : isWarning 
                            ? 'bg-amber-400 animate-pulse' 
                            : 'bg-[var(--accent-primary)]'
                      }`}
                      style={{ width: `${category.percent}%` }}
                    />
                  </div>

                  <div className="flex justify-between text-[9px] uppercase tracking-wider text-[var(--text-muted)] pt-0.5 font-mono">
                    <span>Limit: {currency}{category.limit.toLocaleString()}</span>
                    <span className={isOver ? 'text-[var(--negative)] font-bold' : 'text-[var(--accent-primary)] font-bold'}>
                      {isOver ? 'DEFICIT' : `${currency}${category.remaining.toLocaleString()} left`}
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })
        ) : (
          <div className="col-span-4 py-8 px-4 text-center border border-dashed border-[var(--border-primary)] text-[var(--text-muted)] rounded-2xl bg-[var(--bg-surface)]/30">
            <p className="text-xs font-semibold text-[var(--text-secondary)]">No active spending envelopes configured</p>
            <p className="text-[10px] text-[var(--text-muted)] mt-1 font-sans">Navigate to the Smart Budgets tab to setup envelope control limits.</p>
          </div>
        )}
      </div>
    </div>
  );
}
