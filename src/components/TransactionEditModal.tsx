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

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

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
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-[var(--surface)] border border-[var(--line)] p-6 md:p-8 rounded-[24px] shadow-2xl max-w-sm w-full relative overflow-hidden" id="edit-transaction-modal-container">
        
        <div className="flex justify-between items-center mb-6">
          <div>
            <span className="eyebrow bg-[var(--surface-2)] px-2 py-0.5 rounded-full border border-[var(--line)]">Audit Editor</span>
            <h3 className="text-xs font-black text-[var(--ink)] mt-1.5 flex items-center gap-1.5 leading-none mono uppercase tracking-wider">
              <Edit3 size={14} className="text-[var(--ink-2)]" />
              Adjust Transaction Ledger
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-[var(--surface-2)] text-[var(--ink-2)] hover:text-[var(--ink)] rounded-full transition-colors cursor-pointer border border-transparent hover:border-[var(--line)]">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="eyebrow block mb-1.5">Title / description</label>
            <input 
              ref={titleInputRef}
              type="text" 
              value={title} 
              onChange={e => {
                setTitle(e.target.value);
                validateTxForm(e.target.value, amount, date, submitted);
              }}
              placeholder="e.g. Groceries"
              className={`input ${errors.title ? '!border-[var(--danger)] focus:!border-[var(--danger)]' : title && !errors.title ? '!border-emerald-500/50' : ''}`} 
            />
            {errors.title && (
              <span className="text-[var(--danger)] mono text-[10px] pl-1 mt-1.5 block">{errors.title}</span>
            )}
          </div>

          <div>
            <label className="eyebrow block mb-1.5">Amount ({currency})</label>
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
              className={`input mono font-bold ${errors.amount ? '!border-[var(--danger)] focus:!border-[var(--danger)]' : amount !== '' && !errors.amount ? '!border-emerald-500/50' : ''}`} 
            />
            {errors.amount && (
              <span className="text-[var(--danger)] mono text-[10px] pl-1 mt-1.5 block">{errors.amount}</span>
            )}
          </div>

          <div>
            <label className="eyebrow block mb-1.5">Calendar Date</label>
            <DatePicker 
              value={date} 
              onChange={val => {
                setDate(val);
                validateTxForm(title, amount, val, submitted);
              }}
              error={!!errors.date}
            />
            {errors.date && (
              <span className="text-[var(--danger)] mono text-[10px] pl-1 mt-1.5 block">{errors.date}</span>
            )}
          </div>

          <div>
            <label className="eyebrow block mb-1.5">Categorization Tag</label>
            <input 
              type="text" 
              required
              value={category} 
              onChange={e => setCategory(e.target.value)}
              className="input font-bold" 
            />
          </div>

          <div>
            <label className="eyebrow block mb-1.5">Account Source</label>
            <select
              value={`${accountId}:${accountType}`}
              onChange={e => {
                const [id, type] = e.target.value.split(':');
                setAccountId(id);
                setAccountType(type as 'cash'|'card');
              }}
              required
              className="input cursor-pointer font-semibold"
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
          
          <div className="flex gap-3 pt-5 mt-5">
            <div className="ledger-rule absolute left-0 right-0" />
          </div>
          <div className="flex gap-3 pt-2">
            {showDeleteConfirm ? (
              <div className="flex-1 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isProcessing}
                  className="btn-ghost flex-1 h-12 text-[9.5px] uppercase mono font-black disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(); }}
                  disabled={isProcessing}
                  className="flex-1 h-12 bg-[var(--danger)] hover:brightness-95 text-white mono font-black text-[9.5px] uppercase rounded-full transition-all shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {isProcessing ? 'Removing...' : 'Confirm Delete'}
                </button>
              </div>
            ) : (
              <div className="flex-1 flex gap-3">
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowDeleteConfirm(true); }}
                  className="flex-1 h-12 bg-[var(--danger-bg)] hover:bg-[var(--danger)]/15 text-[var(--danger)] mono font-black text-[9.5px] uppercase rounded-full transition-all border border-[var(--danger)]/20 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Trash2 size={12} /> Dismiss
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="btn-primary flex-[1.5] h-12 text-[9.5px] mono uppercase flex items-center justify-center gap-1.5 disabled:opacity-55"
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
