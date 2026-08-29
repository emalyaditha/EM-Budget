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
            <h3 className="text-lg font-bold text-[var(--ink)]">Physical Cash Wallets</h3>
            <p className="text-xs text-[var(--ink-2)]">On-hand liquid currency and manual cash vaults</p>
          </div>
          <button
            onClick={onAddCashAccountClick}
            className="btn-primary px-3.5 py-2 text-xs flex items-center gap-1.5 shadow-sm"
          >
            <Plus size={14} className="stroke-[2.5]" />
            <span>New Wallet</span>
          </button>
        </div>

        {cashAccounts.length === 0 ? (
          <div className="p-8 text-center text-[var(--ink-2)] border border-dashed border-[var(--line)] rounded-2xl bg-[var(--surface-2)] text-xs">
            No physical cash wallets established. Click "New Wallet" to register cash on hand.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cashAccounts.map((account) => (
              <div 
                key={account.id}
                className="card p-5 flex flex-col justify-between h-36 hover:border-[var(--line-strong)]"
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--surface-2)] text-[var(--ink)] border border-[var(--line)] flex items-center justify-center shrink-0">
                      <Wallet size={18} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-[var(--ink)] leading-tight">{account.name}</h4>
                      <span className="eyebrow mt-0.5 block">Liquid Vault</span>
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
                      className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] text-[var(--ink-2)] hover:text-[var(--ink)] transition-all cursor-pointer"
                      title="Adjust Cash Balance"
                    >
                      <Edit size={13} />
                    </button>
                    <button
                      onClick={() => onDeleteCashAccount(account.id)}
                      className="p-1.5 rounded-lg hover:bg-[var(--danger-bg)] text-[var(--ink-2)] hover:text-[var(--danger)] transition-all cursor-pointer"
                      title="Delete Cash Wallet"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <div className="pt-2">
                  <div className="ledger-rule mb-2" />
                  <span className="eyebrow block">Vault Balance</span>
                  <p className="text-xl font-bold mono text-[var(--ink)] mt-0.5">
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
            <h3 className="text-lg font-bold text-[var(--ink)]">Bank Cards & Accounts</h3>
            <p className="text-xs text-[var(--ink-2)]">Registered debit, credit, and digital payment cards</p>
          </div>
          <button
            onClick={onAddCardClick}
            className="btn-primary px-3.5 py-2 text-xs flex items-center gap-1.5 shadow-sm"
          >
            <Plus size={14} className="stroke-[2.5]" />
            <span>Add Bank Card</span>
          </button>
        </div>

        {cards.length === 0 ? (
          <div className="p-8 text-center text-[var(--ink-2)] border border-dashed border-[var(--line)] rounded-2xl bg-[var(--surface-2)] text-xs">
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
