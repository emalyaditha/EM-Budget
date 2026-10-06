import React, { useState, useMemo } from 'react';
import type { AppState, AppTab, CategoryIncome, CategoryExpense } from '../types';
import { ArrowRight, PieChart } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart as RechartsPie,
  Pie,
  Cell,
} from 'recharts';
import { DashboardHero } from './dashboard/DashboardHero';
import { buildHeroWallets } from './dashboard/WalletDeck';
import { QuickActionModal } from './dashboard/QuickActionModal';
import { AlertsPanel } from './AlertsPanel';
import { TransactionRow } from './ui/TransactionRow';
import { CategoryChip } from './ui/CategoryChip';
import { SegmentedControl } from './ui/SegmentedControl';
import { ProgressBarThick, toneForPercent } from './ui/ProgressRing';
import { todayLocal, budgetSpendingForMonth, isInCurrentMonth, isSpendingRow, localDayKey } from '../utils';
import { formatMoney, subtractMoney, sumMoney, toMinorUnits } from '../lib/money';

interface DashboardProps {
  state: AppState;
  userEmail?: string;
  aggregateActiveWealth: number;
  totalCashAmount: number;
  totalDebitCardsAmount: number;
  totalCreditCardsAmount: number;
  totalDebtsAmount: number;
  totalLoansGiven: number;
  currentMonthLabel: string;
  currentMonthInflow: number;
  currentMonthOutflow: number;
  setActiveTab: (tab: AppTab) => void;
  setEditingTransactionId: (id: string | null) => void;
  onNotificationClick: () => void;
  onAddIncome?: (
    amount: number,
    date: string,
    source: string,
    category: CategoryIncome,
    targetAccountId: string,
    targetType: 'cash' | 'card',
  ) => void;
  onAddExpense?: (
    title: string,
    description: string,
    amount: number,
    date: string,
    category: CategoryExpense,
    paymentMethodId: string,
    paymentMethodType: 'cash' | 'card',
    bankCharge?: number,
  ) => void;
}

type ActivityLogItem = {
  id: string;
  type: string;
  title: string;
  amount: number;
  date: string;
  category: string;
  logType: 'transaction' | 'loan' | 'settlement';
  accountType?: string;
  updated_at?: string;
  updatedAt?: string;
  created_at?: string;
  createdAt?: string;
  dateGiven?: string;
  originalIdx: number;
};

const DONUT_COLORS = [
  'var(--pastel-lavender)',
  'var(--pastel-blue)',
  'var(--pastel-mint)',
  'var(--pastel-yellow)',
  'var(--pastel-pink)',
];

function dayLabel(dateStr: string): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const d = dateStr.split('T')[0];
  // The chart keys are local days now, so the comparison has to be local too —
  // against a UTC key these two labels simply never matched for a UTC+5:30 reader.
  if (d === todayLocal()) return 'Today';
  if (d === localDayKey(yesterday)) return 'Yesterday';
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return dateStr;
  return parsed.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

