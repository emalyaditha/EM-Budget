import React, { useState } from 'react';
import { CashAccount, BankCard, CategoryIncome, CategoryExpense } from '../types';
import { PlusCircle, MinusCircle, Sparkles } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';
import { DatePicker } from './DatePicker';
import ReceiptScanner from './ReceiptScanner';
import { todayLocal } from '../utils';

interface InflowsOutflowsProps {
  cashAccounts: CashAccount[];
  cards: BankCard[];
  onAddIncome: (amount: number, date: string, source: string, category: CategoryIncome, targetId: string, targetType: 'cash' | 'card') => void;
  onAddExpense: (title: string, description: string, amount: number, date: string, category: CategoryExpense, paymentMethodId: string, paymentMethodType: 'cash' | 'card', bankCharge?: number) => void;
  currency: string;
}

export default function InflowsOutflows({ cashAccounts, cards, onAddIncome, onAddExpense, currency }: InflowsOutflowsProps) {
  const { showToast } = useNotifications();
  const [toggleForm, setToggleForm] = useState<'income'|'expense'>('income');
  const [incAmount, setIncAmount] = useState('');
  const [incSource, setIncSource] = useState('');
  const [incCategory, setIncCategory] = useState<CategoryIncome>('Salary');
  const [incTargetId, setIncTargetId] = useState('');
  const [incTargetType, setIncTargetType] = useState<'cash'|'card'>('cash');
  const [incDate, setIncDate] = useState(()=> todayLocal());
  const [expTitle, setExpTitle] = useState('');
  const [expDesc, setExpDesc] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expCategory, setExpCategory] = useState<CategoryExpense>('Utilities');
  const [expMethodId, setExpMethodId] = useState('');
  const [expMethodType, setExpMethodType] = useState<'cash'|'card'>('cash');
  const [expDate, setExpDate] = useState(()=> todayLocal());
  const [expBankCharge, setExpBankCharge] = useState('');
  const [insufficiencyError, setInsufficiencyError] = useState<string|null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [incErrors, setIncErrors] = useState<Record<string,string>>({});
  const [incSubmitted, setIncSubmitted] = useState(false);
  const [expErrors, setExpErrors] = useState<Record<string,string>>({});
  const [expSubmitted, setExpSubmitted] = useState(false);
  const incSourceRef = React.useRef<HTMLInputElement>(null);
  const incAmountRef = React.useRef<HTMLInputElement>(null);
  const incTargetRef = React.useRef<HTMLSelectElement>(null);
  const expTitleRef = React.useRef<HTMLInputElement>(null);
  const expAmountRef = React.useRef<HTMLInputElement>(null);
  const expTargetRef = React.useRef<HTMLSelectElement>(null);

  React.useEffect(()=>{
    if(cashAccounts.length>0 && !incTargetId){ setIncTargetId(cashAccounts[0].id); setIncTargetType('cash'); }
    else if(cards.length>0 && !incTargetId){ setIncTargetId(cards[0].id); setIncTargetType('card'); }
    if(cashAccounts.length>0 && !expMethodId){ setExpMethodId(cashAccounts[0].id); setExpMethodType('cash'); }
    else if(cards.length>0 && !expMethodId){ setExpMethodId(cards[0].id); setExpMethodType('card'); }
  },[cashAccounts,cards,incTargetId,expMethodId]);

  const validateIncome=(source:string,amtStr:string,target:string,sub:boolean)=>{
    const errs:Record<string,string>={};
    if(sub||source){ if(!source.trim()) errs.source='Source required'; else if(source.trim().length<3) errs.source='At least 3 chars'; else if(/[<>{}]/.test(source)) errs.source='Invalid chars'; }
    if(sub||amtStr){ if(!amtStr) errs.amount='Amount required'; else { const n=parseFloat(amtStr); if(isNaN(n)) errs.amount='Must be a number'; else if(n<=0) errs.amount='Must be positive'; } }
    if(sub||target){ if(!target) errs.target='Target required'; else { const [id,type]=target.split(':'); if(type==='card'){ const m=cards.find(c=>c.id===id); if(m&&m.isFrozen) errs.target='Card is FROZEN'; } } }
    setIncErrors(errs); return Object.keys(errs).length===0;
  };
  const validateExpense=(title:string,_desc:string,amtStr:string,methodId:string,methodType:'cash'|'card',sub:boolean)=>{
    const errs:Record<string,string>={};
    if(sub||title){ if(!title.trim()) errs.title='Title required'; else if(title.trim().length<3) errs.title='At least 3 chars'; else if(/[<>{}]/.test(title)) errs.title='Invalid chars'; }
    if(sub||amtStr){
      if(!amtStr) errs.amount='Amount required';
      else { const n=parseFloat(amtStr); const charge=expMethodType==='card'?(parseFloat(expBankCharge)||0):0;
        if(isNaN(n)) errs.amount='Must be a number'; else if(n<=0) errs.amount='Must be positive';
        else if(methodId){ let avail=0; if(methodType==='cash'){ const m=cashAccounts.find(c=>c.id===methodId); avail=m?m.balance:0; } else { const m=cards.find(c=>c.id===methodId); if(m) avail=m.cardType==='Credit'?((m.limit??0)+m.currentBalance):m.currentBalance; } if(avail < n+charge) errs.amount=`Insufficient — need ${currency} ${(n+charge).toLocaleString()}, avail ${currency} ${avail.toLocaleString()}`; }
      }
    }
    if(sub||methodId){ if(!methodId) errs.methodId='Source required'; else if(methodType==='card'){ const m=cards.find(c=>c.id===methodId); if(m&&m.isFrozen) errs.methodId='Card is FROZEN'; } }
    setExpErrors(errs); return Object.keys(errs).length===0;
  };
  const handleIncomeSubmit=async(e:React.FormEvent)=>{
    e.preventDefault(); setIncSubmitted(true);
    const targetComp=incTargetId?`${incTargetId}:${incTargetType}`:'';
    if(!validateIncome(incSource,incAmount,targetComp,true)){ if(!incSource.trim()) incSourceRef.current?.focus(); else if(!incAmount) incAmountRef.current?.focus(); else incTargetRef.current?.focus(); showToast('error','Fix inflow errors.'); return; }
    setIsProcessing(true);
    try{ await onAddIncome(parseFloat(incAmount),incDate,incSource||'Inflow',incCategory,incTargetId,incTargetType); setIncAmount(''); setIncSource(''); setIncCategory('Salary'); setIncSubmitted(false); setIncErrors({}); showToast('success','Inflow recorded.'); } catch{ showToast('error','Failed to add income.'); } finally{ setIsProcessing(false); }
  };
  const handleExpenseSubmit=async(e:React.FormEvent)=>{
    e.preventDefault(); setExpSubmitted(true); setInsufficiencyError(null);
    if(!validateExpense(expTitle,expDesc,expAmount,expMethodId,expMethodType,true)){ if(!expTitle.trim()) expTitleRef.current?.focus(); else if(!expAmount) expAmountRef.current?.focus(); else expTargetRef.current?.focus(); showToast('error','Fix outflow errors.'); return; }
    setIsProcessing(true);
    try{ await onAddExpense(expTitle||'Invoice',expDesc||'Charge',parseFloat(expAmount),expDate,expCategory,expMethodId,expMethodType,expMethodType==='card'?(parseFloat(expBankCharge)||0):0); setExpAmount(''); setExpTitle(''); setExpDesc(''); setExpBankCharge(''); setExpSubmitted(false); setExpErrors({}); showToast('success','Outflow settled.'); } catch{ showToast('error','Failed to add expense.'); } finally{ setIsProcessing(false); }
  };
  const handleSelectTargetAccount=(value:string)=>{ const [id,type]=value.split(':'); setIncTargetId(id); setIncTargetType(type as any); if(incSubmitted) validateIncome(incSource,incAmount,value,true); };
  const handleSelectPaymentMethod=(value:string)=>{ const [id,type]=value.split(':'); setExpMethodId(id); setExpMethodType(type as any); setInsufficiencyError(null); if(expSubmitted) validateExpense(expTitle,expDesc,expAmount,id,type as any,true); };
  const handleScanSuccess=(data:{transactionType:'income'|'expense';title:string;amount:number;date:string;category:string;description:string;bankCharge?:number})=>{
    if(data.transactionType==='income'){ setToggleForm('income'); setIncSource(data.title||''); setIncAmount(data.amount?data.amount.toString():''); const cats:CategoryIncome[]=['Salary','Freelance','Business','Bonus','Commission','Other']; setIncCategory(cats.find(c=>c.toLowerCase()===data.category.toLowerCase())||'Other'); if(data.date) setIncDate(data.date); }
    else { setToggleForm('expense'); setExpTitle(data.title||''); setExpDesc(data.description||''); setExpAmount(data.amount?data.amount.toString():''); const cats:CategoryExpense[]=['Food','Transport','Shopping','Utilities','Rent','Entertainment','Medical','Education','Insurance','Other']; setExpCategory(cats.find(c=>c.toLowerCase()===data.category.toLowerCase())||'Other'); if(data.date) setExpDate(data.date); if(data.bankCharge) setExpBankCharge(data.bankCharge.toString()); }
  };

  return (
    <div id="inflows-outflows-view" className="space-y-5">
      {/* Pill toggle — Aivo $126k pills */}
      <div className="flex gap-2 p-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] w-fit shadow-sm">
        <button onClick={()=>{setToggleForm('income'); setInsufficiencyError(null);}} className={`pill !py-2 !px-5 text-xs font-bold flex items-center gap-1.5 border-transparent ${toggleForm==='income'?'pill-active !border-[var(--ink)]':'!bg-transparent hover:!bg-[var(--surface-2)]'}`}><PlusCircle size={14}/>Inflow</button>
        <button onClick={()=>setToggleForm('expense')} className={`pill !py-2 !px-5 text-xs font-bold flex items-center gap-1.5 border-transparent ${toggleForm==='expense'?'pill-active !border-[var(--ink)]':'!bg-transparent hover:!bg-[var(--surface-2)]'}`}><MinusCircle size={14}/>Outflow</button>
      </div>

      <ReceiptScanner onScanSuccess={handleScanSuccess} currency={currency} />

      <div className="card p-5 md:p-6 relative overflow-hidden">
        <div className="rainbow-bar absolute top-0 left-0 right-0 !h-1 opacity-80" />
        <div className="absolute top-0 right-0 p-4 text-[var(--line)] pointer-events-none">
          <Sparkles size={48} strokeWidth={1} />
        </div>

        {toggleForm==='income' ? (
          <form onSubmit={handleIncomeSubmit} className="space-y-5" id="log-income-form">
            <div><span className="eyebrow">Capture inflow</span><p className="text-xs text-[var(--ink-2)] mt-1">Record money in — salary, freelance, business.</p></div>
            <div className="ledger-rule" />
            <div className="flex flex-col gap-1.5">
              <label className="eyebrow normal-case tracking-normal">Source</label>
              <input ref={incSourceRef} type="text" placeholder="Freelance consulting" value={incSource} onChange={e=>{setIncSource(e.target.value); validateIncome(e.target.value,incAmount,incTargetId?`${incTargetId}:${incTargetType}`:'',incSubmitted);}} className="input" />
              {incErrors.source && <span className="mono text-[11px] text-[var(--danger)]">{incErrors.source}</span>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5"><label className="eyebrow normal-case">Amount ({currency})</label><input ref={incAmountRef} type="number" placeholder="0.00" value={incAmount} onChange={e=>{setIncAmount(e.target.value); validateIncome(incSource,e.target.value,incTargetId?`${incTargetId}:${incTargetType}`:'',incSubmitted);}} className="input mono" />{incErrors.amount && <span className="mono text-[11px] text-[var(--danger)]">{incErrors.amount}</span>}</div>
              <div className="flex flex-col gap-1.5"><label className="eyebrow normal-case">Category</label><select value={incCategory} onChange={e=>setIncCategory(e.target.value as any)} className="input"><option value="Salary">Salary</option><option value="Freelance">Freelance</option><option value="Business">Business</option><option value="Bonus">Bonus</option><option value="Commission">Commission</option><option value="Other">Other</option></select></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5"><label className="eyebrow normal-case">Date</label><DatePicker value={incDate} onChange={setIncDate} required /></div>
              <div className="flex flex-col gap-1.5"><label className="eyebrow normal-case">Destination</label>
                <select ref={incTargetRef} value={incTargetId?`${incTargetId}:${incTargetType}`:''} onChange={e=>handleSelectTargetAccount(e.target.value)} className="input">
                  <option value="">Select target</option>
                  <optgroup label="Cash">{cashAccounts.map(c=>(<option key={c.id} value={`${c.id}:cash`}>{c.name} ({currency}{c.balance.toLocaleString()})</option>))}</optgroup>
                  <optgroup label="Cards">{cards.filter(c=>!c.isCanceled).map(card=>(<option key={card.id} value={`${card.id}:card`} disabled={card.isFrozen}>{card.bankName} — {card.cardName}{card.isFrozen?' [FROZEN]':''}</option>))}</optgroup>
                </select>
                {incErrors.target && <span className="mono text-[11px] text-[var(--danger)]">{incErrors.target}</span>}
              </div>
            </div>
            <button type="submit" disabled={isProcessing} className="w-full flex items-center justify-center gap-2 disabled:opacity-50 text-white font-bold text-[13px] py-3 rounded-full" style={{ background: 'var(--gradient-card-dark)', color: 'white' }}><PlusCircle size={14}/>{isProcessing?'Processing…':'Record inflow'}</button>
          </form>
        ) : (
          <form onSubmit={handleExpenseSubmit} className="space-y-5" id="log-expense-form">
            <div><span className="eyebrow">Settle outflow</span><p className="text-xs text-[var(--ink-2)] mt-1">Log money out — bills, shopping, rent.</p></div>
            <div className="ledger-rule" />
            <div className="flex flex-col gap-1.5"><label className="eyebrow normal-case">Title</label><input ref={expTitleRef} type="text" placeholder="Electric bill" value={expTitle} onChange={e=>{setExpTitle(e.target.value); validateExpense(e.target.value,expDesc,expAmount,expMethodId,expMethodType,expSubmitted);}} className="input" />{expErrors.title && <span className="mono text-[11px] text-[var(--danger)]">{expErrors.title}</span>}</div>
            <div className="flex flex-col gap-1.5"><label className="eyebrow normal-case">Remarks <span className="text-[var(--ink-3)] font-normal">(optional)</span></label><input type="text" placeholder="Ref #8291" value={expDesc} onChange={e=>setExpDesc(e.target.value)} className="input" /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5"><label className="eyebrow normal-case">Amount ({currency})</label><input ref={expAmountRef} type="number" placeholder="0.00" value={expAmount} onChange={e=>{setExpAmount(e.target.value); setInsufficiencyError(null); validateExpense(expTitle,expDesc,e.target.value,expMethodId,expMethodType,expSubmitted);}} className="input mono" />{expErrors.amount && <span className="mono text-[11px] text-[var(--danger)]">{expErrors.amount}</span>}</div>
              <div className="flex flex-col gap-1.5"><label className="eyebrow normal-case">Category</label><select value={expCategory} onChange={e=>setExpCategory(e.target.value as any)} className="input"><option value="Food">Food</option><option value="Transport">Transport</option><option value="Shopping">Shopping</option><option value="Utilities">Utilities</option><option value="Rent">Rent</option><option value="Entertainment">Entertainment</option><option value="Medical">Medical</option><option value="Education">Education</option><option value="Insurance">Insurance</option><option value="Other">Other</option></select></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5"><label className="eyebrow normal-case">Date</label><DatePicker value={expDate} onChange={setExpDate} required /></div>
              <div className="flex flex-col gap-1.5"><label className="eyebrow normal-case">Deduct from</label>
                <select ref={expTargetRef} value={expMethodId?`${expMethodId}:${expMethodType}`:''} onChange={e=>handleSelectPaymentMethod(e.target.value)} className="input">
                  <option value="">Select source</option>
                  <optgroup label="Cash">{cashAccounts.map(c=>(<option key={c.id} value={`${c.id}:cash`}>{c.name} ({currency}{c.balance.toLocaleString()})</option>))}</optgroup>
                  <optgroup label="Cards">{cards.filter(c=>!c.isCanceled).map(card=>(<option key={card.id} value={`${card.id}:card`} disabled={card.isFrozen}>{card.bankName} — {card.cardName}{card.isFrozen?' [FROZEN]':''}</option>))}</optgroup>
                </select>
                {expErrors.methodId && <span className="mono text-[11px] text-[var(--danger)]">{expErrors.methodId}</span>}
                {expMethodType==='card' && expMethodId && (
                  <div className="card-flat p-3 bg-[var(--surface-2)] space-y-1.5">
                    <label className="eyebrow normal-case text-[11px]">Bank charge ({currency})</label>
                    <input type="number" step="any" placeholder="0 — optional" value={expBankCharge} onChange={e=>{setExpBankCharge(e.target.value); setInsufficiencyError(null); validateExpense(expTitle,expDesc,expAmount,expMethodId,expMethodType,expSubmitted);}} className="input mono !py-2 !text-xs" />
                    <p className="mono text-[10px] text-[var(--ink-3)]">Added to amount when deducting.</p>
                  </div>
                )}
              </div>
            </div>
            {insufficiencyError && <div className="p-3 rounded-[12px] border border-[var(--danger)]/20 bg-[var(--danger-bg)] text-[var(--danger)] text-xs mono">{insufficiencyError}</div>}
            <button type="submit" disabled={isProcessing} className="w-full flex items-center justify-center gap-2 disabled:opacity-50 text-white font-bold text-[13px] py-3 rounded-full" style={{ background: 'var(--gradient-card-orange)' }}><MinusCircle size={14}/>{isProcessing?'Processing…':'Settle outflow'}</button>
          </form>
        )}
      </div>
      <p className="text-center mono text-[11px] text-[var(--ink-3)]">Balances sync instantly to the ledger.</p>
    </div>
  );
}
