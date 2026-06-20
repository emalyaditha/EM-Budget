import React from 'react';
import { TrendingUp, Award, DollarSign } from 'lucide-react';

// Common categories structure helper
export interface CategorySum {
  name: string;
  value: number;
  percentage: number;
  color: string;
}

// Sparkline Trend Line SVG Chart
export function TrendAnalysisChart({ data, currency }: { data: { date: string; value: number }[]; currency: string }) {
  if (!data || data.length === 0) {
    return (
      <div className="w-full bg-zinc-900/50 border border-zinc-850 rounded-[28px] p-8 shadow-xl text-center flex flex-col items-center justify-center min-h-[160px]">
        <span className="text-zinc-500 text-sm font-medium">No trend data available</span>
        <span className="text-zinc-650 text-xs mt-1">Add transaction logs to map assets over time.</span>
      </div>
    );
  }

  const width = 500;
  const height = 120;
  const padding = 25;

  const values = data.map(d => d.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;

  const points = data.map((d, idx) => {
    const x = padding + (idx / (data.length - 1 || 1)) * (width - padding * 2);
    // Invert Y so high levels are at top
    const y = height - padding - ((d.value - minVal) / range) * (height - padding * 2);
    return `${x},${y}`;
  }).join(' ');

  const fillPoints = `
    ${padding},${height - padding} 
    ${points} 
    ${width - padding},${height - padding}
  `;

  return (
    <div className="w-full bg-zinc-900/50 border border-zinc-850 rounded-[28px] p-6 shadow-xl">
      <div className="flex justify-between items-center mb-4">
        <span className="text-xs font-bold text-white font-sans">Net Asset Trend (6 Days)</span>
        <span className="text-[10px] text-blue-400 bg-blue-950/40 px-2.5 py-1 rounded-md border border-blue-900/40 font-mono font-bold flex items-center gap-1">
          <TrendingUp size={11} className="animate-pulse" /> Real Time
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible">
        {/* Gradient Fill */}
        <defs>
          <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity="0.15" />
            <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Soft Grid Horizontal Lines */}
        <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="var(--border-primary)" strokeWidth="1" strokeDasharray="3,3" />
        <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke="var(--border-primary)" strokeWidth="1" strokeDasharray="3,3" />
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="var(--border-secondary)" strokeWidth="1" />

        {/* Gradient fill under sparkline */}
        <polygon points={fillPoints} fill="url(#trendGradient)" />

        {/* Sleek Line */}
        <polyline
          fill="none"
          stroke="var(--accent-primary)"
          strokeWidth="3"
          points={points}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Circles on Nodes with balance hover titles */}
        {data.map((d, idx) => {
          const x = padding + (idx / (data.length - 1 || 1)) * (width - padding * 2);
          const y = height - padding - ((d.value - minVal) / range) * (height - padding * 2);
          return (
            <g key={idx} className="group cursor-pointer">
              <circle
                cx={x}
                cy={y}
                r="4.5"
                className="transition-all duration-300 group-hover:r-6"
                style={{ fill: 'var(--bg-card)', stroke: 'var(--accent-primary)' }}
                strokeWidth="3"
              />
              <title>{`${d.date}: ${currency} ${d.value.toLocaleString()}`}</title>
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-zinc-500 font-mono mt-3 px-1.5">
        {data.map((d, idx) => {
          let label = d.date;
          try {
            const dateObj = new Date(d.date);
            if (!isNaN(dateObj.getTime())) {
              const month = dateObj.toLocaleString('default', { month: 'short' });
              const day = dateObj.getDate();
              label = `${day} ${month}`;
            }
          } catch (e) {}
          return (
            <span key={idx} className="text-zinc-400 font-semibold text-center" title={d.date}>
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// Income vs Expense Comparison Bar Chart
export function IncomeVsExpenseBar({ income, expense, currency }: { income: number; expense: number; currency: string }) {
  const total = income + expense || 1;
  const incomePct = Math.round((income / total) * 100);
  const expensePct = Math.round((expense / total) * 100);

  return (
    <div className="bg-zinc-900/50 border border-zinc-850 rounded-[28px] p-6 shadow-xl">
      <h3 className="text-sm font-bold text-white mb-4 flex justify-between items-center font-sans leading-snug">
        <span>Inflow vs Outflow Contrast</span>
        <span className="text-[9px] uppercase font-mono text-zinc-400 tracking-wider">Statement breakdown</span>
      </h3>
      <div className="space-y-4.5">
        {/* Income Bar */}
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-zinc-400 font-medium">Monthly Incomes</span>
            <span className="text-emerald-500 font-mono font-bold">{currency} {income.toLocaleString()} ({incomePct}%)</span>
          </div>
          <div className="w-full h-8 bg-[#050505] border border-zinc-200 dark:border-zinc-850 rounded-xl overflow-hidden flex items-center relative chart-progress-track">
            <div
              className="h-full bg-gradient-to-r from-[var(--accent-primary)] to-blue-400 rounded-r-md transition-all duration-1000"
              style={{ width: `${incomePct || 0}%` }}
            />
            <span className="absolute left-3 text-[10px] font-mono text-zinc-350 font-bold mix-blend-difference text-white-forced">RECEIPTS</span>
          </div>
        </div>

        {/* Expense Bar */}
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-zinc-400 font-medium">Invoices & Bills Expenses</span>
            <span className="text-rose-500 dark:text-rose-400 font-mono font-bold">{currency} {expense.toLocaleString()} ({expensePct}%)</span>
          </div>
          <div className="w-full h-8 bg-[#050505] border border-zinc-200 dark:border-zinc-850 rounded-xl overflow-hidden flex items-center relative chart-progress-track">
            <div
              className="h-full bg-gradient-to-r from-rose-600 to-rose-400 rounded-r-md transition-all duration-1000"
              style={{ width: `${expensePct || 0}%` }}
            />
            <span className="absolute left-3 text-[10px] font-mono text-zinc-350 font-bold mix-blend-difference text-white-forced">CHARGES</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Category Distribution Custom Donut Chart & Legend
export function CategorySpreadAnalysis({ 
  categories, 
  currency = 'Rs.', 
  layout = 'auto' 
}: { 
  categories: CategorySum[]; 
  currency?: string; 
  layout?: 'auto' | 'vertical' | 'horizontal' 
}) {
  if (categories.length === 0) {
    return (
      <div className="p-8 text-center text-zinc-500 text-xs border border-dashed border-zinc-700/50 rounded-2xl bg-zinc-950/20">
        No expense data logged to build category distributions
      </div>
    );
  }

  // Calculate total for percentage if not already proportional
  const total = categories.reduce((sum, cat) => sum + cat.value, 0);
  const isVertical = layout === 'vertical';

  return (
    <div className="bg-zinc-900/50 border border-zinc-850 rounded-[24px] p-6 shadow-xl">
      <div className="mb-6">
        <h3 className="text-sm font-bold text-white">Category Spread Analysis</h3>
        <p className="text-[11px] text-zinc-400 mt-0.5">Breakdown of expenses by category</p>
      </div>

      <div className={isVertical ? "flex flex-col gap-6 items-center w-full" : "flex flex-col sm:flex-row gap-8 items-center"}>
        {/* Donut Chart */}
        <div className="flex justify-center shrink-0">
          <div className="relative w-36 h-36">
            <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                {/* Background circle */}
                <circle cx="50" cy="50" r="40" fill="transparent" stroke="#18181b" strokeWidth="15" />
                
                {categories.map((cat, idx) => {
                  let offset = 0;
                  for (let i = 0; i < idx; i++) {
                    offset += (categories[i].value / total) * 100;
                  }
                  // Using value ratio for accuracy
                  const percentage = (cat.value / total) * 100;
                  const strokeDash = `${percentage} ${100 - percentage}`;
                  
                  return (
                    <circle
                      key={cat.name}
                      cx="50"
                      cy="50"
                      r="40"
                      fill="transparent"
                      stroke={cat.color}
                      strokeWidth="15"
                      strokeDasharray={strokeDash}
                      strokeDashoffset={-offset}
                      className="transition-all duration-500 hover:opacity-80"
                    />
                  );
                })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[9px] text-zinc-500 font-medium uppercase">Total</span>
                <span className="text-sm font-bold text-white font-mono leading-none mt-0.5">{currency}{total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
          </div>
        </div>

        {/* Legend List */}
        <div className={`space-y-3 w-full ${isVertical ? '' : 'sm:flex-1'}`}>
          {categories.map((cat) => (
            <div key={cat.name} className="flex items-center gap-3 w-full">
              <span className="w-2 rounded-full h-2 shrink-0 animate-pulse" style={{ backgroundColor: cat.color }} />
              <div className="flex-1 flex justify-between items-center text-xs min-w-0">
                <span className="text-zinc-300 font-medium truncate pr-2">{cat.name}</span>
                <div className="flex items-center gap-2 font-mono text-zinc-100 shrink-0">
                  <span className="font-bold text-white text-[11px]">{Math.round((cat.value / total) * 100)}%</span>
                  <span className="text-zinc-500 text-[10px]">{currency}{cat.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Repayment Gauges
export function RepaymentGauge({ totalDebt, remaining, name, currency = 'Rs.' }: { totalDebt: number; remaining: number; name: string; currency?: string }) {
  const repaid = totalDebt - remaining;
  const percentage = totalDebt > 0 ? Math.round((repaid / totalDebt) * 100) : 100;

  return (
    <div className="bg-zinc-900/50 border border-zinc-850 rounded-[24px] p-4.5 flex gap-4 items-center shadow-xl">
      <div className="relative w-14 h-14 shrink-0">
        <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
          <circle
            cx="18"
            cy="18"
            r="15.9155"
            className="text-zinc-200 dark:text-zinc-900"
            strokeWidth="3.5"
            stroke="currentColor"
            fill="none"
          />
          <path
            className="text-[var(--accent-primary)] transition-all duration-1000"
            strokeDasharray={`${percentage}, 100`}
            strokeWidth="3.5"
            strokeLinecap="round"
            stroke="currentColor"
            fill="none"
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-mono font-bold text-zinc-800 dark:text-white">
          {percentage}%
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-bold text-zinc-900 dark:text-white truncate">{name} Repaid</div>
        <div className="text-[10px] font-mono text-zinc-400 mt-0.5">
          Cleared: <span className="text-[var(--accent-primary)] font-bold">{currency} {repaid.toLocaleString()}</span>
        </div>
        <div className="text-[10px] font-mono text-zinc-500">
          Outstanding: {currency} {remaining.toLocaleString()}
        </div>
      </div>
    </div>
  );
}
