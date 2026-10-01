import React, { useState } from 'react';
import type { Transaction, Income, Expense, Debt, CashAccount, BankCard, LoanGiven, Subscription } from '../types';
import { exportTransactionsToCSV, EXPENSE_COLORS } from '../utils';
import {
  FileDown,
  Printer,
  BarChart3,
  PieChart,
  TrendingUp,
  Landmark,
  Search,
  CalendarDays,
  ArrowLeftRight,
  FileText,
} from 'lucide-react';
import { IncomeVsExpenseBar, CategorySpreadAnalysis, TrendAnalysisChart } from './Charts';
import AuditPanel from './AuditPanel';
import { SegmentedControl } from './ui/SegmentedControl';
import { TransactionRow } from './ui/TransactionRow';
import { ProgressBarThick } from './ui/ProgressRing';
import { formatMoney } from '../lib/money';

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
  subscriptions?: Subscription[];
  onToggleSubscriptionStatus?: (id: string, currentStatus: 'Active' | 'Paused' | 'Cancelled') => void;
  onPaySubscription?: (
    subId: string,
    accountId: string,
    accountType: 'cash' | 'card',
    paymentDate: string,
    bankCharge?: number,
  ) => void;
}

export default function ReportsCentre({
  transactions,
  debts,
  loansGiven,
  cashAccounts,
  cards,
  currency,
  onSelectTransaction,
  subscriptions = [],
  onToggleSubscriptionStatus,
  onPaySubscription,
}: ReportsCentreProps) {
  const [reportType, setReportType] = useState<'monthly' | 'yearly' | 'category' | 'debt' | 'audit'>('monthly');
  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1).padStart(2, '0'));
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
  const filteredTransactions = React.useMemo(() => {
    return transactions.filter((t) => {
      const [year, month] = t.date.split('-');
      if (reportType === 'monthly') return month === selectedMonth && year === selectedYear;
      if (reportType === 'yearly') return year === selectedYear;
      return true;
    });
  }, [transactions, reportType, selectedMonth, selectedYear]);
  const totalIncome = filteredTransactions.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = filteredTransactions.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  const totalDebtPaid = filteredTransactions
    .filter((t) => t.type === 'debt_payment')
    .reduce((sum, t) => sum + t.amount, 0);
  const netSavings = totalIncome - totalExpense - totalDebtPaid;
  const savingsRate = totalIncome > 0 ? Math.round((netSavings / totalIncome) * 100) : 0;
  const expensesByCategory: Record<string, number> = {};
  filteredTransactions
    .filter((t) => t.type === 'expense')
    .forEach((t) => {
      expensesByCategory[t.category] = (expensesByCategory[t.category] || 0) + t.amount;
    });
  const totalExpenseCategorySum = Object.values(expensesByCategory).reduce((s, v) => s + v, 0) || 1;
  const categoryChartList = Object.entries(expensesByCategory)
    .map(([name, val]) => ({
      name,
      value: val,
      percentage: Math.round((val / totalExpenseCategorySum) * 100),
      color: EXPENSE_COLORS[name] || '#0A0A0A',
    }))
    .sort((a, b) => b.value - a.value);
  const sparklineData = React.useMemo(() => {
    if (filteredTransactions.length === 0) return [];
    const uniqueDates = Array.from(new Set(filteredTransactions.map((t) => t.date.split('T')[0]))).sort();
    const last6Dates = uniqueDates.slice(-6);
    return last6Dates.map((dateStr) => ({
      date: dateStr,
      value: filteredTransactions
        .filter((t) => t.date.split('T')[0] === dateStr)
        .reduce((sum, t) => sum + Math.abs(t.amount), 0),
    }));
  }, [filteredTransactions]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterAccount, setFilterAccount] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const settlementTransactions: Transaction[] = loansGiven.flatMap((l) =>
    l.settlements.map((s) => ({
      id: s.id,
      type: 'income' as const,
      title: `Loan Settle: ${l.borrowerName}`,
      amount: s.amount,
      date: s.date,
      category: 'Loan Settle',
      accountId: s.receivedInId,
      accountType: s.receivedInType,
      referenceId: l.id,
      updated_at: s.updated_at || s.updatedAt,
      updatedAt: s.updated_at || s.updatedAt,
    })),
  );
  const allTransactions = [...transactions, ...settlementTransactions];
  const filteredHistory = allTransactions
    .filter((t) => {
      const matchesSearch =
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.category.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = filterType === 'all' || t.type === filterType;
      const matchesAccount = filterAccount === 'all' || t.accountId === filterAccount;
      const matchesStart = !startDate || t.date >= startDate;
      const matchesEnd = !endDate || t.date <= endDate;
      return matchesSearch && matchesType && matchesAccount && matchesStart && matchesEnd;
    })
    .sort((a, b) => {
      const getTs = (item: Transaction): number => {
        const raw = item.updated_at || item.updatedAt || item.created_at || item.createdAt || item.date;
        if (!raw) return 0;
        const time = new Date(raw).getTime();
        return isNaN(time) ? 0 : time;
      };
      const timeA = getTs(a);
      const timeB = getTs(b);
      if (timeA !== timeB) return timeB - timeA;
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
      <div id="print-report-header" className="hidden print:block">
        <p className="mono text-[18px] font-extrabold tracking-tight text-[var(--ink)]">EM Budget — Financial Report</p>
        <p className="eyebrow !text-[10px] mt-1 text-[var(--ink-2)]">
          {reportType.charAt(0).toUpperCase() + reportType.slice(1)} report · Generated {new Date().toLocaleString()} ·
          Currency {currency}
        </p>
      </div>
      {/* Control bar — segmented report switcher + period pickers */}
      <div className="card card-lg p-3 sm:p-4 flex flex-col gap-3">
        <div className="overflow-x-auto scrollbar-none -mx-1 px-1">
          <SegmentedControl
            ariaLabel="Report type"
            layoutId="report-type"
            value={reportType}
            onChange={(id) => setReportType(id)}
            options={[
              { id: 'monthly', label: 'Monthly' },
              { id: 'yearly', label: 'Annual' },
              { id: 'category', label: 'Categories' },
              { id: 'debt', label: 'Debts' },
              { id: 'audit', label: 'Audit & Health' },
            ]}
          />
        </div>
        {(reportType === 'monthly' || reportType === 'yearly') && (
          <div className="flex flex-wrap items-end gap-2">
            <span className="icon-chip shrink-0 self-center">
              <CalendarDays size={15} />
            </span>
            {reportType === 'monthly' && (
              <label className="flex-1 min-w-[140px]">
                <span className="eyebrow block mb-1">Month</span>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="input !py-2.5 cursor-pointer font-semibold"
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
              </label>
            )}
            <label className="flex-1 min-w-[110px]">
              <span className="eyebrow block mb-1">Year</span>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="input mono !py-2.5 cursor-pointer font-semibold"
              >
                {Array.from({ length: 3 }, (_, i) => new Date().getFullYear() - 1 + i).map((y) => (
                  <option key={y} value={String(y)}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>

      {reportType === 'audit' ? (
        <AuditPanel
          transactions={transactions}
          subscriptions={subscriptions}
          debts={debts}
          cashAccounts={cashAccounts}
          cards={cards}
          currency={currency}
          onToggleSubscriptionStatus={onToggleSubscriptionStatus}
          onPaySubscription={onPaySubscription}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          <div className="lg:col-span-7 space-y-4">
            <div className="gradient-card hero-indigo card-lg p-6 overflow-hidden">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="eyebrow !text-white/60">Executive summary</p>
                  <p
                    className={`mono text-[30px] sm:text-[34px] font-bold tracking-tight mt-1 tabular-nums break-all leading-none ${netSavings < 0 ? 'text-red-300' : 'text-white'}`}
                  >
                    {formatMoney(currency, netSavings)}
                  </p>
                  <p className="eyebrow !text-white/40 !text-[9px] mt-1.5">Period net surplus</p>
                </div>
                <span
                  className={`delta-chip shrink-0 ${netSavings >= 0 ? 'delta-chip-up' : 'delta-chip-down'}`}
                  style={{
                    background: 'rgba(255,255,255,0.12)',
                    borderColor: 'rgba(255,255,255,0.18)',
                    color: 'white',
                  }}
                >
                  {savingsRate > 0 ? `▲ ${savingsRate}%` : `▼ ${Math.abs(savingsRate)}%`} saved
                </span>
              </div>
              <p className="text-[12px] leading-relaxed mt-3 text-white/60">
                Inflows minus outflows and debt paydowns for selected period.
              </p>
              <div className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-3 mt-5 relative z-10">
                <div className="rounded-[var(--r-sm)] p-3 bg-white/10 border border-white/10 text-center min-w-0">
                  <p className="eyebrow !text-white/60 !text-[9px]">Collected</p>
                  <p
                    className="mono text-[13px] font-bold mt-1 text-emerald-300 truncate tabular-nums"
                    title={formatMoney(currency, totalIncome)}
                  >
                    {formatMoney(currency, totalIncome)}
                  </p>
                </div>
                <div className="rounded-[var(--r-sm)] p-3 bg-white/10 border border-white/10 text-center min-w-0">
                  <p className="eyebrow !text-white/60 !text-[9px]">Settled</p>
                  <p
                    className="mono text-[13px] font-bold mt-1 text-red-300 truncate tabular-nums"
                    title={formatMoney(currency, totalExpense)}
                  >
                    {formatMoney(currency, totalExpense)}
                  </p>
                </div>
                <div className="rounded-[var(--r-sm)] p-3 bg-white/10 border border-white/10 text-center min-w-0">
                  <p className="eyebrow !text-white/60 !text-[9px]">Surplus</p>
                  <p className="mono text-[13px] font-bold mt-1 text-white tabular-nums">
                    {savingsRate > 0 ? `+${savingsRate}%` : `${savingsRate}%`}
                  </p>
                </div>
              </div>
            </div>

            {reportType !== 'debt' ? (
              <div className="space-y-4">
                <div className="card p-4 sm:p-5">
                  <p className="eyebrow mb-3 inline-flex items-center gap-2">
                    <span className="icon-chip">
                      <BarChart3 size={13} />
                    </span>
                    Cash flow
                  </p>
                  <IncomeVsExpenseBar income={totalIncome} expense={totalExpense} currency={currency} />
                </div>
                <div className="card p-4 sm:p-5">
                  <p className="eyebrow mb-3 inline-flex items-center gap-2">
                    <span className="icon-chip">
                      <PieChart size={13} />
                    </span>
                    Category spread
                  </p>
                  <CategorySpreadAnalysis categories={categoryChartList} />
                </div>
                <div className="card p-4 sm:p-5">
                  <p className="eyebrow mb-3 inline-flex items-center gap-2">
                    <span className="icon-chip">
                      <TrendingUp size={13} />
                    </span>
                    Spending velocity
                  </p>
                  <TrendAnalysisChart data={sparklineData} currency={currency} />
                </div>
              </div>
            ) : (
              <div className="card card-lg p-5 space-y-3">
                <div
                  className="flex justify-between items-center"
                  style={{ borderBottom: '1px solid var(--line)', paddingBottom: 10 }}
                >
                  <h4 className="text-[13px] font-bold inline-flex items-center gap-2">
                    <span className="icon-chip">
                      <Landmark size={13} />
                    </span>
                    Liabilities
                  </h4>
                  <span className="pill mono !text-[10px] !py-1 !px-2.5">{debts.length} records</span>
                </div>
                {debts.length === 0 ? (
                  <div className="empty py-10 flex flex-col items-center gap-2">
                    <FileText size={20} style={{ color: 'var(--ink-3)' }} />
                    <p className="mono text-[12px]">No liabilities on the books.</p>
                  </div>
                ) : (
                  [...debts]
                    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
                    .map((d) => {
                      const paid = d.totalAmount - d.remainingAmount;
                      const ratio = Math.round((paid / d.totalAmount) * 100);
                      return (
                        <div key={d.id} className="card-flat p-4 space-y-3">
                          <div className="flex justify-between items-end gap-3">
                            <div className="min-w-0">
                              <p className="text-[13px] font-bold truncate">{d.debtSource}</p>
                              <p className="eyebrow !text-[9px] mt-0.5">
                                Due {new Date(d.dueDate).toLocaleDateString()}
                              </p>
                            </div>
                            <p className="money text-[14px] font-extrabold shrink-0 tabular-nums">
                              {currency}
                              {d.remainingAmount.toLocaleString()}
                            </p>
                          </div>
                          <ProgressBarThick
                            percent={ratio}
                            tone={ratio >= 100 ? 'safe' : ratio >= 50 ? 'warning' : 'danger'}
                          />
                          <div className="flex justify-between mono text-[10px]" style={{ color: 'var(--ink-3)' }}>
                            <span className="font-bold">{ratio}% settled</span>
                            <span>
                              Initial {currency}
                              {d.totalAmount.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button onClick={handleExcelExport} className="btn-ghost inline-flex items-center justify-center gap-1.5">
                <FileDown size={13} />
                Export CSV
              </button>
              <button onClick={handlePrintPDF} className="btn-primary inline-flex items-center justify-center gap-1.5">
                <Printer size={13} />
                Print report
              </button>
            </div>
          </div>

          <div
            className="lg:col-span-5 card card-lg p-4 sm:p-5 space-y-4 overflow-hidden relative"
            id="unified-audits-column"
          >
            <div className="rainbow-bar !h-1 !rounded-none absolute top-0 left-0 right-0 opacity-50" />
            <div
              className="flex justify-between items-center"
              style={{ borderBottom: '1px solid var(--line)', paddingBottom: 10 }}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="icon-chip">
                  <ArrowLeftRight size={14} />
                </span>
                <div className="min-w-0">
                  <p className="eyebrow">Ledger audit</p>
                  <p className="text-[13px] font-bold truncate">Unified journals</p>
                </div>
              </div>
              <span className="pill mono !text-[10px] !py-1 !px-2.5 shrink-0">{filteredHistory.length} events</span>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-3" size={14} style={{ color: 'var(--ink-3)' }} />
              <input
                type="text"
                placeholder="Search journals..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input !pl-9 !bg-[var(--surface-2)]"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="eyebrow !text-[9px] mb-1">Type</p>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="input !py-3 text-[12px] !bg-[var(--surface-2)]"
                >
                  <option value="all">All</option>
                  <option value="income">Incomes</option>
                  <option value="expense">Expenses</option>
                  <option value="transfer">Transfers</option>
                  <option value="debt_payment">Debt repayments</option>
                  <option value="deposit">Deposits</option>
                  <option value="withdrawal">Withdrawals</option>
                </select>
              </div>
              <div>
                <p className="eyebrow !text-[9px] mb-1">Account</p>
                <select
                  value={filterAccount}
                  onChange={(e) => setFilterAccount(e.target.value)}
                  className="input !py-3 text-[12px] !bg-[var(--surface-2)]"
                >
                  <option value="all">All wallets/cards</option>
                  {cashAccounts.map((c) => (
                    <option key={c.id} value={c.id}>
                      Cash: {c.name}
                    </option>
                  ))}
                  {cards
                    .filter((c) => !c.isCanceled)
                    .map((card) => (
                      <option key={card.id} value={card.id}>
                        Card: {card.cardName}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="eyebrow !text-[9px] mb-1">Start</p>
                <input
                  type="date"
                  className="input !bg-[var(--surface-2)]"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <p className="eyebrow !text-[9px] mb-1">End</p>
                <input
                  type="date"
                  className="input !bg-[var(--surface-2)]"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            {(startDate || endDate) && (
              <button
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                }}
                className="mono text-[11px] underline"
                style={{ color: 'var(--ink-2)' }}
              >
                Reset bounds
              </button>
            )}
            <div className="space-y-1 max-h-[460px] overflow-y-auto pr-1" id="filtered-list">
              {filteredHistory.length === 0 ? (
                <div className="empty py-10 flex flex-col items-center gap-2">
                  <FileText size={20} style={{ color: 'var(--ink-3)' }} />
                  <p className="mono text-[12px]">No entries match this filter.</p>
                </div>
              ) : (
                filteredHistory.map((t) => {
                  const isInc =
                    t.type === 'income' ||
                    t.type === 'deposit' ||
                    t.type === 'financing' ||
                    (t.type === 'transfer' && (t.category === 'Transfer In' || t.amount > 0));
                  const absAmount = Math.abs(t.amount);
                  const getAccountLabel = (accId?: string, accType?: string) => {
                    if (!accId || !accType) return '';
                    if (accType === 'cash') return cashAccounts.find((c) => c.id === accId)?.name || 'Cash';
                    return cards.find((c) => c.id === accId)?.cardName || 'Card';
                  };
                  const accountLabel = getAccountLabel(t.accountId, t.accountType);
                  return (
                    <TransactionRow
                      key={t.id}
                      title={t.title}
                      subtitle={`${t.date} · ${accountLabel || 'Ledger'}`}
                      category={t.category}
                      amountText={formatMoney(currency, absAmount)}
                      isIncome={isInc}
                      onClick={() => onSelectTransaction(t.id)}
                      trailing={
                        <span className="pill mono !text-[9px] !py-0.5 !px-2 hidden sm:inline-flex">{t.type}</span>
                      }
                    />
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
      <div id="print-report-footer" className="hidden print:block">
        <p className="eyebrow !text-[10px] mt-4 text-[var(--ink-2)]">
          EM Budget · Confidential financial record · Printed {new Date().toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}
