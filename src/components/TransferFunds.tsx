import React, { useState } from 'react';
import { CashAccount, BankCard } from '../types';
import { ArrowRightLeft } from 'lucide-react';
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
    ...cashAccounts.map(c => ({ id: c.id, name: c.name, type: 'cash' as const, isFrozen: false })),
    ...cards.filter(c => !c.isCanceled).map(c => ({ id: c.id, name: c.cardName, type: 'card' as const, isFrozen: !!c.isFrozen })),
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
          errs.amount = 'Transfer amount must be positive';
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
    <form onSubmit={handleTransfer} className="bg-zinc-900/50 border border-zinc-850 rounded-[28px] p-6 shadow-xl space-y-4">
      <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
        <ArrowRightLeft size={16} className="text-zinc-400" />
        Transfer Funds
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-zinc-500 font-bold block mb-1">From Account</label>
          <select 
            ref={fromSelectRef}
            value={fromAccount} 
            onChange={(e) => {
              setFromAccount(e.target.value);
              validateTransfer(e.target.value, toAccount, amount, charge, submitted);
            }} 
            className={`w-full bg-[#050505] border text-white rounded-xl text-xs px-3 py-2.5 focus:outline-none transition-colors ${
              errors.from
                ? 'border-rose-500 focus:border-rose-600'
                : fromAccount && !errors.from
                ? 'border-emerald-500 focus:border-emerald-600'
                : 'border-zinc-800 focus:border-zinc-500'
            }`}
          >
            <option value="">Select source</option>
            {accounts.map(a => (
              <option key={`${a.type}-${a.id}`} value={`${a.type}-${a.id}`} disabled={a.isFrozen}>
                {a.name} ({a.type}){a.isFrozen ? ' [FROZEN]' : ''}
              </option>
            ))}
          </select>
          {errors.from && (
            <span className="text-rose-400 font-mono text-[10px]">{errors.from}</span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-zinc-500 font-bold block mb-1">To Account</label>
          <select 
            ref={toSelectRef}
            value={toAccount} 
            onChange={(e) => {
              setToAccount(e.target.value);
              validateTransfer(fromAccount, e.target.value, amount, charge, submitted);
            }} 
            className={`w-full bg-[#050505] border text-white rounded-xl text-xs px-3 py-2.5 focus:outline-none transition-colors ${
              errors.to
                ? 'border-rose-500 focus:border-rose-600'
                : toAccount && !errors.to
                ? 'border-emerald-500 focus:border-emerald-600'
                : 'border-zinc-800 focus:border-zinc-500'
            }`}
          >
            <option value="">Select destination</option>
            {accounts.map(a => (
              <option key={`${a.type}-${a.id}`} value={`${a.type}-${a.id}`} disabled={a.isFrozen}>
                {a.name} ({a.type}){a.isFrozen ? ' [FROZEN]' : ''}
              </option>
            ))}
          </select>
          {errors.to && (
            <span className="text-rose-400 font-mono text-[10px]">{errors.to}</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-zinc-500 font-bold block mb-1">Transfer Amount ({currency})</label>
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
            className={`w-full bg-[#050505] border text-white rounded-xl text-xs px-3 py-3 focus:outline-none transition-colors ${
              errors.amount
                ? 'border-rose-500 focus:border-rose-600'
                : amount && !errors.amount
                ? 'border-emerald-500 focus:border-emerald-600'
                : 'border-zinc-800 focus:border-zinc-500'
            }`}
            required
          />
          {errors.amount && (
            <span className="text-rose-400 font-mono text-[10px]">{errors.amount}</span>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-zinc-500 font-bold block mb-1">Transfer Charge / Fee (Optional) ({currency})</label>
          <input
            type="number"
            step="any"
            placeholder="0.00"
            value={charge}
            onChange={(e) => {
              setCharge(e.target.value);
              validateTransfer(fromAccount, toAccount, amount, e.target.value, submitted);
            }}
            className={`w-full bg-[#050505] border text-white rounded-xl text-xs px-3 py-3 focus:outline-none transition-colors ${
              errors.charge
                ? 'border-rose-500 focus:border-rose-600'
                : charge && !errors.charge
                ? 'border-emerald-500 focus:border-emerald-600'
                : 'border-zinc-800 focus:border-zinc-500'
            }`}
          />
          {errors.charge && (
            <span className="text-rose-400 font-mono text-[10px]">{errors.charge}</span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-zinc-500 font-bold block mb-1">Note / Description (Optional)</label>
        <input
          type="text"
          placeholder="e.g. Wallet settlement"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full bg-[#050505] border border-zinc-800 text-white rounded-xl text-xs px-3 py-3 focus:outline-none focus:border-zinc-500 transition-colors"
        />
      </div>
      
      <button type="submit" className="w-full bg-emerald-500 text-neutral-950 font-bold uppercase tracking-wider text-xs py-3.5 rounded-xl hover:bg-emerald-600 transition-all font-mono cursor-pointer shadow-lg mt-2">
        Transfer Now
      </button>
    </form>
  );
}
