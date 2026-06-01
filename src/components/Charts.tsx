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
export function TrendAnalysisChart({ data, currency }: { data: number[]; currency: string }) {
  if (data.length === 0) return <div className="text-zinc-500 text-sm">No transaction data available</div>;

  const width = 500;
  const height = 120;
  const padding = 15;

  const minVal = Math.min(...data);
  const maxVal = Math.max(...data);
  const range = maxVal - minVal || 1;

  const points = data.map((val, idx) => {
    const x = padding + (idx / (data.length - 1 || 1)) * (width - padding * 2);
    // Invert Y so high levels are at top
    const y = height - padding - ((val - minVal) / range) * (height - padding * 2);
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
        <span className="text-[10px] text-emerald-400 bg-emerald-950/40 px-2.5 py-1 rounded-md border border-emerald-900/40 font-mono font-bold flex items-center gap-1">
          <TrendingUp size={11} className="animate-pulse" /> Real Time
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible">
        {/* Gradient Fill */}
        <defs>
          <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c0c0c0" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#c0c0c0" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Soft Grid Horizontal Lines */}
        <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="#3f3f46" strokeWidth="1" strokeDasharray="3,3" className="opacity-30" />
        <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke="#3f3f46" strokeWidth="1" strokeDasharray="3,3" className="opacity-30" />
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#27272a" strokeWidth="1" />

        {/* Gradient fill under sparkline */}
        <polygon points={fillPoints} fill="url(#trendGradient)" />

        {/* Sleek Line */}
        <polyline
          fill="none"
          stroke="#ffffff"
          strokeWidth="3"
          points={points}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Circles on Nodes */}
        {data.map((val, idx) => {
          const x = padding + (idx / (data.length - 1 || 1)) * (width - padding * 2);
          const y = height - padding - ((val - minVal) / range) * (height - padding * 2);
          return (
            <circle
              key={idx}
              cx={x}
              cy={y}
              r="4.5"
              className="fill-[#0c0c0e] stroke-white cursor-pointer hover:r-6 transition-all"
              strokeWidth="3"
            />
          );
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-zinc-500 font-mono mt-2.5 px-1">
        <span>Start Balance</span>
        <span className="font-semibold text-zinc-400">Latest Pulse</span>
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
            <span className="text-emerald-400 font-mono font-bold">{currency} {income.toLocaleString()} ({incomePct}%)</span>
          </div>
          <div className="w-full h-8 bg-[#050505] border border-zinc-850 rounded-xl overflow-hidden flex items-center relative">
            <div
              className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-r-md transition-all duration-1000"
              style={{ width: `${incomePct || 0}%` }}
            />
            <span className="absolute left-3 text-[10px] font-mono text-zinc-350 font-bold mix-blend-difference">RECEIPTS</span>
          </div>
        </div>

        {/* Expense Bar */}
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-zinc-400 font-medium">Invoices & Bills Expenses</span>
            <span className="text-rose-400 font-mono font-bold">{currency} {expense.toLocaleString()} ({expensePct}%)</span>
          </div>
          <div className="w-full h-8 bg-[#050505] border border-zinc-850 rounded-xl overflow-hidden flex items-center relative">
            <div
              className="h-full bg-gradient-to-r from-rose-600 to-rose-400 rounded-r-md transition-all duration-1000"
              style={{ width: `${expensePct || 0}%` }}
            />
            <span className="absolute left-3 text-[10px] font-mono text-zinc-350 font-bold mix-blend-difference">CHARGES</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Category Distribution Custom Donut Chart & Legend
export function SpendingByCategoryPie({ categories, currency = 'Rs.' }: { categories: CategorySum[]; currency?: string }) {
  if (categories.length === 0) {
    return (
      <div className="p-8 text-center text-zinc-500 text-xs border border-dashed border-zinc-800 rounded-2xl">
        No expense data logged to build category distributions
      </div>
    );
  }

  // Draw SVG concentric circles or simple bar percentage lists
  return (
    <div className="bg-zinc-900/50 border border-zinc-850 rounded-[28px] p-6 flex flex-col gap-4 shadow-xl">
      <div className="flex justify-between items-center">
        <h4 className="text-sm font-bold text-white font-sans">Category Spread Analysis</h4>
        <span className="text-[9px] text-zinc-400 font-mono uppercase tracking-wider">By amount</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
        {/* Dynamic visual representation */}
        <div className="flex justify-center py-2">
          <svg width="150" height="150" viewBox="0 0 100 100" className="transform -rotate-90">
            {categories.map((cat, idx) => {
              // Calculate cumulative offsets
              let offset = 0;
              for (let i = 0; i < idx; i++) {
                offset += categories[i].percentage;
              }
              const strokeDash = `${cat.percentage} ${100 - cat.percentage}`;
              return (
                <circle
                  key={cat.name}
                  cx="50"
                  cy="50"
                  r="35"
                  fill="transparent"
                  stroke={cat.color}
                  strokeWidth="11"
                  strokeDasharray={strokeDash}
                  strokeDashoffset={-offset}
                  className="transition-all duration-1000 hover:stroke-[14] cursor-pointer"
                />
              );
            })}
            {/* Center Cover Card */}
            <circle cx="50" cy="50" r="23" fill="#0c0c0e" />
            <text x="50" y="52" className="text-[8px] font-mono font-bold text-zinc-400 text-center" textAnchor="middle" transform="rotate(90 50 50)">
              SPENT
            </text>
          </svg>
        </div>

        {/* Legend Panel */}
        <div className="space-y-2">
          {categories.map((cat) => (
            <div key={cat.name} id={`legend-${cat.name}`} className="flex flex-col">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                  <span className="text-zinc-300 font-medium truncate">{cat.name}</span>
                </div>
                <div className="flex items-center gap-2 font-mono shrink-0">
                  <span className="text-zinc-500 text-[10px]">{cat.percentage}%</span>
                  <span className="text-zinc-400 font-bold">{currency} {cat.value.toLocaleString()}</span>
                </div>
              </div>
              <div className="w-full bg-[#050505] h-1 rounded-full overflow-hidden mt-1">
                <div className="h-full rounded-full" style={{ width: `${cat.percentage}%`, backgroundColor: cat.color }} />
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
            className="text-zinc-900"
            strokeWidth="3.5"
            stroke="currentColor"
            fill="none"
          />
          <path
            className="text-emerald-400 transition-all duration-1000"
            strokeDasharray={`${percentage}, 100`}
            strokeWidth="3.5"
            strokeLinecap="round"
            stroke="currentColor"
            fill="none"
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-mono font-bold text-white">
          {percentage}%
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-bold text-white truncate">{name} Repaid</div>
        <div className="text-[10px] font-mono text-zinc-400 mt-0.5">
          Cleared: <span className="text-emerald-400 font-bold">{currency} {repaid.toLocaleString()}</span>
        </div>
        <div className="text-[10px] font-mono text-zinc-500">
          Outstanding: {currency} {remaining.toLocaleString()}
        </div>
      </div>
    </div>
  );
}
