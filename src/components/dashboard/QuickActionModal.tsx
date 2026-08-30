import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Sparkles } from 'lucide-react';
import { AppState } from '../../types';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, todayLocal } from '../../utils';

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
  const [txDate, setTxDate] = useState(todayLocal());

  useEffect(() => {
    setTxType(initialType);
  }, [initialType]);

  useEffect(() => {
    setTxCategory(txType === 'expense' ? 'Utilities' : 'Salary');
  }, [txType]);

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

    setTxTitle('');
    setTxAmount('');
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          />

          <motion.div 
            initial={{ y: "100%", opacity: 0.5 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0.5 }}
            transition={{ type: "spring", damping: 25, stiffness: 220 }}
            className="relative w-full md:max-w-md bg-[var(--surface)] border-t md:border border-[var(--line)] rounded-t-[24px] md:rounded-[16px] p-6 text-left z-10 flex flex-col max-h-[90vh] overflow-y-auto card"
          >
            <div className="flex justify-between items-center pb-4 border-b border-[var(--line)]">
              <div className="space-y-1">
                <h4 className="text-sm font-semibold tracking-tight text-[var(--ink)]">Quick register</h4>
                <p className="eyebrow">Single-entry ledger record</p>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink-2)] hover:text-[var(--ink)] hover:border-[var(--line-strong)] transition-colors flex items-center justify-center"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex bg-[var(--surface-2)] p-1 rounded-xl border border-[var(--line)] my-5 relative">
              <button
                type="button"
                onClick={() => setTxType('expense')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all z-10 ${
                  txType === 'expense' ? 'bg-[var(--surface)] text-[var(--danger)] shadow-sm border border-[var(--line)]' : 'text-[var(--ink-2)]'
                }`}
              >
                Expense Outflow
              </button>
              <button
                type="button"
                onClick={() => setTxType('income')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all z-10 ${
                  txType === 'income' ? 'bg-[var(--surface)] text-[var(--success)] shadow-sm border border-[var(--line)]' : 'text-[var(--ink-2)]'
                }`}
              >
                Income Inflow
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="bg-[var(--surface-2)] border border-[var(--line)] p-4 rounded-xl space-y-2.5 relative overflow-hidden">
                <div className="absolute right-2 top-2">
                  <Sparkles size={14} className="text-[var(--ink-2)] opacity-40 animate-pulse" />
                </div>
                <span className="eyebrow block">Ticket Preview</span>
                <div className="flex justify-between items-baseline">
                  <span className="text-xs font-bold text-[var(--ink)] truncate max-w-[200px]">{txTitle || "Untitled Statement"}</span>
                  <span className={`text-sm font-black mono ${txType === 'expense' ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>
                    {txType === 'expense' ? '-' : '+'}{state.currency}{parseFloat(txAmount || "0").toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-[9px] mono text-[var(--ink-3)] border-t border-[var(--line)] pt-2">
                  <span>Category: {txCategory}</span>
                  <span>Date: {txDate}</span>
                </div>
              </div>

              <div className="space-y-1 text-left">
                <label className="eyebrow">Statement/Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Monzo Weekly Grocery"
                  value={txTitle}
                  onChange={(e) => setTxTitle(e.target.value)}
                  className="input"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1 text-left">
                  <label className="eyebrow">Amount ({state.currency})</label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="any"
                    placeholder="0.00"
                    value={txAmount}
                    onChange={(e) => setTxAmount(e.target.value)}
                    className="input mono"
                  />
                </div>

                <div className="space-y-1 text-left">
                  <label className="eyebrow">Category</label>
                  <select
                    value={txCategory}
                    onChange={(e) => setTxCategory(e.target.value)}
                    className="input cursor-pointer"
                  >
                    {txType === 'expense' ? (
                      EXPENSE_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))
                    ) : (
                      INCOME_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1 text-left">
                  <label className="eyebrow">Settle Account</label>
                  <select
                    value={txAccountId}
                    onChange={(e) => setTxAccountId(e.target.value)}
                    className="input cursor-pointer"
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
                  <label className="eyebrow">Record Date</label>
                  <input
                    type="date"
                    required
                    value={txDate}
                    onChange={(e) => setTxDate(e.target.value)}
                    className="input mono cursor-pointer"
                  />
                </div>
              </div>

              <div className="pt-4 ledger-rule mt-4" />
              <div className="pt-4">
                <motion.button
                  whileHover={{ y: -0.5 }}
                  whileTap={{ scale: 0.99 }}
                  type="submit"
                  className="btn-primary w-full text-center justify-center"
                >
                  Confirm ledger entry
                </motion.button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
