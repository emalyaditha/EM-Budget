import React, { useState } from 'react';
import { CashAccount, BankCard, CreditCardPurchase } from '../types';
import { CreditCard as CcIcon, Plus, CheckSquare, Lock, Unlock, HelpCircle, ShieldCheck, AlertCircle } from 'lucide-react';
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
      ...cashAccounts.map(c => ({ id: c.id, name: c.name, type: 'cash' as const, balance: c.balance, isFrozen: false })),
      ...cards.filter(c => !c.isCanceled).map(c => ({ id: c.id, name: c.cardName, type: 'card' as const, balance: c.currentBalance, isFrozen: !!c.isFrozen })),
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

    if (source.isFrozen) {
      setPayErrors(prev => ({ ...prev, [cardId]: 'This fund source card is currently FROZEN and locked.' }));
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
        setPayErrors(prev => ({ ...prev, [cardId]: 'Repay amount must be positive_amount' }));
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
    <div className="bg-gradient-to-br from-zinc-900/40 to-zinc-950 p-6 md:p-8 rounded-[32px] border border-zinc-850 shadow-2xl space-y-6 animate-fade-in" id="credit-cards-vault">
      
      {/* Header Info */}
      <div className="flex justify-between items-center pb-3 border-b border-zinc-900">
        <div>
          <span className="text-[9px] font-mono tracking-widest text-[#a1a1a9] font-black uppercase bg-zinc-950 px-2.5 py-0.5 rounded-full border border-zinc-900">CREDIT LEDGER</span>
          <h3 className="text-base font-extrabold text-white mt-1.5 flex items-center gap-1.5 font-sans leading-none">
            <CcIcon size={16} className="text-indigo-400" />
            Credit Card Facilities
          </h3>
        </div>
      </div>

      {/* Credit Cards list */}
      <div className="space-y-4">
        {creditCards.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 text-xs italic border border-dashed border-zinc-850 rounded-[20px]">
            No credit cards currently on record. Build one in Cash & Card Management.
          </div>
        ) : (
          creditCards.map(c => {
            const utilization = c.limit && c.limit > 0 ? Math.round((c.currentBalance / c.limit) * 100) : 0;
            return (
              <div key={c.id} className="bg-zinc-900/60 p-5 rounded-2xl border border-zinc-850 hover:border-zinc-800 transition-colors space-y-4 shadow-md">
                
                {/* Visual Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-900/45">
                  <div>
                    <h4 className="text-white font-extrabold text-sm flex items-center gap-2">
                      {c.cardName}
                      <span className="text-[9px] font-mono font-bold uppercase text-zinc-500 bg-zinc-950 border border-zinc-900 px-2 py-0.5 rounded-full">{c.bankName}</span>
                    </h4>
                    
                    {/* Utilization Indicator */}
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[9px] text-zinc-500 uppercase font-mono font-bold">utilization rate:</span>
                      <span className={`text-[9.5px] font-mono font-black ${utilization > 80 ? 'text-rose-450 text-rose-400' : 'text-zinc-300'}`}>{utilization}% used</span>
                    </div>
                  </div>

                  <div className="text-left sm:text-right">
                    <span className="text-[9px] uppercase tracking-wider text-zinc-550 block font-mono text-zinc-500">outstanding debt</span>
                    <span className="font-mono text-sm font-black text-rose-400">
                      {currency} {c.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* Sub metrics & limits control widget */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold text-zinc-400 flex justify-between">
                      <span>Available Card Limit:</span>
                      <span className="font-mono font-black text-blue-450 text-emerald-400">
                        {currency} {((c.limit ?? 0) - c.currentBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </p>

                    {/* Limit edit inline element */}
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-[9px] text-zinc-500 font-mono font-bold uppercase">CREDIT MAX:</span>
                      
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
                        className={`w-24 bg-black border border-zinc-850 hover:border-zinc-700 rounded-xl px-2.5 py-1 text-[11px] text-white font-mono font-bold transition-all ${c.isLimitLocked ?? true ? 'opacity-55' : 'border-blue-500 ring-1 ring-blue-500/10'}`}
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
                        className="p-1.5 hover:bg-zinc-950 text-zinc-500 hover:text-white rounded-lg border border-zinc-900 transition cursor-pointer"
                        title={c.isLimitLocked ?? true ? "Unlock limit editing" : "Lock limit"}
                      >
                        {c.isLimitLocked ?? true ? <Lock size={12} className="text-zinc-500" /> : <Unlock size={12} className="text-blue-500 animate-pulse" />}
                      </button>
                    </div>
                  </div>

                  {/* Settle Action payment input controls */}
                  <div className="space-y-2">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <input 
                        type="number" 
                        placeholder="Repay Sum" 
                        value={payAmounts[c.id] || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPayAmounts(prev => ({ ...prev, [c.id]: val }));
                          validatePay(c.id, val, paySources[c.id] || '');
                        }}
                        className={`w-full sm:w-28 bg-black border text-xs text-white rounded-xl px-3 py-2.5 focus:outline-none transition-all font-mono font-extrabold ${
                          payErrors[c.id] && payAmounts[c.id] !== undefined
                            ? 'border-rose-500 focus:border-rose-500'
                            : payAmounts[c.id] && !payErrors[c.id]
                            ? 'border-emerald-500'
                            : 'border-zinc-855 border-zinc-855 border-zinc-850 hover:border-zinc-700'
                        }`} 
                      />

                      <select 
                        value={paySources[c.id] || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPaySources(prev => ({ ...prev, [c.id]: val }));
                          validatePay(c.id, payAmounts[c.id] || '', val);
                        }}
                        className={`w-full sm:w-36 bg-black border text-zinc-300 text-xs rounded-xl px-2.5 py-2.5 focus:outline-none transition-all font-semibold cursor-pointer ${
                          payErrors[c.id] && paySources[c.id] !== undefined
                            ? 'border-rose-500'
                            : paySources[c.id] && !payErrors[c.id]
                            ? 'border-emerald-500'
                            : 'border-zinc-850 hover:border-zinc-700'
                        }`}
                      >
                        <option value="">Source Account</option>
                        {fundingAccounts.map(a => (
                          <option key={`${a.type}-${a.id}`} value={`${a.type}-${a.id}`} disabled={(a as any).isFrozen}>
                            {a.name}{(a as any).isFrozen ? ' [FROZEN]' : ''}
                          </option>
                        ))}
                      </select>

                      <div className="flex gap-1.5">
                        {/* Settle FULL balance button */}
                        <button 
                          onClick={() => {
                            const srcSelected = paySources[c.id] || '';
                            const isValid = validatePay(c.id, '', srcSelected, true);
                            if(!isValid) {
                              showToast('error', payErrors[c.id] || 'Select funding source and make sure balance is available.');
                              return;
                            }
                            const [srcType, ...srcIdParts] = srcSelected.split('-');
                            const srcId = srcIdParts.join('-');
                            onPayCard(c.id, c.currentBalance, srcId, srcType as 'cash' | 'card');
                            setPayAmounts(prev => { const cp = {...prev}; delete cp[c.id]; return cp; });
                            setPaySources(prev => { const cp = {...prev}; delete cp[c.id]; return cp; });
                            setPayErrors(prev => { const cp = {...prev}; delete cp[c.id]; return cp; });
                          }}
                          className="bg-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/90 p-2.5 rounded-xl text-white font-extrabold font-mono text-[9px] uppercase tracking-wider flex-1 sm:flex-none transition shadow-lg cursor-pointer"
                        >
                          Settle Full
                        </button>

                        {/* Pay custom balance check button */}
                        <button 
                          onClick={() => {
                            const srcSelected = paySources[c.id] || '';
                            const amtTyped = payAmounts[c.id] || '';
                            const isValid = validatePay(c.id, amtTyped, srcSelected, false);
                            if(!isValid) {
                              showToast('error', payErrors[c.id] || 'Please input custom amount and select source.');
                              return;
                            }
                            const [srcType, ...srcIdParts] = srcSelected.split('-');
                            const srcId = srcIdParts.join('-');
                            onPayCard(c.id, parseFloat(amtTyped), srcId, srcType as 'cash' | 'card');
                            setPayAmounts(prev => { const cp = {...prev}; delete cp[c.id]; return cp; });
                            setPaySources(prev => { const cp = {...prev}; delete cp[c.id]; return cp; });
                            setPayErrors(prev => { const cp = {...prev}; delete cp[c.id]; return cp; });
                          }} 
                          className="bg-white hover:bg-zinc-200 p-2.5 rounded-xl text-black flex items-center justify-center transition shadow-lg cursor-pointer max-w-[40px] shrink-0" 
                          title="Pay custom amount"
                        >
                          <CheckSquare size={14} className="stroke-[2.5px]"/>
                        </button>
                      </div>
                    </div>

                    {payErrors[c.id] && (
                      <span className="text-rose-400 font-mono text-[9.5px] block text-right mt-1 leading-tight">{payErrors[c.id]}</span>
                    )}
                  </div>
                </div>

              </div>
            );
          })
        )}
      </div>

      {/* Record purchase form */}
      <form onSubmit={handleAddPurchase} className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-zinc-950 p-5 md:p-6 rounded-[28px] border border-zinc-805 border-zinc-800 shadow-xl relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
        
        <h4 className='sm:col-span-2 text-white font-extrabold text-xs uppercase tracking-wider font-mono flex items-center gap-1.5 pb-2 border-b border-zinc-900'>
          <Plus size={13} className="text-indigo-400 animate-pulse" />
          Record Card Swipe / Purchase
        </h4>
        
        <div className="sm:col-span-2 flex flex-col gap-1.5">
          <label className="text-[10px] text-zinc-500 font-bold uppercase font-mono block pl-0.5">Credit Account used</label>
          <select 
            ref={purchaseCardRef}
            value={purCardId}
            onChange={(e) => {
              setPurCardId(e.target.value);
              validatePurchase(e.target.value, purAmount, purMerchant, purDesc, purchaseSubmitted);
            }}
            className={`w-full bg-[#050510]/50 border text-xs text-zinc-300 rounded-xl p-3 focus:outline-none transition-all font-bold cursor-pointer ${
              purchaseErrors.cardId
                ? 'border-rose-500 focus:border-rose-500'
                : purCardId && !purchaseErrors.cardId
                ? 'border-emerald-500 focus:border-emerald-500'
                : 'border-zinc-850 hover:border-zinc-700'
            }`}
          >
            <option value="">Select Target Card</option>
            {creditCards.map(c => <option key={c.id} value={c.id}>{c.cardName} (Avail Limit: {currency} {((c.limit ?? 0) - c.currentBalance).toFixed(2)})</option>)}
          </select>
          {purchaseErrors.cardId && (
            <span className="text-rose-400 font-mono text-[9px] pl-0.5 mt-0.5 block">{purchaseErrors.cardId}</span>
          )}
        </div>

        <div className="sm:col-span-2 flex flex-col gap-1.5">
          <label className="text-[10px] text-zinc-500 font-bold uppercase font-mono block pl-0.5">Purchase billing Amount ({currency})</label>
          <input 
            ref={purchaseAmountRef}
            type="number" 
            placeholder="0.00" 
            value={purAmount} 
            onChange={e => {
              setPurAmount(e.target.value);
              validatePurchase(purCardId, e.target.value, purMerchant, purDesc, purchaseSubmitted);
            }} 
            className={`w-full bg-[#050510]/50 border text-xs text-white rounded-xl p-3 focus:outline-none font-mono font-black transition-all ${
              purchaseErrors.amount
                ? 'border-rose-500 focus:border-rose-500'
                : purAmount && !purchaseErrors.amount
                ? 'border-emerald-500 focus:border-emerald-500'
                : 'border-zinc-850 hover:border-zinc-700'
            }`} 
          />
          {purchaseErrors.amount && (
            <span className="text-rose-400 font-mono text-[9px] pl-0.5 mt-0.5 block">{purchaseErrors.amount}</span>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] text-zinc-500 font-bold uppercase font-mono block pl-0.5">Merchant Location</label>
          <input 
            ref={purchaseMerchantRef}
            placeholder="e.g. Uber, Amazon Premium, Local Cafe" 
            value={purMerchant} 
            onChange={e => {
              setPurMerchant(e.target.value);
              validatePurchase(purCardId, purAmount, e.target.value, purDesc, purchaseSubmitted);
            }} 
            className={`w-full bg-[#050510]/50 border text-xs text-white rounded-xl p-3 focus:outline-none transition-all font-semibold ${
              purchaseErrors.merchant
                ? 'border-rose-500 focus:border-rose-500'
                : purMerchant && !purchaseErrors.merchant
                ? 'border-emerald-500 focus:border-emerald-500'
                : 'border-zinc-850 hover:border-zinc-700'
            }`} 
          />
          {purchaseErrors.merchant && (
            <span className="text-rose-400 font-mono text-[9px] pl-0.5 mt-0.5 block">{purchaseErrors.merchant}</span>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] text-zinc-500 font-bold uppercase font-mono block pl-0.5">Reference descriptor</label>
          <input 
            placeholder="e.g. Business dinner, office supplies..." 
            value={purDesc} 
            onChange={e => {
              setPurDesc(e.target.value);
              validatePurchase(purCardId, purAmount, purMerchant, e.target.value, purchaseSubmitted);
            }} 
            className="w-full bg-[#050510]/50 border border-zinc-850 hover:border-zinc-700 text-white rounded-xl p-3 text-xs focus:outline-none focus:border-indigo-500 transition-all font-medium" 
          />
        </div>

        <button type="submit" className="sm:col-span-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/90 text-white font-mono font-bold uppercase tracking-wider text-[10.5px] py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg mt-2">
          <Plus size={14} className="stroke-[2.5px]" /> 
          Record verified Purchase
        </button>

      </form>

    </div>
  );
}
