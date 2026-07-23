import React from 'react';
import { motion } from 'motion/react';
import { TrendingUp, ChevronRight } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { AnimatedCountUp } from '../Dashboard';

interface DashboardHeroProps {
  currency: string;
  aggregateActiveWealth: number;
  totalAssets: number;
  totalLiabilities: number;
  assetRatioPct: number;
  liabilityRatioPct: number;
  sparklineData: Array<{ date: string; value: number }>;
  trendLabel: string;
  trendColorClass: string;
  onManageWallets: () => void;
}

export function DashboardHero({
  currency,
  aggregateActiveWealth,
  totalAssets,
  totalLiabilities,
  assetRatioPct,
  liabilityRatioPct,
  sparklineData,
  trendLabel,
  trendColorClass,
  onManageWallets
}: DashboardHeroProps) {
  return (
    <div id="vault-portfolio-hero" className="relative overflow-hidden bg-[var(--bg-card)] rounded-[20px] p-5 sm:p-6 flex flex-col justify-between border border-[var(--border-primary)] shadow-[var(--shadow-soft)] transition-all text-left">
      <div className="flex justify-between items-start z-10">
        <div className="space-y-1">
          <h3 className="text-[10px] tracking-wider text-[var(--text-muted)] font-mono font-bold uppercase flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] animate-pulse" />
            PORTFOLIO NET WORTH
          </h3>
        </div>

        <div className="flex items-center gap-3">
          {/* Compact sparkline */}
          {sparklineData.length > 0 && (
            <div className="w-16 h-6 hidden sm:block opacity-60">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sparklineData}>
                  <defs>
                    <linearGradient id="heroSparklineGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="var(--accent-primary)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Area 
                    type="monotone" 
                    dataKey="value" 
                    stroke="var(--accent-primary)" 
                    strokeWidth={1.5} 
                    fill="url(#heroSparklineGrad)" 
                    dot={false} 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className={`flex items-center gap-1 border py-0.5 px-2 rounded-full text-[9px] font-bold font-mono ${trendColorClass}`}>
            <TrendingUp size={10} />
            <span>{trendLabel}</span>
          </div>
        </div>
      </div>

      <div className="mt-3 mb-5 z-10">
        <div className="text-3xl sm:text-4xl font-extrabold font-display tracking-tight text-[var(--text-primary)] flex items-baseline gap-0.5 select-all">
          <span className="text-xl font-light text-[var(--text-secondary)] select-none mr-1">{currency}</span>
          <AnimatedCountUp value={aggregateActiveWealth} />
          <span className="text-lg font-bold text-[var(--accent-primary)] opacity-80">.00</span>
        </div>
      </div>

      <div className="border-t border-[var(--border-primary)]/60 pt-4 z-10 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4">
        <div className="flex-1 space-y-2">
          {/* Compact 2-Column Stats layout for mobile and desktop */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)] font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)]" />
                <span>Liquid ({assetRatioPct.toFixed(0)}%)</span>
              </div>
              <p className="text-xs font-bold text-[var(--text-primary)] font-mono">
                +{currency}{totalAssets.toLocaleString()}
              </p>
            </div>

            <div className="space-y-0.5 text-right sm:text-left">
              <div className="flex items-center justify-end sm:justify-start gap-1 text-[10px] text-[var(--text-secondary)] font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--negative)]" />
                <span>Liabilities ({liabilityRatioPct.toFixed(0)}%)</span>
              </div>
              <p className="text-xs font-bold text-[var(--text-primary)] font-mono">
                -{currency}{totalLiabilities.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Slim dynamic ratio horizontal bar */}
          <div className="w-full h-1 bg-[var(--bg-surface)] rounded-full overflow-hidden flex border border-[var(--border-primary)]/40">
            <div style={{ width: `${assetRatioPct}%` }} className="h-full bg-[var(--accent-primary)] transition-all duration-1000" />
            <div style={{ width: `${liabilityRatioPct}%` }} className="h-full bg-[var(--negative)] transition-all duration-1000" />
          </div>
        </div>

        <div className="flex justify-end sm:block shrink-0">
          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onManageWallets}
            className="bg-[var(--text-primary)] hover:bg-[var(--text-secondary)] text-[var(--bg-primary)] py-1.5 px-4 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all duration-150 cursor-pointer flex items-center gap-1.5 shadow-sm"
          >
            <span>Manage Wallets</span>
            <ChevronRight size={12} className="stroke-[2.5]" />
          </motion.button>
        </div>
      </div>
    </div>
  );
}
