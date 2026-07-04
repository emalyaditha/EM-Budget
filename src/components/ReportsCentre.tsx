import React, { useState } from 'react';
import { Transaction, Income, Expense, Debt, CashAccount, BankCard, LoanGiven } from '../types';
import { exportTransactionsToCSV, EXPENSE_COLORS, INCOME_COLORS } from '../utils';
import { 
  FileDown, Printer, BarChart3, TrendingUp, Award, Calendar, 
  DollarSign, PieChart, Landmark, Search, ChevronDown, ChevronUp, 
  Filter, CheckSquare, Sparkles, BookOpen, ArrowUpRight, ArrowDownLeft,
  Wallet, PiggyBank, Percent, AlertCircle, Download, ExternalLink, X
} from 'lucide-react';
import { IncomeVsExpenseBar, CategorySpreadAnalysis, TrendAnalysisChart } from './Charts';
import { DatePicker } from './DatePicker';

interface ReportsCentreProps {
  transactions: Transaction[];
  incomes: Income[];
  expenses: Expense[];
  debts: Debt[];
  loansGiven: LoanGiven[];
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
  loansGiven,
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
    return true;
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

  const settlementTransactions: Transaction[] = loansGiven.flatMap(l => l.settlements.map(s => ({
    id: s.id,
    type: 'income',
    title: `Loan Settle: ${l.borrowerName}`,
    amount: s.amount,
    date: s.date,
    category: 'Loan Settle',
    accountId: s.receivedInId,
    accountType: s.receivedInType,
    referenceId: l.id
  })));

  const allTransactions = [...transactions, ...settlementTransactions];

  const filteredHistory = allTransactions
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

  const reportTabs = [
    { key: 'monthly', label: 'Monthly', icon: <Calendar size={13} /> },
    { key: 'yearly', label: 'Annual', icon: <BarChart3 size={13} /> },
    { key: 'category', label: 'Categories', icon: <PieChart size={13} /> },
    { key: 'debt', label: 'Debt Ratios', icon: <Landmark size={13} /> },
  ] as const;

  const isDebtView = reportType === 'debt';
  const showPeriodFilters = reportType === 'monthly' || reportType === 'yearly';

  return (
    <div id="reports-centre-view" className="space-y-5 animate-brand-fade-up">

      {/* ===== HEADER ===== */}
      <div className="flex flex-col sm:flex-row sm:items-start lg:items-center justify-between gap-3">
        <div className="shrink-0">
          <h1 className="text-xl font-display font-extrabold text-[var(--text-primary)] tracking-tight">
            Reports Centre
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Financial analytics and transaction audit trail
          </p>
        </div>

        <div className="flex flex-col xs:flex-row items-stretch xs:items-center gap-2 w-full sm:w-auto">
          {showPeriodFilters && (
            <div className="flex items-center gap-2">
              {reportType === 'monthly' && (
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="form-select !w-auto !text-xs !py-2 !px-3"
                  aria-label="Select month"
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
                className="form-select !w-auto !text-xs !py-2 !px-3"
                aria-label="Select year"
              >
                <option value="2025">2025</option>
                <option value="2026">2026</option>
                <option value="2027">2027</option>
                <option value="2028">2028</option>
              </select>
            </div>
          )}

          <div className="segmented-tabs overflow-x-auto" id="reports-type-selectors" style={{ scrollbarWidth: 'none' }}>
            {reportTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setReportType(tab.key as any)}
                className={`segmented-tab whitespace-nowrap ${reportType === tab.key ? 'active' : ''}`}
                aria-current={reportType === tab.key ? 'page' : undefined}
              >
                <span className="flex items-center gap-1.5">
                  {tab.icon}
                  {tab.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ===== KPI ROW ===== */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="card-base p-4">
          <div className="flex items-start justify-between mb-2">
            <span className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Net Savings
            </span>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'color-mix(in srgb, var(--success) 12%, transparent)' }}>
              <PiggyBank size={14} style={{ color: 'var(--success)' }} />
            </div>
          </div>
          <p className="text-sm sm:text-base lg:text-lg font-mono font-extrabold text-[var(--text-primary)] leading-none truncate">
            {currency}{netSavings.toLocaleString()}
          </p>
          <p className="text-[10px] text-[var(--text-muted)] mt-1">
            Income − Expenses − Debt
          </p>
        </div>

        <div className="card-base p-4">
          <div className="flex items-start justify-between mb-2">
            <span className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Income
            </span>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'color-mix(in srgb, var(--success) 12%, transparent)' }}>
              <ArrowUpRight size={14} style={{ color: 'var(--success)' }} />
            </div>
          </div>
          <p className="text-sm sm:text-base lg:text-lg font-mono font-extrabold truncate" style={{ color: 'var(--success)' }}>
            +{currency}{totalIncome.toLocaleString()}
          </p>
          <p className="text-[10px] text-[var(--text-muted)] mt-1">
            Total inflows
          </p>
        </div>

