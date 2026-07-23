import React from 'react';
import { LayoutDashboard, Wallet, ArrowLeftRight, PieChart, Menu, Plus } from 'lucide-react';
import { motion } from 'motion/react';

export interface BottomNavigationProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
  onQuickActionClick: () => void;
  onMoreClick: () => void;
  isMoreOpen?: boolean;
}

export function BottomNavigation({
  activeTab,
  onTabChange,
  onQuickActionClick,
  onMoreClick,
  isMoreOpen = false,
}: BottomNavigationProps) {
  const tabs = [
    { id: 'dashboard', label: 'Home', icon: <LayoutDashboard size={18} /> },
    { id: 'wallets', label: 'Wallets', icon: <Wallet size={18} /> },
    { id: 'transactions', label: 'Ledger', icon: <ArrowLeftRight size={18} /> },
    { id: 'reports', label: 'Analytics', icon: <PieChart size={18} /> },
    { id: 'more', label: 'More', icon: <Menu size={18} /> },
  ];

  return (
    <>
      {/* Mobile Floating Action Button */}
      <div className="fixed bottom-20 right-5 z-40 md:hidden">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onQuickActionClick}
          className="w-12 h-12 rounded-full bg-[var(--accent-primary)] text-slate-950 font-bold flex items-center justify-center shadow-lg shadow-[var(--accent-primary)]/25 border border-[var(--accent-primary)] cursor-pointer"
          aria-label="Quick Action"
        >
          <Plus size={22} className="stroke-[2.5]" />
        </motion.button>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[var(--bg-sidebar)]/95 backdrop-blur-xl border-t border-[var(--border-primary)] md:hidden px-3 py-2">
        <div className="flex items-center justify-around max-w-md mx-auto">
          {tabs.map((tab) => {
            const isActive = tab.id === 'more' ? isMoreOpen : activeTab === tab.id && !isMoreOpen;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  if (tab.id === 'more') {
                    onMoreClick();
                  } else {
                    onTabChange(tab.id);
                  }
                }}
                className={`relative flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all cursor-pointer ${
                  isActive ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                <div className="relative">
                  {tab.icon}
                  {isActive && (
                    <motion.div
                      layoutId="activeTabIndicator"
                      className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[var(--accent-primary)]"
                    />
                  )}
                </div>
                <span className={`text-[10px] mt-1 font-medium font-sans ${isActive ? 'font-bold' : ''}`}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
