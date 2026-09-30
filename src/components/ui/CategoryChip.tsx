import {
  Briefcase,
  Car,
  Coins,
  PartyPopper,
  Gift,
  GraduationCap,
  Heart,
  Home,
  Receipt,
  Send,
  ShoppingCart,
  Plane,
  Utensils,
  Wallet,
  Zap,
  ArrowDownLeft,
  ArrowUpRight,
  PiggyBank,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  salary: Coins,
  freelance: Briefcase,
  business: Briefcase,
  bonus: Gift,
  commission: Coins,
  other: Wallet,
  food: Utensils,
  groceries: ShoppingCart,
  dining: Utensils,
  transport: Car,
  fuel: Car,
  shopping: ShoppingCart,
  bills: Receipt,
  utilities: Zap,
  rent: Home,
  housing: Home,
  entertainment: PartyPopper,
  subscriptions: PartyPopper,
  health: Heart,
  medical: Heart,
  education: GraduationCap,
  travel: Plane,
  transfer: Send,
  loan: PiggyBank,
  investing: PiggyBank,
  gift: Gift,
};

export type ChipTone = 'pink' | 'mint' | 'yellow' | 'lavender' | 'blue' | 'ink';

const TONE_BG: Record<ChipTone, string> = {
  pink: 'var(--pastel-pink)',
  mint: 'var(--pastel-mint)',
  yellow: 'var(--pastel-yellow)',
  lavender: 'var(--pastel-lavender)',
  blue: 'var(--pastel-blue)',
  ink: 'var(--surface-3)',
};

const TONE_CYCLE: ChipTone[] = ['lavender', 'blue', 'mint', 'yellow', 'pink'];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function toneForCategory(category: string): ChipTone {
  return TONE_CYCLE[hashString(category.toLowerCase().trim()) % TONE_CYCLE.length];
}

interface CategoryChipProps {
  category: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  tone?: ChipTone;
  iconOverride?: LucideIcon;
}

export function CategoryChip({ category, size = 'md', tone, iconOverride }: CategoryChipProps) {
  const key = category.toLowerCase().trim();
  const Icon = iconOverride ?? CATEGORY_ICONS[key] ?? Receipt;
  const dims = size === 'xs' ? 22 : size === 'sm' ? 32 : size === 'lg' ? 44 : 40;
  const glyph = size === 'xs' ? 12 : size === 'sm' ? 14 : size === 'lg' ? 19 : 17;
  const bg = tone ?? toneForCategory(category);
  return (
    <span
      className="grid place-items-center rounded-full shrink-0"
      style={{
        width: dims,
        height: dims,
        background: `color-mix(in oklab, ${TONE_BG[bg]} 55%, var(--surface))`,
        border: `1px solid color-mix(in oklab, ${TONE_BG[bg]} 70%, var(--line))`,
        color: 'var(--ink)',
      }}
      aria-hidden
    >
      <Icon size={glyph} strokeWidth={2} />
    </span>
  );
}

export function directionIcon(isIncome: boolean): LucideIcon {
  return isIncome ? ArrowDownLeft : ArrowUpRight;
}
