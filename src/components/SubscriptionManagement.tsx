import React, { useState } from 'react';
import { motion } from 'motion/react';
import { CashAccount, BankCard, Subscription, CategoryExpense } from '../types';
import { Plus, Trash2, Calendar, CreditCard, Play, Pause, CheckCircle2, Clock, DollarSign } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';
import { DatePicker } from './DatePicker';
import { todayLocal } from '../utils';

interface SubscriptionManagementProps {
  subscriptions: Subscription[];
  cashAccounts: CashAccount[];
  cards: BankCard[];
  currency: string;
  onAddSubscription: (sub: Omit<Subscription, 'id'>) => void;
  onDeleteSubscription: (id: string) => void;
  onToggleSubscriptionStatus: (id: string, currentStatus: 'Active' | 'Paused' | 'Cancelled') => void;
  onPaySubscription: (subId: string, accountId: string, accountType: 'cash' | 'card', paymentDate: string, bankCharge?: number) => void;
}

export default function SubscriptionManagement({ subscriptions, cashAccounts, cards, currency, onAddSubscription, onDeleteSubscription, onToggleSubscriptionStatus, onPaySubscription }: SubscriptionManagementProps) {
  const { showConfirm, showToast } = useNotifications();
  const [isAdding, setIsAdding] = useState(false);
  const [subName, setSubName] = useState('');
  const [subAmount, setSubAmount] = useState('');
  const [billingCycle, setBillingCycle] = useState<'Monthly' | 'Yearly'>('Monthly');
  const [dueDate, setDueDate] = useState(() => todayLocal());
  const [category, setCategory] = useState<CategoryExpense>('Entertainment');
  const [instanceType, setInstanceType] = useState('');
  const [instanceTypeSelection, setInstanceTypeSelection] = useState('none');
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [payAccountId, setPayAccountId] = useState('');
  const [payAccountType, setPayAccountType] = useState<'cash' | 'card'>('cash');
  const [payDate, setPayDate] = useState(() => todayLocal());
  const [payBankCharge, setPayBankCharge] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const nameInputRef = React.useRef<HTMLInputElement>(null);
  const amountInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (cashAccounts.length > 0 && !payAccountId) { setPayAccountId(cashAccounts[0].id); setPayAccountType('cash'); }
    else if (cards.length > 0 && !payAccountId) { setPayAccountId(cards[0].id); setPayAccountType('card'); }
  }, [cashAccounts, cards, payAccountId]);

  const validateForm = (name: string, amtStr: string, sub: boolean) => {
    const errs: Record<string, string> = {};
    if (sub || name) {
      if (!name.trim()) errs.name = 'Service name required';
      else if (name.trim().length < 3) errs.name = 'At least 3 characters';
      else if (/[<>{}]/.test(name)) errs.name = 'Special characters not allowed';
    }
    if (sub || amtStr) {
      if (!amtStr) errs.amount = 'Billing sum required';
      else { const num = parseFloat(amtStr); if (isNaN(num)) errs.amount = 'Must be number'; else if (num <= 0) errs.amount = 'Must be positive'; }
    }
    setErrors(errs); return Object.keys(errs).length === 0;
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault(); setSubmitted(true);
    const isValid = validateForm(subName, subAmount, true);
    if (!isValid) { if (!subName.trim()) nameInputRef.current?.focus(); else amountInputRef.current?.focus(); showToast('error', 'Resolve errors.'); return; }
    onAddSubscription({ name: subName.trim(), amount: parseFloat(subAmount), billingCycle, dueDate, category, status: 'Active', instanceType: instanceType ? instanceType.trim() : undefined });
    setSubName(''); setSubAmount(''); setDueDate(todayLocal()); setInstanceType(''); setInstanceTypeSelection('none'); setIsAdding(false); setSubmitted(false); setErrors({}); showToast('success', 'Subscription registered.');
  };

  const handleSelectPayAccount = (val: string) => { const [id, type] = val.split(':'); setPayAccountId(id); setPayAccountType(type as 'cash' | 'card'); };
  const executePayment = () => {
    if (!selectedSubId) return;
    const sub = subscriptions.find(s => s.id === selectedSubId); if (!sub) return;
    let availableBalance = 0;
    if (payAccountType === 'cash') availableBalance = cashAccounts.find(c => c.id === payAccountId)?.balance ?? 0;
    else availableBalance = cards.find(c => c.id === payAccountId)?.currentBalance ?? 0;
    const chargeVal = payAccountType === 'card' ? (parseFloat(payBankCharge) || 0) : 0;
    if (availableBalance < sub.amount + chargeVal) { showToast('error', `Insufficient ${currency}${(sub.amount + chargeVal).toLocaleString()}, have ${currency}${availableBalance.toLocaleString()}`); return; }
    onPaySubscription(sub.id, payAccountId, payAccountType, payDate, chargeVal); setSelectedSubId(null); setPayBankCharge('');
  };
  const handleDelete = (id: string, name: string) => { showConfirm({ message: `Delete "${name}"?`, onConfirm: () => { onDeleteSubscription(id); showToast('info', 'Subscription removed.'); } }); };
  const getDueStatus = (dueDateStr: string, status: string) => {
    if (status !== 'Active') return { label: 'Paused', tone: 'paused' as const };
    const today = new Date(); today.setHours(0,0,0,0);
    const due = new Date(dueDateStr); due.setHours(0,0,0,0);
    const diffDays = Math.round((due.getTime() - today.getTime()) / (1000*60*60*24));
    if (diffDays < 0) return { label: `Overdue ${Math.abs(diffDays)}d`, tone: 'overdue' as const };
    if (diffDays === 0) return { label: 'Due today', tone: 'due' as const };
    if (diffDays <= 5) return { label: `Due in ${diffDays}d`, tone: 'soon' as const };
    return { label: `Due in ${diffDays}d`, tone: 'idle' as const };
  };
  const selectedSubscription = subscriptions.find(s => s.id === selectedSubId);
  const sortedSubscriptions = [...subscriptions].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name));

  return (
    <div className="space-y-6" id="subscription-management-section">
      <div className="gradient-card p-4 sm:p-6 overflow-hidden" style={{ background: 'var(--gradient-card-dark)' }}>
        <div className="flex flex-col sm:flex-row justify-between gap-4 relative z-10">
          <div><p className="eyebrow !text-white/60">Recurring</p><h2 className="text-[22px] font-bold tracking-tight mt-1 text-white">Subscriptions</h2><p className="text-[13px] mt-1 text-white/60">Ledger of recurring charges — status pills, due mono.</p></div>
          <button onClick={() => { setIsAdding(!isAdding); setSelectedSubId(null); }} className="pill pill-active self-start sm:self-center inline-flex items-center gap-1.5 !bg-[var(--accent)] !text-[var(--accent-fg)] !border-[var(--accent)]"><Plus size={13} />{isAdding ? 'Close' : 'Add plan'}</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5 relative z-10">
          <div className="rounded-[14px] p-3 bg-white/10 border border-white/10"><p className="eyebrow !text-white/60 !text-[9px]">Active</p><p className="mono text-[18px] font-bold mt-1 text-white">{subscriptions.filter(s => s.status === 'Active').length}</p></div>
          <div className="rounded-[14px] p-3 bg-white/10 border border-white/10"><p className="eyebrow !text-white/60 !text-[9px]">Monthly total</p><p className="mono text-[15px] font-bold mt-1 text-white">{currency}{subscriptions.filter(s => s.status === 'Active').reduce((sum, s) => sum + s.amount, 0).toLocaleString()}</p></div>
          <div className="rounded-[14px] p-3 bg-white/10 border border-white/10"><p className="eyebrow !text-white/60 !text-[9px]">Upcoming dues</p><p className="mono text-[15px] font-bold mt-1 text-white">{subscriptions.filter(s => { const due = new Date(s.dueDate); const now = new Date(); return s.status === 'Active' && due >= now && due.getMonth() === now.getMonth(); }).length}</p></div>
        </div>
        <div className="rainbow-bar mt-5 relative z-10 opacity-80" />
      </div>

      {isAdding && (
        <form onSubmit={handleCreate} className="card p-6 space-y-4">
          <p className="eyebrow">New subscription</p>
          <div><label className="eyebrow block mb-2">Service name</label><input ref={nameInputRef} type="text" placeholder="e.g. Netflix Premium" value={subName} onChange={e => { setSubName(e.target.value); validateForm(e.target.value, subAmount, submitted); }} className="input" />{errors.name && <span className="mono text-[11px] mt-1 block" style={{ color: 'var(--danger)' }}>{errors.name}</span>}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="eyebrow block mb-2">Amount ({currency})</label><input ref={amountInputRef} type="number" step="0.01" placeholder="0.00" value={subAmount} onChange={e => { setSubAmount(e.target.value); validateForm(subName, e.target.value, submitted); }} className="input mono" />{errors.amount && <span className="mono text-[11px] mt-1 block" style={{ color: 'var(--danger)' }}>{errors.amount}</span>}</div>
            <div><label className="eyebrow block mb-2">Billing cycle</label><select value={billingCycle} onChange={e => setBillingCycle(e.target.value as 'Monthly' | 'Yearly')} className="input"><option value="Monthly">Monthly</option><option value="Yearly">Yearly</option></select></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="eyebrow block mb-2">Next due</label><DatePicker value={dueDate} onChange={setDueDate} /></div>
            <div><label className="eyebrow block mb-2">Category</label><select value={category} onChange={e => setCategory(e.target.value as CategoryExpense)} className="input"><option value="Entertainment">Entertainment</option><option value="Utilities">Utilities</option><option value="Rent">Rent</option><option value="Transport">Transport</option><option value="Shopping">Shopping</option><option value="Medical">Medical</option><option value="Education">Education</option><option value="Insurance">Insurance</option><option value="Other">Other</option></select></div>
          </div>
          <div><label className="eyebrow block mb-2">Instance type (optional)</label><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><select value={instanceTypeSelection} onChange={e => { const v = e.target.value; setInstanceTypeSelection(v); if (v !== 'custom') setInstanceType(v === 'none' ? '' : v); else setInstanceType(''); }} className="input"><option value="none">Not a server</option><option value="Web Service">Web Service</option><option value="PostgreSQL Database">PostgreSQL Database</option><option value="Redis Cache">Redis Cache</option><option value="Background Worker">Background Worker</option><option value="Static Site">Static Site</option><option value="Cron Job">Cron Job</option><option value="custom">Custom...</option></select>{instanceTypeSelection === 'custom' ? <input type="text" placeholder="Custom type" value={instanceType} onChange={e => setInstanceType(e.target.value)} className="input" /> : <span className="mono text-[11px] self-center" style={{ color: 'var(--ink-3)' }}>Preset or custom label.</span>}</div></div>
          <button type="submit" className="btn-primary w-full">Establish subscription</button>
        </form>
      )}

      {selectedSubscription && (
        <div className="card p-6 space-y-4">
          <div className="flex justify-between items-center"><p className="eyebrow inline-flex items-center gap-1"><Calendar size={12} />Settle billing</p><button onClick={() => setSelectedSubId(null)} className="btn-ghost !py-1.5 !px-3 text-[11px]">Cancel</button></div>
          <div className="card-flat p-4 flex justify-between items-center gap-3">
            <div className="min-w-0"><p className="eyebrow !text-[9px]">Service</p><p className="text-[13px] font-bold truncate">{selectedSubscription.name}</p></div>
            <div className="text-right"><p className="eyebrow !text-[9px]">Due</p><p className="mono text-[13px] font-bold">{currency}{selectedSubscription.amount.toLocaleString()}</p></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="eyebrow block mb-2">Deduct from</label><select value={`${payAccountId}:${payAccountType}`} onChange={e => handleSelectPayAccount(e.target.value)} className="input"><optgroup label="Cash">{cashAccounts.map(c => <option key={c.id} value={`${c.id}:cash`}>Wallet: {c.name} ({currency}{c.balance.toLocaleString()})</option>)}</optgroup><optgroup label="Cards">{cards.filter(c => !c.isCanceled).map(c => <option key={c.id} value={`${c.id}:card`}>{c.bankName} - {c.cardName} ({currency}{c.currentBalance.toLocaleString()})</option>)}</optgroup></select></div>
            <div><label className="eyebrow block mb-2">Payment date</label><DatePicker value={payDate} onChange={setPayDate} /></div>
          </div>
          {payAccountType === 'card' && payAccountId && (
            <div className="card-flat !p-3 space-y-2"><label className="eyebrow block">Card charge ({currency})</label><input type="number" step="any" placeholder="0" value={payBankCharge} onChange={e => setPayBankCharge(e.target.value)} className="input mono" /></div>
          )}
          <button onClick={executePayment} className="btn-primary w-full inline-flex items-center justify-center gap-1.5"><CheckCircle2 size={13} />Authorize & post</button>
        </div>
      )}

      {subscriptions.length === 0 ? (
        <div className="empty"><Clock className="mx-auto mb-2 opacity-50" size={20} /><p className="text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>No recurring plans</p><p className="text-[12px] mt-1" style={{ color: 'var(--ink-2)' }}>Add subscriptions to track renewals.</p></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" id="subscriptions-grid">
          {sortedSubscriptions.map(sub => {
            const status = getDueStatus(sub.dueDate, sub.status);
            const pillStyle = sub.status === 'Active' ? { borderColor: 'var(--ink)', color: 'var(--ink)', background: 'var(--surface-2)' } : { borderColor: 'var(--line)', color: 'var(--ink-2)', background: 'var(--surface)' };
            return (
              <motion.div key={sub.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`card p-5 space-y-4 overflow-hidden relative ${selectedSubId === sub.id ? '!border-[var(--ink)]' : ''}`}>
                <div className="rainbow-bar !h-1 !rounded-none absolute top-0 left-0 right-0 opacity-30" />
                <div className="flex justify-between items-start gap-3">
                  <div className="flex gap-3 items-center">
                    <span className="w-11 h-11 rounded-full bg-[var(--ink)] text-[var(--accent-fg)] grid place-items-center"><CreditCard size={16} /></span>
                    <div>
                      <h4 className="text-[14px] font-bold">{sub.name}</h4>
                      <p className="mono text-[11px] mt-0.5 flex flex-wrap gap-1.5 items-center" style={{ color: 'var(--ink-3)' }}><span className="px-2 py-0.5 rounded-full" style={{ border: '1px solid var(--line)' }}>{sub.category}</span>{sub.billingCycle}{sub.instanceType && <span className="px-2 py-0.5 rounded-full" style={{ border: '1px solid var(--line)' }}>{sub.instanceType}</span>}</p>
                    </div>
                  </div>
                  <span className="mono text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0" style={pillStyle}>{status.label}</span>
                </div>
                <div className="ledger-rule" />
                <div className="flex justify-between items-end"><span className="eyebrow">Next renewal</span><span className="mono text-[12px] font-bold">{sub.dueDate}</span></div>
                <div className="flex justify-between items-baseline"><span className="eyebrow">Amount</span><span className="mono text-[20px] font-bold">{currency}{sub.amount.toLocaleString()}</span></div>
                <div className="grid grid-cols-2 gap-2" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                  {sub.status === 'Active' ? (
                    <button type="button" onClick={() => onToggleSubscriptionStatus(sub.id, 'Active')} className="btn-ghost !py-2.5 text-[12px] inline-flex items-center justify-center gap-1"><Pause size={12} />Pause</button>
                  ) : (
                    <button type="button" onClick={() => onToggleSubscriptionStatus(sub.id, 'Paused')} className="btn-ghost !py-2.5 text-[12px] inline-flex items-center justify-center gap-1"><Play size={12} />Resume</button>
                  )}
                  {sub.status === 'Active' && <button type="button" onClick={() => { setSelectedSubId(selectedSubId === sub.id ? null : sub.id); if (isAdding) setIsAdding(false); }} className={selectedSubId === sub.id ? 'btn-primary !py-2.5 text-[12px] inline-flex items-center justify-center gap-1' : 'btn-ghost !py-2.5 text-[12px] inline-flex items-center justify-center gap-1'}><DollarSign size={12} />Settle</button>}
                  <button type="button" onClick={() => handleDelete(sub.id, sub.name)} className="btn-ghost col-span-2 !py-2.5 text-[12px] inline-flex items-center justify-center gap-1" style={{ color: 'var(--danger)' }}><Trash2 size={12} />Delete</button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
