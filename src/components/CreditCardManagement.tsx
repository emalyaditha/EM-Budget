import React, { useState, useMemo } from 'react';
import { CashAccount, BankCard, CreditCardPurchase, Transaction, CreditCardInstallment, CreditCardInstallmentPayment } from '../types';
import { CreditCard as CcIcon, Plus, CheckSquare, Lock, Unlock, Calendar, AlertTriangle, Clock, Receipt, ArrowUpRight, ChevronDown, ChevronUp, Repeat } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';
import { DatePicker } from './DatePicker';
import { todayLocal } from '../utils';
import InstallmentPlanModal from './InstallmentPlanModal';
import InstallmentSchedule from './InstallmentSchedule';

interface Props {
  creditCards: BankCard[];
  cashAccounts: CashAccount[];
  cards: BankCard[];
  currency: string;
  transactions: Transaction[];
  creditCardPurchases: CreditCardPurchase[];
  creditCardInstallments: CreditCardInstallment[];
  creditCardInstallmentPayments: CreditCardInstallmentPayment[];
  onPayCard: (cardId: string, amount: number, fromId: string, fromType: 'cash' | 'card') => void;
  onAddPurchase: (purchase: Omit<CreditCardPurchase, 'id'>) => void;
  onUpdateCard: (card: BankCard) => void;
  onCreateInstallmentPlan: (cardId: string, purchaseId: string, tenureMonths: 6 | 12 | 24 | 48) => void;
  onPayInstallmentPayment: (installmentId: string, paymentId: string, amount: number) => void;
}

