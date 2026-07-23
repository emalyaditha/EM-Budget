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
      <div className="w-full bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-[28px] p-8 shadow-[var(--shadow-soft)] text-center flex flex-col items-center justify-center min-h-[160px]">
        <span className="text-[var(--text-secondary)] text-sm font-medium">No trend data available</span>
        <span className="text-[var(--text-muted)] text-xs mt-1">Add transaction logs to map assets over time.</span>
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
    <div className="w-full bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-[28px] p-6 shadow-[var(--shadow-soft)]">
      <div className="flex justify-between items-center mb-4">
        <span className="text-xs font-bold text-[var(--text-primary)] font-sans">Net Asset Trend (6 Days)</span>
        <span className="text-[10px] text-[var(--accent-primary)] bg-[var(--accent-primary)]/10 px-2.5 py-1 rounded-md border border-[var(--accent-primary)]/20 font-mono font-bold flex items-center gap-1">
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
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="var(--border-primary)" strokeWidth="1" />

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
      <div className="flex justify-between text-[10px] text-[var(--text-secondary)] font-mono mt-3 px-1.5">
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
            <span key={idx} className="text-[var(--text-secondary)] font-semibold text-center" title={d.date}>
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
    <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-[28px] p-6 shadow-[var(--shadow-soft)]">
      <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex justify-between items-center font-sans leading-snug">
        <span>Inflow vs Outflow Contrast</span>
        <span className="text-[9px] uppercase font-mono text-[var(--text-muted)] tracking-wider">Statement breakdown</span>
      </h3>
      <div className="space-y-4.5">
        {/* Income Bar */}
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-[var(--text-secondary)] font-medium">Monthly Incomes</span>
            <span className="text-[var(--success)] font-mono font-bold">{currency} {income.toLocaleString()} ({incomePct}%)</span>
          </div>
          <div className="w-full h-8 bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-xl overflow-hidden flex items-center relative chart-progress-track">
            <div
              className="h-full bg-[var(--success)] rounded-r-md transition-all duration-1000"
              style={{ width: `${incomePct || 0}%` }}
            />
            <span className="absolute left-3 text-[10px] font-mono text-[var(--text-secondary)] font-bold">RECEIPTS</span>
          </div>
        </div>

        {/* Expense Bar */}
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-[var(--text-secondary)] font-medium">Invoices & Bills Expenses</span>
            <span className="text-[var(--negative)] font-mono font-bold">{currency} {expense.toLocaleString()} ({expensePct}%)</span>
          </div>
          <div className="w-full h-8 bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-xl overflow-hidden flex items-center relative chart-progress-track">
            <div
              className="h-full bg-[var(--negative)] rounded-r-md transition-all duration-1000"
              style={{ width: `${expensePct || 0}%` }}
            />
            <span className="absolute left-3 text-[10px] font-mono text-[var(--text-secondary)] font-bold">CHARGES</span>
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
        className="border border-[var(--border-primary)] rounded-[28px] p-5 text-center flex flex-col items-center justify-center min-h-[180px] bg-[var(--bg-card)] shadow-[var(--shadow-soft)]"
      >
        <span className="text-[var(--text-muted)] text-[11px] font-bold tracking-[2px] uppercase">Category Spread Analysis</span>
        <span className="text-[var(--text-secondary)] text-xs mt-2 max-w-[200px]">No expense data logged to build category distributions</span>
      </div>
    );
  }

  // Calculate total for percentage if not already proportional
  const total = categories.reduce((sum, cat) => sum + cat.value, 0);

  return (
    <div 
      className="border border-[var(--border-primary)] rounded-[20px] p-4.5 w-full max-w-[380px] mx-auto sm:mx-0 relative overflow-hidden transition-all duration-300 text-left select-none flex flex-col justify-between bg-[var(--bg-card)] shadow-[var(--shadow-soft)]"
    >
      {/* Title & Subtitle Section */}
      <div className="mb-3">
        <h3 className="text-[14px] sm:text-[15px] font-bold text-[var(--text-primary)] tracking-tight leading-tight select-all">
          Category Spread Analysis
        </h3>
        <p className="text-[11px] font-normal text-[var(--text-secondary)] select-all">
          Breakdown of expenses by category
        </p>
      </div>

      <div className="flex flex-col items-center w-full">
        {/* Donut Chart */}
        <div className="flex justify-center items-center shrink-0 mb-4 w-full">
          <div className="relative w-[130px] h-[130px] sm:w-[140px] sm:h-[140px] transition-all duration-300">
            <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                {/* Background circle of the ring */}
                <circle 
                  cx="50" 
                  cy="50" 
                  r="39.5" 
                  fill="transparent" 
                  stroke="var(--border-primary)" 
                  strokeWidth="11" 
                />
                
                {categories.map((cat, idx) => {
                  const catColor = getCategoryColor(cat.name);
                  const percentage = (cat.value / total) * 100;
                  
                  const radius = 39.5;
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
                      r="39.5"
                      fill="transparent"
                      stroke={catColor}
                      strokeWidth="11"
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
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none px-2 text-center">
                <span className="text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-[1px] leading-none mb-0.5">
                  TOTAL
                </span>
                <span className="text-[15px] sm:text-[17px] font-bold text-[var(--text-primary)] font-mono leading-none tracking-tight select-all truncate max-w-full">
                  {currency}{total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
            </div>
          </div>
        </div>

        {/* Legend Redesign with Compact Layout & Scroll Bounds if many items */}
        <div className="w-full flex flex-col gap-1.5 max-h-[160px] overflow-y-auto pr-1.5 select-all scrollbar-thin">
          {categories.map((cat, idx) => {
            const catColor = getCategoryColor(cat.name);
            const percentage = Math.round((cat.value / total) * 100);
            
            return (
              <div 
                key={cat.name} 
                className="grid grid-cols-[8px_minmax(0,1fr)_auto_auto] items-center gap-2 h-9 py-1 px-2.5 bg-[var(--bg-surface)] hover:scale-[1.01] transition-all duration-200 cursor-pointer rounded-lg animate-brand-fade-up select-all border border-[var(--border-primary)]"
                style={{
                  animationDelay: `${idx * 40}ms`
                }}
              >
                {/* Dot Indicator */}
                <div className="flex items-center justify-center">
                  <div 
                    className="w-2 h-2 rounded-full shrink-0" 
                    style={{ 
                      backgroundColor: catColor,
                      boxShadow: `0 0 6px ${catColor}`
                    }} 
                  />
                </div>
                
                {/* Category Name */}
                <span 
                  className="text-[11px] sm:text-xs font-semibold text-[var(--text-primary)] truncate select-all pr-1"
                  title={cat.name}
                >
                  {cat.name}
                </span>

                {/* Percentage */}
                <span className="text-[11px] sm:text-xs font-bold text-[var(--text-secondary)] pr-2 text-right shrink-0 select-all">
                  {percentage}%
                </span>

                {/* Amount */}
                <span className="text-[11px] sm:text-xs font-bold font-mono text-[var(--text-primary)] text-right shrink-0 select-all">
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
    <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-[24px] p-4.5 flex gap-4 items-center shadow-[var(--shadow-soft)]">
      <div className="relative w-14 h-14 shrink-0">
        <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
          <circle
            cx="18"
            cy="18"
            r="15.9155"
            className="text-[var(--border-primary)]"
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
        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-mono font-bold text-[var(--text-primary)]">
          {percentage}%
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-bold text-[var(--text-primary)] truncate">{name} Repaid</div>
        <div className="text-[10px] font-mono text-[var(--text-secondary)] mt-0.5">
          Cleared: <span className="text-[var(--accent-primary)] font-bold">{currency} {repaid.toLocaleString()}</span>
        </div>
        <div className="text-[10px] font-mono text-[var(--text-muted)]">
          Outstanding: {currency} {remaining.toLocaleString()}
        </div>
      </div>
    </div>
  );
}
