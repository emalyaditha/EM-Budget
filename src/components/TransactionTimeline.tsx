import React from 'react';
import { Transaction, CashAccount, BankCard } from '../types';
import { Search, ArrowDownRight, ArrowUpRight, ArrowLeftRight, CreditCard, ShieldAlert } from 'lucide-react';
import { useTransactions } from '../hooks/useTransactions';

export interface TransactionTimelineProps {
  transactions: Transaction[];
  cashAccounts: CashAccount[];
  cards: BankCard[];
  currency: string;
  onSelectTransaction?: (transaction: Transaction) => void;
  onAddTransactionClick?: () => void;
}

export function TransactionTimeline({ transactions, cashAccounts, cards, currency, onSelectTransaction, onAddTransactionClick }: TransactionTimelineProps) {
  const { searchQuery, setSearchQuery, categoryFilter, setCategoryFilter, typeFilter, setTypeFilter, accountFilter, setAccountFilter, filteredTransactions } = useTransactions(transactions);

  const getAccountName=(accId?:string,accType?:'cash'|'card')=>{
    if(!accId) return undefined;
    if(accType==='cash'){ const c=cashAccounts.find(x=>x.id===accId); return c?c.name:'Cash Wallet'; }
    const card=cards.find(x=>x.id===accId); return card?card.cardName:'Bank Card';
  };
  const isIncome=(t:string)=> t==='income'||t==='deposit';
  const isExpense=(t:string)=> t==='expense'||t==='credit_card_charge'||t==='withdrawal';

  return (
    <div className="space-y-5">
      {/* Header — ultra gradient dark like Mitchell/Aivo */}
      <div className="gradient-card p-4 sm:p-5 space-y-4 overflow-hidden" style={{ background: 'var(--gradient-card-dark)' }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10">
          <div>
            <span className="eyebrow !text-white/60">Ledger</span>
            <h3 className="text-[13px] font-bold tracking-tight text-white -mt-0.5">Transaction Ledger</h3>
            <p className="text-xs text-white/60">Chronological cash flow</p>
          </div>
          <span className="pill !bg-white/10 !border-white/15 !text-white mono !text-[11px] self-start sm:self-auto tabular-nums">{filteredTransactions.length} entries</span>
        </div>
        <div className="rainbow-bar relative z-10 opacity-80" />

        {/* Filters — pill inputs Aivo style — rendered outside dark header but pill aesthetic */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_auto_auto_auto] gap-3 items-end relative z-10 pt-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" />
            <input placeholder="Search transactions…" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} className="input !pl-9 !bg-white/10 !border-white/15 !text-white placeholder:!text-white/40" />
          </div>
          <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)} className="input !text-xs !py-2.5 !bg-white/10 !border-white/15 !text-white">
            <option value="all">All types</option><option value="income">Incomes</option><option value="expense">Expenses</option><option value="transfer">Transfers</option><option value="debt_payment">Debt repayments</option>
          </select>
          <select value={accountFilter} onChange={e=>setAccountFilter(e.target.value)} className="input !text-xs !py-2.5 !bg-white/10 !border-white/15 !text-white">
            <option value="all">All wallets</option>
            {cashAccounts.map(c=>(<option key={c.id} value={c.id}>Vault: {c.name}</option>))}
            {cards.map(c=>(<option key={c.id} value={c.id}>Card: {c.cardName}</option>))}
          </select>
          <select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)} className="input !text-xs !py-2.5 !bg-white/10 !border-white/15 !text-white">
            <option value="all">All categories</option><option value="Salary">Salary</option><option value="Freelance">Freelance</option><option value="Food">Food</option><option value="Transport">Transport</option><option value="Utilities">Utilities</option><option value="Shopping">Shopping</option><option value="Entertainment">Entertainment</option>
          </select>
        </div>
      </div>

      {/* Ledger table — card with rainbow accent on top */}
      <div className="card overflow-hidden relative">
        <div className="rainbow-bar !h-1 !rounded-none absolute top-0 left-0 right-0" />
        {/* Table header — eyebrow */}
        <div className="hidden sm:grid grid-cols-[1fr_auto] gap-4 px-4 py-2.5 border-b border-[var(--line)] bg-[var(--surface-2)]/60">
          <span className="eyebrow">Entry</span>
          <span className="eyebrow text-right">Amount</span>
        </div>

        {filteredTransactions.length===0 ? (
          <div className="p-6">
            <div className="empty">
              <div className="w-10 h-10 rounded-full border border-[var(--line)] bg-[var(--surface-2)] flex items-center justify-center mx-auto text-[var(--ink-3)]"><ShieldAlert size={16}/></div>
              <h4 className="text-sm font-bold text-[var(--ink)] mt-3">No transactions found</h4>
              <p className="text-xs text-[var(--ink-2)] mt-1 max-w-sm mx-auto">No records match your filters or search.</p>
              {onAddTransactionClick && <button onClick={onAddTransactionClick} className="btn-primary mt-4 !text-xs">Add transaction</button>}
            </div>
          </div>
        ) : (
          <div className="divide-y divide-[var(--line)]">
            {/* Mobile eyebrow header for count */}
            <div className="sm:hidden px-4 py-2 border-b border-[var(--line)] bg-[var(--surface-2)]/60 flex justify-between">
              <span className="eyebrow">{filteredTransactions.length} entries</span>
              <span className="eyebrow">Amount</span>
            </div>
            {filteredTransactions.map(tx=>{
              const income=isIncome(tx.type); const expense=isExpense(tx.type);
              const amtColor=income?'text-[var(--success)]':expense?'text-[var(--danger)]':'text-[var(--ink)]';
              const sign=income?'+':expense?'-':'';
              const formatted=`${sign}${currency}${Math.abs(tx.amount).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
              const icon= income ? <ArrowDownRight size={12} className="text-[var(--success)]"/> : expense ? <ArrowUpRight size={12} className="text-[var(--danger)]"/> : tx.type==='transfer' ? <ArrowLeftRight size={12} className="text-[var(--ink-2)]"/> : <CreditCard size={12} className="text-[var(--ink-2)]"/>;
              return (
                <div key={tx.id} onClick={onSelectTransaction?()=>onSelectTransaction(tx):undefined} className={`group flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface-2)]/50 transition-colors ${onSelectTransaction?'cursor-pointer':''}`}>
                  <div className="w-8 h-8 rounded-full bg-[var(--ink)] text-[var(--accent-fg)] flex items-center justify-center shrink-0">{icon}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[13px] font-bold text-[var(--ink)] truncate">{tx.title}</span>
                      {tx.category && <span className="pill !py-0.5 !px-2 !text-[10px] mono hidden sm:inline-flex shrink-0">{tx.category}</span>}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 mono text-[11px] text-[var(--ink-3)]">
                      <span>{tx.date}</span>
                      {getAccountName(tx.accountId, tx.accountType) && <><span className="w-1 h-1 rounded-full bg-[var(--line-strong)]"/><span className="truncate">{getAccountName(tx.accountId, tx.accountType)}</span></>}
                    </div>
                    {tx.category && <span className="pill !py-0.5 !px-2 !text-[10px] mono sm:hidden inline-flex mt-1">{tx.category}</span>}
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`mono text-[13px] font-bold tabular-nums ${amtColor}`}>{formatted}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {filteredTransactions.length>0 && <div className="ledger-rule" />}
      </div>
    </div>
  );
}
