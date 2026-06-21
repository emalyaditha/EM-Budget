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

// Category colors palette
const CATEGORY_COLORS: Record<string, string> = {
  Utilities: '#8B5CF6',
  Food: '#F59E0B',
  Other: '#64748B',
  Loan: '#EF4444',
  Entertainment: '#EC4899',
  Transport: '#0EA5E9',
  'Transaction Deletion': '#F97316',
  'Transfer Fee': '#10B981',
  Shopping: '#EC4899',
  Rent: '#F43F5E',
  Medical: '#10B981',
  Education: '#6366F1'
};

// Dynamic color helper to guarantee every category has its own distinct bright color
function getCategoryColor(name: string): string {
  if (CATEGORY_COLORS[name]) return CATEGORY_COLORS[name];
  if (CATEGORY_COLORS[name.trim()]) return CATEGORY_COLORS[name.trim()];
  
  const defaultColors = [
    '#8B5CF6', '#F59E0B', '#EF4444', '#EC4899', 
    '#0EA5E9', '#F97316', '#10B981', '#6366F1', 
    '#14B8A6', '#F43F5E', '#D946EF', '#84CC16'
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % defaultColors.length;
  return defaultColors[idx];
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
      <div 
        className="border border-white/[0.08] rounded-[28px] p-8 text-center flex flex-col items-center justify-center min-h-[220px]"
        style={{
          background: 'rgba(15,15,18,0.9)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.04)'
        }}
      >
        <span className="text-white/40 text-[14px] font-bold tracking-[2px] uppercase">Category Spread Analysis</span>
        <span className="text-white/60 text-xs mt-3 max-w-[240px]">No expense data logged to build category distributions</span>
      </div>
    );
  }

  // Calculate total for percentage if not already proportional
  const total = categories.reduce((sum, cat) => sum + cat.value, 0);

  return (
    <div 
      className="border border-white/[0.08] rounded-[28px] p-8 w-full relative overflow-hidden transition-all duration-300 text-left select-none"
      style={{
        background: 'rgba(15,15,18,0.9)',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.04)'
      }}
    >
      {/* Title & Subtitle */}
      <div className="mb-8">
        <h3 className="text-[20px] sm:text-[25.2px] md:text-[28px] font-bold text-white tracking-tight leading-tight select-all">
          Category Spread Analysis
        </h3>
        <p className="text-[13px] sm:text-[14.4px] md:text-[16px] font-normal text-white/70 mt-1 select-all">
          Breakdown of expenses by category
        </p>
      </div>

      <div className="flex flex-col items-center w-full">
        {/* Donut Chart */}
        <div className="flex justify-center items-center shrink-0 mb-8 w-full">
          <div className="relative w-[180px] h-[180px] sm:w-[220px] sm:h-[220px] md:w-[260px] md:h-[260px] transition-all duration-300">
            <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                {/* Background circle of the ring */}
                <circle 
                  cx="50" 
                  cy="50" 
                  r="38" 
                  fill="transparent" 
                  stroke="rgba(255, 255, 255, 0.03)" 
                  strokeWidth="12" 
                />
                
                {categories.map((cat, idx) => {
                  const catColor = getCategoryColor(cat.name);
                  const percentage = (cat.value / total) * 100;
                  
                  const radius = 38;
                  const circumference = 2 * Math.PI * radius;
                  
                  const prevPercentage = categories.slice(0, idx).reduce((sum, c) => sum + (c.value / total) * 100, 0);
                  const strokeLength = (percentage / 100) * circumference;
                  
                  // Deduct a tiny gap for premium segment spacing if multiple categories
                  const hasMultiple = categories.length > 1;
                  const gap = hasMultiple ? 1.5 : 0;
                  const adjustedLength = Math.max(0.5, strokeLength - gap);
                  
                  const strokeDash = `${adjustedLength} ${circumference - adjustedLength}`;
                  const strokeOffset = -((prevPercentage / 100) * circumference);
                  
                  return (
                    <circle
                      key={cat.name}
                      cx="50"
                      cy="50"
                      r="38"
                      fill="transparent"
                      stroke={catColor}
                      strokeWidth="12"
                      strokeDasharray={strokeDash}
                      strokeDashoffset={strokeOffset}
                      strokeLinecap="round"
                      className="transition-all duration-500 hover:opacity-95"
                      style={{
                        transition: 'stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1), stroke 0.3s ease',
                        filter: `drop-shadow(0 0 8px ${catColor})`
                      }}
                    />
                  );
                })}
            </svg>
            
            {/* Center Information */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
                <span className="text-[10px] sm:text-[12.6px] md:text-[14px] text-white/65 font-bold uppercase tracking-[2px] leading-none mb-1.5">
                  TOTAL
                </span>
                <span className="text-[18px] sm:text-[28.8px] md:text-[32px] font-bold text-white font-mono leading-none tracking-tight select-all">
                  {currency}{total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
            </div>
          </div>
        </div>

        {/* Legend Redesign */}
        <div className="w-full flex flex-col divide-y divide-white/[0.04] mt-2 select-all">
          {categories.map((cat, idx) => {
            const catColor = getCategoryColor(cat.name);
            const percentage = Math.round((cat.value / total) * 100);
            
            return (
              <div 
                key={cat.name} 
                className="grid grid-cols-[20px_1fr_auto_auto] items-center gap-[14px] py-3 border-b border-white/[0.04] last:border-0 hover:translate-x-1.5 hover:bg-white/[0.03] transition-all duration-300 ease-out cursor-pointer rounded-xl px-3 -mx-3 animate-brand-fade-up select-all"
                style={{
                  animationDelay: `${idx * 70}ms`
                }}
              >
                {/* Dot Indicator */}
                <div className="flex items-center justify-center">
                  <div 
                    className="w-[14px] h-[14px] rounded-full shrink-0" 
                    style={{ 
                      backgroundColor: catColor,
                      boxShadow: `0 0 10px ${catColor}`
                    }} 
                  />
                </div>
                
                {/* Category Name */}
                <span 
                  className="text-[14px] sm:text-[16.2px] md:text-[18px] font-semibold text-white truncate pr-2 select-all"
                  style={{
                    overflowWrap: 'break-word',
                    wordBreak: 'break-word'
                  }}
                >
                  {cat.name}
                </span>

                {/* Percentage */}
                <span className="text-[14px] sm:text-[16.2px] md:text-[18px] font-bold text-white pr-4 text-right select-all">
                  {percentage}%
                </span>

                {/* Amount */}
                <span className="text-[14px] sm:text-[16.2px] md:text-[18px] font-medium text-white/80 font-mono text-right select-all">
                  {currency}{cat.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
            );
          })}
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
