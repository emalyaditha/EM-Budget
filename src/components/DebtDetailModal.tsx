import React, { useState, useMemo } from 'react';
import { Debt, CashAccount, BankCard } from '../types';
import { X, Plus, CornerDownRight, Wallet, Calendar, FileText } from 'lucide-react';

interface DebtDetailModalProps {
  debt: Debt;
  currency: string;
  cashAccounts: CashAccount[];
  cards: BankCard[];
  onClose: () => void;
  onIncreaseDebt: (debtId: string, amount: number, accountId?: string, accountType?: 'cash' | 'card') => void;
}

type TimelineEvent = {
  id: string;
  type: 'Added' | 'Repayment';
  date: string;
  amount: number;
  accountName?: string;
  paidFromType?: 'cash' | 'card';
};

export default function DebtDetailModal({ debt, currency, cashAccounts, cards, onClose, onIncreaseDebt }: DebtDetailModalProps) {
  const [incAmount, setIncAmount] = useState('');
  const [incAccount, setIncAccount] = useState('other');
  const [incError, setIncError] = useState<string | null>(null);

  // Resolve paidFrom name for payments
  const resolveAccountName = (paidFromId: string, paidFromType: 'cash' | 'card'): string => {
    if (paidFromType === 'cash') return cashAccounts.find(c => c.id === paidFromId)?.name || 'Cash';
    return cards.find(c => c.id === paidFromId)?.bankName || cards.find(c => c.id === paidFromId)?.cardName || 'Card';
  };

  const repaid = debt.totalAmount - debt.remainingAmount;
  const payoffPct = debt.totalAmount > 0 ? Math.round((repaid / debt.totalAmount) * 100) : 0;
  const isFullyRepaid = debt.remainingAmount === 0;

  const timeline = useMemo<TimelineEvent[]>(() => {
    const events: TimelineEvent[] = [];
    const incHistory = debt.increaseHistory || [];
    const incSum = incHistory.reduce((s, e) => s + e.amount, 0);
    const initialAmount = Math.max(0, debt.totalAmount - incSum);

    // Initial creation event — use dueDate as fallback (task spec). Prefer updated_at/creation if needed but spec says dueDate.
    events.push({
      id: 'initial',
      type: 'Added',
      date: debt.dueDate,
      amount: initialAmount,
      accountName: debt.accountName,
    });

    for (const ih of incHistory) {
      events.push({
        id: ih.id,
        type: 'Added',
        date: ih.date,
        amount: ih.amount,
        accountName: ih.accountName,
      });
    }

    for (const p of debt.payments || []) {
      events.push({
        id: p.id,
        type: 'Repayment',
        date: p.date,
        amount: p.amount,
        accountName: resolveAccountName(p.paidFromId, p.paidFromType),
        paidFromType: p.paidFromType,
      });
    }

    // Sort by date ascending, then Added before Repayment for same date (stable)
    events.sort((a, b) => {
      const da = new Date(a.date).getTime();
      const db = new Date(b.date).getTime();
      if (da !== db) return da - db;
      if (a.type !== b.type) return a.type === 'Added' ? -1 : 1;
      return a.id.localeCompare(b.id);
    });
    return events;
  }, [debt, cashAccounts, cards]);

  const handleIncrease = (e: React.FormEvent) => {
    e.preventDefault();
    setIncError(null);
    const n = parseFloat(incAmount);
    if (!n || n <= 0) { setIncError('Amount must be positive.'); return; }
    let accountId: string | undefined;
    let accountType: 'cash' | 'card' | undefined;
    if (incAccount !== 'other') {
      const [id, type] = incAccount.split(':');
      accountId = id; accountType = type as 'cash' | 'card';
    }
    onIncreaseDebt(debt.id, n, accountId, accountType);
    setIncAmount(''); setIncAccount('other');
  };

  const handleOverlayClose = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      onClick={handleOverlayClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-[6px]"
      aria-modal="true"
      role="dialog"
    >
      <div
        className="card max-w-[560px] w-full max-h-[92vh] overflow-hidden flex flex-col relative"
        style={{ background: 'var(--surface)' }}
      >
        {/* rainbow accent */}
        <div className="rainbow-bar !h-1.5 !rounded-none shrink-0" />

        {/* header */}
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 shrink-0" style={{ borderBottom: '1px solid var(--line)' }}>
          <div className="min-w-0">
            <p className="eyebrow">My debt detail</p>
            <h3 className="text-[18px] font-bold tracking-tight mt-1 truncate">{debt.debtSource}</h3>
            <div className="flex items-center gap-2 mt-2">
              <span className="pill !py-1 !px-2.5 !text-[10px] mono" style={{ background: isFullyRepaid ? 'var(--surface-2)' : 'var(--surface)', borderColor: 'var(--line)', color: isFullyRepaid ? 'var(--ink-2)' : 'var(--ink)' }}>
                <span className={`w-1.5 h-1.5 rounded-full ${isFullyRepaid ? 'bg-emerald-500' : 'bg-amber-500'} animate-pulse`} />
                {isFullyRepaid ? 'Fully Repaid' : 'Active'}
              </span>
              <span className="mono text-[11px]" style={{ color: 'var(--ink-3)' }}>{debt.payments.length} repayment{debt.payments.length !== 1 ? 's' : ''} · {(debt.increaseHistory?.length || 0)} top-up{(debt.increaseHistory?.length || 0) !== 1 ? 's' : ''}</span>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost !p-2 !rounded-full shrink-0" aria-label="Close">
            <X size={14} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
          {/* Summary 2-col grid */}
          <div>
            <p className="eyebrow mb-3">Summary</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="card-flat p-3 rounded-2xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
                <p className="eyebrow !text-[9px]">Total principal</p>
                <p className="mono text-[13px] font-bold mt-1">{currency} {debt.totalAmount.toLocaleString()}</p>
              </div>
              <div className="card-flat p-3 rounded-2xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
                <p className="eyebrow !text-[9px]">Remaining</p>
                <p className="mono text-[13px] font-bold mt-1">{currency} {debt.remainingAmount.toLocaleString()}</p>
              </div>
              <div className="card-flat p-3 rounded-2xl flex gap-2 items-start" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
                <Calendar size={12} className="mt-0.5 shrink-0" style={{ color: 'var(--ink-3)' }} />
                <div><p className="eyebrow !text-[9px]">Due date</p><p className="mono text-[12px] font-medium mt-1">{debt.dueDate}</p></div>
              </div>
              <div className="card-flat p-3 rounded-2xl flex gap-2 items-start" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
                <Wallet size={12} className="mt-0.5 shrink-0" style={{ color: 'var(--ink-3)' }} />
                <div><p className="eyebrow !text-[9px]">Receipt account</p><p className="mono text-[12px] font-medium mt-1 truncate">{debt.accountName || 'Other / indirect'}</p></div>
              </div>
            </div>
            {debt.notes && (
              <div className="mt-3 p-3 rounded-2xl flex gap-2" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
                <FileText size={12} className="mt-0.5 shrink-0" style={{ color: 'var(--ink-3)' }} />
                <p className="text-[12px] leading-relaxed italic" style={{ color: 'var(--ink-2)' }}>"{debt.notes}"</p>
              </div>
            )}
            {/* progress */}
            <div className="mt-4 space-y-2">
              <div className="flex justify-between mono text-[11px]"><span style={{ color: 'var(--ink-2)' }}>Settlement progress</span><span className="font-bold">{payoffPct}% settled</span></div>
              <div className="h-2 w-full rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}><div className="h-full mw-progress rounded-full" style={{ width: `${payoffPct}%` }} /></div>
              <div className="flex justify-between mono text-[10px]" style={{ color: 'var(--ink-3)' }}><span>Cleared {currency} {repaid.toLocaleString()}</span><span>{currency} {debt.totalAmount.toLocaleString()} principal</span></div>
            </div>
          </div>

          {/* Timeline */}
          <div>
            <p className="eyebrow mb-3">Ledger timeline</p>
            {timeline.length === 0 ? (
              <div className="empty mono text-[12px]">No activity yet.</div>
            ) : (
              <div className="relative pl-6">
                {/* vertical line */}
                <div className="absolute left-[11px] top-2 bottom-2 w-px" style={{ background: 'var(--line)' }} />
                <div className="space-y-3">
                  {timeline.map((ev) => (
                    <div key={ev.id} className="relative flex gap-3 items-start">
                      {/* icon */}
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 z-10 border"
                        style={{
                          background: ev.type === 'Added' ? 'color-mix(in srgb, #22c55e 14%, var(--surface))' : 'var(--surface)',
                          borderColor: ev.type === 'Added' ? '#22c55e' : 'var(--line-strong)',
                          color: ev.type === 'Added' ? '#16a34a' : 'var(--ink-2)'
                        }}
                      >
                        {ev.type === 'Added' ? <Plus size={12} /> : <CornerDownRight size={12} />}
                      </div>
                      <div className="flex-1 min-w-0 card-flat px-3 py-2.5 rounded-2xl flex justify-between items-center gap-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
                        <div className="min-w-0">
                          <p className="mono text-[11px] font-bold flex items-center gap-1.5">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold tracking-wide ${ev.type === 'Added' ? 'bg-emerald-500 text-white' : 'bg-[var(--ink)] text-[var(--surface)]'}`}>{ev.type}</span>
                            <span className="mono" style={{ color: 'var(--ink-3)' }}>{ev.date}</span>
                          </p>
                          <p className="mono text-[11px] mt-1 truncate" style={{ color: 'var(--ink-2)' }}>
                            {ev.type === 'Added'
                              ? (ev.accountName ? `→ ${ev.accountName}` : '→ Other / indirect')
                              : `via ${ev.accountName} · ${ev.paidFromType}`}
                          </p>
                        </div>
                        <span className="mono text-[12px] font-bold shrink-0" style={{ color: ev.type === 'Added' ? '#16a34a' : 'var(--ink)' }}>
                          {ev.type === 'Added' ? '+' : '-'}{currency} {ev.amount.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* empty states per spec */}
            {(!debt.payments || debt.payments.length === 0) && (
              <p className="mono text-[11px] mt-3" style={{ color: 'var(--ink-3)' }}>No repayments yet</p>
            )}
            {(!debt.increaseHistory || debt.increaseHistory.length === 0) && (
              <p className="mono text-[11px] mt-1" style={{ color: 'var(--ink-3)' }}>No top-ups — only initial principal.</p>
            )}
          </div>

          {/* Add-again inside modal */}
          <form onSubmit={handleIncrease} className="card-flat p-4 space-y-3 rounded-2xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
            <p className="eyebrow">Increase debt again</p>
            <div>
              <label className="eyebrow block mb-2">Receiving account</label>
              <select value={incAccount} onChange={e => setIncAccount(e.target.value)} className="input">
                <option value="other">Other / indirect</option>
                <optgroup label="Cash">{cashAccounts.map(c => <option key={c.id} value={`${c.id}:cash`}>{c.name}</option>)}</optgroup>
                <optgroup label="Cards">{cards.filter(c => !c.isCanceled).map(card => <option key={card.id} value={`${card.id}:card`}>{card.bankName} — {card.cardName}</option>)}</optgroup>
              </select>
            </div>
            <div>
              <label className="eyebrow block mb-2">Amount ({currency})</label>
              <input type="number" placeholder="500" value={incAmount} onChange={e => { setIncAmount(e.target.value); setIncError(null); }} className="input mono" />
            </div>
            {incError && <p className="mono text-[11px]" style={{ color: 'var(--danger, #ef4444)' }}>{incError}</p>}
            <button type="submit" className="btn-primary w-full">Update total</button>
          </form>
        </div>

        <div className="px-6 py-4 shrink-0 flex justify-end" style={{ borderTop: '1px solid var(--line)' }}>
          <button onClick={onClose} className="btn-ghost">Close</button>
        </div>
      </div>
    </div>
  );
}
