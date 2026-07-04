import React, { useState } from 'react';
import { CashAccount, BankCard, CategoryIncome, CategoryExpense } from '../types';
import { PlusCircle, MinusCircle, AlertCircle } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';
import { DatePicker } from './DatePicker';

interface InflowsOutflowsProps {
  cashAccounts: CashAccount[];
  cards: BankCard[];
  onAddIncome: (amount: number, date: string, source: string, category: CategoryIncome, targetId: string, targetType: 'cash' | 'card') => void;
  onAddExpense: (title: string, description: string, amount: number, date: string, category: CategoryExpense, paymentMethodId: string, paymentMethodType: 'cash' | 'card', bankCharge?: number) => void;
  currency: string;
}

export default function InflowsOutflows({
  cashAccounts,
  cards,
  onAddIncome,
  onAddExpense,
  currency,
}: InflowsOutflowsProps) {
  const { showToast } = useNotifications();
  const [toggleForm, setToggleForm] = useState<'income' | 'expense'>('income');

  // Income Fields
  const [incAmount, setIncAmount] = useState('');
  const [incSource, setIncSource] = useState('');
  const [incCategory, setIncCategory] = useState<CategoryIncome>('Salary');
  const [incTargetId, setIncTargetId] = useState('');
  const [incTargetType, setIncTargetType] = useState<'cash' | 'card'>('cash');
  const [incDate, setIncDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Expense/Invoice Fields
  const [expTitle, setExpTitle] = useState('');
  const [expDesc, setExpDesc] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expCategory, setExpCategory] = useState<CategoryExpense>('Utilities');
  const [expMethodId, setExpMethodId] = useState('');
  const [expMethodType, setExpMethodType] = useState<'cash' | 'card'>('cash');
  const [expDate, setExpDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [expBankCharge, setExpBankCharge] = useState('');

  const [insufficiencyError, setInsufficiencyError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const [incErrors, setIncErrors] = useState<Record<string, string>>({});
  const [incSubmitted, setIncSubmitted] = useState(false);
  const [expErrors, setExpErrors] = useState<Record<string, string>>({});
  const [expSubmitted, setExpSubmitted] = useState(false);

  const incSourceRef = React.useRef<HTMLInputElement>(null);
  const incAmountRef = React.useRef<HTMLInputElement>(null);
  const incTargetRef = React.useRef<HTMLSelectElement>(null);

  const expTitleRef = React.useRef<HTMLInputElement>(null);
  const expAmountRef = React.useRef<HTMLInputElement>(null);
  const expTargetRef = React.useRef<HTMLSelectElement>(null);

  React.useEffect(() => {
    if (cashAccounts.length > 0 && !incTargetId) {
      setIncTargetId(cashAccounts[0].id);
      setIncTargetType('cash');
    } else if (cards.length > 0 && !incTargetId) {
      setIncTargetId(cards[0].id);
      setIncTargetType('card');
    }

    if (cashAccounts.length > 0 && !expMethodId) {
      setExpMethodId(cashAccounts[0].id);
      setExpMethodType('cash');
    } else if (cards.length > 0 && !expMethodId) {
      setExpMethodId(cards[0].id);
      setExpMethodType('card');
    }
  }, [cashAccounts, cards, incTargetId, expMethodId]);

  const validateIncome = (source: string, amtStr: string, target: string, sub: boolean) => {
    const errs: Record<string, string> = {};
    if (sub || source) {
      if (!source.trim()) {
        errs.source = 'Receipt source title is required';
      } else if (source.trim().length < 3) {
        errs.source = 'Source must be at least 3 characters';
      } else if (/[<>{}]/.test(source)) {
        errs.source = 'Special characters are not allowed';
      }
    }
    if (sub || amtStr) {
      if (!amtStr) {
        errs.amount = 'Received sum is required';
      } else {
        const num = parseFloat(amtStr);
        if (isNaN(num)) {
          errs.amount = 'Received sum must be a number';
        } else if (num <= 0) {
          errs.amount = 'Received sum must be positive';
        }
      }
    }
    if (sub || target) {
      if (!target) {
        errs.target = 'Receipt target account is required';
      } else {
        const [id, type] = target.split(':');
        if (type === 'card') {
          const match = cards.find(c => c.id === id);
          if (match && match.isFrozen) {
            errs.target = 'Target card is FROZEN and cannot receive funds.';
          }
        }
      }
    }
    setIncErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validateExpense = (title: string, desc: string, amtStr: string, methodId: string, methodType: 'cash' | 'card', sub: boolean) => {
    const errs: Record<string, string> = {};
    if (sub || title) {
      if (!title.trim()) {
        errs.title = 'Expense Title is required';
      } else if (title.trim().length < 3) {
        errs.title = 'Title must be at least 3 characters';
      } else if (/[<>{}]/.test(title)) {
        errs.title = 'Special characters are not allowed';
      }
    }
    if (sub || amtStr) {
      if (!amtStr) {
        errs.amount = 'Settled sum is required';
      } else {
        const num = parseFloat(amtStr);
        const chargeNum = expMethodType === 'card' ? (parseFloat(expBankCharge) || 0) : 0;
        if (isNaN(num)) {
          errs.amount = 'Settled sum must be a valid number';
        } else if (num <= 0) {
          errs.amount = 'Settled sum must be positive';
        } else if (methodId) {
          let availableBalance = 0;
          if (methodType === 'cash') {
            const match = cashAccounts.find(c => c.id === methodId);
            availableBalance = match ? match.balance : 0;
          } else {
            const match = cards.find(c => c.id === methodId);
            if (match) {
              if (match.cardType === 'Credit') {
                availableBalance = (match.limit ?? 0) + match.currentBalance;
              } else {
                availableBalance = match.currentBalance;
              }
            } else {
              availableBalance = 0;
            }
          }
          if (availableBalance < num + chargeNum) {
            errs.amount = `Insufficient available limit including bank charges! Required: ${currency} ${(num + chargeNum).toLocaleString()}, Available: ${currency} ${availableBalance.toLocaleString()}`;
          }
        }
      }
    }
    if (sub || methodId) {
      if (!methodId) {
        errs.methodId = 'Payment source account is required';
      } else if (methodType === 'card') {
        const match = cards.find(c => c.id === methodId);
        if (match && match.isFrozen) {
          errs.methodId = 'This card is currently FROZEN / soft-locked.';
        }
      }
    }
    setExpErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleIncomeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIncSubmitted(true);
    const targetComp = incTargetId ? `${incTargetId}:${incTargetType}` : '';
    const isValid = validateIncome(incSource, incAmount, targetComp, true);
    if (!isValid) {
      if (!incSource.trim()) {
        incSourceRef.current?.focus();
      } else if (!incAmount || parseFloat(incAmount) <= 0) {
        incAmountRef.current?.focus();
      } else {
        incTargetRef.current?.focus();
      }
      showToast('error', 'Please resolve highlighted inflow errors.');
      return;
    }

    setIsProcessing(true);
    try {
      await onAddIncome(parseFloat(incAmount), incDate, incSource || 'Anonymous Inflow', incCategory, incTargetId, incTargetType);
      setIncAmount('');
      setIncSource('');
      setIncCategory('Salary');
      setIncSubmitted(false);
      setIncErrors({});
      showToast('success', 'Income received and ledger balanced successfully!');
    } catch(err) {
      showToast('error', 'Failed to add income.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setExpSubmitted(true);
    setInsufficiencyError(null);
    const isValid = validateExpense(expTitle, expDesc, expAmount, expMethodId, expMethodType, true);
    if (!isValid) {
      if (!expTitle.trim()) {
        expTitleRef.current?.focus();
      } else if (!expAmount || parseFloat(expAmount) <= 0) {
        expAmountRef.current?.focus();
      } else {
        expTargetRef.current?.focus();
      }
      showToast('error', 'Please resolve highlighted outflow errors.');
      return;
    }

    setIsProcessing(true);
    try {
      await onAddExpense(
        expTitle || 'Instant Invoice',
        expDesc || 'Uncategorized charge log',
        parseFloat(expAmount),
        expDate,
        expCategory,
        expMethodId,
        expMethodType,
        expMethodType === 'card' ? (parseFloat(expBankCharge) || 0) : 0
      );
      setExpAmount('');
      setExpTitle('');
      setExpDesc('');
      setExpBankCharge('');
      setExpSubmitted(false);
      setExpErrors({});
      showToast('success', 'Invoice payment settled automatically! Account balance reduced.');
    } catch(err) {
      showToast('error', 'Failed to add expense.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSelectTargetAccount = (value: string) => {
    const [id, type] = value.split(':');
    setIncTargetId(id);
    setIncTargetType(type as 'cash' | 'card');
    if (incSubmitted) {
      validateIncome(incSource, incAmount, value, true);
    }
  };

  const handleSelectPaymentMethod = (value: string) => {
    const [id, type] = value.split(':');
    setExpMethodId(id);
    setExpMethodType(type as 'cash' | 'card');
    setInsufficiencyError(null);
    if (expSubmitted) {
      validateExpense(expTitle, expDesc, expAmount, id, type as 'cash' | 'card', true);
    }
  };

  return (
    <div id="inflows-outflows-view" className="space-y-5 animate-brand-fade-up max-w-2xl mx-auto">

      {/* ===== HEADER ===== */}
      <div>
        <h1 className="text-xl font-display font-extrabold text-[var(--text-primary)] tracking-tight">
          Record Transaction
        </h1>
        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
          Add a new income or expense entry to your ledger
        </p>
      </div>

      {/* ===== FORM TOGGLE ===== */}
      <div className="segmented-tabs w-full" id="tab-selectors">
        <button
          onClick={() => { setToggleForm('income'); setInsufficiencyError(null); }}
          className={`segmented-tab flex-1 ${toggleForm === 'income' ? 'active' : ''}`}
          style={toggleForm === 'income' ? { color: '#10B981' } : undefined}
        >
          <PlusCircle size={13} />
          Income
        </button>
        <button
          onClick={() => setToggleForm('expense')}
          className={`segmented-tab flex-1 ${toggleForm === 'expense' ? 'active' : ''}`}
          style={toggleForm === 'expense' ? { color: 'var(--negative)' } : undefined}
        >
          <MinusCircle size={13} />
          Expense
        </button>
      </div>

      {/* ===== FORM ===== */}
      <div className="card-base p-5">
        {toggleForm === 'income' ? (
          <form onSubmit={handleIncomeSubmit} className="space-y-4" id="log-income-form">
            <div className="space-y-1.5">
              <span className="form-label">Source / Origin</span>
              <input
                ref={incSourceRef}
                type="text"
                placeholder="e.g. Freelance consulting, Salary"
                value={incSource}
                onChange={(e) => {
                  setIncSource(e.target.value);
                  validateIncome(e.target.value, incAmount, incTargetId ? `${incTargetId}:${incTargetType}` : '', incSubmitted);
                }}
                className={`form-input ${incErrors.source ? '!border-red-500' : incSource && !incErrors.source ? '!border-emerald-500' : ''}`}
                aria-label="Income source"
              />
              {incErrors.source && <span className="text-red-500 text-[10px]">{incErrors.source}</span>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <span className="form-label">Amount ({currency})</span>
                <input
                  ref={incAmountRef}
                  type="number"
                  placeholder="0.00"
                  value={incAmount}
                  onChange={(e) => {
                    setIncAmount(e.target.value);
                    validateIncome(incSource, e.target.value, incTargetId ? `${incTargetId}:${incTargetType}` : '', incSubmitted);
                  }}
                  className={`form-input font-mono font-bold ${incErrors.amount ? '!border-red-500' : incAmount && !incErrors.amount ? '!border-emerald-500' : ''}`}
                  aria-label="Income amount"
                />
                {incErrors.amount && <span className="text-red-500 text-[10px]">{incErrors.amount}</span>}
              </div>

              <div className="space-y-1.5">
                <span className="form-label">Category</span>
                <select
                  value={incCategory}
                  onChange={(e) => setIncCategory(e.target.value as CategoryIncome)}
                  className="form-select"
                  aria-label="Income category"
                >
                  <option value="Salary">Salary</option>
                  <option value="Freelance">Freelance</option>
                  <option value="Business">Business</option>
                  <option value="Bonus">Bonus</option>
                  <option value="Commission">Commission</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <span className="form-label">Date</span>
                <DatePicker value={incDate} onChange={setIncDate} required />
              </div>

              <div className="space-y-1.5">
                <span className="form-label">Destination</span>
                <select
                  ref={incTargetRef}
                  value={incTargetId ? `${incTargetId}:${incTargetType}` : ''}
                  onChange={(e) => handleSelectTargetAccount(e.target.value)}
                  className="form-select"
                  aria-label="Target account"
                >
                  <option value="">Select target</option>
                  <optgroup label="Cash Wallets">
                    {cashAccounts.map(c => (
                      <option key={c.id} value={`${c.id}:cash`}>{c.name} ({currency}{c.balance.toLocaleString()})</option>
                    ))}
                  </optgroup>
                  <optgroup label="Bank Cards">
                    {cards.filter(c => !c.isCanceled).map(card => (
                      <option key={card.id} value={`${card.id}:card`} disabled={card.isFrozen}>
                        {card.bankName} - {card.cardName}{card.isFrozen ? ' [FROZEN]' : ''}
                      </option>
                    ))}
                  </optgroup>
                </select>
                {incErrors.target && <span className="text-red-500 text-[10px]">{incErrors.target}</span>}
              </div>
            </div>

            <button
              type="submit"
              disabled={isProcessing}
              className="btn-primary w-full !py-3"
            >
              {isProcessing ? 'Processing...' : <><PlusCircle size={14} /> Record Income</>}
            </button>
          </form>
        ) : (
          <form onSubmit={handleExpenseSubmit} className="space-y-4" id="log-expense-form">
            <div className="space-y-1.5">
              <span className="form-label">Title</span>
              <input
                ref={expTitleRef}
                type="text"
                placeholder="e.g. Electric bill, restaurant lunch"
                value={expTitle}
                onChange={(e) => {
                  setExpTitle(e.target.value);
                  validateExpense(e.target.value, expDesc, expAmount, expMethodId, expMethodType, expSubmitted);
                }}
                className={`form-input ${expErrors.title ? '!border-red-500' : expTitle && !expErrors.title ? '!border-blue-500' : ''}`}
                aria-label="Expense title"
              />
              {expErrors.title && <span className="text-red-500 text-[10px]">{expErrors.title}</span>}
            </div>

            <div className="space-y-1.5">
              <span className="form-label">Description (optional)</span>
              <input
                type="text"
                placeholder="e.g. Booking reference #8291"
                value={expDesc}
                onChange={(e) => {
                  setExpDesc(e.target.value);
                  validateExpense(expTitle, e.target.value, expAmount, expMethodId, expMethodType, expSubmitted);
                }}
                className="form-input"
                aria-label="Expense description"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <span className="form-label">Amount ({currency})</span>
                <input
                  ref={expAmountRef}
                  type="number"
                  placeholder="0.00"
                  value={expAmount}
                  onChange={(e) => {
                    setExpAmount(e.target.value);
                    setInsufficiencyError(null);
                    validateExpense(expTitle, expDesc, e.target.value, expMethodId, expMethodType, expSubmitted);
                  }}
                  className={`form-input font-mono font-bold ${expErrors.amount ? '!border-red-500' : expAmount && !expErrors.amount ? '!border-blue-500' : ''}`}
                  aria-label="Expense amount"
                />
                {expErrors.amount && <span className="text-red-500 text-[10px]">{expErrors.amount}</span>}
              </div>

              <div className="space-y-1.5">
                <span className="form-label">Category</span>
                <select
                  value={expCategory}
                  onChange={(e) => setExpCategory(e.target.value as CategoryExpense)}
                  className="form-select"
                  aria-label="Expense category"
                >
                  <option value="Food">Food / Groceries</option>
                  <option value="Transport">Transport</option>
                  <option value="Shopping">Shopping</option>
                  <option value="Utilities">Utilities</option>
                  <option value="Rent">Rent</option>
                  <option value="Entertainment">Entertainment</option>
                  <option value="Medical">Medical</option>
                  <option value="Education">Education</option>
                  <option value="Insurance">Insurance</option>
                  <option value="Bank Charges & Interest">Bank Charges</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <span className="form-label">Date</span>
                <DatePicker value={expDate} onChange={setExpDate} required />
              </div>

              <div className="space-y-1.5">
                <span className="form-label">Pay From</span>
                <select
                  ref={expTargetRef}
                  value={expMethodId ? `${expMethodId}:${expMethodType}` : ''}
                  onChange={(e) => handleSelectPaymentMethod(e.target.value)}
                  className={`form-select ${expErrors.methodId ? '!border-red-500' : ''}`}
                  aria-label="Payment source"
                >
                  <option value="">Select source</option>
                  <optgroup label="Cash Wallets">
                    {cashAccounts.map(c => (
                      <option key={c.id} value={`${c.id}:cash`}>{c.name} ({currency}{c.balance.toLocaleString()})</option>
                    ))}
                  </optgroup>
                  <optgroup label="Bank Cards">
                    {cards.filter(c => !c.isCanceled).map(card => (
                      <option key={card.id} value={`${card.id}:card`} disabled={card.isFrozen}>
                        {card.bankName} - {card.cardName}{card.isFrozen ? ' [FROZEN]' : ''}
                      </option>
                    ))}
                  </optgroup>
                </select>
                {expErrors.methodId && <span className="text-red-500 text-[10px]">{expErrors.methodId}</span>}
              </div>
            </div>

            {expMethodType === 'card' && expMethodId && (
              <div className="card-surface p-3">
                <span className="form-label">Bank Charge ({currency})</span>
                <input
                  type="number"
                  step="any"
                  placeholder="0.00 (leave blank if none)"
                  value={expBankCharge}
                  onChange={(e) => {
                    setExpBankCharge(e.target.value);
                    setInsufficiencyError(null);
                    validateExpense(expTitle, expDesc, expAmount, expMethodId, expMethodType, expSubmitted);
                  }}
                  className="form-input font-mono"
                  aria-label="Bank charge"
                />
              </div>
            )}

            {insufficiencyError && (
              <div className="p-3 rounded-xl flex items-start gap-2 text-xs" style={{
                backgroundColor: 'color-mix(in srgb, var(--danger) 12%, transparent)',
                color: 'var(--danger)',
                border: '1px solid color-mix(in srgb, var(--danger) 20%, transparent)',
              }}>
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span>{insufficiencyError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isProcessing}
              className="btn-danger w-full !py-3"
            >
              {isProcessing ? 'Processing...' : <><MinusCircle size={14} /> Record Expense</>}
            </button>
          </form>
        )}
      </div>

    </div>
  );
}
