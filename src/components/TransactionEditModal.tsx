import React, { useState, useEffect } from 'react';
import { Transaction, CashAccount, BankCard } from '../types';
import { X, Save, Trash2 } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';

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
    } catch (e) {
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
    } catch (e) {
      showToast('error', 'Failed to delete transaction.');
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animation-fade-in">
      <div className="bg-[#0a0a0a] border border-zinc-800 p-6 rounded-2xl shadow-2xl max-w-sm w-full">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-white font-bold text-sm">Edit Transaction</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Title / Description</label>
            <input 
              ref={titleInputRef}
              type="text" 
              value={title} 
              onChange={e => {
                setTitle(e.target.value);
                validateTxForm(e.target.value, amount, date, submitted);
              }}
              className={`w-full bg-[#050505] border text-white rounded-xl px-3 py-2 text-sm focus:outline-none transition-colors ${
                errors.title
                  ? 'border-rose-500 focus:border-rose-600'
                  : title && !errors.title
                  ? 'border-emerald-500'
                  : 'border-zinc-800 focus:border-zinc-500'
              }`} 
            />
            {errors.title && (
              <span className="text-rose-400 font-mono text-[10px] mt-1 block">{errors.title}</span>
            )}
          </div>
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Amount ({currency})</label>
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
              className={`w-full bg-[#050505] border text-white rounded-xl px-3 py-2 text-sm focus:outline-none font-mono transition-colors ${
                errors.amount
                  ? 'border-rose-500 focus:border-rose-600'
                  : amount !== '' && !errors.amount
                  ? 'border-emerald-500'
                  : 'border-zinc-800'
              }`} 
            />
            {errors.amount && (
              <span className="text-rose-400 font-mono text-[10px] mt-1 block">{errors.amount}</span>
            )}
          </div>
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Date</label>
            <input 
              ref={dateInputRef}
              type="date" 
              value={date} 
              onChange={e => {
                setDate(e.target.value);
                validateTxForm(title, amount, e.target.value, submitted);
              }}
              className={`w-full bg-[#050505] border text-white rounded-xl px-3 py-2 text-[13px] uppercase focus:outline-none font-mono transition-colors ${
                errors.date
                  ? 'border-rose-500'
                  : date && !errors.date
                  ? 'border-emerald-500'
                  : 'border-zinc-800'
              }`} 
            />
            {errors.date && (
              <span className="text-rose-400 font-mono text-[10px] mt-1 block">{errors.date}</span>
            )}
          </div>
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Sub-tag / Category</label>
            <input 
              type="text" 
              required
              value={category} 
              onChange={e => setCategory(e.target.value)}
              className="w-full bg-[#050505] border border-zinc-800 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-zinc-500 transition-colors" 
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Account Source</label>
            <select
              value={`${accountId}:${accountType}`}
              onChange={e => {
                const [id, type] = e.target.value.split(':');
                setAccountId(id);
                setAccountType(type as 'cash'|'card');
              }}
              required
              className="w-full bg-[#050505] border border-zinc-800 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-zinc-500 transition-colors"
            >
              <option value="" disabled>Select Account</option>
              <optgroup label="Wallets / Cash">
                {cashAccounts.map(c => (
                  <option key={c.id} value={`${c.id}:cash`}>Cash: {c.name}</option>
                ))}
              </optgroup>
              <optgroup label="Bank Cards">
                {cards.filter(c => !c.isCanceled).map(card => (
                  <option key={card.id} value={`${card.id}:card`}>Card: {card.bankName} - {card.cardName}</option>
                ))}
              </optgroup>
            </select>
          </div>
          
          <div className="flex gap-3 pt-4 border-t border-zinc-800/50">
            {showDeleteConfirm ? (
              <div className="flex-1 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isProcessing}
                  className="flex-1 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(); }}
                  disabled={isProcessing}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl transition-colors shadow-lg shadow-red-500/20 cursor-pointer disabled:opacity-50"
                >
                  {isProcessing ? 'Deleting...' : 'Confirm'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowDeleteConfirm(true); }}
                className="flex-1 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold text-xs rounded-xl transition-colors border border-red-500/20 flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-red-500/5"
              >
                <Trash2 size={14} /> Delete
              </button>
            )}
            <button
              type="submit"
              disabled={isProcessing}
              className="flex-1 py-2.5 bg-white text-black font-bold text-xs rounded-xl hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xl shadow-white/10 disabled:opacity-50"
            >
              {isProcessing ? 'Saving...' : <><Save size={14} /> Save Changes</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
