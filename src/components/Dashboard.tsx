import React from 'react';
import { motion } from 'motion/react';
import { AppState } from '../types';
import { 
  Bell, Plus, Send, ArrowUpRight, ArrowDownLeft, CreditCard, 
  Wallet, PieChart, Landmark, TrendingUp, Sparkles, AlertTriangle, 
  CheckCircle2, Flame, RefreshCw, Calendar, ChevronRight, UserCheck, Heart, ArrowRight
} from 'lucide-react';
import { TrendAnalysisChart, SpendingByCategoryPie } from './Charts';
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

  // Calculate a Dynamic "Financial Health" Score based on savings rate, credit limits, debt ratios
  let healthScore = 75; // baseline
  if (displaySavingsRate > 30) healthScore += 15;
  else if (displaySavingsRate > 15) healthScore += 10;
  else if (displaySavingsRate < 5) healthScore -= 10;

  const debtRatio = aggregateActiveWealth > 0 ? (totalDebtsAmount / aggregateActiveWealth) : 0;
  if (debtRatio > 0.5) healthScore -= 15;
  else if (debtRatio < 0.1) healthScore += 8;

  const finalHealthScore = Math.min(100, Math.max(20, healthScore));

  const getHealthStatus = (score: number) => {
    if (score >= 85) return { label: 'Excellent', color: 'text-[#10B981] bg-[#10B981]/10', desc: 'Your savings speed and wallet leverage are optimized.' };
    if (score >= 70) return { label: 'Healthy', color: 'text-amber-400 bg-amber-400/10', desc: 'Solid reserves, but watch secondary subscription leaks.' };
    return { label: 'Attention Needed', color: 'text-[#F87171] bg-[#F87171]/10', desc: 'High outflow velocities detected. Increase capital limits.' };
  };

  const healthState = getHealthStatus(finalHealthScore);

  // Spend category calculations for original layout
  const expensesByCategory: Record<string, number> = {};
  state.transactions
    .filter(t => t.type === 'expense')
    .forEach(t => {
      expensesByCategory[t.category] = (expensesByCategory[t.category] || 0) + Math.abs(t.amount);
    });

  const totalExpenseCategorySum = Object.values(expensesByCategory).reduce((s, v) => s + v, 0) || 1;
  const categoryChartList = Object.entries(expensesByCategory).map(([name, val]) => {
    const percentage = Math.round((val / totalExpenseCategorySum) * 100);
    return {
      name,
      value: val,
      percentage,
      color: EXPENSE_COLORS[name] || '#6B7280',
    };
  }).sort((a, b) => b.value - a.value).slice(0, 4); // top 4 categories

  // Horizontal Scroll spend categories list with linear progress bar style
  // Using standard mock budget category values if no explicit budgets configured
  const categoriesBudgets = state.budgets || [
    { id: 'b1', category: 'Food', limit: 500, spent: 240, icon: '🍔' },
    { id: 'b2', category: 'Transport', limit: 150, spent: 45, icon: '🚗' },
    { id: 'b3', category: 'Entertainment', limit: 200, spent: 180, icon: '🍿' },
    { id: 'b4', category: 'Bills', limit: 400, spent: 350, icon: '⚡' },
    { id: 'b5', category: 'Shopping', limit: 300, spent: 335, icon: '🛍️' }
  ];

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

  // Trend analysis data mapping 
  const sparklineData = state.transactions.length > 0
    ? [...state.transactions].reverse().slice(0, 6).map(t => Math.abs(t.amount))
    : [2000, 4500, 2900, 6100, 4200, 8500]; // high fidelity fallback

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
        className="fixed bottom-24 right-5 sm:right-10 z-40 w-14 h-14 bg-gradient-to-tr from-[#10B981] to-emerald-400 text-white rounded-full flex items-center justify-center shadow-[0_8px_32px_rgba(16,185,129,0.4)] hover:scale-110 cursor-pointer active:scale-95 duration-200 border border-emerald-300/20 group"
        whileHover={{ rotate: 90 }}
        title="Quick Record Transaction"
      >
        <Plus size={28} className="text-white filter drop-shadow-.5" />
      </motion.button>

      {/* 1. TOP PERSONALIZED BANNER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 py-2 border-b border-[var(--border-primary)] pb-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span id="premium-suite-badge" className="px-3 py-1 bg-[#10B981]/15 border border-[#10B981]/25 text-[#10B981] text-[10px] uppercase font-bold tracking-widest rounded-full flex items-center gap-1.5 shadow-sm">
              <Sparkles size={11} className="text-[#10B981] animate-pulse" />
              Premium Suite Active
            </span>
            <span className="w-1.5 h-1.5 bg-[#10B981] rounded-full animate-ping" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] flex items-center gap-2 leading-none">
            Hello, {state.userProfile?.name || 'User'}
            <span className="text-2xl hover:scale-125 duration-155 cursor-pointer">👋</span>
          </h1>
        </div>

        <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
          <button 
            onClick={onProfileClick}
            className="flex items-center gap-2.5 bg-[var(--bg-card)] hover:bg-[var(--bg-surface)] border border-[var(--border-primary)] px-4 py-2 rounded-xl text-xs font-bold text-[var(--text-primary)] transition-all cursor-pointer shadow-sm hover:scale-[1.02]"
          >
            <div className="w-6 h-6 bg-[#10B981] rounded-full flex items-center justify-center text-[10px] font-black text-white shadow-inner">
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
              <span className="absolute top-2 right-2 w-2 h-2 bg-[#10B981] rounded-full ring-2 ring-[var(--bg-card)]" />
            )}
          </button>
        </div>
      </div>

      {/* 2. PROMINENT FINANCIAL HEALTH INDEX & NET WORTH SUMMARY */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* NEW FINANCIAL HEALTH SCORE & BURN METER */}
        <div className="lg:col-span-4 bg-[var(--bg-card)] rounded-[24px] p-6 border border-[var(--border-primary)] shadow-[var(--shadow-soft)] flex flex-col justify-between relative overflow-hidden text-left">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-secondary)] font-mono">Financial Health Index</span>
              <Heart size={14} className="text-[#F87171] fill-[#F87171] animate-pulse" />
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

        {/* VAULT PORTFOLIO HERO (8 COLS) */}
        <div id="vault-portfolio-hero" className="lg:col-span-8 overflow-hidden bg-[var(--bg-card)] rounded-[24px] p-6 flex flex-col justify-between border border-[var(--border-primary)] shadow-[var(--shadow-soft)] transition-all min-h-[220px] text-left relative">
          
          {/* Subtle decoration lines */}
          <div className="absolute right-0 bottom-0 text-[100px] text-slate-800/10 pointer-events-none select-none font-black leading-none">EM VAULT</div>

          <div className="flex justify-between items-start z-10">
            <div>
              <p className="text-[10px] tracking-widest text-[#10B981] uppercase font-bold flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
                EM VAULT PORTFOLIO
              </p>
              <h3 className="text-xs text-[var(--text-secondary)] mt-0.5 font-medium">Aggregate Active Wealth Reserves</h3>
            </div>

            <div className="flex items-center gap-1 bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/20 py-1 px-2 rounded-full text-[10px] font-bold font-mono">
              <TrendingUp size={11} />
              <span>+3.2% trend</span>
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

      </div>

      {/* 3. HORIZONTAL SCROLLABLE "SPENDING BY CATEGORY" TRADIING CARD LISTS */}
      <div className="space-y-4">
        <div className="flex justify-between items-center px-1">
          <div className="text-left">
            <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Spending Envelopes</h4>
            <p className="text-[10px] text-[var(--text-secondary)]">Horizontal monitor caps</p>
          </div>
          <button 
            onClick={() => setActiveTab('budgets')}
            className="text-[11px] font-bold text-[#10B981] hover:underline flex items-center gap-1"
          >
            <span>Budgets Tab</span>
            <ArrowRight size={12} />
          </button>
        </div>

        {/* Categories scroll tracker */}
        <div className="flex overflow-x-auto gap-4 pb-2 scrollbar-none snap-x" id="category-spend-slider-tray">
          {liveBudgetTray.map((category) => {
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
          })}
        </div>
      </div>

      {/* 4. SHORTCUT MONZO STYLED ACTIONS */}
      <div className="bg-slate-900/35 border border-[var(--border-primary)] rounded-[24px] p-5 flex flex-col justify-between shadow-inner text-left" id="monzo-shortcuts-tray">
        <div className="pb-3 border-b border-[var(--border-primary)] mb-4 flex justify-between items-center">
          <span className="text-[10px] tracking-wider text-[#10B981] font-mono font-bold uppercase">HOTKEY SHORTCUT TIMEFRAMES</span>
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
            <div className="p-2.5 rounded-xl bg-indigo-505 bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500/20">
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
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-8 w-full">
          <TrendAnalysisChart data={sparklineData} currency={state.currency} />
        </div>
        <div className="lg:col-span-4 w-full">
          <SpendingByCategoryPie categories={categoryChartList} currency={state.currency} />
        </div>
      </div>

      {/* 6. TIMELINE TRANSACTION FEEDS & RECORDED SCHEDULE ITEMS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* RECENT TRANSACTIONS FEED PANEL */}
        <div className="lg:col-span-7 bg-[var(--bg-card)] border border-[var(--border-primary)] p-6 rounded-[24px] shadow-[var(--shadow-soft)] w-full text-left">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h4 className="text-sm font-bold text-[var(--text-primary)]">Recent Transactions Feed</h4>
              <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">Continuous ledger operations registered securely</p>
            </div>
            <button
              onClick={() => setActiveTab('reports')}
              className="text-[11px] font-bold text-[#10B981] uppercase hover:underline"
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
                        onClick={() => setEditingTransactionId(t.id)}
                        className="group p-4 bg-slate-900/30 hover:bg-[var(--bg-surface)] border border-[var(--border-primary)] hover:border-slate-700/50 rounded-xl flex justify-between items-center cursor-pointer transition-all duration-200"
                      >
                        <div className="flex items-center gap-3.5 min-w-0 flex-1">
                          <div className={`p-3 rounded-xl shrink-0 transition-colors ${
                            isInc 
                              ? 'bg-[#10B981]/15 text-[#10B981]' 
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
                            isInc ? 'text-[#10B981]' : 'text-rose-500'
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
            <div>
              <h4 className="text-sm font-bold text-[var(--text-primary)]">Upcoming Bills</h4>
              <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">Recurring subscription plans in monitor queue</p>
            </div>
            <button
              onClick={() => setActiveTab('inflow_outflow')}
              className="text-[11px] font-bold text-[#10B981] uppercase hover:underline"
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
