import React, { useState } from 'react';
import { CashAccount, BankCard, Subscription, CategoryExpense } from '../types';
import { Plus, Trash2, Calendar, CreditCard, Wallet, Play, Pause, AlertTriangle, CheckCircle2, Sparkles, DollarSign, Clock } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';
import { DatePicker } from './DatePicker';

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

export default function SubscriptionManagement({
  subscriptions,
  cashAccounts,
  cards,
  currency,
  onAddSubscription,
  onDeleteSubscription,
  onToggleSubscriptionStatus,
  onPaySubscription,
}: SubscriptionManagementProps) {
  const { showConfirm, showToast } = useNotifications();
  const [isAdding, setIsAdding] = useState(false);

  // Form states
  const [subName, setSubName] = useState('');
  const [subAmount, setSubAmount] = useState('');
  const [billingCycle, setBillingCycle] = useState<'Monthly' | 'Yearly'>('Monthly');
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState<CategoryExpense>('Entertainment');
  
  // Payment states
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [payAccountId, setPayAccountId] = useState('');
  const [payAccountType, setPayAccountType] = useState<'cash' | 'card'>('cash');
  const [payDate, setPayDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [payBankCharge, setPayBankCharge] = useState('');

  // Validation structures
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  // Autofocus input refs
  const nameInputRef = React.useRef<HTMLInputElement>(null);
  const amountInputRef = React.useRef<HTMLInputElement>(null);

  // Initial account setup for payment choice
  React.useEffect(() => {
    if (cashAccounts.length > 0 && !payAccountId) {
      setPayAccountId(cashAccounts[0].id);
      setPayAccountType('cash');
    } else if (cards.length > 0 && !payAccountId) {
      setPayAccountId(cards[0].id);
      setPayAccountType('card');
    }
  }, [cashAccounts, cards, payAccountId]);

  const validateForm = (name: string, amtStr: string, sub: boolean) => {
    const errs: Record<string, string> = {};
    if (sub || name) {
      if (!name.trim()) {
        errs.name = 'Service name is required';
      } else if (name.trim().length < 3) {
        errs.name = 'Service name must be at least 3 characters';
      } else if (/[<>{}]/.test(name)) {
        errs.name = 'Special characters are not allowed';
      }
    }
    if (sub || amtStr) {
      if (!amtStr) {
        errs.amount = 'Billing sum is required';
      } else {
        const num = parseFloat(amtStr);
        if (isNaN(num)) {
          errs.amount = 'Must be a valid number';
        } else if (num <= 0) {
          errs.amount = 'Billing sum must be positive';
        }
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const isValid = validateForm(subName, subAmount, true);
    if (!isValid) {
      if (!subName.trim()) {
        nameInputRef.current?.focus();
      } else {
        amountInputRef.current?.focus();
      }
      showToast('error', 'Please resolve highlighted details errors.');
      return;
    }

    onAddSubscription({
      name: subName.trim(),
      amount: parseFloat(subAmount),
      billingCycle,
      dueDate,
      category,
      status: 'Active',
    });

    setSubName('');
    setSubAmount('');
    setDueDate(new Date().toISOString().split('T')[0]);
    setIsAdding(false);
    setSubmitted(false);
    setErrors({});
    showToast('success', 'Subscription plan registered successfully!');
  };

  const handleSelectPayAccount = (val: string) => {
    const [id, type] = val.split(':');
    setPayAccountId(id);
    setPayAccountType(type as 'cash' | 'card');
  };

  const executePayment = () => {
    if (!selectedSubId) return;
    const sub = subscriptions.find(s => s.id === selectedSubId);
    if (!sub) return;

    // Balance validation
    let availableBalance = 0;
    if (payAccountType === 'cash') {
      const match = cashAccounts.find(c => c.id === payAccountId);
      availableBalance = match ? match.balance : 0;
    } else {
      const match = cards.find(c => c.id === payAccountId);
      availableBalance = match ? match.currentBalance : 0;
    }

    const chargeVal = payAccountType === 'card' ? (parseFloat(payBankCharge) || 0) : 0;

    if (availableBalance < sub.amount + chargeVal) {
      showToast('error', `Insufficient funds including charges! Required ${currency}${(sub.amount + chargeVal).toLocaleString()}, available: ${currency}${availableBalance.toLocaleString()}`);
      return;
    }

    onPaySubscription(sub.id, payAccountId, payAccountType, payDate, chargeVal);
    setSelectedSubId(null);
    setPayBankCharge('');
  };

  const handleDelete = (id: string, name: string) => {
    showConfirm({
      message: `Are you sure you want to permanently delete the "${name}" subscription plan?`,
      onConfirm: () => {
        onDeleteSubscription(id);
        showToast('info', 'Subscription plan removed.');
      }
    });
  };

  // Helper: check subscription due warnings
  const getDueStatus = (dueDateStr: string, status: string) => {
    if (status !== 'Active') return { label: 'Paused', color: 'text-zinc-500 bg-zinc-950 border-zinc-900 font-mono text-[9px]' };
    
    const today = new Date();
    today.setHours(0,0,0,0);
    const due = new Date(dueDateStr);
    due.setHours(0,0,0,0);

    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { label: `Overdue by ${Math.abs(diffDays)}d`, color: 'text-rose-400 bg-rose-950/40 border border-rose-900/40 font-mono font-bold text-[9px]' };
    }
    if (diffDays === 0) {
      return { label: 'Due Today', color: 'text-amber-400 bg-amber-955/45 border border-amber-900/50 animate-pulse font-mono font-bold text-[9px]' };
    }
    if (diffDays <= 5) {
      return { label: `Due in ${diffDays}d`, color: 'text-amber-500 bg-amber-950/20 border border-amber-900/20 font-mono font-bold text-[9px]' };
    }
    return { label: `Due in ${diffDays}d`, color: 'text-[#8aa8bb] bg-[#050510]/60 border border-zinc-850 font-mono font-bold text-[9px]' };
  };

  const selectedSubscription = subscriptions.find(s => s.id === selectedSubId);

  const sortedSubscriptions = [...subscriptions].sort((a, b) => {
    return a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-6 animate-fade-in" id="subscription-management-section">
      
      {/* 1. Header and Add Trigger */}
      <div className="flex justify-between items-center bg-card border border-border p-4 rounded-2xl">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-indigo-500 dark:text-indigo-400" />
          <span className="text-xs font-mono font-bold text-foreground uppercase tracking-wider">Active Run-Rates & Subscriptions</span>
        </div>
        <button
          onClick={() => {
            setIsAdding(!isAdding);
            setSelectedSubId(null);
          }}
          className="px-4 py-2 bg-zinc-900 border border-zinc-800 text-white hover:border-zinc-500 font-mono text-[10px] uppercase font-bold rounded-xl flex items-center gap-1.5 cursor-pointer transition-all shadow-md"
        >
          <Plus size={12} className="text-indigo-400" />
          {isAdding ? 'Collapse' : 'Add Recuring Plan'}
        </button>
      </div>

      {/* 2. New Subscription Panel */}
      {isAdding && (
        <form onSubmit={handleCreate} className="bg-gradient-to-br from-[#0c0c0e] to-zinc-950 border border-zinc-805 border-zinc-800 rounded-[28px] p-6 shadow-2xl space-y-4 animate-fade-in" id="add-subscription-form">
          <div className="flex gap-2 items-center text-indigo-400 font-bold text-[10px] font-mono tracking-wider uppercase mb-2">
            <Sparkles size={12} />
            <span>Setup New Recurring Subscription</span>
          </div>

          <div>
            <label className="text-[9px] text-zinc-400 font-mono font-bold uppercase tracking-wider block mb-1.5">Service name</label>
            <input
              ref={nameInputRef}
              type="text"
              placeholder="e.g. Netflix Premium, AWS Cloud Hosting, Canva Premium"
              value={subName}
              onChange={(e) => {
                setSubName(e.target.value);
                validateForm(e.target.value, subAmount, submitted);
              }}
              className={`w-full bg-[#050510]/50 border text-white text-xs rounded-xl px-4 py-3.5 focus:outline-none transition-all placeholder:text-zinc-650 ${
                errors.name
                  ? 'border-rose-500 focus:border-rose-500'
                  : subName && !errors.name
                  ? 'border-blue-500 focus:border-emerald-500'
                  : 'border-zinc-850 hover:border-zinc-700 focus:border-zinc-500'
              }`}
            />
            {errors.name && (
              <span className="text-rose-400 font-mono text-[9px] mt-1.5 block">{errors.name}</span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[9px] text-zinc-400 font-mono font-bold uppercase tracking-wider block mb-1.5">Billing Sum ({currency})</label>
              <input
                ref={amountInputRef}
                type="number"
                step="0.01"
                placeholder="0.00"
                value={subAmount}
                onChange={(e) => {
                  setSubAmount(e.target.value);
                  validateForm(subName, e.target.value, submitted);
                }}
                className={`w-full bg-[#050510]/55 border text-white text-xs rounded-xl px-4 py-3.5 focus:outline-none font-mono font-bold transition-all ${
                  errors.amount
                    ? 'border-rose-500 focus:border-rose-500'
                    : subAmount && !errors.amount
                    ? 'border-[var(--accent-primary)] focus:border-[var(--accent-primary)]'
                    : 'border-zinc-850 focus:border-zinc-550 focus:border-zinc-500'
                }`}
              />
              {errors.amount && (
                <span className="text-rose-400 font-mono text-[9px] mt-1.5 block">{errors.amount}</span>
              )}
            </div>
            <div>
              <label className="text-[9px] text-zinc-400 font-mono font-bold uppercase tracking-wider block mb-1.5">Billing Interval</label>
              <select
                value={billingCycle}
                onChange={(e) => setBillingCycle(e.target.value as 'Monthly' | 'Yearly')}
                className="w-full bg-[#050510]/50 border border-zinc-85c border-zinc-850 hover:border-zinc-700 text-zinc-300 text-xs rounded-xl px-2.5 py-3.5 focus:outline-none font-medium cursor-pointer"
              >
                <option value="Monthly">Monthly Cycle</option>
                <option value="Yearly">Yearly Cycle</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[9px] text-zinc-400 font-mono font-bold uppercase tracking-wider block mb-1.5">Next billing Date</label>
              <DatePicker 
                value={dueDate} 
                onChange={setDueDate} 
                required 
              />
            </div>
            <div>
              <label className="text-[9px] text-zinc-400 font-mono font-bold uppercase tracking-wider block mb-1.5">Expense Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as CategoryExpense)}
                className="w-full bg-[#050510]/50 border border-zinc-850 hover:border-zinc-700 text-zinc-300 text-xs rounded-xl px-2.5 py-3.5 focus:outline-none focus:border-zinc-500 cursor-pointer"
              >
                <option value="Entertainment">Entertainment</option>
                <option value="Utilities">Utilities</option>
                <option value="Rent">Rent</option>
                <option value="Transport">Transport</option>
                <option value="Shopping">Shopping</option>
                <option value="Medical">Medical</option>
                <option value="Education">Education</option>
                <option value="Insurance">Insurance</option>
                <option value="Other">Other Expenses</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3.5 bg-white text-black font-mono font-bold uppercase tracking-widest text-[10px] rounded-xl hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2 mt-2 cursor-pointer shadow-lg"
          >
            <Plus size={14} className="text-[var(--accent-primary)]" />
            Establish Subscription
          </button>
        </form>
      )}

      {/* 3. Subscription Payment Modal (Inline Panel) */}
      {selectedSubscription && (
        <div className="bg-gradient-to-br from-[#0c0c0f] to-zinc-950 border border-amber-500/20 p-6 rounded-[28px] space-y-4 shadow-2xl animate-fade-in animate-pulse-ring" id="subscription-payment-panel">
          <div className="flex justify-between items-center">
            <div className="flex gap-2 items-center text-amber-400 font-bold text-[10px] font-mono tracking-wider uppercase">
              <Calendar size={13} />
              <span>Settle Active Subscription Billing</span>
            </div>
            <button 
              onClick={() => setSelectedSubId(null)}
              className="text-zinc-500 hover:text-zinc-300 font-mono text-[9px] uppercase font-bold cursor-pointer"
            >
              Cancel
            </button>
          </div>

          <div className="bg-black/80 p-4 border border-zinc-900 rounded-2xl flex justify-between items-center">
            <div>
              <span className="text-zinc-550 text-[9px] font-mono font-bold uppercase block text-zinc-500">SERVICE TO DEBIT</span>
              <span className="text-white text-sm font-extrabold font-sans leading-relaxed">{selectedSubscription.name}</span>
            </div>
            <div className="text-right">
              <span className="text-zinc-550 text-[9px] font-mono font-bold uppercase block text-zinc-500">SUM DUE</span>
              <span className="text-[var(--accent-primary)] text-sm font-mono font-black">{currency}{selectedSubscription.amount.toLocaleString()}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="text-[9px] text-zinc-400 font-mono font-bold uppercase tracking-wider block mb-1">Deduct Funds From</label>
              <select
                value={`${payAccountId}:${payAccountType}`}
                onChange={(e) => handleSelectPayAccount(e.target.value)}
                className="w-full bg-black border border-zinc-855 hover:border-zinc-700 text-zinc-300 text-xs rounded-xl px-2.5 py-3 focus:outline-none font-bold"
              >
                <optgroup label="Cash Wallets/Accounts" className="bg-[#0c0c0e] text-zinc-400">
                  {cashAccounts.map(c => (
                    <option key={c.id} value={`${c.id}:cash`}>Wallet: {c.name} ({currency}{c.balance.toLocaleString()})</option>
                  ))}
                </optgroup>
                <optgroup label="Bank Cards" className="bg-[#0c0c0e] text-zinc-400">
                  {cards.filter(c => !c.isCanceled).map(c => (
                    <option key={c.id} value={`${c.id}:card`}>{c.bankName} - {c.cardName} ({currency}{c.currentBalance.toLocaleString()})</option>
                  ))}
                </optgroup>
              </select>
            </div>

            <div>
              <label className="text-[9px] text-zinc-400 font-mono font-bold uppercase tracking-wider block mb-1">Payment Settle Date</label>
              <DatePicker 
                value={payDate} 
                onChange={setPayDate} 
              />
            </div>
          </div>

          {payAccountType === 'card' && payAccountId && (
            <div className="p-3.5 bg-zinc-950/40 border border-zinc-900 rounded-xl space-y-1 animate-fade-in text-xs">
              <label className="text-[10px] text-zinc-400 font-mono font-bold block uppercase pl-0.5">Optional Bank Card Charge ({currency})</label>
              <input
                type="number"
                step="any"
                placeholder="e.g. 150 (Leave blank or 0 if none)"
                value={payBankCharge}
                onChange={(e) => setPayBankCharge(e.target.value)}
                className="w-full bg-black border border-zinc-850 rounded-xl text-xs px-3.5 py-2.5 focus:outline-none focus:border-zinc-700 font-mono text-white"
              />
              <p className="text-[9px] text-zinc-500 font-mono pl-0.5 leading-normal">Paying subscriptions from a card might trigger transaction processing fees. This charge is recorded as a bank fee expense and deducted from the card balance.</p>
            </div>
          )}

          <button
            onClick={executePayment}
            className="w-full py-3.5 bg-amber-500 text-black font-mono font-bold uppercase tracking-widest text-[10px] rounded-xl hover:bg-amber-400 transition-colors flex items-center justify-center gap-2 mt-4 cursor-pointer shadow-lg"
          >
            <CheckCircle2 size={13} />
            Authorize & post to journal
          </button>
        </div>
      )}

      {/* 4. Subscriptions List view */}
      {subscriptions.length === 0 ? (
        <div className="bg-[#050505]/45 border border-zinc-850 p-12 rounded-[28px] text-center text-zinc-500 space-y-3 animate-fade-in">
          <Clock className="mx-auto text-zinc-600" size={28} />
          <h4 className="text-xs font-bold font-mono text-zinc-400 uppercase tracking-widest">Ready for recurring Dues</h4>
          <p className="text-[11px] leading-relaxed max-w-[325px] mx-auto text-zinc-500">
            Keep track of monthly servers, Netflix accounts, subscription plans, and yearly renewals with instant Ledger postings.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5" id="subscriptions-grid">
          {sortedSubscriptions.map(sub => {
            const statusStyle = getDueStatus(sub.dueDate, sub.status);
            return (
              <div 
                key={sub.id} 
                className={`bg-card text-card-foreground border rounded-[28px] p-5.5 relative overflow-hidden transition-all duration-350 flex flex-col justify-between ${
                  selectedSubId === sub.id 
                    ? 'border-indigo-500 shadow-xl ring-1 ring-indigo-500/20' 
                    : 'border-zinc-850 dark:border-zinc-850 hover:border-zinc-800 shadow-md'
                }`}
              >
                {/* Background decorative category tag */}
                <span className="absolute bottom-2 right-4 text-[32px] font-black font-mono opacity-[0.015] text-white dark:text-zinc-650 uppercase select-none pointer-events-none">
                  {sub.category}
                </span>

                <div className="space-y-4">
                  {/* Top line summary info */}
                  <div className="flex justify-between items-start gap-3">
                    <div>
                      <h4 className="font-extrabold text-card-foreground text-base tracking-tight leading-tight">{sub.name}</h4>
                      <div className="flex gap-2 items-center mt-1">
                        <span className="text-[8.5px] font-mono bg-muted text-muted-foreground border border-zinc-200 dark:border-zinc-800 px-2 py-0.5 rounded-full capitalize font-bold tracking-wide">
                          {sub.category}
                        </span>
                        <span className="text-[9.5px] font-sans text-muted-foreground font-bold">• {sub.billingCycle}</span>
                      </div>
                    </div>

                    <div className={`px-2.5 py-1 rounded-xl font-mono text-[9px] font-bold tracking-tight border ${statusStyle.color}`}>
                      {statusStyle.label}
                    </div>
                  </div>

                  {/* Pricing Sum */}
                  <div className="flex justify-between items-baseline pt-2 border-t border-zinc-150 dark:border-zinc-850/60">
                    <span className="text-[10px] font-black text-muted-foreground font-mono tracking-wider">CYCLE TOTAL:</span>
                    <span className="text-lg font-mono font-black text-card-foreground">
                      {currency}{sub.amount.toLocaleString()}
                    </span>
                  </div>

                  {/* Due detail info */}
                  <div className="space-y-1.5 font-mono text-[10px] text-muted-foreground bg-muted p-3 rounded-2xl border border-zinc-200 dark:border-zinc-905">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground uppercase font-bold text-[8.5px]">NEXT BILLING DUE:</span>
                      <span className="font-bold text-card-foreground tracking-tight">{sub.dueDate}</span>
                    </div>
                    {sub.lastPaidDate && (
                      <div className="flex justify-between border-t border-zinc-200 dark:border-zinc-900/60 pt-1.5 mt-1.5 font-bold text-[8.5px]">
                        <span className="text-muted-foreground uppercase">LAST SETTLED DATE:</span>
                        <span className="text-[var(--accent-primary)] tracking-tight">{sub.lastPaidDate}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Multi actions triggers footer */}
                <div className="flex gap-2.5 mt-5 pt-4.5 border-t border-zinc-200 dark:border-zinc-850">
                  {sub.status === 'Active' ? (
                    <button
                      type="button"
                      onClick={() => onToggleSubscriptionStatus(sub.id, 'Active')}
                      className="px-3 py-2 bg-muted hover:bg-muted/80 text-muted-foreground hover:text-card-foreground rounded-xl border border-zinc-200 dark:border-zinc-850 flex items-center gap-1.5 cursor-pointer transition text-[9px] font-mono uppercase font-bold"
                      title="Pause tracking plans temporarily"
                    >
                      <Pause size={10} className="text-amber-500" />
                      Pause Plan
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onToggleSubscriptionStatus(sub.id, 'Paused')}
                      className="px-3 py-2 bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/35 rounded-xl border border-[var(--accent-primary)]/40 flex items-center gap-1.5 cursor-pointer transition text-[9px] font-mono uppercase font-bold animate-pulse"
                      title="Resume tracking membership cycle"
                    >
                      <Play size={10} className="text-[var(--accent-primary)]" />
                      Resume
                    </button>
                  )}

                  {sub.status === 'Active' && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSubId(selectedSubId === sub.id ? null : sub.id);
                        if (isAdding) setIsAdding(false);
                      }}
                      className={`flex-1 py-1 px-2.5 font-mono text-[9px] uppercase font-bold rounded-xl border flex items-center justify-center gap-1.5 cursor-pointer transition ${
                        selectedSubId === sub.id
                          ? 'bg-amber-500 text-black border-amber-600 font-extrabold shadow-md'
                          : 'bg-muted text-card-foreground border-zinc-200 dark:border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      <DollarSign size={10.5} />
                      Settle Payment
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDelete(sub.id, sub.name)}
                    className="p-1.5 hover:bg-rose-950/20 text-zinc-500 hover:text-rose-450 bg-transparent border border-transparent hover:border-rose-950 rounded-xl cursor-pointer transition"
                    title="Delete plan"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
