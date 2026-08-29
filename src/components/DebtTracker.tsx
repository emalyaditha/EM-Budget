import React, { useState } from 'react';
import { Debt, CashAccount, BankCard } from '../types';
import { Plus, AlertCircle, Calendar, Wallet, CornerDownRight, Eye } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';
import { DatePicker } from './DatePicker';
import DebtDetailModal from './DebtDetailModal';

interface DebtTrackerProps {
  debts: Debt[];
  cashAccounts: CashAccount[];
  cards: BankCard[];
  onAddDebt: (debt: Omit<Debt, 'id' | 'payments' | 'remainingAmount'>) => void;
  onIncreaseDebt: (debtId: string, amount: number, accountId?: string, accountType?: 'cash' | 'card') => void;
  onMakeDebtPayment: (debtId: string, amount: number, paidFromId: string, paidFromType: 'cash' | 'card', bankCharge?: number) => void;
  onDeleteDebt: (debtId: string) => void;
  currency: string;
}

export default function DebtTracker({ debts, cashAccounts, cards, onAddDebt, onIncreaseDebt, onMakeDebtPayment, onDeleteDebt, currency }: DebtTrackerProps) {
  const { showToast } = useNotifications();
  const [isAddingDebt, setIsAddingDebt] = useState(false);
  const [source, setSource] = useState('');
  const [totalDebt, setTotalDebt] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [targetAccountId, setTargetAccountId] = useState('');
  const [targetAccountType, setTargetAccountType] = useState<'cash' | 'card' | ''>('');
  const [payingDebtId, setPayingDebtId] = useState<string | null>(null);
  const [increasingDebtId, setIncreasingDebtId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [increaseAmount, setIncreaseAmount] = useState('');
  const [incTargetAccountId, setIncTargetAccountId] = useState('');
  const [incTargetAccountType, setIncTargetAccountType] = useState<'cash' | 'card' | ''>('');
  const [paySourceId, setPaySourceId] = useState('');
  const [paySourceType, setPaySourceType] = useState<'cash' | 'card'>('cash');
  const [payBankCharge, setPayBankCharge] = useState('');
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [detailDebt, setDetailDebt] = useState<Debt | null>(null);
  const sourceInputRef = React.useRef<HTMLInputElement>(null);
  const amountInputRef = React.useRef<HTMLInputElement>(null);
  const dateInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (cashAccounts.length > 0 && !paySourceId) { setPaySourceId(cashAccounts[0].id); setPaySourceType('cash'); }
  }, [cashAccounts, paySourceId]);

  const validateDebtForm = (src: string, amtStr: string, date: string, sub: boolean) => {
    const errs: Record<string, string> = {};
    if (sub || src) {
      if (!src.trim()) errs.source = 'Creditor is required';
      else if (src.trim().length < 3) errs.source = 'At least 3 characters';
      else if (/[<>{}]/.test(src)) errs.source = 'Special characters not allowed';
    }
    if (sub || amtStr) {
      if (!amtStr) errs.amount = 'Amount is required';
      else { const num = parseFloat(amtStr); if (isNaN(num)) errs.amount = 'Must be a number'; else if (num <= 0) errs.amount = 'Must be positive'; }
    }
    if (sub || date) { if (!date) errs.dueDate = 'Due date is required'; }
    setErrors(errs); return Object.keys(errs).length === 0;
  };

  const handleCreateDebt = (e: React.FormEvent) => {
    e.preventDefault(); setSubmitted(true);
    const isValid = validateDebtForm(source, totalDebt, dueDate, true);
    if (!isValid) {
      if (!source.trim()) sourceInputRef.current?.focus();
      else if (!totalDebt || parseFloat(totalDebt) <= 0) amountInputRef.current?.focus();
      else dateInputRef.current?.focus();
      showToast('error', 'Please resolve highlighted errors.'); return;
    }
    let accountName: string | undefined;
    if (targetAccountId && targetAccountType) {
      if (targetAccountType === 'cash') accountName = cashAccounts.find(c => c.id === targetAccountId)?.name;
      else accountName = cards.find(c => c.id === targetAccountId)?.bankName;
    }
    onAddDebt({ debtSource: source.trim(), totalAmount: parseFloat(totalDebt), dueDate, notes: notes || 'No extra notes.', accountId: targetAccountId || undefined, accountType: (targetAccountId && targetAccountType) ? (targetAccountType as 'cash' | 'card') : undefined, accountName });
    setSource(''); setTotalDebt(''); setDueDate(''); setNotes(''); setTargetAccountId(''); setTargetAccountType(''); setIsAddingDebt(false); setSubmitted(false); setErrors({}); showToast('success', 'Debt registered.');
  };

  const handlePayDebtSubmit = (e: React.FormEvent) => {
    e.preventDefault(); setPaymentError(null); if (!payingDebtId) return;
    const amountNum = parseFloat(payAmount) || 0;
    const debtItem = debts.find(d => d.id === payingDebtId); if (!debtItem) return;
    if (amountNum <= 0) { setPaymentError('Amount must be > 0.'); return; }
    if (amountNum > debtItem.remainingAmount) { setPaymentError(`Exceeds remaining ${currency} ${debtItem.remainingAmount.toLocaleString()}`); return; }
    let availableBalance = 0;
    if (paySourceType === 'cash') availableBalance = cashAccounts.find(c => c.id === paySourceId)?.balance ?? 0;
    else availableBalance = cards.find(c => c.id === paySourceId)?.currentBalance ?? 0;
    const chargeNum = paySourceType === 'card' ? (parseFloat(payBankCharge) || 0) : 0;
    if (availableBalance < amountNum + chargeNum) { setPaymentError(`Insufficient balance. Required ${currency} ${(amountNum + chargeNum).toLocaleString()}, available ${currency} ${availableBalance.toLocaleString()}`); return; }
    const isClearingFinal = amountNum === debtItem.remainingAmount;
    onMakeDebtPayment(payingDebtId, amountNum, paySourceId, paySourceType, chargeNum);
    setPayAmount(''); setPayBankCharge(''); setPayingDebtId(null); setPaymentError(null);
    showToast('success', isClearingFinal ? 'Debt fully repaid.' : 'Repayment logged.');
  };

  const handleIncreaseDebtSubmit = (e: React.FormEvent) => {
    e.preventDefault(); if (!increasingDebtId) return;
    const amountNum = parseFloat(increaseAmount) || 0;
    if (amountNum <= 0) { showToast('error', 'Amount must be positive.'); return; }
    onIncreaseDebt(increasingDebtId, amountNum, incTargetAccountId || undefined, incTargetAccountType as 'cash' | 'card' || undefined);
    setIncreaseAmount(''); setIncTargetAccountId(''); setIncTargetAccountType(''); setIncreasingDebtId(null); showToast('success', 'Additional debt added.');
  };

  const handleSelectPaymentSource = (value: string) => { const [id, type] = value.split(':'); setPaySourceId(id); setPaySourceType(type as 'cash' | 'card'); setPaymentError(null); };
  const activeDebts = debts.filter(d => d.remainingAmount > 0);
  const totalRemainingDebt = activeDebts.reduce((sum, d) => sum + d.remainingAmount, 0);
  const totalOriginalDebt = activeDebts.reduce((sum, d) => sum + d.totalAmount, 0);
  const overallClearedPercent = totalOriginalDebt > 0 ? Math.round(((totalOriginalDebt - totalRemainingDebt) / totalOriginalDebt) * 100) : 100;

  return (
    <div id="debt-tracker-vault-view" className="space-y-6">
      <div className="gradient-card p-6 overflow-hidden" style={{ background: 'var(--gradient-card-dark)' }}>
        <div className="flex flex-col sm:flex-row justify-between gap-4 relative z-10">
          <div>
            <p className="eyebrow !text-white/60">Liabilities</p>
            <h2 className="text-[22px] font-bold tracking-tight mt-1 text-white">Debts</h2>
            <p className="text-[13px] mt-1 text-white/60">Outstanding debts · hairline progress · ledger history.</p>
          </div>
          <div className="flex flex-col items-start sm:items-end gap-1 relative z-10">
            <span className="pill !bg-white/10 !border-white/15 !text-white mono !text-[11px]">{overallClearedPercent}% repaid</span>
            <span className="mono text-[26px] font-bold tracking-tight text-white">{currency} {totalRemainingDebt.toLocaleString()}</span>
            <span className="mono text-[11px] text-white/60">remaining · {currency}{totalOriginalDebt.toLocaleString()} original</span>
            <div className="h-2 w-full sm:w-48 mt-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full mw-progress" style={{ width: `${overallClearedPercent}%` }} /></div>
          </div>
        </div>
        <div className="rainbow-bar mt-5 relative z-10 opacity-80" />
      </div>

      <div className="flex justify-between items-center">
        <div><p className="eyebrow">Creditor registry</p><p className="mono text-[11px] mt-1" style={{ color: 'var(--ink-3)' }}>{activeDebts.length} outstanding</p></div>
        {!isAddingDebt && <button onClick={() => setIsAddingDebt(true)} className="btn-primary inline-flex items-center gap-1.5"><Plus size={13} />Add debt</button>}
      </div>

      {isAddingDebt && (
        <form onSubmit={handleCreateDebt} className="card p-6 space-y-4">
          <div className="flex justify-between items-center"><p className="eyebrow">Register liability</p><button type="button" onClick={() => { setIsAddingDebt(false); setErrors({}); setSubmitted(false); }} className="btn-ghost !py-1.5 !px-3 text-[11px]">Cancel</button></div>
          <div>
            <label className="eyebrow block mb-2">Creditor / source</label>
            <input ref={sourceInputRef} type="text" placeholder="e.g. Student Loan" value={source} onChange={e => { setSource(e.target.value); validateDebtForm(e.target.value, totalDebt, dueDate, submitted); }} className="input" />
            {errors.source && <span className="mono text-[11px] mt-1 block" style={{ color: 'var(--danger)' }}>{errors.source}</span>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="eyebrow block mb-2">Principal ({currency})</label><input ref={amountInputRef} type="number" placeholder="0.00" value={totalDebt} onChange={e => { setTotalDebt(e.target.value); validateDebtForm(source, e.target.value, dueDate, submitted); }} className="input mono" />{errors.amount && <span className="mono text-[11px] mt-1 block" style={{ color: 'var(--danger)' }}>{errors.amount}</span>}</div>
            <div><label className="eyebrow block mb-2">Target account</label>
              <select value={targetAccountId && targetAccountType ? `${targetAccountId}:${targetAccountType}` : 'other'} onChange={e => { const v = e.target.value; if (v === 'other') { setTargetAccountId(''); setTargetAccountType(''); } else { const [id, type] = v.split(':'); setTargetAccountId(id); setTargetAccountType(type as 'cash' | 'card'); } }} className="input">
                <option value="other">Other / no receipt</option>
                <optgroup label="Cash">{cashAccounts.map(c => <option key={c.id} value={`${c.id}:cash`}>{c.name}</option>)}</optgroup>
                <optgroup label="Cards">{cards.filter(c => !c.isCanceled).map(card => <option key={card.id} value={`${card.id}:card`}>{card.bankName}</option>)}</optgroup>
              </select>
            </div>
          </div>
          <div><label className="eyebrow block mb-2">Due date</label><DatePicker value={dueDate} onChange={val => { setDueDate(val); validateDebtForm(source, totalDebt, val, submitted); }} />{errors.dueDate && <span className="mono text-[11px] mt-1 block" style={{ color: 'var(--danger)' }}>{errors.dueDate}</span>}</div>
          <div><label className="eyebrow block mb-2">Notes (optional)</label><input type="text" placeholder="Zero-interest plan..." value={notes} onChange={e => setNotes(e.target.value)} className="input" /></div>
          <button type="submit" className="btn-primary w-full">Record liability</button>
        </form>
      )}

      <div className="space-y-3">
        {activeDebts.length === 0 ? (
          <div className="empty mono text-[13px]">No active liabilities — debt-free.</div>
        ) : (
          [...activeDebts].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()).map((debt) => {
            const repaid = debt.totalAmount - debt.remainingAmount;
            const payoffPct = Math.round((repaid / debt.totalAmount) * 100);
            const isFullyPaid = debt.remainingAmount === 0;
            return (
              <div key={debt.id} id={`debt-block-${debt.id}`} data-debt-status={isFullyPaid ? "paid" : "outstanding"} className="card p-5 space-y-4 overflow-hidden relative">
                <div className="rainbow-bar !h-1 !rounded-none absolute top-0 left-0 right-0 opacity-50" />
                <div className="flex flex-col sm:flex-row justify-between gap-3">
                  <div>
                    <h4 className="text-[14px] font-bold">{debt.debtSource}</h4>
                    <p className="mono text-[11px] mt-1 inline-flex items-center gap-1.5" style={{ color: 'var(--ink-2)' }}><Calendar size={12} />Due {debt.dueDate}</p>
                    {debt.accountName && <p className="mono text-[11px] mt-1 inline-flex items-center gap-1.5" style={{ color: 'var(--ink-2)' }}><Wallet size={11} />{debt.accountName}</p>}
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="eyebrow !text-[9px]">Remaining</p>
                    <p className="mono text-[15px] font-bold">{currency} {debt.remainingAmount.toLocaleString()}</p>
                    {deleteConfirmId === debt.id ? (
                      <span className="inline-flex gap-1 mt-2"><button onClick={() => { onDeleteDebt(debt.id); setDeleteConfirmId(null); }} className="btn-primary !py-1 !px-3 text-[11px]">Delete</button><button onClick={() => setDeleteConfirmId(null)} className="btn-ghost !py-1 !px-3 text-[11px]">Cancel</button></span>
                    ) : (
                      <button onClick={() => { setDeleteConfirmId(debt.id); setTimeout(() => setDeleteConfirmId(c => c === debt.id ? null : c), 5000); }} className="mono text-[10px] underline mt-1" style={{ color: 'var(--ink-3)' }}>Delete</button>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between mono text-[11px]"><span style={{ color: 'var(--ink-2)' }}>Payoff</span><span className="font-bold">{payoffPct}% settled</span></div>
                  <div className="h-2 w-full rounded-full bg-[var(--surface-3)] overflow-hidden"><div className="h-full mw-progress rounded-full" style={{ width: `${payoffPct}%`}} /></div>
                  <div className="flex justify-between mono text-[10px]" style={{ color: 'var(--ink-3)' }}><span>Cleared {currency} {repaid.toLocaleString()}</span><span>Principal {currency} {debt.totalAmount.toLocaleString()}</span></div>
                </div>

                <p className="text-[12px] italic leading-relaxed p-3 card-flat" style={{ color: 'var(--ink-2)' }}>"{debt.notes}"</p>

                {!isFullyPaid && payingDebtId !== debt.id && increasingDebtId !== debt.id && (
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => { setPayingDebtId(debt.id); setPaymentError(null); }} className="btn-primary flex-1 text-[12px]">Repay</button>
                    <button onClick={() => setIncreasingDebtId(debt.id)} className="btn-ghost flex-1 text-[12px]">Add more</button>
                    <button onClick={() => setDetailDebt(debt)} className="btn-ghost inline-flex items-center justify-center gap-1.5 !rounded-full text-[12px] px-4"><Eye size={13} />Details</button>
                  </div>
                )}
                {(isFullyPaid || payingDebtId === debt.id || increasingDebtId === debt.id) && (
                  <div className="flex justify-end">
                    <button onClick={() => setDetailDebt(debt)} className="btn-ghost inline-flex items-center gap-1.5 !rounded-full text-[11px] px-3 py-1.5"><Eye size={12} />Details</button>
                  </div>
                )}

                {increasingDebtId === debt.id && (
                  <form onSubmit={handleIncreaseDebtSubmit} className="card-flat p-4 space-y-3">
                    <div className="flex justify-between items-center"><p className="eyebrow">Increase debt</p><button type="button" onClick={() => setIncreasingDebtId(null)} className="mono text-[11px] underline" style={{ color: 'var(--ink-3)' }}>Cancel</button></div>
                    <div><label className="eyebrow block mb-2">Receiving account</label><select value={incTargetAccountId && incTargetAccountType ? `${incTargetAccountId}:${incTargetAccountType}` : 'other'} onChange={e => { const v = e.target.value; if (v === 'other') { setIncTargetAccountId(''); setIncTargetAccountType(''); } else { const [id, type] = v.split(':'); setIncTargetAccountId(id); setIncTargetAccountType(type as 'cash' | 'card'); } }} className="input"><option value="other">Other / indirect</option><optgroup label="Cash">{cashAccounts.map(c => <option key={c.id} value={`${c.id}:cash`}>{c.name}</option>)}</optgroup><optgroup label="Cards">{cards.filter(c => !c.isCanceled).map(card => <option key={card.id} value={`${card.id}:card`}>{card.bankName}</option>)}</optgroup></select></div>
                    <div><label className="eyebrow block mb-2">Amount ({currency})</label><input type="number" placeholder="500" value={increaseAmount} required onChange={e => setIncreaseAmount(e.target.value)} className="input mono" /></div>
                    <button type="submit" className="btn-primary w-full">Update total</button>
                  </form>
                )}

                {payingDebtId === debt.id && (
                  <form onSubmit={handlePayDebtSubmit} className="card-flat p-4 space-y-3">
                    <div className="flex justify-between items-center"><p className="eyebrow inline-flex items-center gap-1"><CornerDownRight size={11} />Repay</p><button type="button" onClick={() => { setPayingDebtId(null); setPaymentError(null); }} className="mono text-[11px] underline" style={{ color: 'var(--ink-3)' }}>Cancel</button></div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div><label className="eyebrow block mb-2">Amount ({currency})</label><input type="number" placeholder="10000" value={payAmount} required onChange={e => { setPayAmount(e.target.value); setPaymentError(null); }} className="input mono" /></div>
                      <div><label className="eyebrow block mb-2">Deduct from</label><select value={`${paySourceId}:${paySourceType}`} onChange={e => handleSelectPaymentSource(e.target.value)} className="input"><optgroup label="Cash">{cashAccounts.map(c => <option key={c.id} value={`${c.id}:cash`}>{c.name} ({currency}{c.balance.toLocaleString()})</option>)}</optgroup><optgroup label="Cards">{cards.filter(c => !c.isCanceled).map(card => <option key={card.id} value={`${card.id}:card`}>{card.bankName} ({currency}{card.currentBalance.toLocaleString()})</option>)}</optgroup></select></div>
                    </div>
                    {paySourceType === 'card' && paySourceId && (
                      <div className="card-flat !p-3 space-y-2"><label className="eyebrow block">Card charge ({currency})</label><input type="number" step="any" placeholder="0" value={payBankCharge} onChange={e => { setPayBankCharge(e.target.value); setPaymentError(null); }} className="input mono" /><p className="mono text-[11px]" style={{ color: 'var(--ink-3)' }}>Optional bank fee deducted from card balance.</p></div>
                    )}
                    {paymentError && <p className="mono text-[11px] p-2 rounded-xl flex gap-1.5" style={{ color: 'var(--danger)', background: 'var(--danger-bg)', border: '1px solid var(--line)' }}><AlertCircle size={13} />{paymentError}</p>}
                    <button type="submit" className="btn-primary w-full">Process repayment</button>
                  </form>
                )}

                {debt.payments && debt.payments.length > 0 && (
                  <div>
                    <p className="eyebrow">Repayment log ({debt.payments.length})</p>
                    <div className="mt-2 divide-y" style={{ borderTop: '1px solid var(--line)' }}>
                      {debt.payments.map((p) => (
                        <div key={p.id} className="flex justify-between items-center py-2.5 mono text-[11px]">
                          <span style={{ color: 'var(--ink-2)' }}>{p.date} · {p.paidFromType}</span>
                          <span className="font-bold">-{currency} {p.amount.toLocaleString()}</span>
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

      {detailDebt && (
        <DebtDetailModal
          debt={debts.find(d => d.id === detailDebt.id) || detailDebt}
          currency={currency}
          cashAccounts={cashAccounts}
          cards={cards}
          onClose={() => setDetailDebt(null)}
          onIncreaseDebt={(id, amt, accId, accType) => { onIncreaseDebt(id, amt, accId, accType); }}
        />
      )}
    </div>
  );
}
