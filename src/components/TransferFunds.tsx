import React, { useState } from 'react';
import { CashAccount, BankCard } from '../types';
import { ArrowRightLeft, Sparkles, AlertCircle, HelpCircle, Calendar } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';
import { DatePicker } from './DatePicker';

interface TransferFundsProps {
  cashAccounts: CashAccount[];
  cards: BankCard[];
  currency: string;
  onTransferFunds: (
    fromId: string,
    fromType: 'cash' | 'card',
    toId: string,
    toType: 'cash' | 'card',
    amount: number,
    note: string,
    date: string,
    charge: number
  ) => void;
}

export default function TransferFunds({
  cashAccounts,
  cards,
  currency,
  onTransferFunds,
}: TransferFundsProps) {
  const { showToast } = useNotifications();
  const [fromAccount, setFromAccount] = useState('');
  const [toAccount, setToAccount] = useState('');
  const [amount, setAmount] = useState('');
  const [charge, setCharge] = useState('');
  const [note, setNote] = useState('');
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().split('T')[0]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  // Focus refs
  const fromSelectRef = React.useRef<HTMLSelectElement>(null);
  const toSelectRef = React.useRef<HTMLSelectElement>(null);
  const amountInputRef = React.useRef<HTMLInputElement>(null);

  const accounts = [
    ...cashAccounts.map(c => ({ id: c.id, name: c.name, type: 'cash' as const, isFrozen: false, balance: c.balance })),
    ...cards.filter(c => !c.isCanceled).map(c => ({ id: c.id, name: c.cardName, type: 'card' as const, isFrozen: !!c.isFrozen, balance: c.currentBalance })),
  ];

  const validateTransfer = (from: string, to: string, amtStr: string, chargeStr: string, sub: boolean) => {
    const errs: Record<string, string> = {};
    if (sub || from) {
      if (!from) {
        errs.from = 'Source account is required';
      } else {
        const srcAcc = accounts.find(a => `${a.type}-${a.id}` === from);
        if (srcAcc && srcAcc.isFrozen) {
          errs.from = 'Source card is FROZEN and transaction is blocked!';
        }
      }
    }
    if (sub || to) {
      if (!to) {
        errs.to = 'Destination account is required';
      } else if (from === to && from) {
        errs.to = 'Destination cannot be the same as source';
      } else {
        const destAcc = accounts.find(a => `${a.type}-${a.id}` === to);
        if (destAcc && destAcc.isFrozen) {
          errs.to = 'Destination card is FROZEN and transaction is blocked!';
        }
      }
    }
    
    let parsedAmount = 0;
    if (sub || amtStr) {
      if (!amtStr) {
        errs.amount = 'Transfer amount is required';
      } else {
        const num = parseFloat(amtStr);
        if (isNaN(num)) {
          errs.amount = 'Must be a valid number';
        } else if (num <= 0) {
          errs.amount = 'Transfer amount must be positive_amount';
        } else {
          parsedAmount = num;
        }
      }
    }

    let parsedCharge = 0;
    if (chargeStr) {
      const num = parseFloat(chargeStr);
      if (isNaN(num)) {
        errs.charge = 'Must be a valid number';
      } else if (num < 0) {
        errs.charge = 'Charge/fee cannot be negative';
      } else {
        parsedCharge = num;
      }
    }

    if (from && !errs.amount && !errs.charge) {
      const totalDeduction = parsedAmount + parsedCharge;
      const srcAccount = accounts.find(a => `${a.type}-${a.id}` === from);
      if (srcAccount) {
        let balance = 0;
        if (srcAccount.type === 'cash') {
          const match = cashAccounts.find(c => c.id === srcAccount.id);
          if (match) balance = match.balance;
        } else {
          const match = cards.find(c => c.id === srcAccount.id);
          if (match) balance = match.currentBalance;
        }
        if (totalDeduction > balance) {
          errs.amount = `Total deduction (${currency} ${totalDeduction.toLocaleString()}) exceeds available balance (${currency} ${balance.toLocaleString()})!`;
        }
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const isValid = validateTransfer(fromAccount, toAccount, amount, charge, true);
    if (!isValid) {
      if (!fromAccount) {
        fromSelectRef.current?.focus();
      } else if (!toAccount || fromAccount === toAccount) {
        toSelectRef.current?.focus();
      } else {
        amountInputRef.current?.focus();
      }
      showToast('error', 'Please resolve highlighted fund transfer errors.');
      return;
    }

    const source = accounts.find(a => `${a.type}-${a.id}` === fromAccount);
    const destination = accounts.find(a => `${a.type}-${a.id}` === toAccount);

    if (!source || !destination) return;

    onTransferFunds(
      source.id,
      source.type,
      destination.id,
      destination.type,
      parseFloat(amount),
      note,
      transferDate,
      charge ? parseFloat(charge) : 0
    );

    setAmount('');
    setCharge('');
    setNote('');
    setFromAccount('');
    setToAccount('');
    setSubmitted(false);
    setErrors({});
    showToast('success', 'Funds successfully transferred and balances adjusted!');
  };

  return (
    <form onSubmit={handleTransfer} className="bg-card border border-default rounded-[24px] p-6 md:p-8 shadow-2xl space-y-6 animate-fade-in relative overflow-hidden" id="transfer-funds-card">
      <div className="absolute top-0 right-0 p-4 text-primary pointer-events-none select-none">
        <Sparkles size={45} className="opacity-[0.02]" />
      </div>

      <div className="pb-4 border-b border-default flex justify-between items-center text-left">
        <div className="space-y-1">
          <h3 className="text-sm font-black text-primary flex items-center gap-2.5 font-sans tracking-tight">
            <ArrowRightLeft size={16} className="text-success" />
            Transfer Capital
          </h3>
          <p className="text-[11px] text-muted">Move funds instantly between accounts with zero friction</p>
        </div>
        <span className="text-[9px] font-mono uppercase bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-full text-success font-extrabold tracking-widest leading-none">
          INSTANT SETTLEMENT
        </span>
      </div>

      {/* Visual Flow Connection Row */}
      <div className="grid grid-cols-1 md:grid-cols-7 items-center gap-4 bg-surface/50 border border-default p-5 rounded-[20px] relative text-left">
        {/* Source Account Card */}
        <div className="md:col-span-3 flex flex-col gap-2">
          <label className="text-[10px] font-mono font-black text-secondary uppercase tracking-wider pl-0.5">Debit Source</label>
          <div className="relative">
            <select 
              ref={fromSelectRef}
              value={fromAccount} 
              onChange={(e) => {
                setFromAccount(e.target.value);
                validateTransfer(e.target.value, toAccount, amount, charge, submitted);
              }} 
              className={`w-full bg-surface border text-primary rounded-2xl text-xs px-4 py-4 focus:outline-none focus:ring-1 transition-all cursor-pointer font-semibold appearance-none ${
                errors.from
                  ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500'
                  : fromAccount && !errors.from
                  ? 'border-emerald-500/50 focus:border-indigo-500 focus:ring-indigo-500'
                  : 'border-default hover:border-default/80 focus:border-indigo-500 focus:ring-indigo-500'
              }`}
            >
              <option value="" className="bg-surface">Select Origin Account</option>
              {accounts.map(a => (
                <option key={`${a.type}-${a.id}`} value={`${a.type}-${a.id}`} disabled={a.isFrozen} className="bg-surface">
                  {a.name} ({a.type === 'cash' ? 'Wallet' : 'Card'}) - {currency}{a.balance.toLocaleString()}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-muted">
              <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
            </div>
          </div>
          {errors.from && (
            <span className="text-danger font-mono text-[10px] pl-1 block">{errors.from}</span>
          )}
        </div>

        {/* Dynamic connection indicator */}
        <div className="md:col-span-1 flex justify-center items-center py-2 md:py-0">
          <div className="w-10 h-10 rounded-full bg-surface border border-default flex items-center justify-center text-secondary shadow-md transform rotate-90 md:rotate-0 transition-transform duration-300">
            <ArrowRightLeft size={16} className={fromAccount && toAccount ? "text-success animate-pulse" : ""} />
          </div>
        </div>

        {/* Destination Account Card */}
        <div className="md:col-span-3 flex flex-col gap-2">
          <label className="text-[10px] font-mono font-black text-secondary uppercase tracking-wider pl-0.5">Credit Destination</label>
          <div className="relative">
            <select 
              ref={toSelectRef}
              value={toAccount} 
              onChange={(e) => {
                setToAccount(e.target.value);
                validateTransfer(fromAccount, e.target.value, amount, charge, submitted);
              }} 
              className={`w-full bg-surface border text-primary rounded-2xl text-xs px-4 py-4 focus:outline-none focus:ring-1 transition-all cursor-pointer font-semibold appearance-none ${
                errors.to
                  ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500'
                  : toAccount && !errors.to
                  ? 'border-emerald-500/50 focus:border-indigo-500 focus:ring-indigo-500'
                  : 'border-default hover:border-default/80 focus:border-indigo-500 focus:ring-indigo-500'
              }`}
            >
              <option value="" className="bg-surface">Select Destination Account</option>
              {accounts.map(a => (
                <option key={`${a.type}-${a.id}`} value={`${a.type}-${a.id}`} disabled={a.isFrozen} className="bg-surface">
                  {a.name} ({a.type === 'cash' ? 'Wallet' : 'Card'}) - {currency}{a.balance.toLocaleString()}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-muted">
              <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
            </div>
          </div>
          {errors.to && (
            <span className="text-danger font-mono text-[10px] pl-1 block">{errors.to}</span>
          )}
        </div>
      </div>

      {/* Numerical and Fee Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-left">
        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-mono font-black text-secondary uppercase tracking-wider pl-0.5">Principal Sum ({currency})</label>
          <input
            ref={amountInputRef}
            type="number"
            step="any"
            placeholder="0.00"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              validateTransfer(fromAccount, toAccount, e.target.value, charge, submitted);
            }}
            className={`w-full bg-surface border text-primary rounded-2xl text-xs px-5 py-4 focus:outline-none focus:ring-1 font-mono font-bold transition-all placeholder:text-muted/70 ${
              errors.amount
                ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500'
                : amount && !errors.amount
                ? 'border-emerald-500/50 focus:border-indigo-500 focus:ring-indigo-500'
                : 'border-default hover:border-default/80 focus:border-indigo-500 focus:ring-indigo-500'
            }`}
            required
          />
          {errors.amount && (
            <span className="text-danger font-mono text-[10px] pl-1 block">{errors.amount}</span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-mono font-black text-secondary uppercase tracking-wider pl-0.5">Surcharge Fee (Optional) ({currency})</label>
          <input
            type="number"
            step="any"
            placeholder="0.00"
            value={charge}
            onChange={(e) => {
              setCharge(e.target.value);
              validateTransfer(fromAccount, toAccount, amount, e.target.value, submitted);
            }}
            className={`w-full bg-surface border text-primary rounded-2xl text-xs px-5 py-4 focus:outline-none focus:ring-1 font-mono font-bold transition-all placeholder:text-muted/70 ${
              errors.charge
                ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500'
                : charge && !errors.charge
                ? 'border-emerald-500/50 focus:border-indigo-500 focus:ring-indigo-500'
                : 'border-default hover:border-default/80 focus:border-indigo-500 focus:ring-indigo-500'
            }`}
          />
          {errors.charge && (
            <span className="text-danger font-mono text-[10px] pl-1 block">{errors.charge}</span>
          )}
        </div>
      </div>

      {/* Date Picker Section */}
      <div className="flex flex-col gap-2 text-left">
        <label className="text-[10px] font-mono font-black text-secondary uppercase tracking-wider pl-0.5">Transfer Date</label>
        <DatePicker 
          value={transferDate} 
          onChange={setTransferDate} 
          required 
        />
      </div>

      {/* Narrative Description Remarks */}
      <div className="flex flex-col gap-2 text-left">
        <label className="text-[10px] font-mono font-black text-secondary uppercase tracking-wider pl-0.5">Narrative Memo / Description</label>
        <input
          type="text"
          placeholder="e.g. Settle balances, moving reserves to card, allowance..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full bg-surface border border-default hover:border-default/80 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-primary rounded-2xl px-5 py-4 text-xs focus:outline-none transition-all font-semibold placeholder:text-muted/70"
        />
      </div>
      
      <button 
        type="submit" 
        className="w-full h-13 bg-emerald-400 hover:bg-emerald-300 active:scale-[0.98] text-black font-mono font-black uppercase tracking-widest text-xs rounded-2xl transition-all cursor-pointer shadow-lg shadow-emerald-500/10 mt-2 flex items-center justify-center gap-2"
      >
        <ArrowRightLeft size={14} className="stroke-[2.5px]" />
        Execute Capital Transfer
      </button>

    </form>
  );
}
