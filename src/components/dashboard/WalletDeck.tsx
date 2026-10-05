import type { AppState } from '../../types';
import { CardFace, faceToneForSeed } from '../ui/CardFace';

/** One real account or card, ready to be shown as a face and as the hero balance. */
export interface HeroWallet {
  /** Prefixed ('cash:<id>' | 'card:<id>') so the two id spaces cannot collide. */
  id: string;
  kind: 'cash' | 'debit' | 'credit';
  name: string;
  subname?: string;
  /** Signed exactly as the ledger holds it: negative means owed. */
  amount: number;
  cardNumber?: string;
  frozen?: boolean;
  locked?: boolean;
}

const KIND_LABEL: Record<HeroWallet['kind'], string> = {
  cash: 'Cash',
  debit: 'Debit',
  credit: 'Credit',
};

/**
 * The deck's rows, built with the exact expressions `calculateNetWorth` uses, so
 * Σ(cash + debit) is the hero's "All wallets" number by construction rather than
 * by agreement. Card ids are prefixed because cash and card id spaces are
 * unrelated and the hero keys everything off one string.
 */
export function buildHeroWallets(state: Pick<AppState, 'cashAccounts' | 'cards'>): HeroWallet[] {
  const activeCards = (state.cards || []).filter((c) => !c.isCanceled);
  return [
    ...(state.cashAccounts || []).map((acc) => ({
      id: `cash:${acc.id}`,
      kind: 'cash' as const,
      name: acc.name,
      subname: 'Cash wallet',
      amount: acc.balance,
    })),
    ...activeCards
      .filter((c) => c.cardType === 'Debit')
      .map((card) => ({
        id: `card:${card.id}`,
        kind: 'debit' as const,
        name: card.bankName,
        subname: card.cardName,
        amount: card.currentBalance - (Number(card.lockedAmount) || 0),
        cardNumber: card.cardNumber,
        frozen: card.isFrozen,
        locked: Number(card.lockedAmount) > 0,
      })),
    ...activeCards
      .filter((c) => c.cardType === 'Credit')
      .map((card) => ({
        id: `card:${card.id}`,
        kind: 'credit' as const,
        name: card.bankName,
        subname: card.cardName,
        amount: card.currentBalance,
        cardNumber: card.cardNumber,
        frozen: card.isFrozen,
      })),
  ];
}

function FaceBadge({ wallet }: { wallet: HeroWallet }) {
  const label = wallet.frozen ? 'Frozen' : wallet.locked ? 'Locked' : KIND_LABEL[wallet.kind];
  return (
    <span className="text-[9px] font-extrabold uppercase tracking-widest text-white/70 border border-white/25 rounded-full px-2 py-0.5">
      {label}
    </span>
  );
}

/**
 * The peer faces that peek out from behind the hero card. The hero itself is the
 * front of the stack, so the selected wallet sits in the nearest slot (depth 1)
 * and the rest fall away behind it. Two peers is the whole budget: the native
 * selector in the hero reaches every account, and extra faces would only stack
 * into the same 30px of peek.
 */
export function WalletDeck({
  wallets,
  currency,
  selectedId,
  onSelect,
}: {
  wallets: HeroWallet[];
  currency: string;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  if (wallets.length < 2) return null;

  const selected = wallets.findIndex((w) => w.id === selectedId);
  const ordered = selected > 0 ? [...wallets.slice(selected), ...wallets.slice(0, selected)] : wallets;
  // Nearest the hero first; the DOM wants the farthest face on top.
  const peers = [ordered[0], ordered[1]].map((wallet, index) => ({
    wallet,
    depth: index === 0 ? 1 : 2,
  }));

  return (
    <div className="deck" role="group" aria-label="Wallets and cards">
      {peers
        .slice()
        .reverse()
        .map(({ wallet, depth }) => (
          <div key={wallet.id} className="deck-face" data-depth={depth}>
            <CardFace
              fluid
              bankName={wallet.name}
              cardName={wallet.subname}
              balance={Math.abs(wallet.amount)}
              owed={wallet.amount < 0}
              currency={currency}
              cardNumber={wallet.cardNumber}
              tone={faceToneForSeed(wallet.id)}
              badge={<FaceBadge wallet={wallet} />}
              onClick={() => onSelect(wallet.id)}
            />
          </div>
        ))}
    </div>
  );
}
