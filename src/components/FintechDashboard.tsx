import React from 'react';
import { AppState } from '../types';
import { Bell, Plus, Send, ArrowUpRight, ArrowDownLeft, CreditCard, MoreHorizontal, Home, Wallet, PieChart } from 'lucide-react';

interface FintechDashboardProps {
  state: AppState;
  aggregateActiveWealth: number;
  totalCashAmount: number;
  totalDebitCardsAmount: number;
  totalCreditCardsAmount: number;
  totalDebtsAmount: number;
  currentMonthLabel: string;
  currentMonthInflow: number;
  currentMonthOutflow: number;
  setActiveTab: (tab: any) => void;
  setEditingTransactionId: (id: string | null) => void;
  onProfileClick: () => void;
  onNotificationClick: () => void;
}

export default function FintechDashboard({ 
  state, aggregateActiveWealth, totalCashAmount, totalDebitCardsAmount, totalCreditCardsAmount, totalDebtsAmount, currentMonthLabel, currentMonthInflow, currentMonthOutflow, setActiveTab, setEditingTransactionId, onProfileClick, onNotificationClick 
}: FintechDashboardProps) {

  const unreadCount = state.notifications ? state.notifications.filter(n => !n.read).length : 0;

  return (
    <div className="flex flex-col h-full bg-black text-zinc-100 p-4 sm:p-6 sm:pt-10 font-sans animation-fade-in">
      {/* Header */}
      <div className="flex justify-between items-center mb-6 sm:mb-8">
        <div className="min-w-0 pr-3">
          <h1 className="text-xl sm:text-2xl font-bold truncate max-w-[180px] sm:max-w-none">Hello {state.userProfile.name}!</h1>
          <p className="text-zinc-500 text-xs sm:text-sm truncate">Let's check your finances.</p>
        </div>
        <div className="flex items-center shrink-0">
          <button 
            onClick={onNotificationClick}
            className="p-2 sm:p-3 bg-zinc-900 border border-zinc-800 rounded-full text-zinc-300 hover:text-white hover:border-zinc-500 relative cursor-pointer shadow-md transition-all flex items-center justify-center shrink-0"
            title="Notifications"
            id="dashboard-bell-trigger"
          >
            <Bell size={15} />
            {unreadCount > 0 && (
              <span className="absolute top-0 right-0 w-2 h-2 bg-emerald-400 border-2 border-zinc-900 rounded-full animate-pulse" />
            )}
          </button>
        </div>
      </div>

      {/* Hero Card */}
      <div className="relative w-full h-44 sm:h-52 bg-zinc-900 border border-zinc-850 rounded-3xl mb-8 shadow-2xl flex flex-col justify-between">
        <div className="absolute -inset-y-1.5 -inset-x-0.5 sm:-inset-y-2.5 sm:-inset-x-1 bg-zinc-800/40 rounded-3xl -z-10 transform translate-y-2.5" />
        <div className="w-full h-full bg-gradient-to-br from-purple-600 to-indigo-700 rounded-3xl p-5 sm:p-6 shadow-2xl border border-white/10 flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <span className="text-zinc-200 text-xs sm:text-sm">Active Wallet Portfolio</span>
            <span className="text-[10px] sm:text-xs font-mono tracking-widest text-zinc-300">SECURE VAULT</span>
          </div>
          <div>
            <span className="text-[10px] sm:text-xs text-purple-200 uppercase tracking-wider block mb-1 font-semibold">Total Liquid Assets</span>
            <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-baseline gap-1 break-all truncate">
              <span>{state.currency}{aggregateActiveWealth.toLocaleString()}</span>
              <span className="text-xs sm:text-sm text-purple-200 font-mono font-medium">.00</span>
            </div>
          </div>
          <div className="flex justify-between items-center border-t border-white/10 pt-3 mt-1 min-w-0">
            <div className="min-w-0 pr-2">
              <p className="text-[9px] text-purple-200 uppercase tracking-wider">Account holder</p>
              <p className="font-semibold text-white text-xs sm:text-sm truncate">{state.userProfile.name}</p>
            </div>
            <button 
              onClick={() => setActiveTab('accounts')} 
              className="bg-white/20 p-2 sm:p-2.5 rounded-xl hover:bg-white/35 transition-all text-white hover:scale-105 shrink-0"
              title="Manage Wallets"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 mb-6">
          <div className="bg-zinc-900/60 p-3 sm:p-3.5 rounded-2xl border border-zinc-850 flex items-center justify-between sm:flex-col sm:items-start sm:justify-center gap-1">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider block font-medium">Liquid Assets</p>
            <p className="text-emerald-400 text-xs sm:text-sm font-bold font-mono">+{state.currency}{(totalCashAmount + totalDebitCardsAmount).toLocaleString()}</p>
          </div>
          <div className="bg-zinc-900/60 p-3 sm:p-3.5 rounded-2xl border border-zinc-850 flex items-center justify-between sm:flex-col sm:items-start sm:justify-center gap-1">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider block font-medium">Card Owed</p>
            <p className="text-amber-500 text-xs sm:text-sm font-bold font-mono">-{state.currency}{totalCreditCardsAmount.toLocaleString()}</p>
          </div>
          <div className="bg-zinc-900/60 p-3 sm:p-3.5 rounded-2xl border border-zinc-850 flex items-center justify-between sm:flex-col sm:items-start sm:justify-center gap-1">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider block font-medium">Loan Owed</p>
            <p className="text-red-400 text-xs sm:text-sm font-bold font-mono">-{state.currency}{totalDebtsAmount.toLocaleString()}</p>
          </div>
      </div>
      
      {/* Cash Flow Quick Bar overview */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-zinc-900/40 border border-zinc-850 p-3 sm:p-4 rounded-[20px] flex items-center justify-between shadow-sm">
          <div className="min-w-0">
            <span className="text-[9px] text-zinc-500 font-bold uppercase block font-mono tracking-wider">{currentMonthLabel} Received</span>
            <span className="text-xs sm:text-sm font-bold text-emerald-400 font-mono">+{state.currency}{currentMonthInflow.toLocaleString()}</span>
          </div>
        </div>

        <div className="bg-zinc-900/40 border border-zinc-850 p-3 sm:p-4 rounded-[20px] flex items-center justify-between shadow-sm">
          <div className="min-w-0">
            <span className="text-[9px] text-zinc-500 font-bold uppercase block font-mono tracking-wider">{currentMonthLabel} Paid</span>
            <span className="text-xs sm:text-sm font-bold text-rose-400 font-mono">-{state.currency}{currentMonthOutflow.toLocaleString()}</span>
          </div>
        </div>
      </div>
      
      {/* Active Debts */}
      <div className="p-3.5 sm:p-4 bg-zinc-900/50 border border-zinc-850 rounded-[20px] flex justify-between items-center shadow-sm mb-6 sm:mb-8">
        <span className="text-[11px] sm:text-xs text-zinc-400 font-semibold font-mono">Active Debts Balance</span>
        <span className="text-xs sm:text-sm font-bold font-mono text-white">
          {state.currency} {totalDebtsAmount.toLocaleString()}
        </span>
      </div>

      {/* Recent Transactions */}
      <div className="flex-1 w-full min-w-0">
        <h4 className="text-xs sm:text-sm font-semibold text-zinc-400 mb-4 px-1">Recent Transactions</h4>
        <div className="space-y-3">
          {[...state.transactions]
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 4)
            .map((t) => {
            const isIncome = t.type === 'income' || t.type === 'deposit';
            const absAmount = Math.abs(t.amount);
            return (
              <div 
                key={t.id} 
                onClick={() => setEditingTransactionId(t.id)}
                className="p-3 sm:p-4 bg-zinc-900 border border-zinc-800 rounded-2xl flex justify-between items-center cursor-pointer hover:border-indigo-500 transition-all w-full min-w-0 gap-3"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className={`p-2.5 rounded-xl shrink-0 ${isIncome ? 'bg-emerald-900/20 text-emerald-400' : 'bg-rose-900/20 text-rose-400'}`}>
                    {isIncome ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h5 className="text-xs sm:text-sm font-semibold text-white truncate max-w-full leading-tight">{t.title}</h5>
                    <p className="text-[9px] sm:text-xs text-zinc-500 font-mono mt-0.5">{t.date}</p>
                  </div>
                </div>
                <span className={`text-xs sm:text-sm font-extrabold font-mono shrink-0 pl-1 ${isIncome ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isIncome ? '+' : '-'}{state.currency}{absAmount.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
