import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, PlusCircle, CreditCard, ArrowLeftRight, FileText, Wallet, PiggyBank, Settings, X, ChevronRight } from 'lucide-react';

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAction: (actionId: string) => void;
}

interface CommandItem {
  id: string;
  title: string;
  subtitle: string;
  category: 'Actions' | 'Navigation' | 'Reports';
  icon: React.ReactNode;
  shortcut?: string;
}

export function CommandPalette({ isOpen, onClose, onSelectAction }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const items: CommandItem[] = [
    { id: 'add-expense', title: 'Record Expense', subtitle: 'Log a new outgoing payment', category: 'Actions', icon: <PlusCircle size={14} />, shortcut: 'E' },
    { id: 'add-income', title: 'Record Income', subtitle: 'Deposit salary or earnings', category: 'Actions', icon: <PlusCircle size={14} />, shortcut: 'I' },
    { id: 'transfer-funds', title: 'Transfer Money', subtitle: 'Move funds between wallets or cards', category: 'Actions', icon: <ArrowLeftRight size={14} />, shortcut: 'T' },
    { id: 'add-card', title: 'Add Bank Card', subtitle: 'Register debit or credit card', category: 'Actions', icon: <CreditCard size={14} /> },
    { id: 'nav-dashboard', title: 'Go to Dashboard', subtitle: 'Net worth & liquidity overview', category: 'Navigation', icon: <Wallet size={14} /> },
    { id: 'nav-transactions', title: 'View All Transactions', subtitle: 'Ledger history and filters', category: 'Navigation', icon: <FileText size={14} /> },
    { id: 'nav-budgets', title: 'Manage Budgets & Goals', subtitle: 'Spending limits and savings', category: 'Navigation', icon: <PiggyBank size={14} /> },
    { id: 'nav-reports', title: 'Financial Audit & Export', subtitle: 'PDF / CSV statements', category: 'Reports', icon: <Settings size={14} /> },
  ];

  const filteredItems = items.filter((item) => item.title.toLowerCase().includes(query.toLowerCase()) || item.subtitle.toLowerCase().includes(query.toLowerCase()) || item.category.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (isOpen) onClose(); else setQuery(''); }
      else if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  useEffect(() => { setSelectedIndex(0); }, [query]);

  const handleKeyDownInMenu = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex((p) => (p + 1) % Math.max(1, filteredItems.length)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex((p) => (p - 1 + filteredItems.length) % Math.max(1, filteredItems.length)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filteredItems[selectedIndex]) { onSelectAction(filteredItems[selectedIndex].id); onClose(); } }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} onClick={onClose} className="fixed inset-0 bg-[var(--ink)]/40 backdrop-blur-[2px]" />
          <motion.div initial={{ opacity: 0, scale: 0.98, y: -6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98, y: -6 }} transition={{ type: 'spring', damping: 26, stiffness: 300 }} className="relative w-full max-w-[560px] bg-[var(--surface)] border border-[var(--line)] rounded-2xl shadow-2xl overflow-hidden z-10" onKeyDown={handleKeyDownInMenu}>
            <div className="flex items-center gap-3 px-4 h-12 border-b border-[var(--line)] bg-[var(--surface)]">
              <Search size={14} className="text-[var(--ink-3)] shrink-0" />
              <input type="text" autoFocus placeholder="Type a command… (try &quot;Add Expense&quot;)" value={query} onChange={(e) => setQuery(e.target.value)} className="w-full bg-transparent text-[13px] text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none" />
              <button onClick={onClose} aria-label="Close" className="w-7 h-7 rounded-full bg-[var(--surface-2)] border border-[var(--line)] text-[var(--ink-2)] hover:text-[var(--ink)] flex items-center justify-center shrink-0"><X size={12} /></button>
            </div>

            <div className="max-h-[340px] overflow-y-auto p-2">
              {filteredItems.length === 0 ? (
                <div className="py-10 text-center mono text-[12px] text-[var(--ink-3)]">No matches for “{query}”</div>
              ) : (
                <div className="space-y-0.5">
                  {filteredItems.map((item, index) => {
                    const isSelected = index === selectedIndex;
                    return (
                      <div key={item.id} role="option" aria-selected={isSelected} onClick={() => { onSelectAction(item.id); onClose(); }} onMouseEnter={() => setSelectedIndex(index)} className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer border ${isSelected ? 'bg-[var(--surface-2)] border-[var(--line-strong)]' : 'border-transparent hover:bg-[var(--surface-2)] hover:border-[var(--line)]'}`}>
                        <div className="flex items-center gap-3 min-w-0">
                          <span className={`w-7 h-7 rounded-full border flex items-center justify-center shrink-0 ${isSelected ? 'bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]' : 'bg-[var(--surface-2)] text-[var(--ink-2)] border-[var(--line)]'}`}>{item.icon}</span>
                          <div className="min-w-0">
                            <p className="text-[12px] font-semibold text-[var(--ink)] truncate">{item.title}</p>
                            <p className="text-[11px] text-[var(--ink-2)] truncate">{item.subtitle}</p>
                          </div>
                        </div>
                        <span className="flex items-center gap-2 shrink-0">
                          {item.shortcut && <span className="mono text-[10px] px-1.5 py-0.5 rounded-full border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink-3)]">{item.shortcut}</span>}
                          <ChevronRight size={12} className={isSelected ? 'text-[var(--ink-2)]' : 'text-[var(--ink-3)]'} />
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="px-4 h-8 border-t border-[var(--line)] bg-[var(--surface-2)] mono text-[10px] text-[var(--ink-3)] flex items-center justify-between">
              <span className="flex items-center gap-3"><span>↑↓ Navigate</span><span>↵ Select</span><span>Esc Close</span></span>
              <span className="eyebrow normal-case tracking-normal">⌘K</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
