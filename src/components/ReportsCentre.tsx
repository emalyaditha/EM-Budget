import React, { useState } from 'react';
import { Transaction, Income, Expense, Debt, CashAccount, BankCard } from '../types';
import { exportTransactionsToCSV, EXPENSE_COLORS, INCOME_COLORS } from '../utils';
import { FileDown, Printer, BarChart3, TrendingUp, Award, Calendar, DollarSign, PieChart, Landmark, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { IncomeVsExpenseBar, SpendingByCategoryPie, TrendAnalysisChart } from './Charts';

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

  // Sparkline vector data from filtered list
  const sparklineData = filteredTransactions.length > 0 
    ? filteredTransactions.slice(-6).map(t => t.amount)
    : [10000, 15000, 12000, 19000, 25000, 22000]; // fallback

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
    <div id="reports-centre-view" className="space-y-6">
      
      {/* 1. Category Switch Header */}
      <div className="grid grid-cols-4 p-1.5 bg-[#050505] border border-zinc-850 rounded-2xl text-center" id="reports-type-selectors">
        {[
          { key: 'monthly', label: 'Monthly' },
          { key: 'yearly', label: 'Annual' },
          { key: 'category', label: 'Split' },
          { key: 'debt', label: 'Credits' },
        ].map(item => (
          <button
            key={item.key}
            onClick={() => setReportType(item.key as any)}
            className={`py-2 px-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              reportType === item.key
                ? 'bg-zinc-800 border border-zinc-700 text-white shadow-md'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Period Dropdowns */}
      {(reportType === 'monthly' || reportType === 'yearly') && (
        <div className="flex gap-2 p-1.5 bg-[#050505] border border-zinc-850 rounded-2xl" id="period-dropdowns">
          {reportType === 'monthly' && (
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="flex-1 bg-[#050505] border border-zinc-800 text-zinc-300 rounded-xl text-xs px-3 py-2.5 focus:outline-none focus:border-zinc-500 font-semibold"
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
            className="flex-1 bg-[#050505] border border-zinc-800 text-zinc-300 rounded-xl text-xs px-3 py-2.5 focus:outline-none focus:border-zinc-500 font-semibold"
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
          {/* 2. Primary Metrics Block */}
          <div className="bg-zinc-900/50 border border-zinc-850 rounded-[28px] p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 text-zinc-900/40 pointer-events-none">
              <Award size={64} className="opacity-15" />
            </div>

            <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 font-bold">Total Net savings</span>
            <h2 className="text-xl font-extrabold text-white mt-1">
              {currency} {netSavings.toLocaleString()}
            </h2>
            <p className="text-[10px] text-zinc-400 mt-1 leading-relaxed">
              Aggregated calculation of total inflows deducting outstanding invoices paid out as passive charges.
            </p>

            <div className="grid grid-cols-3 gap-2.5 mt-4 pt-4 border-t border-zinc-800/80 text-center">
              <div className="bg-[#050505]/60 border border-zinc-800 p-2.5 rounded-xl">
                <span className="text-[9px] text-zinc-500 block uppercase font-mono font-bold">Collected</span>
                <span className="text-xs font-mono font-extrabold text-emerald-400">+{currency} {totalIncome.toLocaleString()}</span>
              </div>

              <div className="bg-[#050505]/60 border border-zinc-800 p-2.5 rounded-xl">
                <span className="text-[9px] text-zinc-500 block uppercase font-mono font-bold">Settled</span>
                <span className="text-xs font-mono font-extrabold text-rose-400">-{currency} {totalExpense.toLocaleString()}</span>
              </div>

              <div className="bg-[#050505]/60 border border-zinc-800 p-2.5 rounded-xl">
                <span className="text-[9px] text-zinc-500 block uppercase font-mono font-bold">Savings %</span>
                <span className="text-xs font-mono font-extrabold text-white">
                  {savingsRate > 0 ? `+${savingsRate}%` : `${savingsRate}%`}
                </span>
              </div>
            </div>
          </div>

          {/* 3. CHARTS INTERFACES */}
          {reportType !== 'debt' ? (
            <div className="space-y-5">
              <IncomeVsExpenseBar income={totalIncome} expense={totalExpense} currency={currency} />
              <SpendingByCategoryPie categories={categoryChartList} />
              <TrendAnalysisChart data={sparklineData} currency={currency} />
            </div>
          ) : (
            /* Debt / Credit outstanding track list */
            <div className="bg-zinc-900/50 border border-zinc-850 rounded-[28px] p-6 space-y-4 shadow-xl">
              <div className="flex justify-between items-center">
                <h4 className="text-sm font-bold text-white font-sans">Passive Liabilities Breakdown</h4>
                <span className="text-[9px] text-[#8aa8bb] font-mono uppercase tracking-wider font-bold">By principal</span>
              </div>

              <div className="space-y-2">
                {debts.length === 0 ? (
                  <p className="text-zinc-500 text-xs text-center py-6 italic">No credit debt on record.</p>
                ) : (
                  debts.map(d => {
                    const paid = d.totalAmount - d.remainingAmount;
                    const ratio = Math.round((paid / d.totalAmount) * 100);

                    return (
                      <div key={d.id} className="bg-[#050505]/60 border border-zinc-800 p-3.5 rounded-xl space-y-2.5">
                        <div className="flex justify-between text-xs font-semibold text-white">
                          <span>{d.debtSource}</span>
                          <span className="font-mono font-bold text-amber-400">{currency} {d.remainingAmount.toLocaleString()}</span>
                        </div>
                        <div className="w-full bg-[#050505] h-1.5 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-500" style={{ width: `${ratio}%` }} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* 4. EXPORT UTILITIES TRIPLE BUTTON */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={handleExcelExport}
              className="py-3.5 bg-[#050505] border border-zinc-800 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 hover:bg-neutral-900 hover:border-zinc-500 transition-all cursor-pointer shadow-sm text-center"
            >
              <FileDown size={14} className="text-zinc-400" />
              Export CSV
            </button>

            <button
              onClick={handlePrintPDF}
              className="py-3.5 bg-white text-black font-bold text-xs rounded-xl flex items-center justify-center gap-2 hover:bg-zinc-200 transition-all cursor-pointer shadow-sm text-center"
            >
              <Printer size={14} className="text-black" />
              Print PDF
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: SEARCHABLE HISTORY - UNIFIED LEDGER JOURNALS */}
        <div className="lg:col-span-5 bg-zinc-900/50 border border-zinc-850 p-6 rounded-[28px] space-y-5 shadow-xl w-full" id="unified-audits-column">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-xs text-zinc-500 font-bold uppercase tracking-wider">Searchable History</h3>
              <p className="text-sm font-extrabold text-white font-sans text-white">Unified Ledger Journals</p>
            </div>
            <span className="text-[10px] font-mono bg-[#050505] px-2 py-0.5 border border-zinc-800 rounded text-zinc-400 font-bold uppercase shrink-0">
              {filteredHistory.length} EVENTS
            </span>
          </div>

          {/* Search Inputs */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="text-zinc-500 absolute left-3.5 top-[11px] w-3.5 h-3.5" />
              <input
                type="text"
                placeholder="Search description, categories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#050505] text-xs px-9 py-2.5 rounded-xl border border-zinc-800 focus:outline-none focus:border-zinc-650 text-white font-medium"
              />
            </div>

            {/* Account & Type select pickers */}
            <div className="grid grid-cols-2 gap-2 font-sans font-medium">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="bg-[#050505] border border-zinc-800 rounded-lg text-xs px-1.5 py-1.5 text-zinc-300 focus:outline-none cursor-pointer text-center"
              >
                <option value="all">Any Inflow/Outflow</option>
                <option value="income">Only Income</option>
                <option value="expense">Only Expense</option>
                <option value="transfer">Only Transfers</option>
                <option value="debt_payment">Debt Repayment</option>
                <option value="deposit">Deposits</option>
                <option value="withdrawal">Withdrawals</option>
              </select>

              <select
                value={filterAccount}
                onChange={(e) => setFilterAccount(e.target.value)}
                className="bg-[#050505] border border-zinc-800 rounded-lg text-xs px-1.5 py-1.5 text-zinc-300 focus:outline-none cursor-pointer text-center"
              >
                <option value="all">Any Wallet/Card</option>
                {cashAccounts.map(c => (
                  <option key={c.id} value={c.id}>Cash: {c.name}</option>
                ))}
                {cards.filter(c => !c.isCanceled).map(card => (
                  <option key={card.id} value={card.id}>Card: {card.cardName}</option>
                ))}
              </select>
            </div>

            {/* Calendar inputs with instant showPicker support */}
            <div className="grid grid-cols-2 gap-2 pt-1 font-sans">
              <div className="flex flex-col gap-1">
                <span className="text-[9px] text-zinc-400 font-bold uppercase block pl-1 font-mono">Start Date</span>
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
                    className="w-full bg-[#050505] border border-zinc-850 text-zinc-200 rounded-xl text-xs pl-8 pr-2.5 py-2 focus:outline-none focus:border-amber-500/50 cursor-pointer text-left font-mono scheme-dark"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[9px] text-zinc-400 font-bold uppercase block pl-1 font-mono">End Date</span>
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
                    className="w-full bg-[#050505] border border-zinc-850 text-zinc-200 rounded-xl text-xs pl-8 pr-2.5 py-2 focus:outline-none focus:border-amber-500/50 cursor-pointer text-left font-mono scheme-dark"
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
                  className="text-[9px] font-mono text-zinc-400 hover:text-rose-400 hover:underline cursor-pointer"
                >
                  Clear Date Filters
                </button>
              )}
            </div>
          </div>

          {/* List display */}
          <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }} id="filtered-list">
            {filteredHistory.length === 0 ? (
              <div className="py-12 text-center text-zinc-550 text-zinc-500 text-xs italic border border-dashed border-zinc-800 rounded-2xl bg-[#050505]/40 animate-pulse">
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
                    className="p-3.5 bg-[#050505]/60 hover:bg-[#050505]/95 border border-zinc-850 hover:border-zinc-700/85 rounded-2xl space-y-1.5 hover:scale-[1.005] transition-all duration-200 cursor-pointer group"
                    onClick={() => onSelectTransaction(t.id)}
                  >
                    <div className="flex justify-between items-start">
                      <span className="text-[9px] font-mono tracking-widest text-[#8aa8bb] font-bold uppercase bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-900">
                        {t.type}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-500">
                        {t.date}
                      </span>
                    </div>

                    <div className="flex justify-between items-center gap-2">
                       <div className="flex items-center gap-2 max-w-[170px]">
                         <h4 className="text-xs font-semibold text-white truncate font-sans">{t.title}</h4>
                         <span className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center bg-zinc-800 text-white text-[8px] px-1 py-0.5 rounded font-black shrink-0">EDIT</span>
                       </div>
                      <span className={`text-xs font-mono font-bold shrink-0 ${isInc ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isInc ? '+' : '-'}{currency}{absAmount.toLocaleString()}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-[10px] text-zinc-500 pt-1.5 border-t border-zinc-800/40">
                      <span className="font-semibold truncate max-w-[125px]">{t.category}</span>
                      <span className="font-mono text-zinc-500 shrink-0 select-none">
                        {accountLabel ? `${accountLabel}` : 'System Ledger'}
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
