import { useState } from 'react';
import type React from 'react';
import { Plus, ArrowDownLeft, Send, ArrowUpRight, ChevronDown, Wallet } from 'lucide-react';
import type { Transaction } from '../../types';
import { AnimatedCountUp } from '../ui/AnimatedCountUp';
import { formatMoney } from '../../lib/money';
import { WalletDeck, type HeroWallet } from './WalletDeck';

interface DashboardHeroProps {
  currency: string;
  aggregateActiveWealth: number;
  totalCashAmount?: number;
  totalDebitCardsAmount?: number;
  userName?: string;
  currentMonthInflow?: number;
  currentMonthOutflow?: number;
  todayOutflow?: number;
  transactions?: Transaction[];
  /** Every real wallet and card, in ledger order. Empty renders the plain hero. */
  wallets?: HeroWallet[];
  onAddExpense?: () => void;
  onAddIncome?: () => void;
  onSend?: () => void;
  onManageWallets?: () => void;
}

function getFirstName(full: string) {
  if (!full) return '';
  const n = full.trim().split(/\s+/)[0];
  return n.charAt(0).toUpperCase() + n.slice(1);
}

function ActionKey({
  label,
  onClick,
  icon: Icon,
}: {
  label: string;
  onClick?: () => void;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}) {
  return (
    <button type="button" onClick={onClick} className="action-key min-w-0">
      <span className="action-key-icon">
        <Icon size={19} strokeWidth={2.1} />
      </span>
      <span className="text-[10px] leading-none whitespace-nowrap">{label}</span>
    </button>
  );
}

export function DashboardHero({
  currency,
  aggregateActiveWealth,
  totalCashAmount = 0,
  totalDebitCardsAmount = 0,
  currentMonthInflow = 0,
  currentMonthOutflow = 0,
  todayOutflow = 0,
  userName = '',
  wallets = [],
  onAddExpense,
  onAddIncome,
  onSend,
  onManageWallets,
}: DashboardHeroProps) {
  const firstName = getFirstName(userName);
  const liquidCash = totalCashAmount + totalDebitCardsAmount;
  const net = currentMonthInflow - currentMonthOutflow;
  const positive = net >= 0;

  // Only the id is stored — every amount is read from `wallets` each render, so a
  // ledger edit can never leave the hero showing a stale balance.
  const [selectedId, setSelectedId] = useState('all');
  const selected = wallets.find((w) => w.id === selectedId);
  const shown: HeroWallet | undefined = selected ?? undefined;
  const amount = shown ? shown.amount : liquidCash;
  // A credit card's balance is a liability, so it reads "Owed" in danger ink
  // rather than as a negative number — the app never shows a sign for money.
  const owed = amount < 0;
  const caption = shown ? (owed ? `Owed · ${shown.name}` : `Available · ${shown.name}`) : 'Available Balance';

  return (
    <section className="flex flex-col gap-4 text-left" aria-label="Balance overview">
      {/* Greeting + today's spend */}
      <div className="flex items-start justify-between gap-3 px-1">
        <div className="min-w-0">
          <p className="eyebrow">{firstName ? `Welcome back, ${firstName}` : 'Welcome back'}</p>
          <p className="text-[13px] font-semibold text-[var(--ink)] mt-1">Here is your money today.</p>
        </div>
        <div className="shrink-0 text-right card-flat px-3 py-2" title="Spent today">
          <p className="eyebrow !text-[9px]">Spent · today</p>
          {todayOutflow > 0 ? (
            <p className="money text-sm font-bold mt-0.5" style={{ color: 'var(--danger)' }}>
              {formatMoney(currency, todayOutflow, { maxFractionDigits: 0 })}
            </p>
          ) : (
            <p className="money text-sm font-bold mt-0.5 text-[var(--ink-3)]">No spend yet</p>
          )}
        </div>
      </div>

      {wallets.length > 1 && (
        <WalletDeck wallets={wallets} currency={currency} selectedId={selected?.id ?? ''} onSelect={setSelectedId} />
      )}

      {/* The balance card is the front of that deck. */}
      <div className={wallets.length > 1 ? 'deck-front' : undefined}>
        <div
          className="pocket px-5 pt-7 pb-6 sm:px-7 sm:pt-8 sm:pb-7 flex flex-col gap-5 text-left"
          aria-label={shown ? `${shown.name} balance` : 'Total balance'}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-[13px] font-bold text-[var(--ink)] truncate">{shown ? shown.name : 'Wallets'}</p>
            {onManageWallets && (
              <button
                type="button"
                onClick={onManageWallets}
                aria-label="Manage wallets"
                className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)] rounded-full pl-2 py-1"
              >
                Manage
                <ArrowUpRight size={12} />
              </button>
            )}
          </div>

          {wallets.length > 0 && (
            <div className="flex justify-center">
              <span className="chip-select">
                <Wallet size={13} aria-hidden style={{ color: 'var(--ink-2)' }} />
                <select
                  className="wallet-select"
                  value={selected?.id ?? 'all'}
                  onChange={(event) => setSelectedId(event.target.value)}
                  aria-label="Choose which wallet the balance shows"
                >
                  <option value="all">All wallets</option>
                  {wallets.map((wallet) => (
                    <option key={wallet.id} value={wallet.id}>
                      {wallet.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={13} aria-hidden style={{ color: 'var(--ink-3)' }} />
              </span>
            </div>
          )}

          <div className="flex flex-col gap-2.5 items-center text-center">
            <p className="eyebrow !text-[10px]">{caption}</p>
            <div className="flex flex-wrap items-end justify-center gap-x-4 gap-y-2">
              <p className={`numeral ${owed ? '!text-[var(--danger)]' : 'text-[var(--ink)]'}`}>
                <AnimatedCountUp
                  key={selected?.id ?? 'all'}
                  value={Math.abs(amount)}
                  duration={900}
                  className="tabular-nums"
                />
                <span className="numeral-sup">{currency}</span>
              </p>
            </div>
            <span className={`delta-chip ${positive ? 'delta-up' : 'delta-down'}`} title="This month net">
              {positive ? '▲' : '▼'} {formatMoney(currency, net, { maxFractionDigits: 0 })}
            </span>
            <p className="text-[11px] money text-[var(--ink-3)]">
              Net worth{' '}
              <span className={aggregateActiveWealth < 0 ? 'text-[var(--danger)] font-semibold' : 'font-semibold'}>
                {formatMoney(currency, aggregateActiveWealth, { maxFractionDigits: 0 })}
              </span>
            </p>
          </div>

          {/* Action keys — the reference's three white Send/Receive/Add keys. */}
          <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
            <ActionKey label="Send" icon={Send} onClick={onSend} />
            <ActionKey label="Receive" icon={ArrowDownLeft} onClick={onAddIncome} />
            <ActionKey label="Add" icon={Plus} onClick={onAddExpense} />
          </div>
        </div>
      </div>

      {/* Income / spend strip */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card-flat p-3.5">
          <p className="eyebrow !text-[9px]">Income · month</p>
          <p className="money text-sm font-bold mt-1" style={{ color: 'var(--success)' }}>
            {formatMoney(currency, currentMonthInflow, { maxFractionDigits: 0 })}
          </p>
        </div>
        <div className="card-flat p-3.5">
          <p className="eyebrow !text-[9px]">Spent · month</p>
          <p className="money text-sm font-bold mt-1" style={{ color: 'var(--danger)' }}>
            {formatMoney(currency, currentMonthOutflow, { maxFractionDigits: 0 })}
          </p>
        </div>
      </div>
    </section>
  );
}
