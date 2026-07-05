import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AppState, Transaction } from '../types';
import { 
  Bell, Plus, Send, ArrowUpRight, ArrowDownLeft, CreditCard, 
  Wallet, PieChart, Landmark, TrendingUp, AlertTriangle, 
  CheckCircle2, Flame, RefreshCw, Calendar, ChevronRight, UserCheck, ArrowRight,
  X, Sparkles
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid 
} from 'recharts';
import { EXPENSE_COLORS } from '../utils';

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

  const [timeRange, setTimeRange] = useState<'1W' | '1M' | '3M' | 'YTD' | '1Y' | 'All'>('1W');
  const [isQuickTxOpen, setIsQuickTxOpen] = useState(false);

  // Quick Action form state
  const [txType, setTxType] = useState<'expense' | 'income'>('expense');
  const [txTitle, setTxTitle] = useState('');
  const [txAmount, setTxAmount] = useState('');
  const [txCategory, setTxCategory] = useState('Utilities');
  const [txAccountId, setTxAccountId] = useState('');
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);

  // Handle setting default account when opening Quick Transaction Form
  React.useEffect(() => {
    if (isQuickTxOpen) {
      if (state.cashAccounts.length > 0) {
        setTxAccountId(`cash-${state.cashAccounts[0].id}`);
      } else if (state.cards.length > 0) {
        setTxAccountId(`card-${state.cards[0].id}`);
      }
    }
  }, [isQuickTxOpen, state.cashAccounts, state.cards]);

  const unreadCount = state.notifications ? state.notifications.filter(n => !n.read).length : 0;

  // Calculate Savings Rate 
  const netSavingsRate = currentMonthInflow > 0 
    ? Math.round(((currentMonthInflow - currentMonthOutflow) / currentMonthInflow) * 100) 
    : 0;
  const displaySavingsRate = Math.max(0, netSavingsRate);



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

  // P&L data derived from trend chart (change from start of period)
  const pnlChartData = useMemo(() => {
    if (fullTrendChartData.length === 0) return [];
    const firstValue = fullTrendChartData[0].value;
    return fullTrendChartData.map(d => ({
      date: d.date,
      value: d.value,
      pnl: d.value - firstValue
    }));
  }, [fullTrendChartData]);

  // Split P&L data into up/down segments for green/red line coloring
  const segmentedChartData = useMemo(() => {
    const data = pnlChartData;
    if (data.length === 0) return [];
    if (data.length === 1) {
      return [{ ...data[0], upPnl: data[0].pnl, downPnl: null }];
    }

    const result: any[] = [];

    const isFirstUp = data[1].pnl >= data[0].pnl;
    result.push({
      date: data[0].date, value: data[0].value, pnl: data[0].pnl,
      upPnl: isFirstUp ? data[0].pnl : null,
      downPnl: !isFirstUp ? data[0].pnl : null,
    });

    for (let i = 1; i < data.length - 1; i++) {
      const currDirIsUp = data[i].pnl >= data[i - 1].pnl;
      const nextDirIsUp = data[i + 1].pnl >= data[i].pnl;

      if (currDirIsUp !== nextDirIsUp) {
        result.push({
          date: data[i].date, value: data[i].value, pnl: data[i].pnl,
          upPnl: currDirIsUp ? data[i].pnl : null,
          downPnl: !currDirIsUp ? data[i].pnl : null,
        });
        result.push({
          date: data[i].date, value: data[i].value, pnl: data[i].pnl,
          upPnl: nextDirIsUp ? data[i].pnl : null,
          downPnl: !nextDirIsUp ? data[i].pnl : null,
        });
      } else {
        result.push({
          date: data[i].date, value: data[i].value, pnl: data[i].pnl,
          upPnl: currDirIsUp ? data[i].pnl : null,
          downPnl: !currDirIsUp ? data[i].pnl : null,
        });
      }
    }

    const isLastUp = data[data.length - 1].pnl >= data[data.length - 2].pnl;
    result.push({
      date: data[data.length - 1].date, value: data[data.length - 1].value, pnl: data[data.length - 1].pnl,
      upPnl: isLastUp ? data[data.length - 1].pnl : null,
      downPnl: !isLastUp ? data[data.length - 1].pnl : null,
    });

    return result;
  }, [pnlChartData]);

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
      const pnl = data.pnl;
      const value = data.value;
      const initialVal = value - pnl;
      const pnlPct = initialVal !== 0 ? (pnl / initialVal) * 100 : 0;
      const isPositive = pnl >= 0;
      
      return (
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-3 shadow-lg text-left backdrop-blur-md">
          <p className="text-[10px] font-mono text-[var(--text-secondary)] uppercase font-semibold">{data.date}</p>
          <p className="text-sm font-bold text-[var(--text-primary)] font-mono mt-1">
            {state.currency}{value.toLocaleString()}
          </p>
          <p className={`text-[10px] font-mono font-bold mt-1 flex items-center gap-1 ${isPositive ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
            <span>{isPositive ? '▲' : '▼'}</span>
            <span>{isPositive ? '+' : ''}{pnl.toLocaleString()} ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%)</span>
          </p>
        </div>
      );
    }
    return null;
  };

  // Submit Quick Transaction Form
  const handleQuickTxSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(txAmount);
    if (!txTitle || isNaN(amountNum) || amountNum <= 0 || !txAccountId) {
      return;
    }

    const typePrefix = txAccountId.split('-')[0];
    const rawId = txAccountId.split('-').slice(1).join('-');
    const accountType: 'cash' | 'card' = typePrefix === 'cash' ? 'cash' : 'card';

    if (txType === 'income' && onAddIncome) {
      onAddIncome(amountNum, txDate, txTitle, txCategory as any, rawId, accountType);
    } else if (txType === 'expense' && onAddExpense) {
      onAddExpense(txTitle, 'Quick Dashboard Expense Entry', amountNum, txDate, txCategory as any, rawId, accountType, 0);
    }

    // Reset Form & Close
    setTxTitle('');
    setTxAmount('');
    setIsQuickTxOpen(false);
  };

  const totalAssets = totalCashAmount + totalDebitCardsAmount;
  const totalLiabilities = totalCreditCardsAmount + totalDebtsAmount;
  const ratioCap = totalAssets + totalLiabilities || 1;
  const assetRatioPct = (totalAssets / ratioCap) * 100;
  const liabilityRatioPct = (totalLiabilities / ratioCap) * 100;

  return (
    <div className="flex flex-col h-full bg-[var(--bg-primary)] text-[var(--text-primary)] font-sans animate-fade-in space-y-8 p-1 relative" id="command-dashboard">
      
      {/* ======================= FLOATING "+" BUTTON ADD TRANSACTION ======================= */}
      <motion.button
        onClick={() => setIsQuickTxOpen(true)}
        className="fixed bottom-24 right-5 sm:right-10 z-40 w-14 h-14 bg-[var(--accent-primary)] text-primary rounded-full flex items-center justify-center shadow-[var(--shadow-soft)] hover:scale-110 cursor-pointer active:scale-95 duration-200 border border-[var(--accent-primary)]/20"
        whileHover={{ rotate: 90 }}
        title="Quick Record Transaction"
        id="floating-action-button"
      >
        <Plus size={28} className="stroke-[2.5]" />
      </motion.button>

      {/* 1. TOP PERSONALIZED BANNER */}
      <div className="relative bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-[20px] p-5 sm:p-6 shadow-[var(--shadow-soft)] overflow-hidden">
        {/* Accent bar at top */}
        <div className="absolute top-0 left-6 right-6 h-0.5 bg-gradient-to-r from-[var(--accent-primary)] via-blue-400 to-transparent rounded-full" />
        
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1.5 text-left">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] animate-pulse" />
              <span className="text-[10px] tracking-widest text-[var(--text-muted)] font-mono font-bold uppercase">SECURE FINTECH LEDGER</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold font-display text-[var(--text-primary)] leading-none">
              Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 18 ? 'Afternoon' : 'Evening'}, {state.userProfile?.name || 'User'}
            </h1>
          </div>

          {/* Desktop Header Quick Tools (hidden on mobile, visible on desktop/tablet) */}
          <div className="hidden sm:flex items-center gap-2.5">
            {/* Notifications bell */}
            <button
              onClick={onNotificationClick}
              className="p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-primary)]/30 transition-all cursor-pointer relative flex items-center justify-center shrink-0"
              title="Notification Alerts Center"
            >
              <Bell size={16} />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse ring-2 ring-[var(--bg-card)]" />
              )}
            </button>

            {/* Profile pic */}
            <button
              onClick={onProfileClick}
              className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--accent-primary)] to-blue-500 text-primary font-black hover:scale-105 transition-all cursor-pointer overflow-hidden border border-[var(--accent-primary)]/20 flex items-center justify-center shrink-0 shadow-sm"
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
      </div>

      {/* 2. PORTFOLIO SUMMARY HERO (Full Width) */}
      <div id="vault-portfolio-hero" className="relative overflow-hidden bg-[var(--bg-card)] rounded-[20px] p-5 sm:p-6 flex flex-col justify-between border border-[var(--border-primary)] shadow-[var(--shadow-soft)] transition-all text-left">
        <div className="flex justify-between items-start z-10">
          <div className="space-y-1">
            <h3 className="text-[10px] tracking-wider text-[var(--text-muted)] font-mono font-bold uppercase flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] animate-pulse" />
              PORTFOLIO NET WORTH
            </h3>
          </div>

          <div className="flex items-center gap-3">
            {/* Compact sparkline */}
            {sparklineData.length > 0 && (
              <div className="w-16 h-6 hidden sm:block opacity-60">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sparklineData}>
                    <defs>
                      <linearGradient id="heroSparklineGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="var(--accent-primary)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <Area 
                      type="monotone" 
                      dataKey="value" 
                      stroke="var(--accent-primary)" 
                      strokeWidth={1.5} 
                      fill="url(#heroSparklineGrad)" 
                      dot={false} 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className={`flex items-center gap-1 border py-0.5 px-2 rounded-full text-[9px] font-bold font-mono ${trendColorClass}`}>
              <TrendingUp size={10} />
              <span>{trendLabel}</span>
            </div>
          </div>
        </div>

        <div className="mt-3 mb-5 z-10">
          <div className="text-3xl sm:text-4xl font-extrabold font-display tracking-tight text-[var(--text-primary)] flex items-baseline gap-0.5 select-all">
            <span className="text-xl font-light text-[var(--text-secondary)] select-none mr-1">{state.currency}</span>
            <AnimatedCountUp value={aggregateActiveWealth} />
            <span className="text-lg font-bold text-[var(--accent-primary)] opacity-80">.00</span>
          </div>
        </div>

        <div className="border-t border-[var(--border-primary)]/60 pt-4 z-10 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4">
          <div className="flex-1 space-y-2">
            {/* Compact 2-Column Stats layout for mobile and desktop */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)] font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>Liquid ({assetRatioPct.toFixed(0)}%)</span>
                </div>
                <p className="text-xs font-bold text-[var(--text-primary)] font-mono">
                  +{state.currency}{totalAssets.toLocaleString()}
                </p>
              </div>

              <div className="space-y-0.5 text-right sm:text-left">
                <div className="flex items-center justify-end sm:justify-start gap-1 text-[10px] text-[var(--text-secondary)] font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--negative)]" />
                  <span>Liabilities ({liabilityRatioPct.toFixed(0)}%)</span>
                </div>
                <p className="text-xs font-bold text-[var(--text-primary)] font-mono">
                  -{state.currency}{totalLiabilities.toLocaleString()}
                </p>
              </div>
            </div>

            {/* Slim dynamic ratio horizontal bar */}
            <div className="w-full h-1 bg-[var(--bg-surface)] rounded-full overflow-hidden flex border border-[var(--border-primary)]/40">
              <div style={{ width: `${assetRatioPct}%` }} className="h-full bg-emerald-500 transition-all duration-1000" />
              <div style={{ width: `${liabilityRatioPct}%` }} className="h-full bg-[var(--negative)] transition-all duration-1000" />
            </div>
          </div>

          <div className="flex justify-end sm:block shrink-0">
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setActiveTab('accounts')}
              className="bg-[var(--accent-primary)] hover:brightness-110 text-primary py-1.5 px-4 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all duration-150 cursor-pointer flex items-center gap-1.5 shadow-sm"
            >
              <span>Manage Wallets</span>
              <ChevronRight size={12} className="stroke-[2.5]" />
            </motion.button>
          </div>
        </div>
      </div>

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
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500 group-hover:bg-emerald-500/20 transition-colors">
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
          <div className="p-2.5 rounded-xl bg-primary text-blue-500 group-hover:bg-blue-500/20 transition-colors">
            <PieChart size={15} className="stroke-[2.5]" />
          </div>
          <div>
            <h5 className="text-xs font-bold text-[var(--text-primary)] font-display">Limits</h5>
            <span className="text-[9px] text-[var(--text-muted)] font-mono mt-0.5 block">Budget Caps</span>
          </div>
        </motion.button>
      </div>

      {/* 4. MAIN DOUBLE BLOCK: TREND CHART & FINANCIAL HEALTH */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* PORTFOLIO TREND CHART (8 COLS) */}
        <div className="lg:col-span-8 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-[20px] p-6 shadow-[var(--shadow-soft)] flex flex-col justify-between text-left min-h-[440px] relative">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div className="space-y-1">
              <h3 className="text-lg font-bold font-display text-[var(--text-primary)] flex items-center gap-2">
                <span>Portfolio Trend Analysis</span>
              </h3>
              <p className="text-xs text-[var(--text-secondary)]">Weekly profit & loss analysis — resets every week</p>
            </div>

            {/* Premium Pill Range Filters */}
            <div className="flex flex-wrap bg-[var(--bg-surface)] border border-[var(--border-primary)] p-1 rounded-xl">
              {(['1W', '1M', '3M', 'YTD', '1Y', 'All'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setTimeRange(r)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase transition-all ${
                    timeRange === r 
                      ? 'bg-[var(--accent-primary)] text-primary shadow-sm' 
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
              <AreaChart data={segmentedChartData} margin={{ left: -10, right: 10, top: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.2}/>
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
                  tickFormatter={(val) => {
                    if (val === 0) return `${state.currency}0`;
                    const prefix = val > 0 ? '+' : '';
                    const absVal = Math.abs(val);
                    return `${prefix}${state.currency}${absVal >= 1000 ? (absVal / 1000).toFixed(0) + 'k' : absVal}`;
                  }}
                />
                <RechartsTooltip content={<CustomChartTooltip />} cursor={{ stroke: 'var(--accent-primary)', strokeWidth: 1, strokeDasharray: '3 3' }} />
                <Area 
                  type="monotone" 
                  dataKey="pnl" 
                  stroke="none" 
                  fillOpacity={1} 
                  fill="url(#trendGradient)" 
                />
                <Area 
                  type="monotone" 
                  dataKey="upPnl" 
                  stroke="#22c55e" 
                  strokeWidth={2} 
                  fill="none" 
                  connectNulls={false}
                  dot={false}
                  activeDot={false}
                />
                <Area 
                  type="monotone" 
                  dataKey="downPnl" 
                  stroke="#ef4444" 
                  strokeWidth={2} 
                  fill="none" 
                  connectNulls={false}
                  dot={false}
                  activeDot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* FINANCIAL HEALTH KEY METRICS (4 COLS) */}
        <div className="lg:col-span-4 bg-[var(--bg-card)] rounded-[20px] p-6 border border-[var(--border-primary)] shadow-[var(--shadow-soft)] flex flex-col relative overflow-hidden text-left min-h-[440px]">
          <div className="flex items-center gap-2 pb-4">
            <div className="w-2 h-2 rounded-full bg-[var(--accent-primary)] animate-pulse" />
            <h3 className="text-lg font-bold font-display text-[var(--text-primary)]">Financial Health</h3>
          </div>

          {/* Net Worth Snapshot */}
          <div className="bg-[var(--bg-surface)] rounded-xl p-4 border border-[var(--border-primary)] mb-5">
            <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider">Net Worth</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black font-display text-[var(--text-primary)] tabular-nums">
                {state.currency}{aggregateActiveWealth.toLocaleString()}
              </span>
              <span className={`text-[10px] font-bold font-mono ${aggregateActiveWealth >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                {aggregateActiveWealth >= 0 ? '▲' : '▼'}
              </span>
            </div>
          </div>

          {/* Key Metrics Grid */}
          {(() => {
            const liquidAssets = totalCashAmount + totalDebitCardsAmount;
            const monthlyExpenses = currentMonthOutflow || 1;
            const cashRunway = currentMonthOutflow > 0 ? (liquidAssets / currentMonthOutflow) : (liquidAssets > 0 ? 12 : 0);
            const totalAssets = totalCashAmount + totalDebitCardsAmount + totalCreditCardsAmount;
            const debtRatio = totalAssets > 0 ? (totalDebtsAmount / totalAssets) * 100 : 0;
            const monthlyCashFlow = currentMonthInflow - currentMonthOutflow;

            const runwayStatus = cashRunway >= 6 ? { label: 'Strong', color: 'text-[#22c55e] bg-[#22c55e]/10 border-[#22c55e]/20' } : cashRunway >= 3 ? { label: 'Fair', color: 'text-amber-400 bg-amber-400/10 border-amber-400/20' } : { label: 'Low', color: 'text-[#ef4444] bg-[#ef4444]/10 border-[#ef4444]/20' };
            const debtStatus = debtRatio <= 30 ? { label: 'Low', color: 'text-[#22c55e] bg-[#22c55e]/10 border-[#22c55e]/20' } : debtRatio <= 50 ? { label: 'Moderate', color: 'text-amber-400 bg-amber-400/10 border-amber-400/20' } : { label: 'High', color: 'text-[#ef4444] bg-[#ef4444]/10 border-[#ef4444]/20' };
            const savingsStatus = displaySavingsRate >= 20 ? { label: 'Good', color: 'text-[#22c55e] bg-[#22c55e]/10 border-[#22c55e]/20' } : displaySavingsRate >= 10 ? { label: 'Fair', color: 'text-amber-400 bg-amber-400/10 border-amber-400/20' } : { label: 'Low', color: 'text-[#ef4444] bg-[#ef4444]/10 border-[#ef4444]/20' };
            const flowStatus = monthlyCashFlow >= 0 ? { label: 'Positive', color: 'text-[#22c55e] bg-[#22c55e]/10 border-[#22c55e]/20' } : { label: 'Negative', color: 'text-[#ef4444] bg-[#ef4444]/10 border-[#ef4444]/20' };

            return (
              <div className="space-y-2.5 flex-1">
                <div className="flex items-center justify-between bg-[var(--bg-surface)] rounded-lg px-3.5 py-2.5 border border-[var(--border-primary)]">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[11px] font-semibold text-[var(--text-secondary)] font-sans">Cash Runway</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-bold font-mono text-[var(--text-primary)] tabular-nums">{cashRunway.toFixed(1)}mo</span>
                    <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded-full border ${runwayStatus.color}`}>{runwayStatus.label}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between bg-[var(--bg-surface)] rounded-lg px-3.5 py-2.5 border border-[var(--border-primary)]">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[11px] font-semibold text-[var(--text-secondary)] font-sans">Debt Ratio</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-bold font-mono text-[var(--text-primary)] tabular-nums">{debtRatio.toFixed(0)}%</span>
                    <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded-full border ${debtStatus.color}`}>{debtStatus.label}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between bg-[var(--bg-surface)] rounded-lg px-3.5 py-2.5 border border-[var(--border-primary)]">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[11px] font-semibold text-[var(--text-secondary)] font-sans">Savings Rate</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-bold font-mono text-[var(--text-primary)] tabular-nums">{displaySavingsRate}%</span>
                    <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded-full border ${savingsStatus.color}`}>{savingsStatus.label}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between bg-[var(--bg-surface)] rounded-lg px-3.5 py-2.5 border border-[var(--border-primary)]">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[11px] font-semibold text-[var(--text-secondary)] font-sans">Cash Flow</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className={`text-xs font-bold font-mono tabular-nums ${monthlyCashFlow >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                      {monthlyCashFlow >= 0 ? '+' : ''}{state.currency}{monthlyCashFlow.toLocaleString()}
                    </span>
                    <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded-full border ${flowStatus.color}`}>{flowStatus.label}</span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Assets vs Liabilities Footer */}
          <div className="mt-4 pt-3 border-t border-[var(--border-primary)]">
            <div className="flex justify-between text-[10px] font-mono">
              <span className="text-[var(--text-muted)]">Assets</span>
              <span className="font-bold text-[#22c55e]">{state.currency}{(totalCashAmount + totalDebitCardsAmount + totalCreditCardsAmount).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-[10px] font-mono mt-1">
              <span className="text-[var(--text-muted)]">Liabilities</span>
              <span className="font-bold text-[#ef4444]">{state.currency}{totalDebtsAmount.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 5. SPENDING ENVELOPES SECTION */}
      <div className="space-y-5">
        <div className="flex justify-between items-end px-1">
          <div className="text-left space-y-1">
            <h2 className="text-2xl font-bold font-display tracking-tight text-[var(--text-primary)]">Spending Envelopes</h2>
            <p className="text-xs text-[var(--text-secondary)] font-sans">Active monthly envelope controls and limits</p>
          </div>
          <button 
            onClick={() => setActiveTab('budgets')}
            className="text-xs font-bold text-[var(--accent-primary)] hover:underline flex items-center gap-1.5 transition-all"
          >
            <span>Budgets Portal</span>
            <ArrowRight size={14} className="stroke-[2.5]" />
          </button>
        </div>

        {/* Categories grid/slider */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="category-spend-slider-tray">
          {liveBudgetTray.length > 0 ? (
            liveBudgetTray.slice(0, 4).map((category) => {
              const ratio = category.spent / category.limit;
              const isWarning = ratio >= 0.8 && ratio <= 1.0;
              const isOver = ratio > 1.0;

              return (
                <motion.div
                  key={category.id}
                  whileHover={{ y: -3 }}
                  className={`bg-[var(--bg-card)] border rounded-[20px] p-5 flex flex-col justify-between h-44 text-left transition-all relative ${
                    isOver 
                      ? 'border-[var(--negative)] shadow-[0_0_15px_rgba(239,68,68,0.08)]' 
                      : 'border-[var(--border-primary)] hover:border-[var(--border-secondary)] shadow-[var(--shadow-soft)]'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <span className="text-lg w-9 h-9 bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-xl flex items-center justify-center shrink-0">
                        {category.icon}
                      </span>
                      <div className="min-w-0">
                        <span className="text-xs font-extrabold text-[var(--text-primary)] truncate block font-display">{category.category}</span>
                        <span className="text-[9px] font-mono text-[var(--text-muted)] uppercase block mt-0.5">Envelope Limit</span>
                      </div>
                    </div>
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                      isOver 
                        ? 'bg-[var(--negative)]/10 text-[var(--negative)] border border-[var(--negative)]/15' 
                        : isWarning 
                          ? 'bg-amber-400/10 text-amber-500 border border-amber-400/15' 
                          : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-primary)]'
                    }`}>
                      {category.percent}%
                    </span>
                  </div>

                  <div className="mt-4 space-y-2">
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-[var(--text-secondary)]">Spent</span>
                      <span className="font-extrabold text-[var(--text-primary)]">
                        {state.currency}{category.spent.toLocaleString()}
                      </span>
                    </div>

                    {/* Thermometer Progress Bar with Dashed 80% & 90% Markers */}
                    <div className="w-full h-2.5 bg-[var(--bg-surface)] rounded-full overflow-hidden border border-[var(--border-primary)] relative">
                      <div className="absolute top-0 bottom-0 left-[80%] w-[1px] border-l border-dashed border-[var(--text-muted)]/40 z-10" />
                      <div className="absolute top-0 bottom-0 left-[90%] w-[1px] border-l border-dashed border-[var(--text-muted)]/40 z-10" />
                      
                      <div 
                        className={`h-full rounded-full transition-all duration-700 ${
                          isOver 
                            ? 'bg-[var(--negative)]' 
                            : isWarning 
                              ? 'bg-amber-400 animate-pulse' 
                              : 'bg-[var(--accent-primary)]'
                        }`}
                        style={{ width: `${category.percent}%` }}
                      />
                    </div>

                    <div className="flex justify-between text-[9px] uppercase tracking-wider text-[var(--text-muted)] pt-0.5 font-mono">
                      <span>Limit: {state.currency}{category.limit.toLocaleString()}</span>
                      <span className={isOver ? 'text-[var(--negative)] font-bold' : 'text-[var(--accent-primary)] font-bold'}>
                        {isOver ? 'DEFICIT' : `${state.currency}${category.remaining.toLocaleString()} left`}
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })
          ) : (
            <div className="col-span-4 py-8 px-4 text-center border border-dashed border-[var(--border-primary)] text-[var(--text-muted)] rounded-2xl bg-[var(--bg-surface)]/30">
              <p className="text-xs font-semibold text-[var(--text-secondary)]">No active spending envelopes configured</p>
              <p className="text-[10px] text-[var(--text-muted)] mt-1 font-sans">Navigate to the Smart Budgets tab to setup envelope control limits.</p>
            </div>
          )}
        </div>
      </div>

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
                ...state.transactions.map(t => ({ ...t, logType: 'transaction' as const })),
                ...state.loansGiven.map(l => ({ 
                    id: l.id, 
                    type: 'expense' as const, 
                    title: `Loan Given: ${l.borrowerName}`, 
                    amount: l.totalAmount, 
                    date: l.dateGiven, 
                    category: 'Loan', 
                    logType: 'loan' as const,
                    accountType: l.sourceAccountType
                })),
                ...state.loansGiven.flatMap(l => l.settlements.map(s => ({
                    id: s.id,
                    type: 'income' as const,
                    title: `Loan Settle: ${l.borrowerName}`,
                    amount: s.amount,
                    date: s.date,
                    category: 'Loan Settle',
                    logType: 'settlement' as const,
                    accountType: s.receivedInType
                })))
              ]
                .sort((a, b) => b.date.localeCompare(a.date))
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
                            ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/15' 
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
                          isInc ? 'text-emerald-500' : 'text-[var(--negative)]'
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

      {/* QUICK TRANSACTION ENTRY MODAL / BOTTOM SHEET */}
      <AnimatePresence>
        {isQuickTxOpen && (
          <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
            {/* Overlay backdrop with high-end blur */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsQuickTxOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            />

            {/* Bottom Sheet on Mobile, Centered Dialog on Desktop */}
            <motion.div 
              initial={{ y: "100%", opacity: 0.5 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0.5 }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="relative w-full md:max-w-md bg-[var(--bg-card)] border-t md:border border-[var(--border-primary)] rounded-t-[24px] md:rounded-[24px] shadow-2xl p-6 text-left z-10 flex flex-col max-h-[90vh] overflow-y-auto"
            >
              {/* Header */}
              <div className="flex justify-between items-center pb-4 border-b border-[var(--border-primary)]">
                <div className="space-y-1">
                  <h4 className="text-base font-bold font-display text-[var(--text-primary)]">Quick Register</h4>
                  <p className="text-[10px] text-[var(--text-muted)] font-sans">Instant single-entry ledger record</p>
                </div>
                <button 
                  onClick={() => setIsQuickTxOpen(false)}
                  className="p-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Toggle Switch */}
              <div className="flex bg-[var(--bg-surface)] p-1 rounded-xl border border-[var(--border-primary)] my-5 relative">
                <button
                  type="button"
                  onClick={() => setTxType('expense')}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all z-10 ${
                    txType === 'expense' ? 'bg-[var(--bg-card)] text-[var(--negative)] shadow-sm border border-[var(--border-primary)]' : 'text-[var(--text-secondary)]'
                  }`}
                >
                  Expense Outflow
                </button>
                <button
                  type="button"
                  onClick={() => setTxType('income')}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all z-10 ${
                    txType === 'income' ? 'bg-[var(--bg-card)] text-emerald-500 shadow-sm border border-[var(--border-primary)]' : 'text-[var(--text-secondary)]'
                  }`}
                >
                  Income Inflow
                </button>
              </div>

              <form onSubmit={handleQuickTxSubmit} className="space-y-4">
                {/* Receipt Live Preview Box */}
                <div className="bg-[var(--bg-surface)] border border-[var(--border-primary)] p-4 rounded-xl space-y-2.5 relative overflow-hidden">
                  <div className="absolute right-2 top-2">
                    <Sparkles size={14} className="text-[var(--accent-primary)] opacity-40 animate-pulse" />
                  </div>
                  <span className="text-[8px] font-mono text-[var(--text-muted)] uppercase tracking-widest block font-bold">TICKET PREVIEW</span>
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs font-bold text-[var(--text-primary)] truncate max-w-[200px]">{txTitle || "Untitled Statement"}</span>
                    <span className={`text-sm font-black font-mono ${txType === 'expense' ? 'text-[var(--negative)]' : 'text-emerald-500'}`}>
                      {txType === 'expense' ? '-' : '+'}{state.currency}{parseFloat(txAmount || "0").toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-[9px] font-mono text-[var(--text-muted)] border-t border-[var(--border-primary)]/70 pt-2">
                    <span>Category: {txCategory}</span>
                    <span>Date: {txDate}</span>
                  </div>
                </div>

                {/* Inputs */}
                <div className="space-y-1 text-left">
                  <label className="text-[10px] uppercase font-bold tracking-wider font-mono text-[var(--text-secondary)]">Statement/Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Monzo Weekly Grocery"
                    value={txTitle}
                    onChange={(e) => setTxTitle(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-primary)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] transition-all placeholder-[var(--text-muted)] font-sans"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1 text-left">
                    <label className="text-[10px] uppercase font-bold tracking-wider font-mono text-[var(--text-secondary)]">Amount ({state.currency})</label>
                    <input
                      type="number"
                      required
                      min="0.01"
                      step="any"
                      placeholder="0.00"
                      value={txAmount}
                      onChange={(e) => setTxAmount(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-primary)] text-sm font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] transition-all placeholder-[var(--text-muted)]"
                    />
                  </div>

                  <div className="space-y-1 text-left">
                    <label className="text-[10px] uppercase font-bold tracking-wider font-mono text-[var(--text-secondary)]">Category</label>
                    <select
                      value={txCategory}
                      onChange={(e) => setTxCategory(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-primary)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] transition-all cursor-pointer font-sans"
                    >
                      {txType === 'expense' ? (
                        <>
                          <option value="Utilities">Utilities</option>
                          <option value="Food & Dining">Food & Dining</option>
                          <option value="Rent & Housing">Rent & Housing</option>
                          <option value="Shopping">Shopping</option>
                          <option value="Entertainment">Entertainment</option>
                          <option value="Transport">Transport</option>
                          <option value="Investment">Investment</option>
                          <option value="Others">Others</option>
                        </>
                      ) : (
                        <>
                          <option value="Salary">Salary</option>
                          <option value="Freelance">Freelance</option>
                          <option value="Investments">Investments</option>
                          <option value="Gifts">Gifts</option>
                          <option value="Refunds">Refunds</option>
                          <option value="Others">Others</option>
                        </>
                      )}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1 text-left">
                    <label className="text-[10px] uppercase font-bold tracking-wider font-mono text-[var(--text-secondary)]">Settle Account</label>
                    <select
                      value={txAccountId}
                      onChange={(e) => setTxAccountId(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-primary)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] transition-all cursor-pointer font-sans"
                    >
                      <optgroup label="Cash Accounts">
                        {state.cashAccounts.map(c => (
                          <option key={c.id} value={`cash-${c.id}`}>{c.name} ({state.currency}{c.balance.toLocaleString()})</option>
                        ))}
                      </optgroup>
                      <optgroup label="Bank/Debit Cards">
                        {state.cards.filter(c => c.cardType === 'Debit' && !c.isCanceled).map(c => (
                          <option key={c.id} value={`card-${c.id}`}>{c.cardName} ({state.currency}{c.currentBalance.toLocaleString()})</option>
                        ))}
                      </optgroup>
                    </select>
                  </div>

                  <div className="space-y-1 text-left">
                    <label className="text-[10px] uppercase font-bold tracking-wider font-mono text-[var(--text-secondary)]">Record Date</label>
                    <input
                      type="date"
                      required
                      value={txDate}
                      onChange={(e) => setTxDate(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-primary)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] transition-all cursor-pointer font-mono"
                    />
                  </div>
                </div>

                {/* Submit Action */}
                <div className="pt-4 border-t border-[var(--border-primary)] mt-4">
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    type="submit"
                    className="w-full bg-[var(--accent-primary)] hover:brightness-110 text-primary py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all duration-150 cursor-pointer"
                  >
                    Confirm Ledger Registry
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
