import React, { useState } from 'react';
import { Transaction, Income, Expense, Debt, CashAccount, BankCard } from '../types';
import { exportTransactionsToCSV, EXPENSE_COLORS, INCOME_COLORS } from '../utils';
import { 
  FileDown, Printer, BarChart3, TrendingUp, Award, Calendar, 
  DollarSign, PieChart, Landmark, Search, ChevronDown, ChevronUp, 
  Filter, CheckSquare, Sparkles, BookOpen
} from 'lucide-react';
import { IncomeVsExpenseBar, CategorySpreadAnalysis, TrendAnalysisChart } from './Charts';

interface ReportsCentreProps {
  transactions: Transaction[];
  incomes: Income[];
  expenses: Expense[];
  debts: Debt[];
  cashAccounts: CashAccount[];
  cards: BankCard[];
  currency: string;
  onSelectTransaction: (id: string) => void;
}

export default function ReportsCentre({
  transactions,
  incomes,
  expenses,
  debts,
  cashAccounts,
  cards,
  currency,
  onSelectTransaction,
}: ReportsCentreProps) {
  const [reportType, setReportType] = useState<'monthly' | 'yearly' | 'category' | 'debt'>('monthly');
  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1).padStart(2, '0'));
  const [selectedYear, setSelectedYear] = useState('2026');

  // Filter systems
  const filteredTransactions = transactions.filter(t => {
    const [year, month] = t.date.split('-');
    if (reportType === 'monthly') {
      return month === selectedMonth && year === selectedYear;
    }
    if (reportType === 'yearly') {
      return year === selectedYear;
    }
    return true; // Category and Debt are lifetime/aggregate by default
  });

  // Calculate Aggregations
  const totalIncome = filteredTransactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpense = filteredTransactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalDebtPaid = filteredTransactions
    .filter(t => t.type === 'debt_payment')
    .reduce((sum, t) => sum + t.amount, 0);

  const netSavings = totalIncome - totalExpense - totalDebtPaid;
  const savingsRate = totalIncome > 0 ? Math.round((netSavings / totalIncome) * 100) : 0;

  // Calculate Category Breakdowns
  const expensesByCategory: Record<string, number> = {};
  filteredTransactions
    .filter(t => t.type === 'expense')
    .forEach(t => {
      expensesByCategory[t.category] = (expensesByCategory[t.category] || 0) + t.amount;
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
  }).sort((a, b) => b.value - a.value);

  // Sparkline vector data from filtered list of transaction operations
  const sparklineData = React.useMemo(() => {
    if (filteredTransactions.length === 0) return [];

    const uniqueDates = Array.from(new Set(filteredTransactions.map(t => t.date.split('T')[0]))).sort();
    const last6Dates = uniqueDates.slice(-6);

    return last6Dates.map(dateStr => {
      const totalAmtOnDate = filteredTransactions
        .filter(t => t.date.split('T')[0] === dateStr)
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
      return {
        date: dateStr,
        value: totalAmtOnDate
      };
    });
  }, [filteredTransactions]);

  // Search, filter types & dates states for Reports tab Journals
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterAccount, setFilterAccount] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const filteredHistory = [...transactions]
    .filter(t => {
      const matchesSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            t.category.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesType = filterType === 'all' || t.type === filterType;
      const matchesAccount = filterAccount === 'all' || t.accountId === filterAccount;

      // Date range filtering
      const matchesStart = !startDate || t.date >= startDate;
      const matchesEnd = !endDate || t.date <= endDate;

      return matchesSearch && matchesType && matchesAccount && matchesStart && matchesEnd;
    })
    .sort((a, b) => {
      const dateCompare = b.date.localeCompare(a.date);
      if (dateCompare !== 0) return dateCompare;
      const aNum = parseInt(a.id.replace(/\D/g, ''), 10);
      const bNum = parseInt(b.id.replace(/\D/g, ''), 10);
      if (!isNaN(aNum) && !isNaN(bNum)) return bNum - aNum;
      return b.id.localeCompare(a.id);
    });

  const handleExcelExport = () => {
    exportTransactionsToCSV(transactions, currency);
  };

  const handlePrintPDF = () => {
    window.print();
  };

  return (
    <div id="reports-centre-view" className="space-y-6 animate-fade-in">
      
      {/* 1. Category Switch Header (Glassmorphic Selection Bar) */}
      <div className="grid grid-cols-4 p-1.5 bg-[#0a0a0f] border border-zinc-850 rounded-[20px] text-center" id="reports-type-selectors">
        {[
          { key: 'monthly', label: 'Monthly Report' },
          { key: 'yearly', label: 'Annual Analytics' },
          { key: 'category', label: 'Category Split' },
          { key: 'debt', label: 'Debt Ratios' },
        ].map(item => (
          <button
            key={item.key}
            onClick={() => setReportType(item.key as any)}
            className={`py-3 px-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              reportType === item.key
                ? 'bg-zinc-900 border border-zinc-800 text-white shadow-xl font-extrabold'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Period Dropdowns Filter Row */}
      {(reportType === 'monthly' || reportType === 'yearly') && (
        <div className="flex gap-3 p-2 bg-[#050510]/30 border border-zinc-900 rounded-2xl" id="period-dropdowns">
          {reportType === 'monthly' && (
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="flex-1 bg-black border border-zinc-850 hover:border-zinc-700 text-zinc-300 rounded-xl text-xs px-4 py-3 focus:outline-none transition-colors font-bold cursor-pointer"
            >
              <option value="01">January</option>
              <option value="02">February</option>
              <option value="03">March</option>
              <option value="04">April</option>
              <option value="05">May</option>
              <option value="06">June</option>
              <option value="07">July</option>
              <option value="08">August</option>
              <option value="09">September</option>
              <option value="10">October</option>
              <option value="11">November</option>
              <option value="12">December</option>
            </select>
          )}

          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="flex-1 bg-black border border-zinc-850 hover:border-zinc-700 text-zinc-300 rounded-xl text-xs px-4 py-3 focus:outline-none transition-colors font-bold cursor-pointer"
          >
            <option value="2025">Year 2025</option>
            <option value="2026">Year 2026</option>
            <option value="2027">Year 2027</option>
            <option value="2028">Year 2028</option>
          </select>
        </div>
      )}

      {/* DUAL COLUMN REPORT VIEW */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: METRICS & CHARTS */}
         <div className="lg:col-span-7 space-y-6">
          
          {/* Executive Net Savings card */}
          <div className="bg-card text-card-foreground border border-zinc-200 dark:border-zinc-850 rounded-[32px] p-6 shadow-2xl relative overflow-hidden">
            {/* Ambient lighting ring */}
            <div className="absolute top-0 right-0 p-4 text-[var(--accent-primary)]/10 pointer-events-none">
              <Award size={80} className="stroke-[1.5px] opacity-15" />
            </div>

            <span className="text-[9px] font-mono uppercase tracking-widest text-[var(--accent-primary)] dark:text-[var(--accent-primary)] font-bold block mb-1">Executive Summary</span>
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">Period Net Surplus</span>
            <h2 className="text-3xl font-extrabold text-card-foreground tracking-tight font-mono mt-1 select-all">
              {currency}{netSavings.toLocaleString()}
            </h2>
            <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
              Aggregated balance calculation of recorded inflows deducting logged settling charges and liabilities paydowns for selected dates bounds.
            </p>

            <div className="grid grid-cols-3 gap-3 mt-6 pt-5 border-t border-zinc-200 dark:border-zinc-900 text-center">
              <div className="bg-muted border border-zinc-200 dark:border-zinc-900 p-3 rounded-2xl">
                <span className="text-[8px] text-muted-foreground block uppercase font-mono font-bold">Collected</span>
                <span className="text-sm font-mono font-extrabold text-blue-600 dark:text-emerald-400 mt-0.5 block">+{currency}{totalIncome.toLocaleString()}</span>
              </div>

              <div className="bg-muted border border-zinc-200 dark:border-zinc-900 p-3 rounded-2xl">
                <span className="text-[8px] text-muted-foreground block uppercase font-mono font-bold">Settled</span>
                <span className="text-sm font-mono font-extrabold text-rose-600 dark:text-rose-400 mt-0.5 block">-{currency}{totalExpense.toLocaleString()}</span>
              </div>

              <div className="bg-muted border border-zinc-200 dark:border-zinc-900 p-3 rounded-2xl">
                <span className="text-[8px] text-muted-foreground block uppercase font-mono font-bold">Surplus Match</span>
                <span className="text-sm font-mono font-extrabold text-card-foreground mt-0.5 block">
                  {savingsRate > 0 ? `+${savingsRate}%` : `${savingsRate}%`}
                </span>
              </div>
            </div>
          </div>

          {/* Render Graphs in Premium Glass Panels */}
          {reportType !== 'debt' ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-mono pl-3.5 flex items-center gap-1.5">
                  <BarChart3 size={13} className="text-[var(--accent-primary)] dark:text-[var(--accent-primary)]" />
                  Inflows Relative to Outflows
                </h4>
                <IncomeVsExpenseBar income={totalIncome} expense={totalExpense} currency={currency} />
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-mono pl-3.5 flex items-center gap-1.5">
                  <PieChart size={13} className="text-[var(--accent-primary)] dark:text-[var(--accent-primary)]" />
                  Disbursed Categories Breakdown Range
                </h4>
                <CategorySpreadAnalysis categories={categoryChartList} />
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-mono pl-3.5 flex items-center gap-1.5">
                  <TrendingUp size={13} className="text-[var(--accent-primary)] dark:text-[var(--accent-primary)]" />
                  Repayments Velocity Tracker
                </h4>
                <TrendAnalysisChart data={sparklineData} currency={currency} />
              </div>
            </div>
          ) : (
            /* Debt Liabilities Ratio trackers */
            <div className="bg-zinc-905 bg-zinc-900/40 border border-zinc-850 rounded-[32px] p-6 space-y-4 shadow-xl">
              <div className="flex justify-between items-center pb-2 border-b border-zinc-900">
                <div>
                  <h4 className="text-sm font-bold text-white font-sans flex items-center gap-2">
                    <Landmark size={15} className="text-[var(--accent-primary)]" />
                    Passive Liabilities Ratio Track
                  </h4>
                  <span className="text-[10px] text-zinc-550 block mt-0.5 text-zinc-500 font-mono">Comparing remaining values to original principles</span>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                {debts.length === 0 ? (
                  <p className="text-zinc-500 text-xs text-center py-8 italic">No active ledger debt registered.</p>
                ) : (
                  [...debts]
                    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
                    .map(d => {
                    const paid = d.totalAmount - d.remainingAmount;
                    const ratio = Math.round((paid / d.totalAmount) * 100);

                    return (
                      <div key={d.id} className="bg-black/40 border border-zinc-900 p-4 rounded-2xl space-y-3">
                        <div className="flex justify-between text-xs font-bold text-white">
                          <span className="truncate max-w-[200px]">{d.debtSource}</span>
                          <span className="font-mono text-amber-400">{currency}{d.remainingAmount.toLocaleString()}</span>
                        </div>
                        
                        <div className="w-full bg-zinc-950 h-2 border border-zinc-900 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-amber-600 to-amber-500" style={{ width: `${ratio}%` }} />
                        </div>
                        
                        <div className="flex justify-between text-[10px] font-mono text-zinc-500 font-bold">
                          <span>Settled ratio: {ratio}%</span>
                          <span>Initial value: {currency}{d.totalAmount.toLocaleString()}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* EXPORT CONTROL MODULES */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={handleExcelExport}
              className="py-4 bg-zinc-950 border border-zinc-850 hover:border-zinc-700 text-white font-bold text-xs rounded-2xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md text-center hover:scale-[1.01]"
            >
              <FileDown size={14} className="text-[var(--accent-primary)]" />
              Export CSV Ledger
            </button>

            <button
              onClick={handlePrintPDF}
              className="py-4 bg-white text-black font-extrabold text-xs rounded-2xl flex items-center justify-center gap-2 hover:bg-zinc-200 transition-all cursor-pointer shadow-md text-center hover:scale-[1.01]"
            >
              <Printer size={14} className="text-black" />
              Generate Printout Report
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: SEARCHABLE HISTORY - UNIFIED LEDGER JOURNALS */}
         <div className="lg:col-span-5 bg-gradient-to-br from-zinc-900/90 via-[#0a0a0d] to-zinc-950 border border-zinc-850 p-6 rounded-[32px] space-y-5 shadow-2xl w-full" id="unified-audits-column">
          
          <div className="flex justify-between items-center pb-2 border-b border-zinc-900">
            <div>
              <span className="text-[9px] font-mono tracking-wider text-[var(--accent-primary)] font-bold block uppercase">LEDGER AUDIT TRACK</span>
              <p className="text-base font-extrabold text-white">Unified Journals</p>
            </div>
            <span className="text-[9.5px] font-mono bg-black px-2.5 py-1 border border-zinc-850 rounded-xl text-zinc-400 font-bold uppercase shrink-0">
              {filteredHistory.length} EVENTS
            </span>
          </div>

          {/* Search Inputs with sleek designs */}
          <div className="space-y-4">
            <div className="relative">
              <Search className="text-zinc-500 absolute left-3.5 top-[13.5px] w-4.5 h-4.5 stroke-[2px]" />
              <input
                type="text"
                placeholder="Lookup journals, categories, descriptions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-black text-xs !pl-11 !pr-4 py-3.5 rounded-xl border border-zinc-850 focus:border-zinc-700 focus:outline-none text-white font-medium transition-all"
              />
            </div>

            {/* Account & Type selectors filter layout */}
            <div className="grid grid-cols-2 gap-2 text-zinc-400 text-xs">
              <div className="space-y-1">
                <span className="text-[9px] font-mono uppercase text-zinc-500 font-extrabold pl-1">Type</span>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="w-full bg-[#050510]/50 border border-zinc-850 hover:border-zinc-700 rounded-xl text-xs px-3 py-2.5 font-bold cursor-pointer transition-colors focus:outline-none"
                >
                  <option value="all">All Inflow/Outflow</option>
                  <option value="income">Only Incomes</option>
                  <option value="expense">Only Expenses</option>
                  <option value="transfer">Only Transfers</option>
                  <option value="debt_payment">Debt Repayments</option>
                  <option value="deposit">Deposits</option>
                  <option value="withdrawal">Withdrawals</option>
                </select>
              </div>

              <div className="space-y-1">
                <span className="text-[9px] font-mono uppercase text-zinc-500 font-extrabold pl-1">Source Account</span>
                <select
                  value={filterAccount}
                  onChange={(e) => setFilterAccount(e.target.value)}
                  className="w-full bg-[#050510]/50 border border-zinc-850 hover:border-zinc-700 rounded-xl text-xs px-3 py-2.5 font-bold cursor-pointer transition-colors focus:outline-none"
                >
                  <option value="all">All Wallets/Cards</option>
                  {cashAccounts.map(c => (
                    <option key={c.id} value={c.id}>Cash: {c.name}</option>
                  ))}
                  {cards.filter(c => !c.isCanceled).map(card => (
                    <option key={card.id} value={card.id}>Card: {card.cardName}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Calendar bound parameters */}
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <div className="flex flex-col gap-1.5">
                <span className="text-[9px] text-[#888888] font-bold uppercase block pl-1 font-mono tracking-wider">Start Bound</span>
                <div className="relative flex items-center">
                  <Calendar size={13} className="text-amber-500 absolute left-3 pointer-events-none" />
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    onClick={(e) => {
                      try {
                        e.currentTarget.showPicker();
                      } catch (err) {}
                    }}
                    className="w-full bg-black border border-zinc-850 hover:border-zinc-700 text-zinc-300 rounded-xl text-xs !pl-9 !pr-2.5 py-3 focus:outline-none focus:border-amber-500/40 cursor-pointer text-left font-mono scheme-dark"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-[9px] text-[#888888] font-bold uppercase block pl-1 font-mono tracking-wider">End Bound</span>
                <div className="relative flex items-center">
                  <Calendar size={13} className="text-amber-500 absolute left-3 pointer-events-none" />
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    onClick={(e) => {
                      try {
                        e.currentTarget.showPicker();
                      } catch (err) {}
                    }}
                    className="w-full bg-black border border-zinc-850 hover:border-zinc-700 text-zinc-300 rounded-xl text-xs !pl-9 !pr-2.5 py-3 focus:outline-none focus:border-amber-500/40 cursor-pointer text-left font-mono scheme-dark"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end items-center pt-1">
              {(startDate || endDate) && (
                <button
                  onClick={() => {
                    setStartDate('');
                    setEndDate('');
                  }}
                  className="text-[10px] font-mono text-rose-450 text-rose-400 hover:underline cursor-pointer font-bold"
                >
                  Reset Bound Ranges
                </button>
              )}
            </div>
          </div>

          {/* List display */}
          <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }} id="filtered-list">
            {filteredHistory.length === 0 ? (
              <div className="py-12 text-center text-zinc-500 text-xs italic border border-dashed border-zinc-850 rounded-2xl bg-zinc-955 bg-[#050505]/40 animate-pulse">
                No archived journal entries matched this query.
              </div>
            ) : (
              filteredHistory.map((t) => {
                const isInc = t.type === 'income' || t.type === 'deposit' || (t.type === 'transfer' && (t.category === 'Transfer In' || t.amount > 0));
                const absAmount = Math.abs(t.amount);

                // Fetch the name of this specific account for context
                const getAccountLabel = (accId?: string, accType?: string) => {
                  if (!accId || !accType) return '';
                  if (accType === 'cash') {
                    return cashAccounts.find(c => c.id === accId)?.name || 'Cash';
                  }
                  return cards.find(c => c.id === accId)?.cardName || 'Card';
                };

                const accountLabel = getAccountLabel(t.accountId, t.accountType);

                return (
                  <div 
                    key={t.id} 
                    id={`reports-audit-card-${t.id}`} 
                    className="p-3.5 bg-black/55 hover:bg-zinc-950/90 border border-zinc-900 hover:border-zinc-800 rounded-2xl space-y-2 hover:scale-[1.002] transition-all duration-200 cursor-pointer group"
                    onClick={() => onSelectTransaction(t.id)}
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-[8px] font-mono tracking-widest text-[#a1a1a9] font-black uppercase bg-zinc-950 px-2.5 py-0.5 rounded-full border border-zinc-900">
                        {t.type}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-550 text-zinc-500 font-semibold">
                        {t.date}
                      </span>
                    </div>

                    <div className="flex justify-between items-center gap-2.5">
                       <div className="flex items-center gap-2 min-w-0 max-w-[190px]">
                         <h4 className="text-xs font-bold text-white truncate font-sans">{t.title}</h4>
                         <span className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)] text-[var(--accent-primary)] text-[8px] px-1.5 py-0.5 rounded-md font-bold shrink-0">VIEW</span>
                       </div>
                      <span className={`text-xs font-mono font-black shrink-0 ${isInc ? 'text-emerald-450 text-emerald-400' : 'text-rose-455 text-rose-400'}`}>
                        {isInc ? '+' : '-'}{currency}{absAmount.toLocaleString()}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-[10px] text-zinc-500 pt-2 border-t border-zinc-900">
                      <span className="font-semibold truncate max-w-[130px] font-mono text-zinc-400">{t.category}</span>
                      <span className="font-mono text-[9px] text-zinc-500 shrink-0 select-none uppercase font-bold">
                        {accountLabel ? `${accountLabel}` : 'Vault Ledger'}
                      </span>
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
