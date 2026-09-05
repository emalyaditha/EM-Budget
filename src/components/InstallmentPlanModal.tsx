import React, { useState } from 'react';
import { Modal } from './ui/Modal';
import { BankCard, CreditCardPurchase } from '../types';
import { formatFeeBreakdown, SAMPATH_ESP_FEES } from '../lib/installments';
import { Calendar, CreditCard, AlertTriangle, Check, Info } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  card: BankCard;
  purchase: CreditCardPurchase;
  currency: string;
  onConfirm: (tenureMonths: 6 | 12 | 24 | 48) => void;
}

const TENURE_OPTIONS: Array<{ months: 6 | 12 | 24 | 48; label: string; description: string }> = [
  { months: 6, label: '6 Months', description: '0% fee — FREE' },
  { months: 12, label: '12 Months', description: '7.5% processing fee' },
  { months: 24, label: '24 Months', description: '15% processing fee' },
  { months: 48, label: '48 Months', description: '30% processing fee' },
];

export default function InstallmentPlanModal({ isOpen, onClose, card, purchase, currency, onConfirm }: Props) {
  const [selectedTenure, setSelectedTenure] = useState<6 | 12 | 24 | 48>(6);
  const [confirmed, setConfirmed] = useState(false);

  const breakdown = formatFeeBreakdown(purchase.amount, selectedTenure);
  const isOverLimit = card.currentBalance < 0 && Math.abs(card.currentBalance) > (card.limit || 0);

  const handleConfirm = () => {
    onConfirm(selectedTenure);
    setConfirmed(false);
    setSelectedTenure(6);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Convert to Installment Plan"
      subtitle="Sampath Bank Extended Settlement Plan (ESP)"
      maxWidth="md"
    >
      <div className="space-y-4">
        {/* Purchase Info */}
        <div className="flex items-center gap-3 p-3 rounded-lg border border-[var(--line)] bg-[var(--surface)]">
          <CreditCard size={16} className="text-[var(--ink-3)] shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium text-[var(--ink)] block truncate">{purchase.merchant}</span>
            <span className="text-[10px] text-[var(--ink-3)]">{purchase.date}</span>
          </div>
          <span className="mono text-sm font-bold text-[var(--ink)] shrink-0">{currency}{purchase.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
        </div>

        {/* Over-limit Warning */}
        {isOverLimit && (
          <div className="flex items-start gap-2 p-3 rounded-lg border border-[var(--danger)] bg-[var(--danger)]/10 text-xs">
            <AlertTriangle size={14} className="text-[var(--danger)] shrink-0 mt-0.5" />
            <div>
              <span className="font-medium text-[var(--danger)]">Card Over Limit</span>
              <span className="block text-[var(--ink-3)] mt-0.5">
                Your card is over its credit limit. Pay down the balance before creating installment plans.
              </span>
            </div>
          </div>
        )}

        {/* Tenure Selection */}
        <div>
          <span className="eyebrow normal-case">Select tenure</span>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {TENURE_OPTIONS.map(opt => {
              const fee = formatFeeBreakdown(purchase.amount, opt.months);
              const isSelected = selectedTenure === opt.months;
              return (
                <button
                  key={opt.months}
                  onClick={() => setSelectedTenure(opt.months)}
                  disabled={isOverLimit}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    isSelected
                      ? 'border-[var(--ink)] bg-[var(--ink)]/5'
                      : 'border-[var(--line)] bg-[var(--surface)] hover:border-[var(--ink-2)]'
                  } ${isOverLimit ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[var(--ink)]">{opt.label}</span>
                    {isSelected && <Check size={12} className="text-[var(--ink)]" />}
                  </div>
                  <span className="text-[10px] text-[var(--ink-3)] block mt-0.5">{opt.description}</span>
                  {fee.processingFee > 0 && (
                    <span className="mono text-[10px] text-[var(--danger)] block mt-1">
                      +{currency}{fee.processingFee.toLocaleString()} fee
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Fee Breakdown */}
        <div className="p-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] space-y-2">
          <div className="flex items-center gap-1.5 mb-2">
            <Info size={12} className="text-[var(--ink-3)]" />
            <span className="text-xs font-medium text-[var(--ink)]">Plan Breakdown</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-[var(--ink-3)]">Purchase amount</span>
            <span className="mono font-medium text-[var(--ink)]">{currency}{purchase.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-[var(--ink-3)]">Processing fee ({breakdown.feePercent}%)</span>
            <span className={`mono font-medium ${breakdown.processingFee > 0 ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>
              {breakdown.processingFee > 0 ? `+${currency}${breakdown.processingFee.toLocaleString()}` : 'FREE'}
            </span>
          </div>
          <div className="border-t border-[var(--line)] pt-2 flex justify-between text-xs">
            <span className="font-medium text-[var(--ink)]">Total cost</span>
            <span className="mono font-bold text-[var(--ink)]">{currency}{breakdown.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-[var(--ink-3)]">Monthly payment</span>
            <span className="mono font-bold text-[var(--ink)]">{currency}{breakdown.monthlyPayment.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-[var(--ink-3)] flex items-center gap-1">
              <Calendar size={10} /> Duration
            </span>
            <span className="mono font-medium text-[var(--ink)]">{selectedTenure} months</span>
          </div>
        </div>

        {/* Confirm Checkbox */}
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={e => setConfirmed(e.target.checked)}
            disabled={isOverLimit}
            className="mt-0.5 accent-[var(--ink)]"
          />
          <span className="text-[11px] text-[var(--ink-3)]">
            I understand the processing fee will be charged upfront and monthly payments are fixed for {selectedTenure} months.
          </span>
        </label>

        {/* Confirm Button */}
        <button
          onClick={handleConfirm}
          disabled={!confirmed || isOverLimit}
          className="btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Confirm {selectedTenure}-Month Plan
        </button>
      </div>
    </Modal>
  );
}
