import React, { useState } from 'react';
import { CashAccount, BankCard, CategoryIncome, CategoryExpense } from '../types';
import { PlusCircle, MinusCircle, Wallet, CreditCard, Calendar, RefreshCcw, Landmark, ShieldAlert, Tag, Sparkles } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';

interface InflowsOutflowsProps {
  cashAccounts: CashAccount[];
  cards: BankCard[];
  onAddIncome: (amount: number, date: string, source: string, category: CategoryIncome, targetId: string, targetType: 'cash' | 'card') => void;
  onAddExpense: (title: string, description: string, amount: number, date: string, category: CategoryExpense, paymentMethodId: string, paymentMethodType: 'cash' | 'card') => void;
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
  // Navigation trigger Inside Inflows Tab
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

  // Balance Insufficiency state
  const [insufficiencyError, setInsufficiencyError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Advanced validation structures
  const [incErrors, setIncErrors] = useState<Record<string, string>>({});
  const [incSubmitted, setIncSubmitted] = useState(false);
  const [expErrors, setExpErrors] = useState<Record<string, string>>({});
  const [expSubmitted, setExpSubmitted] = useState(false);

  // Focus Refs
  const incSourceRef = React.useRef<HTMLInputElement>(null);
  const incAmountRef = React.useRef<HTMLInputElement>(null);
  const incTargetRef = React.useRef<HTMLSelectElement>(null);

  const expTitleRef = React.useRef<HTMLInputElement>(null);
  const expAmountRef = React.useRef<HTMLInputElement>(null);
  const expTargetRef = React.useRef<HTMLSelectElement>(null);

  // Auto-populate first target/method on component load
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
                availableBalance = (match.limit ?? 0) - match.currentBalance;
              } else {
                availableBalance = match.currentBalance;
              }
            } else {
              availableBalance = 0;
            }
          }
          if (availableBalance < num) {
            errs.amount = `Insufficient available limit! Available: ${currency} ${availableBalance.toLocaleString()}`;
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
        expMethodType
      );

      setExpAmount('');
      setExpTitle('');
      setExpDesc('');
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
    <div id="inflows-outflows-view" className="space-y-6 animate-fade-in">
      
      {/* Tab Selectors */}
      <div className="grid grid-cols-2 p-1.5 bg-[#0a0a0f] border border-zinc-850 rounded-[20px]" id="tab-selectors">
        <button
          onClick={() => {
            setToggleForm('income');
            setInsufficiencyError(null);
          }}
          className={`py-3 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
            toggleForm === 'income'
              ? 'bg-zinc-900 border border-zinc-800 text-white shadow-xl font-extrabold'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <PlusCircle size={14} className="text-blue-400" />
          Capture Inflow Income
        </button>

        <button
          onClick={() => setToggleForm('expense')}
          className={`py-3 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
            toggleForm === 'expense'
              ? 'bg-zinc-900 border border-zinc-800 text-white shadow-xl font-extrabold'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <MinusCircle size={14} className="text-rose-455 text-rose-450" />
          Settle Outflow Invoice
        </button>
      </div>

      {/* 2. FORM MODULES */}
      <div className="bg-gradient-to-br from-[#0c0c0f] to-zinc-950 border border-zinc-850 rounded-[32px] p-6 shadow-2xl relative">
        <div className="absolute top-0 right-0 p-4 text-zinc-900 pointer-events-none select-none">
          <Sparkles size={60} className="opacity-[0.03]" />
        </div>

        {toggleForm === 'income' ? (
          /* ================== INCOME ENTRY FORM ================== */
          <form onSubmit={handleIncomeSubmit} className="space-y-5" id="log-income-form">
            
            <div>
              <label className="text-[9px] text-[#a1a1a9] font-mono font-bold uppercase tracking-wider block mb-1.5 pl-0.5">Inflow Origin / Source</label>
              <input
                ref={incSourceRef}
                type="text"
                placeholder="e.g. Freelance Web consulting, Salary bonus, Gift"
                value={incSource}
                onChange={(e) => {
                  setIncSource(e.target.value);
                  validateIncome(e.target.value, incAmount, incTargetId ? `${incTargetId}:${incTargetType}` : '', incSubmitted);
                }}
                className={`w-full bg-[#050510]/55 border text-white text-xs rounded-xl px-4 py-3.5 focus:outline-none transition-all ${
                  incErrors.source
                    ? 'border-rose-500 focus:border-rose-500'
                    : incSource && !incErrors.source
                    ? 'border-emerald-500 focus:border-emerald-500'
                    : 'border-zinc-850 hover:border-zinc-700'
                }`}
              />
              {incErrors.source && (
                <span className="text-rose-400 font-mono text-[9px] mt-1.5 block pl-0.5">{incErrors.source}</span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[9px] text-[#a1a1a9] font-mono font-bold uppercase tracking-wider block mb-1.5 pl-0.5">Received Sum ({currency})</label>
                <input
                  ref={incAmountRef}
                  type="number"
                  placeholder="0.00"
                  value={incAmount}
                  onChange={(e) => {
                    setIncAmount(e.target.value);
                    validateIncome(incSource, e.target.value, incTargetId ? `${incTargetId}:${incTargetType}` : '', incSubmitted);
                  }}
                  className={`w-full bg-[#050510]/55 border text-white text-xs rounded-xl px-4 py-3.5 focus:outline-none font-mono font-black transition-all ${
                    incErrors.amount
                      ? 'border-rose-500 focus:border-rose-500'
                      : incAmount && !incErrors.amount
                      ? 'border-emerald-500 focus:border-emerald-500'
                      : 'border-zinc-850 hover:border-zinc-700'
                  }`}
                />
                {incErrors.amount && (
                  <span className="text-rose-400 font-mono text-[9px] mt-1.5 block pl-0.5">{incErrors.amount}</span>
                )}
              </div>

              <div>
                <label className="text-[9px] text-[#a1a1a9] font-mono font-bold uppercase tracking-wider block mb-1.5 pl-0.5">Inflow Classification</label>
                <select
                  value={incCategory}
                  onChange={(e) => setIncCategory(e.target.value as CategoryIncome)}
                  className="w-full bg-[#050510]/55 border border-zinc-850 hover:border-zinc-700 text-zinc-300 text-xs rounded-xl px-2.5 py-3.5 focus:outline-none cursor-pointer"
                >
                  <option value="Salary">Salary Pay</option>
                  <option value="Freelance">Freelance Contract</option>
                  <option value="Business">Business Operation</option>
                  <option value="Bonus">Surprise Bonus</option>
                  <option value="Commission">Sales Commission</option>
                  <option value="Other">Other Inflow</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[9px] text-[#a1a1a9] font-mono font-bold block mb-1.5 uppercase pl-0.5">Receipt Date</label>
                <input
                  type="date"
                  value={incDate}
                  onChange={(e) => setIncDate(e.target.value)}
                  className="w-full bg-[#050510]/55 border border-zinc-850 hover:border-zinc-700 text-white text-xs rounded-xl px-4 py-3.5 focus:outline-none font-mono cursor-pointer"
                  required
                />
              </div>

              <div>
                <label className="text-[9px] text-[#a1a1a9] font-mono font-bold block mb-1.5 uppercase pl-0.5">Destination target Vault</label>
                <select
                  ref={incTargetRef}
                  value={incTargetId ? `${incTargetId}:${incTargetType}` : ''}
                  onChange={(e) => handleSelectTargetAccount(e.target.value)}
                  className="w-full bg-[#050510]/55 border border-zinc-850 hover:border-zinc-700 text-zinc-350 text-xs rounded-xl px-2.5 py-3.5 focus:outline-none cursor-pointer"
                >
                  <option value="">Select target</option>
                  <optgroup label="Cash Wallets" className="bg-[#0c0c0e] text-zinc-500">
                    {cashAccounts.map(c => (
                      <option key={c.id} value={`${c.id}:cash`}>Wallet: {c.name} ({currency}{c.balance.toLocaleString()})</option>
                    ))}
                  </optgroup>
                  <optgroup label="Bank Card Accounts" className="bg-[#0c0c0e] text-zinc-500">
                    {cards.filter(c => !c.isCanceled).map(card => (
                      <option key={card.id} value={`${card.id}:card`} disabled={card.isFrozen}>
                        {card.bankName} - {card.cardName}{card.isFrozen ? ' [FROZEN]' : ''}
                      </option>
                    ))}
                  </optgroup>
                </select>
                {incErrors.target && (
                  <span className="text-rose-400 font-mono text-[9px] mt-1.5 block pl-0.5">{incErrors.target}</span>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={isProcessing}
              className="w-full py-4 bg-white text-black font-mono font-bold uppercase tracking-widest text-[10px] rounded-xl hover:bg-zinc-200 transition-all flex items-center justify-center gap-2 mt-4 cursor-pointer shadow-lg disabled:opacity-55"
            >
              {isProcessing ? 'Processing Inflow...' : <><PlusCircle size={14} className="text-emerald-600 stroke-[2.5px]" /> Log Inflow & Increase Balance</>}
            </button>
          </form>
        ) : (
          /* ================== EXPENSE DEBIT FORM ================== */
          <form onSubmit={handleExpenseSubmit} className="space-y-4" id="log-expense-form">
            
            <div>
              <label className="text-[9px] text-[#a1a1a9] font-mono font-bold uppercase tracking-wider block mb-1.5 pl-0.5">Expense / Invoice Title</label>
              <input
                ref={expTitleRef}
                type="text"
                placeholder="e.g. Electric bill payment, restaurant lunch with clients"
                value={expTitle}
                onChange={(e) => {
                  setExpTitle(e.target.value);
                  validateExpense(e.target.value, expDesc, expAmount, expMethodId, expMethodType, expSubmitted);
                }}
                className={`w-full bg-[#050510]/55 border text-white text-xs rounded-xl px-4 py-3.5 focus:outline-none transition-all ${
                  expErrors.title
                    ? 'border-rose-500 focus:border-rose-500'
                    : expTitle && !expErrors.title
                    ? 'border-emerald-500 focus:border-emerald-500'
                    : 'border-zinc-850 hover:border-zinc-700'
                }`}
              />
              {expErrors.title && (
                <span className="text-rose-400 font-mono text-[9px] mt-1.5 block pl-0.5">{expErrors.title}</span>
              )}
            </div>

            <div>
              <label className="text-[9px] text-[#a1a1a9] font-mono font-bold uppercase tracking-wider block mb-1.5 pl-0.5 font-sans font-bold">Supplemental Remarks (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Booking reference #8291, corporate card"
                value={expDesc}
                onChange={(e) => {
                  setExpDesc(e.target.value);
                  validateExpense(expTitle, e.target.value, expAmount, expMethodId, expMethodType, expSubmitted);
                }}
                className="w-full bg-[#050510]/55 border border-zinc-850 hover:border-zinc-700 text-white text-xs rounded-xl px-4 py-3.5 focus:outline-none transition-all font-medium placeholder:text-zinc-650"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[9px] text-[#a1a1a9] font-mono font-bold uppercase tracking-wider block mb-1.5 pl-0.5">Settle Sum ({currency})</label>
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
                  className={`w-full bg-[#050510]/55 border text-white text-xs rounded-xl px-4 py-3.5 focus:outline-none font-mono font-black transition-all ${
                    expErrors.amount
                      ? 'border-rose-500 focus:border-rose-500'
                      : expAmount && !expErrors.amount
                      ? 'border-emerald-500 focus:border-emerald-500'
                      : 'border-zinc-850 hover:border-zinc-700'
                  }`}
                />
                {expErrors.amount && (
                  <span className="text-rose-400 font-mono text-[9px] mt-1.5 block pl-0.5">{expErrors.amount}</span>
                )}
              </div>

              <div>
                <label className="text-[9px] text-[#a1a1a9] font-mono font-bold uppercase tracking-wider block mb-1.5 pl-0.5">Usage Category</label>
                <select
                  value={expCategory}
                  onChange={(e) => setExpCategory(e.target.value as CategoryExpense)}
                  className="w-full bg-[#050510]/55 border border-zinc-850 hover:border-zinc-700 text-zinc-350 text-xs rounded-xl px-2.5 py-3.5 focus:outline-none cursor-pointer"
                >
                  <option value="Food">Food / Groceries</option>
                  <option value="Transport">Public Transport</option>
                  <option value="Shopping">Shopping & Lifestyle</option>
                  <option value="Utilities">Household Utilities</option>
                  <option value="Rent">Landlord Rent</option>
                  <option value="Entertainment">Entertainment / Media</option>
                  <option value="Medical">Medical / Healthcare</option>
                  <option value="Education">Education Coursework</option>
                  <option value="Insurance">Asset Insurance</option>
                  <option value="Other font-sans">Other Miscellaneous</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[9px] text-[#a1a1a9] font-mono font-bold block mb-1.5 uppercase pl-0.5">Swipe / Settlement Date</label>
                <input
                  type="date"
                  value={expDate}
                  onChange={(e) => setExpDate(e.target.value)}
                  className="w-full bg-[#050510]/55 border border-zinc-850 hover:border-zinc-700 text-white text-xs rounded-xl px-4 py-3.5 focus:outline-none font-mono cursor-pointer"
                  required
                />
              </div>

              <div>
                <label className="text-[9px] text-[#a1a1a9] font-mono font-bold block mb-1.5 uppercase pl-0.5 font-bold">Deduct Source Account</label>
                <select
                  ref={expTargetRef}
                  value={expMethodId ? `${expMethodId}:${expMethodType}` : ''}
                  onChange={(e) => handleSelectPaymentMethod(e.target.value)}
                  className={`w-full bg-[#050510]/55 border text-zinc-350 text-xs rounded-xl px-2.5 py-3.5 focus:outline-none cursor-pointer ${
                    expErrors.methodId
                      ? 'border-rose-500'
                      : expMethodId && !expErrors.methodId
                      ? 'border-emerald-500'
                      : 'border-zinc-850 hover:border-zinc-700'
                  }`}
                >
                  <option value="">Select funding source</option>
                  <optgroup label="Cash Wallets" className="bg-[#0c0c0e] text-zinc-500 font-bold">
                    {cashAccounts.map(c => (
                      <option key={c.id} value={`${c.id}:cash`}>{c.name} ({currency}{c.balance.toLocaleString()})</option>
                    ))}
                  </optgroup>
                  <optgroup label="Saved Bank Cards" className="bg-[#0c0c0e] text-zinc-500 font-bold">
                    {cards.filter(c => !c.isCanceled).map(card => (
                      <option key={card.id} value={`${card.id}:card`} disabled={card.isFrozen}>
                        {card.bankName} - {card.cardName} ({currency}{card.currentBalance.toLocaleString()}){card.isFrozen ? ' [FROZEN / LOCKED]' : ''}
                      </option>
                    ))}
                  </optgroup>
                </select>
                {expErrors.methodId && (
                  <span className="text-rose-400 font-mono text-[9px] mt-1.5 block pl-0.5">{expErrors.methodId}</span>
                )}
              </div>
            </div>

            {/* ERROR TRIGGER INDICATOR */}
            {insufficiencyError && (
              <div className="p-4 bg-rose-950/40 border border-rose-900/65 rounded-xl flex items-start gap-2.5 text-rose-300 font-semibold text-xs leading-relaxed mt-2 animate-pulse">
                <ShieldAlert size={16} className="shrink-0 mt-0.5 text-rose-400 font-extrabold" />
                <span>{insufficiencyError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isProcessing}
              className="w-full py-4 bg-white text-black font-mono font-bold uppercase tracking-widest text-[10px] rounded-xl hover:bg-zinc-200 transition-all flex items-center justify-center gap-2 mt-4 cursor-pointer shadow-lg disabled:opacity-55"
            >
              {isProcessing ? 'Processing Settlement...' : <><MinusCircle size={14} className="text-rose-600 stroke-[2.5px]" /> Authorize Outflow & Settle Debit</>}
            </button>
          </form>
        )}
      </div>

      <div className="bg-[#08080c]/50 border border-zinc-850 rounded-[20px] p-4 flex gap-2 justify-center text-center">
        <span className="text-[10.5px] font-mono text-zinc-500 font-semibold tracking-tight">
          * Dynamic system triggers will sync balances & log audit lines instantly inside unified ledger.
        </span>
      </div>
    </div>
  );
}
