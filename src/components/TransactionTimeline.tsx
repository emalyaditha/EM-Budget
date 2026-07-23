import React, { useState } from 'react';
import { Transaction, CashAccount, BankCard } from '../types';
import { TimelineItem } from './ui/TimelineItem';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { EmptyState } from './ui/EmptyState';
import { Search, ArrowDownRight, ArrowUpRight, ArrowLeftRight, CreditCard, ShieldAlert, Filter, Calendar } from 'lucide-react';
import { useTransactions } from '../hooks/useTransactions';

export interface TransactionTimelineProps {
  transactions: Transaction[];
  cashAccounts: CashAccount[];
  cards: BankCard[];
  currency: string;
  onSelectTransaction?: (transaction: Transaction) => void;
  onAddTransactionClick?: () => void;
}

export function TransactionTimeline({
  transactions,
  cashAccounts,
  cards,
  currency,
  onSelectTransaction,
  onAddTransactionClick,
}: TransactionTimelineProps) {
  const {
    searchQuery,
    setSearchQuery,
    categoryFilter,
    setCategoryFilter,
    typeFilter,
    setTypeFilter,
    accountFilter,
    setAccountFilter,
    filteredTransactions,
  } = useTransactions(transactions);

  const getAccountName = (accId?: string, accType?: 'cash' | 'card') => {
    if (!accId) return undefined;
    if (accType === 'cash') {
      const cash = cashAccounts.find((c) => c.id === accId);
      return cash ? cash.name : 'Cash Wallet';
    } else {
      const card = cards.find((c) => c.id === accId);
      return card ? card.cardName : 'Bank Card';
    }
  };

  const getIconForType = (type: Transaction['type']) => {
    switch (type) {
      case 'income':
      case 'deposit':
        return <ArrowDownRight className="text-[var(--success)]" size={16} />;
      case 'expense':
      case 'credit_card_charge':
      case 'withdrawal':
        return <ArrowUpRight className="text-[var(--danger)]" size={16} />;
      case 'transfer':
        return <ArrowLeftRight className="text-[var(--accent-primary)]" size={16} />;
      default:
        return <CreditCard className="text-[var(--text-secondary)]" size={16} />;
    }
  };

  return (
    <div className="space-y-6 text-left">
      {/* Header & Filter Controls */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-4 sm:p-5 shadow-[var(--shadow-soft)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold font-display text-[var(--text-primary)]">Transaction Ledger</h3>
            <p className="text-xs text-[var(--text-secondary)]">Complete chronological activity & cash flow movements</p>
          </div>
          <span className="px-2.5 py-1 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-primary)] text-[11px] font-mono font-medium text-[var(--text-secondary)] self-start sm:self-auto">
            {filteredTransactions.length} Logged Entries
          </span>
        </div>

        {/* Filter Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Input
            placeholder="Search transaction..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={<Search size={14} />}
          />

          <Select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            options={[
              { value: 'all', label: 'All Transaction Types' },
              { value: 'income', label: 'Incomes & Deposits' },
              { value: 'expense', label: 'Expenses & Charges' },
              { value: 'transfer', label: 'Transfers' },
              { value: 'debt_payment', label: 'Debt Repayments' },
            ]}
          />

          <Select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            options={[
              { value: 'all', label: 'All Wallets & Cards' },
              ...cashAccounts.map((c) => ({ value: c.id, label: `Vault: ${c.name}` })),
              ...cards.map((c) => ({ value: c.id, label: `Card: ${c.cardName}` })),
            ]}
          />

          <Select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            options={[
              { value: 'all', label: 'All Categories' },
              { value: 'Salary', label: 'Salary' },
              { value: 'Freelance', label: 'Freelance' },
              { value: 'Food', label: 'Food & Dining' },
              { value: 'Transport', label: 'Transport' },
              { value: 'Utilities', label: 'Utilities' },
              { value: 'Shopping', label: 'Shopping' },
              { value: 'Entertainment', label: 'Entertainment' },
            ]}
          />
        </div>
      </div>

      {/* Timeline List Container */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-4 sm:p-5 shadow-[var(--shadow-soft)]">
        {filteredTransactions.length === 0 ? (
          <EmptyState
            icon={<ShieldAlert size={20} />}
            title="No Transactions Found"
            description="No transaction records match your filter criteria or search query."
            actionLabel="Add Transaction"
            onAction={onAddTransactionClick}
          />
        ) : (
          <div className="space-y-1">
            {filteredTransactions.map((tx, idx) => (
              <TimelineItem
                key={tx.id}
                title={tx.title}
                subtitle={tx.category}
                amount={tx.amount}
                currency={currency}
                type={tx.type}
                date={tx.date}
                category={tx.category}
                accountName={getAccountName(tx.accountId, tx.accountType)}
                icon={getIconForType(tx.type)}
                isLast={idx === filteredTransactions.length - 1}
                onClick={onSelectTransaction ? () => onSelectTransaction(tx) : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
