import React from 'react';
import { TrendingUp } from 'lucide-react';

export interface CategorySum {
  name: string;
  value: number;
  percentage: number;
  color: string;
}

export function TrendAnalysisChart({ data, currency }: { data: { date: string; value: number }[]; currency: string }) {
  if (!data || data.length === 0) {
    return (
      <div className="card p-8 text-center min-h-[160px] grid place-items-center overflow-hidden relative">
        <div className="rainbow-bar !h-1 !rounded-none absolute top-0 left-0 right-0 opacity-30" />
        <div><p className="text-[13px] font-semibold">No trend data</p><p className="mono text-[11px] mt-1" style={{ color: 'var(--ink-3)' }}>Add transactions to map trend.</p></div>
      </div>
    );
  }
  const width = 500; const height = 120; const padding = 25;
  const values = data.map(d => d.value);
  const minVal = Math.min(...values); const maxVal = Math.max(...values); const range = maxVal - minVal || 1;
  const points = data.map((d, idx) => {
    const x = padding + (idx / (data.length - 1 || 1)) * (width - padding * 2);
    const y = height - padding - ((d.value - minVal) / range) * (height - padding * 2);
    return `${x},${y}`;
  }).join(' ');
  const fillPoints = `${padding},${height - padding} ${points} ${width - padding},${height - padding}`;
  return (
    <div className="card p-5 overflow-hidden relative">
      <div className="rainbow-bar !h-1 !rounded-none absolute top-0 left-0 right-0 opacity-30" />
      <div className="flex justify-between items-center mb-4">
        <p className="eyebrow">Net asset trend · 6 days</p>
        <span className="pill !py-1 !px-2 mono !text-[10px] inline-flex items-center gap-1"><TrendingUp size={11} />Live</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible">
        <defs><linearGradient id="trendMono" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--ink)" stopOpacity="0.08" /><stop offset="100%" stopColor="var(--ink)" stopOpacity="0" /></linearGradient></defs>
        <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="var(--line)" strokeWidth="1" strokeDasharray="3,3" />
        <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke="var(--line)" strokeWidth="1" strokeDasharray="3,3" />
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="var(--line)" strokeWidth="1" />
        <polygon points={fillPoints} fill="url(#trendMono)" />
        <polyline fill="none" stroke="var(--ink)" strokeWidth="1.5" points={points} strokeLinecap="round" strokeLinejoin="round" />
        {data.map((d, idx) => {
          const x = padding + (idx / (data.length - 1 || 1)) * (width - padding * 2);
          const y = height - padding - ((d.value - minVal) / range) * (height - padding * 2);
          return (<g key={idx}><circle cx={x} cy={y} r="3.5" fill="var(--surface)" stroke="var(--ink)" strokeWidth="1.5" /><title>{`${d.date}: ${currency} ${d.value.toLocaleString()}`}</title></g>);
        })}
      </svg>
      <div className="flex justify-between mono text-[10px] mt-3" style={{ color: 'var(--ink-3)' }}>
        {data.map((d, idx) => {
          let label = d.date;
          try { const dateObj = new Date(d.date); if (!isNaN(dateObj.getTime())) label = `${dateObj.getDate()} ${dateObj.toLocaleString('default', { month: 'short' })}`; } catch (_e) { /* ignore invalid date */ }
          return (<span key={idx} title={d.date}>{label}</span>);
        })}
      </div>
    </div>
  );
}

export function IncomeVsExpenseBar({ income, expense, currency }: { income: number; expense: number; currency: string }) {
  const total = income + expense || 1;
  const incomePct = Math.round((income / total) * 100);
  const expensePct = Math.round((expense / total) * 100);
  return (
    <div className="card p-5 space-y-4 overflow-hidden relative">
      <div className="rainbow-bar !h-1 !rounded-none absolute top-0 left-0 right-0 opacity-40" />
      <div className="flex justify-between items-center"><p className="eyebrow">Inflow vs outflow</p><span className="pill !py-1 !px-2 mono !text-[10px]">Statement</span></div>
      <div>
        <div className="flex justify-between mono text-[11px] mb-1.5"><span style={{ color: 'var(--ink-2)' }}>Incomes</span><span className="font-bold">{currency} {income.toLocaleString()} ({incomePct}%)</span></div>
        <div className="h-2 w-full rounded-full bg-[var(--surface-3)] overflow-hidden"><div className="h-full rounded-full bar-mint" style={{ width: `${incomePct}%`}} /></div>
      </div>
      <div>
        <div className="flex justify-between mono text-[11px] mb-1.5"><span style={{ color: 'var(--ink-2)' }}>Expenses</span><span className="font-bold">{currency} {expense.toLocaleString()} ({expensePct}%)</span></div>
        <div className="h-2 w-full rounded-full bg-[var(--surface-3)] overflow-hidden"><div className="h-full rounded-full bar-pink" style={{ width: `${expensePct}%`}} /></div>
      </div>
    </div>
  );
}

function getMonoShade(idx: number, total: number): string {
  const alpha = 0.18 + (idx / Math.max(1, total - 1)) * 0.75;
  return `color-mix(in srgb, var(--ink) ${Math.round(alpha * 100)}%, transparent)`;
}

const PASTEL_PALETTE = ['bar-pink','bar-mint','bar-yellow','bar-lavender','bar-blue'] as const;
function pastelClass(idx: number) { return PASTEL_PALETTE[idx % PASTEL_PALETTE.length]; }
function hexForPastel(cls: string): string {
  const map: Record<string,string> = { 'bar-pink':'#F4B5BE','bar-mint':'#C8E9D5','bar-yellow':'#F5E6A3','bar-lavender':'#D4C5F9','bar-blue':'#B8D4F0' };
  return map[cls] || '#0A0A0A';
}

