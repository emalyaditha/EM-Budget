import type React from 'react';
import { Plus, ArrowDownLeft, Send, BarChart3 } from 'lucide-react';
import type { Transaction } from '../../types';
import { AnimatedCountUp } from '../ui/AnimatedCountUp';
import { formatMoney } from '../../lib/money';

interface DashboardHeroProps {
  currency: string;
  aggregateActiveWealth: number;
  totalCashAmount?: number;
  totalDebitCardsAmount?: number;
  userName?: string;
  currentMonthInflow?: number;
  currentMonthOutflow?: number;
  todayOutflow?: number;
  transactions?: Transaction[];
  onAddExpense?: () => void;
  onAddIncome?: () => void;
  onViewTransactions?: () => void;
  onSend?: () => void;
}

const TONE_BG: Record<string, string> = {
  pink: 'var(--pastel-pink)',
  mint: 'var(--pastel-mint)',
  yellow: 'var(--pastel-yellow)',
  lavender: 'var(--pastel-lavender)',
  blue: 'var(--pastel-blue)',
  ink: 'var(--surface-3)',
};

function getFirstName(full: string) {
  if (!full) return '';
  const n = full.trim().split(/\s+/)[0];
  return n.charAt(0).toUpperCase() + n.slice(1);
}

function QuickAction({
  label,
  tone,
  onClick,
  icon: Icon,
}: {
  label: string;
  tone: string;
  onClick?: () => void;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-center gap-1.5 group cursor-pointer min-w-0">
      <span
        className="w-12 h-12 rounded-full grid place-items-center pressable transition-colors group-hover:text-[var(--ink)]"
        style={{
          background: `color-mix(in oklab, ${TONE_BG[tone] ?? tone} 55%, var(--surface))`,
          border: `1px solid color-mix(in oklab, ${TONE_BG[tone] ?? tone} 70%, var(--line))`,
          color: 'var(--ink)',
        }}
      >
        <Icon size={18} strokeWidth={2.2} />
      </span>
      <span className="text-[10px] font-bold text-[var(--ink-2)] group-hover:text-[var(--ink)] whitespace-nowrap">
        {label}
      </span>
    </button>
  );
}

export function DashboardHero({
  currency,
  aggregateActiveWealth,
  totalCashAmount = 0,
  totalDebitCardsAmount = 0,
  currentMonthInflow = 0,
  currentMonthOutflow = 0,
  todayOutflow = 0,
  userName = '',
  onAddExpense,
  onAddIncome,
  onViewTransactions,
  onSend,
}: DashboardHeroProps) {
  const firstName = getFirstName(userName);
  const liquidCash = totalCashAmount + totalDebitCardsAmount;
  const net = currentMonthInflow - currentMonthOutflow;
  const positive = net >= 0;

  return (
    <section className="card card-lg p-5 sm:p-7 flex flex-col gap-6 text-left" aria-label="Balance overview">
      {/* Greeting + today's spend */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">{firstName ? `Welcome back, ${firstName}` : 'Welcome back'}</p>
          <p className="text-[13px] font-semibold text-[var(--ink)] mt-1">Here is your money today.</p>
        </div>
        <div
          className="shrink-0 text-right rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2"
          title="Spent today"
        >
          <p className="eyebrow !text-[9px]">Spent · today</p>
          {todayOutflow > 0 ? (
            <p className="money text-sm font-bold mt-0.5" style={{ color: 'var(--danger)' }}>
              {formatMoney(currency, todayOutflow, { maxFractionDigits: 0 })}
            </p>
          ) : (
            <p className="money text-sm font-bold mt-0.5 text-[var(--ink-3)]">No spend yet</p>
          )}
        </div>
      </div>

      {/* Giant balance + delta chip */}
      <div className="flex flex-col gap-2.5">
        <p className="eyebrow !text-[10px]">Total balance</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className={`money-display ${liquidCash < 0 ? 'text-[var(--danger)]' : 'text-[var(--ink)]'}`}>
            <AnimatedCountUp value={Math.abs(liquidCash)} duration={900} prefix={`${currency} `} />
          </p>
          <span className={`delta-chip ${positive ? 'delta-up' : 'delta-down'}`} title="This month net">
            {positive ? '▲' : '▼'} {formatMoney(currency, net, { maxFractionDigits: 0 })}
          </span>
        </div>
        <p className="text-[11px] money text-[var(--ink-3)]">
          Net worth{' '}
          <span className={aggregateActiveWealth < 0 ? 'text-[var(--danger)] font-semibold' : undefined}>
            {formatMoney(currency, aggregateActiveWealth, { maxFractionDigits: 0 })}
          </span>
        </p>
      </div>

      {/* Quick actions row */}
      <div className="flex items-start justify-between gap-2 px-1">
        <QuickAction label="Add" tone={TONE_BG.pink} icon={Plus} onClick={onAddExpense} />
        <QuickAction label="Receive" tone={TONE_BG.mint} icon={ArrowDownLeft} onClick={onAddIncome} />
        <QuickAction label="Send" tone={TONE_BG.blue} icon={Send} onClick={onSend} />
        <QuickAction label="Reports" tone={TONE_BG.lavender} icon={BarChart3} onClick={onViewTransactions} />
      </div>

      {/* Income / spend strip */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-2)] p-3.5">
          <p className="eyebrow !text-[9px]">Income · month</p>
          <p className="money text-sm font-bold mt-1" style={{ color: 'var(--success)' }}>
            {formatMoney(currency, currentMonthInflow, { maxFractionDigits: 0 })}
          </p>
        </div>
        <div className="rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-2)] p-3.5">
          <p className="eyebrow !text-[9px]">Spent · month</p>
          <p className="money text-sm font-bold mt-1" style={{ color: 'var(--danger)' }}>
            {formatMoney(currency, currentMonthOutflow, { maxFractionDigits: 0 })}
          </p>
        </div>
      </div>
    </section>
  );
}
