import { LayoutDashboard, Wallet, ArrowLeftRight, Menu, Plus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';

interface BottomNavigationProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
  onQuickActionClick: () => void;
  onMoreClick: () => void;
  isMoreOpen?: boolean;
  /** The login overlay is fixed and covers this bar, but it does not remove it
   *  from the tab order. Callers set this while that overlay is up. */
  inert?: boolean;
}

const TABS = [
  { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
  { id: 'wallets', label: 'Wallets', icon: Wallet },
];
const TABS_RIGHT = [{ id: 'transactions', label: 'Ledger', icon: ArrowLeftRight }];

export function BottomNavigation({
  activeTab,
  onTabChange,
  onQuickActionClick,
  onMoreClick,
  isMoreOpen = false,
  inert = false,
}: BottomNavigationProps) {
  const isActive = (id: string) => (id === 'more' ? isMoreOpen : activeTab === id && !isMoreOpen);
  // The shared pill is a layout animation, which the global CSS reduced-motion
  // clamp cannot reach — it has to be stilled here or the bar keeps sliding.
  const reduceMotion = useReducedMotion();

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
            transition={reduceMotion ? { duration: 0 } : { type: 'spring', damping: 28, stiffness: 380 }}
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
    <nav aria-label="Bottom Navigation" className="floating-nav lg:hidden" inert={inert}>
      {TABS.map(renderItem)}
      <button
        onClick={onQuickActionClick}
        aria-label="Open quick actions"
        title="Quick actions"
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
