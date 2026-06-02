import React, { useState } from 'react';
import { Debt, CashAccount, BankCard } from '../types';
import { 
  Plus, CheckCircle2, AlertCircle, Sparkles, Calendar, Receipt, 
  Landmark, ShieldCheck, ArrowRight, CornerDownRight, Percent, 
  HelpCircle, TrendingUp, DollarSign, Wallet
} from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';

interface DebtTrackerProps {
  debts: Debt[];
  cashAccounts: CashAccount[];
  cards: BankCard[];
  onAddDebt: (debt: Omit<Debt, 'id' | 'payments' | 'remainingAmount'>) => void;
  onIncreaseDebt: (debtId: string, amount: number) => void;
  onMakeDebtPayment: (debtId: string, amount: number, paidFromId: string, paidFromType: 'cash' | 'card') => void;
  currency: string;
}

export default function DebtTracker({
  debts,
  cashAccounts,
  cards,
  onAddDebt,
  onIncreaseDebt,
  onMakeDebtPayment,
  currency,
}: DebtTrackerProps) {
  const { showToast } = useNotifications();
  // Add Debt States
  const [isAddingDebt, setIsAddingDebt] = useState(false);
  const [source, setSource] = useState('');
  const [totalDebt, setTotalDebt] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');

  // Make Payment States
  const [payingDebtId, setPayingDebtId] = useState<string | null>(null);
  const [increasingDebtId, setIncreasingDebtId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [increaseAmount, setIncreaseAmount] = useState('');
  const [paySourceId, setPaySourceId] = useState('');
  const [paySourceType, setPaySourceType] = useState<'cash' | 'card'>('cash');
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Validation States
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  // Focus Refs
  const sourceInputRef = React.useRef<HTMLInputElement>(null);
  const amountInputRef = React.useRef<HTMLInputElement>(null);
  const dateInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (cashAccounts.length > 0 && !paySourceId) {
      setPaySourceId(cashAccounts[0].id);
      setPaySourceType('cash');
    }
  }, [cashAccounts, paySourceId]);

  const validateDebtForm = (src: string, amtStr: string, date: string, sub: boolean) => {
    const errs: Record<string, string> = {};
    if (sub || src) {
      if (!src.trim()) {
        errs.source = 'Creditor / Debt source is required';
      } else if (src.trim().length < 3) {
        errs.source = 'Source must be at least 3 characters';
      } else if (/[<>{}]/.test(src)) {
        errs.source = 'Special characters are not allowed';
      }
    }
    if (sub || amtStr) {
      if (!amtStr) {
        errs.amount = 'Principal amount is required';
      } else {
        const num = parseFloat(amtStr);
        if (isNaN(num)) {
          errs.amount = 'Must be a valid number';
        } else if (num <= 0) {
          errs.amount = 'Principal amount must be positive';
        }
      }
    }
    if (sub || date) {
      if (!date) {
        errs.dueDate = 'Due date is required';
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCreateDebt = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const isValid = validateDebtForm(source, totalDebt, dueDate, true);
    if (!isValid) {
      if (!source.trim()) {
        sourceInputRef.current?.focus();
      } else if (!totalDebt || parseFloat(totalDebt) <= 0) {
        amountInputRef.current?.focus();
      } else {
        dateInputRef.current?.focus();
      }
      showToast('error', 'Please resolve highlighted liability errors.');
      return;
    }

    onAddDebt({
      debtSource: source.trim(),
      totalAmount: parseFloat(totalDebt),
      dueDate,
      notes: notes || 'No extra notes provided.',
    });

    // Reset Form
    setSource('');
    setTotalDebt('');
    setDueDate('');
    setNotes('');
    setIsAddingDebt(false);
    setSubmitted(false);
    setErrors({});
    showToast('success', 'Outstanding Debt registered successfully! Tracks updated.');
  };

  const handlePayDebtSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPaymentError(null);
    if (!payingDebtId) return;

    const amountNum = parseFloat(payAmount) || 0;
    const debtItem = debts.find(d => d.id === payingDebtId);
    if (!debtItem) return;

    if (amountNum <= 0) {
      setPaymentError('Repayment value must be larger than zero.');
      return;
    }

    if (amountNum > debtItem.remainingAmount) {
      setPaymentError(`Cannot repay more than outstanding due! Remaining debt is ${currency} ${debtItem.remainingAmount.toLocaleString()}`);
      return;
    }

    // Verify balance triggers
    let availableBalance = 0;
    if (paySourceType === 'cash') {
      const match = cashAccounts.find(c => c.id === paySourceId);
      availableBalance = match ? match.balance : 0;
    } else {
      const match = cards.find(c => c.id === paySourceId);
      availableBalance = match ? match.currentBalance : 0;
    }

    if (availableBalance < amountNum) {
      setPaymentError(`Insufficient balance in chosen account to make this payment! Available: ${currency} ${availableBalance.toLocaleString()}`);
      return;
    }

    onMakeDebtPayment(payingDebtId, amountNum, paySourceId, paySourceType);
    setPayAmount('');
    setPayingDebtId(null);
    setPaymentError(null);
    showToast('success', 'Repayment logged! Debt ledger balances correctly.');
  };

  const handleIncreaseDebtSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!increasingDebtId) return;

    const amountNum = parseFloat(increaseAmount) || 0;
    if (amountNum <= 0) {
      showToast('error', 'Amount must be positive.');
      return;
    }

    onIncreaseDebt(increasingDebtId, amountNum);
    setIncreaseAmount('');
    setIncreasingDebtId(null);
    showToast('success', 'Additional debt added successfully.');
  };

  const handleSelectPaymentSource = (value: string) => {
    const [id, type] = value.split(':');
    setPaySourceId(id);
    setPaySourceType(type as 'cash' | 'card');
    setPaymentError(null);
  };

  // Calculations
  const totalRemainingDebt = debts.reduce((sum, d) => sum + d.remainingAmount, 0);
  const totalOriginalDebt = debts.reduce((sum, d) => sum + d.totalAmount, 0);
  const overallClearedPercent = totalOriginalDebt > 0 
    ? Math.round(((totalOriginalDebt - totalRemainingDebt) / totalOriginalDebt) * 100) 
    : 100;

  return (
    <div id="debt-tracker-vault-view" className="space-y-6 animate-fade-in">
      
      {/* 1. TOP HEADER SUMMARY & TOTAL REPAYMENT RATE */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
        
        {/* Metric A: Total Outstanding Liability Glassmorphic Banner */}
        <div className="md:col-span-8 bg-gradient-to-tr from-zinc-950 via-neutral-900/90 to-amber-955/20 to-zinc-950 p-6 rounded-[28px] border border-zinc-800 shadow-xl flex flex-col justify-between relative overflow-hidden">
          <div className="absolute -top-12 -right-12 w-28 h-28 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
          
          <div className="space-y-1">
            <span className="text-[10px] tracking-wider text-amber-400 font-mono font-bold uppercase block">SECURED PASSIVE LIABILITY</span>
            <h2 className="text-xl font-extrabold text-white">Outstanding Debt Vault</h2>
            <p className="text-[11px] text-zinc-500 leading-relaxed max-w-md">
              Complete index tracking of physical loans, peer debts, and outstanding non-card financial records requiring due payoff.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-semibold text-zinc-550 font-mono">{currency}</span>
            <span className="text-3xl font-extrabold text-white font-mono tracking-tight select-all">
              {totalRemainingDebt.toLocaleString()}
            </span>
            <span className="text-xs font-mono font-bold text-zinc-500">.00 total remaining due</span>
          </div>
        </div>

        {/* Metric B: Clear progress gauge */}
        <div className="md:col-span-4 bg-zinc-900/40 p-6 rounded-[28px] border border-zinc-850 flex flex-col justify-between shadow-lg">
          <div>
            <div className="flex justify-between items-start mb-2">
              <span className="text-[10px] text-zinc-500 uppercase font-mono font-bold block">Overall Repaid Index</span>
              <span className="text-xs text-emerald-400 bg-emerald-950/30 px-2 py-0.5 rounded-lg font-mono font-black">{overallClearedPercent}%</span>
            </div>
            <h4 className="text-xs font-bold text-zinc-400 leading-snug">Clearance Velocity</h4>
          </div>

          <div className="space-y-2 mt-4">
            <div className="w-full h-2 bg-neutral-950 border border-zinc-900 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-emerald-500 to-emerald-450 rounded-full transition-all duration-1000"
                style={{ width: `${overallClearedPercent}%` }}
              />
            </div>
            <p className="text-[9px] font-mono text-zinc-500 leading-relaxed uppercase">
              Paid: {currency}{(totalOriginalDebt - totalRemainingDebt).toLocaleString()} of {currency}{totalOriginalDebt.toLocaleString()}
            </p>
          </div>
        </div>

      </div>

      {/* Toolbar controls */}
      <div className="flex justify-between items-center bg-[#070707]/30 p-2 border-b border-zinc-900 pb-3">
        <div>
          <h3 className="text-xs text-zinc-400 font-extrabold flex items-center gap-1.5 font-sans leading-none">
            <Landmark size={14} className="text-indigo-400" />
            Creditor Accounts Registry
          </h3>
          <span className="text-[9.5px] text-zinc-500 font-mono mt-1 block">Live balance records: {debts.length} outstanding accounts</span>
        </div>
        
        {!isAddingDebt && (
          <button
            onClick={() => setIsAddingDebt(true)}
            className="text-[10px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 border border-indigo-550 px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-lg hover:scale-[1.01]"
          >
            <Plus size={13} /> Add Debt Record
          </button>
        )}
      </div>

      {/* 2. Add Debt Form */}
      {isAddingDebt && (
        <form onSubmit={handleCreateDebt} className="bg-gradient-to-br from-[#0c0c0e] to-zinc-950 border border-zinc-800 p-6 rounded-[28px] space-y-5 animate-fade-in shadow-2xl relative overflow-hidden">
          <div className="absolute -top-12 -right-12 w-28 h-28 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
          
          <div className="flex justify-between items-center border-b border-zinc-905 pb-3">
            <span className="text-xs font-bold text-white uppercase flex items-center gap-2 tracking-wider font-mono">
              <Plus size={13} className="text-indigo-400" />
              Register New Liability
            </span>
            <button
              type="button"
              className="text-[10px] font-mono font-bold text-zinc-500 hover:text-white uppercase transition-colors cursor-pointer"
              onClick={() => {
                setIsAddingDebt(false);
                setErrors({});
                setSubmitted(false);
              }}
            >
              Cancel Form
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[9px] text-zinc-400 font-black block mb-1.5 uppercase font-mono tracking-widest">Creditor / Debt Source</label>
              <input
                ref={sourceInputRef}
                type="text"
                placeholder="e.g. Student Loan, Samantha Friendly Loan"
                value={source}
                onChange={(e) => {
                  setSource(e.target.value);
                  validateDebtForm(e.target.value, totalDebt, dueDate, submitted);
                }}
                className={`w-full bg-black border text-xs text-white rounded-xl px-4 py-3.5 focus:outline-none transition-all placeholder:text-zinc-600 ${
                  errors.source
                    ? 'border-rose-500 focus:border-rose-500 focus:ring-1 focus:ring-rose-500'
                    : source && !errors.source
                    ? 'border-emerald-500 focus:border-emerald-500'
                    : 'border-zinc-800 focus:border-zinc-700'
                }`}
              />
              {errors.source && (
                <span className="text-rose-400 font-mono text-[9px] mt-1.5 block">{errors.source}</span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[9px] text-zinc-400 font-black block mb-1.5 uppercase font-mono tracking-widest">Principal Amount ({currency})</label>
                <input
                  ref={amountInputRef}
                  type="number"
                  placeholder="0.00"
                  value={totalDebt}
                  onChange={(e) => {
                    setTotalDebt(e.target.value);
                    validateDebtForm(source, e.target.value, dueDate, submitted);
                  }}
                  className={`w-full bg-black border text-xs text-white rounded-xl px-4 py-3.5 focus:outline-none font-mono transition-all placeholder:text-zinc-650 ${
                    errors.amount
                      ? 'border-rose-500 focus:border-rose-500'
                      : totalDebt && !errors.amount
                      ? 'border-emerald-500'
                      : 'border-zinc-800 focus:border-zinc-700'
                  }`}
                />
                {errors.amount && (
                  <span className="text-rose-400 font-mono text-[9px] mt-1.5 block">{errors.amount}</span>
                )}
              </div>

              <div>
                <label className="text-[9px] text-zinc-400 font-black block mb-1.5 uppercase font-mono tracking-widest">Pay-off Due Date</label>
                <input
                  ref={dateInputRef}
                  type="date"
                  value={dueDate}
                  onChange={(e) => {
                    setDueDate(e.target.value);
                    validateDebtForm(source, totalDebt, e.target.value, submitted);
                  }}
                  className={`w-full bg-black border text-xs text-white rounded-xl px-4 py-3.5 focus:outline-none font-mono transition-all ${
                    errors.dueDate
                      ? 'border-rose-500'
                      : dueDate && !errors.dueDate
                      ? 'border-emerald-500'
                      : 'border-zinc-800 focus:border-zinc-700'
                  }`}
                />
                {errors.dueDate && (
                  <span className="text-rose-400 font-mono text-[9px] mt-1.5 block">{errors.dueDate}</span>
                )}
              </div>
            </div>

            <div>
              <label className="text-[9px] text-zinc-400 font-black block mb-1.5 uppercase font-mono tracking-widest">Special Notes / Accord terms (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Zero-interest repayment plan..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-black border border-zinc-850 border-zinc-800 text-xs text-white rounded-xl px-4 py-3.5 focus:outline-none focus:border-zinc-700 transition-all placeholder:text-zinc-600"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3.5 bg-white text-black font-semibold text-xs rounded-xl hover:bg-zinc-200 transition-all cursor-pointer font-mono font-bold uppercase tracking-widest shadow-md mt-1"
            >
              Verify and Record Liability
            </button>
          </div>
        </form>
      )}

      {/* 3. Debt Items List */}
      <div className="space-y-4">
        {debts.length === 0 ? (
          <div className="p-12 text-center text-zinc-550 border border-dashed border-zinc-850 bg-zinc-950/20 rounded-[28px] italic text-xs">
            No active liabilities registered. Rest easy, you are debt-free!
          </div>
        ) : (
          debts.map((debt) => {
            const repaid = debt.totalAmount - debt.remainingAmount;
            const payoffPct = Math.round((repaid / debt.totalAmount) * 100);
            const isFullyPaid = debt.remainingAmount === 0;

            return (
              <div
                key={debt.id}
                id={`debt-block-${debt.id}`}
                className="bg-zinc-900/40 border border-zinc-850 rounded-[28px] p-5 md:p-6 space-y-5 shadow-xl transition-all duration-300 hover:border-zinc-800"
              >
                
                {/* Header info */}
                <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
                  <div className="space-y-1">
                    <h4 className="text-sm sm:text-base font-extrabold text-white flex flex-wrap items-center gap-2 leading-none font-sans">
                      {debt.debtSource}
                      {isFullyPaid && (
                        <span className="bg-emerald-950/50 text-emerald-450 text-emerald-400 border border-emerald-900/40 text-[9px] px-2 py-0.5 rounded-full font-mono font-bold flex items-center gap-0.5 leading-none">
                          <CheckCircle2 size={10} /> REPAID
                        </span>
                      )}
                    </h4>
                    <span className="text-[10px] text-zinc-500 font-mono font-bold flex items-center gap-1.5">
                      <Calendar size={12} className="text-zinc-600" /> Payoff Due Date: <span className="font-mono text-zinc-300">{debt.dueDate}</span>
                    </span>
                  </div>

                  <div className="text-left sm:text-right border-t border-zinc-900/60 pt-3 sm:pt-0 sm:border-0 shrink-0">
                    <span className="text-[9px] text-zinc-550 block uppercase tracking-widest font-mono font-bold text-zinc-500">Remaining Balance</span>
                    <span className="font-mono text-base font-black text-white">
                      {currency} {debt.remainingAmount.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Progress bar repayment percentage */}
                <div className="p-4 bg-black/40 border border-zinc-905 rounded-2xl space-y-3.5">
                  <div className="flex justify-between text-[10px] font-mono text-zinc-400 leading-none">
                    <span>Payoff Progress</span>
                    <span className="font-bold text-emerald-400">{payoffPct}% settled</span>
                  </div>
                  
                  <div className="w-full h-2.5 bg-zinc-950 border border-zinc-900 rounded-full overflow-hidden relative">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all duration-1000"
                      style={{ width: `${payoffPct || 0}%` }}
                    />
                  </div>
                  
                  <div className="flex justify-between text-[10px] font-mono font-bold text-zinc-500 leading-none">
                    <span>Cleared: <span className="text-zinc-400">{currency} {repaid.toLocaleString()}</span></span>
                    <span>Principal: <span className="text-zinc-400">{currency} {debt.totalAmount.toLocaleString()}</span></span>
                  </div>
                </div>

                {/* Notes and references */}
                <p className="text-xs bg-[#050505]/60 px-4 py-3 rounded-xl text-zinc-450 text-zinc-400 leading-relaxed italic border border-zinc-900/60 font-medium">
                  "{debt.notes}"
                </p>

                {/* Repayment Action Controls */}
                {!isFullyPaid && payingDebtId !== debt.id && increasingDebtId !== debt.id && (
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <button
                      onClick={() => {
                        setPayingDebtId(debt.id);
                        setPaymentError(null);
                      }}
                      className="flex-1 py-3 bg-[#0a0a0cf0] border border-zinc-800 rounded-xl font-bold text-xs text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      Settle Partial Payment
                    </button>
                    
                    <button
                      onClick={() => {
                        setIncreasingDebtId(debt.id);
                      }}
                      className="flex-1 py-3 bg-[#0a0a0cf0] border border-zinc-800 rounded-xl font-bold text-xs text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      Add More Debt
                    </button>
                  </div>
                )}

                {/* Adding more debt form */}
                {increasingDebtId === debt.id && (
                  <form onSubmit={handleIncreaseDebtSubmit} className="bg-black/50 border border-zinc-850 p-4 rounded-2xl space-y-3.5 animation-fade-in shadow-xl">
                     <div className="flex justify-between items-center pb-2 border-b border-zinc-900">
                      <span className="text-[10px] font-bold text-white uppercase tracking-wider flex items-center gap-1 text-amber-400 font-mono">
                        <Plus size={12} className="animate-pulse" />
                        Increase Outstanding Debt
                      </span>
                      <button
                        type="button"
                        className="text-[10px] font-mono font-bold uppercase text-zinc-500 hover:text-white cursor-pointer"
                        onClick={() => {
                          setIncreasingDebtId(null);
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                    <div>
                        <label className="text-[9px] text-[#888888] font-bold tracking-wider block mb-1 uppercase font-mono">Additional Principal amount ({currency})</label>
                        <input
                          type="number"
                          placeholder="e.g. 500"
                          value={increaseAmount}
                          required
                          onChange={(e) => setIncreaseAmount(e.target.value)}
                          className="w-full bg-black border border-zinc-800 text-white rounded-xl text-xs px-3.5 py-2.5 focus:outline-none focus:border-zinc-650 font-mono"
                        />
                    </div>
                    <button
                      type="submit"
                      className="w-full py-2.5 bg-white text-black font-semibold text-xs rounded-xl hover:bg-zinc-200 transition-colors shadow cursor-pointer font-mono font-bold uppercase tracking-wider"
                    >
                      Update Total Debt
                    </button>
                  </form>
                )}

                {/* Paying Down partial form */}
                {payingDebtId === debt.id && (
                  <form onSubmit={handlePayDebtSubmit} className="bg-[#050505]/40 border border-zinc-800 p-4 rounded-2xl space-y-4 animation-fade-in shadow-xl">
                    <div className="flex justify-between items-center pb-2 border-b border-zinc-900">
                      <span className="text-[10px] font-bold text-white uppercase tracking-wider flex items-center gap-1.5 text-emerald-400 font-mono">
                        <CornerDownRight size={12} className="animate-pulse" />
                        Disburse Repayment Funds
                      </span>
                      <button
                        type="button"
                        className="text-[10px] font-mono font-bold uppercase text-zinc-500 hover:text-white cursor-pointer"
                        onClick={() => {
                          setPayingDebtId(null);
                          setPaymentError(null);
                        }}
                      >
                        Cancel
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="text-[9px] text-[#888888] font-bold tracking-wide block mb-1 uppercase font-mono">Pay Amount ({currency})</label>
                        <input
                          type="number"
                          placeholder="e.g. 10000"
                          value={payAmount}
                          required
                          onChange={(e) => {
                            setPayAmount(e.target.value);
                            setPaymentError(null);
                          }}
                          className="w-full bg-black border border-zinc-800 text-white rounded-xl text-xs px-3.5 py-2.5 focus:outline-none focus:border-zinc-700 font-mono"
                        />
                      </div>

                      <div>
                        <label className="text-[9px] text-[#888888] font-bold tracking-wide block mb-1 uppercase font-mono">Deduct From Account</label>
                        <select
                          value={`${paySourceId}:${paySourceType}`}
                          onChange={(e) => handleSelectPaymentSource(e.target.value)}
                          className="w-full bg-black border border-zinc-800 text-zinc-300 text-xs rounded-xl px-2.5 py-2.5 focus:outline-none focus:border-zinc-700 font-semibold"
                          required
                        >
                          <optgroup label="Cash Vaults" className="bg-[#0c0c0e] text-zinc-400">
                            {cashAccounts.map(c => (
                              <option key={c.id} value={`${c.id}:cash`}>{c.name} ({currency}{c.balance})</option>
                            ))}
                          </optgroup>
                          
                          <optgroup label="Cards Ledger" className="bg-[#0c0c0e] text-zinc-400">
                            {cards.filter(c => !c.isCanceled).map(card => (
                              <option key={card.id} value={`${card.id}:card`}>{card.bankName} (Bal: {currency}{card.currentBalance})</option>
                            ))}
                          </optgroup>
                        </select>
                      </div>
                    </div>

                    {paymentError && (
                      <p className="text-red-400 text-[10px] font-mono mt-1.5 font-bold bg-[#1a0c0a] py-2 px-3 border border-red-900/40 rounded-xl flex items-center gap-1.5 leading-tight">
                        <AlertCircle size={13} className="text-red-400 shrink-0" /> 
                        <span>{paymentError}</span>
                      </p>
                    )}

                    <button
                      type="submit"
                      className="w-full py-3 bg-white text-black font-semibold text-xs rounded-xl hover:bg-zinc-200 transition-colors shadow cursor-pointer font-mono font-bold uppercase tracking-widest"
                    >
                      Process Repayment Deduction
                    </button>
                  </form>
                )}

                {/* Sub audit payment track log */}
                {debt.payments && debt.payments.length > 0 && (
                  <div className="border-t border-zinc-850/60 pt-4">
                    <span className="text-[9px] text-[#888888] font-black uppercase tracking-wider block mb-2.5 font-mono">
                      Repayment Log History ({debt.payments.length})
                    </span>
                    <div className="space-y-2">
                      {debt.payments.map((p) => (
                        <div key={p.id} className="flex justify-between items-center bg-black/30 px-3.5 py-2.5 border border-zinc-905 rounded-xl text-xs font-mono text-zinc-400">
                          <span className="flex items-center gap-1.5 text-[9.5px] font-bold text-zinc-500">
                            <ShieldCheck size={12} className="text-emerald-400 animate-pulse" />
                            DEDUCTED SUCCESSFULLY ({p.paidFromType.toUpperCase()})
                          </span>
                          <div className="flex gap-4 font-semibold shrink-0">
                            <span className="text-zinc-600">{p.date}</span>
                            <span className="text-emerald-400">-{currency} {p.amount.toLocaleString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            );
          })
        )}
      </div>

    </div>
  );
}
