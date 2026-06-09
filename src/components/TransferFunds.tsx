import React, { useState } from 'react';
import { CashAccount, BankCard } from '../types';
import { ArrowRightLeft, Sparkles, AlertCircle, HelpCircle } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';

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
      new Date().toISOString().split('T')[0],
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
    <form onSubmit={handleTransfer} className="bg-gradient-to-br from-[#0c0c0f] to-zinc-950 border border-zinc-850 rounded-[32px] p-6 shadow-2xl space-y-4 animate-fade-in relative overflow-hidden" id="transfer-funds-card">
      <div className="absolute top-0 right-0 p-4 text-zinc-900 pointer-events-none select-none">
        <Sparkles size={45} className="opacity-[0.02]" />
      </div>

      <div className="pb-2 border-b border-zinc-900 flex justify-between items-center">
        <h3 className="text-sm font-extrabold text-white flex items-center gap-2 font-sans">
          <ArrowRightLeft size={16} className="text-indigo-400" />
          Transfer Capital
        </h3>
        <span className="text-[9px] font-mono uppercase bg-zinc-950 px-2 py-0.5 rounded border border-zinc-900 text-zinc-500 font-semibold tracking-wide">
          instant settlement
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] text-zinc-550 block text-zinc-400 font-mono font-bold uppercase tracking-wider pl-0.5">Debit Source</label>
          <select 
            ref={fromSelectRef}
            value={fromAccount} 
            onChange={(e) => {
              setFromAccount(e.target.value);
              validateTransfer(e.target.value, toAccount, amount, charge, submitted);
            }} 
            className={`w-full bg-[#050510]/50 border text-zinc-300 rounded-xl text-xs px-2.5 py-3.5 focus:outline-none transition-all cursor-pointer font-bold ${
              errors.from
                ? 'border-rose-500 focus:border-rose-500'
                : fromAccount && !errors.from
                ? 'border-blue-500'
                : 'border-zinc-850 hover:border-zinc-700'
            }`}
          >
            <option value="">Origin Account</option>
            {accounts.map(a => (
              <option key={`${a.type}-${a.id}`} value={`${a.type}-${a.id}`} disabled={a.isFrozen}>
                {a.name} ({a.type === 'cash' ? 'Wallet' : 'Bank Card'}) - {currency}{a.balance.toLocaleString()}{a.isFrozen ? ' [FROZEN]' : ''}
              </option>
            ))}
          </select>
          {errors.from && (
            <span className="text-rose-400 font-mono text-[9px] pl-0.5 mt-0.5 block">{errors.from}</span>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] text-zinc-550 block text-zinc-400 font-mono font-bold uppercase tracking-wider pl-0.5">Credit Destination</label>
          <select 
            ref={toSelectRef}
            value={toAccount} 
            onChange={(e) => {
              setToAccount(e.target.value);
              validateTransfer(fromAccount, e.target.value, amount, charge, submitted);
            }} 
            className={`w-full bg-[#050510]/50 border text-zinc-300 rounded-xl text-xs px-2.5 py-3.5 focus:outline-none transition-all cursor-pointer font-bold ${
              errors.to
                ? 'border-rose-500 focus:border-rose-500'
                : toAccount && !errors.to
                ? 'border-emerald-500'
                : 'border-zinc-850 hover:border-zinc-700'
            }`}
          >
            <option value="">Target Account</option>
            {accounts.map(a => (
              <option key={`${a.type}-${a.id}`} value={`${a.type}-${a.id}`} disabled={a.isFrozen}>
                {a.name} ({a.type === 'cash' ? 'Wallet' : 'Bank Card'}) - {currency}{a.balance.toLocaleString()}{a.isFrozen ? ' [FROZEN]' : ''}
              </option>
            ))}
          </select>
          {errors.to && (
            <span className="text-rose-400 font-mono text-[9px] pl-0.5 mt-0.5 block">{errors.to}</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] text-zinc-550 block text-zinc-400 font-mono font-bold uppercase tracking-wider pl-0.5">Principal Sum ({currency})</label>
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
            className={`w-full bg-[#050510]/50 border text-white rounded-xl text-xs px-4 py-3.5 focus:outline-none font-mono font-black transition-all ${
              errors.amount
                ? 'border-rose-500 focus:border-rose-500'
                : amount && !errors.amount
                ? 'border-emerald-500'
                : 'border-zinc-850 hover:border-zinc-700'
            }`}
            required
          />
          {errors.amount && (
            <span className="text-rose-400 font-mono text-[9px] pl-0.5 mt-0.5 block">{errors.amount}</span>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] text-zinc-550 block text-zinc-400 font-mono font-bold uppercase tracking-wider pl-0.5 font-sans font-bold">Transfer Surcharge (Optional) ({currency})</label>
          <input
            type="number"
            step="any"
            placeholder="0.00"
            value={charge}
            onChange={(e) => {
              setCharge(e.target.value);
              validateTransfer(fromAccount, toAccount, amount, e.target.value, submitted);
            }}
            className={`w-full bg-[#050510]/50 border text-white rounded-xl text-xs px-4 py-3.5 focus:outline-none font-mono font-black transition-all ${
              errors.charge
                ? 'border-rose-500 focus:border-rose-500'
                : charge && !errors.charge
                ? 'border-emerald-500'
                : 'border-zinc-850 hover:border-zinc-700'
            }`}
          />
          {errors.charge && (
            <span className="text-rose-400 font-mono text-[9px] pl-0.5 mt-0.5 block">{errors.charge}</span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] text-zinc-550 block text-zinc-400 font-mono font-bold uppercase tracking-wider pl-0.5">Settle Remarks / description</label>
        <input
          type="text"
          placeholder="e.g. Settle balances, moving reserves to card, allowance..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full bg-[#050510]/55 border border-zinc-850 hover:border-zinc-700 text-white rounded-xl px-4 py-3.5 text-xs focus:outline-none focus:border-indigo-500 transition-all font-medium placeholder:text-zinc-650"
        />
      </div>
      
      <button type="submit" className="w-full bg-white text-black font-mono font-bold uppercase tracking-widest text-[10px] py-4 rounded-xl hover:bg-zinc-200 transition-all cursor-pointer shadow-lg mt-3.5 flex items-center justify-center gap-1.5">
        <ArrowRightLeft size={13} className="stroke-[2.5px]" />
        Execute Capital Transfer
      </button>

    </form>
  );
}
