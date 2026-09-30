import React from 'react';
import { ChevronRight } from 'lucide-react';

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
  onClick,
  badge,
}: CardFaceProps) {
  const className = `card-face ${tone} w-full text-left p-4 flex flex-col justify-between gap-4 pressable ${onClick ? 'cursor-pointer' : ''}`;
  const style = { width, aspectRatio: '1.586', minWidth: width ?? 240 };
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
        <p className="eyebrow !text-white/55">Balance</p>
        <p className="money text-[19px] font-extrabold text-white leading-tight mt-0.5">
          {currency}
          {balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </p>
      </div>
      <div className="flex items-center justify-between gap-3 relative z-10">
        <span className="card-face-chip" aria-hidden />
        <span className="mono text-[11px] tracking-[0.18em] text-white/80">{maskCardNumber(cardNumber)}</span>
        {onClick && <ChevronRight size={14} className="text-white/60" />}
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