function daysUntil(dateStr: string): number {
  if (!dateStr) return 0;
  const today = new Date(todayLocal());
  const due = new Date(dateStr);
  const diff = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

function calculateInterest(balance: number, apr: number, days: number): number {
  if (balance >= 0 || apr <= 0) return 0;
  const dailyRate = apr / 100 / 365;
  return Math.abs(balance) * dailyRate * days;
}

export default function CreditCardManagement({ creditCards, cashAccounts, cards, currency, transactions, creditCardPurchases, creditCardInstallments, creditCardInstallmentPayments, onPayCard, onAddPurchase, onUpdateCard, onCreateInstallmentPlan, onPayInstallmentPayment }: Props) {
  const { showToast } = useNotifications();
  const [payAmounts, setPayAmounts] = useState<Record<string,string>>({});
  const [paySources, setPaySources] = useState<Record<string,string>>({});
  const [payErrors, setPayErrors] = useState<Record<string,string>>({});
  const [purAmount, setPurAmount] = useState('');
  const [purDesc, setPurDesc] = useState('');
  const [purMerchant, setPurMerchant] = useState('');
  const [purCardId, setPurCardId] = useState('');
  const [purDate, setPurDate] = useState(()=> todayLocal());
  const [purchaseErrors, setPurchaseErrors] = useState<Record<string,string>>({});
  const [purchaseSubmitted, setPurchaseSubmitted] = useState(false);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState<Record<string, boolean>>({});
  const [installmentModalCard, setInstallmentModalCard] = useState<BankCard | null>(null);
  const [installmentModalPurchase, setInstallmentModalPurchase] = useState<CreditCardPurchase | null>(null);
  const purchaseCardRef = React.useRef<HTMLSelectElement>(null);
  const purchaseAmountRef = React.useRef<HTMLInputElement>(null);
  const purchaseMerchantRef = React.useRef<HTMLInputElement>(null);

  const fundingAccounts = [
    ...cashAccounts.map(c=>({id:c.id,name:c.name,type:'cash' as const,balance:c.balance,isFrozen:false})),
    ...cards.filter(c=>!c.isCanceled).map(c=>{const bal=c.cardType==='Credit'?((c.limit??0)+c.currentBalance):c.currentBalance; return {id:c.id,name:c.cardName,type:'card' as const,balance:bal,isFrozen:!!c.isFrozen};}),
  ];

  const validatePay=(cardId:string, amtStr:string, srcVal:string, skipAmountCheck=false):boolean=>{
    const card=creditCards.find(c=>c.id===cardId); if(!card) return false;
    if(!srcVal){ setPayErrors(p=>({...p,[cardId]:'Funding source required'})); return false; }
    const source=fundingAccounts.find(a=>`${a.type}-${a.id}`===srcVal);
    if(!source){ setPayErrors(p=>({...p,[cardId]:'Invalid source'})); return false; }
    if(source.isFrozen){ setPayErrors(p=>({...p,[cardId]:'Source is FROZEN'})); return false; }
    const sourceBalance=source.balance; const outstanding=card.currentBalance<0?Math.abs(card.currentBalance):0;
    if(!skipAmountCheck){
      if(!amtStr){ setPayErrors(p=>({...p,[cardId]:'Amount required'})); return false; }
      const amt=parseFloat(amtStr); if(isNaN(amt)){ setPayErrors(p=>({...p,[cardId]:'Must be a number'})); return false; }
      if(amt<=0){ setPayErrors(p=>({...p,[cardId]:'Must be positive'})); return false; }
      if(amt>outstanding){ setPayErrors(p=>({...p,[cardId]:`Cannot overpay — debt ${currency} ${outstanding.toFixed(2)}`})); return false; }
      if(amt>sourceBalance){ setPayErrors(p=>({...p,[cardId]:`Insufficient — avail ${currency} ${sourceBalance.toFixed(2)}`})); return false; }
    } else {
      if(outstanding<=0){ setPayErrors(p=>({...p,[cardId]:'No balance to settle'})); return false; }
      if(outstanding>sourceBalance){ setPayErrors(p=>({...p,[cardId]:`Insufficient for full — avail ${currency} ${sourceBalance.toFixed(2)}`})); return false; }
    }
    setPayErrors(p=>{const c={...p}; delete c[cardId]; return c;}); return true;
  };

  const validatePurchase=(cardId:string,amtStr:string,merchant:string,_desc:string,submitted:boolean):boolean=>{
    const errs:Record<string,string>={};
    if(submitted||cardId) if(!cardId) errs.cardId='Credit card required';
    if(submitted||amtStr){
      if(!amtStr) errs.amount='Amount required';
      else { const amt=parseFloat(amtStr); if(isNaN(amt)) errs.amount='Must be a number'; else if(amt<=0) errs.amount='Must be positive'; else if(cardId){ const card=creditCards.find(c=>c.id===cardId); if(card){ const avail=(card.limit??0)+card.currentBalance; if(amt>avail) errs.amount=`Exceeds avail ${currency} ${avail.toFixed(2)}`; } } }
    }
    if(submitted||merchant){ if(!merchant.trim()) errs.merchant='Merchant required'; else if(merchant.trim().length<2) errs.merchant='At least 2 chars'; else if(/[<>{}]/.test(merchant)) errs.merchant='Invalid chars'; }
    setPurchaseErrors(errs); return Object.keys(errs).length===0;
  };

  const handleAddPurchase=(e:React.FormEvent)=>{
    e.preventDefault(); setPurchaseSubmitted(true);
    const ok=validatePurchase(purCardId,purAmount,purMerchant,purDesc,true);
    if(!ok){ if(!purCardId) purchaseCardRef.current?.focus(); else if(!purAmount) purchaseAmountRef.current?.focus(); else purchaseMerchantRef.current?.focus(); showToast('error','Fix purchase errors.'); return; }
    onAddPurchase({ cardId:purCardId, amount:parseFloat(purAmount), description:purDesc, merchant:purMerchant, date:purDate });
    setPurAmount(''); setPurDesc(''); setPurMerchant(''); setPurDate(todayLocal()); setPurchaseSubmitted(false); setPurchaseErrors({}); showToast('success','Purchase recorded.');
  };

  const getCardPurchases = (cardId: string) => {
    return creditCardPurchases
      .filter(p => p.cardId === cardId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const getCardPayments = (cardId: string) => {
    const card = creditCards.find(c => c.id === cardId);
    return transactions
      .filter(t => t.type === 'debt_payment' && !!card && t.title === `Credit Card Settlement: ${card.cardName}`)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  return (
    <div className="space-y-6" id="credit-cards-vault">
      <div className="gradient-card p-5 md:p-6 overflow-hidden" style={{ background: 'var(--gradient-card-dark)' }}>
        <div className="flex items-center gap-3 pb-4 border-b border-white/10 relative z-10">
          <div className="w-8 h-8 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-white"><CcIcon size={14}/></div>
          <div>
            <span className="eyebrow !text-white/60">Credit ledger</span>
            <h3 className="text-[13px] font-bold tracking-tight text-white -mt-0.5">Credit Facilities</h3>
          </div>
          <span className="ml-auto pill !bg-white/10 !border-white/15 !text-white mono !text-[11px]">{creditCards.length} cards</span>
        </div>
        <div className="rainbow-bar mt-4 relative z-10 opacity-80" />

        <div className="mt-4 space-y-3">
          {creditCards.length===0 ? (
            <div className="empty"><p className="text-sm font-medium">No credit cards on record</p><p className="text-xs mt-1 text-[var(--ink-3)]">Add one in Cash & Cards.</p></div>
          ) : creditCards.map(c=>{
            const debt=c.currentBalance<0?Math.abs(c.currentBalance):0;
            const util=c.limit&&c.limit>0?Math.round((debt/c.limit)*100):0;
            const daysLeft = daysUntil(c.dueDate || '');
            const isOverdue = daysLeft < 0;
            const isDueSoon = daysLeft >= 0 && daysLeft <= 7;
            const monthlyInterest = calculateInterest(c.currentBalance, c.apr || 0, 30);
            const cardPurchases = getCardPurchases(c.id);
            const cardPayments = getCardPayments(c.id);
            const isExpanded = expandedCard === c.id;

            return (
              <div key={c.id} className="card p-4 space-y-3 !shadow-none border border-white/10 bg-white/[0.06]">
                {/* Card Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--line)]">
                  <div>
                    <h4 className="mono text-[13px] font-semibold text-[var(--ink)] flex items-center gap-2">
                      {c.cardName}
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink-2)]">{c.bankName}</span>
                    </h4>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="eyebrow normal-case tracking-normal">Utilization</span>
                      <span className={`mono text-[11px] font-bold ${util>80?'text-[var(--danger)]':'text-[var(--ink-2)]'}`}>{util}% used</span>
                      <div className="w-20 h-1 rounded-full bg-[var(--surface-2)] border border-[var(--line)] overflow-hidden hidden sm:block"><div className="h-full bg-[var(--ink)]" style={{width:`${util}%`}}/></div>
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <span className="eyebrow normal-case tracking-normal">Outstanding</span>
                    <span className="mono text-sm font-bold text-[var(--danger)] block">{currency}{debt.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
                  </div>
                </div>

                {/* Due Date & Interest Info */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className={`p-2 rounded-lg border ${isOverdue ? 'border-[var(--danger)] bg-[var(--danger)]/10' : isDueSoon ? 'border-amber-500 bg-amber-500/10' : 'border-[var(--line)] bg-[var(--surface)]'}`}>
                    <div className="flex items-center gap-1 mb-1">
                      <Calendar size={10} className={isOverdue ? 'text-[var(--danger)]' : isDueSoon ? 'text-amber-500' : 'text-[var(--ink-3)]'} />
                      <span className="eyebrow normal-case">{isOverdue ? 'Overdue' : 'Due in'}</span>
                    </div>
                    <span className={`mono font-bold ${isOverdue ? 'text-[var(--danger)]' : isDueSoon ? 'text-amber-500' : 'text-[var(--ink)]'}`}>
                      {isOverdue ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d`}
                    </span>
                    {c.dueDate && <span className="block text-[10px] text-[var(--ink-3)]">{c.dueDate}</span>}
                  </div>

                  <div className="p-2 rounded-lg border border-[var(--line)] bg-[var(--surface)]">
                    <div className="flex items-center gap-1 mb-1">
                      <AlertTriangle size={10} className="text-[var(--ink-3)]" />
                      <span className="eyebrow normal-case">Min. Payment</span>
                    </div>
                    <span className="mono font-bold text-[var(--ink)]">{currency}{(c.minPayment || 0).toLocaleString()}</span>
                  </div>

                  <div className="p-2 rounded-lg border border-[var(--line)] bg-[var(--surface)]">
                    <div className="flex items-center gap-1 mb-1">
                      <Clock size={10} className="text-[var(--ink-3)]" />
                      <span className="eyebrow normal-case">Est. Interest</span>
                    </div>
                    <span className="mono font-bold text-[var(--danger)]">{currency}{monthlyInterest.toFixed(2)}</span>
                    <span className="block text-[10px] text-[var(--ink-3)]">{c.apr || 0}% APR</span>
                  </div>

                  <div className="p-2 rounded-lg border border-[var(--line)] bg-[var(--surface)]">
                    <div className="flex items-center gap-1 mb-1">
                      <Receipt size={10} className="text-[var(--ink-3)]" />
                      <span className="eyebrow normal-case">Last Paid</span>
                    </div>
                    <span className="mono font-bold text-[var(--ink)]">{c.lastPaymentDate || '—'}</span>
                  </div>
                </div>

                {/* Credit Limit */}
                <div className="flex items-center gap-2">
                  <span className="eyebrow normal-case shrink-0">Limit</span>
                  <input type="number" value={c.limit??''} disabled={!!(c.isLimitLocked??true)} onChange={e=>{const v=parseFloat(e.target.value); onUpdateCard({...c,limit:isNaN(v)?undefined:v});}} onKeyDown={e=>{if(e.key==='Enter'){onUpdateCard({...c,isLimitLocked:true}); (e.target as HTMLInputElement).blur(); showToast('success',`Limit ${currency}${c.limit||0} locked.`);}}} className="input !py-1.5 !text-xs mono w-24 disabled:opacity-60" placeholder="Limit" />
                  <button type="button" onClick={()=>{const next=!(c.isLimitLocked??true); onUpdateCard({...c,isLimitLocked:next}); showToast(next?'success':"info", next?`Locked ${currency}${c.limit||0}`:'Unlocked — Enter to save');}} className="w-7 h-7 rounded-full border border-[var(--line)] bg-[var(--surface)] flex items-center justify-center text-[var(--ink-3)] hover:text-[var(--ink)]">{c.isLimitLocked??true?<Lock size={12}/>:<Unlock size={12}/>}</button>
                  <span className="ml-auto text-[11px] text-[var(--ink-3)]">Available: <span className="mono font-bold text-[var(--success)]">{currency}{((c.limit??0)+c.currentBalance).toLocaleString(undefined,{minimumFractionDigits:2})}</span></span>
                </div>

                {/* Payment Section */}
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input type="number" placeholder="Repay amount" value={payAmounts[c.id]||''} onChange={e=>{const v=e.target.value; setPayAmounts(p=>({...p,[c.id]:v})); validatePay(c.id,v,paySources[c.id]||'');}} className="input mono flex-1 !py-2.5 !text-xs" />
                    <select value={paySources[c.id]||''} onChange={e=>{const v=e.target.value; setPaySources(p=>({...p,[c.id]:v})); validatePay(c.id,payAmounts[c.id]||'',v);}} className="input flex-1 !py-2.5 !text-xs">
                      <option value="">Source</option>
                      {fundingAccounts.map(a=>(<option key={`${a.type}-${a.id}`} value={`${a.type}-${a.id}`} disabled={a.isFrozen}>{a.name}{a.isFrozen?' [FROZEN]':''}</option>))}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    {c.minPayment && c.minPayment > 0 && (
                      <button onClick={()=>{
                        const src=paySources[c.id]||''; if(!src){ setPayErrors(p=>({...p,[c.id]:'Select source'})); showToast('error','Select source'); return; }
                        const source=fundingAccounts.find(a=>`${a.type}-${a.id}`===src);
                        if(!source||source.isFrozen||source.balance<c.minPayment){ showToast('error',`Need ${currency}${c.minPayment} min`); return; }
                        const [t,...rest]=src.split('-'); const id=rest.join('-'); onPayCard(c.id, c.minPayment, id, t as any);
                        setPayAmounts(p=>{const cp={...p}; delete cp[c.id]; return cp;}); setPaySources(p=>{const cp={...p}; delete cp[c.id]; return cp;}); setPayErrors(p=>{const cp={...p}; delete cp[c.id]; return cp;});
                        showToast('success',`Paid ${currency}${c.minPayment} minimum`);
                      }} className="btn-ghost !text-[10px] !py-2 px-2 border border-[var(--line)]">Pay Min.</button>
                    )}
                    <button onClick={()=>{
                      const src=paySources[c.id]||''; if(!validatePay(c.id,'',src,true)){ showToast('error',payErrors[c.id]||'Select valid source'); return; }
                      const [t,...rest]=src.split('-'); const id=rest.join('-'); onPayCard(c.id, Math.abs(c.currentBalance), id, t as any);
                      setPayAmounts(p=>{const cp={...p}; delete cp[c.id]; return cp;}); setPaySources(p=>{const cp={...p}; delete cp[c.id]; return cp;}); setPayErrors(p=>{const cp={...p}; delete cp[c.id]; return cp;});
                    }} className="btn-primary flex-1 !text-xs !py-2.5">Settle full</button>
                    <button onClick={()=>{
                      const src=paySources[c.id]||''; const amt=payAmounts[c.id]||''; if(!validatePay(c.id,amt,src,false)){ showToast('error',payErrors[c.id]||'Enter amount & source'); return; }
                      const [t,...rest]=src.split('-'); const id=rest.join('-'); onPayCard(c.id, parseFloat(amt), id, t as any);
                      setPayAmounts(p=>{const cp={...p}; delete cp[c.id]; return cp;}); setPaySources(p=>{const cp={...p}; delete cp[c.id]; return cp;}); setPayErrors(p=>{const cp={...p}; delete cp[c.id]; return cp;});
                    }} className="btn-ghost w-10 !p-0 flex items-center justify-center shrink-0" title="Pay custom"><CheckSquare size={14}/></button>
                  </div>
                  {payErrors[c.id] && <span className="mono text-[11px] text-[var(--danger)] block text-right">{payErrors[c.id]}</span>}
                </div>

                {/* Purchase & Payment History Toggle */}
                <div className="flex gap-2 pt-2 border-t border-[var(--line)]">
                  <button onClick={()=>setShowHistory(p=>({...p,[`${c.id}-purchases`]:!p[`${c.id}-purchases`]}))} className="btn-ghost !text-[10px] flex items-center gap-1 flex-1">
                    <Receipt size={10}/> Purchases ({cardPurchases.length})
                    {showHistory[`${c.id}-purchases`] ? <ChevronUp size={10}/> : <ChevronDown size={10}/>}
                  </button>
                  <button onClick={()=>setShowHistory(p=>({...p,[`${c.id}-payments`]:!p[`${c.id}-payments`]}))} className="btn-ghost !text-[10px] flex items-center gap-1 flex-1">
                    <ArrowUpRight size={10}/> Payments ({cardPayments.length})
                    {showHistory[`${c.id}-payments`] ? <ChevronUp size={10}/> : <ChevronDown size={10}/>}
                  </button>
                </div>

                {/* Purchase History */}
                {showHistory[`${c.id}-purchases`] && (
                  <div className="space-y-1 max-h-48 overflow-y-auto scrollbar-none">
                    {cardPurchases.length === 0 ? (
                      <p className="text-[11px] text-[var(--ink-3)] text-center py-2">No purchases yet</p>
                    ) : cardPurchases.map(p => {
                      const hasInstallment = creditCardInstallments.some(inst => inst.purchaseId === p.id && inst.status === 'active');
                      return (
                        <div key={p.id} className="flex items-center justify-between py-1.5 px-2 rounded bg-[var(--surface)] text-[11px]">
                          <div className="flex-1 min-w-0">
                            <span className="font-medium text-[var(--ink)] block truncate">{p.merchant}</span>
                            {p.description && <span className="text-[var(--ink-3)] text-[10px] block truncate">{p.description}</span>}
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            {!hasInstallment && (
                              <button
                                onClick={() => {
                                  setInstallmentModalCard(c);
                                  setInstallmentModalPurchase(p);
                                }}
                                className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-[var(--line)] bg-[var(--surface)] text-[var(--ink-2)] hover:text-[var(--ink)] hover:border-[var(--ink-2)]"
                                title="Convert to installment plan"
                              >
                                <Repeat size={10} /> Installment
                              </button>
                            )}
                            {hasInstallment && (
                              <span className="text-[10px] px-2 py-1 rounded bg-[var(--ink)]/5 text-[var(--ink-2)] border border-[var(--line)]">
                                In plan
                              </span>
                            )}
                            <div className="text-right">
                              <span className="mono font-bold text-[var(--danger)]">-{currency}{p.amount.toFixed(2)}</span>
                              <span className="block text-[10px] text-[var(--ink-3)]">{p.date}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Active Installment Plans */}
                {creditCardInstallments.filter(inst => inst.cardId === c.id && inst.status === 'active').length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-[var(--line)]">
                    <span className="eyebrow normal-case flex items-center gap-1">
                      <Repeat size={10} /> Active Installment Plans
                    </span>
                    {creditCardInstallments
                      .filter(inst => inst.cardId === c.id && inst.status === 'active')
                      .map(inst => (
                        <InstallmentSchedule
                          key={inst.id}
                          installment={inst}
                          payments={creditCardInstallmentPayments.filter(p => p.installmentId === inst.id)}
                          purchase={creditCardPurchases.find(p => p.id === inst.purchaseId)}
                          currency={currency}
                          onPayPayment={onPayInstallmentPayment}
                        />
                      ))}
                  </div>
                )}

                {/* Payment History */}
                {showHistory[`${c.id}-payments`] && (
                  <div className="space-y-1 max-h-48 overflow-y-auto scrollbar-none">
                    {cardPayments.length === 0 ? (
                      <p className="text-[11px] text-[var(--ink-3)] text-center py-2">No payments yet</p>
                    ) : cardPayments.map(t => (
                      <div key={t.id} className="flex items-center justify-between py-1.5 px-2 rounded bg-[var(--surface)] text-[11px]">
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-[var(--ink)] block truncate">{t.title || 'Payment'}</span>
                          <span className="text-[var(--ink-3)] text-[10px] block truncate">{t.category}</span>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <span className="mono font-bold text-[var(--success)]">+{currency}{Math.abs(t.amount).toFixed(2)}</span>
                          <span className="block text-[10px] text-[var(--ink-3)]">{t.date}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Purchase Form */}
      <form onSubmit={handleAddPurchase} className="card p-5 md:p-6 space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-[var(--line)]">
          <span className="w-7 h-7 rounded-full bg-[var(--ink)] text-[var(--accent-fg)] grid place-items-center"><Plus size={12}/></span><span className="eyebrow">Record swipe / purchase</span>
        </div>
        <div className="rainbow-bar opacity-60" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2 flex flex-col gap-1.5"><label className="eyebrow normal-case">Credit account</label><select ref={purchaseCardRef} value={purCardId} onChange={e=>{setPurCardId(e.target.value); validatePurchase(e.target.value,purAmount,purMerchant,purDesc,purchaseSubmitted);}} className="input"><option value="">Select card</option>{creditCards.map(c=>(<option key={c.id} value={c.id}>{c.cardName} (Avail {currency}{((c.limit??0)+c.currentBalance).toFixed(2)})</option>))}</select>{purchaseErrors.cardId && <span className="mono text-[11px] text-[var(--danger)]">{purchaseErrors.cardId}</span>}</div>
          <div className="sm:col-span-2 flex flex-col gap-1.5"><label className="eyebrow normal-case">Amount ({currency})</label><input ref={purchaseAmountRef} type="number" placeholder="0.00" value={purAmount} onChange={e=>{setPurAmount(e.target.value); validatePurchase(purCardId,e.target.value,purMerchant,purDesc,purchaseSubmitted);}} className="input mono" />{purchaseErrors.amount && <span className="mono text-[11px] text-[var(--danger)]">{purchaseErrors.amount}</span>}</div>
          <div className="flex flex-col gap-1.5"><label className="eyebrow normal-case">Merchant</label><input ref={purchaseMerchantRef} placeholder="Uber, Amazon" value={purMerchant} onChange={e=>{setPurMerchant(e.target.value); validatePurchase(purCardId,purAmount,e.target.value,purDesc,purchaseSubmitted);}} className="input" />{purchaseErrors.merchant && <span className="mono text-[11px] text-[var(--danger)]">{purchaseErrors.merchant}</span>}</div>
          <div className="flex flex-col gap-1.5"><label className="eyebrow normal-case">Reference</label><input placeholder="Business dinner" value={purDesc} onChange={e=>setPurDesc(e.target.value)} className="input" /></div>
          <div className="flex flex-col gap-1.5"><label className="eyebrow normal-case">Date</label><DatePicker value={purDate} onChange={setPurDate} /></div>
        </div>
        <button type="submit" className="btn-primary w-full flex items-center justify-center gap-2"><Plus size={14}/>Record purchase</button>
      </form>

      {/* Installment Plan Modal */}
      {installmentModalCard && installmentModalPurchase && (
        <InstallmentPlanModal
          isOpen={!!installmentModalCard && !!installmentModalPurchase}
          onClose={() => {
            setInstallmentModalCard(null);
            setInstallmentModalPurchase(null);
          }}
          card={installmentModalCard}
          purchase={installmentModalPurchase}
          currency={currency}
          onConfirm={(tenureMonths) => {
            onCreateInstallmentPlan(installmentModalCard.id, installmentModalPurchase.id, tenureMonths);
            setInstallmentModalCard(null);
            setInstallmentModalPurchase(null);
          }}
        />
      )}
    </div>
  );
}
