import { LayoutDashboard, Wallet, ArrowLeftRight, PieChart, Menu, Plus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';

interface BottomNavigationProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
  onQuickActionClick: () => void;
  onMoreClick: () => void;
  isMoreOpen?: boolean;
}

const TABS = [
  { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
  { id: 'wallets', label: 'Wallets', icon: Wallet },
];
const TABS_RIGHT = [
  { id: 'transactions', label: 'Ledger', icon: ArrowLeftRight },
  { id: 'reports', label: 'Stats', icon: PieChart },
];

export function BottomNavigation({
  activeTab,
  onTabChange,
  onQuickActionClick,
  onMoreClick,
  isMoreOpen = false,
}: BottomNavigationProps) {
  const isActive = (id: string) => (id === 'more' ? isMoreOpen : activeTab === id && !isMoreOpen);

  const renderItem = (tab: { id: string; label: string; icon: LucideIcon }) => {
    const active = isActive(tab.id);
    const Icon = tab.icon;
    return (
      <button
        key={tab.id}
        aria-label={tab.label}
        aria-current={active ? 'page' : undefined}
        onClick={() => (tab.id === 'more' ? onMoreClick() : onTabChange(tab.id))}
        className={`nav-item ${active ? 'nav-item-active' : ''}`}
      >
        {active && (
          <motion.span
            layoutId="navActivePill"
            transition={{ type: 'spring', damping: 28, stiffness: 380 }}
            className="absolute inset-0 rounded-full bg-[var(--accent)]"
          />
        )}
        <span className="relative z-10 flex flex-col items-center gap-0.5">
          <Icon size={17} strokeWidth={active ? 2.4 : 2} />
          <span>{tab.label}</span>
        </span>
      </button>
    );
  };

  return (
    <nav aria-label="Bottom Navigation" className="floating-nav md:hidden">
      {TABS.map(renderItem)}
      <button
        onClick={onQuickActionClick}
        aria-label="Add transaction"
        className="nav-fab pressable"
        style={{ color: 'var(--accent-fg)' }}
      >
        <Plus size={24} strokeWidth={2.6} />
      </button>
      {TABS_RIGHT.map(renderItem)}
      {renderItem({ id: 'more', label: 'More', icon: Menu })}
    </nav>
  );
}

export default BottomNavigation;
