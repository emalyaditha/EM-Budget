import React, { useState } from 'react';
import { Transaction, Subscription, Debt, CashAccount, BankCard } from '../types';
import { 
  ShieldCheck, AlertTriangle, CheckCircle2, XCircle, RotateCw, 
  Clock, Coins, ShieldAlert, CheckSquare, Settings, Landmark,
  Calendar, Check, ChevronDown, Eye, AlertCircle, HelpCircle
} from 'lucide-react';
import { compareMoney } from '../lib/money';
import { todayLocal } from '../utils';

interface AuditPanelProps {
  transactions: Transaction[];
  subscriptions: Subscription[];
  debts: Debt[];
  cashAccounts: CashAccount[];
  cards: BankCard[];
  currency: string;
  onToggleSubscriptionStatus?: (id: string, currentStatus: 'Active' | 'Paused' | 'Cancelled') => void;
  onPaySubscription?: (subId: string, accountId: string, accountType: 'cash' | 'card', paymentDate: string, bankCharge?: number) => void;
}

export default function AuditPanel({
  transactions,
  subscriptions,
  debts,
  cashAccounts,
  cards,
  currency,
  onToggleSubscriptionStatus,
  onPaySubscription,
}: AuditPanelProps) {
  const [activeAuditTab, setActiveAuditTab] = useState<'all' | 'subscriptions' | 'accounts' | 'debts'>('all');
  const [selectedSubToSettle, setSelectedSubToSettle] = useState<string | null>(null);
  const [settlingAccountId, setSettlingAccountId] = useState<string>('');
  const [settlingAccountType, setSettlingAccountType] = useState<'cash' | 'card'>('cash');
  const [settleDate, setSettleDate] = useState<string>(todayLocal());
  const [bankCharge, setBankCharge] = useState<number>(0);

  // Default select first cash/card account
  React.useEffect(() => {
    if (cashAccounts.length > 0) {
      setSettlingAccountId(cashAccounts[0].id);
      setSettlingAccountType('cash');
    } else if (cards.length > 0) {
      setSettlingAccountId(cards[0].id);
      setSettlingAccountType('card');
    }
  }, [cashAccounts, cards]);

  // 1. Audit Logic & Score Calculations
  const auditReport = React.useMemo(() => {
    let score = 100;
    const issues: { id: string; type: 'warning' | 'danger' | 'info'; section: 'subscriptions' | 'accounts' | 'debts'; title: string; desc: string }[] = [];
    const reconciledItemsCount = { subscriptions: 0, accounts: 0, debts: 0 };

    // Subscriptions Audit
    subscriptions.forEach(sub => {
      if (sub.status === 'Cancelled') return;

      const matchingTx = transactions.filter(t => {
        if (t.type !== 'expense') return false;
        const lowerTitle = (t.title || '').toLowerCase().trim();
        const lowerSubName = (sub.name || '').toLowerCase().trim();
        return lowerTitle === lowerSubName || 
               lowerTitle.includes(lowerSubName) || 
               lowerSubName.includes(lowerTitle) ||
               lowerTitle.replace(/subscription\s*(settle|payment)?:?\s*/g, '') === lowerSubName;
      });

      const hasMatchingPaymentForCurrentCycle = matchingTx.some(tx => {
        const txTime = new Date(tx.date).getTime();
        const dueTime = new Date(sub.dueDate).getTime();
        const diffDays = (txTime - dueTime) / (1000 * 60 * 60 * 24);
        return diffDays >= -15 && diffDays <= 25;
      });

      const today = new Date();
      today.setHours(0,0,0,0);
      const due = new Date(sub.dueDate);
      due.setHours(0,0,0,0);
      const isOverdue = due.getTime() < today.getTime() && sub.status === 'Active';

      if (isOverdue && !hasMatchingPaymentForCurrentCycle) {
        score -= 10;
        issues.push({
          id: `sub-issue-${sub.id}`,
          type: 'danger',
          section: 'subscriptions',
          title: `Overdue Subscription: ${sub.name}`,
          desc: `Marked active and renewal date is ${sub.dueDate} (${Math.round(Math.abs(due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))}d overdue), but no matching payment transaction was found in the ledger.`
        });
      } else if (hasMatchingPaymentForCurrentCycle) {
        reconciledItemsCount.subscriptions++;
      }
    });

    // Accounts Audit
    cashAccounts.forEach(acc => {
      if (acc.balance < 0) {
        score -= 10;
        issues.push({
          id: `acc-issue-neg-${acc.id}`,
          type: 'danger',
          section: 'accounts',
          title: `Overdrawn Cash Account: ${acc.name}`,
          desc: `Account balance is negative (${currency}${acc.balance.toLocaleString()}). Check if expenses are over-recorded.`
        });
      } else if (acc.balance < 5000) {
        score -= 3;
        issues.push({
          id: `acc-issue-${acc.id}`,
          type: 'warning',
          section: 'accounts',
          title: `Low Cash Balance: ${acc.name}`,
          desc: `Current balance is ${currency}${acc.balance.toLocaleString()} which is below the safe threshold of ${currency}5,000.`
        });
      } else {
        reconciledItemsCount.accounts++;
      }
    });

    cards.forEach(card => {
      if (card.isCanceled) return;

      if (card.cardType === 'Credit') {
        const limit = card.limit || 0;
        const owes = Math.abs(card.currentBalance);
        
        if (owes > limit) {
          score -= 12;
          issues.push({
            id: `card-issue-${card.id}`,
            type: 'danger',
            section: 'accounts',
            title: `Credit Card Overlimit: ${card.cardName}`,
            desc: `Current balance ${currency}${owes.toLocaleString()} exceeds credit limit of ${currency}${limit.toLocaleString()}.`
          });
        } else if (limit > 0 && owes > limit * 0.85) {
          score -= 5;
          issues.push({
            id: `card-issue-util-${card.id}`,
            type: 'warning',
            section: 'accounts',
            title: `High Credit Utilization: ${card.cardName}`,
            desc: `Credit card is at ${Math.round((owes / limit) * 100)}% utilization. Consider paying off balance to keep credit ratios healthy.`
          });
        } else {
          reconciledItemsCount.accounts++;
        }
      } else {
        if (card.currentBalance < 0 && !card.allowNegativeBalance) {
          score -= 8;
          issues.push({
            id: `card-issue-neg-${card.id}`,
            type: 'danger',
            section: 'accounts',
            title: `Overdrawn Debit Card: ${card.cardName}`,
            desc: `Debit Card balance is negative (${currency}${card.currentBalance.toLocaleString()}).`
          });
        } else if (card.currentBalance < 5000) {
          score -= 2;
          issues.push({
            id: `card-issue-low-${card.id}`,
            type: 'warning',
            section: 'accounts',
            title: `Low Debit Card Balance: ${card.cardName}`,
            desc: `Debit Card has a low balance of ${currency}${card.currentBalance.toLocaleString()}.`
          });
        } else {
          reconciledItemsCount.accounts++;
        }
      }
    });

    // Debts Audit
    debts.forEach(debt => {
      const today = new Date();
      today.setHours(0,0,0,0);
      const due = new Date(debt.dueDate);
      due.setHours(0,0,0,0);
      const isOverdue = due.getTime() < today.getTime() && debt.remainingAmount > 0;

      if (isOverdue) {
        score -= 10;
        issues.push({
          id: `debt-issue-${debt.id}`,
          type: 'danger',
          section: 'debts',
          title: `Overdue Outstanding Debt: ${debt.debtSource}`,
          desc: `Repayment deadline was ${debt.dueDate}, but there is still an outstanding balance of ${currency}${debt.remainingAmount.toLocaleString()} to settle.`
        });
      } else if (compareMoney(debt.remainingAmount, 0) === 0 && debt.status !== 'Fully Repaid') {
        issues.push({
          id: `debt-issue-status-${debt.id}`,
          type: 'info',
          section: 'debts',
          title: `Status Align Recommended: ${debt.debtSource}`,
          desc: `Debt principal has been fully paid off, but status is not marked 'Fully Repaid' or 'Closed'.`
        });
      } else {
        reconciledItemsCount.debts++;
      }
    });

    const finalScore = Math.max(0, score);
    let rating = 'Excellent';
    let ratingColor = 'text-emerald-500';
    let ratingBg = 'border-emerald-500/20 bg-emerald-500/5';
    if (finalScore < 70) {
      rating = 'Action Needed';
      ratingColor = 'text-[var(--danger)]';
      ratingBg = 'border-[var(--danger)]/20 bg-[var(--danger-bg)]';
    } else if (finalScore < 90) {
      rating = 'Fair';
      ratingColor = 'text-amber-500';
      ratingBg = 'border-amber-500/20 bg-[var(--warning-bg)]';
    }

    return {
      score: finalScore,
      rating,
      ratingColor,
      ratingBg,
      issues,
      reconciledItemsCount
    };
  }, [transactions, subscriptions, debts, cashAccounts, cards, currency]);

  const handleSettleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubToSettle || !settlingAccountId || !onPaySubscription) return;

    onPaySubscription(
      selectedSubToSettle,
      settlingAccountId,
      settlingAccountType,
      settleDate,
      bankCharge
    );
    setSelectedSubToSettle(null);
    setBankCharge(0);
  };

  const getSubHealth = (sub: Subscription) => {
    if (sub.status !== 'Active') return { label: 'Paused', color: 'text-[var(--ink-2)] bg-[var(--surface-2)] border-[var(--line)]' };

    const matchingTx = transactions.filter(t => {
      if (t.type !== 'expense') return false;
      const lowerTitle = (t.title || '').toLowerCase().trim();
      const lowerSubName = (sub.name || '').toLowerCase().trim();
      return lowerTitle === lowerSubName || 
             lowerTitle.includes(lowerSubName) || 
             lowerSubName.includes(lowerTitle);
    });

    const hasMatchingPayment = matchingTx.some(tx => {
      const txTime = new Date(tx.date).getTime();
      const dueTime = new Date(sub.dueDate).getTime();
      const diffDays = (txTime - dueTime) / (1000 * 60 * 60 * 24);
      return diffDays >= -15 && diffDays <= 25;
    });

    const today = new Date();
    today.setHours(0,0,0,0);
    const due = new Date(sub.dueDate);
    due.setHours(0,0,0,0);
    const isOverdue = due.getTime() < today.getTime();

    if (isOverdue && !hasMatchingPayment) {
      return { label: 'Missing Payment', color: 'text-rose-600 bg-rose-50 border-rose-200 dark:text-rose-400 dark:bg-rose-950/40 dark:border-rose-900' };
    }
    if (hasMatchingPayment) {
      return { label: 'Verified & Aligned', color: 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/40 dark:border-emerald-900' };
    }
    return { label: 'Active & Tracked', color: 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/40 dark:border-blue-900' };
  };

  const filteredIssues = auditReport.issues.filter(issue => {
    if (activeAuditTab === 'all') return true;
    return issue.section === activeAuditTab;
  });

  return (
    <div className="space-y-6 animate-fade-in" id="audit-report-dashboard">
      
      {/* SCORE HEADER — ULTRA gradient-card-dark + rainbow + Raul arc imitation */}
      <div className="gradient-card p-6 flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden" style={{ background: 'var(--gradient-card-dark)' }}>
        <div className="flex items-center gap-4 relative z-10">
          <div className="w-12 h-12 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-white">
            <ShieldCheck size={28} className="text-white" />
          </div>
          <div>
            <p className="eyebrow !text-white/60">Ledger Integrity Diagnostic</p>
            <h3 className="text-xl font-extrabold text-white">System Audit & Health Report</h3>
            <p className="text-white/60 text-xs mt-0.5">Automated transaction reconciliation and ledger verification engine.</p>
          </div>
        </div>

        <div className="flex items-center gap-5 shrink-0 bg-white/10 px-6 py-4 rounded-2xl border border-white/10 relative z-10">
          <div className="text-center">
            <span className="eyebrow !text-white/60 block">Health Score</span>
            <span className="text-4xl font-black mono text-white">{auditReport.score}/100</span>
          </div>
          <div className="h-10 w-[1px] bg-white/15" />
          <div className="text-left">
            <span className="eyebrow !text-white/60 block">Ledger Status</span>
            <span className="text-sm font-extrabold block text-white">{auditReport.rating}</span>
          </div>
        </div>
        <div className="rainbow-bar absolute bottom-0 left-0 right-0 !h-1 !rounded-none opacity-80" />
      </div>

      {/* STATS OVERVIEW — pill icons */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card p-3 flex items-center gap-3 overflow-hidden relative">
          <div className="w-9 h-9 rounded-full bg-[var(--ink)] text-[var(--accent-fg)] grid place-items-center shrink-0"><Clock size={14} /></div>
          <div><span className="eyebrow block">Subscriptions Aligned</span><span className="text-sm mono font-extrabold text-[var(--ink)]">{auditReport.reconciledItemsCount.subscriptions} / {subscriptions.filter(s => s.status !== 'Cancelled').length} Verified</span></div>
        </div>
        <div className="card p-3 flex items-center gap-3 overflow-hidden relative">
          <div className="w-9 h-9 rounded-full bar-mint grid place-items-center shrink-0 text-[var(--ink)]"><Landmark size={14} /></div>
          <div><span className="eyebrow block">Wallet Balance Safety</span><span className="text-sm mono font-extrabold text-[var(--ink)]">{cashAccounts.length + cards.filter(c => !c.isCanceled).length} Accounts Tracked</span></div>
        </div>
        <div className="card p-3 flex items-center gap-3 overflow-hidden relative">
          <div className="w-9 h-9 rounded-full bar-pink grid place-items-center shrink-0 text-[var(--ink)]"><Coins size={14} /></div>
          <div><span className="eyebrow block">Debt Amortization</span><span className="text-sm mono font-extrabold text-[var(--ink)]">{debts.filter(d => d.remainingAmount > 0).length} Outstanding Liabilities</span></div>
        </div>
      </div>

      {/* INTERACTIVE CONTROLS CONTAINER */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: ISSUES AND RECONCILIATIONS */}
        <div className="lg:col-span-7 space-y-6">
          <div className="card p-6 space-y-4 overflow-hidden relative">
            <div className="rainbow-bar !h-1 !rounded-none absolute top-0 left-0 right-0 opacity-40" />
            <div className="flex justify-between items-center pb-3">
              <h4 className="text-sm font-bold text-[var(--ink)] flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bar-yellow grid place-items-center"><ShieldAlert size={13} /></span>
                Ledger Diagnostic Bulletins
              </h4>
              <div className="flex gap-1 p-1 bg-[var(--surface-2)] border border-[var(--line)] rounded-full">
                {[
                  { key: 'all', label: 'All' },
                  { key: 'subscriptions', label: 'Subscriptions' },
                  { key: 'accounts', label: 'Accounts' },
                  { key: 'debts', label: 'Debts' },
                ].map(item => (
                  <button
                    key={item.key}
                    onClick={() => setActiveAuditTab(item.key as any)}
                    className={`pill !py-1 !px-3 !text-[10px] mono uppercase tracking-wider font-bold transition-all cursor-pointer ${activeAuditTab === item.key ? 'pill-active' : '!border-transparent'}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="ledger-rule mb-4" />

            <div className="space-y-3">
              {filteredIssues.length === 0 ? (
                <div className="p-8 text-center bg-[var(--surface-2)] border border-dashed border-[var(--line)] rounded-2xl flex flex-col items-center justify-center gap-3">
                  <CheckCircle2 size={32} className="text-emerald-500" />
                  <div>
                    <h5 className="text-sm font-bold text-[var(--ink)]">All Clear! Ledger Aligned</h5>
                    <p className="text-[var(--ink-2)] text-xs mt-0.5">There are no outstanding warnings or mismatched balances detected in this category.</p>
                  </div>
                </div>
              ) : (
                filteredIssues.map(issue => (
                  <div 
                    key={issue.id} 
                    className={`p-4 rounded-2xl border flex items-start gap-3.5 transition-all duration-200 ${
                      issue.type === 'danger' 
                        ? 'bg-[var(--danger-bg)] border-[var(--danger)]/20' 
                        : issue.type === 'warning'
                          ? 'bg-[var(--warning-bg)] border-amber-500/20'
                          : 'bg-blue-50 border-blue-200 dark:bg-blue-950/10 dark:border-blue-900/40'
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {issue.type === 'danger' ? (
                        <XCircle size={16} className="text-[var(--danger)]" />
                      ) : issue.type === 'warning' ? (
                        <AlertTriangle size={16} className="text-amber-500" />
                      ) : (
                        <AlertCircle size={16} className="text-blue-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h5 className="text-xs font-bold text-[var(--ink)]">{issue.title}</h5>
                      <p className="text-[var(--ink-2)] text-[11px] mt-1 leading-relaxed">{issue.desc}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ACTIVE SUBSCRIPTION LEDGER MAP */}
          <div className="card p-6 space-y-4">
            <div>
              <h4 className="text-sm font-bold text-[var(--ink)] flex items-center gap-2">
                <CheckSquare size={15} className="text-emerald-500" />
                Subscription Cycle Health Map
              </h4>
              <p className="text-[var(--ink-2)] text-[11px] mt-0.5">
                Real-time checking showing whether a recorded payment corresponds to the active renewal period.
              </p>
            </div>
            <div className="ledger-rule" />

            <div className="space-y-2.5">
              {subscriptions.length === 0 ? (
                <p className="text-[var(--ink-2)] text-xs text-center py-6 italic">No registered recurring subscriptions.</p>
              ) : (
                subscriptions
                  .filter(s => s.status !== 'Cancelled')
                  .map(sub => {
                    const health = getSubHealth(sub);
                    return (
                      <div key={sub.id} className="p-3.5 bg-[var(--surface-2)] border border-[var(--line)] rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2.5">
                            <span className="text-xs font-bold text-[var(--ink)] truncate">{sub.name}</span>
                            <span className={`text-[8.5px] mono px-2 py-0.5 rounded-full border ${health.color} uppercase font-extrabold tracking-wider`}>
                              {health.label}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[10px] text-[var(--ink-2)] mono">
                            <span>Renewal Date: <span className="text-[var(--ink)] font-bold">{sub.dueDate}</span></span>
                            <span>•</span>
                            <span>Cost: <span className="text-[var(--ink)] font-bold">{currency}{sub.amount.toLocaleString()} ({sub.billingCycle})</span></span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {health.label === 'Missing Payment' && onPaySubscription && (
                            <button
                              onClick={() => setSelectedSubToSettle(sub.id)}
                              className="btn-primary py-1.5 px-3 text-[10px] shrink-0"
                            >
                              Log Settle
                            </button>
                          )}
                          {onToggleSubscriptionStatus && (
                            <button
                              onClick={() => onToggleSubscriptionStatus(sub.id, sub.status)}
                              className="btn-ghost py-1.5 px-2.5 text-[10px] shrink-0"
                            >
                              {sub.status === 'Active' ? 'Pause' : 'Activate'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: MANUAL ALIGNMENT & ACCOUNT METRICS */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* QUICK RECONCILIATION FLYOUT FORM */}
          {selectedSubToSettle && (
            <div className="card p-5 space-y-4 border-emerald-500/20 shadow-lg animate-fade-in">
              <div className="flex justify-between items-center pb-2">
                <div className="flex items-center gap-2">
                  <CheckSquare size={15} className="text-emerald-500 animate-pulse" />
                  <span className="text-xs font-bold text-[var(--ink)] uppercase tracking-wide">Direct Settle Audit</span>
                </div>
                <button
                  onClick={() => setSelectedSubToSettle(null)}
                  className="text-[var(--ink-2)] hover:text-[var(--ink)] text-xs mono font-bold cursor-pointer"
                >
                  Close [x]
                </button>
              </div>
              <div className="ledger-rule" />

              <form onSubmit={handleSettleSubmit} className="space-y-4">
                <p className="text-[11px] text-[var(--ink-2)] leading-relaxed">
                  Log a payment for <span className="font-extrabold text-[var(--ink)]">{(subscriptions.find(s => s.id === selectedSubToSettle))?.name}</span> to automatically align the cycle and advance the renewal timeline.
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="eyebrow block mb-1.5">Paying Account</label>
                    <select
                      value={`${settlingAccountType}:${settlingAccountId}`}
                      onChange={(e) => {
                        const [type, id] = e.target.value.split(':');
                        setSettlingAccountType(type as 'cash' | 'card');
                        setSettlingAccountId(id);
                      }}
                      className="input cursor-pointer"
                    >
                      {cashAccounts.map(c => (
                        <option key={c.id} value={`cash:${c.id}`}>Cash Account: {c.name} ({currency}{c.balance.toLocaleString()})</option>
                      ))}
                      {cards.filter(c => !c.isCanceled).map(card => (
                        <option key={card.id} value={`card:${card.id}`}>{card.cardType} Card: {card.cardName} ({currency}{card.currentBalance.toLocaleString()})</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="eyebrow block mb-1.5">Payment Date</label>
                      <input
                        type="date"
                        value={settleDate}
                        onChange={(e) => setSettleDate(e.target.value)}
                        className="input mono cursor-pointer"
                      />
                    </div>

                    <div>
                      <label className="eyebrow block mb-1.5">Bank Surcharge</label>
                      <input
                        type="number"
                        placeholder="0"
                        value={bankCharge || ''}
                        onChange={(e) => setBankCharge(Number(e.target.value))}
                        className="input mono"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn-primary w-full py-3.5 flex items-center justify-center gap-1.5"
                >
                  <Check size={14} className="stroke-[3px]" />
                  Verify & Log Settle Record
                </button>
              </form>
            </div>
          )}

          {/* BALANCE VERIFICATION SHEET */}
          <div className="card p-6 space-y-4">
            <div>
              <h4 className="text-sm font-bold text-[var(--ink)] flex items-center gap-2">
                <Landmark size={15} className="text-blue-500" />
                Wallet Balance Auditing
              </h4>
              <p className="text-[var(--ink-2)] text-[11px] mt-0.5">
                Reviewing reserves status to flag low or negative overdraft risks.
              </p>
            </div>
            <div className="ledger-rule" />

            <div className="space-y-3">
              {cashAccounts.map(acc => {
                const isWarn = acc.balance < 5000;
                return (
                  <div key={acc.id} className="p-3.5 bg-[var(--surface-2)] border border-[var(--line)] rounded-xl flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-[var(--ink)] block">{acc.name}</span>
                      <span className="eyebrow mt-1 block">Cash Account</span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs mono font-extrabold text-[var(--ink)] block">{currency}{acc.balance.toLocaleString()}</span>
                      <span className={`text-[8.5px] mono font-bold uppercase ${isWarn ? 'text-amber-500' : 'text-emerald-500'}`}>
                        {isWarn ? 'Low Balance' : 'Nominal Balance'}
                      </span>
                    </div>
                  </div>
                );
              })}

              {cards.filter(c => !c.isCanceled).map(card => {
                const isCredit = card.cardType === 'Credit';
                const owns = isCredit ? Math.abs(card.currentBalance) : card.currentBalance;
                const limit = card.limit || 0;
                const isWarn = isCredit ? (limit > 0 && owns > limit * 0.85) : owns < 5000;
                const isDanger = isCredit ? owns > limit : owns < 0;

                return (
                  <div key={card.id} className="p-3.5 bg-[var(--surface-2)] border border-[var(--line)] rounded-xl flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-[var(--ink)] block">{card.cardName}</span>
                      <span className="eyebrow mt-1 block">{card.bankName} • {card.cardType}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs mono font-extrabold text-[var(--ink)] block">{currency}{owns.toLocaleString()}</span>
                      <span className={`text-[8.5px] mono font-bold uppercase ${
                        isDanger ? 'text-[var(--danger)]' : isWarn ? 'text-amber-500' : 'text-emerald-500'
                      }`}>
                        {isDanger ? 'Critical Warning' : isWarn ? 'Low Reserve' : 'Nominal Balance'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* AUDIT DIAGNOSTIC INSTRUCTIONS */}
          <div className="card p-6 space-y-3.5 bg-[var(--surface-2)]">
            <h5 className="font-extrabold text-[var(--ink)] flex items-center gap-2 text-sm">
              <ShieldCheck size={15} className="text-emerald-500" />
              Double-Entry Audit Rule
            </h5>
            <div className="ledger-rule" />
            <p className="leading-relaxed text-[11px] text-[var(--ink-2)]">
              Your budget manager uses a synchronized double-entry system. When recurring transactions are logged in the journal ledger with names containing matching substrings of active subscriptions (e.g. <span className="mono font-bold text-[var(--ink)]">"AIA Insurance"</span>), the system automatically advances the next cycle due date.
            </p>
            <p className="leading-relaxed text-[11px] text-[var(--ink-2)]">
              If an active subscription remains flagged as "Missing Payment", you can click <span className="font-extrabold text-[var(--ink)]">Log Settle</span> above to record the ledger entry and align the subscription renewal timeline instantly.
            </p>
          </div>

        </div>

      </div>

    </div>
  );
}
