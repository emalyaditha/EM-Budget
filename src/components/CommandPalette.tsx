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
    {
      id: 'add-expense',
      title: 'Record Expense',
      subtitle: 'Log a new cash or card outgoing payment',
      category: 'Actions',
      icon: <PlusCircle className="text-[var(--danger)]" size={16} />,
      shortcut: 'E',
    },
    {
      id: 'add-income',
      title: 'Record Income',
      subtitle: 'Deposit salary, freelance or earnings',
      category: 'Actions',
      icon: <PlusCircle className="text-[var(--success)]" size={16} />,
      shortcut: 'I',
    },
    {
      id: 'transfer-funds',
      title: 'Transfer Money',
      subtitle: 'Move funds between cash wallets or bank cards',
      category: 'Actions',
      icon: <ArrowLeftRight className="text-[var(--accent-primary)]" size={16} />,
      shortcut: 'T',
    },
    {
      id: 'add-card',
      title: 'Add Bank Card',
      subtitle: 'Register new debit or credit card',
      category: 'Actions',
      icon: <CreditCard className="text-amber-400" size={16} />,
    },
    {
      id: 'nav-dashboard',
      title: 'Go to Dashboard',
      subtitle: 'View overall net worth & liquidity overview',
      category: 'Navigation',
      icon: <Wallet size={16} />,
    },
    {
      id: 'nav-transactions',
      title: 'View All Transactions',
      subtitle: 'Browse complete ledger history and filters',
      category: 'Navigation',
      icon: <FileText size={16} />,
    },
    {
      id: 'nav-budgets',
      title: 'Manage Budgets & Goals',
      subtitle: 'Track spending limits and savings progress',
      category: 'Navigation',
      icon: <PiggyBank size={16} />,
    },
    {
      id: 'nav-reports',
      title: 'Financial Audit & Export',
      subtitle: 'Generate PDF or CSV statements',
      category: 'Reports',
      icon: <Settings size={16} />,
    },
  ];

  const filteredItems = items.filter(
    (item) =>
      item.title.toLowerCase().includes(query.toLowerCase()) ||
      item.subtitle.toLowerCase().includes(query.toLowerCase()) ||
      item.category.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else setQuery('');
      } else if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDownInMenu = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredItems.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        onSelectAction(filteredItems[selectedIndex].id);
        onClose();
      }
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-md"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-xl bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl shadow-2xl overflow-hidden z-10"
            onKeyDown={handleKeyDownInMenu}
          >
            {/* Search Input */}
            <div className="flex items-center px-4 py-3.5 border-b border-[var(--border-primary)] bg-[var(--bg-surface)]">
              <Search size={18} className="text-[var(--text-muted)] mr-3 shrink-0" />
              <input
                type="text"
                autoFocus
                placeholder="Type a command or search... (e.g. Add Expense)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none font-medium border-none p-0 focus:ring-0"
              />
              <button
                onClick={onClose}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-lg cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Command Results */}
            <div className="max-h-80 overflow-y-auto p-2 custom-scrollbar">
              {filteredItems.length === 0 ? (
                <div className="py-8 text-center text-xs text-[var(--text-muted)] font-mono">
                  No actions matching "{query}"
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredItems.map((item, index) => {
                    const isSelected = index === selectedIndex;
                    return (
                      <div
                        key={item.id}
                        onClick={() => {
                          onSelectAction(item.id);
                          onClose();
                        }}
                        onMouseEnter={() => setSelectedIndex(index)}
                        className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-[var(--accent-primary)]/15 border border-[var(--accent-primary)]/30 text-[var(--text-primary)]'
                            : 'hover:bg-[var(--bg-surface)] text-[var(--text-secondary)]'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                              isSelected
                                ? 'bg-[var(--accent-primary)]/20 text-[var(--accent-primary)]'
                                : 'bg-[var(--bg-surface)] text-[var(--text-muted)]'
                            }`}
                          >
                            {item.icon}
                          </div>
                          <div className="min-w-0">
                            <h5 className="text-xs font-bold text-[var(--text-primary)] truncate font-display">
                              {item.title}
                            </h5>
                            <p className="text-[10px] text-[var(--text-muted)] truncate">{item.subtitle}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {item.shortcut && (
                            <span className="px-1.5 py-0.5 text-[9px] font-mono rounded bg-[var(--bg-surface)] border border-[var(--border-primary)] text-[var(--text-muted)]">
                              {item.shortcut}
                            </span>
                          )}
                          <ChevronRight
                            size={14}
                            className={`transition-transform ${
                              isSelected ? 'translate-x-0.5 text-[var(--accent-primary)]' : 'text-[var(--text-muted)]'
                            }`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Keyboard tips footer */}
            <div className="px-4 py-2 border-t border-[var(--border-primary)] bg-[var(--bg-surface)]/50 text-[10px] text-[var(--text-muted)] flex items-center justify-between font-mono">
              <div className="flex items-center gap-3">
                <span>↑↓ Navigate</span>
                <span>↵ Select</span>
                <span>ESC Close</span>
              </div>
              <span className="text-[var(--accent-primary)] font-bold">EM Ledger OS</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
