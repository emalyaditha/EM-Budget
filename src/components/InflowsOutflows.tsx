import React, { useState } from 'react';
import { CashAccount, BankCard, CategoryIncome, CategoryExpense } from '../types';
import { PlusCircle, MinusCircle, Wallet, CreditCard, Calendar, RefreshCcw, Landmark, ShieldAlert, Tag } from 'lucide-react';
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
            availableBalance = match ? match.currentBalance : 0;
          }
          if (availableBalance < num) {
            errs.amount = `Insufficient balance! Available: ${currency} ${availableBalance.toLocaleString()}`;
          }
        }
      }
    }
    if (sub || methodId) {
      if (!methodId) {
        errs.methodId = 'Payment source account is required';
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
    } catch(e) {
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
    } catch(e) {
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
    <div id="inflows-outflows-view" className="space-y-5">
      
      {/* Tab Selectors */}
      <div className="grid grid-cols-2 p-1.5 bg-[#050505] border border-zinc-850 rounded-2xl" id="tab-selectors">
        <button
          onClick={() => {
            setToggleForm('income');
            setInsufficiencyError(null);
          }}
          className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            toggleForm === 'income'
              ? 'bg-zinc-800 border border-zinc-700 text-white shadow-md font-sans font-bold'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <PlusCircle size={14} className="text-emerald-400" />
          Log Inflow
        </button>

        <button
          onClick={() => setToggleForm('expense')}
          className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            toggleForm === 'expense'
              ? 'bg-zinc-800 border border-zinc-700 text-white shadow-md font-sans font-bold'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <MinusCircle size={14} className="text-rose-400" />
          Log Outflow
        </button>
      </div>

      {/* 2. FORM MODULES */}
      <div className="bg-zinc-900/50 border border-zinc-850 rounded-[28px] p-6 shadow-xl">
        
        {toggleForm === 'income' ? (
          /* ================== INCOME ENTRY FORM ================== */
          <form onSubmit={handleIncomeSubmit} className="space-y-4" id="log-income-form">
            <div>
              <label className="text-[10px] text-[#888888] font-mono font-bold uppercase block mb-1">Receipt Source Title</label>
              <input
                ref={incSourceRef}
                type="text"
                placeholder="e.g. Website Overhaul project bonus"
                value={incSource}
                onChange={(e) => {
                  setIncSource(e.target.value);
                  validateIncome(e.target.value, incAmount, incTargetId ? `${incTargetId}:${incTargetType}` : '', incSubmitted);
                }}
                className={`w-full bg-[#050505] border text-white text-xs rounded-xl px-3 py-3 focus:outline-none transition-colors ${
                  incErrors.source
                    ? 'border-rose-500 focus:border-rose-600'
                    : incSource && !incErrors.source
                    ? 'border-emerald-500 focus:border-emerald-600'
                    : 'border-zinc-805 border-zinc-800 focus:border-zinc-500'
                }`}
              />
              {incErrors.source && (
                <span className="text-rose-400 font-mono text-[10px] mt-1 block">{incErrors.source}</span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] text-[#888888] font-mono font-bold uppercase block mb-1">Received Sum ({currency})</label>
                <input
                  ref={incAmountRef}
                  type="number"
                  placeholder="0.00"
                  value={incAmount}
                  onChange={(e) => {
                    setIncAmount(e.target.value);
                    validateIncome(incSource, e.target.value, incTargetId ? `${incTargetId}:${incTargetType}` : '', incSubmitted);
                  }}
                  className={`w-full bg-[#050505] border text-white text-xs rounded-xl px-3 py-3 focus:outline-none font-mono font-semibold transition-colors ${
                    incErrors.amount
                      ? 'border-rose-500 focus:border-rose-600'
                      : incAmount && !incErrors.amount
                      ? 'border-emerald-500 focus:border-emerald-600'
                      : 'border-zinc-800 focus:border-zinc-500'
                  }`}
                />
                {incErrors.amount && (
                  <span className="text-rose-400 font-mono text-[10px] mt-1 block">{incErrors.amount}</span>
                )}
              </div>

              <div>
                <label className="text-[10px] text-[#888888] font-mono font-bold uppercase block mb-1">Inflow Category</label>
                <select
                  value={incCategory}
                  onChange={(e) => setIncCategory(e.target.value as CategoryIncome)}
                  className="w-full bg-[#050505] border border-zinc-800 text-zinc-300 text-xs rounded-xl px-2.5 py-3 focus:outline-none focus:border-zinc-500 transition-colors"
                >
                  <option value="Salary">Salary</option>
                  <option value="Freelance">Freelance</option>
                  <option value="Business">Business</option>
                  <option value="Bonus">Bonus</option>
                  <option value="Commission">Commission</option>
                  <option value="Other">Other Income</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] text-[#888888] font-mono font-bold block mb-1 uppercase">Record Date</label>
                <input
                  type="date"
                  value={incDate}
                  onChange={(e) => setIncDate(e.target.value)}
                  className="w-full bg-[#050505] border border-zinc-800 text-white text-xs rounded-xl px-3 py-3 focus:outline-none focus:border-zinc-500 font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] text-[#888888] font-mono font-bold block mb-1 uppercase">Receipt Target Account</label>
                <select
                  ref={incTargetRef}
                  value={incTargetId ? `${incTargetId}:${incTargetType}` : ''}
                  onChange={(e) => handleSelectTargetAccount(e.target.value)}
                  className="w-full bg-[#050505] border border-zinc-800 text-white text-xs rounded-xl px-2.5 py-3 focus:outline-none focus:border-zinc-500 font-medium font-mono"
                >
                  <option value="">Select target</option>
                  <optgroup label="Cash Wallets">
                    {cashAccounts.map(c => (
                      <option key={c.id} value={`${c.id}:cash`}>Wallet: {c.name} (Bal: {currency}{c.balance})</option>
                    ))}
                  </optgroup>
                  <optgroup label="Bank Card Accounts">
                    {cards.filter(c => !c.isCanceled).map(card => (
                      <option key={card.id} value={`${card.id}:card`}>{card.bankName} - {card.cardName}</option>
                    ))}
                  </optgroup>
                </select>
                {incErrors.target && (
                  <span className="text-rose-400 font-mono text-[10px] mt-1 block">{incErrors.target}</span>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={isProcessing}
              className="w-full py-3.5 bg-white text-black font-mono font-bold uppercase tracking-widest text-[10px] rounded-xl hover:bg-zinc-200 transition-all flex items-center justify-center gap-2 mt-2 cursor-pointer shadow-lg disabled:opacity-50"
            >
              {isProcessing ? 'Processing...' : <><PlusCircle size={14} className="text-emerald-600" /> Collect and Increment Balance</>}
            </button>
          </form>
        ) : (
          /* ================== EXPENSE DEBIT FORM ================== */
          <form onSubmit={handleExpenseSubmit} className="space-y-4" id="log-expense-form">
            <div>
              <label className="text-[10px] text-[#888888] font-mono font-bold uppercase block mb-1">Expense / Invoice Title</label>
              <input
                ref={expTitleRef}
                type="text"
                placeholder="e.g. Electric bill payment, restaurant burger"
                value={expTitle}
                onChange={(e) => {
                  setExpTitle(e.target.value);
                  validateExpense(e.target.value, expDesc, expAmount, expMethodId, expMethodType, expSubmitted);
                }}
                className={`w-full bg-[#050505] border text-white text-xs rounded-xl px-3 py-3 focus:outline-none font-medium transition-colors ${
                  expErrors.title
                    ? 'border-rose-500 focus:border-rose-600'
                    : expTitle && !expErrors.title
                    ? 'border-emerald-500 focus:border-emerald-600'
                    : 'border-zinc-800'
                }`}
              />
              {expErrors.title && (
                <span className="text-rose-400 font-mono text-[10px] mt-1 block">{expErrors.title}</span>
              )}
            </div>

            <div>
              <label className="text-[10px] text-[#888888] font-mono font-bold uppercase block mb-1">Invoice Notes / Description (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Account code: ELE-291, reference 1"
                value={expDesc}
                onChange={(e) => {
                  setExpDesc(e.target.value);
                  validateExpense(expTitle, e.target.value, expAmount, expMethodId, expMethodType, expSubmitted);
                }}
                className="w-full bg-[#050505] border border-zinc-800 text-white text-xs rounded-xl px-3 py-3 focus:outline-none focus:border-zinc-500 transition-colors font-medium"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] text-[#888888] font-mono font-bold uppercase block mb-1">Settled Sum ({currency})</label>
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
                  className={`w-full bg-[#050505] border text-white text-xs rounded-xl px-3 py-3 focus:outline-none font-mono font-semibold transition-colors ${
                    expErrors.amount
                      ? 'border-rose-500 focus:border-rose-600'
                      : expAmount && !expErrors.amount
                      ? 'border-emerald-500 focus:border-emerald-600'
                      : 'border-zinc-800 focus:border-zinc-500'
                  }`}
                />
                {expErrors.amount && (
                  <span className="text-rose-400 font-mono text-[10px] mt-1 block">{expErrors.amount}</span>
                )}
              </div>

              <div>
                <label className="text-[10px] text-[#888888] font-mono font-bold uppercase block mb-1">Usage Category</label>
                <select
                  value={expCategory}
                  onChange={(e) => setExpCategory(e.target.value as CategoryExpense)}
                  className="w-full bg-[#050505] border border-zinc-800 text-white text-xs rounded-xl px-2.5 py-3 focus:outline-none focus:border-zinc-500 transition-colors"
                >
                  <option value="Food">Food</option>
                  <option value="Transport">Transport</option>
                  <option value="Shopping">Shopping</option>
                  <option value="Utilities">Utilities</option>
                  <option value="Rent">Rent</option>
                  <option value="Entertainment">Entertainment</option>
                  <option value="Medical">Medical</option>
                  <option value="Education">Education</option>
                  <option value="Insurance">Insurance</option>
                  <option value="Other">Other Expenses</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] text-[#888888] font-mono font-bold block mb-1 uppercase">Transaction Date</label>
                <input
                  type="date"
                  value={expDate}
                  onChange={(e) => setExpDate(e.target.value)}
                  className="w-full bg-[#050505] border border-zinc-800 text-white text-xs rounded-xl px-3 py-3 focus:outline-none focus:border-zinc-500 font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] text-[#888888] font-mono font-bold block mb-1 uppercase">Deduct Balance From</label>
                <select
                  ref={expTargetRef}
                  value={expMethodId ? `${expMethodId}:${expMethodType}` : ''}
                  onChange={(e) => handleSelectPaymentMethod(e.target.value)}
                  className={`w-full bg-[#050505] border text-white text-xs rounded-xl px-2.5 py-3 focus:outline-none transition-colors ${
                    expErrors.methodId
                      ? 'border-rose-500 focus:border-rose-600'
                      : expMethodId && !expErrors.methodId
                      ? 'border-emerald-500'
                      : 'border-zinc-800'
                  }`}
                >
                  <option value="">Select source</option>
                  <optgroup label="Cash Wallets">
                    {cashAccounts.map(c => (
                      <option key={c.id} value={`${c.id}:cash`}>{c.name} ({currency}{c.balance})</option>
                    ))}
                  </optgroup>
                  <optgroup label="Saved Bank Cards">
                    {cards.filter(c => !c.isCanceled).map(card => (
                      <option key={card.id} value={`${card.id}:card`}>{card.bankName} - {card.cardName} ({currency}{card.currentBalance})</option>
                    ))}
                  </optgroup>
                </select>
                {expErrors.methodId && (
                  <span className="text-rose-400 font-mono text-[10px] mt-1 block">{expErrors.methodId}</span>
                )}
              </div>
            </div>

            {/* ERROR TRIGGER INDICATOR */}
            {insufficiencyError && (
              <div className="p-4 bg-rose-950/40 border border-rose-900/65 rounded-xl flex items-start gap-2 text-rose-300 font-semibold text-xs leading-relaxed mt-2 animate-pulse">
                <ShieldAlert size={16} className="shrink-0 mt-0.5 text-rose-400 font-extrabold" />
                <span>{insufficiencyError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isProcessing}
              className="w-full py-3.5 bg-white text-black font-mono font-bold uppercase tracking-widest text-[10px] rounded-xl hover:bg-zinc-200 transition-all flex items-center justify-center gap-2 mt-2 cursor-pointer shadow-lg disabled:opacity-50"
            >
              {isProcessing ? 'Processing...' : <><MinusCircle size={14} className="text-rose-600" /> Settle Invoice & Deduct</>}
            </button>
          </form>
        )}
      </div>

      <div className="bg-zinc-900/10 border border-zinc-850 rounded-[20px] p-4 flex gap-2 justify-center text-center">
        <span className="text-[10px] font-mono text-zinc-500">
          * Dynamic system triggers will sync balances & log audit lines instantly.
        </span>
      </div>
    </div>
  );
}
