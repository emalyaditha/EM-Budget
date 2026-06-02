import React from 'react';
import { motion } from 'motion/react';
import { AppState } from '../types';
import { 
  Bell, Plus, Send, ArrowUpRight, ArrowDownLeft, CreditCard, 
  Wallet, PieChart, Landmark, TrendingUp, Sparkles, AlertTriangle, 
  CheckCircle2, Flame, RefreshCw, Calendar, ChevronRight, UserCheck
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

  // Spend category calculations for the dashboard chart
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

  // Trend analysis data mapping 
  const sparklineData = state.transactions.length > 0
    ? [...state.transactions].reverse().slice(0, 6).map(t => Math.abs(t.amount))
    : [2000, 4500, 2900, 6100, 4200, 8500]; // high fidelity fallback

  // Fetch subscription due warning status
  const getSubDueDays = (dueDateStr: string, status: string) => {
    if (status !== 'Active') return { label: 'Paused', style: 'text-zinc-500 bg-zinc-950/40 border border-zinc-900' };
    const today = new Date();
    today.setHours(0,0,0,0);
    const due = new Date(dueDateStr);
    due.setHours(0,0,0,0);
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { label: `Overdue (${Math.abs(diffDays)}d)`, style: 'text-rose-400 bg-rose-950/20 border border-rose-900/30' };
    }
    if (diffDays === 0) {
      return { label: 'Due Today', style: 'text-amber-400 bg-amber-950/30 border border-amber-900/40 animate-pulse' };
    }
    if (diffDays <= 5) {
      return { label: `In ${diffDays} days`, style: 'text-amber-400/80 bg-amber-950/10 border border-amber-900/20' };
    }
    return { label: `In ${diffDays} days`, style: 'text-zinc-400 bg-zinc-900 border border-zinc-800' };
  };

  return (
    <div className="flex flex-col h-full bg-black text-zinc-100 font-sans animate-fade-in space-y-8" id="command-dashboard">
      
      {/* 1. TOP PERSONALIZED BANNER & VISUAL HEALTH */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 py-2 border-b border-zinc-900/80 pb-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-indigo-950/50 border border-indigo-800/45 text-indigo-400 text-[10px] uppercase font-bold tracking-widest rounded-full flex items-center gap-1">
              <Sparkles size={10} className="text-indigo-400" />
              Premium Suite Active
            </span>
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2 leading-none">
            Hello, {state.userProfile.name}
            <span className="text-xl sm:text-2xl hover:scale-125 duration-150 cursor-pointer">👋</span>
          </h1>
          <p className="text-zinc-500 text-xs font-mono font-medium flex items-center gap-1.5">
            <UserCheck size={12} className="text-zinc-600" />
            Device sync verified • Last modified recently
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
          {/* Action to change profiles easily */}
          <button 
            onClick={onProfileClick}
            className="flex items-center gap-2 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 px-3.5 py-2 rounded-xl text-xs font-bold text-zinc-300 hover:text-white transition-all cursor-pointer"
          >
            <div className="w-4 h-4 bg-indigo-600 rounded-full flex items-center justify-center text-[10px] font-black font-sans text-white">
              {state.userProfile.name.charAt(0)}
            </div>
            <span>Profile settings</span>
          </button>
          
          <button 
            onClick={onNotificationClick}
            className="p-3 bg-zinc-950 border border-zinc-900 rounded-xl text-zinc-400 hover:text-white hover:border-zinc-700 relative cursor-pointer shadow-md transition-all flex items-center justify-center"
            title="Notification Alerts Center"
            id="dashboard-bell-trigger"
          >
            <Bell size={15} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-indigo-500 border-2 border-black rounded-full" />
            )}
          </button>
        </div>
      </div>

      {/* 2. REALISTIC NET WORTH CARD (Inspired by Monzo, Stripe & Apple Wallet) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* Apple Wallet Style Card display */}
        <div className="lg:col-span-7 relative group overflow-hidden bg-gradient-to-tr from-zinc-950 via-neutral-900/95 to-indigo-950/70 rounded-[32px] p-6 sm:p-8 flex flex-col justify-between border border-white/10 shadow-2xl transition-all hover:border-white/20 hover:shadow-indigo-950/10 min-h-[220px] sm:min-h-[240px]">
          {/* Abstract vector glowing grids inside card */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,_transparent_1px),_linear-gradient(90deg,_rgba(255,255,255,0.015)_1px,_transparent_1px)] bg-[size:16px_16px] pointer-events-none" />
          <div className="absolute -top-24 -left-20 w-56 h-56 rounded-full bg-gradient-to-br from-indigo-500/10 to-transparent blur-3xl pointer-events-none" />
          <div className="absolute bottom-[-100px] right-[-50px] w-64 h-64 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
          
          <div className="flex justify-between items-start z-10">
            <div>
              <p className="text-[10px] tracking-widest text-[#8aa8bb] uppercase font-mono font-bold flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                EM VAULT PORTFOLIO
              </p>
              <h3 className="text-xs text-zinc-400 mt-1 font-semibold">Total Net Worth Sum</h3>
            </div>
            
            {/* Hologram Bank chip decoration */}
            <div className="flex flex-col items-end">
              <div className="w-8 h-6 rounded-md bg-gradient-to-r from-amber-500/20 via-yellow-500/10 to-amber-600/30 border border-amber-500/40 opacity-80 shadow-md relative" />
              <span className="text-[7px] font-mono tracking-widest text-zinc-500 uppercase mt-1">SECURED CHIP</span>
            </div>
          </div>

          <div className="my-4.5 z-10">
            <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white flex items-baseline gap-1.5 font-mono select-all">
              <span className="text-xl sm:text-2xl font-light text-zinc-500 select-none">{state.currency}</span>
              <span>{aggregateActiveWealth.toLocaleString()}</span>
              <span className="text-xs font-mono font-semibold text-indigo-400/80">.00</span>
            </div>
            <p className="text-[10px] text-zinc-500 mt-2 font-mono uppercase tracking-wider flex items-center gap-1.5">
              <span>Account Holder:</span>
              <span className="font-sans font-bold text-zinc-300">{state.userProfile.name}</span>
            </p>
          </div>

          <div className="flex justify-between items-end border-t border-white/5 pt-4 z-10">
            <div className="flex gap-4">
              <div>
                <p className="text-[9px] text-zinc-500 uppercase font-mono font-bold">Liquid Reserves</p>
                <p className="font-extrabold text-xs text-emerald-400 font-mono mt-0.5">
                  +{state.currency}{(totalCashAmount + totalDebitCardsAmount).toLocaleString()}
                </p>
              </div>

              <div>
                <p className="text-[9px] text-zinc-500 uppercase font-mono font-bold">Credit/Loans Liability</p>
                <p className="font-extrabold text-xs text-rose-500 font-mono mt-0.5">
                  -{state.currency}{(totalCreditCardsAmount + totalDebtsAmount).toLocaleString()}
                </p>
              </div>
            </div>

            <button 
              onClick={() => setActiveTab('accounts')}
              className="bg-zinc-800 hover:bg-white text-zinc-400 hover:text-black py-2 px-3.5 rounded-xl text-[10px] font-mono font-bold uppercase transition-all duration-300 cursor-pointer border border-zinc-700/60 shadow-lg flex items-center gap-1 shrink-0"
            >
              <span>Manage Wallets</span>
              <ChevronRight size={12} />
            </button>
          </div>
        </div>

        {/* 3. PREMIUM FLOATING QUICK ACTION BAR (Monzo-styled shortcut widgets) */}
        <div className="lg:col-span-5 bg-zinc-900/25 border border-zinc-850 rounded-[32px] p-6 flex flex-col justify-between shadow-xl space-y-4">
          <div>
            <span className="text-[10px] tracking-wider text-emerald-400 font-mono font-bold uppercase block mb-1">Financial Actions</span>
            <h4 className="text-base font-extrabold text-white">Quick Ledger Shortcuts</h4>
            <p className="text-[11px] text-zinc-500 leading-relaxed mt-1">
              Direct hotkeys to record statements instantly to wallets & liabilities ledger tables.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <button
              onClick={() => setActiveTab('inflow_outflow')}
              className="group p-4 bg-zinc-950 hover:bg-zinc-900 border border-zinc-900 hover:border-zinc-700 rounded-2xl text-left transition-all duration-300 shadow-md cursor-pointer flex flex-col justify-between h-24"
            >
              <div className="p-2.5 rounded-xl bg-emerald-950/30 text-emerald-400 border border-emerald-900/20 group-hover:bg-emerald-950/60 w-fit">
                <Plus size={16} />
              </div>
              <div>
                <h5 className="text-xs font-bold text-white leading-none">Add Income</h5>
                <span className="text-[9px] text-zinc-500 font-mono mt-1 block">Inflow Register</span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('inflow_outflow')}
              className="group p-4 bg-zinc-950 hover:bg-zinc-900 border border-zinc-900 hover:border-zinc-700 rounded-2xl text-left transition-all duration-300 shadow-md cursor-pointer flex flex-col justify-between h-24"
            >
              <div className="p-2.5 rounded-xl bg-rose-955/20 bg-rose-950/30 text-rose-400 border border-rose-900/20 group-hover:bg-rose-950/60 w-fit">
                <ArrowUpRight size={16} />
              </div>
              <div>
                <h5 className="text-xs font-bold text-white leading-none">Add Expense</h5>
                <span className="text-[9px] text-zinc-500 font-mono mt-1 block">Outflow Register</span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('accounts')}
              className="group p-4 bg-zinc-950 hover:bg-zinc-900 border border-zinc-900 hover:border-zinc-700 rounded-2xl text-left transition-all duration-300 shadow-md cursor-pointer flex flex-col justify-between h-24"
            >
              <div className="p-2.5 rounded-xl bg-indigo-950/30 text-indigo-400 border border-indigo-900/20 group-hover:bg-indigo-950/60 w-fit">
                <Send size={15} />
              </div>
              <div>
                <h5 className="text-xs font-bold text-white leading-none">Transfer Funds</h5>
                <span className="text-[9px] text-zinc-500 font-mono mt-1 block">Between Accounts</span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('debts')}
              className="group p-4 bg-zinc-950 hover:bg-zinc-900 border border-zinc-900 hover:border-zinc-700 rounded-2xl text-left transition-all duration-300 shadow-md cursor-pointer flex flex-col justify-between h-24"
            >
              <div className="p-2.5 rounded-xl bg-amber-955/20 bg-amber-950/30 text-amber-400 border border-amber-900/20 group-hover:bg-amber-950/60 w-fit">
                <Landmark size={15} />
              </div>
              <div>
                <h5 className="text-xs font-bold text-white leading-none">Add Loan/Debt</h5>
                <span className="text-[9px] text-zinc-500 font-mono mt-1 block">Passive Liabilities</span>
              </div>
            </button>
          </div>
        </div>

      </div>

      {/* 4. METRIC KPI CARDS PANEL (With Soft Glow elements) */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 sm:gap-4.5" id="kpi-panel">
        
        {/* KPI: Cash/Debit */}
        <div className="bg-zinc-900/45 p-4 rounded-2xl border border-zinc-850 flex flex-col justify-between h-28 hover:border-zinc-700 transition-colors shadow-sm">
          <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-mono font-bold block">Liquid Assets</span>
          <div>
            <div className="text-xs sm:text-sm font-black font-mono text-emerald-400 flex items-center gap-1">
              <span>+</span>
              <span>{state.currency}{(totalCashAmount + totalDebitCardsAmount).toLocaleString()}</span>
            </div>
            <p className="text-[9px] text-zinc-500 font-mono mt-1 uppercase">Cash + Debit Cards</p>
          </div>
        </div>

        {/* KPI: Lent Asset */}
        <div className="bg-zinc-900/45 p-4 rounded-2xl border border-zinc-850 flex flex-col justify-between h-28 hover:border-indigo-700/40 transition-colors shadow-sm">
          <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-mono font-bold block">Lent Assets</span>
          <div>
            <div className="text-xs sm:text-sm font-black font-mono text-indigo-400 flex items-center gap-1">
              <span>+</span>
              <span>{state.currency}{totalLoansGiven.toLocaleString()}</span>
            </div>
            <p className="text-[9px] text-zinc-500 font-mono mt-1 uppercase">Total Loans Given</p>
          </div>
        </div>

        {/* KPI: Card Owed */}
        <div className="bg-zinc-900/45 p-4 rounded-2xl border border-zinc-850 flex flex-col justify-between h-28 hover:border-zinc-700 transition-colors shadow-sm">
          <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-mono font-bold block">Credit Due</span>
          <div>
            <div className="text-xs sm:text-sm font-black font-mono text-amber-500 flex items-center gap-1">
              <span>-</span>
              <span>{state.currency}{totalCreditCardsAmount.toLocaleString()}</span>
            </div>
            <p className="text-[9px] text-zinc-500 font-mono mt-1 uppercase">Credit card balances</p>
          </div>
        </div>

        {/* KPI: Inflows */}
        <div className="bg-zinc-900/45 p-4 rounded-2xl border border-zinc-850 flex flex-col justify-between h-28 hover:border-zinc-700 transition-colors shadow-sm">
          <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-mono font-bold block">{currentMonthLabel} Inflow</span>
          <div>
            <div className="text-xs sm:text-sm font-black font-mono text-indigo-400 flex items-center gap-1">
              <span>+</span>
              <span>{state.currency}{currentMonthInflow.toLocaleString()}</span>
            </div>
            <p className="text-[9px] text-zinc-500 font-mono mt-1 uppercase">Total income receipts</p>
          </div>
        </div>

        {/* KPI: Outflows */}
        <div className="bg-zinc-900/45 p-4 rounded-2xl border border-zinc-850 flex flex-col justify-between h-28 hover:border-zinc-700 transition-colors shadow-sm">
          <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-mono font-bold block">{currentMonthLabel} Outflow</span>
          <div>
            <div className="text-xs sm:text-sm font-black font-mono text-rose-450 text-rose-400 flex items-center gap-1">
              <span>-</span>
              <span>{state.currency}{currentMonthOutflow.toLocaleString()}</span>
            </div>
            <p className="text-[9px] text-zinc-500 font-mono mt-1 uppercase">Expenses & payments</p>
          </div>
        </div>

        {/* KPI: Savings Rate */}
        <div className="bg-zinc-900/45 p-4 rounded-2xl border border-zinc-850 flex flex-col justify-between h-28 hover:border-amber-700/40 transition-colors shadow-sm md:col-span-1">
          <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-mono font-bold block">Savings Rate</span>
          <div>
            <div className="text-sm font-black font-mono text-amber-400 flex items-center gap-1.5 leading-none">
              <Flame size={14} className="text-amber-500" />
              <span>{displaySavingsRate}%</span>
            </div>
            <p className="text-[9px] text-zinc-500 font-mono mt-1 uppercase">Active month goals</p>
          </div>
        </div>

      </div>

      {/* 5. CHARTS BENTO BLOCK INDEPENDENT ROW (Embed live interactive breakdowns) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-8 w-full">
          <TrendAnalysisChart data={sparklineData} currency={state.currency} />
        </div>
        <div className="lg:col-span-4 w-full">
          <SpendingByCategoryPie categories={categoryChartList} currency={state.currency} />
        </div>
      </div>

      {/* 6. DOUBLE CHANNEL DETAILED MODULES JOURNAL */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* CHANNEL A: RECENT TRANSACTIONS TIMELINE (Widescreen layout adjustments) */}
        <div className="lg:col-span-7 bg-[#070707]/45 border border-zinc-900/70 p-5 rounded-[28px] shadow-sm w-full">
          <div className="flex justify-between items-center mb-5 pb-2.5 border-b border-zinc-900">
            <div>
              <h4 className="text-sm font-bold text-white font-sans">Recent Log Activity</h4>
              <p className="text-[10px] text-zinc-500">Instant logs registered within your workspace</p>
            </div>
            <button
              onClick={() => setActiveTab('reports')}
              className="text-[10px] font-mono hover:underline text-indigo-400 uppercase font-black"
            >
              See all journals
            </button>
          </div>

          <div className="space-y-3">
            {state.transactions.length === 0 ? (
              <div className="p-8 text-center text-zinc-550 border border-dashed border-zinc-850 rounded-2xl bg-zinc-950/20 italic text-xs">
                No active expenditures recorded yet.
              </div>
            ) : (
              [...state.transactions]
                .sort((a, b) => b.date.localeCompare(a.date))
                .slice(0, 5)
                .map((t) => {
                  const isInc = t.type === 'income' || t.type === 'deposit' || (t.type === 'transfer' && t.amount > 0);
                  const absAmt = Math.abs(t.amount);
                  
                  // Simple icon choice for visual delight
                  const isUtilityPay = t.category === 'Utilities' || t.category === 'Rent';

                  return (
                    <div 
                      key={t.id}
                      onClick={() => setEditingTransactionId(t.id)}
                      className="group p-3.5 bg-zinc-950 hover:bg-zinc-900 border border-zinc-900/80 hover:border-zinc-800 rounded-2xl flex justify-between items-center cursor-pointer transition-all duration-200"
                    >
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        <div className={`p-2.5 rounded-xl shrink-0 transition-colors ${
                          isInc 
                            ? 'bg-emerald-950/40 text-emerald-400' 
                            : 'bg-rose-955/20 bg-rose-950/30 text-rose-400'
                        }`}>
                          {isInc ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h5 className="text-xs font-semibold text-white truncate max-w-full leading-tight">{t.title}</h5>
                            <span className="text-[8px] font-bold px-1.5 py-0.5 bg-zinc-900 border border-zinc-800 text-zinc-500 rounded font-mono uppercase shrink-0">
                              {t.category}
                            </span>
                          </div>
                          <p className="text-[9px] sm:text-xs text-zinc-500 font-mono mt-1">{t.date}</p>
                        </div>
                      </div>

                      <div className="text-right pl-2 shrink-0">
                        <span className={`text-xs sm:text-sm font-extrabold font-mono font-bold block ${
                          isInc ? 'text-emerald-400' : 'text-rose-455 text-rose-400'
                        }`}>
                          {isInc ? '+' : '-'}{state.currency}{absAmt.toLocaleString()}
                        </span>
                        <span className="text-[8px] font-mono uppercase tracking-wider text-zinc-600 block mt-0.5">
                          {t.accountType === 'cash' ? 'Cash' : 'Bank Card'}
                        </span>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>

        {/* CHANNEL B: UPCOMING SCHEDULED BILLS & SUBSCRIPTIONS */}
        <div className="lg:col-span-5 bg-[#070707]/45 border border-zinc-900/70 p-5 rounded-[28px] shadow-sm w-full">
          <div className="flex justify-between items-center mb-5 pb-2.5 border-b border-zinc-900">
            <div>
              <h4 className="text-sm font-bold text-white font-sans">Upcoming Bills</h4>
              <p className="text-[10px] text-zinc-500">Run-rate subscription plans on monitor queue</p>
            </div>
            <button
              onClick={() => setActiveTab('inflow_outflow')}
              className="text-[10px] font-mono hover:underline text-indigo-400 uppercase font-black"
            >
              Configure Plans
            </button>
          </div>

          <div className="space-y-3">
            {!state.subscriptions || state.subscriptions.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 border border-dashed border-zinc-850 rounded-2xl bg-zinc-950/20 italic text-xs">
                No active recurring plans configured yet.
              </div>
            ) : (
              [...state.subscriptions]
                .filter(s => s.status === 'Active')
                .sort((a,b) => a.dueDate.localeCompare(b.dueDate))
                .slice(0, 4)
                .map((sub) => {
                  const billState = getSubDueDays(sub.dueDate, sub.status);

                  return (
                    <div 
                      key={sub.id}
                      className="p-3.5 bg-zinc-950 border border-zinc-900 rounded-2xl space-y-3 hover:border-zinc-850 transition-colors"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h5 className="text-xs font-bold text-white leading-tight">{sub.name}</h5>
                          <span className="text-[8px] font-mono uppercase tracking-widest text-[#8aa8bb] mt-0.5 block">
                            Billing • {sub.billingCycle}
                          </span>
                        </div>

                        <span className={`px-2 py-0.5 text-[9px] font-mono font-bold rounded-lg ${billState.style}`}>
                          {billState.label}
                        </span>
                      </div>

                      <div className="flex justify-between items-center pt-2.5 border-t border-zinc-900/60">
                        <div>
                          <span className="text-[8px] text-zinc-500 font-mono block uppercase">CYCLE DUE AMOUNT</span>
                          <span className="text-xs font-mono font-bold text-white">
                            {state.currency}{sub.amount.toLocaleString()}
                          </span>
                        </div>

                        <button 
                          onClick={() => {
                            setActiveTab('inflow_outflow');
                            // Focus or prompt will be triggered inside the subscriptions panel on inflows_outflows view
                          }}
                          className="px-2.5 py-1.5 bg-zinc-900 hover:bg-white text-zinc-400 hover:text-black border border-zinc-800 hover:border-white rounded-lg text-[9px] font-mono uppercase font-bold transition-all cursor-pointer"
                        >
                          Settle bill
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
