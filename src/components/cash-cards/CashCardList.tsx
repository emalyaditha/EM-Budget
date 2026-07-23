import React from 'react';
import { BankCard, CashAccount } from '../../types';
import { Wallet, Plus, Trash2, Edit } from 'lucide-react';

interface CashCardListProps {
  cashAccounts: CashAccount[];
  cards: BankCard[];
  currency: string;
  onAddCashAccountClick: () => void;
  onAddCardClick: () => void;
  onEditCashAccount: (id: string, newBalance: number) => void;
  onDeleteCashAccount: (id: string) => void;
  onSelectCard: (card: BankCard) => void;
  renderInteractiveCard: (card: BankCard, idx: number) => React.ReactNode;
}

export function CashCardList({
  cashAccounts,
  cards,
  currency,
  onAddCashAccountClick,
  onAddCardClick,
  onEditCashAccount,
  onDeleteCashAccount,
  renderInteractiveCard
}: CashCardListProps) {
  return (
    <div className="space-y-8">
      {/* 1. Physical Cash Accounts / Wallets Section */}
      <div className="space-y-4 text-left">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold font-display text-[var(--text-primary)]">Physical Cash Wallets</h3>
            <p className="text-xs text-[var(--text-secondary)]">On-hand liquid currency and manual cash vaults</p>
          </div>
          <button
            onClick={onAddCashAccountClick}
            className="px-3.5 py-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/90 text-slate-950 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <Plus size={14} className="stroke-[2.5]" />
            <span>New Wallet</span>
          </button>
        </div>

        {cashAccounts.length === 0 ? (
          <div className="p-8 text-center text-[var(--text-muted)] border border-dashed border-[var(--border-primary)] rounded-2xl bg-[var(--bg-card)] text-xs">
            No physical cash wallets established. Click "New Wallet" to register cash on hand.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cashAccounts.map((account) => (
              <div 
                key={account.id}
                className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-5 hover:border-[var(--border-secondary)] transition-all shadow-[var(--shadow-soft)] flex flex-col justify-between h-36"
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] border border-[var(--accent-primary)]/20 flex items-center justify-center shrink-0">
                      <Wallet size={18} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-[var(--text-primary)] font-display leading-tight">{account.name}</h4>
                      <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase mt-0.5 block">Liquid Vault</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        const val = prompt(`Update balance for ${account.name}:`, account.balance.toString());
                        if (val !== null && !isNaN(parseFloat(val))) {
                          onEditCashAccount(account.id, parseFloat(val));
                        }
                      }}
                      className="p-1.5 rounded-lg hover:bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
                      title="Adjust Cash Balance"
                    >
                      <Edit size={13} />
                    </button>
                    <button
                      onClick={() => onDeleteCashAccount(account.id)}
                      className="p-1.5 rounded-lg hover:bg-[var(--negative)]/10 text-[var(--text-secondary)] hover:text-[var(--negative)] transition-all cursor-pointer"
                      title="Delete Cash Wallet"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <div className="pt-2 border-t border-[var(--border-primary)]/60">
                  <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] font-mono block">Vault Balance</span>
                  <p className="text-xl font-bold font-mono text-[var(--text-primary)] mt-0.5">
                    {currency}{account.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. Bank Debit & Digital Cards Section */}
      <div className="space-y-4 text-left">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold font-display text-[var(--text-primary)]">Bank Cards & Accounts</h3>
            <p className="text-xs text-[var(--text-secondary)]">Registered debit, credit, and digital payment cards</p>
          </div>
          <button
            onClick={onAddCardClick}
            className="px-3.5 py-2 bg-[var(--text-primary)] hover:bg-[var(--text-secondary)] text-[var(--bg-primary)] rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <Plus size={14} className="stroke-[2.5]" />
            <span>Add Bank Card</span>
          </button>
        </div>

        {cards.length === 0 ? (
          <div className="p-8 text-center text-[var(--text-muted)] border border-dashed border-[var(--border-primary)] rounded-2xl bg-[var(--bg-card)] text-xs">
            No bank cards registered yet. Click "Add Bank Card" to store your cards securely.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {cards.map((card, idx) => renderInteractiveCard(card, idx))}
          </div>
        )}
      </div>
    </div>
  );
}
