import React from 'react';
import { CreditCardInstallment, CreditCardInstallmentPayment, CreditCardPurchase } from '../types';
import { getInstallmentProgress } from '../lib/installments';
import { Calendar, Check, Clock, AlertTriangle, ChevronDown, ChevronUp, Pause } from 'lucide-react';

interface Props {
  installment: CreditCardInstallment;
  payments: CreditCardInstallmentPayment[];
  purchase?: CreditCardPurchase;
  currency: string;
  onPayPayment: (installmentId: string, paymentId: string, amount: number) => void;
}

export default function InstallmentSchedule({ installment, payments, purchase, currency, onPayPayment }: Props) {
  const progress = getInstallmentProgress(installment, payments);
  const [expanded, setExpanded] = React.useState(false);

  const nextPending = payments
    .filter(p => p.status === 'pending')
    .sort((a, b) => a.paymentNumber - b.paymentNumber)[0];

  const isCompleted = installment.status === 'completed';
  const isCancelled = installment.status === 'cancelled';

  return (
    <div className="p-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[var(--ink)]">
              {installment.tenureMonths}-Month Plan
            </span>
            {isCompleted && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[var(--success)]/10 text-[var(--success)] border border-[var(--success)]/20">
                Completed
              </span>
            )}
            {isCancelled && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[var(--danger)]/10 text-[var(--danger)] border border-[var(--danger)]/20">
                Cancelled
              </span>
            )}
          </div>
          {purchase && (
            <span className="text-[10px] text-[var(--ink-3)] block truncate">{purchase.merchant} — {purchase.date}</span>
          )}
        </div>
        <div className="text-right shrink-0">
          <span className="mono text-[11px] font-bold text-[var(--ink)]">{progress.paid}/{progress.total}</span>
          <span className="text-[10px] text-[var(--ink-3)] block">payments</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-1.5 rounded-full bg-[var(--surface-2)] border border-[var(--line)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${progress.percentage}%`,
            backgroundColor: isCompleted ? 'var(--success)' : 'var(--ink)',
          }}
        />
      </div>

      {/* Info Row */}
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-[var(--ink-3)]">
          {currency}{installment.monthlyPayment.toLocaleString(undefined, { minimumFractionDigits: 2 })}/mo
        </span>
        {installment.processingFee > 0 && (
          <span className="text-[var(--danger)]">
            Fee: {currency}{installment.processingFee.toLocaleString()}
          </span>
        )}
        {installment.processingFee === 0 && (
          <span className="text-[var(--success)]">No fee</span>
        )}
      </div>

      {/* Next Payment Due */}
      {!isCompleted && !isCancelled && nextPending && (
        <div className="flex items-center justify-between p-2 rounded border border-[var(--line)] bg-[var(--surface)]">
          <div className="flex items-center gap-1.5">
            <Calendar size={10} className="text-[var(--ink-3)]" />
            <span className="text-[10px] text-[var(--ink-3)]">Next due</span>
            <span className="mono text-[10px] font-bold text-[var(--ink)]">{nextPending.dueDate}</span>
          </div>
          <button
            onClick={() => onPayPayment(installment.id, nextPending.id, nextPending.amountDue)}
            className="btn-primary !text-[10px] !py-1 !px-2"
          >
            Pay {currency}{nextPending.amountDue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </button>
        </div>
      )}

      {/* Expand/Collapse Schedule */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-center gap-1 text-[10px] text-[var(--ink-3)] hover:text-[var(--ink)]"
      >
        {expanded ? 'Hide' : 'Show'} schedule
        {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
      </button>

      {/* Payment Schedule List */}
      {expanded && (
        <div className="space-y-1 max-h-48 overflow-y-auto scrollbar-none">
          {payments
            .sort((a, b) => a.paymentNumber - b.paymentNumber)
            .map(p => (
              <div
                key={p.id}
                className={`flex items-center justify-between py-1.5 px-2 rounded text-[10px] ${
                  p.status === 'paid'
                    ? 'bg-[var(--success)]/5'
                    : p.status === 'overdue'
                    ? 'bg-[var(--danger)]/5'
                    : 'bg-[var(--surface)]'
                }`}
              >
                <div className="flex items-center gap-2">
                  {p.status === 'paid' ? (
                    <Check size={10} className="text-[var(--success)]" />
                  ) : p.status === 'overdue' ? (
                    <AlertTriangle size={10} className="text-[var(--danger)]" />
                  ) : (
                    <Clock size={10} className="text-[var(--ink-3)]" />
                  )}
                  <span className="text-[var(--ink)]">
                    #{p.paymentNumber}
                  </span>
                  <span className="text-[var(--ink-3)]">{p.dueDate}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`mono font-bold ${p.status === 'paid' ? 'text-[var(--success)]' : 'text-[var(--ink)]'}`}>
                    {currency}{p.amountDue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                  {p.status === 'paid' && p.paidDate && (
                    <span className="text-[var(--ink-3)]">paid {p.paidDate}</span>
                  )}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
