import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { AppState } from '../types';
import { 
  Bell, Plus, Send, ArrowUpRight, ArrowDownLeft,
  PieChart, TrendingUp, ChevronRight, ArrowRight
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid 
} from 'recharts';
import { DashboardHero } from './dashboard/DashboardHero';
import { DashboardMetricsGrid } from './dashboard/DashboardMetricsGrid';
import { QuickActionModal } from './dashboard/QuickActionModal';

// Premium CountUp Animator for oversized numeric values
export function AnimatedCountUp({ value, duration = 1200, prefix = "", suffix = "" }: { value: number, duration?: number, prefix?: string, suffix?: string }) {
  const [displayValue, setDisplayValue] = useState(0);

  React.useEffect(() => {
    let startTimestamp: number | null = null;
    const startValue = displayValue;
    const endValue = value;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      // Ease out quad formula
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

  const unreadCount = state.notifications ? state.notifications.filter(n => !n.read).length : 0;

  // Spend category calculations for Category Spread Analysis
  const categoriesBudgets = state.budgets && state.budgets.length > 0 ? state.budgets : [];

  // Map category spent dynamically from actual transactions and subscriptions to reflect live state
  const liveBudgetTray = categoriesBudgets.map(b => {
    const bCategoryLower = b.category.toLowerCase().trim();

    // Sum transactions under this category
    const matchingTx = state.transactions.filter(t => {
      if (!t.category) return false;
      return t.category.toLowerCase().trim() === bCategoryLower &&
             (t.type === 'expense' || t.amount < 0);
    });
    const txSpentSum = matchingTx.reduce((sum, t) => sum + Math.abs(t.amount), 0);

    // Sum subscriptions under this category
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

  // Helper to extract transaction impact on aggregateActiveWealth
  const getTransactionImpact = (t: any) => {
    if (t.type === 'income') return Math.abs(t.amount);
    if (t.type === 'expense') return -Math.abs(t.amount);
    return 0;
  };

  // Find actual historical unique transaction dates
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

    // Take up to last 6 distinct historical dates where records occur
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

  // Calculate dynamic trend for hero component
  const trendLabel = useMemo(() => {
    if (sparklineData.length === 0) {
      return "No Data";
    }
    if (sparklineData.length < 2) {
      return "Insufficient Data";
    }

    const lastVal = sparklineData[sparklineData.length - 1].value;
    const prevVal = sparklineData[sparklineData.length - 2].value;

    if (prevVal === 0) {
      return "—";
    }
    
    const trend = ((lastVal - prevVal) / prevVal) * 100;
    return `${trend >= 0 ? '+' : ''}${trend.toFixed(1)}% trend`;
  }, [sparklineData]);

  const trendColorClass = useMemo(() => {
     if (typeof trendLabel === 'string' && trendLabel.includes('%')) {
        const value = parseFloat(trendLabel);
        if (value >= 0) return 'bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] border-[var(--accent-primary)]/20';
        return 'bg-[var(--negative)]/10 text-[var(--negative)] border-[var(--negative)]/20';
     }
     return 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-primary)]';
  }, [trendLabel]);

  // Fetch subscription due warning status
  const getSubDueDays = (dueDateStr: string, status: string) => {
    if (status !== 'Active') return { label: 'Paused', style: 'text-[var(--text-muted)] bg-[var(--bg-surface)]' };
    const today = new Date();
    today.setHours(0,0,0,0);
    const due = new Date(dueDateStr);
    due.setHours(0,0,0,0);
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { label: `Overdue (${Math.abs(diffDays)}d)`, style: 'text-[var(--negative)] border border-[var(--negative)]/20 bg-[var(--negative)]/10' };
    }
    if (diffDays === 0) {
      return { label: 'Due Today', style: 'text-amber-500 border border-amber-500/20 bg-amber-500/10 animate-pulse' };
    }
    if (diffDays <= 5) {
      return { label: `In ${diffDays} days`, style: 'text-amber-500 border border-amber-500/10 bg-amber-500/5' };
    }
    return { label: `In ${diffDays} days`, style: 'text-[var(--text-secondary)] border border-[var(--border-primary)] bg-[var(--bg-surface)]' };
  };

  // Generate high-fidelity mathematical trend data for custom oklch chart
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

  // X-Axis Date Formatter based on active Range Selector
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
    } catch (e) {
      return tickItem;
    }
  };

  // Recharts Premium Interactive Tooltip Component
  const CustomChartTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const value = data.value;
      const initialVal = fullTrendChartData[0]?.value || value;
      const delta = value - initialVal;
      const deltaPct = initialVal !== 0 ? (delta / initialVal) * 100 : 0;
      
      return (
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-3 shadow-lg text-left backdrop-blur-md">
          <p className="text-[10px] font-mono text-[var(--text-secondary)] uppercase font-semibold">{data.date}</p>
          <p className="text-sm font-bold text-[var(--text-primary)] font-mono mt-1">
            {state.currency}{value.toLocaleString()}
          </p>
          <p className={`text-[10px] font-mono font-bold mt-1 flex items-center gap-1 ${delta >= 0 ? 'text-[var(--accent-primary)]' : 'text-[var(--negative)]'}`}>
            <span>{delta >= 0 ? '▲' : '▼'}</span>
            <span>{delta >= 0 ? '+' : ''}{delta.toLocaleString()} ({deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(1)}%)</span>
          </p>
        </div>
      );
    }
    return null;
  };

  const totalAssets = totalCashAmount + totalDebitCardsAmount;
  const totalLiabilities = totalCreditCardsAmount + totalDebtsAmount;
  const ratioCap = totalAssets + totalLiabilities || 1;
  const assetRatioPct = (totalAssets / ratioCap) * 100;
  const liabilityRatioPct = (totalLiabilities / ratioCap) * 100;

  return (
    <div className="flex flex-col h-full bg-[var(--bg-primary)] text-[var(--text-primary)] font-sans animate-fade-in space-y-8 p-1 relative" id="command-dashboard">
      
      {/* 1. TOP PERSONALIZED BANNER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center py-2 gap-4">
        <div className="space-y-1 text-left">
          <span className="text-[10px] tracking-widest text-[var(--text-muted)] font-mono font-bold uppercase block">SECURE FINTECH LEDGER</span>
          <h1 className="text-3xl sm:text-4xl font-extrabold font-display text-[var(--text-primary)] flex items-center gap-2 leading-none">
            Hello, {state.userProfile?.name || 'User'}
          </h1>
        </div>

        {/* Desktop Header Quick Tools */}
        <div className="hidden sm:flex items-center gap-3">
          <button
            onClick={onNotificationClick}
            className="p-3 bg-[var(--bg-surface)] hover:bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer relative flex items-center justify-center shrink-0 w-11 h-11"
            title="Notification Alerts Center"
          >
            <Bell size={16} className="text-[var(--accent-primary)]" />
            {unreadCount > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 bg-[var(--success)] rounded-full animate-pulse" />
            )}
          </button>

          <button
            onClick={onProfileClick}
            className="w-11 h-11 rounded-2xl bg-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/90 text-slate-950 font-black transition-all cursor-pointer overflow-hidden border border-[var(--border-primary)] flex items-center justify-center shrink-0"
            title="Profile Suite"
          >
            {state.userProfile?.avatarUrl ? (
              <img 
                src={state.userProfile.avatarUrl} 
                alt={state.userProfile.name} 
                className="w-full h-full object-cover" 
                referrerPolicy="no-referrer"
              />
            ) : (
              state.userProfile?.name?.charAt(0) || 'U'
            )}
          </button>
        </div>
      </div>

      {/* 2. PORTFOLIO SUMMARY HERO */}
      <DashboardHero
        currency={state.currency}
        aggregateActiveWealth={aggregateActiveWealth}
        totalAssets={totalAssets}
        totalLiabilities={totalLiabilities}
        assetRatioPct={assetRatioPct}
        liabilityRatioPct={liabilityRatioPct}
        sparklineData={sparklineData}
        trendLabel={trendLabel}
        trendColorClass={trendColorClass}
        onManageWallets={() => setActiveTab('accounts')}
      />

      {/* 3. FOUR MONZO-STYLE PILL ACTIONS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" id="monzo-shortcuts-tray">
        <motion.button
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => {
            setTxType('income');
            setIsQuickTxOpen(true);
          }}
          className="group p-4 bg-[var(--bg-card)] hover:bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-xl text-left transition-all cursor-pointer flex items-center gap-3.5"
        >
          <div className="p-2.5 rounded-xl bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] group-hover:bg-[var(--accent-primary)]/20 transition-colors">
            <Plus size={16} className="stroke-[2.5]" />
          </div>
          <div>
            <h5 className="text-xs font-bold text-[var(--text-primary)] font-display">Add Income</h5>
            <span className="text-[9px] text-[var(--text-muted)] font-mono mt-0.5 block">Record Inflow</span>
          </div>
        </motion.button>

        <motion.button
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => {
            setTxType('expense');
            setIsQuickTxOpen(true);
          }}
          className="group p-4 bg-[var(--bg-card)] hover:bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-xl text-left transition-all cursor-pointer flex items-center gap-3.5"
        >
          <div className="p-2.5 rounded-xl bg-[var(--negative)]/10 text-[var(--negative)] group-hover:bg-[var(--negative)]/25 transition-colors">
            <ArrowUpRight size={16} className="stroke-[2.5]" />
          </div>
          <div>
            <h5 className="text-xs font-bold text-[var(--text-primary)] font-display">Add Expense</h5>
            <span className="text-[9px] text-[var(--text-muted)] font-mono mt-0.5 block">Record Outflow</span>
          </div>
        </motion.button>

        <motion.button
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => setActiveTab('accounts')}
          className="group p-4 bg-[var(--bg-card)] hover:bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-xl text-left transition-all cursor-pointer flex items-center gap-3.5"
        >
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 group-hover:bg-amber-500/20 transition-colors">
            <Send size={15} className="stroke-[2.5]" />
          </div>
          <div>
            <h5 className="text-xs font-bold text-[var(--text-primary)] font-display">Transfer</h5>
            <span className="text-[9px] text-[var(--text-muted)] font-mono mt-0.5 block">Wallet Sync</span>
          </div>
        </motion.button>

        <motion.button
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => setActiveTab('budgets')}
          className="group p-4 bg-[var(--bg-card)] hover:bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-xl text-left transition-all cursor-pointer flex items-center gap-3.5"
        >
          <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500 group-hover:bg-blue-500/20 transition-colors">
            <PieChart size={15} className="stroke-[2.5]" />
          </div>
          <div>
            <h5 className="text-xs font-bold text-[var(--text-primary)] font-display">Limits</h5>
            <span className="text-[9px] text-[var(--text-muted)] font-mono mt-0.5 block">Budget Caps</span>
          </div>
        </motion.button>
      </div>

      {/* 4. MAIN TREND CHART */}
      <div className="w-full bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-[20px] p-6 shadow-[var(--shadow-soft)] flex flex-col justify-between text-left min-h-[440px] relative">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div className="space-y-1">
            <h3 className="text-lg font-bold font-display text-[var(--text-primary)] flex items-center gap-2">
              <span>Portfolio Trend Analysis</span>
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">Historical cumulative net worth evaluation curve</p>
          </div>

          {/* Premium Pill Range Filters */}
          <div className="flex flex-wrap bg-[var(--bg-surface)] border border-[var(--border-primary)] p-1 rounded-xl">
            {(['1W', '1M', '3M', 'YTD', '1Y', 'All'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase transition-all ${
                  timeRange === r 
                    ? 'bg-[var(--accent-primary)] text-slate-950 shadow-sm' 
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Recharts Area Chart Integration */}
        <div className="w-full h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={fullTrendChartData} margin={{ left: -10, right: 10, top: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="var(--accent-primary)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" vertical={false} opacity={0.5} />
              <XAxis 
                dataKey="date" 
                tickFormatter={formatXAxis} 
                stroke="var(--text-muted)" 
                fontSize={10} 
                fontFamily="JetBrains Mono" 
                dy={10}
                tickLine={false}
                axisLine={false}
              />
              <YAxis 
                stroke="var(--text-muted)" 
                fontSize={10} 
                fontFamily="JetBrains Mono" 
                dx={-10}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => `${state.currency}${val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val}`}
              />
              <RechartsTooltip content={<CustomChartTooltip />} cursor={{ stroke: 'var(--accent-primary)', strokeWidth: 1, strokeDasharray: '3 3' }} />
              <Area 
                type="monotone" 
                dataKey="value" 
                stroke="var(--accent-primary)" 
                strokeWidth={2} 
                fillOpacity={1} 
                fill="url(#trendGradient)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 5. SPENDING ENVELOPES SECTION */}
      <DashboardMetricsGrid
        liveBudgetTray={liveBudgetTray}
        currency={state.currency}
        onNavigateToBudgets={() => setActiveTab('budgets')}
      />

      {/* 6. TIMELINE TRANSACTION FEEDS & RECURRING MONITOR */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* RECENT TRANSACTIONS FEED (7 COLS) */}
        <div className="lg:col-span-7 bg-[var(--bg-card)] border border-[var(--border-primary)] p-6 rounded-[20px] shadow-[var(--shadow-soft)] w-full text-left">
          <div className="flex justify-between items-center mb-6">
            <div className="space-y-1">
              <h3 className="text-lg font-bold font-display text-[var(--text-primary)]">Recent Ledger Activities</h3>
              <p className="text-xs text-[var(--text-secondary)] font-sans">Continuous ledger operations registered securely</p>
            </div>
            <button
              onClick={() => setActiveTab('reports')}
              className="text-xs font-bold text-[var(--accent-primary)] uppercase hover:underline transition-all"
            >
              See All logs
            </button>
          </div>

          <div className="space-y-3">
            {state.transactions.length === 0 && state.loansGiven.length === 0 ? (
              <div className="p-8 text-center text-[var(--text-muted)] border border-dashed border-[var(--border-primary)] rounded-xl bg-[var(--bg-surface)]/20 italic text-xs">
                No active expenditures or loan activity recorded yet.
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
                    originalIdx: lIdx * 100 + sIdx
                })))
              ]
                .sort((a, b) => {
                  const timeA = new Date(a.date).getTime();
                  const timeB = new Date(b.date).getTime();
                  if (!isNaN(timeA) && !isNaN(timeB) && timeA !== timeB) {
                    return timeB - timeA;
                  }

                  const dateCompare = (b.date || '').localeCompare(a.date || '');
                  if (dateCompare !== 0) return dateCompare;

                  const aNum = parseInt((a.id || '').replace(/\D/g, ''), 10);
                  const bNum = parseInt((b.id || '').replace(/\D/g, ''), 10);
                  if (!isNaN(aNum) && !isNaN(bNum) && aNum !== bNum) {
                    return bNum - aNum;
                  }

                  if (a.originalIdx !== undefined && b.originalIdx !== undefined && a.originalIdx !== b.originalIdx) {
                    return a.originalIdx - b.originalIdx;
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
                      className="group p-4 bg-[var(--bg-surface)] hover:bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-xl flex justify-between items-center transition-all duration-150"
                    >
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        <div className={`p-2.5 rounded-xl shrink-0 transition-colors ${
                          isInc 
                            ? 'bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] border border-[var(--accent-primary)]/15' 
                            : 'bg-[var(--negative)]/10 text-[var(--negative)] border border-[var(--negative)]/15'
                        }`}>
                          {isInc ? <ArrowDownLeft size={16} className="stroke-[2.5]" /> : <ArrowUpRight size={16} className="stroke-[2.5]" />}
                        </div>
                        
                        <div className="min-w-0 flex-1 text-left">
                          <div className="flex flex-wrap items-center gap-2">
                            <h5 className="text-sm font-semibold text-[var(--text-primary)] truncate max-w-full leading-tight font-sans">{t.title}</h5>
                            <span className="text-[9px] font-mono font-bold px-2 py-0.5 bg-[var(--bg-surface)] border border-[var(--border-primary)] text-[var(--text-secondary)] rounded-full uppercase shrink-0">
                              {t.category}
                            </span>
                          </div>
                          <p className="text-[10px] text-[var(--text-muted)] mt-1.5 font-mono">{t.date}</p>
                        </div>
                      </div>

                      <div className="text-right pl-4 shrink-0 font-mono">
                        <span className={`text-xs font-bold block ${
                          isInc ? 'text-[var(--accent-primary)]' : 'text-[var(--negative)]'
                        }`}>
                          {isInc ? '+' : '-'}{state.currency}{absAmt.toLocaleString()}
                        </span>
                        <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] block mt-1">
                          {t.accountType === 'cash' ? 'Cash' : 'Bank Card'}
                        </span>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>

        {/* RECURRING PLAN MONITOR (5 COLS) */}
        <div className="lg:col-span-5 bg-[var(--bg-card)] border border-[var(--border-primary)] p-6 rounded-[20px] shadow-[var(--shadow-soft)] w-full text-left">
          <div className="flex justify-between items-center mb-6">
            <div className="space-y-1">
              <h3 className="text-lg font-bold font-display text-[var(--text-primary)]">Recurring Obligations</h3>
              <p className="text-xs text-[var(--text-secondary)] font-sans">Active monthly subscription plans</p>
            </div>
            <button
              onClick={() => setActiveTab('inflow_outflow')}
              className="text-xs font-bold text-[var(--accent-primary)] uppercase hover:underline transition-all"
            >
              Configure
            </button>
          </div>

          <div className="space-y-3">
            {!state.subscriptions || state.subscriptions.length === 0 ? (
              <div className="p-8 text-center text-[var(--text-muted)] border border-dashed border-[var(--border-primary)] rounded-xl bg-[var(--bg-surface)]/20 italic text-xs">
                No active recurring plans configured yet.
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
                      className="p-4 bg-[var(--bg-surface)] hover:bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-xl space-y-4 transition-all text-left"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0 space-y-1">
                          <h5 className="text-xs font-bold text-[var(--text-primary)] leading-tight truncate font-display">{sub.name}</h5>
                          <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] block">
                            Billing • {sub.billingCycle}
                          </span>
                        </div>

                        <span className={`px-2.5 py-1 text-[9px] font-bold rounded-full font-mono shrink-0 ${billState.style}`}>
                          {billState.label}
                        </span>
                      </div>

                      <div className="flex justify-between items-center pt-2.5 border-t border-[var(--border-primary)]">
                        <div>
                          <span className="text-[8px] text-[var(--text-muted)] block uppercase font-mono font-bold">Obligation</span>
                          <span className="text-xs font-bold text-[var(--text-primary)] font-mono">
                            {state.currency}{sub.amount.toLocaleString()}
                          </span>
                        </div>

                        <button 
                          onClick={() => setActiveTab('inflow_outflow')}
                          className="px-3.5 py-1.5 bg-[var(--bg-card)] hover:bg-[var(--accent-primary)]/15 text-xs font-bold uppercase transition-all hover:text-[var(--accent-primary)] hover:border-[var(--accent-primary)]/30 border border-[var(--border-primary)] rounded-lg cursor-pointer text-[10px]"
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

      {/* QUICK TRANSACTION ENTRY MODAL */}
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
