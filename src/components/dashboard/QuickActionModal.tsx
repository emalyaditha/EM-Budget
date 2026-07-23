import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Sparkles } from 'lucide-react';
import { AppState } from '../../types';

interface QuickActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  initialType?: 'expense' | 'income';
  onAddIncome?: (amount: number, date: string, source: string, category: any, targetAccountId: string, targetType: 'cash' | 'card') => void;
  onAddExpense?: (title: string, description: string, amount: number, date: string, category: any, paymentMethodId: string, paymentMethodType: 'cash' | 'card', bankCharge?: number) => void;
}

export function QuickActionModal({
  isOpen,
  onClose,
  state,
  initialType = 'expense',
  onAddIncome,
  onAddExpense
}: QuickActionModalProps) {
  const [txType, setTxType] = useState<'expense' | 'income'>(initialType);
  const [txTitle, setTxTitle] = useState('');
  const [txAmount, setTxAmount] = useState('');
  const [txCategory, setTxCategory] = useState('Utilities');
  const [txAccountId, setTxAccountId] = useState('');
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    setTxType(initialType);
  }, [initialType]);

  useEffect(() => {
    if (isOpen) {
      if (state.cashAccounts.length > 0) {
        setTxAccountId(`cash-${state.cashAccounts[0].id}`);
      } else if (state.cards.length > 0) {
        setTxAccountId(`card-${state.cards[0].id}`);
      }
    }
  }, [isOpen, state.cashAccounts, state.cards]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(txAmount);
    if (!txTitle || isNaN(amountNum) || amountNum <= 0 || !txAccountId) {
      return;
    }

    const typePrefix = txAccountId.split('-')[0];
    const rawId = txAccountId.split('-').slice(1).join('-');
    const accountType: 'cash' | 'card' = typePrefix === 'cash' ? 'cash' : 'card';

    if (txType === 'income' && onAddIncome) {
      onAddIncome(amountNum, txDate, txTitle, txCategory as any, rawId, accountType);
    } else if (txType === 'expense' && onAddExpense) {
      onAddExpense(txTitle, 'Quick Dashboard Expense Entry', amountNum, txDate, txCategory as any, rawId, accountType, 0);
    }

    // Reset Form & Close
    setTxTitle('');
    setTxAmount('');
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          {/* Overlay backdrop with high-end blur */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Bottom Sheet on Mobile, Centered Dialog on Desktop */}
          <motion.div 
            initial={{ y: "100%", opacity: 0.5 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0.5 }}
            transition={{ type: "spring", damping: 25, stiffness: 220 }}
            className="relative w-full md:max-w-md bg-[var(--bg-card)] border-t md:border border-[var(--border-primary)] rounded-t-[24px] md:rounded-[24px] shadow-2xl p-6 text-left z-10 flex flex-col max-h-[90vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex justify-between items-center pb-4 border-b border-[var(--border-primary)]">
              <div className="space-y-1">
                <h4 className="text-base font-bold font-display text-[var(--text-primary)]">Quick Register</h4>
                <p className="text-[10px] text-[var(--text-muted)] font-sans">Instant single-entry ledger record</p>
              </div>
              <button 
                onClick={onClose}
                className="p-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Toggle Switch */}
            <div className="flex bg-[var(--bg-surface)] p-1 rounded-xl border border-[var(--border-primary)] my-5 relative">
              <button
                type="button"
                onClick={() => setTxType('expense')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all z-10 ${
                  txType === 'expense' ? 'bg-[var(--bg-card)] text-[var(--negative)] shadow-sm border border-[var(--border-primary)]' : 'text-[var(--text-secondary)]'
                }`}
              >
                Expense Outflow
              </button>
              <button
                type="button"
                onClick={() => setTxType('income')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all z-10 ${
                  txType === 'income' ? 'bg-[var(--bg-card)] text-[var(--accent-primary)] shadow-sm border border-[var(--border-primary)]' : 'text-[var(--text-secondary)]'
                }`}
              >
                Income Inflow
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Receipt Live Preview Box */}
              <div className="bg-[var(--bg-surface)] border border-[var(--border-primary)] p-4 rounded-xl space-y-2.5 relative overflow-hidden">
                <div className="absolute right-2 top-2">
                  <Sparkles size={14} className="text-[var(--accent-primary)] opacity-40 animate-pulse" />
                </div>
                <span className="text-[8px] font-mono text-[var(--text-muted)] uppercase tracking-widest block font-bold">TICKET PREVIEW</span>
                <div className="flex justify-between items-baseline">
                  <span className="text-xs font-bold text-[var(--text-primary)] truncate max-w-[200px]">{txTitle || "Untitled Statement"}</span>
                  <span className={`text-sm font-black font-mono ${txType === 'expense' ? 'text-[var(--negative)]' : 'text-[var(--accent-primary)]'}`}>
                    {txType === 'expense' ? '-' : '+'}{state.currency}{parseFloat(txAmount || "0").toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-[9px] font-mono text-[var(--text-muted)] border-t border-[var(--border-primary)]/70 pt-2">
                  <span>Category: {txCategory}</span>
                  <span>Date: {txDate}</span>
                </div>
              </div>

              {/* Inputs */}
              <div className="space-y-1 text-left">
                <label className="text-[10px] uppercase font-bold tracking-wider font-mono text-[var(--text-secondary)]">Statement/Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Monzo Weekly Grocery"
                  value={txTitle}
                  onChange={(e) => setTxTitle(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-primary)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] transition-all placeholder-[var(--text-muted)] font-sans"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1 text-left">
                  <label className="text-[10px] uppercase font-bold tracking-wider font-mono text-[var(--text-secondary)]">Amount ({state.currency})</label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="any"
                    placeholder="0.00"
                    value={txAmount}
                    onChange={(e) => setTxAmount(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-primary)] text-sm font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] transition-all placeholder-[var(--text-muted)]"
                  />
                </div>

                <div className="space-y-1 text-left">
                  <label className="text-[10px] uppercase font-bold tracking-wider font-mono text-[var(--text-secondary)]">Category</label>
                  <select
                    value={txCategory}
                    onChange={(e) => setTxCategory(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-primary)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] transition-all cursor-pointer font-sans"
                  >
                    {txType === 'expense' ? (
                      <>
                        <option value="Utilities">Utilities</option>
                        <option value="Food & Dining">Food & Dining</option>
                        <option value="Rent & Housing">Rent & Housing</option>
                        <option value="Shopping">Shopping</option>
                        <option value="Entertainment">Entertainment</option>
                        <option value="Transport">Transport</option>
                        <option value="Investment">Investment</option>
                        <option value="Others">Others</option>
                      </>
                    ) : (
                      <>
                        <option value="Salary">Salary</option>
                        <option value="Freelance">Freelance</option>
                        <option value="Investments">Investments</option>
                        <option value="Gifts">Gifts</option>
                        <option value="Refunds">Refunds</option>
                        <option value="Others">Others</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1 text-left">
                  <label className="text-[10px] uppercase font-bold tracking-wider font-mono text-[var(--text-secondary)]">Settle Account</label>
                  <select
                    value={txAccountId}
                    onChange={(e) => setTxAccountId(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-primary)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] transition-all cursor-pointer font-sans"
                  >
                    <optgroup label="Cash Accounts">
                      {state.cashAccounts.map(c => (
                        <option key={c.id} value={`cash-${c.id}`}>{c.name} ({state.currency}{c.balance.toLocaleString()})</option>
                      ))}
                    </optgroup>
                    <optgroup label="Bank/Debit Cards">
                      {state.cards.filter(c => c.cardType === 'Debit' && !c.isCanceled).map(c => (
                        <option key={c.id} value={`card-${c.id}`}>{c.cardName} ({state.currency}{c.currentBalance.toLocaleString()})</option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                <div className="space-y-1 text-left">
                  <label className="text-[10px] uppercase font-bold tracking-wider font-mono text-[var(--text-secondary)]">Record Date</label>
                  <input
                    type="date"
                    required
                    value={txDate}
                    onChange={(e) => setTxDate(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-primary)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] transition-all cursor-pointer font-mono"
                  />
                </div>
              </div>

              {/* Submit Action */}
              <div className="pt-4 border-t border-[var(--border-primary)] mt-4">
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  type="submit"
                  className="w-full bg-[var(--text-primary)] hover:bg-[var(--text-secondary)] text-[var(--bg-primary)] py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all duration-150 cursor-pointer"
                >
                  Confirm Ledger Registry
                </motion.button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
