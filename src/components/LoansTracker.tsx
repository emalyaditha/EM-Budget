import React, { useState } from 'react';
import { LoanGiven, CashAccount, BankCard } from '../types';
import { Plus, CheckCircle2, Calendar, ArrowDownLeft, Trash2, Wallet, History, ChevronDown, ChevronUp, ArrowUpRight } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';
import { DatePicker } from './DatePicker';
import { todayLocal } from '../utils';

interface LoansTrackerProps {
  loans: LoanGiven[];
  cashAccounts: CashAccount[];
  cards: BankCard[];
  onAddLoan: (loan: Omit<LoanGiven, 'id' | 'remainingAmount' | 'status' | 'settlements'>, bankCharge?: number) => void;
  onAddSettlement: (loanId: string, amount: number, receivedInId: string, receivedInType: 'cash' | 'card', receivedInName: string, bankCharge?: number) => void;
  onDeleteLoan: (loanId: string) => void;
  onIncreaseLoan: (loanId: string, amount: number, sourceAccountId: string, sourceAccountType: 'cash' | 'card', sourceAccountName: string, notes?: string, bankCharge?: number) => void;
  currency: string;
}

export default function LoansTracker({ loans = [], cashAccounts = [], cards = [], onAddLoan, onAddSettlement, onDeleteLoan, onIncreaseLoan, currency }: LoansTrackerProps) {
  const { showConfirm, showToast } = useNotifications();
  const [isGivingLoan, setIsGivingLoan] = useState(false);
  const [borrowerName, setBorrowerName] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [dateGiven, setDateGiven] = useState(todayLocal());
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [sourceAccountType, setSourceAccountType] = useState<'cash' | 'card'>('cash');
  const [giveLoanBankCharge, setGiveLoanBankCharge] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [increasingLoanId, setIncreasingLoanId] = useState<string | null>(null);
  const [increaseAmount, setIncreaseAmount] = useState('');
  const [increaseSourceId, setIncreaseSourceId] = useState('');
  const [increaseSourceType, setIncreaseSourceType] = useState<'cash' | 'card'>('cash');
  const [increaseNotes, setIncreaseNotes] = useState('');
  const [increaseLoanBankCharge, setIncreaseLoanBankCharge] = useState('');
  const [increaseError, setIncreaseError] = useState<string | null>(null);
  const [settlingLoanId, setSettlingLoanId] = useState<string | null>(null);
  const [settlementAmount, setSettlementAmount] = useState('');
  const [receivedInId, setReceivedInId] = useState('');
  const [receivedInType, setReceivedInType] = useState<'cash' | 'card'>('cash');
  const [settleLoanBankCharge, setSettleLoanBankCharge] = useState('');
  const [settlementError, setSettlementError] = useState<string | null>(null);
  const [expandedLoanId, setExpandedLoanId] = useState<string | null>(null);

  const availableAccounts = [
    ...cashAccounts.map(acc => ({ id: acc.id, name: `${acc.name} (Wallet)`, balance: acc.balance, type: 'cash' as const })),
    ...cards.map(c => ({ id: c.id, name: `${c.bankName} - ${c.cardName} (${c.cardType})`, balance: c.currentBalance, type: 'card' as const })),
  ];

  React.useEffect(() => { if (availableAccounts.length > 0 && !sourceAccountId) { setSourceAccountId(availableAccounts[0].id); setSourceAccountType(availableAccounts[0].type); } }, [cashAccounts, cards]);
  React.useEffect(() => { if (availableAccounts.length > 0 && !increaseSourceId) { setIncreaseSourceId(availableAccounts[0].id); setIncreaseSourceType(availableAccounts[0].type); } }, [cashAccounts, cards, increasingLoanId]);
  React.useEffect(() => { if (availableAccounts.length > 0 && !receivedInId) { setReceivedInId(availableAccounts[0].id); setReceivedInType(availableAccounts[0].type); } }, [cashAccounts, cards, settlingLoanId]);

  const activeLoans = loans.filter(l => l.status !== 'Settled');
  const totalLentAmount = loans.reduce((acc, l) => acc + l.totalAmount, 0);
  const totalRemainingAmount = loans.reduce((acc, l) => acc + l.remainingAmount, 0);
  const totalRecoveredAmount = totalLentAmount - totalRemainingAmount;

  const validateLoanForm = () => {
    const errs: Record<string, string> = {};
    if (!borrowerName.trim()) errs.borrowerName = 'Borrower name required.';
    else if (borrowerName.trim().length < 2) errs.borrowerName = 'At least 2 characters.';
    if (!totalAmount || isNaN(parseFloat(totalAmount)) || parseFloat(totalAmount) <= 0) errs.totalAmount = 'Valid amount required.';
    if (!dateGiven) errs.dateGiven = 'Date required.';
    setErrors(errs); return Object.keys(errs).length === 0;
  };

  const handleGiveLoanSubmit = (e: React.FormEvent) => {
    e.preventDefault(); if (!validateLoanForm()) { showToast('error', 'Resolve errors.'); return; }
    const selectedAcc = availableAccounts.find(a => a.id === sourceAccountId && a.type === sourceAccountType);
    const sourceName = selectedAcc ? selectedAcc.name : 'Unknown Account';
    const chargeVal = sourceAccountType === 'card' ? (parseFloat(giveLoanBankCharge) || 0) : 0;
    onAddLoan({ borrowerName: borrowerName.trim(), totalAmount: parseFloat(totalAmount), dateGiven, sourceAccountId, sourceAccountType, sourceAccountName: sourceName, notes: notes.trim() || 'No notes.' }, chargeVal);
    setBorrowerName(''); setTotalAmount(''); setGiveLoanBankCharge(''); setNotes(''); setIsGivingLoan(false); setErrors({}); showToast('success', 'Loan recorded.');
  };

  const handleSettleSubmit = (e: React.FormEvent) => {
    e.preventDefault(); setSettlementError(null); if (!settlingLoanId) return;
    const currentLoan = loans.find(l => l.id === settlingLoanId); if (!currentLoan) return;
    const amt = parseFloat(settlementAmount);
    if (isNaN(amt) || amt <= 0) { setSettlementError('Amount must be > 0.'); return; }
    if (amt > currentLoan.remainingAmount) { setSettlementError(`Exceeds remaining ${currency} ${currentLoan.remainingAmount.toLocaleString()}.`); return; }
    const destAcc = availableAccounts.find(a => a.id === receivedInId && a.type === receivedInType);
    const destName = destAcc ? destAcc.name : 'Unknown Account';
    const chargeVal = receivedInType === 'card' ? (parseFloat(settleLoanBankCharge) || 0) : 0;
    onAddSettlement(settlingLoanId, amt, receivedInId, receivedInType, destName, chargeVal);
    setSettlementAmount(''); setSettleLoanBankCharge(''); setSettlingLoanId(null); showToast('success', `Settlement ${currency} ${amt.toLocaleString()} credited.`);
  };

  const handleIncreaseSubmit = (e: React.FormEvent, loan: LoanGiven) => {
    e.preventDefault(); setIncreaseError(null);
    const amt = parseFloat(increaseAmount);
    if (isNaN(amt) || amt <= 0) { setIncreaseError('Amount must be > 0.'); return; }
    const selectedAcc = availableAccounts.find(a => a.id === increaseSourceId && a.type === increaseSourceType);
    const sourceName = selectedAcc ? selectedAcc.name : 'Unknown Account';
    const chargeVal = increaseSourceType === 'card' ? (parseFloat(increaseLoanBankCharge) || 0) : 0;
    if (selectedAcc && selectedAcc.balance < amt + chargeVal) { setIncreaseError(`Insufficient ${currency} ${selectedAcc.balance.toLocaleString()} for ${currency} ${(amt + chargeVal).toLocaleString()}.`); return; }
    onIncreaseLoan(loan.id, amt, increaseSourceId, increaseSourceType, sourceName, increaseNotes.trim() || 'Additional capital', chargeVal);
    setIncreaseAmount(''); setIncreaseLoanBankCharge(''); setIncreaseNotes(''); setIncreasingLoanId(null);
  };

  const handleDeleteLoanClick = (loanId: string, name: string) => {
    showConfirm({ message: `Remove loan tracker for "${name}"?`, onConfirm: () => { onDeleteLoan(loanId); showToast('info', 'Loan tracker removed.'); } });
  };

  return (
    <div className="space-y-6" id="loans-section-wrapper">
      <div className="gradient-card p-6 overflow-hidden" style={{ background: 'var(--gradient-card-dark)' }}>
        <div className="flex flex-col sm:flex-row justify-between gap-4 relative z-10">
          <div><p className="eyebrow !text-white/60">Receivables</p><h2 className="text-[22px] font-bold tracking-tight mt-1 text-white">Loans given</h2><p className="text-[13px] mt-1 text-white/60">Capital lent · settlements · ledger history.</p></div>
          <button onClick={() => setIsGivingLoan(!isGivingLoan)} className="pill pill-active self-start sm:self-center inline-flex items-center gap-1.5 !bg-white !text-black !border-white"><Plus size={13} />{isGivingLoan ? 'Close form' : 'Lend & record'}</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5 relative z-10">
          <div className="rounded-[14px] p-3 bg-white/10 border border-white/10"><p className="eyebrow !text-white/60 !text-[9px]">Outstanding</p><p className="mono text-[15px] font-bold mt-1 text-white">{currency} {totalRemainingAmount.toLocaleString()}</p></div>
          <div className="rounded-[14px] p-3 bg-white/10 border border-white/10"><p className="eyebrow !text-white/60 !text-[9px]">Total lent</p><p className="mono text-[15px] font-bold mt-1 text-white">{currency} {totalLentAmount.toLocaleString()}</p></div>
          <div className="rounded-[14px] p-3 bg-white/10 border border-white/10"><p className="eyebrow !text-white/60 !text-[9px]">Recovered</p><p className="mono text-[15px] font-bold mt-1 text-white">{currency} {totalRecoveredAmount.toLocaleString()}</p></div>
        </div>
        <div className="rainbow-bar mt-5 relative z-10 opacity-80" />
      </div>

      {isGivingLoan && (
        <form onSubmit={handleGiveLoanSubmit} className="card p-6 space-y-4">
          <p className="eyebrow">Dispatch agreement</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label className="eyebrow block mb-2">Borrower</label><input type="text" placeholder="e.g. John Doe" value={borrowerName} onChange={e => setBorrowerName(e.target.value)} className="input" required />{errors.borrowerName && <p className="mono text-[11px] mt-1" style={{ color: 'var(--danger)' }}>{errors.borrowerName}</p>}</div>
            <div><label className="eyebrow block mb-2">Amount ({currency})</label><input type="number" step="any" placeholder="0.00" value={totalAmount} onChange={e => setTotalAmount(e.target.value)} className="input mono" required />{errors.totalAmount && <p className="mono text-[11px] mt-1" style={{ color: 'var(--danger)' }}>{errors.totalAmount}</p>}</div>
            <div><label className="eyebrow block mb-2">Debit from</label><select value={`${sourceAccountId}:${sourceAccountType}`} onChange={e => { const [id, type] = e.target.value.split(':'); setSourceAccountId(id); setSourceAccountType(type as 'cash' | 'card'); }} className="input">{availableAccounts.length === 0 ? <option>No accounts</option> : availableAccounts.map(acc => <option key={`${acc.id}:${acc.type}`} value={`${acc.id}:${acc.type}`}>{acc.name} ({currency} {acc.balance.toLocaleString()})</option>)}</select></div>
          </div>
          {sourceAccountType === 'card' && sourceAccountId && (
            <div className="card-flat !p-3 space-y-2"><label className="eyebrow block">Card charge ({currency})</label><input type="number" step="any" placeholder="0" value={giveLoanBankCharge} onChange={e => setGiveLoanBankCharge(e.target.value)} className="input mono" /></div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="eyebrow block mb-2">Date lent</label><DatePicker value={dateGiven} onChange={setDateGiven} />{errors.dateGiven && <p className="mono text-[11px] mt-1" style={{ color: 'var(--danger)' }}>{errors.dateGiven}</p>}</div>
            <div><label className="eyebrow block mb-2">Notes</label><input type="text" placeholder="Friendly loan..." value={notes} onChange={e => setNotes(e.target.value)} className="input" /></div>
          </div>
          <div className="flex justify-end gap-2"><button type="button" onClick={() => { setIsGivingLoan(false); setErrors({}); }} className="btn-ghost">Cancel</button><button type="submit" className="btn-primary">Authorize & log</button></div>
        </form>
      )}

      <div className="space-y-3" id="loans-register-book">
        <div className="flex justify-between items-center px-1"><p className="eyebrow">Register</p><p className="mono text-[11px]" style={{ color: 'var(--ink-3)' }}>{activeLoans.length} active</p></div>
        {activeLoans.length === 0 ? (
          <div className="empty"><Wallet className="mx-auto mb-2 opacity-50" size={20} /><p className="text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>No outstanding loans</p><p className="text-[12px] mt-1" style={{ color: 'var(--ink-2)' }}>Lend & record to start tracking receivables.</p></div>
        ) : (
          <div className="space-y-3">
            {activeLoans.map((loan) => {
              const activeProgress = loan.totalAmount > 0 ? Math.round(((loan.totalAmount - loan.remainingAmount) / loan.totalAmount) * 100) : 0;
              return (
                <div key={loan.id} data-loan-status={loan.status} className="card p-5 space-y-4 overflow-hidden relative">
                  <div className="rainbow-bar !h-1 !rounded-none absolute top-0 left-0 right-0 opacity-40" />
                  <div className="flex flex-col sm:flex-row justify-between gap-3" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 12 }}>
                    <div>
                      <h3 className="text-[14px] font-bold flex items-center gap-2">{loan.borrowerName}<span className="mono text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ border: '1px solid var(--line)', background: 'var(--surface-2)' }}>{loan.status}</span></h3>
                      <p className="mono text-[11px] mt-1 inline-flex items-center gap-1" style={{ color: 'var(--ink-2)' }}><Calendar size={11} />{loan.dateGiven} · {loan.sourceAccountName}</p>
                    </div>
                    <div className="flex items-center gap-1.5 self-start sm:self-center">
                      <button onClick={() => { setIncreasingLoanId(increasingLoanId === loan.id ? null : loan.id); setIncreaseAmount(''); setIncreaseError(null); setSettlingLoanId(null); }} className="btn-ghost !py-1.5 !px-3 text-[11px] inline-flex items-center gap-1"><Plus size={11} />Lend more</button>
                      {loan.status !== 'Settled' && <button onClick={() => { setSettlingLoanId(settlingLoanId === loan.id ? null : loan.id); setSettlementAmount(loan.remainingAmount.toString()); setSettlementError(null); setIncreasingLoanId(null); }} className="btn-primary !py-1.5 !px-3 text-[11px] inline-flex items-center gap-1"><CheckCircle2 size={11} />Receive</button>}
                      <button onClick={() => handleDeleteLoanClick(loan.id, loan.borrowerName)} className="w-7 h-7 rounded-full grid place-items-center" style={{ border: '1px solid var(--line)' }}><Trash2 size={12} /></button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div><p className="eyebrow !text-[9px]">Outstanding</p><p className="mono text-[15px] font-bold mt-1">{currency} {loan.remainingAmount.toLocaleString()}</p></div>
                    <div><p className="eyebrow !text-[9px]">Capital lent</p><p className="mono text-[13px] font-bold mt-1">{currency} {loan.totalAmount.toLocaleString()}</p></div>
                    <div><p className="eyebrow !text-[9px]">Progress</p><div className="flex justify-between mono text-[11px] mt-1"><span style={{ color: 'var(--ink-2)' }}>{activeProgress}% settled</span></div><div className="h-2 w-full mt-2 rounded-full bg-[var(--surface-3)] overflow-hidden"><div className="h-full mw-progress rounded-full" style={{ width: `${activeProgress}%`}} /></div></div>
                  </div>

                  {loan.notes && <p className="text-[12px] italic p-3 card-flat" style={{ color: 'var(--ink-2)' }}>"{loan.notes}"</p>}

                  {settlingLoanId === loan.id && (
                    <form onSubmit={handleSettleSubmit} className="card-flat p-4 space-y-3">
                      <p className="eyebrow inline-flex items-center gap-1"><CheckCircle2 size={11} />Settlement</p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div><label className="eyebrow block mb-2">Amount ({currency})</label><input type="number" step="any" value={settlementAmount} onChange={e => setSettlementAmount(e.target.value)} max={loan.remainingAmount} className="input mono" required /></div>
                        <div><label className="eyebrow block mb-2">Credit to</label><select value={`${receivedInId}:${receivedInType}`} onChange={e => { const [id, type] = e.target.value.split(':'); setReceivedInId(id); setReceivedInType(type as 'cash' | 'card'); }} className="input">{availableAccounts.map(acc => <option key={`dest:${acc.id}:${acc.type}`} value={`${acc.id}:${acc.type}`}>{acc.name} ({currency} {acc.balance.toLocaleString()})</option>)}</select></div>
                        <div className="flex items-end"><button type="submit" className="btn-primary w-full">Post receipt</button></div>
                      </div>
                      {receivedInType === 'card' && receivedInId && <div className="card-flat !p-3"><label className="eyebrow block mb-2">Card charge ({currency})</label><input type="number" step="any" placeholder="0" value={settleLoanBankCharge} onChange={e => setSettleLoanBankCharge(e.target.value)} className="input mono" /></div>}
                      {settlementError && <p className="mono text-[11px]" style={{ color: 'var(--danger)' }}>{settlementError}</p>}
                    </form>
                  )}

                  {increasingLoanId === loan.id && (
                    <form onSubmit={e => handleIncreaseSubmit(e, loan)} className="card-flat p-4 space-y-3" id={`lend-more-form-${loan.id}`}>
                      <p className="eyebrow inline-flex items-center gap-1"><ArrowUpRight size={11} />Lend more</p>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div><label className="eyebrow block mb-2">Amount ({currency})</label><input type="number" step="any" value={increaseAmount} onChange={e => setIncreaseAmount(e.target.value)} placeholder="0.00" className="input mono" required /></div>
                        <div><label className="eyebrow block mb-2">Debit from</label><select value={`${increaseSourceId}:${increaseSourceType}`} onChange={e => { const [id, type] = e.target.value.split(':'); setIncreaseSourceId(id); setIncreaseSourceType(type as 'cash' | 'card'); }} className="input">{availableAccounts.map(acc => <option key={`inc:${acc.id}:${acc.type}`} value={`${acc.id}:${acc.type}`}>{acc.name} ({currency} {acc.balance.toLocaleString()})</option>)}</select></div>
                        <div><label className="eyebrow block mb-2">Notes</label><input type="text" value={increaseNotes} onChange={e => setIncreaseNotes(e.target.value)} placeholder="Top-up" className="input" /></div>
                        <div className="flex items-end"><button type="submit" className="btn-primary w-full">Post add-on</button></div>
                      </div>
                      {increaseSourceType === 'card' && increaseSourceId && <div className="card-flat !p-3"><label className="eyebrow block mb-2">Card charge ({currency})</label><input type="number" step="any" placeholder="0" value={increaseLoanBankCharge} onChange={e => setIncreaseLoanBankCharge(e.target.value)} className="input mono" /></div>}
                      {increaseError && <p className="mono text-[11px]" style={{ color: 'var(--danger)' }}>{increaseError}</p>}
                    </form>
                  )}

                  <div>
                    <button onClick={() => setExpandedLoanId(expandedLoanId === loan.id ? null : loan.id)} className="mono text-[11px] inline-flex items-center gap-1" style={{ color: 'var(--ink-2)' }}><History size={11} />History ({loan.settlements?.length || 0}) {expandedLoanId === loan.id ? <ChevronUp size={11} /> : <ChevronDown size={11} />}</button>
                    {expandedLoanId === loan.id && (
                      <div className="mt-2 divide-y" style={{ borderTop: '1px solid var(--line)' }}>
                        {(!loan.settlements || loan.settlements.length === 0) ? <p className="mono text-[11px] py-3" style={{ color: 'var(--ink-3)' }}>No settlements yet.</p> : loan.settlements.map(s => (
                          <div key={s.id} className="flex justify-between items-center py-2.5">
                            <div><p className="mono text-[11px] font-semibold inline-flex items-center gap-1" style={{ color: 'var(--ink-2)' }}><ArrowDownLeft size={11} />Repaid · {s.receivedInName}</p><p className="mono text-[10px]" style={{ color: 'var(--ink-3)' }}>{s.date}</p></div>
                            <span className="mono text-[12px] font-bold">+ {currency} {s.amount.toLocaleString()}</span>
                          </div>
                        ))}
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
