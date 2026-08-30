import { Menu, Search, Plus, ArrowUpRight, ArrowDownLeft, ChevronDown, Send, Download, Eye } from 'lucide-react';
import { Transaction } from '../../types';

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
  userName?: string;
  userAvatarUrl?: string;
  currentMonthInflow?: number;
  currentMonthOutflow?: number;
  transactions?: Transaction[];
  onAddExpense?: () => void;
  onAddIncome?: () => void;
  onViewTransactions?: () => void;
  onSend?: () => void;
  onProfileClick?: () => void;
}

const PASTEL_CLASSES = ['bar-pink', 'bar-mint', 'bar-yellow', 'bar-lavender', 'bar-blue'] as const;

function getFirstName(full: string) {
  if (!full) return '';
  const n = full.trim().split(/\s+/)[0];
  return n.charAt(0).toUpperCase() + n.slice(1);
}

export function DashboardHero({
  currency,
  aggregateActiveWealth,
  currentMonthInflow = 0,
  currentMonthOutflow = 0,
  transactions = [],
  userName = '',
  userAvatarUrl,
  onAddExpense,
  onAddIncome,
  onViewTransactions,
  onSend,
}: DashboardHeroProps) {
  const firstName = getFirstName(userName);

  const report = (() => {
    const expenseTx = transactions.filter((t) => t.type === 'expense' || (typeof t.amount === 'number' && t.amount < 0));
    const byCat = new Map<string, number>();
    for (const t of expenseTx) {
      const cat = (t.category || 'Otros').trim() || 'Otros';
      byCat.set(cat, (byCat.get(cat) || 0) + Math.abs(t.amount));
    }
    let entries = Array.from(byCat.entries())
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    const fallbackLabels = ['Food', 'Transporte', 'Ocio', 'Vivienda', 'Otros'];
    const fallbackTotals = [420, 310, 260, 180, 120];
    if (entries.length === 0) {
      entries = fallbackLabels.map((c, i) => ({ category: c, total: fallbackTotals[i] }));
    } else if (entries.length < 5) {
      for (let i = entries.length; i < 5; i++) {
        if (!entries.find((e) => e.category === fallbackLabels[i])) {
          entries.push({ category: fallbackLabels[i], total: 0 });
        }
      }
    }
    const max = Math.max(...entries.map((e) => e.total), 1);
    return entries.slice(0, 5).map((e, i) => ({
      ...e,
      pct: e.total === 0 ? 18 + i * 3 : Math.max(14, Math.round((e.total / max) * 100)),
      pastel: PASTEL_CLASSES[i % PASTEL_CLASSES.length],
    }));
  })();

  return (
    <div className="card p-5 sm:p-6 flex flex-col gap-5 rounded-[20px] text-left overflow-hidden">
      {/* Top row: hamburger + search + avatar */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          aria-label="Menu"
          className="w-9 h-9 rounded-full border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink-2)] hover:text-[var(--ink)] hover:border-[var(--line-strong)] flex items-center justify-center shrink-0 transition-colors"
        >
          <Menu size={16} />
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Search"
            className="w-9 h-9 rounded-full border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink-2)] hover:text-[var(--ink)] flex items-center justify-center shrink-0 transition-colors"
          >
            <Search size={14} />
          </button>
          <div className="w-9 h-9 rounded-full bg-[var(--accent)] text-[var(--accent-fg)] font-semibold text-xs flex items-center justify-center overflow-hidden border border-[var(--line)] shrink-0">
            {userAvatarUrl ? (
              <img src={userAvatarUrl} alt={userName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              firstName.charAt(0).toUpperCase()
            )}
          </div>
        </div>
      </div>

      {/* Welcome */}
      <div className="space-y-1">
        <p className="eyebrow">Welcome</p>
        <h2 className="text-[26px] sm:text-[28px] font-bold tracking-tight leading-none text-[var(--ink)]">
          <span className="font-normal">Welcome</span> <span className="font-extrabold">{firstName || 'there'}!</span>
        </h2>
      </div>

      {/* Aivo huge centered balance — pins: Aivo $126k + Janvis pills + Raul 3 pills */}
      <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface-2)]/70 p-5 sm:p-6 flex flex-col items-center gap-3 text-center">
        {/* currency selector pill */}
        <button
          type="button"
          className="pill mono !py-1.5 !px-3 !text-[11px] tracking-wide !bg-[var(--surface)] hover:border-[var(--line-strong)]"
          aria-label="Currency selector"
          onClick={onViewTransactions}
        >
          <span className="w-5 h-5 rounded-full bg-[var(--ink)] text-[var(--accent-fg)] grid place-items-center text-[9px] font-bold">●</span>
          {currency} <ChevronDown size={12} className="opacity-60" />
        </button>

        {/* huge 32px mono bold tabular */}
        <div className="flex flex-col items-center gap-1">
          <p className="mono text-[30px] sm:text-[32px] font-bold tracking-tight tabular-nums leading-none text-[var(--ink)]">
            {currency}
            {aggregateActiveWealth.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="eyebrow !text-[10px]">Available balance</p>
        </div>

        {/* 3 pills Add / Receive / Send — like Raul + Janvis */}
        <div className="flex flex-wrap justify-center gap-2 pt-1">
          <button type="button" onClick={onAddExpense} className="pill pill-active !py-2 !px-4 mono !text-[12px] font-semibold">
            <Plus size={13} strokeWidth={2.4} /> Add
          </button>
          <button type="button" onClick={onAddIncome} className="pill !py-2 !px-4 mono !text-[12px] font-semibold bg-[var(--surface)]">
            <Download size={13} strokeWidth={2} /> Receive
          </button>
          <button type="button" onClick={onSend} className="pill !py-2 !px-4 mono !text-[12px] font-semibold bg-[var(--surface)]">
            <Send size={13} strokeWidth={2} /> Send
          </button>
        </div>
      </div>

      {/* Income / Expenses row — retains real data */}
      <div className="grid grid-cols-2 gap-4 border-y border-[var(--line)] py-4">
        <div className="space-y-1">
          <p className="eyebrow !text-[10px]">Income</p>
          <p className="mono text-sm font-semibold tracking-tight tabular-nums text-[var(--ink)] flex items-center gap-1.5">
            <span className="w-6 h-6 rounded-full border border-[var(--line)] bg-[var(--surface-2)] flex items-center justify-center text-[var(--ink-2)] shrink-0">
              <ArrowDownLeft size={11} />
            </span>
            {currency}
            {currentMonthInflow.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className="space-y-1">
          <p className="eyebrow !text-[10px]">Expenses</p>
          <p className="mono text-sm font-semibold tracking-tight tabular-nums text-[var(--ink)] flex items-center gap-1.5">
            <span className="w-6 h-6 rounded-full border border-[var(--line)] bg-[var(--surface-2)] flex items-center justify-center text-[var(--ink-2)] shrink-0">
              <ArrowUpRight size={11} />
            </span>
            {currency}
            {currentMonthOutflow.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
        </div>
      </div>

      {/* Financial report — pastel bars INSIDE card-dark (Ultra requirement) */}
      <div className="card-dark p-4 sm:p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[13px] font-bold tracking-tight text-white">Informe financiero</h3>
          <button type="button" onClick={onViewTransactions} className="w-7 h-7 rounded-full bg-white/10 border border-white/15 grid place-items-center text-white/80 hover:bg-white/15 transition-colors">
            <Eye size={12} />
          </button>
        </div>
        <div className="space-y-2.5">
          {report.map((row) => (
            <div key={row.category} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="mono text-[10px] font-semibold tracking-wide uppercase text-white/70 truncate">{row.category}</span>
                <span className="mono text-[10px] font-medium tabular-nums text-white/50 shrink-0">
                  {currency}
                  {row.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="h-10 w-full rounded-[12px] bg-white/[0.08] border border-white/10 overflow-hidden p-1">
                <div
                  className={`h-full rounded-[8px] ${row.pastel} transition-all duration-700`}
                  style={{ width: `${row.pct}%` }}
                  aria-label={`${row.category} ${row.pct}%`}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
