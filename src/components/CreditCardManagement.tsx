import React, { useState } from 'react';
import { CashAccount, BankCard, CreditCardPurchase } from '../types';
import { CreditCard as CcIcon, Plus, CheckSquare, Lock, Unlock } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';

interface Props {
  creditCards: BankCard[];
  cashAccounts: CashAccount[];
  cards: BankCard[];
  currency: string;
  onPayCard: (cardId: string, amount: number, fromId: string, fromType: 'cash' | 'card') => void;
  onAddPurchase: (purchase: Omit<CreditCardPurchase, 'id'>) => void;
  onUpdateCard: (card: BankCard) => void;
}

export default function CreditCardManagement({ creditCards, cashAccounts, cards, currency, onPayCard, onAddPurchase, onUpdateCard }: Props) {
  const { showToast } = useNotifications();
  
  // Repay card maps mapped by Card ID
  const [payAmounts, setPayAmounts] = useState<Record<string, string>>({});
  const [paySources, setPaySources] = useState<Record<string, string>>({});
  const [payErrors, setPayErrors] = useState<Record<string, string>>({});

  // Record purchase states
  const [purAmount, setPurAmount] = useState('');
  const [purDesc, setPurDesc] = useState('');
  const [purMerchant, setPurMerchant] = useState('');
  const [purCardId, setPurCardId] = useState('');
  const [purchaseErrors, setPurchaseErrors] = useState<Record<string, string>>({});
  const [purchaseSubmitted, setPurchaseSubmitted] = useState(false);

  // Focus refs
  const purchaseCardRef = React.useRef<HTMLSelectElement>(null);
  const purchaseAmountRef = React.useRef<HTMLInputElement>(null);
  const purchaseMerchantRef = React.useRef<HTMLInputElement>(null);

  const fundingAccounts = [
      ...cashAccounts.map(c => ({ id: c.id, name: c.name, type: 'cash' as const, balance: c.balance })),
      ...cards.map(c => ({ id: c.id, name: c.cardName, type: 'card' as const, balance: c.currentBalance })),
  ];

  const validatePay = (cardId: string, amtStr: string, srcVal: string, skipAmountCheck = false): boolean => {
    const card = creditCards.find(c => c.id === cardId);
    if (!card) return false;

    if (!srcVal) {
      setPayErrors(prev => ({ ...prev, [cardId]: 'Funding source account is required' }));
      return false;
    }

    const source = fundingAccounts.find(a => `${a.type}-${a.id}` === srcVal);
    if (!source) {
      setPayErrors(prev => ({ ...prev, [cardId]: 'Funding account is invalid' }));
      return false;
    }

    // Get the source actual balance
    const sourceBalance = source.balance;

    if (!skipAmountCheck) {
      if (!amtStr) {
        setPayErrors(prev => ({ ...prev, [cardId]: 'Repay amount is required' }));
        return false;
      }
      const amt = parseFloat(amtStr);
      if (isNaN(amt)) {
        setPayErrors(prev => ({ ...prev, [cardId]: 'Repay amount must be a number' }));
        return false;
      }
      if (amt <= 0) {
        setPayErrors(prev => ({ ...prev, [cardId]: 'Repay amount must be positive' }));
        return false;
      }
      if (amt > card.currentBalance) {
        setPayErrors(prev => ({ ...prev, [cardId]: `Cannot overpay card balance of ${currency} ${card.currentBalance.toFixed(2)}` }));
        return false;
      }
      if (amt > sourceBalance) {
        setPayErrors(prev => ({ ...prev, [cardId]: `Insufficient funds in source account! Available: ${currency} ${sourceBalance.toFixed(2)}` }));
        return false;
      }
    } else {
      // Full settlement check
      if (card.currentBalance <= 0) {
        setPayErrors(prev => ({ ...prev, [cardId]: 'No balance to settle on this card.' }));
        return false;
      }
      if (card.currentBalance > sourceBalance) {
        setPayErrors(prev => ({ ...prev, [cardId]: `Source balance of ${currency} ${sourceBalance.toFixed(2)} is insufficient for full settlement.` }));
        return false;
      }
    }

    setPayErrors(prev => {
      const copy = { ...prev };
      delete copy[cardId];
      return copy;
    });
    return true;
  };

  const validatePurchase = (cardId: string, amtStr: string, merchant: string, desc: string, submitted: boolean): boolean => {
    const errs: Record<string, string> = {};
    if (submitted || cardId) {
      if (!cardId) {
        errs.cardId = 'Credit card is required';
      }
    }
    if (submitted || amtStr) {
      if (!amtStr) {
        errs.amount = 'Purchase amount is required';
      } else {
        const amt = parseFloat(amtStr);
        if (isNaN(amt)) {
          errs.amount = 'Must be a valid number';
        } else if (amt <= 0) {
          errs.amount = 'Purchase amount must be positive';
        } else if (cardId) {
          const card = creditCards.find(c => c.id === cardId);
          if (card) {
            const avail = (card.limit ?? 0) - card.currentBalance;
            if (amt > avail) {
              errs.amount = `Amount exceeds available limit of ${currency} ${avail.toFixed(2)}`;
            }
          }
        }
      }
    }
    if (submitted || merchant) {
      if (!merchant.trim()) {
        errs.merchant = 'Merchant name is required';
      } else if (merchant.trim().length < 2) {
        errs.merchant = 'Merchant name must be at least 2 characters';
      } else if (/[<>{}]/.test(merchant)) {
        errs.merchant = 'Invalid characters are not allowed';
      }
    }
    setPurchaseErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleAddPurchase = (e: React.FormEvent) => {
    e.preventDefault();
    setPurchaseSubmitted(true);
    const isValid = validatePurchase(purCardId, purAmount, purMerchant, purDesc, true);
    if (!isValid) {
      if (!purCardId) {
        purchaseCardRef.current?.focus();
      } else if (!purAmount || isNaN(parseFloat(purAmount)) || parseFloat(purAmount) <= 0) {
        purchaseAmountRef.current?.focus();
      } else {
        purchaseMerchantRef.current?.focus();
      }
      showToast('error', 'Select card and input correct positive sum.');
      return;
    }
    onAddPurchase({ cardId: purCardId, amount: parseFloat(purAmount), description: purDesc, merchant: purMerchant, date: new Date().toISOString().split('T')[0] });
    setPurAmount(''); setPurDesc(''); setPurMerchant('');
    setPurchaseSubmitted(false);
    setPurchaseErrors({});
    showToast('success', 'Purchase details logged and card statement updated.');
  };

  return (
    <div className="bg-zinc-900/50 border border-zinc-850 rounded-[28px] p-6 shadow-xl space-y-6">
      <h3 className="text-sm font-bold text-white flex items-center gap-2">
        <CcIcon size={16} className="text-emerald-500" />
        Credit Cards
      </h3>
      
      {/* List */}
      <div className="space-y-3">
        {creditCards.map(c => (
            <div key={c.id} className="bg-zinc-950 p-5 rounded-2xl border border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <h4 className="text-white font-bold text-sm flex items-center gap-2">
                      {c.cardName}
                      <span className="text-[10px] text-zinc-500 bg-zinc-900 border border-zinc-800/80 px-1.5 py-0.5 rounded font-mono font-medium">{c.bankName}</span>
                    </h4>
                    <p className="text-xs text-zinc-400">
                        Debt: <span className="font-mono text-zinc-200 font-bold">{currency} {c.currentBalance.toFixed(2)}</span> |
                        Avail: <span className="font-mono text-emerald-400 font-bold">{currency} {((c.limit ?? 0) - c.currentBalance).toFixed(2)}</span>
                    </p>
                    <div className='flex items-center gap-2 mt-2'>
                        <span className='text-[10px] text-zinc-500 font-mono'>LIMIT:</span>
                        <input
                            type="number"
                            placeholder="Limit"
                            value={c.limit ?? ''}
                            disabled={!!(c.isLimitLocked ?? true)}
                            onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                onUpdateCard({ ...c, limit: isNaN(val) ? undefined : val });
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    onUpdateCard({ ...c, isLimitLocked: true });
                                    e.currentTarget.blur();
                                    showToast('success', `Limit of ${currency}${c.limit || 0} locked & synchronized!`);
                                }
                            }}
                            className={`w-20 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 text-[10px] text-white font-mono ${c.isLimitLocked ?? true ? 'opacity-55 font-normal' : 'border-emerald-500 font-extrabold focus:outline-none focus:ring-1 focus:ring-emerald-550'}`}
                            title={c.isLimitLocked ?? true ? "Limit is locked. Toggle the icon to edit." : "Edit the limit and press Enter to save & lock."}
                        />
                        <button 
                            type="button"
                            onClick={() => {
                                const nextLock = !(c.isLimitLocked ?? true);
                                onUpdateCard({ ...c, isLimitLocked: nextLock });
                                if (!nextLock) {
                                    showToast('info', 'Limit unlocked. Type value then press Enter to save & lock.');
                                } else {
                                    showToast('success', `Limit of ${currency}${c.limit || 0} locked & synchronized!`);
                                }
                            }}
                            className="p-1 hover:bg-zinc-800 rounded transition cursor-pointer"
                            title={c.isLimitLocked ?? true ? "Unlock limit editing" : "Lock and save limit"}
                        >
                            {c.isLimitLocked ?? true ? <Lock size={12} className="text-zinc-500" /> : <Unlock size={12} className="text-emerald-500 animate-pulse" />}
                        </button>
                    </div>
                </div>

                {/* Settle Action form controls */}
                <div className="flex flex-col gap-2.5 pt-3 border-t border-zinc-900 md:pt-0 md:border-t-0 w-full md:w-auto">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                        <input 
                            type="number" 
                            placeholder="Repay Amt" 
                            value={payAmounts[c.id] || ''}
                            onChange={(e) => {
                                const val = e.target.value;
                                setPayAmounts(prev => ({ ...prev, [c.id]: val }));
                                validatePay(c.id, val, paySources[c.id] || '');
                            }}
                            className={`w-full sm:w-24 bg-zinc-900 border text-xs text-white font-mono rounded-xl p-2.5 focus:outline-none transition-colors ${
                                payErrors[c.id] && payAmounts[c.id] !== undefined
                                    ? 'border-rose-500 focus:border-rose-600'
                                    : payAmounts[c.id] && !payErrors[c.id]
                                    ? 'border-emerald-500 focus:border-emerald-600'
                                    : 'border-zinc-800 focus:border-zinc-500'
                            }`} 
                        />
                        <select 
                            value={paySources[c.id] || ''}
                            onChange={(e) => {
                                const val = e.target.value;
                                setPaySources(prev => ({ ...prev, [c.id]: val }));
                                validatePay(c.id, payAmounts[c.id] || '', val);
                            }}
                            className={`w-full sm:w-36 bg-zinc-900 border text-zinc-300 text-xs rounded-xl p-2.5 focus:outline-none transition-colors ${
                                payErrors[c.id] && paySources[c.id] !== undefined
                                    ? 'border-rose-500 focus:border-rose-600'
                                    : paySources[c.id] && !payErrors[c.id]
                                    ? 'border-emerald-500 focus:border-emerald-600'
                                    : 'border-zinc-800 focus:border-zinc-500'
                            }`}
                        >
                            <option value="">Source Account</option>
                            {fundingAccounts.map(a => <option key={`${a.type}-${a.id}`} value={`${a.type}-${a.id}`}>{a.name}</option>)}
                        </select>
                        <div className="flex gap-2">
                            {/* Settle FULL balance button */}
                            <button 
                                onClick={() => {
                                    const srcSelected = paySources[c.id] || '';
                                    const isValid = validatePay(c.id, '', srcSelected, true);
                                    if(!isValid) {
                                        showToast('error', payErrors[c.id] || 'Select funding source and make sure balance is available.');
                                        return;
                                    }
                                    onPayCard(c.id, c.currentBalance, srcSelected.split('-')[1], srcSelected.split('-')[0] as 'cash' | 'card');
                                    setPayAmounts(prev => { const cp = {...prev}; delete cp[c.id]; return cp; });
                                    setPaySources(prev => { const cp = {...prev}; delete cp[c.id]; return cp; });
                                    setPayErrors(prev => { const cp = {...prev}; delete cp[c.id]; return cp; });
                                }}
                                className="bg-purple-500 hover:bg-purple-400 p-2.5 rounded-xl text-neutral-950 font-bold font-mono text-[9px] uppercase tracking-wider flex-1 sm:flex-none transition duration-150 cursor-pointer shadow-md"
                            >
                                Settle Full
                            </button>
                            {/* Pay custom balance checking button */}
                            <button 
                                onClick={() => {
                                    const srcSelected = paySources[c.id] || '';
                                    const amtTyped = payAmounts[c.id] || '';
                                    const isValid = validatePay(c.id, amtTyped, srcSelected, false);
                                    if(!isValid) {
                                        showToast('error', payErrors[c.id] || 'Please input custom amount and select source.');
                                        return;
                                    }
                                    onPayCard(c.id, parseFloat(amtTyped), srcSelected.split('-')[1], srcSelected.split('-')[0] as 'cash' | 'card');
                                    setPayAmounts(prev => { const cp = {...prev}; delete cp[c.id]; return cp; });
                                    setPaySources(prev => { const cp = {...prev}; delete cp[c.id]; return cp; });
                                    setPayErrors(prev => { const cp = {...prev}; delete cp[c.id]; return cp; });
                                }} 
                                className="bg-emerald-500 hover:bg-emerald-400 p-2.5 rounded-xl text-neutral-950 flex items-center justify-center transition duration-150 cursor-pointer shadow-md shrink-0" 
                                title="Pay custom amount"
                            >
                                <CheckSquare size={14}/>
                            </button>
                        </div>
                    </div>
                    {payErrors[c.id] && (
                        <span className="text-rose-400 font-mono text-[10px] block text-right mt-1 leading-none">{payErrors[c.id]}</span>
                    )}
                </div>
            </div>
        ))}
      </div>

      {/* Add Purchase */}
      <form onSubmit={handleAddPurchase} className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-zinc-950 p-6 rounded-2xl border border-zinc-800 shadow-lg">
        <h4 className='sm:col-span-2 text-white font-bold text-xs uppercase tracking-wider font-mono'>Record Card Purchase</h4>
        
        <div className="sm:col-span-2 flex flex-col gap-1">
          <label className="text-[10px] text-zinc-500 font-bold uppercase font-mono block">Credit Card Account</label>
          <select 
              ref={purchaseCardRef}
              value={purCardId}
              onChange={(e) => {
                  setPurCardId(e.target.value);
                  validatePurchase(e.target.value, purAmount, purMerchant, purDesc, purchaseSubmitted);
              }}
              className={`w-full bg-zinc-900 border text-xs text-white rounded-xl p-3 focus:outline-none transition-colors ${
                  purchaseErrors.cardId
                      ? 'border-rose-500 focus:border-rose-600'
                      : purCardId && !purchaseErrors.cardId
                      ? 'border-emerald-500 focus:border-emerald-600'
                      : 'border-zinc-800 focus:border-zinc-500'
              }`}
          >
              <option value="">Select Card</option>
              {creditCards.map(c => <option key={c.id} value={c.id}>{c.cardName} (Avail: {currency} {((c.limit ?? 0) - c.currentBalance).toFixed(2)})</option>)}
          </select>
          {purchaseErrors.cardId && (
              <span className="text-rose-400 font-mono text-[10px]">{purchaseErrors.cardId}</span>
          )}
        </div>

        <div className="sm:col-span-2 flex flex-col gap-1">
          <label className="text-[10px] text-zinc-500 font-bold uppercase font-mono block">Purchase Amount ({currency})</label>
          <input 
              ref={purchaseAmountRef}
              type="number" 
              placeholder="0.00" 
              value={purAmount} 
              onChange={e => {
                  setPurAmount(e.target.value);
                  validatePurchase(purCardId, e.target.value, purMerchant, purDesc, purchaseSubmitted);
              }} 
              className={`w-full bg-zinc-900 border text-xs text-white rounded-xl p-3 focus:outline-none font-mono transition-colors ${
                  purchaseErrors.amount
                      ? 'border-rose-500 focus:border-rose-600'
                      : purAmount && !purchaseErrors.amount
                      ? 'border-emerald-500 focus:border-emerald-600'
                      : 'border-zinc-800 focus:border-zinc-500'
              }`} 
          />
          {purchaseErrors.amount && (
              <span className="text-rose-400 font-mono text-[10px]">{purchaseErrors.amount}</span>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-zinc-500 font-bold uppercase font-mono block">Merchant Location</label>
          <input 
              ref={purchaseMerchantRef}
              placeholder="e.g. Amazon, Uber" 
              value={purMerchant} 
              onChange={e => {
                  setPurMerchant(e.target.value);
                  validatePurchase(purCardId, purAmount, e.target.value, purDesc, purchaseSubmitted);
              }} 
              className={`w-full bg-zinc-900 border text-xs text-white rounded-xl p-3 focus:outline-none transition-colors ${
                  purchaseErrors.merchant
                      ? 'border-rose-500 focus:border-rose-600'
                      : purMerchant && !purchaseErrors.merchant
                      ? 'border-emerald-500 focus:border-emerald-600'
                      : 'border-zinc-800 focus:border-zinc-500'
              }`} 
          />
          {purchaseErrors.merchant && (
              <span className="text-rose-400 font-mono text-[10px]">{purchaseErrors.merchant}</span>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-zinc-500 font-bold uppercase font-mono block">Reference Description</label>
          <input 
              placeholder="e.g. Server hosting, dinner" 
              value={purDesc} 
              onChange={e => {
                  setPurDesc(e.target.value);
                  validatePurchase(purCardId, purAmount, purMerchant, e.target.value, purchaseSubmitted);
              }} 
              className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-xl p-3 text-xs focus:outline-none focus:border-zinc-550 transition-colors" 
          />
        </div>

        <button type="submit" className="sm:col-span-2 bg-blue-500 text-white font-mono font-bold uppercase tracking-wider text-[11px] py-3.5 rounded-xl hover:bg-blue-600 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg mt-2">
            <Plus size={14} /> Record verified Purchase
        </button>
      </form>
    </div>
  );
}
