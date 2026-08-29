import React, { useState, useMemo } from 'react';
import { AppState } from '../types';
import { ArrowUpRight, ArrowDownLeft, Plus, ArrowRight, TrendingUp } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { DashboardHero } from './dashboard/DashboardHero';
import { DashboardMetricsGrid } from './dashboard/DashboardMetricsGrid';
import { QuickActionModal } from './dashboard/QuickActionModal';

export function AnimatedCountUp({ value, duration = 1200, prefix = "", suffix = "" }: { value: number, duration?: number, prefix?: string, suffix?: string }) {
  const [displayValue, setDisplayValue] = useState(0);

  React.useEffect(() => {
    let startTimestamp: number | null = null;
    const startValue = displayValue;
    const endValue = value;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const easeProgress = progress * (2 - progress);
      const currentValue = startValue + easeProgress * (endValue - startValue);
      setDisplayValue(currentValue);

      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        setDisplayValue(endValue);
      }
    };

    window.requestAnimationFrame(step);
  }, [value, duration]);

  return <span className="tabular-nums font-semibold">{prefix}{Math.round(displayValue).toLocaleString()}{suffix}</span>;
}

interface DashboardProps {
  state: AppState;
  aggregateActiveWealth: number;
  totalCashAmount: number;
  totalDebitCardsAmount: number;
  totalCreditCardsAmount: number;
  totalDebtsAmount: number;
  totalLoansGiven: number;
  currentMonthLabel: string;
  currentMonthInflow: number;
  currentMonthOutflow: number;
  setActiveTab: (tab: any) => void;
  setEditingTransactionId: (id: string | null) => void;
  onProfileClick: () => void;
  onNotificationClick: () => void;
  onAddIncome?: (amount: number, date: string, source: string, category: any, targetAccountId: string, targetType: 'cash' | 'card') => void;
  onAddExpense?: (title: string, description: string, amount: number, date: string, category: any, paymentMethodId: string, paymentMethodType: 'cash' | 'card', bankCharge?: number) => void;
}

