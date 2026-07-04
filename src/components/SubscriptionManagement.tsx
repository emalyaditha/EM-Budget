import React, { useState } from 'react';
import { motion } from 'motion/react';
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
  const [instanceType, setInstanceType] = useState('');
  const [instanceTypeSelection, setInstanceTypeSelection] = useState('none');
  
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
      instanceType: instanceType ? instanceType.trim() : undefined,
    });

    setSubName('');
    setSubAmount('');
    setDueDate(new Date().toISOString().split('T')[0]);
    setInstanceType('');
    setInstanceTypeSelection('none');
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
    if (status !== 'Active') return { label: 'Paused', color: 'text-muted bg-card border-zinc-900 font-mono text-[9px]' };
    
    const today = new Date();
    today.setHours(0,0,0,0);
    const due = new Date(dueDateStr);
    due.setHours(0,0,0,0);

    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { label: `Overdue by ${Math.abs(diffDays)}d`, color: 'text-danger bg-rose-950/40 border border-rose-900/40 font-mono font-bold text-[9px]' };
    }
    if (diffDays === 0) {
      return { label: 'Due Today', color: 'text-amber-400 bg-amber-955/45 border border-amber-900/50 animate-pulse font-mono font-bold text-[9px]' };
    }
    if (diffDays <= 5) {
      return { label: `Due in ${diffDays}d`, color: 'text-amber-500 bg-amber-950/20 border border-amber-900/20 font-mono font-bold text-[9px]' };
    }
    return { label: `Due in ${diffDays}d`, color: 'text-[#8aa8bb] bg-[#050510]/60 border border-default font-mono font-bold text-[9px]' };
  };

  const selectedSubscription = subscriptions.find(s => s.id === selectedSubId);

  const sortedSubscriptions = [...subscriptions].sort((a, b) => {
    return a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-8 animate-fade-in" id="subscription-management-section">
      
      {/* 1. Header and Stats */}
      <div className="space-y-6">
        <div className="flex justify-between items-end">
          <div>
            <h2 className="text-2xl font-black text-primary tracking-tight">Subscriptions</h2>
            <p className="text-muted text-sm mt-1">Manage recurring income, expenses, and subscriptions.</p>
          </div>
          <button
            onClick={() => {
              setIsAdding(!isAdding);
              setSelectedSubId(null);
            }}
            className="px-5 py-2.5 bg-card border border-default text-primary hover:border-default font-mono text-xs uppercase font-bold rounded-xl flex items-center gap-2 cursor-pointer transition-all shadow-md active:scale-95"
          >
            <Plus size={14} className="text-emerald-400" />
            {isAdding ? 'Collapse' : 'Add Recurring Plan'}
          </button>
        </div>
        
        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-card/50 border border-default/80 p-4 sm:p-5 rounded-2xl flex flex-col gap-1">
                <span className="text-muted text-[10px] font-bold uppercase tracking-widest font-mono">Active Plans</span>
                <span className="text-xl sm:text-2xl font-black text-primary">{subscriptions.filter(s => s.status === 'Active').length}</span>
            </div>
            <div className="bg-card/50 border border-default/80 p-4 sm:p-5 rounded-2xl flex flex-col gap-1">
                <span className="text-muted text-[10px] font-bold uppercase tracking-widest font-mono">Monthly Total</span>
                <span className="text-xl sm:text-2xl font-black text-primary">{currency}{subscriptions.filter(s => s.status === 'Active').reduce((sum, s) => sum + s.amount, 0).toLocaleString()}</span>
            </div>
            <div className="bg-card/50 border border-default/80 p-4 sm:p-5 rounded-2xl flex flex-col gap-1">
                <span className="text-muted text-[10px] font-bold uppercase tracking-widest font-mono">Upcoming Dues</span>
                <span className="text-xl sm:text-2xl font-black text-amber-400">{subscriptions.filter(s => {
                    const due = new Date(s.dueDate);
                    const now = new Date();
                    return s.status === 'Active' && due >= now && due.getMonth() === now.getMonth();
                }).length}</span>
            </div>
        </div>
      </div>

      {/* 2. New Subscription Panel */}
      {isAdding && (
        <form onSubmit={handleCreate} className="bg-card border border-default rounded-[24px] p-6 md:p-8 shadow-2xl space-y-6 animate-fade-in text-left" id="add-subscription-form">
          <div className="flex gap-2 items-center text-emerald-400 font-black text-lg tracking-tight mb-2">
            <Sparkles size={18} />
            <span>Setup New Recurring Subscription</span>
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-[10px] font-mono font-black text-secondary uppercase tracking-wider pl-0.5">Service name</label>
              <input
                ref={nameInputRef}
                type="text"
                placeholder="e.g. Netflix Premium"
                value={subName}
                onChange={(e) => {
                  setSubName(e.target.value);
                  validateForm(e.target.value, subAmount, submitted);
                }}
                className={`w-full bg-surface border text-primary rounded-2xl text-xs px-5 py-4 focus:outline-none focus:ring-1 transition-all placeholder:text-muted/70 font-semibold ${
                  errors.name
                    ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500'
                    : 'border-default hover:border-default/80 focus:border-indigo-500 focus:ring-indigo-500'
                }`}
              />
              {errors.name && (
                <span className="text-danger font-mono text-[10px] pl-1 mt-1 block">{errors.name}</span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="text-[10px] font-mono font-black text-secondary uppercase tracking-wider pl-0.5">Billing Sum ({currency})</label>
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
                  className={`w-full bg-surface border text-primary rounded-2xl text-xs px-5 py-4 focus:outline-none focus:ring-1 font-mono font-bold transition-all placeholder:text-muted/70 ${
                    errors.amount
                      ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500'
                      : 'border-default hover:border-default/80 focus:border-indigo-500 focus:ring-indigo-500'
                  }`}
                />
                {errors.amount && (
                  <span className="text-danger font-mono text-[10px] pl-1 mt-1 block">{errors.amount}</span>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono font-black text-secondary uppercase tracking-wider pl-0.5">Billing Interval</label>
                <select
                  value={billingCycle}
                  onChange={(e) => setBillingCycle(e.target.value as 'Monthly' | 'Yearly')}
                  className="w-full bg-surface border border-default hover:border-default/80 text-primary rounded-2xl text-xs px-5 py-4 focus:outline-none focus:ring-1 focus:border-indigo-500 focus:ring-indigo-500 cursor-pointer font-semibold"
                >
                  <option value="Monthly">Monthly Cycle</option>
                  <option value="Yearly">Yearly Cycle</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="text-[10px] font-mono font-black text-secondary uppercase tracking-wider pl-0.5">Next Billing Date</label>
                <DatePicker 
                  value={dueDate} 
                  onChange={setDueDate} 
                  required 
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono font-black text-secondary uppercase tracking-wider pl-0.5">Expense Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as CategoryExpense)}
                  className="w-full bg-surface border border-default hover:border-default/80 text-primary rounded-2xl text-xs px-5 py-4 focus:outline-none focus:ring-1 focus:border-indigo-500 focus:ring-indigo-500 cursor-pointer font-semibold"
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

            <div className="space-y-2">
              <label className="text-[10px] font-mono font-black text-secondary uppercase tracking-wider pl-0.5">Instance Type / Server Environment (Optional)</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <select
                  value={instanceTypeSelection}
                  onChange={(e) => {
                    const val = e.target.value;
                    setInstanceTypeSelection(val);
                    if (val !== 'custom') {
                      setInstanceType(val === 'none' ? '' : val);
                    } else {
                      setInstanceType('');
                    }
                  }}
                  className="w-full bg-surface border border-default hover:border-default/80 text-primary rounded-2xl text-xs px-5 py-4 focus:outline-none focus:ring-1 focus:border-indigo-500 focus:ring-indigo-500 cursor-pointer font-semibold"
                >
                  <option value="none">Not a Server / Cloud Instance</option>
                  <option value="Web Service">Web Service</option>
                  <option value="PostgreSQL Database">PostgreSQL Database</option>
                  <option value="Redis Cache">Redis Cache</option>
                  <option value="Background Worker">Background Worker</option>
                  <option value="Static Site">Static Site</option>
                  <option value="Cron Job">Cron Job</option>
                  <option value="custom">Other / Custom Type...</option>
                </select>

                {instanceTypeSelection === 'custom' ? (
                  <input
                    type="text"
                    placeholder="e.g. Node VM, Docker container, etc."
                    value={instanceType}
                    onChange={(e) => setInstanceType(e.target.value)}
                    className="w-full bg-surface border border-default hover:border-default/80 text-primary rounded-2xl text-xs px-5 py-4 focus:outline-none focus:ring-1 focus:border-indigo-500 focus:ring-indigo-500 font-semibold placeholder:text-muted"
                  />
                ) : (
                  <div className="hidden sm:flex items-center text-xs text-muted italic pl-1">
                    Select a preset type or custom label to organize cloud costs.
                  </div>
                )}
              </div>
            </div>

            <button
              type="submit"
              className="w-full h-13 bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-black font-mono font-black uppercase tracking-widest text-xs rounded-2xl transition-all cursor-pointer shadow-lg shadow-emerald-500/10 mt-4 flex items-center justify-center gap-2"
            >
              <Plus size={14} className="stroke-[2.5px]" />
              Establish Subscription
            </button>
          </div>
        </form>
      )}

      {/* 3. Subscription Payment Modal (Inline Panel) */}
      {selectedSubscription && (
        <div className="bg-card border border-amber-500/20 p-6 md:p-8 rounded-[24px] space-y-5 shadow-2xl animate-fade-in text-left" id="subscription-payment-panel">
          <div className="flex justify-between items-center">
            <div className="flex gap-2 items-center text-amber-400 font-bold text-[10px] font-mono tracking-wider uppercase">
              <Calendar size={13} />
              <span>Settle Active Subscription Billing</span>
            </div>
            <button 
              onClick={() => setSelectedSubId(null)}
              className="text-muted hover:text-primary font-mono text-[10px] uppercase font-black cursor-pointer"
            >
              Cancel
            </button>
          </div>

          <div className="bg-surface p-5 border border-default rounded-2xl flex justify-between items-center">
            <div>
              <span className="text-[9px] font-mono font-black uppercase block text-muted">SERVICE TO DEBIT</span>
              <span className="text-primary text-sm font-black leading-relaxed">{selectedSubscription.name}</span>
            </div>
            <div className="text-right">
              <span className="text-[9px] font-mono font-black uppercase block text-muted">SUM DUE</span>
              <span className="text-emerald-400 text-sm font-mono font-black">{currency}{selectedSubscription.amount.toLocaleString()}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-mono font-black text-secondary uppercase tracking-wider block pl-0.5">Deduct Funds From</label>
              <select
                value={`${payAccountId}:${payAccountType}`}
                onChange={(e) => handleSelectPayAccount(e.target.value)}
                className="w-full bg-surface border border-default hover:border-default/80 text-primary text-xs rounded-2xl px-4 py-4 focus:outline-none focus:ring-1 focus:border-indigo-500 focus:ring-indigo-500 font-bold"
              >
                <optgroup label="Cash Wallets/Accounts" className="bg-surface text-secondary">
                  {cashAccounts.map(c => (
                    <option key={c.id} value={`${c.id}:cash`}>Wallet: {c.name} ({currency}{c.balance.toLocaleString()})</option>
                  ))}
                </optgroup>
                <optgroup label="Bank Cards" className="bg-surface text-secondary">
                  {cards.filter(c => !c.isCanceled).map(c => (
                    <option key={c.id} value={`${c.id}:card`}>{c.bankName} - {c.cardName} ({currency}{c.currentBalance.toLocaleString()})</option>
                  ))}
                </optgroup>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-mono font-black text-secondary uppercase tracking-wider block pl-0.5">Payment Settle Date</label>
              <DatePicker 
                value={payDate} 
                onChange={setPayDate} 
              />
            </div>
          </div>

          {payAccountType === 'card' && payAccountId && (
            <div className="p-4 bg-surface border border-default rounded-2xl space-y-2 animate-fade-in text-xs">
              <label className="text-[10px] text-secondary font-mono font-black block uppercase pl-0.5">Optional Bank Card Charge ({currency})</label>
              <input
                type="number"
                step="any"
                placeholder="e.g. 1.50 (Leave blank or 0 if none)"
                value={payBankCharge}
                onChange={(e) => setPayBankCharge(e.target.value)}
                className="w-full bg-card border border-default rounded-2xl text-xs px-4 py-3.5 focus:outline-none focus:ring-1 focus:border-indigo-500 focus:ring-indigo-500 font-mono text-primary placeholder:text-muted"
              />
              <p className="text-[9px] text-muted font-mono pl-0.5 leading-normal">Paying subscriptions from a card might trigger transaction processing fees. This charge is recorded as a bank fee expense and deducted from the card balance.</p>
            </div>
          )}

          <button
            onClick={executePayment}
            className="w-full py-4 bg-amber-500 text-black font-mono font-black uppercase tracking-widest text-xs rounded-2xl hover:bg-amber-400 transition-colors flex items-center justify-center gap-2 mt-4 cursor-pointer shadow-lg active:scale-95"
          >
            <CheckCircle2 size={13} />
            Authorize & post to journal
          </button>
        </div>
      )}

      {/* 4. Subscriptions List view */}
      {subscriptions.length === 0 ? (
        <div className="bg-primary/45 border border-default p-12 rounded-[28px] text-center text-muted space-y-3 animate-fade-in">
          <Clock className="mx-auto text-muted" size={28} />
          <h4 className="text-xs font-bold font-mono text-secondary uppercase tracking-widest">Ready for recurring Dues</h4>
          <p className="text-[11px] leading-relaxed max-w-[325px] mx-auto text-muted">
            Keep track of monthly servers, Netflix accounts, subscription plans, and yearly renewals with instant Ledger postings.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-6" id="subscriptions-grid">
          {sortedSubscriptions.map(sub => {
            const statusStyle = getDueStatus(sub.dueDate, sub.status);
            return (
              <motion.div 
                key={sub.id} 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`bg-card/98 border border-default/80 rounded-[32px] p-6 shadow-sm hover:shadow-md transition-all duration-300 ${
                  selectedSubId === sub.id 
                    ? 'border-emerald-500/50 ring-1 ring-emerald-500/20' 
                    : 'hover:border-default'
                }`}
              >
                  <div className="flex justify-between items-start gap-4 mb-6">
                      <div className="flex gap-4 items-center">
                          <div className="w-12 h-12 rounded-2xl bg-card border border-default flex items-center justify-center text-emerald-400">
                             <CreditCard size={24} />
                          </div>
                          <div>
                              <h4 className="font-bold text-primary text-lg tracking-tight">{sub.name}</h4>
                              <div className="flex gap-2 items-center mt-0.5 flex-wrap">
                                <span className="text-[10px] font-mono text-muted uppercase tracking-widest font-bold border border-default rounded-full px-2 py-0.5">
                                  {sub.category}
                                </span>
                                <span className="text-[10px] font-mono text-muted uppercase tracking-widest">
                                  {sub.billingCycle}
                                </span>
                                {sub.instanceType && (
                                  <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-full px-2 py-0.5 font-bold uppercase tracking-widest">
                                    {sub.instanceType}
                                  </span>
                                )}
                              </div>
                          </div>
                      </div>
                      <div className={`px-3 py-1 rounded-full font-mono text-[10px] font-black tracking-widest uppercase ${statusStyle.color}`}>
                          {statusStyle.label}
                      </div>
                  </div>

                  <div className="flex justify-between items-end mb-6">
                      <span className="text-muted text-xs font-semibold tracking-wider">Next Renewal</span>
                      <span className="text-primary text-base font-bold font-mono tracking-tight">{sub.dueDate}</span>
                  </div>

                  <div className="flex justify-between items-baseline mb-8">
                      <span className="text-muted text-xs font-semibold tracking-wider">Amount</span>
                      <span className="text-3xl font-black text-primary font-mono tracking-tight">{currency}{sub.amount.toLocaleString()}</span>
                  </div>

                  {/* Actions */}
                  <div className="grid grid-cols-2 gap-3 pt-6 border-t border-default">
                      {sub.status === 'Active' ? (
                        <button
                          type="button"
                          onClick={() => onToggleSubscriptionStatus(sub.id, 'Active')}
                          className="flex items-center justify-center gap-2 px-4 py-3 bg-card hover:bg-surface text-primary hover:text-primary rounded-xl border border-default transition-all text-xs font-bold font-mono uppercase tracking-widest cursor-pointer"
                        >
                          <Pause size={14} className="text-amber-500" />
                          Pause
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onToggleSubscriptionStatus(sub.id, 'Paused')}
                          className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30 transition-all text-xs font-bold font-mono uppercase tracking-widest cursor-pointer"
                        >
                          <Play size={14} className="text-emerald-400" />
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
                          className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-all text-xs font-bold font-mono uppercase tracking-widest cursor-pointer ${
                            selectedSubId === sub.id
                              ? 'bg-amber-500 text-black border-amber-600 font-extrabold'
                              : 'bg-surface hover:bg-zinc-700 text-primary border-zinc-700'
                          }`}
                        >
                          <DollarSign size={14} />
                          Settle
                        </button>
                      )}
                      
                      <button
                        type="button"
                        onClick={() => handleDelete(sub.id, sub.name)}
                        className="col-span-2 flex items-center justify-center gap-2 px-4 py-3 bg-rose-500/5 hover:bg-rose-500/10 text-danger rounded-xl border border-rose-500/20 transition-all text-xs font-bold font-mono uppercase tracking-widest cursor-pointer mt-1"
                      >
                        <Trash2 size={14} />
                        Delete Subscription
                      </button>
                  </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
