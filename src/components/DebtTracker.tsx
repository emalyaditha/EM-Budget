import React, { useState } from 'react';
import { Debt, DebtPayment, CashAccount, BankCard } from '../types';
import {
  Plus, CheckCircle2, AlertCircle, Sparkles, Calendar, Receipt,
  ArrowUpRight, ArrowDownLeft, Trash2, HelpCircle, TrendingUp, DollarSign, Wallet, History, CreditCard, ChevronDown, ChevronUp
} from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';
import { DatePicker } from './DatePicker';

interface DebtTrackerProps {
  debts: Debt[];
  cashAccounts: CashAccount[];
  cards: BankCard[];
  onAddDebt: (debt: Omit<Debt, 'id' | 'payments' | 'remainingAmount'>) => void;
  onIncreaseDebt: (debtId: string, amount: number, newAccountId?: string, newAccountType?: 'cash' | 'card') => void;
  onMakeDebtPayment: (debtId: string, amount: number, paidFromId: string, paidFromType: 'cash' | 'card', bankCharge?: number) => void;
  onDeleteDebt: (debtId: string) => void;
  currency: string;
}

export default function DebtTracker({
  debts = [],
  cashAccounts = [],
  cards = [],
  onAddDebt,
  onIncreaseDebt,
  onMakeDebtPayment,
  onDeleteDebt,
  currency,
}: DebtTrackerProps) {
  const { showConfirm, showToast } = useNotifications();

  // Add Debt form states
  const [isAddingDebt, setIsAddingDebt] = useState(false);
  const [debtSource, setDebtSource] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [accountId, setAccountId] = useState('');
  const [accountType, setAccountType] = useState<'cash' | 'card'>('cash');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Increase Debt states
  const [increasingDebtId, setIncreasingDebtId] = useState<string | null>(null);
  const [increaseAmount, setIncreaseAmount] = useState('');
  const [increaseAccountId, setIncreaseAccountId] = useState('');
  const [increaseAccountType, setIncreaseAccountType] = useState<'cash' | 'card'>('cash');
  const [increaseError, setIncreaseError] = useState<string | null>(null);

  // Make Payment states
  const [payingDebtId, setPayingDebtId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paidFromId, setPaidFromId] = useState('');
  const [paidFromType, setPaidFromType] = useState<'cash' | 'card'>('cash');
  const [paymentBankCharge, setPaymentBankCharge] = useState('');
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Expanded payment history
  const [expandedDebtId, setExpandedDebtId] = useState<string | null>(null);

  // Combined accounts for select options
  const availableAccounts = [
    ...cashAccounts.map(acc => ({ id: acc.id, name: `${acc.name} (Wallet)`, balance: acc.balance, type: 'cash' as const })),
    ...cards.map(c => ({ id: c.id, name: `${c.bankName} - ${c.cardName} (${c.cardType})`, balance: c.currentBalance, type: 'card' as const })),
  ];

  // Set default account once loaded
  React.useEffect(() => {
    if (availableAccounts.length > 0 && !accountId) {
      setAccountId(availableAccounts[0].id);
      setAccountType(availableAccounts[0].type);
    }
  }, [cashAccounts, cards]);

  React.useEffect(() => {
    if (availableAccounts.length > 0 && !paidFromId) {
      setPaidFromId(availableAccounts[0].id);
      setPaidFromType(availableAccounts[0].type);
    }
  }, [cashAccounts, cards, payingDebtId]);

  React.useEffect(() => {
    if (availableAccounts.length > 0 && !increaseAccountId) {
      setIncreaseAccountId(availableAccounts[0].id);
      setIncreaseAccountType(availableAccounts[0].type);
    }
  }, [cashAccounts, cards, increasingDebtId]);

  // Calculations
  const activeDebts = debts.filter(d => d.status !== 'Fully Repaid' && d.remainingAmount > 0);
  const totalDebtAmount = debts.reduce((acc, d) => acc + d.totalAmount, 0);
  const totalRemainingAmount = debts.reduce((acc, d) => acc + d.remainingAmount, 0);
  const totalPaidAmount = totalDebtAmount - totalRemainingAmount;

  const validateDebtForm = () => {
    const errs: Record<string, string> = {};
    if (!debtSource.trim()) {
      errs.debtSource = 'Debt source is required.';
    } else if (debtSource.trim().length < 2) {
      errs.debtSource = 'Debt source must be at least 2 characters.';
    }

    if (!totalAmount || isNaN(parseFloat(totalAmount)) || parseFloat(totalAmount) <= 0) {
      errs.totalAmount = 'Please enter a valid amount larger than zero.';
    }

    if (!dueDate) {
      errs.dueDate = 'Due date is required.';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleAddDebtSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateDebtForm()) {
      showToast('error', 'Please resolve highlighted errors before proceeding.');
      return;
    }

    const selectedAcc = availableAccounts.find(a => a.id === accountId && a.type === accountType);

    onAddDebt({
      debtSource: debtSource.trim(),
      totalAmount: parseFloat(totalAmount),
      dueDate,
      notes: notes.trim() || 'No extra notes provided.',
      accountId: accountId || undefined,
      accountType: accountType || undefined,
      accountName: selectedAcc ? selectedAcc.name : undefined,
      status: 'Active',
    });

    setDebtSource('');
    setTotalAmount('');
    setDueDate('');
    setNotes('');
    setAccountId('');
    setAccountType('cash');
    setIsAddingDebt(false);
    setErrors({});
    showToast('success', 'Debt recorded successfully!');
  };

  const handlePaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPaymentError(null);
    if (!payingDebtId) return;

    const currentDebt = debts.find(d => d.id === payingDebtId);
    if (!currentDebt) return;

    const amt = parseFloat(paymentAmount);
    if (isNaN(amt) || amt <= 0) {
      setPaymentError('Payment amount must be larger than zero.');
      return;
    }

    if (amt > currentDebt.remainingAmount) {
      setPaymentError(`Payment exceeds outstanding balance (${currency} ${currentDebt.remainingAmount.toLocaleString()}).`);
      return;
    }

    const chargeVal = paidFromType === 'card' ? (parseFloat(paymentBankCharge) || 0) : 0;

    onMakeDebtPayment(
      payingDebtId,
      amt,
      paidFromId,
      paidFromType,
      chargeVal
    );

    setPaymentAmount('');
    setPaymentBankCharge('');
    setPayingDebtId(null);
    showToast('success', `Payment of ${currency} ${amt.toLocaleString()} recorded successfully.`);
  };

  const handleIncreaseSubmit = (e: React.FormEvent, debt: Debt) => {
    e.preventDefault();
    setIncreaseError(null);

    const amt = parseFloat(increaseAmount);
    if (isNaN(amt) || amt <= 0) {
      setIncreaseError('Additional amount must be larger than zero.');
      return;
    }

    const selectedAcc = availableAccounts.find(a => a.id === increaseAccountId && a.type === increaseAccountType);
    if (selectedAcc && selectedAcc.balance < amt) {
      setIncreaseError(`Insufficient balance! Available: ${currency} ${selectedAcc.balance.toLocaleString()}`);
      return;
    }

    onIncreaseDebt(
      debt.id,
      amt,
      increaseAccountId,
      increaseAccountType,
    );

    setIncreaseAmount('');
    setIncreasingDebtId(null);
  };

  const handleDeleteDebtClick = (debtId: string, source: string) => {
    showConfirm({
      message: `Are you sure you want to remove the debt record for "${source}"? This action will skip financial rollbacks and simply purge records.`,
      onConfirm: () => {
        onDeleteDebt(debtId);
        showToast('info', 'Debt record purged.');
      }
    });
  };

  return (
    <div className="space-y-6" id="debt-section-wrapper">

      {/* STATISTICS PANEL */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" id="debt-stats-panel">
        <div className="bg-card/40 p-5 rounded-2xl border border-default flex items-center gap-4">
          <div className="p-3 bg-rose-500/10 rounded-xl text-rose-400 border border-rose-950/40">
            <TrendingUp size={20} />
          </div>
          <div>
            <span className="text-[10px] text-muted font-bold uppercase block font-mono">Outstanding Balance</span>
            <span className="text-xl font-extrabold text-primary">
              {currency} {totalRemainingAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <div className="bg-card/40 p-5 rounded-2xl border border-default flex items-center gap-4">
          <div className="p-3 bg-amber-500/10 rounded-xl text-amber-400 border border-amber-950/40">
            <ArrowUpRight size={20} />
          </div>
          <div>
            <span className="text-[10px] text-muted font-bold uppercase block font-mono">Total Debt Incurred</span>
            <span className="text-xl font-extrabold text-primary">
              {currency} {totalDebtAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <div className="bg-card/40 p-5 rounded-2xl border border-default flex items-center gap-4">
          <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-400 border border-emerald-950/40">
            <ArrowDownLeft size={20} />
          </div>
          <div>
            <span className="text-[10px] text-muted font-bold uppercase block font-mono">Total Repaid</span>
            <span className="text-xl font-extrabold text-emerald-500">
              {currency} {totalPaidAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>

      {/* NEW DEBT ENTRY FORM */}
      {isAddingDebt && (
        <form onSubmit={handleAddDebtSubmit} className="bg-card border border-default p-6 md:p-8 rounded-[24px] space-y-5 animate-fade-in relative overflow-hidden text-left" id="add-debt-form-panel">
          <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-rose-500/30 to-transparent" />
          <div className="flex items-center gap-2 mb-2 text-rose-400">
            <Sparkles size={14} className="text-rose-400 animate-spin" />
            <h3 className="text-xs font-black uppercase tracking-wider text-rose-400 font-mono">New Debt Record</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

            {/* Debt Source */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-secondary font-mono font-black uppercase tracking-wider block pl-0.5">Debt Source / Creditor</label>
              <input
                type="text"
                placeholder="e.g. Bank Loan, Credit Card"
                value={debtSource}
                onChange={(e) => setDebtSource(e.target.value)}
                className="w-full bg-surface border border-default rounded-2xl py-3.5 px-4 text-xs font-medium text-primary focus:outline-none focus:ring-1 focus:border-indigo-500 focus:ring-indigo-500 transition-colors placeholder:text-muted"
                required
              />
              {errors.debtSource && <p className="text-[10px] text-rose-500 font-mono font-semibold mt-1.5 block pl-1">{errors.debtSource}</p>}
            </div>

            {/* Total Amount */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-secondary font-mono font-black uppercase tracking-wider block pl-0.5">Total Amount ({currency})</label>
              <input
                type="number"
                step="any"
                placeholder="0.00"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                className="w-full bg-surface border border-default rounded-2xl py-3.5 px-4 text-xs font-mono text-primary focus:outline-none focus:ring-1 focus:border-indigo-500 focus:ring-indigo-500 transition-colors placeholder:text-muted"
                required
              />
              {errors.totalAmount && <p className="text-[10px] text-amber-500 font-mono font-semibold mt-1.5 block pl-1 leading-normal">{errors.totalAmount}</p>}
            </div>

            {/* Due Date */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-secondary font-mono font-black uppercase tracking-wider block pl-0.5">Due Date</label>
              <DatePicker
                value={dueDate}
                onChange={setDueDate}
                required
              />
              {errors.dueDate && <p className="text-[10px] text-rose-500 font-mono font-semibold mt-1.5 block pl-1">{errors.dueDate}</p>}
            </div>

          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-secondary font-mono font-black uppercase tracking-wider block pl-0.5">Notes / Memorandum</label>
              <input
                type="text"
                placeholder="e.g. Personal loan from bank"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-surface border border-default rounded-2xl py-3.5 px-4 text-xs font-medium text-primary focus:outline-none focus:ring-1 focus:border-indigo-500 focus:ring-indigo-500 transition-colors placeholder:text-muted"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => { setIsAddingDebt(false); setErrors({}); }}
              className="bg-transparent hover:bg-card border border-default text-secondary hover:text-primary py-3 px-6 rounded-2xl text-xs font-bold transition-all cursor-pointer font-mono font-black uppercase tracking-widest"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-rose-500 hover:bg-rose-600 text-primary py-3 px-6 rounded-2xl text-xs font-black transition-all duration-300 cursor-pointer shadow-lg active:scale-95 flex items-center gap-1.5 font-mono uppercase tracking-widest h-11"
            >
              <Receipt size={13} />
              <span>Record Debt</span>
            </button>
          </div>
        </form>
      )}

      {/* DEBT REGISTER */}
      <div className="space-y-4" id="debt-register">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-2 border-b border-default/80">
          <h2 className="text-sm font-extrabold text-primary uppercase tracking-wider font-mono">Debt Register</h2>
          <button
            onClick={() => setIsAddingDebt(!isAddingDebt)}
            className="flex items-center gap-2 bg-rose-500 hover:bg-rose-600 text-primary font-extrabold text-xs py-2 px-4 rounded-xl transition-all cursor-pointer shadow-md active:scale-95 shrink-0"
          >
            {isAddingDebt ? 'Minimize Form' : (
              <>
                <Plus size={14} />
                <span>Add Debt</span>
              </>
            )}
          </button>
        </div>

        {activeDebts.length === 0 ? (
          <div className="bg-card/15 border border-default rounded-[32px] p-12 text-center flex flex-col items-center justify-center space-y-4 shadow-inner">
            <div className={`p-4 bg-card/60 rounded-2xl border ${debts.length > 0 ? 'border-emerald-500/30 text-emerald-400' : 'border-default text-muted'}`}>
              {debts.length > 0 ? <CheckCircle2 size={24} /> : <DollarSign size={24} className="text-muted" />}
            </div>
            <div>
              <p className="text-primary text-sm font-semibold">{debts.length > 0 ? 'All Debts Repaid' : 'No Debts Registered'}</p>
              <p className="text-muted text-xs mt-1 max-w-sm mx-auto leading-relaxed">
                {debts.length > 0
                  ? 'You have successfully repaid all your debts.'
                  : 'You have not registered any debts. Use the <strong>"Add Debt"</strong> button above to start tracking your liabilities.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {activeDebts.map((debt) => {
              const progress = debt.totalAmount > 0
                ? Math.round(((debt.totalAmount - debt.remainingAmount) / debt.totalAmount) * 100)
                : 0;

              return (
                <div
                  key={debt.id}
                  className="bg-gradient-to-br from-[#0c0c0f] to-[#040405] border border-default rounded-3xl p-6 shadow-xl transition-all relative overflow-hidden"
                >
                  <div className={`absolute top-0 right-0 bottom-0 w-1 ${
                    debt.status === 'Closed' ? 'bg-yellow-500' : 'bg-rose-500'
                  }`} />

                  {/* Header Row */}
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-4 border-b border-default/70">
                    <div>
                      <h3 className="text-base font-extrabold text-primary flex items-center gap-2">
                        {debt.debtSource}
                        <span className={`text-[9px] font-bold font-mono px-2 py-0.5 rounded-full uppercase border ${
                          debt.status === 'Closed'
                            ? 'bg-yellow-950/30 text-yellow-400 border-yellow-900/50'
                            : 'bg-rose-950/30 text-rose-400 border-rose-900/50'
                        }`}>
                          {debt.status || 'Active'}
                        </span>
                      </h3>
                      <p className="text-[10px] text-muted font-medium mt-0.5 flex items-center gap-1">
                        <Calendar size={11} /> Due on {debt.dueDate}
                        {debt.accountName && <> &middot; via <strong className="text-secondary font-semibold">{debt.accountName}</strong></>}
                      </p>
                    </div>

                    <div className="flex items-center gap-2.5 sm:self-center self-end animate-fade-in">
                      <button
                        onClick={() => {
                          setIncreasingDebtId(increasingDebtId === debt.id ? null : debt.id);
                          setIncreaseAmount('');
                          setIncreaseError(null);
                          setPayingDebtId(null);
                        }}
                        className="bg-card hover:bg-card text-amber-400 border border-default py-1.5 px-3 rounded-xl text-[10px] font-extrabold transition-all duration-300 cursor-pointer shadow-sm active:scale-95 flex items-center gap-1"
                      >
                        <Plus size={12} />
                        <span>Incur More</span>
                      </button>
                      <button
                        onClick={() => {
                          setPayingDebtId(payingDebtId === debt.id ? null : debt.id);
                          setPaymentAmount(debt.remainingAmount.toString());
                          setPaymentError(null);
                          setIncreasingDebtId(null);
                        }}
                        className="bg-emerald-500 hover:bg-emerald-600 text-primary border border-emerald-500 py-1.5 px-3.5 rounded-xl text-[10px] font-bold transition-all duration-300 cursor-pointer shadow-sm active:scale-95 flex items-center gap-1"
                      >
                        <CheckCircle2 size={12} />
                        <span>Make Payment</span>
                      </button>
                      <button
                        onClick={() => handleDeleteDebtClick(debt.id, debt.debtSource)}
                        className="text-muted hover:text-danger p-2 hover:bg-rose-500/10 rounded-xl transition-all cursor-pointer"
                        title="Delete record"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Body Progress and Financial details */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6 py-4 items-center">

                    {/* Remaining Balance */}
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-muted uppercase font-mono font-bold block">Remaining Balance</span>
                      <span className="text-xl font-black text-rose-400">
                        {currency} {debt.remainingAmount.toLocaleString()}
                      </span>
                    </div>

                    {/* Total Amount */}
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-muted uppercase font-mono font-bold block">Total Incurred</span>
                      <span className="text-sm font-extrabold text-primary">
                        {currency} {debt.totalAmount.toLocaleString()}
                      </span>
                    </div>

                    {/* Progress Meter */}
                    <div className="md:col-span-2 space-y-1.5">
                      <div className="flex justify-between items-center text-[10px] font-mono">
                        <span className="text-muted font-bold uppercase">Repayment Progress</span>
                        <span className="text-emerald-400 font-bold">{progress}% Repaid</span>
                      </div>
                      <div className="w-full bg-card/80 border border-default rounded-full h-2 overflow-hidden shadow-inner flex">
                        <div
                          className="bg-gradient-to-r from-rose-500 to-emerald-500 h-full rounded-full transition-all duration-700"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>

                  </div>

                  {/* Notes Panel */}
                  {debt.notes && (
                    <div className="bg-card/50 border border-subtle p-3 rounded-xl text-xs text-secondary mt-1 mb-3 font-medium italic select-text">
                      <span className="font-bold text-muted text-[10px] uppercase font-mono not-italic block mb-0.5">Notes memo</span>
                      "{debt.notes}"
                    </div>
                  )}

                  {/* PAYMENT ACTION PANEL inline drawer */}
                  {payingDebtId === debt.id && (
                    <form onSubmit={handlePaymentSubmit} className="mt-4 bg-card border border-default p-5 rounded-[20px] space-y-4 shadow-inner scale-98 transition-all animate-fade-in text-xs text-left">
                      <div className="flex items-center gap-1.5 text-emerald-400 font-bold mb-1">
                        <CheckCircle2 size={13} className="text-emerald-400" />
                        <span className="uppercase font-mono text-[10px] tracking-wider font-black">Make Payment</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

                        {/* Payment Amount */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-mono font-black uppercase tracking-wider text-secondary block pl-0.5">Payment Amount ({currency})</label>
                          <input
                            type="number"
                            step="any"
                            value={paymentAmount}
                            onChange={(e) => setPaymentAmount(e.target.value)}
                            max={debt.remainingAmount}
                            className="w-full bg-surface border border-default rounded-2xl py-3.5 px-4 text-xs text-primary focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-all font-mono font-bold"
                            required
                          />
                        </div>

                        {/* Payment Date */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-mono font-black uppercase tracking-wider text-secondary block pl-0.5">Payment Date</label>
                          <DatePicker
                            value={paymentDate}
                            onChange={setPaymentDate}
                            required
                          />
                        </div>

                        {/* Paid From Account */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-mono font-black uppercase tracking-wider text-secondary block pl-0.5">Paid From Account</label>
                          <select
                            value={`${paidFromId}:${paidFromType}`}
                            onChange={(e) => {
                              const [id, type] = e.target.value.split(':');
                              setPaidFromId(id);
                              setPaidFromType(type as 'cash' | 'card');
                            }}
                            className="w-full bg-surface border border-default rounded-2xl py-3.5 px-3.5 text-xs text-primary focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-all cursor-pointer font-semibold"
                          >
                            {availableAccounts.map(acc => (
                              <option key={`pay:${acc.id}:${acc.type}`} value={`${acc.id}:${acc.type}`}>
                                {acc.name} - ({currency} {acc.balance.toLocaleString()})
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Submit */}
                        <div className="flex items-end">
                          <button
                            type="submit"
                            className="w-full h-12 bg-white text-black font-semibold text-xs rounded-2xl hover:bg-surface transition-all cursor-pointer font-mono font-black uppercase tracking-widest flex items-center justify-center gap-2"
                          >
                            Pay & Post
                          </button>
                        </div>

                      </div>

                      {paidFromType === 'card' && paidFromId && (
                        <div className="p-4 bg-surface/60 border border-default rounded-2xl space-y-2 animate-fade-in">
                          <label className="text-[10px] text-secondary font-mono font-black block uppercase pl-0.5">Optional Bank Card Charge ({currency})</label>
                          <input
                            type="number"
                            step="any"
                            placeholder="e.g. 150 (Leave blank or 0 if none)"
                            value={paymentBankCharge}
                            onChange={(e) => setPaymentBankCharge(e.target.value)}
                            className="w-full bg-surface border border-default rounded-2xl py-3 px-4 text-xs text-primary focus:outline-none focus:ring-1 focus:border-emerald-500 focus:ring-emerald-500 font-mono"
                          />
                          <p className="text-[9.5px] text-muted font-mono pl-0.5 leading-normal">Making payment from a card might incur transaction fees. Entering a charge will deduct from your card balance.</p>
                        </div>
                      )}

                      {paymentError && (
                        <p className="text-[10px] text-rose-500 font-mono font-semibold mt-1 block pl-1">{paymentError}</p>
                      )}
                    </form>
                  )}

                  {/* INCREASE DEBT ACTION PANEL inline drawer */}
                  {increasingDebtId === debt.id && (
                    <form onSubmit={(e) => handleIncreaseSubmit(e, debt)} className="mt-4 bg-card border border-default p-5 rounded-[20px] space-y-4 shadow-inner scale-98 transition-all animate-fade-in text-xs text-left relative overflow-hidden" id={`increase-debt-form-${debt.id}`}>
                      <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />
                      <div className="flex items-center gap-1 text-amber-400 font-bold mb-1">
                        <ArrowUpRight size={13} className="text-amber-400" />
                        <span className="uppercase font-mono text-[10px] tracking-wider font-black">Incur Additional Debt</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                        {/* Amount */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-mono font-black uppercase tracking-wider text-secondary block pl-0.5">Additional Amount ({currency})</label>
                          <input
                            type="number"
                            step="any"
                            value={increaseAmount}
                            onChange={(e) => setIncreaseAmount(e.target.value)}
                            placeholder="0.00"
                            className="w-full bg-surface border border-default rounded-2xl py-3.5 px-4 text-xs text-primary focus:outline-none focus:ring-1 focus:border-amber-500 focus:ring-amber-500 transition-all font-mono font-bold"
                            required
                          />
                        </div>

                        {/* Account */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-mono font-black uppercase tracking-wider text-secondary block pl-0.5">Credit To Account (Optional)</label>
                          <select
                            value={`${increaseAccountId}:${increaseAccountType}`}
                            onChange={(e) => {
                              const [id, type] = e.target.value.split(':');
                              setIncreaseAccountId(id);
                              setIncreaseAccountType(type as 'cash' | 'card');
                            }}
                            className="w-full bg-surface border border-default rounded-2xl py-3.5 px-3.5 text-xs text-primary focus:outline-none focus:ring-1 focus:border-amber-500 focus:ring-amber-500 transition-all cursor-pointer font-semibold"
                          >
                            <option value=":">No account (record only)</option>
                            {availableAccounts.map(acc => (
                              <option key={`inc:${acc.id}:${acc.type}`} value={`${acc.id}:${acc.type}`}>
                                {acc.name} - ({currency} {acc.balance.toLocaleString()})
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Submit */}
                        <div className="flex items-end">
                          <button
                            type="submit"
                            className="w-full h-12 bg-white text-black font-semibold text-xs rounded-2xl hover:bg-surface transition-all cursor-pointer font-mono font-black uppercase tracking-widest flex items-center justify-center gap-2"
                          >
                            Post Additional Debt
                          </button>
                        </div>

                      </div>

                      {increaseError && (
                        <p className="text-[10px] text-rose-500 font-mono font-semibold mt-1 block pl-1">{increaseError}</p>
                      )}
                    </form>
                  )}

                  {/* PAYMENT HISTORY ACCORDION */}
                  <div className="mt-2.5">
                    <button
                      onClick={() => setExpandedDebtId(expandedDebtId === debt.id ? null : debt.id)}
                      className="text-[10px] tracking-wider text-muted hover:text-primary font-mono font-bold uppercase py-1 flex items-center gap-1 transition-all cursor-pointer outline-none border-b border-transparent hover:border-default"
                    >
                      <History size={11} />
                      <span>Payment History ({debt.payments?.length || 0})</span>
                      {expandedDebtId === debt.id ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                    </button>

                    {expandedDebtId === debt.id && (
                      <div className="mt-2.5 space-y-2 border-t border-subtle pt-2.5 animate-fade-in select-text">
                        {(!debt.payments || debt.payments.length === 0) ? (
                          <p className="text-[10px] text-muted font-medium italic py-1">No payments recorded yet.</p>
                        ) : (
                          <div className="grid grid-cols-1 gap-2">
                            {debt.payments.map((payment) => (
                              <div key={payment.id} className="bg-card/60 border border-default rounded-xl p-3 flex justify-between items-center">
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-mono font-bold uppercase">
                                    <ArrowDownLeft size={10} />
                                    <span>Payment Made</span>
                                  </div>
                                  <p className="text-[10px] text-secondary font-semibold mt-0.5 leading-normal">
                                    From: <strong className="text-primary font-bold">{payment.paidFromType === 'cash' ? 'Wallet' : 'Card'}</strong>
                                  </p>
                                </div>
                                <div className="text-right">
                                  <span className="text-xs font-black text-primary block">
                                    - {currency} {payment.amount.toLocaleString()}
                                  </span>
                                  <span className="text-[9px] text-muted font-mono">{payment.date}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
