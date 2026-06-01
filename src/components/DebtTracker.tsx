import React, { useState } from 'react';
import { Debt, CashAccount, BankCard } from '../types';
import { Plus, CheckCircle2, AlertCircle, Sparkles, Calendar, Receipt, Landmark, ShieldCheck, ArrowRight, CornerDownRight } from 'lucide-react';
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

  return (
    <div id="debt-tracker-vault-view" className="space-y-6">
      
      {/* 1. Toolbar and Header summary */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center bg-zinc-900/10 p-1 gap-3">
        <div>
          <h3 className="text-xs text-zinc-500 font-bold uppercase tracking-wider font-mono">Passive Liabilities</h3>
          <p className="text-lg font-extrabold text-white">Debt Accounts</p>
        </div>
        {!isAddingDebt && (
          <button
            onClick={() => setIsAddingDebt(true)}
            className="text-[10px] font-bold text-white bg-zinc-800 border border-zinc-700 px-3.5 py-2.5 rounded-xl flex items-center gap-1 hover:border-zinc-500 transition-all cursor-pointer self-start sm:self-auto"
          >
            <Plus size={12} /> Add Debt Record
          </button>
        )}
      </div>

      {/* 2. Add Debt Form */}
      {isAddingDebt && (
        <form onSubmit={handleCreateDebt} className="bg-[#050505] border border-zinc-800 p-5 rounded-2xl space-y-4 animation-fade-in shadow-xl">
          <div className="flex justify-between items-center border-b border-zinc-900 pb-2.5">
            <span className="text-xs font-bold text-white uppercase flex items-center gap-1.5 tracking-wider font-mono">
              <Plus size={13} className="text-amber-500 animate-pulse" />
              Register Liabilities
            </span>
            <button
              type="button"
              className="text-xs font-mono font-bold text-zinc-500 hover:text-white uppercase transition-colors"
              onClick={() => {
                setIsAddingDebt(false);
                setErrors({});
                setSubmitted(false);
              }}
            >
              Cancel
            </button>
          </div>

          <div className="space-y-3.5">
            <div>
              <label className="text-[10px] text-[#888888] font-bold block mb-1 uppercase font-mono">Creditor / Debt Source</label>
              <input
                ref={sourceInputRef}
                type="text"
                placeholder="e.g. Samantha Friendly Loan"
                value={source}
                onChange={(e) => {
                  setSource(e.target.value);
                  validateDebtForm(e.target.value, totalDebt, dueDate, submitted);
                }}
                className={`w-full bg-[#050505] border text-white text-xs rounded-xl px-3 py-3 focus:outline-none transition-colors ${
                  errors.source
                    ? 'border-rose-500 focus:border-rose-600'
                    : source && !errors.source
                    ? 'border-emerald-500 focus:border-emerald-600'
                    : 'border-zinc-800 focus:border-zinc-500'
                }`}
              />
              {errors.source && (
                <span className="text-rose-400 font-mono text-[10px] mt-1 block">{errors.source}</span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] text-[#888888] font-bold block mb-1 uppercase font-mono">Principal Amount ({currency})</label>
                <input
                  ref={amountInputRef}
                  type="number"
                  placeholder="0.00"
                  value={totalDebt}
                  onChange={(e) => {
                    setTotalDebt(e.target.value);
                    validateDebtForm(source, e.target.value, dueDate, submitted);
                  }}
                  className={`w-full bg-[#050505] border text-white text-xs rounded-xl px-3 py-3 focus:outline-none font-mono transition-colors ${
                    errors.amount
                      ? 'border-rose-500 focus:border-rose-600'
                      : totalDebt && !errors.amount
                      ? 'border-emerald-500'
                      : 'border-zinc-800'
                  }`}
                />
                {errors.amount && (
                  <span className="text-rose-400 font-mono text-[10px] mt-1 block">{errors.amount}</span>
                )}
              </div>

              <div>
                <label className="text-[10px] text-[#888888] font-bold block mb-1 uppercase font-mono">Pay-off Due Date</label>
                <input
                  ref={dateInputRef}
                  type="date"
                  value={dueDate}
                  onChange={(e) => {
                    setDueDate(e.target.value);
                    validateDebtForm(source, totalDebt, e.target.value, submitted);
                  }}
                  className={`w-full bg-[#050505] border text-white text-xs rounded-xl px-3 py-3 focus:outline-none font-mono transition-colors ${
                    errors.dueDate
                      ? 'border-rose-500'
                      : dueDate && !errors.dueDate
                      ? 'border-emerald-500'
                      : 'border-zinc-800'
                  }`}
                />
                {errors.dueDate && (
                  <span className="text-rose-400 font-mono text-[10px] mt-1 block">{errors.dueDate}</span>
                )}
              </div>
            </div>

            <div>
              <label className="text-[10px] text-[#888888] font-bold block mb-1 uppercase font-mono">Special Notes / Terms (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Zero-interest payback setup..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-[#050505] border border-zinc-805 border-zinc-800 text-white text-xs rounded-xl px-3 py-3 focus:outline-none focus:border-zinc-500 transition-colors"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-white text-black font-semibold text-xs rounded-xl hover:bg-zinc-200 transition-all cursor-pointer font-mono font-bold uppercase tracking-wider"
            >
              Verify and Record Liability
            </button>
          </div>
        </form>
      )}

      {/* 3. Debt Items List */}
      <div className="space-y-4">
        {debts.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 text-xs border border-dashed border-zinc-800 rounded-2xl">
            Congratulations! You are currently completely clear of recorded debts.
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
                className="bg-zinc-900/50 border border-zinc-850 rounded-[28px] p-6 space-y-4 shadow-xl"
              >
                {/* Header info */}
                <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-white flex flex-wrap items-center gap-1.5 leading-snug font-sans">
                      {debt.debtSource}
                      {isFullyPaid && (
                        <span className="bg-emerald-950/40 text-emerald-400 border border-emerald-800/40 text-[9px] px-1.5 py-0.5 rounded-md font-mono font-bold flex items-center gap-0.5 leading-none">
                          <CheckCircle2 size={10} /> CLEAR
                        </span>
                      )}
                    </h4>
                    <span className="text-[10px] text-zinc-400 font-medium flex items-center gap-1 mt-1 font-mono">
                      <Calendar size={11} className="text-zinc-500" /> Payoff Due Date: <span className="font-mono text-zinc-300 font-bold">{debt.dueDate}</span>
                    </span>
                  </div>

                  <div className="text-left sm:text-right border-t border-zinc-900/40 pt-2.5 sm:pt-0 sm:border-0">
                    <span className="text-[10px] text-zinc-500 block uppercase tracking-wider font-mono text-[9px]">Remaining Balance</span>
                    <span className="font-mono text-sm sm:text-xs font-extrabold text-white">
                      {currency} {debt.remainingAmount.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Progress bar repayment percentage */}
                <div className="space-y-2">
                  <div className="flex justify-between text-[11px] font-mono text-zinc-400">
                    <span>Repayment progress</span>
                    <span className="font-bold text-emerald-400">{payoffPct}% settled</span>
                  </div>
                  <div className="w-full h-2.5 bg-neutral-950 border border-zinc-900 rounded-full overflow-hidden relative">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all duration-1000"
                      style={{ width: `${payoffPct || 0}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[9px] font-mono text-zinc-500">
                    <span>Cleared: {currency} {repaid.toLocaleString()}</span>
                    <span>Principal: {currency} {debt.totalAmount.toLocaleString()}</span>
                  </div>
                </div>

                {/* Notes and references */}
                <p className="text-[11px] bg-[#050505] px-3.5 py-2.5 rounded-xl text-zinc-400 leading-relaxed italic border border-zinc-900/60 font-medium">
                  "{debt.notes}"
                </p>

                {/* Repayment Action Controls */}
                {!isFullyPaid && payingDebtId !== debt.id && increasingDebtId !== debt.id && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      onClick={() => {
                        setPayingDebtId(debt.id);
                        setPaymentError(null);
                      }}
                      className="flex-1 py-2.5 bg-[#050505] border border-zinc-800 rounded-xl font-bold text-xs text-zinc-350 hover:text-white hover:border-zinc-500 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                    >
                      Settle Partial Payment
                    </button>
                    <button
                      onClick={() => {
                        setIncreasingDebtId(debt.id);
                      }}
                      className="flex-1 py-2.5 bg-[#050505] border border-zinc-800 rounded-xl font-bold text-xs text-zinc-350 hover:text-white hover:border-zinc-500 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                    >
                      Add More Debt
                    </button>
                  </div>
                )}

                {/* Adding more debt form */}
                {increasingDebtId === debt.id && (
                  <form onSubmit={handleIncreaseDebtSubmit} className="bg-[#050505] border border-zinc-800 p-4 rounded-xl space-y-3.5 animation-fade-in shadow-xl">
                     <div className="flex justify-between items-center pb-2 border-b border-zinc-900">
                      <span className="text-[10px] font-bold text-white uppercase tracking-wider flex items-center gap-1 text-amber-400 font-mono">
                        <Plus size={12} className="animate-pulse" />
                        Add More Funds
                      </span>
                      <button
                        type="button"
                        className="text-[10px] font-mono font-bold uppercase text-zinc-500 hover:text-white"
                        onClick={() => {
                          setIncreasingDebtId(null);
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                    <div>
                        <label className="text-[10px] text-[#888888] font-bold block mb-1">Additional Amount ({currency})</label>
                        <input
                          type="number"
                          placeholder="e.g. 500"
                          value={increaseAmount}
                          required
                          onChange={(e) => setIncreaseAmount(e.target.value)}
                          className="w-full bg-[#050505] border border-zinc-805 border-zinc-800 text-white rounded-xl text-xs px-3 py-2 focus:outline-none focus:border-zinc-500 font-mono"
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
                  <form onSubmit={handlePayDebtSubmit} className="bg-[#050505] border border-zinc-800 p-4 rounded-xl space-y-3.5 animation-fade-in shadow-xl">
                    <div className="flex justify-between items-center pb-2 border-b border-zinc-900">
                      <span className="text-[10px] font-bold text-white uppercase tracking-wider flex items-center gap-1 text-emerald-400 font-mono">
                        <CornerDownRight size={12} className="animate-pulse" />
                        Disburse Funds Down
                      </span>
                      <button
                        type="button"
                        className="text-[10px] font-mono font-bold uppercase text-zinc-500 hover:text-white"
                        onClick={() => {
                          setPayingDebtId(null);
                          setPaymentError(null);
                        }}
                      >
                        Cancel
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] text-[#888888] font-bold block mb-1">Pay Amount ({currency})</label>
                        <input
                          type="number"
                          placeholder="e.g. 10000"
                          value={payAmount}
                          required
                          onChange={(e) => {
                            setPayAmount(e.target.value);
                            setPaymentError(null);
                          }}
                          className="w-full bg-[#050505] border border-zinc-805 border-zinc-800 text-white rounded-xl text-xs px-3 py-2 focus:outline-none focus:border-zinc-500 font-mono"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-[#888888] font-bold block mb-1">Debit From Account</label>
                        <select
                          value={`${paySourceId}:${paySourceType}`}
                          onChange={(e) => handleSelectPaymentSource(e.target.value)}
                          className="w-full bg-[#050505] border border-zinc-805 border-zinc-800 text-white rounded-xl text-xs px-2.5 py-2 focus:outline-none focus:border-zinc-500 font-semibold"
                          required
                        >
                          <optgroup label="Cash">
                            {cashAccounts.map(c => (
                              <option key={c.id} value={`${c.id}:cash`}>{c.name} ({currency}{c.balance})</option>
                            ))}
                          </optgroup>
                          <optgroup label="Cards">
                            {cards.filter(c => !c.isCanceled).map(card => (
                              <option key={card.id} value={`${card.id}:card`}>{card.bankName} (Bal: {currency}{card.currentBalance})</option>
                            ))}
                          </optgroup>
                        </select>
                      </div>
                    </div>

                    {paymentError && (
                      <p className="text-red-400 text-[10px] mt-1 font-medium bg-[#1a0c0a] py-1.5 px-3 rounded-lg border border-red-900/40 flex items-center gap-1.5">
                        <AlertCircle size={12} className="text-red-400 shrink-0" /> {paymentError}
                      </p>
                    )}

                    <button
                      type="submit"
                      className="w-full py-2.5 bg-white text-black font-semibold text-xs rounded-xl hover:bg-zinc-200 transition-colors shadow cursor-pointer font-mono font-bold uppercase tracking-wider"
                    >
                      Process Repayment Deduction
                    </button>
                  </form>
                )}

                {/* Sub audit payment track log */}
                {debt.payments && debt.payments.length > 0 && (
                  <div className="border-t border-zinc-850 pt-3">
                    <span className="text-[9px] text-[#888888] font-bold uppercase tracking-wider block mb-2 font-mono">
                      Repayment Log History ({debt.payments.length})
                    </span>
                    <div className="space-y-1.5">
                      {debt.payments.map((p) => (
                        <div key={p.id} className="flex justify-between items-center bg-[#050505]/50 px-3 py-2 rounded-xl border border-zinc-850 text-[11px] font-medium text-[#c0c0c0]">
                          <span className="flex items-center gap-1 font-mono text-[10px] font-bold">
                            <ShieldCheck size={11} className="text-emerald-400 animate-pulse" />
                            DEDUCTION ({p.paidFromType.toUpperCase()})
                          </span>
                          <div className="flex gap-3 font-mono text-[10.5px]">
                            <span className="text-zinc-500 font-bold">{p.date}</span>
                            <span className="text-emerald-400 font-bold">-{currency} {p.amount.toLocaleString()}</span>
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
