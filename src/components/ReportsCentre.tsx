import React, { useState } from 'react';
import { Transaction, Income, Expense, Debt, CashAccount, BankCard, LoanGiven, Subscription } from '../types';
import { exportTransactionsToCSV, EXPENSE_COLORS, INCOME_COLORS } from '../utils';
import { FileDown, Printer, BarChart3, PieChart, TrendingUp, Landmark, Search } from 'lucide-react';
import { IncomeVsExpenseBar, CategorySpreadAnalysis, TrendAnalysisChart } from './Charts';
import { DatePicker } from './DatePicker';
import AuditPanel from './AuditPanel';

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
  onPaySubscription?: (subId: string, accountId: string, accountType: 'cash' | 'card', paymentDate: string, bankCharge?: number) => void;
}

export default function ReportsCentre({ transactions, incomes, expenses, debts, loansGiven, cashAccounts, cards, currency, onSelectTransaction, subscriptions = [], onToggleSubscriptionStatus, onPaySubscription }: ReportsCentreProps) {
  const [reportType, setReportType] = useState<'monthly' | 'yearly' | 'category' | 'debt' | 'audit'>('monthly');
  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1).padStart(2, '0'));
  const [selectedYear, setSelectedYear] = useState('2026');
  const filteredTransactions = transactions.filter(t => {
    const [year, month] = t.date.split('-');
    if (reportType === 'monthly') return month === selectedMonth && year === selectedYear;
    if (reportType === 'yearly') return year === selectedYear;
    return true;
  });
  const totalIncome = filteredTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = filteredTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  const totalDebtPaid = filteredTransactions.filter(t => t.type === 'debt_payment').reduce((sum, t) => sum + t.amount, 0);
  const netSavings = totalIncome - totalExpense - totalDebtPaid;
  const savingsRate = totalIncome > 0 ? Math.round((netSavings / totalIncome) * 100) : 0;
  const expensesByCategory: Record<string, number> = {};
  filteredTransactions.filter(t => t.type === 'expense').forEach(t => { expensesByCategory[t.category] = (expensesByCategory[t.category] || 0) + t.amount; });
  const totalExpenseCategorySum = Object.values(expensesByCategory).reduce((s, v) => s + v, 0) || 1;
  const categoryChartList = Object.entries(expensesByCategory).map(([name, val]) => ({ name, value: val, percentage: Math.round((val / totalExpenseCategorySum) * 100), color: EXPENSE_COLORS[name] || '#0A0A0A' })).sort((a, b) => b.value - a.value);
  const sparklineData = React.useMemo(() => {
    if (filteredTransactions.length === 0) return [];
    const uniqueDates = Array.from(new Set(filteredTransactions.map(t => t.date.split('T')[0]))).sort();
    const last6Dates = uniqueDates.slice(-6);
    return last6Dates.map(dateStr => ({ date: dateStr, value: filteredTransactions.filter(t => t.date.split('T')[0] === dateStr).reduce((sum, t) => sum + Math.abs(t.amount), 0) }));
  }, [filteredTransactions]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterAccount, setFilterAccount] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const settlementTransactions: Transaction[] = loansGiven.flatMap(l => l.settlements.map(s => ({ id: s.id, type: 'income' as const, title: `Loan Settle: ${l.borrowerName}`, amount: s.amount, date: s.date, category: 'Loan Settle', accountId: s.receivedInId, accountType: s.receivedInType, referenceId: l.id, updated_at: s.updated_at || s.updatedAt, updatedAt: s.updated_at || s.updatedAt })));
  const allTransactions = [...transactions, ...settlementTransactions];
  const filteredHistory = allTransactions.filter(t => {
    const matchesSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase()) || t.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || t.type === filterType;
    const matchesAccount = filterAccount === 'all' || t.accountId === filterAccount;
    const matchesStart = !startDate || t.date >= startDate;
    const matchesEnd = !endDate || t.date <= endDate;
    return matchesSearch && matchesType && matchesAccount && matchesStart && matchesEnd;
  }).sort((a, b) => {
    const getTs = (item: any): number => { const raw = item.updated_at || item.updatedAt || item.created_at || item.createdAt || item.date; if (!raw) return 0; const time = new Date(raw).getTime(); return isNaN(time) ? 0 : time; };
    const timeA = getTs(a); const timeB = getTs(b); if (timeA !== timeB) return timeB - timeA;
    const dateCompare = b.date.localeCompare(a.date); if (dateCompare !== 0) return dateCompare;
    const aNum = parseInt(a.id.replace(/\D/g, ''), 10); const bNum = parseInt(b.id.replace(/\D/g, ''), 10); if (!isNaN(aNum) && !isNaN(bNum)) return bNum - aNum; return b.id.localeCompare(a.id);
  });
  const handleExcelExport = () => { exportTransactionsToCSV(transactions, currency); };
  const handlePrintPDF = () => { window.print(); };

  return (
    <div id="reports-centre-view" className="space-y-6">
      <div className="card p-1.5 flex gap-1 overflow-hidden">
        {[
          { key: 'monthly', label: 'Monthly' },
          { key: 'yearly', label: 'Annual' },
          { key: 'category', label: 'Categories' },
          { key: 'debt', label: 'Debts' },
          { key: 'audit', label: 'Audit & Health' },
        ].map(item => (
          <button key={item.key} onClick={() => setReportType(item.key as any)} className={reportType === item.key ? 'pill pill-active flex-1 !py-2 text-[12px] justify-center' : 'pill flex-1 !py-2 text-[12px] justify-center !border-transparent'}>{item.label}</button>
        ))}
      </div>

      {(reportType === 'monthly' || reportType === 'yearly') && (
        <div className="card p-3 flex gap-2">
          {reportType === 'monthly' && (
            <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="input flex-1 !py-2.5">
              <option value="01">January</option><option value="02">February</option><option value="03">March</option><option value="04">April</option><option value="05">May</option><option value="06">June</option><option value="07">July</option><option value="08">August</option><option value="09">September</option><option value="10">October</option><option value="11">November</option><option value="12">December</option>
            </select>
          )}
          <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="input flex-1 !py-2.5">
            <option value="2025">2025</option><option value="2026">2026</option><option value="2027">2027</option><option value="2028">2028</option>
          </select>
        </div>
      )}

      {reportType === 'audit' ? (
        <AuditPanel transactions={transactions} subscriptions={subscriptions} debts={debts} cashAccounts={cashAccounts} cards={cards} currency={currency} onToggleSubscriptionStatus={onToggleSubscriptionStatus} onPaySubscription={onPaySubscription} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          <div className="lg:col-span-7 space-y-4">
            <div className="gradient-card p-6 overflow-hidden" style={{ background: 'var(--gradient-card-dark)' }}>
              <p className="eyebrow !text-white/60">Executive summary</p>
              <p className="eyebrow !text-white/40 !text-[9px] mt-1">Period net surplus</p>
              <h2 className="mono text-[28px] font-extrabold tracking-tight mt-1 text-white tabular-nums">{currency}{netSavings.toLocaleString()}</h2>
              <p className="text-[12px] leading-relaxed mt-2 text-white/60">Inflows minus outflows and debt paydowns for selected period.</p>
              <div className="grid grid-cols-3 gap-3 mt-5 relative z-10">
                <div className="rounded-[12px] p-3 bg-white/10 border border-white/10 text-center"><p className="eyebrow !text-white/60 !text-[9px]">Collected</p><p className="mono text-[12px] font-bold mt-1 text-white">+{currency}{totalIncome.toLocaleString()}</p></div>
                <div className="rounded-[12px] p-3 bg-white/10 border border-white/10 text-center"><p className="eyebrow !text-white/60 !text-[9px]">Settled</p><p className="mono text-[12px] font-bold mt-1 text-white">-{currency}{totalExpense.toLocaleString()}</p></div>
                <div className="rounded-[12px] p-3 bg-white/10 border border-white/10 text-center"><p className="eyebrow !text-white/60 !text-[9px]">Surplus</p><p className="mono text-[12px] font-bold mt-1 text-white">{savingsRate > 0 ? `+${savingsRate}%` : `${savingsRate}%`}</p></div>
              </div>
              <div className="rainbow-bar mt-5 relative z-10 opacity-80" />
            </div>

            {reportType !== 'debt' ? (
              <div className="space-y-4">
                <div><p className="eyebrow mb-2 inline-flex items-center gap-1"><BarChart3 size={11} /> Inflows vs outflows</p><IncomeVsExpenseBar income={totalIncome} expense={totalExpense} currency={currency} /></div>
                <div><p className="eyebrow mb-2 inline-flex items-center gap-1"><PieChart size={11} /> Categories</p><CategorySpreadAnalysis categories={categoryChartList} /></div>
                <div><p className="eyebrow mb-2 inline-flex items-center gap-1"><TrendingUp size={11} /> Velocity</p><TrendAnalysisChart data={sparklineData} currency={currency} /></div>
              </div>
            ) : (
              <div className="card p-6 space-y-3">
                <div className="flex justify-between items-center" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 10 }}><h4 className="text-[13px] font-bold inline-flex items-center gap-1.5"><Landmark size={14} />Liabilities</h4><span className="mono text-[11px]" style={{ color: 'var(--ink-3)' }}>{debts.length} records</span></div>
                {debts.length === 0 ? <p className="mono text-[12px] text-center py-8" style={{ color: 'var(--ink-3)' }}>No liabilities.</p> : [...debts].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()).map(d => {
                  const paid = d.totalAmount - d.remainingAmount; const ratio = Math.round((paid / d.totalAmount) * 100);
                  return (
                    <div key={d.id} className="card-flat p-4 space-y-2">
                      <div className="flex justify-between mono text-[12px]"><span className="font-semibold truncate pr-3">{d.debtSource}</span><span className="font-bold shrink-0">{currency}{d.remainingAmount.toLocaleString()}</span></div>
                      <div className="h-[1px] w-full" style={{ background: 'var(--line)' }}><div className="h-[1px]" style={{ width: `${ratio}%`, background: 'var(--ink)' }} /></div>
                      <div className="flex justify-between mono text-[10px]" style={{ color: 'var(--ink-3)' }}><span>{ratio}% settled</span><span>Initial {currency}{d.totalAmount.toLocaleString()}</span></div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button onClick={handleExcelExport} className="btn-ghost inline-flex items-center justify-center gap-1.5"><FileDown size={13} />Export CSV</button>
              <button onClick={handlePrintPDF} className="btn-primary inline-flex items-center justify-center gap-1.5"><Printer size={13} />Print report</button>
            </div>
          </div>

          <div className="lg:col-span-5 card p-5 space-y-4 overflow-hidden relative" id="unified-audits-column">
            <div className="rainbow-bar !h-1 !rounded-none absolute top-0 left-0 right-0 opacity-50" />
            <div className="flex justify-between items-center" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 10 }}>
              <div><p className="eyebrow">Ledger audit</p><p className="text-[13px] font-bold">Unified journals</p></div>
              <span className="pill mono !text-[10px] !py-1 !px-2.5">{filteredHistory.length} events</span>
            </div>
            <div className="relative"><Search className="absolute left-3 top-3" size={14} style={{ color: 'var(--ink-3)' }} /><input type="text" placeholder="Search journals..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="input !pl-9" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><p className="eyebrow !text-[9px] mb-1">Type</p><select value={filterType} onChange={e => setFilterType(e.target.value)} className="input !py-2.5 text-[12px]"><option value="all">All</option><option value="income">Incomes</option><option value="expense">Expenses</option><option value="transfer">Transfers</option><option value="debt_payment">Debt repayments</option><option value="deposit">Deposits</option><option value="withdrawal">Withdrawals</option></select></div>
              <div><p className="eyebrow !text-[9px] mb-1">Account</p><select value={filterAccount} onChange={e => setFilterAccount(e.target.value)} className="input !py-2.5 text-[12px]"><option value="all">All wallets/cards</option>{cashAccounts.map(c => <option key={c.id} value={c.id}>Cash: {c.name}</option>)}{cards.filter(c => !c.isCanceled).map(card => <option key={card.id} value={card.id}>Card: {card.cardName}</option>)}</select></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><p className="eyebrow !text-[9px] mb-1">Start</p><DatePicker value={startDate} onChange={setStartDate} /></div>
              <div><p className="eyebrow !text-[9px] mb-1">End</p><DatePicker value={endDate} onChange={setEndDate} /></div>
            </div>
            {(startDate || endDate) && <button onClick={() => { setStartDate(''); setEndDate(''); }} className="mono text-[11px] underline" style={{ color: 'var(--ink-2)' }}>Reset bounds</button>}
            <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1" id="filtered-list">
              {filteredHistory.length === 0 ? <div className="empty mono text-[12px]">No entries match.</div> : filteredHistory.map((t) => {
                const isInc = t.type === 'income' || t.type === 'deposit' || t.type === 'financing' || (t.type === 'transfer' && (t.category === 'Transfer In' || t.amount > 0));
                const absAmount = Math.abs(t.amount);
                const getAccountLabel = (accId?: string, accType?: string) => {
                  if (!accId || !accType) return '';
                  if (accType === 'cash') return cashAccounts.find(c => c.id === accId)?.name || 'Cash';
                  return cards.find(c => c.id === accId)?.cardName || 'Card';
                };
                const accountLabel = getAccountLabel(t.accountId, t.accountType);
                return (
                  <button key={t.id} id={`reports-audit-card-${t.id}`} onClick={() => onSelectTransaction(t.id)} className="card-flat w-full text-left p-3 space-y-2 hover:!border-[var(--line-strong)]">
                    <div className="flex justify-between items-center"><span className="mono text-[9px] font-bold px-2 py-0.5 rounded-full uppercase" style={{ border: '1px solid var(--line)', background: 'var(--surface-2)' }}>{t.type}</span><span className="mono text-[10px]" style={{ color: 'var(--ink-3)' }}>{t.date}</span></div>
                    <div className="flex justify-between items-center gap-2"><span className="text-[12px] font-semibold truncate pr-2">{t.title}</span><span className="mono text-[11px] font-bold shrink-0">{isInc ? '+' : '-'}{currency}{absAmount.toLocaleString()}</span></div>
                    <div className="flex justify-between mono text-[10px]" style={{ color: 'var(--ink-3)', borderTop: '1px solid var(--line)', paddingTop: 6 }}><span className="truncate pr-2">{t.category}</span><span className="shrink-0">{accountLabel || 'Ledger'}</span></div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
