import React, { useState, useEffect } from 'react';
import { Transaction, CashAccount, BankCard } from '../types';
import { X, Save, Trash2, Calendar, Edit3, HelpCircle, Lock } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';
import { DatePicker } from './DatePicker';

interface TransactionEditModalProps {
  transaction: Transaction | null;
  cashAccounts: CashAccount[];
  cards: BankCard[];
  onClose: () => void;
  onSave: (txId: string, newData: any) => void;
  onDelete: (txId: string) => void;
  currency: string;
}

export default function TransactionEditModal({
  transaction,
  cashAccounts,
  cards,
  onClose,
  onSave,
  onDelete,
  currency
}: TransactionEditModalProps) {
  const { showToast } = useNotifications();
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [date, setDate] = useState('');
  const [category, setCategory] = useState('');
  const [accountId, setAccountId] = useState('');
  const [accountType, setAccountType] = useState<'cash' | 'card'>('cash');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Validation States
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  // Focus input refs
  const titleInputRef = React.useRef<HTMLInputElement>(null);
  const amountInputRef = React.useRef<HTMLInputElement>(null);
  const dateInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (transaction) {
      setTitle(transaction.title);
      setAmount(transaction.amount);
      setDate(transaction.date);
      setCategory(transaction.category);
      setAccountId(transaction.accountId || '');
      setAccountType(transaction.accountType || 'cash');
      setErrors({});
      setSubmitted(false);
    }
  }, [transaction]);

  if (!transaction) return null;

  const validateTxForm = (t: string, amt: number | '', dt: string, sub: boolean) => {
    const errs: Record<string, string> = {};
    if (sub || t) {
      if (!t.trim()) {
        errs.title = 'Title or details are required';
      } else if (t.trim().length < 3) {
        errs.title = 'Title must be at least 3 characters long';
      } else if (/[<>{}]/.test(t)) {
        errs.title = 'Special character inputs are forbidden';
      }
    }
    if (sub || amt !== '') {
      if (amt === '') {
        errs.amount = 'Amount is required';
      } else {
        const num = Number(amt);
        if (isNaN(num)) {
          errs.amount = 'Must enter a valid value';
        } else if (num <= 0) {
          errs.amount = 'Amount must be a positive scale';
        }
      }
    }
    if (sub || dt) {
      if (!dt) {
        errs.date = 'Selected date is required';
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const isValid = validateTxForm(title, amount, date, true);
    if (!isValid) {
      if (!title.trim()) {
        titleInputRef.current?.focus();
      } else if (amount === '' || Number(amount) <= 0) {
        amountInputRef.current?.focus();
      } else {
        dateInputRef.current?.focus();
      }
      return;
    }
    setIsProcessing(true);
    try {
      onSave(transaction.id, {
        title: title.trim(),
        amount: Number(amount),
        date,
        category,
        accountId,
        accountType
      });
      showToast('success', 'Transaction updated successfully!');
      onClose();
    } catch (err) {
      showToast('error', 'Failed to update transaction.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = () => {
    setIsProcessing(true);
    try {
      onDelete(transaction.id);
      showToast('info', 'Transaction deleted.');
      onClose();
    } catch (err) {
      showToast('error', 'Failed to delete transaction.');
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="bg-gradient-to-b from-[#0c0c10] to-[#040406] border border-zinc-850 p-6 md:p-8 rounded-[32px] shadow-2xl max-w-sm w-full relative overflow-hidden" id="edit-transaction-modal-container">
        
        <div className="flex justify-between items-center mb-6">
          <div>
            <span className="text-[9px] font-mono tracking-widest text-[#a1a1a9] font-black uppercase bg-zinc-950 px-2 py-0.5 rounded-full border border-zinc-900">AUDIT EDITOR</span>
            <h3 className="text-sm font-extrabold text-white mt-1.5 flex items-center gap-1.5 leading-none">
              <Edit3 size={14} className="text-[var(--accent-primary)]" />
              Adjust Transaction Ledger
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-zinc-900 text-zinc-500 hover:text-white rounded-full transition-colors cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[9px] font-bold text-zinc-400 font-mono uppercase tracking-widest mb-1.5 pl-0.5">Title / description</label>
            <input 
              ref={titleInputRef}
              type="text" 
              value={title} 
              onChange={e => {
                setTitle(e.target.value);
                validateTxForm(e.target.value, amount, date, submitted);
              }}
              className={`w-full bg-[#050510]/55 border text-white rounded-xl px-4 py-3 text-xs focus:outline-none transition-all font-semibold ${
                errors.title
                  ? 'border-rose-500 focus:border-rose-500'
                  : title && !errors.title
                  ? 'border-blue-500 focus:border-emerald-500'
                  : 'border-zinc-85c border-zinc-850 focus:border-zinc-550 focus:border-zinc-500'
              }`} 
            />
            {errors.title && (
              <span className="text-rose-400 font-mono text-[9px] pl-0.5 mt-1 block">{errors.title}</span>
            )}
          </div>

          <div>
            <label className="block text-[9px] font-bold text-zinc-400 font-mono uppercase tracking-widest mb-1.5 pl-0.5">Amount ({currency})</label>
            <input 
              ref={amountInputRef}
              type="number" 
              step="0.01"
              value={amount} 
              onChange={e => {
                const val = e.target.value === '' ? '' : Number(e.target.value);
                setAmount(val);
                validateTxForm(title, val, date, submitted);
              }}
              className={`w-full bg-[#050510]/55 border text-white rounded-xl px-4 py-3 text-xs focus:outline-none font-mono font-black transition-all ${
                errors.amount
                  ? 'border-rose-500 focus:border-rose-500'
                  : amount !== '' && !errors.amount
                  ? 'border-emerald-500 focus:border-emerald-500'
                  : 'border-zinc-850 focus:border-zinc-500'
              }`} 
            />
            {errors.amount && (
              <span className="text-rose-400 font-mono text-[9px] pl-0.5 mt-1 block">{errors.amount}</span>
            )}
          </div>

          <div>
            <label className="block text-[9px] font-bold text-zinc-400 font-mono uppercase tracking-widest mb-1.5 pl-0.5">Calendar Date</label>
            <DatePicker 
              value={date} 
              onChange={val => {
                setDate(val);
                validateTxForm(title, amount, val, submitted);
              }}
              error={!!errors.date}
            />
            {errors.date && (
              <span className="text-rose-400 font-mono text-[9px] pl-0.5 mt-1 block">{errors.date}</span>
            )}
          </div>

          <div>
            <label className="block text-[9px] font-bold text-zinc-400 font-mono uppercase tracking-widest mb-1.5 pl-0.5">Categorization Tag</label>
            <input 
              type="text" 
              required
              value={category} 
              onChange={e => setCategory(e.target.value)}
              className="w-full bg-[#050510]/55 border border-zinc-850 text-white rounded-xl px-4 py-3 text-xs focus:ring-1 focus:ring-[var(--accent-primary)] transition-all font-bold" 
            />
          </div>

          <div>
            <label className="block text-[9px] font-bold text-zinc-400 font-mono uppercase tracking-widest mb-1.5 pl-0.5">Account Source</label>
            <select
              value={`${accountId}:${accountType}`}
              onChange={e => {
                const [id, type] = e.target.value.split(':');
                setAccountId(id);
                setAccountType(type as 'cash'|'card');
              }}
              required
              className="w-full bg-[#050510]/55 border border-zinc-850 text-zinc-300 rounded-xl px-2.5 py-3 text-xs focus:outline-none focus:border-zinc-500 cursor-pointer transition-all"
            >
              <option value="" disabled>Select Account</option>
              <optgroup label="Wallets / Cash" className="bg-[#0c0c0e] text-zinc-500 font-bold">
                {cashAccounts.map(c => (
                  <option key={c.id} value={`${c.id}:cash`}>Cash: {c.name}</option>
                ))}
              </optgroup>
              <optgroup label="Bank Cards" className="bg-[#0c0c0e] text-zinc-500 font-bold">
                {cards.filter(c => !c.isCanceled).map(card => (
                  <option key={card.id} value={`${card.id}:card`}>Card: {card.bankName} - {card.cardName}</option>
                ))}
              </optgroup>
            </select>
          </div>
          
          <div className="flex gap-3 pt-5 border-t border-zinc-900 mt-5">
            {showDeleteConfirm ? (
              <div className="flex-1 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isProcessing}
                  className="flex-1 py-3 bg-zinc-900 border border-zinc-800 hover:border-zinc-650 text-white font-mono font-bold text-[9px] uppercase rounded-xl transition-all cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(); }}
                  disabled={isProcessing}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white font-mono font-bold text-[9px] uppercase rounded-xl transition-all shadow-lg shadow-red-500/10 cursor-pointer disabled:opacity-50"
                >
                  {isProcessing ? 'Removing...' : 'Confirm Delete'}
                </button>
              </div>
            ) : (
              <div className="flex-1 flex gap-3">
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowDeleteConfirm(true); }}
                  className="flex-1 py-3 bg-rose-500/10 hover:bg-rose-550/20 text-rose-400 font-mono font-bold text-[9px] uppercase rounded-xl transition-all border border-rose-950/20 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Trash2 size={12} /> Dismiss
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="flex-[1.5] py-3 bg-white text-black font-mono font-bold text-[9px] uppercase rounded-xl hover:bg-zinc-200 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-lg disabled:opacity-55"
                >
                  {isProcessing ? 'Saving...' : <><Save size={12} /> Save Entries</>}
                </button>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