export default function Dashboard({
  state,
  aggregateActiveWealth,
  totalCashAmount,
  totalDebitCardsAmount,
  totalCreditCardsAmount,
  totalDebtsAmount,
  totalLoansGiven,
  currentMonthLabel,
  currentMonthInflow,
  currentMonthOutflow,
  setActiveTab,
  setEditingTransactionId,
  onProfileClick,
  onNotificationClick,
  onAddIncome,
  onAddExpense
}: DashboardProps) {

  const [timeRange, setTimeRange] = useState<'1W' | '1M' | '3M' | 'YTD' | '1Y' | 'All'>('1M');
  const [isQuickTxOpen, setIsQuickTxOpen] = useState(false);
  const [txType, setTxType] = useState<'expense' | 'income'>('expense');

  const categoriesBudgets = state.budgets && state.budgets.length > 0 ? state.budgets : [];

  const liveBudgetTray = categoriesBudgets.map(b => {
    const bCategoryLower = b.category.toLowerCase().trim();
    const matchingTx = state.transactions.filter(t => {
      if (!t.category) return false;
      return t.category.toLowerCase().trim() === bCategoryLower &&
             (t.type === 'expense' || t.amount < 0);
    });
    const txSpentSum = matchingTx.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const matchingSubs = (state.subscriptions || []).filter(s => {
      if (!s.category || s.status !== 'Active') return false;
      return s.category.toLowerCase().trim() === bCategoryLower;
    });
    const subsSpentSum = matchingSubs.reduce((sum, s) => sum + s.amount, 0);
    const totalSpent = txSpentSum + subsSpentSum;
    const actualSpent = (matchingTx.length > 0 || matchingSubs.length > 0) ? totalSpent : (b.spent || 0);
    const remaining = Math.max(0, b.limit - actualSpent);
    const pct = Math.min(100, Math.round((actualSpent / b.limit) * 100));
    return {
      ...b,
      spent: actualSpent,
      remaining,
      percent: pct
    };
  });

  const getTransactionImpact = (t: any) => {
    if (t.type === 'income') return Math.abs(t.amount);
    if (t.type === 'expense') return -Math.abs(t.amount);
    return 0;
  };

  const transactionDates = useMemo(() => {
    return Array.from(
      new Set(
        state.transactions
          .filter(t => t.date)
          .map(t => t.date.split('T')[0])
      )
    ).sort();
  }, [state.transactions]);

  const sparklineData = useMemo(() => {
    const hasAnyRecords = state.cashAccounts.length > 0 || state.cards.length > 0 || state.transactions.length > 0 || state.debts.length > 0;
    if (!hasAnyRecords || transactionDates.length === 0) {
      return [];
    }
    const last6Dates = transactionDates.slice(-6);
    const orderedTxs = [...state.transactions].sort((a, b) => {
      if (!a.date || !b.date) return 0;
      return a.date.localeCompare(b.date);
    });
    const totalImpact = orderedTxs.reduce((sum, t) => sum + getTransactionImpact(t), 0);
    const baseNetWorth = aggregateActiveWealth - totalImpact;
    return last6Dates.map(dateStr => {
      const impactUpToDate = orderedTxs
        .filter(t => t.date && t.date.split('T')[0] <= dateStr)
        .reduce((sum, t) => sum + getTransactionImpact(t), 0);
      return {
        date: dateStr,
        value: baseNetWorth + impactUpToDate
      };
    });
  }, [state.transactions, transactionDates, aggregateActiveWealth, state.cashAccounts.length, state.cards.length, state.debts.length]);

  const fullTrendChartData = useMemo(() => {
    let daysCount = 30;
    if (timeRange === '1W') daysCount = 7;
    else if (timeRange === '3M') daysCount = 90;
    else if (timeRange === '1Y') daysCount = 365;
    else if (timeRange === 'YTD') {
      const jan1 = new Date(new Date().getFullYear(), 0, 1);
      const diffTime = new Date().getTime() - jan1.getTime();
      daysCount = Math.max(7, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    } else if (timeRange === 'All') {
      if (state.transactions.length === 0) daysCount = 30;
      else {
        const dates = state.transactions.map(t => new Date(t.date).getTime());
        const oldestTime = Math.min(...dates);
        const diffTime = new Date().getTime() - oldestTime;
        daysCount = Math.max(10, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
      }
    }
    const today = new Date();
    let runningBalance = aggregateActiveWealth;
    const balanceMap: Record<string, number> = {};
    for (let i = 0; i < daysCount; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      balanceMap[dateStr] = runningBalance;
      const dayTxs = state.transactions.filter(t => t.date && t.date.split('T')[0] === dateStr);
      const dayImpact = dayTxs.reduce((sum, t) => sum + getTransactionImpact(t), 0);
      runningBalance -= dayImpact;
    }
    return Object.keys(balanceMap).sort().map(dateStr => ({
      date: dateStr,
      value: balanceMap[dateStr]
    }));
  }, [timeRange, aggregateActiveWealth, state.transactions]);

  const formatXAxis = (tickItem: string) => {
    try {
      const dateObj = new Date(tickItem);
      if (isNaN(dateObj.getTime())) return tickItem;
      if (timeRange === '1W') {
        return dateObj.toLocaleDateString(undefined, { weekday: 'short' });
      }
      if (timeRange === '1M' || timeRange === '3M') {
        return dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      }
      return dateObj.toLocaleDateString(undefined, { month: 'short' });
    } catch {
      return tickItem;
    }
  };

  const CustomChartTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const value = data.value;
      const initialVal = fullTrendChartData[0]?.value || value;
      const delta = value - initialVal;
      const deltaPct = initialVal !== 0 ? (delta / initialVal) * 100 : 0;
      return (
        <div className="card p-3 text-left min-w-[160px]">
          <p className="eyebrow">{data.date}</p>
          <p className="mono text-sm font-semibold text-[var(--ink)] mt-1">
            {state.currency}{value.toLocaleString()}
          </p>
          <p className="mono text-[10px] font-medium mt-1 flex items-center gap-1 text-[var(--ink-2)]">
            <span>{delta >= 0 ? '▲' : '▼'}</span>
            <span>{delta >= 0 ? '+' : ''}{delta.toLocaleString()} ({deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(1)}%)</span>
          </p>
        </div>
      );
    }
    return null;
  };

  const getSubDueDays = (dueDateStr: string, status: string) => {
    if (status !== 'Active') return { label: 'Paused', style: 'border-[var(--line)] text-[var(--ink-3)] bg-[var(--surface-2)]' };
    const today = new Date();
    today.setHours(0,0,0,0);
    const due = new Date(dueDateStr);
    due.setHours(0,0,0,0);
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      return { label: `Overdue (${Math.abs(diffDays)}d)`, style: 'border-[var(--ink)] bg-[var(--accent)] text-[var(--accent-fg)]' };
    }
    if (diffDays === 0) {
      return { label: 'Due Today', style: 'border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]' };
    }
    if (diffDays <= 5) {
      return { label: `In ${diffDays} days`, style: 'border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink-2)]' };
    }
    return { label: `In ${diffDays} days`, style: 'border-[var(--line)] bg-[var(--surface)] text-[var(--ink-2)]' };
  };

  const openQuick = (type: 'expense' | 'income') => {
    setTxType(type);
    setIsQuickTxOpen(true);
  };

  return (
    <div className="flex flex-col bg-[var(--bg)] text-[var(--ink)] font-sans animate-fade-in gap-6 px-4 sm:px-6 py-5 max-w-[1280px] mx-auto w-full" id="command-dashboard">

      {/* PIN IDENTICAL 2-col grid: left Financial report, right My goals */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-7">
          <DashboardHero
            currency={state.currency}
            aggregateActiveWealth={aggregateActiveWealth}
            totalAssets={totalCashAmount + totalDebitCardsAmount}
            totalLiabilities={totalCreditCardsAmount + totalDebtsAmount}
            assetRatioPct={0}
            liabilityRatioPct={0}
            sparklineData={sparklineData}
            trendLabel=""
            trendColorClass=""
            onManageWallets={() => setActiveTab('accounts')}
            userName={state.userProfile?.name || 'Sara'}
            userAvatarUrl={state.userProfile?.avatarUrl}
            currentMonthInflow={currentMonthInflow}
            currentMonthOutflow={currentMonthOutflow}
            transactions={state.transactions}
            onAddExpense={() => openQuick('expense')}
            onAddIncome={() => openQuick('income')}
            onViewTransactions={() => setActiveTab('reports')}
            onProfileClick={onProfileClick}
          />
        </div>

        <div className="lg:col-span-5 flex flex-col gap-5">
          <DashboardMetricsGrid
            liveBudgetTray={liveBudgetTray}
            currency={state.currency}
            onNavigateToBudgets={() => setActiveTab('budgets')}
            savingsGoals={state.savingsGoals || []}
            onNavigateToGoals={() => setActiveTab('goals')}
            onNewGoal={() => setActiveTab('goals')}
          />

          {/* Secondary: Trend — keeps real data visible below the pin cards */}
          <div className="card p-5 sm:p-6 flex flex-col gap-5 text-left rounded-[20px]">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="space-y-1">
                <h3 className="eyebrow !text-[11px]">Portfolio trend</h3>
                <p className="text-xs text-[var(--ink-2)]">Cumulative net worth — {timeRange} · {currentMonthLabel}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(['1W', '1M', '3M', 'YTD', '1Y', 'All'] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setTimeRange(r)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-medium mono border transition-colors ${
                      timeRange === r
                        ? 'bg-[var(--accent)] text-[var(--accent-fg)] border-[var(--accent)]'
                        : 'border-[var(--line)] text-[var(--ink-2)] hover:border-[var(--line-strong)] hover:text-[var(--ink)] bg-[var(--surface)]'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div className="w-full h-[240px] sm:h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={fullTrendChartData} margin={{ left: -10, right: 6, top: 6, bottom: 0 }}>
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatXAxis}
                    stroke="var(--ink-3)"
                    fontSize={10}
                    fontFamily="JetBrains Mono"
                    dy={8}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="var(--ink-3)"
                    fontSize={10}
                    fontFamily="JetBrains Mono"
                    dx={-6}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => `${state.currency}${val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val}`}
                  />
                  <RechartsTooltip content={<CustomChartTooltip />} cursor={{ stroke: 'var(--line-strong)', strokeWidth: 1, strokeDasharray: '3 3' }} />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="var(--ink)"
                    strokeWidth={1.5}
                    fill="var(--ink)"
                    fillOpacity={0.06}
                    dot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom: Recent ledger + Recurring (kept for real data, styled to match pin tokens) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div className="lg:col-span-7 card p-5 sm:p-6 w-full text-left flex flex-col gap-5 rounded-[20px]">
          <div className="flex justify-between items-start gap-4">
            <div className="space-y-1">
              <h3 className="eyebrow !text-[11px]">Recent ledger</h3>
              <p className="text-xs text-[var(--ink-2)]">Last 5 operations</p>
            </div>
            <button
              onClick={() => setActiveTab('reports')}
              className="text-xs font-medium text-[var(--ink-2)] hover:text-[var(--ink)] transition-colors"
            >
              See all →
            </button>
          </div>

          <div className="ledger-rule" />

          <div className="space-y-0 divide-y divide-[var(--line)] -mt-2">
            {state.transactions.length === 0 && state.loansGiven.length === 0 ? (
              <div className="py-10 text-center border border-dashed border-[var(--line)] rounded-xl bg-[var(--surface-2)]/40">
                <p className="eyebrow">No activity</p>
                <p className="text-xs text-[var(--ink-2)] mt-1">No ledger entries yet.</p>
              </div>
            ) : (
              [
                ...state.transactions.map((t, idx) => ({ ...t, logType: 'transaction' as const, originalIdx: idx })),
                ...state.loansGiven.map((l, idx) => ({
                    id: l.id,
                    type: 'expense' as const,
                    title: `Loan Given: ${l.borrowerName}`,
                    amount: l.totalAmount,
                    date: l.dateGiven,
                    category: 'Loan',
                    logType: 'loan' as const,
                    accountType: l.sourceAccountType,
                    updated_at: l.updated_at || l.updatedAt,
                    updatedAt: l.updated_at || l.updatedAt,
                    originalIdx: idx
                })),
                ...state.loansGiven.flatMap((l, lIdx) => l.settlements.map((s, sIdx) => ({
                    id: s.id,
                    type: 'income' as const,
                    title: `Loan Settle: ${l.borrowerName}`,
                    amount: s.amount,
                    date: s.date,
                    category: 'Loan Settle',
                    logType: 'settlement' as const,
                    accountType: s.receivedInType,
                    updated_at: s.updated_at || s.updatedAt,
                    updatedAt: s.updated_at || s.updatedAt,
                    originalIdx: lIdx * 100 + sIdx
                })))
              ]
                .sort((a, b) => {
                  const getTs = (item: any): number => {
                    const raw = item.updated_at || item.updatedAt || item.created_at || item.createdAt || item.date || item.dateGiven;
                    if (!raw) return 0;
                    const time = new Date(raw).getTime();
                    return isNaN(time) ? 0 : time;
                  };
                  const timeA = getTs(a);
                  const timeB = getTs(b);
                  if (timeA !== timeB) {
                    return timeB - timeA;
                  }
                  const dateA = a.date || (a as any).dateGiven || '';
                  const dateB = b.date || (b as any).dateGiven || '';
                  const dateCompare = dateB.localeCompare(dateA);
                  if (dateCompare !== 0) return dateCompare;
                  const aNum = parseInt((a.id || '').replace(/\D/g, ''), 10);
                  const bNum = parseInt((b.id || '').replace(/\D/g, ''), 10);
                  if (!isNaN(aNum) && !isNaN(bNum) && aNum !== bNum) {
                    return bNum - aNum;
                  }
                  if (a.originalIdx !== undefined && b.originalIdx !== undefined && a.originalIdx !== b.originalIdx) {
                    return b.originalIdx - a.originalIdx;
                  }
                  return (b.id || '').localeCompare(a.id || '');
                })
                .slice(0, 5)
                .map((t) => {
                  const isInc = t.type === 'income' || t.type === 'deposit' || t.type === 'financing' || (t.type === 'transfer' && t.amount > 0);
                  const absAmt = Math.abs(t.amount);
                  return (
                    <div
                      key={`${t.logType}-${t.id}`}
                      className="flex justify-between items-center gap-4 py-3.5 first:pt-0 cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => {
                        if (t.logType === 'transaction') {
                          setEditingTransactionId(t.id);
                        }
                      }}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="w-8 h-8 rounded-full border border-[var(--line)] bg-[var(--surface-2)] flex items-center justify-center shrink-0 text-[var(--ink-2)]">
                          {isInc ? <ArrowDownLeft size={13} /> : <ArrowUpRight size={13} />}
                        </span>
                        <div className="min-w-0 flex-1 text-left">
                          <div className="flex flex-wrap items-center gap-2">
                            <h5 className="text-xs font-semibold tracking-tight text-[var(--ink)] truncate max-w-[18ch] sm:max-w-none">{t.title}</h5>
                            <span className="mono text-[10px] px-2 py-0.5 rounded-full border border-[var(--line)] text-[var(--ink-2)] uppercase">
                              {t.category}
                            </span>
                          </div>
                          <p className="mono text-[11px] text-[var(--ink-3)] mt-1">{t.date}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0 mono">
                        <span className="text-xs font-semibold tracking-tight tabular-nums text-[var(--ink)] block">
                          {isInc ? '+' : '-'}{state.currency}{absAmt.toLocaleString()}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide text-[var(--ink-3)] block mt-0.5">
                          {t.accountType === 'cash' ? 'Cash' : 'Card'}
                        </span>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>

        <div className="lg:col-span-5 card p-5 sm:p-6 w-full text-left flex flex-col gap-5 rounded-[20px]">
          <div className="flex justify-between items-start gap-4">
            <div className="space-y-1">
              <h3 className="eyebrow !text-[11px]">Recurring</h3>
              <p className="text-xs text-[var(--ink-2)]">Active subscriptions</p>
            </div>
            <button
              onClick={() => setActiveTab('inflow_outflow')}
              className="text-xs font-medium text-[var(--ink-2)] hover:text-[var(--ink)] transition-colors"
            >
              Configure →
            </button>
          </div>

          <div className="ledger-rule" />

          <div className="space-y-3">
            {!state.subscriptions || state.subscriptions.length === 0 ? (
              <div className="py-10 text-center border border-dashed border-[var(--line)] rounded-xl bg-[var(--surface-2)]/40">
                <p className="eyebrow">No plans</p>
                <p className="text-xs text-[var(--ink-2)] mt-1">No recurring plans configured.</p>
              </div>
            ) : (
              [...state.subscriptions]
                .filter(s => s.status === 'Active')
                .sort((a,b) => a.dueDate.localeCompare(b.dueDate))
                .slice(0, 3)
                .map((sub) => {
                  const billState = getSubDueDays(sub.dueDate, sub.status);
                  return (
                    <div
                      key={sub.id}
                      className="border border-[var(--line)] rounded-xl p-4 space-y-3 bg-[var(--surface)]"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0 space-y-1">
                          <h5 className="text-xs font-semibold tracking-tight text-[var(--ink)] leading-tight truncate">{sub.name}</h5>
                          <span className="eyebrow !text-[10px] !text-[var(--ink-3)]">Billing • {sub.billingCycle}</span>
                        </div>
                        <span className={`mono text-[10px] px-2 py-1 rounded-full border font-medium shrink-0 ${billState.style}`}>
                          {billState.label}
                        </span>
                      </div>
                      <div className="ledger-rule" />
                      <div className="flex justify-between items-center">
                        <div>
                          <span className="eyebrow !text-[9px] block">Obligation</span>
                          <span className="mono text-xs font-semibold tracking-tight text-[var(--ink)]">
                            {state.currency}{sub.amount.toLocaleString()}
                          </span>
                        </div>
                        <button
                          onClick={() => setActiveTab('inflow_outflow')}
                          className="btn-ghost !py-1.5 !px-3 !text-[11px]"
                        >
                          Settle
                        </button>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>
      </div>

      <QuickActionModal
        isOpen={isQuickTxOpen}
        onClose={() => setIsQuickTxOpen(false)}
        state={state}
        initialType={txType}
        onAddIncome={onAddIncome}
        onAddExpense={onAddExpense}
      />

    </div>
  );
}