        <div className="card-base p-4">
          <div className="flex items-start justify-between mb-2">
            <span className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Expenses
            </span>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'color-mix(in srgb, var(--danger) 12%, transparent)' }}>
              <ArrowDownLeft size={14} style={{ color: 'var(--danger)' }} />
            </div>
          </div>
          <p className="text-sm sm:text-base lg:text-lg font-mono font-extrabold truncate" style={{ color: 'var(--danger)' }}>
            -{currency}{totalExpense.toLocaleString()}
          </p>
          <p className="text-[10px] text-[var(--text-muted)] mt-1">
            Total outflows
          </p>
        </div>

        <div className="card-base p-4">
          <div className="flex items-start justify-between mb-2">
            <span className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Savings Rate
            </span>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'color-mix(in srgb, color-mix(in srgb, var(--success) 50%, var(--warning) 50%) 12%, transparent)' }}>
              <Percent size={14} style={{ color: netSavings >= 0 ? 'var(--success)' : 'var(--danger)' }} />
            </div>
          </div>
          <p className={`text-sm sm:text-base lg:text-lg font-mono font-extrabold leading-none truncate ${netSavings >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
            {savingsRate > 0 ? `+${savingsRate}%` : `${savingsRate}%`}
          </p>
          <p className="text-[10px] text-[var(--text-muted)] mt-1">
            Net / Total Income
          </p>
        </div>

        <div className="card-base p-4">
          <div className="flex items-start justify-between mb-2">
            <span className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Debt Paid
            </span>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'color-mix(in srgb, var(--warning) 12%, transparent)' }}>
              <AlertCircle size={14} style={{ color: 'var(--warning)' }} />
            </div>
          </div>
          <p className="text-sm sm:text-base lg:text-lg font-mono font-extrabold truncate" style={{ color: 'var(--warning)' }}>
            {currency}{totalDebtPaid.toLocaleString()}
          </p>
          <p className="text-[10px] text-[var(--text-muted)] mt-1">
            Liability payments
          </p>
        </div>
      </div>

      {/* ===== MAIN CONTENT ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">

        {/* ===== LEFT: Charts / Debt ===== */}
        <div className="lg:col-span-7 space-y-5">

          {!isDebtView ? (
            <>
              <div className="card-base p-5">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 size={14} style={{ color: 'var(--success)' }} />
                  <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                    Income vs Expenses
                  </h3>
                </div>
                <IncomeVsExpenseBar income={totalIncome} expense={totalExpense} currency={currency} />
              </div>

              <div className="card-base p-5">
                <div className="flex items-center gap-2 mb-4">
                  <PieChart size={14} style={{ color: 'var(--accent-primary)' }} />
                  <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                    Expense Category Breakdown
                  </h3>
                </div>
                <CategorySpreadAnalysis categories={categoryChartList} />
              </div>

              <div className="card-base p-5">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp size={14} style={{ color: 'var(--accent-primary)' }} />
                  <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                    Transaction Activity Trend
                  </h3>
                </div>
                <TrendAnalysisChart data={sparklineData} currency={currency} />
              </div>
            </>
          ) : (
            <div className="card-base p-5">
              <div className="flex items-center gap-2 mb-5 pb-3 border-b" style={{ borderColor: 'var(--border-primary)' }}>
                <Landmark size={14} style={{ color: 'var(--accent-primary)' }} />
                <div>
                  <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                    Liability Settlement Progress
                  </h3>
                  <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">
                    Remaining vs original principal amounts
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {debts.length === 0 ? (
                  <div className="py-12 text-center text-[var(--text-muted)] text-xs italic card-surface p-6">
                    No active debts registered.
                  </div>
                ) : (
                  [...debts]
                    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
                    .map(d => {
                    const paid = d.totalAmount - d.remainingAmount;
                    const ratio = Math.round((paid / d.totalAmount) * 100);

                    return (
                      <div
                        key={d.id}
                        className="card-surface p-4 space-y-3"
                        data-debt-status={d.remainingAmount <= 0 ? 'paid' : 'outstanding'}
                      >
                        <div className="flex justify-between items-center">
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-[var(--text-primary)] truncate block">
                              {d.debtSource}
                            </span>
                            <span className="text-[10px] text-[var(--text-secondary)] font-mono">
                              Due {d.dueDate}
                            </span>
                          </div>
                          <span className="text-sm font-mono font-extrabold shrink-0 ml-3" style={{ color: 'var(--warning)' }}>
                            {currency}{d.remainingAmount.toLocaleString()}
                          </span>
                        </div>

                        <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${ratio}%`,
                              background: ratio >= 100
                                ? 'var(--success)'
                                : ratio >= 50
                                  ? 'linear-gradient(90deg, var(--warning), var(--success))'
                                  : 'linear-gradient(90deg, var(--danger), var(--warning))'
                            }}
                          />
                        </div>

                        <div className="flex justify-between text-[10px] font-mono text-[var(--text-muted)]">
                          <span>{ratio}% settled</span>
                          <span>Total: {currency}{d.totalAmount.toLocaleString()}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Export actions */}
          <div className="flex gap-3">
            <button
              onClick={handleExcelExport}
              className="btn-secondary flex-1"
            >
              <FileDown size={14} />
              Export CSV
            </button>
            <button
              onClick={handlePrintPDF}
              className="btn-primary flex-1"
            >
              <Printer size={14} />
              Print Report
            </button>
          </div>
        </div>

        {/* ===== RIGHT: Ledger History ===== */}
        <div className="lg:col-span-5 card-base flex flex-col" style={{ maxHeight: 'clamp(400px, calc(100vh - 260px), 800px)' }}>
          <div className="p-5 border-b shrink-0" style={{ borderColor: 'var(--border-primary)' }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-[9px] font-mono font-bold tracking-widest uppercase" style={{ color: 'var(--accent-primary)' }}>
                  Audit Trail
                </span>
                <h3 className="text-sm font-bold text-[var(--text-primary)] mt-0.5">
                  Unified Ledger
                </h3>
              </div>
              <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-lg" style={{
                backgroundColor: 'color-mix(in srgb, var(--accent-primary) 10%, transparent)',
                color: 'var(--accent-primary)',
              }}>
                {filteredHistory.length} entries
              </span>
            </div>

            {/* Search */}
            <div className="relative mb-3">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search transactions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="form-input !pl-9 !text-xs"
                aria-label="Search transactions"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                  aria-label="Clear search"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Filters */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <span className="form-label !text-[9px] !mb-1">Type</span>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="form-select !text-xs !py-2"
                  aria-label="Filter by type"
                >
                  <option value="all">All Types</option>
                  <option value="income">Income</option>
                  <option value="financing">Financing</option>
                  <option value="expense">Expense</option>
                  <option value="transfer">Transfer</option>
                  <option value="debt_payment">Debt Payment</option>
                  <option value="deposit">Deposit</option>
                  <option value="withdrawal">Withdrawal</option>
                </select>
              </div>
              <div>
                <span className="form-label !text-[9px] !mb-1">Account</span>
                <select
                  value={filterAccount}
                  onChange={(e) => setFilterAccount(e.target.value)}
                  className="form-select !text-xs !py-2"
                  aria-label="Filter by account"
                >
                  <option value="all">All Accounts</option>
                  {cashAccounts.map(c => (
                    <option key={c.id} value={c.id}>Cash: {c.name}</option>
                  ))}
                  {cards.filter(c => !c.isCanceled).map(card => (
                    <option key={card.id} value={card.id}>Card: {card.cardName}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Date range */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="form-label !text-[9px] !mb-1">From</span>
                <DatePicker value={startDate} onChange={setStartDate} />
              </div>
              <div>
                <span className="form-label !text-[9px] !mb-1">To</span>
                <DatePicker value={endDate} onChange={setEndDate} />
              </div>
            </div>

            {(startDate || endDate) && (
              <button
                onClick={() => { setStartDate(''); setEndDate(''); }}
                className="text-[10px] font-medium mt-2 hover:underline cursor-pointer"
                style={{ color: 'var(--accent-primary)' }}
              >
                Clear date range
              </button>
            )}
          </div>

          {/* Transaction list */}
          <div className="flex-1 overflow-y-auto p-2" style={{ scrollbarWidth: 'thin' }}>
            {filteredHistory.length === 0 ? (
              <div className="py-12 text-center">
                <div className="w-12 h-12 mx-auto mb-3 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'color-mix(in srgb, var(--text-muted) 8%, transparent)' }}>
                  <Search size={18} style={{ color: 'var(--text-muted)' }} />
                </div>
                <p className="text-xs text-[var(--text-muted)]">No entries match your filters</p>
                <button
                  onClick={() => { setSearchQuery(''); setFilterType('all'); setFilterAccount('all'); setStartDate(''); setEndDate(''); }}
                  className="text-[10px] font-medium mt-2 hover:underline cursor-pointer"
                  style={{ color: 'var(--accent-primary)' }}
                >
                  Reset all filters
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredHistory.map((t) => {
                  const isInc = t.type === 'income' || t.type === 'deposit' || t.type === 'financing' || (t.type === 'transfer' && (t.category === 'Transfer In' || t.amount > 0));
                  const absAmount = Math.abs(t.amount);

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
                      className="p-3 rounded-xl transition-all duration-150 cursor-pointer group hover:scale-[1.002]"
                      style={{
                        backgroundColor: 'var(--bg-card)',
                        border: '1px solid var(--border-primary)',
                      }}
                      onClick={() => onSelectTransaction(t.id)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border-secondary)';
                        e.currentTarget.style.backgroundColor = 'var(--bg-surface)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border-primary)';
                        e.currentTarget.style.backgroundColor = 'var(--bg-card)';
                      }}
                    >
                      <div className="flex justify-between items-center mb-1.5">
                        <span
                          className="text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded-md"
                          style={{
                            backgroundColor: 'color-mix(in srgb, var(--text-muted) 10%, transparent)',
                            color: 'var(--text-muted)',
                          }}
                        >
                          {t.type.replace(/_/g, ' ')}
                        </span>
                        <span className="text-[9px] font-mono text-[var(--text-muted)]">
                          {t.date}
                        </span>
                      </div>

                      <div className="flex justify-between items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-semibold text-[var(--text-primary)] truncate block">
                            {t.title}
                          </span>
                          <span className="text-[9px] text-[var(--text-muted)] font-mono">
                            {t.category}{accountLabel ? ` · ${accountLabel}` : ''}
                          </span>
                        </div>
                        <span
                          className={`text-xs font-mono font-extrabold shrink-0 ${isInc ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}
                        >
                          {isInc ? '+' : '-'}{currency}{absAmount.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
