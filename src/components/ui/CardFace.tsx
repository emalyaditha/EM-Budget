import React from 'react';
import { ChevronRight } from 'lucide-react';
import { formatMoney } from '../../lib/money';

export type CardFaceTone = 'face-violet' | 'face-blue' | 'face-teal' | 'face-amber' | 'face-rose' | 'face-graphite';

const FACE_TONES: CardFaceTone[] = [
  'face-violet',
  'face-blue',
  'face-teal',
  'face-amber',
  'face-rose',
  'face-graphite',
];

export function faceToneForSeed(seed: string): CardFaceTone {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return FACE_TONES[h % FACE_TONES.length];
}

export function maskCardNumber(cardNumber?: string): string {
  const digits = (cardNumber || '').replace(/\D/g, '');
  if (digits.length >= 4) return `•••• •••• •••• ${digits.slice(-4)}`;
  return '•••• •••• •••• 0000';
}

interface CardFaceProps {
  bankName: string;
  cardName?: string;
  balance: number;
  currency: string;
  cardNumber?: string;
  tone?: CardFaceTone;
  width?: number;
  /** Fill the parent instead of the 250px floor, so faces survive a 320px hero. */
  fluid?: boolean;
  balanceLabel?: string;
  /** A liability: the number is what is owed, so it reads "Owed" in danger ink. */
  owed?: boolean;
  onClick?: () => void;
  badge?: React.ReactNode;
}

export function CardFace({
  bankName,
  cardName,
  balance,
  currency,
  cardNumber,
  tone = 'face-violet',
  width,
  fluid = false,
  balanceLabel,
  owed = false,
  onClick,
  badge,
}: CardFaceProps) {
  const className = `card-face ${tone} w-full text-left p-3.5 flex flex-col justify-between gap-2 pressable ${onClick ? 'cursor-pointer' : ''}`;
  const style = fluid
    ? { width: '100%', minWidth: 0, aspectRatio: '1.586' }
    : { width, aspectRatio: '1.586', minWidth: width ?? 250 };
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2 relative z-10">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-white/75 truncate">{bankName}</p>
          {cardName && <p className="text-[10px] text-white/55 truncate mt-0.5">{cardName}</p>}
        </div>
        {badge ?? (
          <span className="text-[9px] font-extrabold uppercase tracking-widest text-white/70 border border-white/25 rounded-full px-2 py-0.5">
            Card
          </span>
        )}
      </div>
      <div className="relative z-10">
        <p className="eyebrow !text-white/55">{balanceLabel ?? (owed ? 'Owed' : 'Balance')}</p>
        <p className="money text-[19px] font-extrabold text-white leading-tight mt-0.5">
          {formatMoney(currency, balance, { maxFractionDigits: 0 })}
        </p>
      </div>
      <div className="relative z-10 space-y-2">
        <div className="flex items-center justify-between">
          <span className="card-face-chip" aria-hidden />
          {onClick && <ChevronRight size={14} className="text-white/60" />}
        </div>
        <p className="mono text-[10px] tracking-[0.14em] text-white/80 whitespace-nowrap">
          {maskCardNumber(cardNumber)}
        </p>
      </div>
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className} style={style}>
        {inner}
      </button>
    );
  }
  return (
    <div className={className} style={style}>
      {inner}
    </div>
  );
}
