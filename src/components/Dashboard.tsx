import React from 'react';
import { motion } from 'motion/react';
import { AppState } from '../types';
import { 
  Bell, Plus, Send, ArrowUpRight, ArrowDownLeft, CreditCard, 
  Wallet, PieChart, Landmark, TrendingUp, Sparkles, AlertTriangle, 
  CheckCircle2, Flame, RefreshCw, Calendar, ChevronRight, UserCheck, Heart, ArrowRight
} from 'lucide-react';
import { TrendAnalysisChart } from './Charts';
import { EXPENSE_COLORS } from '../utils';

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
  onNotificationClick 
}: DashboardProps) {

  const unreadCount = state.notifications ? state.notifications.filter(n => !n.read).length : 0;

  // Calculate Savings Rate 
  const netSavingsRate = currentMonthInflow > 0 
    ? Math.round(((currentMonthInflow - currentMonthOutflow) / currentMonthInflow) * 100) 
    : 0;
  const displaySavingsRate = Math.max(0, netSavingsRate);

  // Calculate high-fidelity, fully data-driven Financial Health Score across 5 metrics
  const healthMetrics = React.useMemo(() => {
    const hasAnyData = state.cashAccounts.length > 0 || state.cards.length > 0 || state.transactions.length > 0 || state.debts.length > 0;
    if (!hasAnyData) {
      return {
        netWorthScore: 0,
        liquidityScore: 0,
        debtScore: 0,
        cashFlowScore: 0,
        savingsRateScore: 0,
        totalScore: 0,
        hasData: false
      };
    }

    // 1. Net Worth Score (max 30)
    let netWorthScore = 0;
    if (aggregateActiveWealth > 0) {
      netWorthScore = Math.min(30, Math.round(15 + (aggregateActiveWealth / 50000) * 15));
    } else if (aggregateActiveWealth < 0) {
      netWorthScore = Math.max(0, Math.round(10 - (Math.abs(aggregateActiveWealth) / 10000) * 10));
    } else {
      netWorthScore = 0;
    }

    // 2. Liquidity Score (max 25)
    let liquidityScore = 0;
    const liquidAssets = totalCashAmount + totalDebitCardsAmount;
    if (currentMonthOutflow > 0) {
      const ratio = liquidAssets / currentMonthOutflow;
      if (ratio >= 3) liquidityScore = 25;
      else if (ratio >= 1.5) liquidityScore = 20;
      else if (ratio >= 1.0) liquidityScore = 15;
      else liquidityScore = Math.min(15, Math.round(5 + ratio * 10));
    } else {
      if (liquidAssets >= 5000) liquidityScore = 25;
      else if (liquidAssets >= 2000) liquidityScore = 20;
      else if (liquidAssets >= 500) liquidityScore = 15;
      else if (liquidAssets > 0) liquidityScore = 10;
      else liquidityScore = 0;
    }

    // 3. Debt Ratio Score (max 20)
    let debtScore = 20;
    const totalAssets = totalCashAmount + totalDebitCardsAmount;
    if (totalDebtsAmount > 0) {
      const dRatio = totalDebtsAmount / (totalAssets || 1);
      if (dRatio <= 0.1) debtScore = 18;
      else if (dRatio <= 0.3) debtScore = 15;
      else if (dRatio <= 0.5) debtScore = 10;
      else debtScore = Math.max(0, Math.round(10 - (dRatio - 0.5) * 20));
    } else {
      debtScore = totalAssets > 0 ? 20 : 0;
    }

    // 4. Cash Flow Score (max 15)
    let cashFlowScore = 0;
    const netCashFlow = currentMonthInflow - currentMonthOutflow;
    if (currentMonthInflow > 0) {
      if (netCashFlow > 0) {
        const margin = netCashFlow / currentMonthInflow;
        if (margin >= 0.3) cashFlowScore = 15;
        else if (margin >= 0.15) cashFlowScore = 12;
        else cashFlowScore = Math.round(5 + margin * 20);
      } else {
        cashFlowScore = Math.max(0, Math.round(5 + (netCashFlow / currentMonthInflow) * 10));
      }
    } else if (currentMonthOutflow > 0) {
      cashFlowScore = 0;
    } else {
      cashFlowScore = 0;
    }

    // 5. Savings Rate Score (max 10)
    let savingsRateScore = 0;
    if (displaySavingsRate > 0) {
      if (displaySavingsRate >= 30) savingsRateScore = 10;
      else if (displaySavingsRate >= 20) savingsRateScore = 8;
      else if (displaySavingsRate >= 10) savingsRateScore = 6;
      else if (displaySavingsRate >= 5) savingsRateScore = 4;
      else savingsRateScore = 2;
    } else {
      savingsRateScore = 0;
    }

    const totalScore = netWorthScore + liquidityScore + debtScore + cashFlowScore + savingsRateScore;

    console.log(`[DATA-DRIVEN METRICS CALCULATION LOG]`);
    console.log(`- Cash balances: ${totalCashAmount}, Debit card balances: ${totalDebitCardsAmount}, Credit card liability: ${totalCreditCardsAmount}, Debts: ${totalDebtsAmount}`);
    console.log(`- Inflow: ${currentMonthInflow}, Outflow: ${currentMonthOutflow}, Savings Rate: ${displaySavingsRate}%`);
    console.log(`- Metric Weighting Breakdown:`);
    console.log(`  * Net Worth Score: ${netWorthScore}/30`);
    console.log(`  * Liquidity Score: ${liquidityScore}/25`);
    console.log(`  * Debt Ratio Score: ${debtScore}/20`);
    console.log(`  * Cash Flow Score: ${cashFlowScore}/15`);
    console.log(`  * Savings Rate Score: ${savingsRateScore}/10`);
    console.log(`  * Cumulative health score: ${totalScore}/100`);

    return {
      netWorthScore,
      liquidityScore,
      debtScore,
      cashFlowScore,
      savingsRateScore,
      totalScore,
      hasData: true
    };
  }, [
    state.cashAccounts,
    state.cards,
    state.transactions,
    state.debts,
    aggregateActiveWealth,
    totalCashAmount,
    totalDebitCardsAmount,
    totalCreditCardsAmount,
    totalDebtsAmount,
    currentMonthInflow,
    currentMonthOutflow,
    displaySavingsRate
  ]);

  const finalHealthScore = healthMetrics.totalScore;

  const getHealthStatus = (score: number) => {
    if (score >= 85) return { label: 'Excellent', color: 'text-[#10B981] bg-[#10B981]/10', desc: 'Your savings speed and wallet leverage are optimized.' };
    if (score >= 70) return { label: 'Healthy', color: 'text-amber-400 bg-amber-400/10', desc: 'Solid reserves, but watch secondary subscription leaks.' };
    return { label: 'Attention Needed', color: 'text-[#F87171] bg-[#F87171]/10', desc: 'High outflow velocities detected. Increase capital limits.' };
  };

  const healthState = getHealthStatus(finalHealthScore);

  // Horizontal Scroll spend categories list with linear progress bar style
  // Using standard mock budget category values if no explicit budgets configured
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
  const transactionDates = React.useMemo(() => {
    return Array.from(
      new Set(
        state.transactions
          .filter(t => t.date)
          .map(t => t.date.split('T')[0])
      )
    ).sort();
  }, [state.transactions]);

  const sparklineData = React.useMemo(() => {
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
  const trendLabel = React.useMemo(() => {
    if (sparklineData.length === 0) {
      console.log(`[TREND CALCULATION] No data available for trend calculation.`);
      return "No Data";
    }
    if (sparklineData.length < 2) {
      console.log(`[TREND CALCULATION] Insufficient data (N=${sparklineData.length}) for trend calculation.`);
      return "Insufficient Data";
    }

    const lastVal = sparklineData[sparklineData.length - 1].value;
    const prevVal = sparklineData[sparklineData.length - 2].value;

    if (prevVal === 0) {
      console.log(`[TREND CALCULATION] Missing previous value (prevVal=0).`);
      return "—";
    }
    
    const trend = ((lastVal - prevVal) / prevVal) * 100;
    return `${trend >= 0 ? '+' : ''}${trend.toFixed(1)}% trend`;
  }, [sparklineData]);

  const trendColorClass = React.useMemo(() => {
     if (typeof trendLabel !== 'string' || trendLabel.includes('%')) {
        const value = parseFloat(trendLabel);
        if (value >= 0) return 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20';
        return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
     }
     return 'bg-zinc-800 text-zinc-400 border-zinc-700';
  }, [trendLabel]);

  // Fetch subscription due warning status
  const getSubDueDays = (dueDateStr: string, status: string) => {
    if (status !== 'Active') return { label: 'Paused', style: 'text-zinc-500 bg-zinc-800' };
    const today = new Date();
    today.setHours(0,0,0,0);
    const due = new Date(dueDateStr);
    due.setHours(0,0,0,0);
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { label: `Overdue (${Math.abs(diffDays)}d)`, style: 'text-[#F87171] border border-[#F87171]/20 bg-[#F87171]/10' };
    }
    if (diffDays === 0) {
      return { label: 'Due Today', style: 'text-amber-500 border border-amber-500/20 bg-amber-500/10 animate-pulse' };
    }
    if (diffDays <= 5) {
      return { label: `In ${diffDays} days`, style: 'text-amber-500 border border-amber-500/10 bg-amber-500/5' };
    }
    return { label: `In ${diffDays} days`, style: 'text-zinc-400 border border-zinc-800 bg-zinc-900/60' };
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg-primary)] text-[var(--test-primary)] font-sans animate-fade-in space-y-8 p-1 sm:p-5 relative" id="command-dashboard">
      
      {/* ======================= FLOATING PLUS "+" BUTTON ADD TRANSACTION ======================= */}
      <motion.button
        onClick={() => setActiveTab('inflow_outflow')}
        className="fixed bottom-24 right-5 sm:right-10 z-40 w-14 h-14 bg-gradient-to-tr from-[var(--accent-primary)] to-blue-400 text-white rounded-full flex items-center justify-center shadow-[0_8px_32px_rgba(0,163,255,0.4)] hover:scale-110 cursor-pointer active:scale-95 duration-200 border border-[var(--accent-primary)]/20 group"
        whileHover={{ rotate: 90 }}
        title="Quick Record Transaction"
      >
        <Plus size={28} className="text-white filter drop-shadow-.5" />
      </motion.button>

      {/* 1. TOP PERSONALIZED BANNER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 py-4 border-b border-[var(--border-primary)] pb-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span id="premium-suite-badge" className="px-3 py-1 bg-[var(--accent-primary)]/15 border border-[var(--accent-primary)]/25 text-[var(--accent-primary)] text-[11px] uppercase font-semibold tracking-wider rounded-full flex items-center gap-1.5 shadow-sm">
              <Sparkles size={11} className="text-[var(--accent-primary)] animate-pulse" />
              Premium Suite Active
            </span>
            <span className="w-1.5 h-1.5 bg-[var(--accent-primary)] rounded-full animate-ping" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-2 leading-none">
            Hello, {state.userProfile?.name || 'User'}
            <span className="text-2xl hover:scale-125 duration-155 cursor-pointer">👋</span>
          </h1>
        </div>

        <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
          <button 
            onClick={onProfileClick}
            className="flex items-center gap-2.5 bg-[var(--bg-card)] hover:bg-[var(--bg-surface)] border border-[var(--border-primary)] px-4 py-2 rounded-xl text-xs font-bold text-[var(--text-primary)] transition-all cursor-pointer shadow-sm hover:scale-[1.02]"
          >
            <div className="w-8 h-8 bg-[var(--accent-primary)] rounded-full flex items-center justify-center text-sm font-black text-white shadow-lg">
              {state.userProfile?.name?.charAt(0) || 'U'}
            </div>
            <span>Profile Settings</span>
          </button>
          
          <button 
            onClick={onNotificationClick}
            className="p-3 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer shadow-sm transition-all flex items-center justify-center relative"
            title="Notification Alerts Center"
            id="dashboard-bell-trigger"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 bg-[var(--accent-primary)] rounded-full ring-2 ring-[var(--bg-card)]" />
            )}
          </button>
        </div>
      </div>

      {/* 2. PROMINENT FINANCIAL HEALTH INDEX & NET WORTH SUMMARY */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        <div className="lg:col-span-8 flex flex-col gap-6 w-full">
          {/* VAULT PORTFOLIO HERO (8 COLS) */}
          <div id="vault-portfolio-hero" className="overflow-hidden bg-[var(--bg-card)] rounded-[24px] p-6 flex flex-col justify-between border border-[var(--border-primary)] shadow-[var(--shadow-soft)] transition-all min-h-[220px] text-left relative">
          
          {/* Subtle decoration lines */}
          <div className="absolute right-0 bottom-0 text-[100px] text-slate-800/10 pointer-events-none select-none font-black leading-none">EM VAULT</div>

          <div className="flex justify-between items-start z-10">
            <div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[var(--accent-primary)] animate-pulse" />
                Vault Portfolio
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1 font-medium">Aggregate Active Wealth Reserves</p>
            </div>

            <div className={`flex items-center gap-1 border py-1 px-2 rounded-full text-[10px] font-bold font-mono ${trendColorClass}`}>
              <TrendingUp size={11} />
              <span>{trendLabel}</span>
            </div>
          </div>

          <div className="my-5 z-10">
            <div className="text-3xl sm:text-4xl font-black tracking-tight text-[var(--text-primary)] flex items-baseline gap-1 bg-gradient-to-r from-white to-slate-200 bg-clip-text text-transparent font-mono select-all">
              <span className="text-xl font-light text-slate-400 select-none mr-2">{state.currency}</span>
              <span className="font-black leading-none">{aggregateActiveWealth.toLocaleString()}</span>
              <span className="text-base font-bold text-[#10B981]">.00</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-t border-[var(--border-primary)] pt-5 z-10 gap-4">
            <div className="flex gap-8 flex-wrap">
              <div>
                <p className="text-[9px] text-[var(--text-secondary)] uppercase font-bold tracking-wide">Liquid Reserves</p>
                <p className="font-extrabold text-xs text-[#10B981] font-mono mt-0.5">
                  +{state.currency}{(totalCashAmount + totalDebitCardsAmount).toLocaleString()}
                </p>
              </div>

              <div>
                <p className="text-[9px] text-[var(--text-secondary)] uppercase font-bold tracking-wide">Credit / Liabilities</p>
                <p className="font-extrabold text-xs text-[#F87171] font-mono mt-0.5">
                  -{state.currency}{(totalCreditCardsAmount + totalDebtsAmount).toLocaleString()}
                </p>
              </div>
            </div>

            <button 
              onClick={() => setActiveTab('accounts')}
              className="bg-white hover:bg-slate-100 text-slate-950 hover:text-black py-2 px-4 rounded-xl text-xs font-bold uppercase transition-all duration-300 cursor-pointer border border-transparent hover:scale-[1.03] flex items-center gap-1.5 shrink-0 shadow-md"
            >
              <span>Manage Wallets</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {/* 4. SHORTCUT MONZO STYLED ACTIONS */}
        <div className="bg-slate-900/35 border border-[var(--border-primary)] rounded-[24px] p-5 flex flex-col justify-between shadow-inner text-left" id="monzo-shortcuts-tray">
          <div className="pb-3 border-b border-[var(--border-primary)] mb-4 flex justify-between items-center">
            <span className="text-[10px] tracking-wider text-[var(--accent-primary)] font-mono font-bold uppercase">HOTKEY SHORTCUT TIMEFRAMES</span>
            <span className="text-[9px] text-[var(--text-secondary)] font-mono">1-TAP SYNC CONNECTORS</span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <button
              onClick={() => setActiveTab('inflow_outflow')}
              className="group p-4 bg-[var(--bg-card)] hover:bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-xl text-left transition-all cursor-pointer flex items-center gap-3"
            >
              <div className="p-2.5 rounded-xl bg-[#10B981]/15 text-[#10B981] group-hover:bg-[#10B981]/25">
                <Plus size={16} />
              </div>
              <div>
                <h5 className="text-xs font-bold text-white leading-none">Add Income</h5>
                <span className="text-[9px] text-[var(--text-secondary)] mt-1 block">Inflow Ledger</span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('inflow_outflow')}
              className="group p-4 bg-[var(--bg-card)] hover:bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-xl text-left transition-all cursor-pointer flex items-center gap-3"
            >
              <div className="p-2.5 rounded-xl bg-[#F87171]/15 text-[#F87171] group-hover:bg-[#F87171]/25">
                <ArrowUpRight size={16} />
              </div>
              <div>
                <h5 className="text-xs font-bold text-white leading-none">Add Expense</h5>
                <span className="text-[9px] text-[var(--text-secondary)] mt-1 block">Outflow Ledger</span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('accounts')}
              className="group p-4 bg-[var(--bg-card)] hover:bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-xl text-left transition-all cursor-pointer flex items-center gap-3"
            >
              <div className="p-2.5 rounded-xl bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] group-hover:bg-[var(--accent-primary)]/20">
                <Send size={15} />
              </div>
              <div>
                <h5 className="text-xs font-bold text-white leading-none">Transfer</h5>
                <span className="text-[9px] text-[var(--text-secondary)] mt-1 block">Cross-wallet Sync</span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('budgets')}
              className="group p-4 bg-[var(--bg-card)] hover:bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-xl text-left transition-all cursor-pointer flex items-center gap-3"
            >
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/15">
                <PieChart size={15} />
              </div>
              <div>
                <h5 className="text-xs font-bold text-white leading-none">Limits</h5>
                <span className="text-[9px] text-[var(--text-secondary)] mt-1 block">Configure Caps</span>
              </div>
            </button>
          </div>
        </div>

        {/* 5. METRIC ANALYTIC GRAPHS BLOCK */}
        <div className="w-full">
          <TrendAnalysisChart data={sparklineData} currency={state.currency} />
        </div>
        </div>

        <div className="lg:col-span-4 flex flex-col gap-6 w-full">
          {/* NEW FINANCIAL HEALTH SCORE & BURN METER */}
          <div className="bg-[var(--bg-card)] rounded-[24px] p-6 border border-[var(--border-primary)] shadow-[var(--shadow-soft)] flex flex-col justify-between relative overflow-hidden text-left" id="financial-health-card">

          <div className="space-y-4">
            <div className="flex justify-between items-center pb-1">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">Financial Health Index</h3>
              <Heart size={15} className="text-[#F87171] fill-[#F87171] animate-pulse" />
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-black font-sans text-white font-mono">{finalHealthScore}</span>
              <span className="text-sm font-bold text-[var(--text-secondary)]">/ 100</span>
            </div>

            <div className="p-3.5 rounded-xl border border-[var(--border-primary)] bg-slate-900/40 space-y-1">
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase inline-block ${healthState.color}`}>
                {healthState.label}
              </span>
              <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed pt-1.5">
                {healthState.desc}
              </p>
            </div>

            {/* Score Component Breakdown */}
            <div className="pt-3 border-t border-[var(--border-primary)] space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--accent-primary)] font-mono">Index Components</span>
                <span className="text-[9px] text-zinc-500 font-mono font-bold">TOTAL: 100 max</span>
              </div>

              {/* Component: Net Worth Score */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-zinc-400 font-medium">Net Worth Weight</span>
                  <span className="font-mono font-bold text-white">
                    {healthMetrics.netWorthScore}<span className="text-zinc-650 font-normal"> / 30</span>
                  </span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-[var(--accent-primary)] h-full rounded-full transition-all duration-500" style={{ width: `${(healthMetrics.netWorthScore / 30) * 100}%` }} />
                </div>
              </div>

              {/* Component: Liquidity Score */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-zinc-400 font-medium font-sans">Liquidity Weight</span>
                  <span className="font-mono font-bold text-white">
                    {healthMetrics.liquidityScore}<span className="text-zinc-650 font-normal"> / 25</span>
                  </span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-cyan-500 h-full rounded-full transition-all duration-500" style={{ width: `${(healthMetrics.liquidityScore / 25) * 100}%` }} />
                </div>
              </div>

              {/* Component: Debt Ratio Score */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-zinc-400 font-medium font-sans">Debt Ratio Weight</span>
                  <span className="font-mono font-bold text-white">
                    {healthMetrics.debtScore}<span className="text-zinc-650 font-normal"> / 20</span>
                  </span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-amber-400 h-full rounded-full transition-all duration-500" style={{ width: `${(healthMetrics.debtScore / 20) * 100}%` }} />
                </div>
              </div>

              {/* Component: Cash Flow Score */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-zinc-400 font-medium font-sans">Cash Flow Weight</span>
                  <span className="font-mono font-bold text-white">
                    {healthMetrics.cashFlowScore}<span className="text-zinc-650 font-normal"> / 15</span>
                  </span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-indigo-400 h-full rounded-full transition-all duration-500" style={{ width: `${(healthMetrics.cashFlowScore / 15) * 100}%` }} />
                </div>
              </div>

              {/* Component: Savings Rate Score */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-zinc-400 font-medium font-sans">Savings Speed Weight</span>
                  <span className="font-mono font-bold text-white">
                    {healthMetrics.savingsRateScore}<span className="text-zinc-650 font-normal"> / 10</span>
                  </span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-rose-500 h-full rounded-full transition-all duration-500" style={{ width: `${(healthMetrics.savingsRateScore / 10) * 100}%` }} />
                </div>
              </div>

              <div className="text-[10px] text-zinc-550 italic leading-snug pt-1">
                Formula: Index = Net Worth (30) + Cash Liquidity (25) + Liability Safety (20) + Flow Margin (15) + Savings Delta (10)
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-[var(--border-primary)] mt-4">
            <div className="flex justify-between text-[11px] items-center">
              <span className="text-[var(--text-secondary)] font-mono">Monthly Outflow Rate:</span>
              <span className="font-bold text-[#F87171] font-mono">
                {state.currency}{currentMonthOutflow.toLocaleString()}
              </span>
            </div>
            {/* Simple visual Health track bar */}
            <div className="w-full h-1.5 bg-slate-800 rounded-full mt-2 overflow-hidden">
              <div className="h-full bg-[#10B981]" style={{ width: `${finalHealthScore}%` }} />
            </div>
          </div>
        </div>
        </div>

      </div>

      {/* 3. HORIZONTAL SCROLLABLE "SPENDING BY CATEGORY" TRADIING CARD LISTS */}
      <div className="space-y-4">
        <div className="flex justify-between items-end px-1">
          <div className="text-left space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">Spending Envelopes</h2>
            <p className="text-xs text-[var(--text-secondary)]">Active monthly envelope controls and limits</p>
          </div>
          <button 
            onClick={() => setActiveTab('budgets')}
            className="text-xs font-semibold text-[var(--accent-primary)] hover:underline flex items-center gap-1"
          >
            <span>Budgets Tab</span>
            <ArrowRight size={12} />
          </button>
        </div>

        {/* Categories scroll tracker */}
        <div className="flex overflow-x-auto gap-4 pb-2 scrollbar-none snap-x w-full" id="category-spend-slider-tray">
          {liveBudgetTray.length > 0 ? (
            liveBudgetTray.map((category) => {
              const ratio = category.spent / category.limit;
              const isOver = ratio > 1;
              return (
                <motion.div
                  key={category.id}
                  whileHover={{ y: -3 }}
                  className="min-w-[195px] sm:min-w-[210px] snap-start bg-[var(--bg-card)] border border-[var(--border-primary)] p-4 rounded-2xl flex flex-col justify-between h-34 shadow-sm text-left"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <span className="text-lg w-8 h-8 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-center">{category.icon}</span>
                      <span className="text-xs font-bold text-white max-w-[100px] truncate">{category.category}</span>
                    </div>
                    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                      isOver ? 'bg-[#F87171]/10 text-[#F87171] border border-[#F87171]/20' : ratio >= 0.8 ? 'bg-amber-400/10 text-amber-400 border border-amber-400/15' : 'bg-slate-900 text-slate-400'
                    }`}>
                      {category.percent}%
                    </span>
                  </div>

                  <div className="mt-4 space-y-1.5">
                    <div className="flex justify-between text-[10px] font-mono text-[var(--text-secondary)]">
                      <span>Spent</span>
                      <span className="font-extrabold text-white">
                        {state.currency}{category.spent.toLocaleString()}
                      </span>
                    </div>

                    {/* Linear mini budget bar */}
                    <div className="w-full h-1.5 bg-slate-850 rounded-full overflow-hidden border border-slate-800/10">
                      <div 
                        className={`h-full ${isOver ? 'bg-[#F87171]' : ratio >= 0.8 ? 'bg-[#F59E0B]' : 'bg-[#10B981]'}`}
                        style={{ width: `${category.percent}%` }}
                      />
                    </div>

                    <div className="flex justify-between text-[8px] uppercase tracking-wide text-[var(--text-secondary)] pt-0.5 font-mono">
                      <span>Limit: {state.currency}{category.limit}</span>
                      <span className={isOver ? 'text-[#F87171] font-bold' : 'text-[#10B981]'}>
                        {isOver ? 'DEFICIT' : `${state.currency}${category.remaining} left`}
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })
          ) : (
            <div className="w-full py-6 px-4 text-center border border-dashed border-slate-800/60 text-slate-500 rounded-2xl bg-slate-900/10">
              <p className="text-xs font-semibold text-slate-300">No active spending envelopes configured</p>
              <p className="text-[10px] text-slate-500 mt-1">Navigate to the Smart Budgets tab to setup envelope control limits.</p>
            </div>
          )}
        </div>
      </div>



      {/* 6. TIMELINE TRANSACTION FEEDS & RECORDED SCHEDULE ITEMS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* RECENT TRANSACTIONS FEED PANEL */}
        <div className="lg:col-span-7 bg-[var(--bg-card)] border border-[var(--border-primary)] p-6 rounded-[24px] shadow-[var(--shadow-soft)] w-full text-left">
          <div className="flex justify-between items-center mb-6">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">Recent Transactions Feed</h3>
              <p className="text-xs text-[var(--text-secondary)]">Continuous ledger operations registered securely</p>
            </div>
            <button
              onClick={() => setActiveTab('reports')}
              className="text-[11px] font-bold text-[var(--accent-primary)] uppercase hover:underline"
            >
              See All logs
            </button>
          </div>

          <div className="space-y-3">
            {state.transactions.length === 0 && state.loansGiven.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 border border-dashed border-slate-800 rounded-2xl bg-zinc-950/10 italic text-xs">
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
                  const isInc = t.type === 'income' || t.type === 'deposit' || (t.type === 'transfer' && t.amount > 0);
                  const absAmt = Math.abs(t.amount);

                  return (
                      <div 
                        key={`${t.logType}-${t.id}`}
                        className="group p-4 bg-slate-900/30 border border-[var(--border-primary)] rounded-xl flex justify-between items-center transition-all duration-200"
                      >
                        <div className="flex items-center gap-3.5 min-w-0 flex-1">
                          <div className={`p-3 rounded-xl shrink-0 transition-colors ${
                            isInc 
                              ? 'bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]' 
                              : 'bg-rose-600/15 text-rose-500 border border-rose-600/20'
                          }`}>
                            {isInc ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                          </div>
                          
                          <div className="min-w-0 flex-1 text-left">
                            <div className="flex flex-wrap items-center gap-2">
                              <h5 className="text-sm font-semibold text-[var(--text-primary)] truncate max-w-full leading-tight">{t.title}</h5>
                              <span className="text-[9px] font-bold px-2 py-0.5 bg-slate-800 border border-slate-750 text-slate-400 rounded-full uppercase shrink-0">
                                {t.category}
                              </span>
                            </div>
                            <p className="text-[10px] text-[var(--text-secondary)] mt-1 font-mono">{t.date}</p>
                          </div>
                        </div>
  
                        <div className="text-right pl-4 shrink-0 font-mono">
                          <span className={`text-xs font-bold block ${
                            isInc ? 'text-[var(--accent-primary)]' : 'text-rose-500'
                          }`}>
                            {isInc ? '+' : '-'}{state.currency}{absAmt.toLocaleString()}
                          </span>
                          <span className="text-[9px] uppercase tracking-wider text-slate-400 block mt-1">
                            {t.accountType === 'cash' ? 'Cash' : 'Bank Card'}
                          </span>
                        </div>
                      </div>
                  );
                })
            )}
          </div>
        </div>

        {/* BILLS MONITOR */}
        <div className="lg:col-span-5 bg-[var(--bg-card)] border border-[var(--border-primary)] p-6 rounded-[24px] shadow-[var(--shadow-soft)] w-full text-left">
          <div className="flex justify-between items-center mb-6">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">Upcoming Bills</h3>
              <p className="text-xs text-[var(--text-secondary)]">Recurring subscription plans in monitor queue</p>
            </div>
            <button
              onClick={() => setActiveTab('inflow_outflow')}
              className="text-[11px] font-bold text-[var(--accent-primary)] uppercase hover:underline"
            >
              Configure
            </button>
          </div>

          <div className="space-y-3">
            {!state.subscriptions || state.subscriptions.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 border border-dashed border-slate-800 rounded-2xl bg-zinc-950/15 italic text-xs">
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
                      className="p-4 bg-slate-900/30 border border-[var(--border-primary)] rounded-xl space-y-3 hover:border-slate-800 transition-colors text-left"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <h5 className="text-xs font-bold text-[var(--text-primary)] leading-tight truncate">{sub.name}</h5>
                          <span className="text-[9px] uppercase tracking-wider text-[var(--text-secondary)] mt-1.5 block">
                            Billing • {sub.billingCycle}
                          </span>
                        </div>

                        <span className={`px-2 py-0.5 text-[9px] font-bold rounded shrink-0 font-mono ${billState.style}`}>
                          {billState.label}
                        </span>
                      </div>

                      <div className="flex justify-between items-center pt-2.5 border-t border-[var(--border-primary)]">
                        <div>
                          <span className="text-[8px] text-[var(--text-secondary)] block uppercase font-mono font-bold">Amount</span>
                          <span className="text-xs font-bold text-white font-mono">
                            {state.currency}{sub.amount.toLocaleString()}
                          </span>
                        </div>

                        <button 
                          onClick={() => setActiveTab('inflow_outflow')}
                          className="px-3 py-1.5 bg-slate-800/80 hover:bg-[#10B981]/25 text-xs font-bold uppercase transition-all hover:text-[#10B981] hover:border-[#10B981]/30 border border-slate-750 rounded-lg cursor-pointer text-[10px]"
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

    </div>
  );
}
