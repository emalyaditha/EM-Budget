import React, { useState } from 'react';
import { Transaction, Subscription, Debt, CashAccount, BankCard } from '../types';
import { 
  ShieldCheck, AlertTriangle, CheckCircle2, XCircle, RotateCw, 
  Clock, Coins, ShieldAlert, CheckSquare, Settings, Landmark,
  Calendar, Check, ChevronDown, Eye, AlertCircle, HelpCircle
} from 'lucide-react';

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
  const [settleDate, setSettleDate] = useState<string>(new Date().toISOString().split('T')[0]);
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
      if (acc.balance < 5000) {
        score -= 3;
        issues.push({
          id: `acc-issue-${acc.id}`,
          type: 'warning',
          section: 'accounts',
          title: `Low Cash Balance: ${acc.name}`,
          desc: `Current balance is ${currency}${acc.balance.toLocaleString()} which is below the safe threshold of ${currency}5,000.`
        });
      } else if (acc.balance < 0) {
        score -= 10;
        issues.push({
          id: `acc-issue-neg-${acc.id}`,
          type: 'danger',
          section: 'accounts',
          title: `Overdrawn Cash Account: ${acc.name}`,
          desc: `Account balance is negative (${currency}${acc.balance.toLocaleString()}). Check if expenses are over-recorded.`
        });
      } else {
        reconciledItemsCount.accounts++;
      }
    });

    cards.forEach(card => {
      if (card.isCanceled) return;

      if (card.cardType === 'Credit') {
        const limit = card.limit || 0;
        const owes = Math.abs(card.currentBalance); // Credit balances stored as negative (liability)
        
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
        // Debit Card
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
      } else if (debt.remainingAmount === 0 && debt.status !== 'Fully Repaid') {
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
    let ratingColor = 'text-emerald-400';
    let ratingBg = 'border-emerald-500/20 bg-emerald-500/5';
    if (finalScore < 70) {
      rating = 'Action Needed';
      ratingColor = 'text-rose-400';
      ratingBg = 'border-rose-500/20 bg-rose-500/5';
    } else if (finalScore < 90) {
      rating = 'Fair';
      ratingColor = 'text-amber-400';
      ratingBg = 'border-amber-500/20 bg-amber-500/5';
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
    if (sub.status !== 'Active') return { label: 'Paused', color: 'text-zinc-500 bg-zinc-950 border-zinc-900' };

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
      return { label: 'Missing Payment', color: 'text-rose-400 bg-rose-950/40 border-rose-900' };
    }
    if (hasMatchingPayment) {
      return { label: 'Verified & Aligned', color: 'text-emerald-400 bg-emerald-950/40 border-emerald-900' };
    }
    return { label: 'Active & Tracked', color: 'text-blue-400 bg-blue-950/40 border-blue-900' };
  };

  const filteredIssues = auditReport.issues.filter(issue => {
    if (activeAuditTab === 'all') return true;
    return issue.section === activeAuditTab;
  });

  return (
    <div className="space-y-6 animate-fade-in" id="audit-report-dashboard">
      
      {/* SCORE HEADER */}
      <div className={`p-6 border rounded-[32px] flex flex-col md:flex-row items-center justify-between gap-6 ${auditReport.ratingBg} transition-all duration-300`}>
        <div className="flex items-center gap-4">
          <div className="p-4 bg-zinc-950 rounded-2xl border border-zinc-900 shadow-inner">
            <ShieldCheck size={36} className={`${auditReport.ratingColor}`} />
          </div>
          <div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-zinc-500">LEDGER INTEGRITY DIAGNOSTIC</span>
            <h3 className="text-xl font-extrabold text-white">System Audit & Health Report</h3>
            <p className="text-zinc-400 text-xs mt-0.5">Automated transaction reconciliation and ledger verification engine.</p>
          </div>
        </div>

        <div className="flex items-center gap-5 shrink-0 bg-black/45 px-6 py-4 rounded-2xl border border-zinc-900">
          <div className="text-center">
            <span className="text-[9px] font-mono text-zinc-500 uppercase font-black tracking-wider block">HEALTH SCORE</span>
            <span className={`text-4xl font-black font-mono ${auditReport.ratingColor}`}>{auditReport.score}/100</span>
          </div>
          <div className="h-10 w-[1px] bg-zinc-800" />
          <div className="text-left">
            <span className="text-[9px] font-mono text-zinc-500 uppercase font-black tracking-wider block">LEDGER STATUS</span>
            <span className={`text-sm font-extrabold block ${auditReport.ratingColor}`}>{auditReport.rating}</span>
          </div>
        </div>
      </div>

      {/* STATS OVERVIEW */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-zinc-900/20 border border-zinc-900 rounded-2xl flex items-center gap-3">
          <div className="p-2.5 bg-black rounded-xl border border-zinc-800 text-blue-400 shrink-0">
            <Clock size={16} />
          </div>
          <div>
            <span className="text-[10px] text-zinc-500 uppercase font-mono font-bold tracking-wider block">Subscriptions Aligned</span>
            <span className="text-sm font-mono font-extrabold text-white">
              {auditReport.reconciledItemsCount.subscriptions} / {subscriptions.filter(s => s.status !== 'Cancelled').length} Verified
            </span>
          </div>
        </div>

        <div className="p-4 bg-zinc-900/20 border border-zinc-900 rounded-2xl flex items-center gap-3">
          <div className="p-2.5 bg-black rounded-xl border border-zinc-800 text-emerald-400 shrink-0">
            <Landmark size={16} />
          </div>
          <div>
            <span className="text-[10px] text-zinc-500 uppercase font-mono font-bold tracking-wider block">Wallet Balance Safety</span>
            <span className="text-sm font-mono font-extrabold text-white">
              {cashAccounts.length + cards.filter(c => !c.isCanceled).length} Accounts Tracked
            </span>
          </div>
        </div>

        <div className="p-4 bg-zinc-900/20 border border-zinc-900 rounded-2xl flex items-center gap-3">
          <div className="p-2.5 bg-black rounded-xl border border-zinc-800 text-amber-400 shrink-0">
            <Coins size={16} />
          </div>
          <div>
            <span className="text-[10px] text-zinc-500 uppercase font-mono font-bold tracking-wider block">Debt Amortization</span>
            <span className="text-sm font-mono font-extrabold text-white">
              {debts.filter(d => d.remainingAmount > 0).length} Outstanding Liabilities
            </span>
          </div>
        </div>
      </div>

      {/* INTERACTIVE CONTROLS CONTAINER */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: ISSUES AND RECONCILIATIONS */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-[#05050c]/40 border border-zinc-900 p-6 rounded-[28px] space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-zinc-900">
              <h4 className="text-sm font-bold text-white font-sans flex items-center gap-2">
                <ShieldAlert size={15} className="text-amber-400" />
                Ledger Diagnostic Bulletins
              </h4>
              <div className="flex gap-1.5 p-0.5 bg-black border border-zinc-900 rounded-lg">
                {[
                  { key: 'all', label: 'All' },
                  { key: 'subscriptions', label: 'Subscriptions' },
                  { key: 'accounts', label: 'Accounts' },
                  { key: 'debts', label: 'Debts' },
                ].map(item => (
                  <button
                    key={item.key}
                    onClick={() => setActiveAuditTab(item.key as any)}
                    className={`py-1.5 px-3 rounded-md text-[10px] font-mono uppercase tracking-wider font-bold transition-all cursor-pointer ${
                      activeAuditTab === item.key
                        ? 'bg-zinc-900 text-white border border-zinc-800 font-extrabold'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {filteredIssues.length === 0 ? (
                <div className="p-8 text-center bg-black/20 border border-dashed border-zinc-900 rounded-2xl flex flex-col items-center justify-center gap-3">
                  <CheckCircle2 size={32} className="text-emerald-400" />
                  <div>
                    <h5 className="text-sm font-bold text-white">All Clear! Ledger Aligned</h5>
                    <p className="text-zinc-500 text-xs mt-0.5">There are no outstanding warnings or mismatched balances detected in this category.</p>
                  </div>
                </div>
              ) : (
                filteredIssues.map(issue => (
                  <div 
                    key={issue.id} 
                    className={`p-4 rounded-2xl border flex items-start gap-3.5 transition-all duration-200 ${
                      issue.type === 'danger' 
                        ? 'bg-rose-950/20 border-rose-900/50 hover:bg-rose-950/25' 
                        : issue.type === 'warning'
                          ? 'bg-amber-950/15 border-amber-900/40 hover:bg-amber-950/20'
                          : 'bg-blue-950/10 border-blue-900/40 hover:bg-blue-950/15'
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {issue.type === 'danger' ? (
                        <XCircle size={16} className="text-rose-400" />
                      ) : issue.type === 'warning' ? (
                        <AlertTriangle size={16} className="text-amber-400" />
                      ) : (
                        <AlertCircle size={16} className="text-blue-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h5 className="text-xs font-bold text-white font-sans">{issue.title}</h5>
                      <p className="text-zinc-400 text-[11px] mt-1 leading-relaxed font-sans">{issue.desc}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ACTIVE SUBSCRIPTION LEDGER MAP */}
          <div className="bg-[#05050c]/40 border border-zinc-900 p-6 rounded-[28px] space-y-4">
            <div>
              <h4 className="text-sm font-bold text-white font-sans flex items-center gap-2">
                <CheckSquare size={15} className="text-emerald-400" />
                Subscription Cycle Health Map
              </h4>
              <p className="text-zinc-500 text-[11px] mt-0.5 font-sans">
                Real-time checking showing whether a recorded payment corresponds to the active renewal period.
              </p>
            </div>

            <div className="space-y-2.5">
              {subscriptions.length === 0 ? (
                <p className="text-zinc-500 text-xs text-center py-6 italic">No registered recurring subscriptions.</p>
              ) : (
                subscriptions
                  .filter(s => s.status !== 'Cancelled')
                  .map(sub => {
                    const health = getSubHealth(sub);
                    return (
                      <div key={sub.id} className="p-3.5 bg-black/45 border border-zinc-900/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2.5">
                            <span className="text-xs font-bold text-white truncate">{sub.name}</span>
                            <span className={`text-[8.5px] font-mono px-2 py-0.5 rounded-full border ${health.color} uppercase font-extrabold tracking-wider`}>
                              {health.label}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[10px] text-zinc-500 font-mono">
                            <span>Renewal Date: <span className="text-zinc-300 font-bold">{sub.dueDate}</span></span>
                            <span>•</span>
                            <span>Cost: <span className="text-zinc-300 font-bold">{currency}{sub.amount.toLocaleString()} ({sub.billingCycle})</span></span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {health.label === 'Missing Payment' && onPaySubscription && (
                            <button
                              onClick={() => setSelectedSubToSettle(sub.id)}
                              className="py-1.5 px-3 bg-white text-black hover:bg-zinc-200 rounded-xl text-[10px] font-bold tracking-tight cursor-pointer shadow-md transition-all shrink-0 hover:scale-[1.02]"
                            >
                              Log Settle
                            </button>
                          )}
                          {onToggleSubscriptionStatus && (
                            <button
                              onClick={() => onToggleSubscriptionStatus(sub.id, sub.status)}
                              className="py-1.5 px-2.5 bg-zinc-950 hover:bg-zinc-900 text-zinc-400 hover:text-white rounded-xl text-[10px] border border-zinc-900 font-bold cursor-pointer transition-colors shrink-0"
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
            <div className="p-5 bg-zinc-950 border border-emerald-500/20 rounded-[28px] space-y-4 shadow-xl animate-fade-in">
              <div className="flex justify-between items-center pb-2 border-b border-zinc-900">
                <div className="flex items-center gap-2">
                  <CheckSquare size={15} className="text-emerald-400 animate-pulse" />
                  <span className="text-xs font-bold text-white font-sans uppercase tracking-wide">Direct Settle Audit</span>
                </div>
                <button
                  onClick={() => setSelectedSubToSettle(null)}
                  className="text-zinc-500 hover:text-white text-xs font-mono font-bold cursor-pointer"
                >
                  Close [x]
                </button>
              </div>

              <form onSubmit={handleSettleSubmit} className="space-y-4">
                <p className="text-[11px] text-zinc-400 font-sans leading-relaxed">
                  Log a payment for <span className="font-extrabold text-white">{(subscriptions.find(s => s.id === selectedSubToSettle))?.name}</span> to automatically align the cycle and advance the renewal timeline.
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="text-[9px] font-mono uppercase text-zinc-500 font-extrabold block pl-1 mb-1.5">Paying Account</label>
                    <select
                      value={`${settlingAccountType}:${settlingAccountId}`}
                      onChange={(e) => {
                        const [type, id] = e.target.value.split(':');
                        setSettlingAccountType(type as 'cash' | 'card');
                        setSettlingAccountId(id);
                      }}
                      className="w-full bg-black border border-zinc-900 rounded-xl text-xs px-3.5 py-3 text-white font-medium focus:outline-none cursor-pointer"
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
                      <label className="text-[9px] font-mono uppercase text-zinc-500 font-extrabold block pl-1 mb-1.5">Payment Date</label>
                      <input
                        type="date"
                        value={settleDate}
                        onChange={(e) => setSettleDate(e.target.value)}
                        className="w-full bg-black border border-zinc-900 rounded-xl text-xs px-3 py-2 text-white font-mono focus:outline-none cursor-pointer"
                      />
                    </div>

                    <div>
                      <label className="text-[9px] font-mono uppercase text-zinc-500 font-extrabold block pl-1 mb-1.5">Bank Surcharge</label>
                      <input
                        type="number"
                        placeholder="0"
                        value={bankCharge || ''}
                        onChange={(e) => setBankCharge(Number(e.target.value))}
                        className="w-full bg-black border border-zinc-900 rounded-xl text-xs px-3 py-2 text-white font-mono focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-3.5 bg-white text-black hover:bg-zinc-200 rounded-xl text-xs font-black tracking-tight cursor-pointer shadow-md transition-all flex items-center justify-center gap-1.5 hover:scale-[1.01]"
                >
                  <Check size={14} className="stroke-[3px]" />
                  Verify & Log Settle Record
                </button>
              </form>
            </div>
          )}

          {/* BALANCE VERIFICATION SHEET */}
          <div className="bg-[#05050c]/40 border border-zinc-900 p-6 rounded-[28px] space-y-4">
            <div>
              <h4 className="text-sm font-bold text-white font-sans flex items-center gap-2">
                <Landmark size={15} className="text-blue-400" />
                Wallet Balance Auditing
              </h4>
              <p className="text-zinc-500 text-[11px] mt-0.5 font-sans">
                Reviewing reserves status to flag low or negative overdraft risks.
              </p>
            </div>

            <div className="space-y-3">
              {cashAccounts.map(acc => {
                const isWarn = acc.balance < 5000;
                return (
                  <div key={acc.id} className="p-3.5 bg-black/45 border border-zinc-900 rounded-xl flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-white block">{acc.name}</span>
                      <span className="text-[9px] font-mono text-zinc-500 uppercase font-bold mt-1 block">CASH ACCOUNT</span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-mono font-extrabold text-white block">{currency}{acc.balance.toLocaleString()}</span>
                      <span className={`text-[8.5px] font-mono font-bold uppercase ${isWarn ? 'text-amber-400' : 'text-emerald-400'}`}>
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
                  <div key={card.id} className="p-3.5 bg-black/45 border border-zinc-900 rounded-xl flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-white block">{card.cardName}</span>
                      <span className="text-[9px] font-mono text-zinc-500 uppercase font-bold mt-1 block">{card.bankName} • {card.cardType}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-mono font-extrabold text-white block">{currency}{owns.toLocaleString()}</span>
                      <span className={`text-[8.5px] font-mono font-bold uppercase ${
                        isDanger ? 'text-rose-400' : isWarn ? 'text-amber-400' : 'text-emerald-400'
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
          <div className="bg-gradient-to-br from-[#0c0c16] to-[#04040a] border border-zinc-900 p-6 rounded-[28px] space-y-3.5 text-zinc-400 text-xs">
            <h5 className="font-extrabold text-white font-sans flex items-center gap-2">
              <ShieldCheck size={15} className="text-emerald-400" />
              Double-Entry Audit Rule
            </h5>
            <p className="font-sans leading-relaxed text-[11px] text-zinc-400">
              Your budget manager uses a synchronized double-entry system. When recurring transactions are logged in the journal ledger with names containing matching substrings of active subscriptions (e.g. <span className="font-mono text-white">"AIA Insurance"</span>), the system automatically advances the next cycle due date.
            </p>
            <p className="font-sans leading-relaxed text-[11px] text-zinc-400">
              If an active subscription remains flagged as "Missing Payment", you can click <span className="font-extrabold text-white">Log Settle</span> above to record the ledger entry and align the subscription renewal timeline instantly.
            </p>
          </div>

        </div>

      </div>

    </div>
  );
}