// Ledger dates arrive either as a bare `YYYY-MM-DD` (every locally-created entry)
// or as a full timestamp from the cloud. Only the latter can honestly claim a
// time, and a bare day must be parsed as local — `new Date('2026-03-04')` is UTC
// midnight, which would print the day before it west of Greenwich.
function activityMeta(raw: string): string {
  if (!raw) return 'Ledger';
  const dayOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw) || /^\d{4}-\d{2}-\d{2}T00:00:00(?:\.000)?Z?$/.test(raw);
  let date: Date;
  if (dayOnly) {
    const [y, m, d] = raw.slice(0, 10).split('-').map(Number);
    date = new Date(y, m - 1, d);
  } else {
    date = new Date(raw);
  }
  if (isNaN(date.getTime())) return raw;
  // The year only earns its width when it is not the current one — at 320px the
  // extra four digits were what pushed the row title into an ellipsis.
  const stamp: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (date.getFullYear() !== new Date().getFullYear()) stamp.year = 'numeric';
  const day = date.toLocaleDateString(undefined, stamp);
  return dayOnly ? day : `${day} · ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

export default function Dashboard({
  state,
  aggregateActiveWealth,
  totalCashAmount,
  totalDebitCardsAmount,
  currentMonthLabel,
  currentMonthInflow,
  currentMonthOutflow,
  setActiveTab,
  setEditingTransactionId,
  onAddIncome,
  onAddExpense,
}: DashboardProps) {
  const [timeRange, setTimeRange] = useState<'1W' | '1M' | '3M' | 'YTD' | '1Y' | 'All'>('1M');
  const [activityView, setActivityView] = useState<'all' | 'recent'>('recent');
  const [isQuickTxOpen, setIsQuickTxOpen] = useState(false);
  const [txType, setTxType] = useState<'expense' | 'income'>('expense');

  const categoriesBudgets = state.budgets && state.budgets.length > 0 ? state.budgets : [];

  const liveBudgetTray = categoriesBudgets.map((b) => {
    const { spent } = budgetSpendingForMonth(b.category, state.transactions, state.subscriptions || []);
    const remaining = Math.max(0, subtractMoney(b.limit, spent));
    const percent = b.limit > 0 ? Math.min(100, Math.round((spent / b.limit) * 100)) : 0;
    return { ...b, spent, remaining, percent };
  });

  const getTransactionImpact = (t: AppState['transactions'][number]) => {
    // The trend line is drawn by walking *backwards* from today's wealth, so each row
    // has to be undone with the sign it had when it landed. A balance adjustment is a
    // deposit or a withdrawal, and ignoring it pinned the correction to today and left
    // every earlier day on the wrong side of it. Transfers and credit-card purchases
    // move nothing in or out of the household, so they stay at zero.
    if (t.type === 'income' || t.type === 'deposit') return Math.abs(t.amount);
    if (t.type === 'expense' || t.type === 'withdrawal') return -Math.abs(t.amount);
    return 0;
  };

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
        const dates = state.transactions.map((t) => new Date(t.date).getTime());
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
      const dateStr = localDayKey(d);
      balanceMap[dateStr] = runningBalance;
      const dayTxs = state.transactions.filter((t) => t.date && t.date.split('T')[0] === dateStr);
      const dayImpact = dayTxs.reduce((sum, t) => sum + getTransactionImpact(t), 0);
      runningBalance -= dayImpact;
    }
    return Object.keys(balanceMap)
      .sort()
      .map((dateStr) => ({ date: dateStr, value: balanceMap[dateStr] }));
  }, [timeRange, aggregateActiveWealth, state.transactions]);

  const donutData = useMemo(() => {
    const byCat = new Map<string, number>();
    for (const t of state.transactions) {
      if (!isSpendingRow(t)) continue;
      if (!isInCurrentMonth(t.date)) continue;
      const cat = (t.category || 'Other').trim() || 'Other';
      byCat.set(cat, (byCat.get(cat) || 0) + toMinorUnits(t.amount));
    }
    return Array.from(byCat.entries())
      .map(([name, cents]) => ({ name, value: cents / 100 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [state.transactions]);
  const donutTotal = donutData.reduce((s, d) => s + toMinorUnits(d.value), 0) / 100;

  const todayOutflow = useMemo(() => {
    const today = todayLocal();
    return sumMoney(
      state.transactions.filter((t) => isSpendingRow(t) && t.date && t.date.startsWith(today)).map((t) => t.amount),
    );
  }, [state.transactions]);

  const activityLog = useMemo(() => {
    const combined: ActivityLogItem[] = [
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
        originalIdx: idx,
      })),
      ...state.loansGiven.flatMap((l, lIdx) =>
        l.settlements.map((s, sIdx) => ({
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
          originalIdx: lIdx * 100 + sIdx,
        })),
      ),
    ];
    return combined.sort((a, b) => {
      // Order by ledger day first, not by when the row was last touched —
      // back-dating yesterday's entries today must not float them into Today.
      const dayOf = (item: ActivityLogItem) =>
        (item.date || (item as { dateGiven?: string }).dateGiven || '').slice(0, 10);
      const tsOf = (raw?: string): number => {
        if (!raw) return 0;
        const t = new Date(raw).getTime();
        return isNaN(t) ? 0 : t;
      };
      const dayCompare = dayOf(b).localeCompare(dayOf(a));
      if (dayCompare !== 0) return dayCompare;
      const timeA = tsOf(a.date) || tsOf((a as { dateGiven?: string }).dateGiven);
      const timeB = tsOf(b.date) || tsOf((b as { dateGiven?: string }).dateGiven);
      if (timeA !== timeB) return timeB - timeA;
      const updA = Math.max(tsOf(a.updated_at), tsOf(a.updatedAt), tsOf(a.created_at), tsOf(a.createdAt));
      const updB = Math.max(tsOf(b.updated_at), tsOf(b.updatedAt), tsOf(b.created_at), tsOf(b.createdAt));
      if (updA !== updB) return updB - updA;
      const dateA = a.date || (a as { dateGiven?: string }).dateGiven || '';
      const dateB = b.date || (b as { dateGiven?: string }).dateGiven || '';
      const dateCompare = dateB.localeCompare(dateA);
      if (dateCompare !== 0) return dateCompare;
      const aNum = parseInt((a.id || '').replace(/\D/g, ''), 10);
      const bNum = parseInt((b.id || '').replace(/\D/g, ''), 10);
      if (!isNaN(aNum) && !isNaN(bNum) && aNum !== bNum) return bNum - aNum;
      if (a.originalIdx !== undefined && b.originalIdx !== undefined && a.originalIdx !== b.originalIdx) {
        return b.originalIdx - a.originalIdx;
      }
      return (b.id || '').localeCompare(a.id || '');
    });
  }, [state.transactions, state.loansGiven]);

  // Recent is today's ledger; View All is the whole ledger, newest first. Both
  // are capped so a long history cannot turn the panel into an endless column.
  const visibleActivity = useMemo(() => {
    const today = todayLocal();
    const source =
      activityView === 'recent'
        ? activityLog.filter((item) => (item.date || item.dateGiven || '').slice(0, 10) === today)
        : activityLog;
    return source.slice(0, 12);
  }, [activityLog, activityView]);

  const groupedActivity: { day: string; items: ActivityLogItem[] }[] = [];
  for (const item of visibleActivity) {
    const label = dayLabel(item.date || item.dateGiven || '');
    const last = groupedActivity[groupedActivity.length - 1];
    if (last && last.day === label) last.items.push(item);
    else groupedActivity.push({ day: label, items: [item] });
  }

  // Drives the hero deck; see `buildHeroWallets` for why its totals are the same
  // ones `calculateNetWorth` reports.
  const heroWallets = buildHeroWallets(state);

  const formatXAxis = (tickItem: string) => {
    try {
      const dateObj = new Date(tickItem);
      if (isNaN(dateObj.getTime())) return tickItem;
      if (timeRange === '1W') return dateObj.toLocaleDateString(undefined, { weekday: 'short' });
      if (timeRange === '1M' || timeRange === '3M')
        return dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      return dateObj.toLocaleDateString(undefined, { month: 'short' });
    } catch {
      return tickItem;
    }
  };

  const CustomChartTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{ payload: { date: string; value: number } }>;
  }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const value = data.value;
      const initialVal = fullTrendChartData[0]?.value || value;
      const delta = value - initialVal;
      const deltaPct = initialVal !== 0 ? (delta / initialVal) * 100 : 0;
      return (
        <div className="card p-3 text-left min-w-[160px] !rounded-[var(--r-sm)]">
          <p className="eyebrow">{data.date}</p>
          <p className="money text-sm font-semibold text-[var(--ink)] mt-1">
            {state.currency}
            {value.toLocaleString()}
          </p>
          <p className="money text-[10px] font-medium mt-1 flex items-center gap-1 text-[var(--ink-2)]">
            <span>{delta >= 0 ? '▲' : '▼'}</span>
            <span>
              {delta >= 0 ? '+' : ''}
              {delta.toLocaleString()} ({deltaPct >= 0 ? '+' : ''}
              {deltaPct.toFixed(1)}%)
            </span>
          </p>
        </div>
      );
    }
    return null;
  };

  const openQuick = (type: 'expense' | 'income') => {
    setTxType(type);
    setIsQuickTxOpen(true);
  };

  return (
    <div
      className="flex flex-col bg-[var(--bg)] text-[var(--ink)] font-sans animate-fade-in gap-4 px-4 sm:px-6 py-5 max-w-[1280px] mx-auto w-full"
      id="command-dashboard"
    >
      <AlertsPanel state={state} />

      {/* Desktop composition — the reference sets the balance card and the live
          ledger side by side, each taking half the content column. The balance
          card is a phone-width object, so it stops stretching as soon as the
          sidebar lands (1024px) rather than waiting for 1280. On a phone they
          stack in that same order. */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5">
        <DashboardHero
          currency={state.currency}
          aggregateActiveWealth={aggregateActiveWealth}
          totalCashAmount={totalCashAmount}
          totalDebitCardsAmount={totalDebitCardsAmount}
          userName={state.userProfile?.name && state.userProfile.name !== 'User' ? state.userProfile.name : ''}
          currentMonthInflow={currentMonthInflow}
          currentMonthOutflow={currentMonthOutflow}
          todayOutflow={todayOutflow}
          transactions={state.transactions}
          onAddExpense={() => openQuick('expense')}
          onAddIncome={() => openQuick('income')}
          wallets={heroWallets}
          onManageWallets={() => setActiveTab('accounts')}
          onSend={() => {
            setActiveTab('accounts');
            setTimeout(() => {
              document.getElementById('transfer-capital')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 60);
          }}
        />
        {/* Transactions — frosted sheet. Recent is today's entries, View All is the
            whole ledger; each row carries its own date, so the day headers only earn
            their space when several days are on screen at once. */}
        <section aria-label="Transactions" className="glass-panel p-4 sm:p-5 flex flex-col gap-3 text-left">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="eyebrow">Transactions</p>
            <SegmentedControl
              ariaLabel="Transactions range"
              layoutId="activity-view"
              value={activityView}
              onChange={setActivityView}
              options={[
                { id: 'all', label: 'View All' },
                { id: 'recent', label: 'Recent' },
              ]}
            />
          </div>
          {visibleActivity.length === 0 ? (
            <div className="py-10 text-center rounded-[var(--r-sm)] border border-dashed border-[var(--line)] bg-[var(--surface-2)]">
              <p className="eyebrow">{activityView === 'recent' ? 'Nothing today' : 'No activity'}</p>
              <p className="text-xs text-[var(--ink-2)] mt-1">
                {activityLog.length === 0 ? 'No ledger entries yet.' : 'Switch to View All for earlier entries.'}
              </p>
            </div>
          ) : (
            /* On a laptop the whole ledger is far taller than the balance card it
               sits beside, which left a void under the summary tiles. The list
               keeps every row in the DOM and scrolls in place instead, so the two
               columns finish together. */
            <div className="min-h-0 lg:max-h-[34rem] lg:overflow-y-auto lg:pr-1">
              {groupedActivity.map((group) => (
                <div key={group.day}>
                  {activityView === 'all' && <p className="day-head eyebrow !text-[10px]">{group.day}</p>}
                  <div className="divide-y divide-[var(--line)]">
                    {group.items.map((t) => {
                      const isInc =
                        t.type === 'income' ||
                        t.type === 'deposit' ||
                        t.type === 'financing' ||
                        (t.type === 'transfer' && t.amount > 0);
                      return (
                        <div key={`${t.logType}-${t.id}`} className="[&:last-child]:border-b-0">
                          <TransactionRow
                            title={t.title}
                            meta={activityMeta(t.date || t.dateGiven || '')}
                            category={t.category}
                            isIncome={isInc}
                            amountText={formatMoney(state.currency, t.amount)}
                            onClick={t.logType === 'transaction' ? () => setEditingTransactionId(t.id) : undefined}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Spend mix donut + budget rings */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <section aria-label="This month spending" className="card p-5 lg:col-span-5 flex flex-col gap-4 text-left">
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">Spending mix</p>
              <p className="text-[11px] text-[var(--ink-3)] mt-0.5">{currentMonthLabel}</p>
            </div>
            <span className="icon-chip">
              <PieChart size={17} />
            </span>
          </div>
          {donutData.length === 0 ? (
            <div className="py-8 text-center rounded-[var(--r-sm)] border border-dashed border-[var(--line)] bg-[var(--surface-2)]">
              <p className="text-[12px] text-[var(--ink-2)]">No spending recorded this month.</p>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="w-[130px] h-[130px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPie>
                    <Pie
                      data={donutData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="68%"
                      outerRadius="100%"
                      paddingAngle={3}
                      cornerRadius={6}
                      strokeWidth={0}
                      isAnimationActive={false}
                    >
                      {donutData.map((entry, i) => (
                        <Cell key={entry.name} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                      ))}
                    </Pie>
                  </RechartsPie>
                </ResponsiveContainer>
              </div>
              <ul className="min-w-0 flex-1 space-y-2">
                {donutData.map((entry, i) => (
                  <li key={entry.name} className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}
                    />
                    <span className="text-[11px] font-semibold text-[var(--ink)] truncate flex-1">{entry.name}</span>
                    <span className="money text-[11px] text-[var(--ink-2)] shrink-0">
                      {donutTotal > 0 ? Math.round((entry.value / donutTotal) * 100) : 0}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section aria-label="Budgets" className="card p-5 lg:col-span-7 flex flex-col gap-4 text-left">
          <div className="flex items-center justify-between">
            <p className="eyebrow">Budgets</p>
            <button
              onClick={() => setActiveTab('budgets')}
              className="text-[11px] font-bold text-[var(--ink-2)] hover:text-[var(--ink)] flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              All budgets <ArrowRight size={12} />
            </button>
          </div>
          {liveBudgetTray.length === 0 ? (
            <div className="py-8 text-center rounded-[var(--r-sm)] border border-dashed border-[var(--line)] bg-[var(--surface-2)]">
              <p className="text-[12px] text-[var(--ink-2)]">No budgets yet — set one to track limits per category.</p>
            </div>
          ) : (
            <ul className="space-y-3.5">
              {liveBudgetTray.slice(0, 4).map((b) => (
                <li key={b.id} className="flex items-center gap-3">
                  <CategoryChip category={b.category} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2 mb-1.5">
                      <span className="text-[12px] font-bold text-[var(--ink)] truncate">{b.category}</span>
                      <span className="money text-[10px] text-[var(--ink-3)] shrink-0">
                        {state.currency}
                        {b.spent.toLocaleString()} / {b.limit.toLocaleString()}
                      </span>
                    </span>
                    <ProgressBarThick percent={b.percent} tone={toneForPercent(b.percent)} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Portfolio trend */}
      <section aria-label="Portfolio trend" className="card p-5 sm:p-6 flex flex-col gap-5 text-left">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <p className="eyebrow">Portfolio trend</p>
            <p className="text-[11px] text-[var(--ink-3)]">Cumulative net worth · {currentMonthLabel}</p>
          </div>
          <SegmentedControl
            ariaLabel="Trend range"
            layoutId="dash-trend"
            value={timeRange}
            onChange={(id) => setTimeRange(id)}
            options={[
              { id: '1W', label: '1W' },
              { id: '1M', label: '1M' },
              { id: '3M', label: '3M' },
              { id: 'YTD', label: 'YTD' },
              { id: '1Y', label: '1Y' },
              { id: 'All', label: 'All' },
            ]}
          />
        </div>
        <div className="w-full h-[220px] sm:h-[260px]">
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
              <RechartsTooltip
                content={<CustomChartTooltip />}
                cursor={{ stroke: 'var(--line-strong)', strokeWidth: 1, strokeDasharray: '3 3' }}
              />
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
      </section>

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