export function CategorySpreadAnalysis({ categories, currency = 'Rs.', layout = 'auto' }: { categories: CategorySum[]; currency?: string; layout?: 'auto' | 'vertical' | 'horizontal' }) {
  if (categories.length === 0) {
    return (
      <div className="card p-6 text-center min-h-[180px] grid place-items-center">
        <div><p className="eyebrow">Category spread</p><p className="text-[12px] mt-2" style={{ color: 'var(--ink-2)' }}>No expense data yet.</p></div>
      </div>
    );
  }
  const total = categories.reduce((sum, cat) => sum + cat.value, 0);
  const dominantPct = total>0 ? Math.round((categories[0].value/total)*100) : 0;
  return (
    <div className="card p-5 flex flex-col gap-4 overflow-hidden relative">
      <div className="rainbow-bar !h-1 !rounded-none absolute top-0 left-0 right-0 opacity-40" />
      <div><h3 className="text-[14px] font-bold tracking-tight flex items-center gap-2">Category spread <span className="pill !py-0.5 !px-2 mono !text-[10px]">{dominantPct}% top</span></h3><p className="mono text-[11px] mt-0.5" style={{ color: 'var(--ink-2)' }}>Breakdown of expenses — Raul 78% arc homage</p></div>
      <div className="flex flex-col items-center">
        <div className="relative w-[132px] h-[132px]">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            <circle cx="50" cy="50" r="39.5" fill="transparent" stroke="var(--line)" strokeWidth="10" />
            {categories.map((cat, idx) => {
              const percentage = (cat.value / total) * 100;
              const radius = 39.5; const circumference = 2 * Math.PI * radius;
              const prevPct = categories.slice(0, idx).reduce((s, c) => s + (c.value / total) * 100, 0);
              const strokeLength = (percentage / 100) * circumference;
              const gap = categories.length > 1 ? 1.5 : 0;
              const adjusted = Math.max(0.5, strokeLength - gap);
              const strokeDash = `${adjusted} ${circumference - adjusted}`;
              const strokeOffset = -((prevPct / 100) * circumference);
              const cls = pastelClass(idx);
              return (<circle key={cat.name} cx="50" cy="50" r="39.5" fill="transparent" stroke={hexForPastel(cls)} strokeWidth="10" strokeDasharray={strokeDash} strokeDashoffset={strokeOffset} strokeLinecap="round" />);
            })}
          </svg>
          <div className="absolute inset-0 grid place-items-center text-center pointer-events-none">
            <div><p className="eyebrow !text-[8px]">Total</p><p className="mono text-[15px] font-bold tracking-tight">{currency}{total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p></div>
          </div>
        </div>
        <div className="w-full mt-4 space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
          {categories.map((cat, idx) => {
            const percentage = Math.round((cat.value / total) * 100);
            const cls = pastelClass(idx);
            return (
              <div key={cat.name} className="grid grid-cols-[8px_1fr_auto_auto] items-center gap-2 h-8 px-2.5 rounded-xl" style={{ border: '1px solid var(--line)', background: 'var(--surface-2)' }}>
                <span className={`w-2 h-2 rounded-full ${cls}`} />
                <span className="text-[11px] font-semibold truncate">{cat.name}</span>
                <span className="mono text-[11px] font-bold" style={{ color: 'var(--ink-2)' }}>{percentage}%</span>
                <span className="mono text-[11px] font-bold">{currency}{cat.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function RepaymentGauge({ totalDebt, remaining, name, currency = 'Rs.' }: { totalDebt: number; remaining: number; name: string; currency?: string }) {
  const repaid = totalDebt - remaining;
  const percentage = totalDebt > 0 ? Math.round((repaid / totalDebt) * 100) : 100;
  return (
    <div className="card p-4 flex gap-4 items-center overflow-hidden relative">
      <div className="rainbow-bar !h-1 !rounded-none absolute top-0 left-0 right-0 opacity-40" />
      <div className="relative w-16 h-16 shrink-0">
        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
          <circle cx="18" cy="18" r="15.9155" stroke="var(--line)" strokeWidth="3.5" fill="none" />
          <path strokeDasharray={`${percentage}, 100`} strokeWidth="3.5" strokeLinecap="round" stroke="url(#ultraRainbow)" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
          <defs><linearGradient id="ultraRainbow" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#F4B5BE"/><stop offset="50%" stopColor="#F5E6A3"/><stop offset="100%" stopColor="#B8D4F0"/></linearGradient></defs>
        </svg>
        <div className="absolute inset-0 grid place-items-center mono text-[11px] font-black">{percentage}%</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-bold truncate">{name} Repaid</div>
        <div className="mono text-[11px] mt-0.5" style={{ color: 'var(--ink-2)' }}>Cleared: <span className="font-bold" style={{ color: 'var(--ink)' }}>{currency} {repaid.toLocaleString()}</span></div>
        <div className="mono text-[11px]" style={{ color: 'var(--ink-3)' }}>Outstanding: {currency} {remaining.toLocaleString()}</div>
        <div className="h-1.5 rounded-full bg-[var(--surface-3)] overflow-hidden mt-1.5"><div className="h-full mw-progress" style={{ width: `${percentage}%`}} /></div>
      </div>
    </div>
  );
}
