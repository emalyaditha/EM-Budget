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
      <div className="bg-card border border-default p-6 md:p-8 rounded-[24px] shadow-2xl max-w-sm w-full relative overflow-hidden" id="edit-transaction-modal-container">
        
        <div className="flex justify-between items-center mb-6">
          <div>
            <span className="text-[9px] font-mono tracking-widest text-muted dark:text-[#a1a1a9] font-black uppercase bg-surface dark:bg-card px-2 py-0.5 rounded-full border border-subtle dark:border-default">AUDIT EDITOR</span>
            <h3 className="text-xs font-black text-primary dark:text-primary mt-1.5 flex items-center gap-1.5 leading-none font-mono uppercase tracking-wider">
              <Edit3 size={14} className="text-indigo-600 dark:text-[var(--accent-primary)]" />
              Adjust Transaction Ledger
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-surface dark:hover:bg-card text-secondary hover:text-secondary dark:text-muted dark:hover:text-primary rounded-full transition-colors cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-mono font-black uppercase tracking-wider mb-1.5 pl-0.5 text-muted dark:text-secondary">Title / description</label>
            <input 
              ref={titleInputRef}
              type="text" 
              value={title} 
              onChange={e => {
                setTitle(e.target.value);
                validateTxForm(e.target.value, amount, date, submitted);
              }}
              className={`w-full bg-card border text-primary dark:text-primary rounded-2xl px-4 py-3.5 text-xs focus:outline-none focus:ring-1 transition-all placeholder:text-secondary dark:placeholder:text-muted/75 ${
                errors.title
                  ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500'
                  : title && !errors.title
                  ? 'border-blue-500/50 focus:border-indigo-500 focus:ring-indigo-500'
                  : 'border-subtle dark:border-default hover:border-subtle dark:hover:border-default/80 focus:border-indigo-500 focus:ring-indigo-500'
              }`} 
            />
            {errors.title && (
              <span className="text-rose-500 dark:text-danger font-mono text-[10px] pl-1 mt-1.5 block">{errors.title}</span>
            )}
          </div>

          <div>
            <label className="block text-[10px] font-mono font-black uppercase tracking-wider mb-1.5 pl-0.5 text-muted dark:text-secondary">Amount ({currency})</label>
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
              className={`w-full bg-card border text-primary dark:text-primary rounded-2xl px-4 py-3.5 text-xs focus:outline-none focus:ring-1 font-mono font-bold transition-all ${
                errors.amount
                  ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500'
                  : amount !== '' && !errors.amount
                  ? 'border-blue-500/50 focus:border-indigo-500 focus:ring-indigo-500'
                  : 'border-subtle dark:border-default hover:border-subtle dark:hover:border-default/80 focus:border-indigo-500 focus:ring-indigo-500'
              }`} 
            />
            {errors.amount && (
              <span className="text-rose-500 dark:text-danger font-mono text-[10px] pl-1 mt-1.5 block">{errors.amount}</span>
            )}
          </div>

          <div>
            <label className="block text-[10px] font-mono font-black uppercase tracking-wider mb-1.5 pl-0.5 text-muted dark:text-secondary">Calendar Date</label>
            <DatePicker 
              value={date} 
              onChange={val => {
                setDate(val);
                validateTxForm(title, amount, val, submitted);
              }}
              error={!!errors.date}
            />
            {errors.date && (
              <span className="text-rose-500 dark:text-danger font-mono text-[10px] pl-1 mt-1.5 block">{errors.date}</span>
            )}
          </div>

          <div>
            <label className="block text-[10px] font-mono font-black uppercase tracking-wider mb-1.5 pl-0.5 text-muted dark:text-secondary">Categorization Tag</label>
            <input 
              type="text" 
              required
              value={category} 
              onChange={e => setCategory(e.target.value)}
              className="w-full bg-card border border-subtle dark:border-default text-primary dark:text-primary rounded-2xl px-4 py-3.5 text-xs focus:outline-none focus:ring-1 focus:border-indigo-500 focus:ring-indigo-500 transition-all font-bold" 
            />
          </div>

          <div>
            <label className="block text-[10px] font-mono font-black uppercase tracking-wider mb-1.5 pl-0.5 text-muted dark:text-secondary">Account Source</label>
            <select
              value={`${accountId}:${accountType}`}
              onChange={e => {
                const [id, type] = e.target.value.split(':');
                setAccountId(id);
                setAccountType(type as 'cash'|'card');
              }}
              required
              className="w-full bg-card border border-subtle dark:border-default text-secondary dark:text-primary rounded-2xl px-3.5 py-3.5 text-xs focus:outline-none focus:ring-1 focus:border-indigo-500 focus:ring-indigo-500 cursor-pointer transition-all font-semibold"
            >
              <option value="" disabled>Select Account</option>
              <optgroup label="Wallets / Cash" className="bg-card text-primary dark:text-secondary font-bold">
                {cashAccounts.map(c => (
                  <option key={c.id} value={`${c.id}:cash`}>Cash: {c.name}</option>
                ))}
              </optgroup>
              <optgroup label="Bank Cards" className="bg-card text-primary dark:text-secondary font-bold">
                {cards.filter(c => !c.isCanceled).map(card => (
                  <option key={card.id} value={`${card.id}:card`}>Card: {card.bankName} - {card.cardName}</option>
                ))}
              </optgroup>
            </select>
          </div>
          
          <div className="flex gap-3 pt-5 border-t border-subtle dark:border-default mt-5">
            {showDeleteConfirm ? (
              <div className="flex-1 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isProcessing}
                  className="flex-1 h-12 bg-surface hover:bg-surface border border-subtle dark:bg-card dark:border-default dark:hover:border-default text-primary dark:text-primary font-mono font-black text-[9.5px] uppercase rounded-2xl transition-all cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(); }}
                  disabled={isProcessing}
                  className="flex-1 h-12 bg-rose-600 hover:bg-rose-500 text-primary font-mono font-black text-[9.5px] uppercase rounded-2xl transition-all shadow-lg shadow-red-500/10 cursor-pointer disabled:opacity-50"
                >
                  {isProcessing ? 'Removing...' : 'Confirm Delete'}
                </button>
              </div>
            ) : (
              <div className="flex-1 flex gap-3">
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowDeleteConfirm(true); }}
                  className="flex-1 h-12 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 dark:text-danger font-mono font-black text-[9.5px] uppercase rounded-2xl transition-all border border-rose-200 dark:border-rose-950/20 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Trash2 size={12} /> Dismiss
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="flex-[1.5] h-12 bg-card text-primary hover:bg-surface dark:bg-white dark:text-black font-mono font-black text-[9.5px] uppercase rounded-2xl dark:hover:bg-surface transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-lg disabled:opacity-55"
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
