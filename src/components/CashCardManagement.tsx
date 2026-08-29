import React, { useState } from 'react';
import { CashAccount, BankCard, Charge } from '../types';
import { Plus, Trash2, Edit, Wallet, CreditCard, ChevronDown, CornerDownRight, Snowflake, RefreshCw, Lock } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';
import { DatePicker } from './DatePicker';

interface CashCardManagementProps {
  cashAccounts: CashAccount[];
  cards: BankCard[];
  onAddCashAccount: (name: string, balance: number) => void;
  onEditCashAccount: (id: string, newBalance: number) => void;
  onAddCard: (card: Omit<BankCard, 'id'>) => void;
  onDeleteCard: (id: string) => void;
  onDeleteCashAccount: (id: string) => void;
  currency: string;
  onUpdateCard: (card: BankCard) => void;
  onApplyCardCharge?: (cardId: string, charge: any) => void;
  onDeleteCardCharge?: (cardId: string, chargeId: string) => void;
}

interface InteractiveBankCardProps {
  card: BankCard;
  idx: number;
  currency: string;
  onUpdateCard: (card: BankCard) => void;
  onDeleteCard: (id: string) => void;
  getCardGradient: (theme: string) => string;
  setEditingCard: (card: BankCard | null) => void;
  setEditCardName: (name: string) => void;
  setEditCardNumber: (num: string) => void;
  setEditCardTheme: (theme: string) => void;
  setEditCardErrors: (errs: Record<string, string>) => void;
  setEditCardSubmitted: (sub: boolean) => void;
  onApplyCardCharge?: (cardId: string, charge: any) => void;
  onDeleteCardCharge?: (cardId: string, chargeId: string) => void;
  setEditCardLockedAmount?: (val: string) => void;
  onClick?: () => void;
}

function themeAccent(theme: string): string {
  const map: Record<string,string> = {
    sapphire:'#3B82F6', blue:'#0EA5E9', emerald:'#10B981', copper:'#D97706',
    ruby:'#E11D48', amethyst:'#8B5CF6', amber:'#F59E0B', silver:'#A1A1AA',
    slate:'#64748B', graphite:'#52525B', obsidian:'var(--line)'
  };
  return map[theme] || 'var(--line)';
}

function InteractiveBankCard({
  card, idx, currency, onUpdateCard, onDeleteCard,
  setEditingCard, setEditCardName, setEditCardNumber, setEditCardTheme, setEditCardErrors, setEditCardSubmitted, setEditCardLockedAmount, onClick,
}: InteractiveBankCardProps) {
  const { showToast } = useNotifications();
  const derivedThemes = ['obsidian','sapphire','blue','emerald','copper','ruby','amethyst','amber','silver','slate','graphite'];
  const derivedTheme = card.cardTheme || derivedThemes[idx % derivedThemes.length];
  const isCanceled = card.isCanceled || (card as any).is_canceled;
  const accent = themeAccent(derivedTheme);
  const isBorderAccent = derivedTheme !== 'obsidian';

  return (
    <div
      id={`card-view-${card.id}`}
      onClick={onClick}
      className={`relative flex flex-col justify-between h-[168px] p-5 card overflow-hidden cursor-pointer ${isCanceled ? 'opacity-50 grayscale' : ''}`}
      style={isBorderAccent ? { borderLeft: `3px solid ${accent}` } as React.CSSProperties : undefined}
    >
      {card.isFrozen && !isCanceled && (
        <div className="absolute inset-0 z-10 bg-[var(--surface)]/85 backdrop-blur-[6px] flex flex-col items-center justify-center rounded-[16px]">
          <div className="w-9 h-9 rounded-full border border-[var(--line)] bg-[var(--surface-2)] flex items-center justify-center text-[var(--ink-2)]">
            <Snowflake size={16} />
          </div>
          <span className="eyebrow mt-2">TEMP FROZEN</span>
          <button
            onClick={(e)=>{e.stopPropagation(); onUpdateCard({ ...card, isFrozen:false }); showToast('success', `${card.cardName} unfrozen.`);}}
            className="btn-ghost mt-3 !py-1.5 !text-xs flex items-center gap-1.5"
          ><Snowflake size={12}/>Unfreeze</button>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-start">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="eyebrow truncate">{card.bankName}</span>
            <span className="w-1 h-1 rounded-full bg-[var(--line-strong)] shrink-0" />
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border border-[var(--line)] text-[var(--ink-2)]">{card.cardType}</span>
          </div>
          <h4 className="mono font-semibold text-[14px] tracking-tight text-[var(--ink)] mt-1 truncate max-w-[170px]">{card.cardName}</h4>
        </div>
        {!isCanceled && !card.isFrozen && (
          <div className="flex gap-1.5 shrink-0">
            <button onClick={(e)=>{e.stopPropagation(); setEditingCard(card); setEditCardName(card.cardName); setEditCardNumber(card.cardNumber ? card.cardNumber.replace(/\*/g,'').trim():''); setEditCardTheme(derivedTheme); setEditCardErrors({}); setEditCardSubmitted(false); setEditCardLockedAmount?.(card.lockedAmount?.toString()||'0');}} className="btn-ghost !px-2.5 !py-1 !text-[11px] flex items-center gap-1"><Edit size={11}/>Edit</button>
            <button onClick={(e)=>{e.stopPropagation(); onUpdateCard({ ...card, isFrozen:true }); showToast('warning', `${card.cardName} frozen.`);}} className="btn-ghost !px-2.5 !py-1 !text-[11px] flex items-center gap-1"><Snowflake size={11}/>Freeze</button>
          </div>
        )}
      </div>

      {/* Chip + number row */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-[26px] rounded-[4px] border border-[var(--line)] bg-[var(--surface-2)] flex items-center justify-center relative overflow-hidden shrink-0">
          <div className="absolute left-[30%] top-0 bottom-0 w-px bg-[var(--line)]" />
          <div className="absolute top-1/2 left-0 right-0 h-px bg-[var(--line)]" />
          <div className="w-3 h-3 rounded-[2px] border border-[var(--line-strong)]/60" />
        </div>
        <span className="mono text-[12px] tracking-[0.18em] text-[var(--ink-2)] font-medium">{card.cardNumber ? card.cardNumber : '•••• •••• •••• 1234'}</span>
      </div>

      {/* Balance */}
      <div className="flex justify-between items-end">
        <div>
          <span className="eyebrow block">{card.cardType==='Credit' ? 'Available Limit' : 'Balance'}</span>
          <span className="mono text-[20px] font-bold tracking-tight text-[var(--ink)] leading-none mt-0.5 block tabular-nums">
            {currency}{(card.cardType==='Credit' ? ((card.limit??0)+card.currentBalance) : (card.currentBalance - (card.lockedAmount??0))).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
          </span>
          {card.cardType==='Debit' && card.lockedAmount! >0 && (
            <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300"><Lock size={9}/>{currency}{card.lockedAmount.toLocaleString()} locked</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isCanceled && <button onClick={(e)=>{e.stopPropagation(); onDeleteCard(card.id);}} className="w-7 h-7 rounded-full border border-[var(--line)] bg-[var(--surface)] flex items-center justify-center text-[var(--ink-3)] hover:text-[var(--danger)] hover:border-[var(--danger)]/30 transition-colors" title="Delete"><Trash2 size={11}/></button>}
          <div className="hidden sm:flex -space-x-1.5">
            <span className="w-4 h-4 rounded-full border border-[var(--line)] bg-[var(--surface-2)]" />
            <span className="w-4 h-4 rounded-full border border-[var(--line)] bg-[var(--surface-2)]" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CashCardManagement({
  cashAccounts, cards, onAddCashAccount, onEditCashAccount, onAddCard, onDeleteCard, onDeleteCashAccount, currency, onUpdateCard, onApplyCardCharge, onDeleteCardCharge,
}: CashCardManagementProps) {
  const { showToast, showConfirm } = useNotifications();
  const [cashName, setCashName] = useState('');
  const [cashBalance, setCashBalance] = useState('');
  const [cashErrors, setCashErrors] = useState<Record<string,string>>({});
  const [cashSubmitted, setCashSubmitted] = useState(false);
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [cardName, setCardName] = useState('');
  const [bankName, setBankName] = useState('');
  const [cardType, setCardType] = useState<'Debit'|'Credit'>('Debit');
  const [cardBalance, setCardBalance] = useState('');
  const [cardLimit, setCardLimit] = useState('50000');
  const [cardNumber, setCardNumber] = useState('');
  const [cardTheme, setCardTheme] = useState('obsidian');
  const [cardLockedAmount, setCardLockedAmount] = useState('');
  const [cardErrors, setCardErrors] = useState<Record<string,string>>({});
  const [cardSubmitted, setCardSubmitted] = useState(false);
  const [editingCard, setEditingCard] = useState<BankCard|null>(null);
  const [editCardName, setEditCardName] = useState('');
  const [editCardNumber, setEditCardNumber] = useState('');
  const [editCardLockedAmount, setEditCardLockedAmount] = useState('0');
  const [editCardTheme, setEditCardTheme] = useState('obsidian');
  const [editCardErrors, setEditCardErrors] = useState<Record<string,string>>({});
  const [editCardSubmitted, setEditCardSubmitted] = useState(false);
  const [showCanceled, setShowCanceled] = useState(false);
  const [expandedCardIds, setExpandedCardIds] = useState<Record<string,boolean>>({});
  const [chargeType, setChargeType] = useState<'Interest'|'LatePayment'|'OverLimit'|'Annual'|'Custom'>('Interest');
  const [chargeName, setChargeName] = useState('Interest Charge');
  const [chargeAmount, setChargeAmount] = useState('');
  const [chargeDate, setChargeDate] = useState(new Date().toISOString().split('T')[0]);
  const [chargeDescription, setChargeDescription] = useState('');
  const [chargeRecurring, setChargeRecurring] = useState<'none'|'Monthly'|'Yearly'|'Custom'>('none');
  const CHARGE_DEFAULT_NAMES: Record<string,string> = { Interest:'Interest Charge', LatePayment:'Late Payment Fee', OverLimit:'Over-Limit Fee', Annual:'Annual Fee', Custom:'Custom Charge' };
  const [selectedCashId, setSelectedCashId] = useState<string|null>(null);
  const [qtyAction, setQtyAction] = useState('');
  const [actionType, setActionType] = useState<'deposit'|'withdraw'|null>(null);
  const [quickErrors, setQuickErrors] = useState<Record<string,string>>({});
  const [quickSubmitted, setQuickSubmitted] = useState(false);
  const cashNameInputRef = React.useRef<HTMLInputElement>(null);
  const cashBalanceInputRef = React.useRef<HTMLInputElement>(null);
  const cardNameInputRef = React.useRef<HTMLInputElement>(null);
  const bankNameInputRef = React.useRef<HTMLInputElement>(null);
  const cardBalanceInputRef = React.useRef<HTMLInputElement>(null);
  const cardNumberInputRef = React.useRef<HTMLInputElement>(null);
  const qtyActionInputRef = React.useRef<HTMLInputElement>(null);
  const [cardToDelete] = useState<string|null>(null);

  const vaultTotal = cashAccounts.reduce((s,a)=>s+(a.balance||0),0);

  const validateCash = (name:string,balance:string,submitted:boolean)=>{
    const errs:Record<string,string>={};
    if(submitted||name){
      if(!name.trim()) errs.name='Account name is required';
      else if(name.trim().length<3) errs.name='At least 3 characters';
      else if(cashAccounts.some(acc=>acc.name.toLowerCase().trim()===name.toLowerCase().trim())) errs.name='Name already exists';
      else if(/[<>{}]/.test(name)) errs.name='Invalid characters';
    }
    if(submitted||balance){
      if(balance==='') errs.balance='Starting amount is required';
      else { const n=parseFloat(balance); if(isNaN(n)) errs.balance='Must be a number'; else if(n<0) errs.balance='Cannot be negative'; }
    }
    setCashErrors(errs); return Object.keys(errs).length===0;
  };
  const validateCard = (name:string,bank:string,balance:string,numStr:string,submitted:boolean)=>{
    const errs:Record<string,string>={};
    if(submitted||name){
      if(!name.trim()) errs.name='Card nickname is required';
      else if(name.trim().length<3) errs.name='At least 3 characters';
      else if(cards.some(c=>c.cardName.toLowerCase().trim()===name.toLowerCase().trim())) errs.name='Card name exists';
      else if(/[<>{}]/.test(name)) errs.name='Invalid characters';
    }
    if(submitted||bank){
      if(!bank.trim()) errs.bank='Bank issuer is required';
      else if(bank.trim().length<2) errs.bank='At least 2 characters';
      else if(/[<>{}]/.test(bank)) errs.bank='Invalid characters';
    }
    if(submitted||balance){
      if(balance==='') errs.balance='Starting balance is required';
      else { const amt=parseFloat(balance); if(isNaN(amt)) errs.balance='Must be a number'; else if(amt<0) errs.balance='Cannot be negative'; }
    }
    if(numStr){ const c=numStr.replace(/\s+/g,''); if(c && !/^\d+$/.test(c)) errs.number='Digits only'; else if(c && (c.length<8||c.length>19)) errs.number='8–19 digits'; }
    setCardErrors(errs); return Object.keys(errs).length===0;
  };
  const validateQuick = (qty:string,sub:boolean)=>{
    const errs:Record<string,string>={};
    if(sub||qty){
      if(!qty) errs.qty='Amount is required';
      else { const n=parseFloat(qty); if(isNaN(n)) errs.qty='Must be a number'; else if(n<=0) errs.qty='Must be positive'; else if(actionType==='withdraw'&&selectedCashId){ const acc=cashAccounts.find(c=>c.id===selectedCashId); if(acc&&acc.balance<n) errs.qty=`Insufficient — avail ${currency} ${acc.balance.toLocaleString()}`; } }
    }
    setQuickErrors(errs); return Object.keys(errs).length===0;
  };
  const handleCreateCash=(e:React.FormEvent)=>{
    e.preventDefault(); setCashSubmitted(true);
    const ok=validateCash(cashName,cashBalance,true);
    if(!ok){ if(!cashName.trim()) cashNameInputRef.current?.focus(); else cashBalanceInputRef.current?.focus(); showToast('error','Fix wallet errors.'); return; }
    onAddCashAccount(cashName.trim(), parseFloat(cashBalance)||0);
    setCashName(''); setCashBalance(''); setCashSubmitted(false); setCashErrors({}); showToast('success','Cash account added.');
  };
  const handleCreateCard=(e:React.FormEvent)=>{
    e.preventDefault(); setCardSubmitted(true);
    const ok=validateCard(cardName,bankName,cardBalance,cardNumber,true);
    if(!ok){ if(!cardName.trim()) cardNameInputRef.current?.focus(); else if(!bankName.trim()) bankNameInputRef.current?.focus(); else if(!cardBalance) cardBalanceInputRef.current?.focus(); else cardNumberInputRef.current?.focus(); showToast('error','Fix card errors.'); return; }
    const bal=parseFloat(cardBalance)||0; const lim=cardType==='Credit'?parseFloat(cardLimit)||0:undefined;
    let clean=cardNumber.replace(/\s+/g,''); if(clean.length>0){ clean = clean.length>4 ? `•••• •••• •••• ${clean.slice(-4)}` : `•••• •••• •••• ${clean}`; } else clean=`•••• •••• •••• ${Math.floor(1000+Math.random()*9000)}`;
    onAddCard({ cardName:cardName.trim(), bankName:bankName.trim(), cardType, currentBalance: cardType==='Credit'?-Math.abs(bal):bal, limit:lim, cardNumber:clean, cardTheme, lockedAmount: cardType==='Debit'?parseFloat(cardLockedAmount)||0:undefined });
    setCardName(''); setBankName(''); setCardBalance(''); setCardLimit('50000'); setCardNumber(''); setCardLockedAmount(''); setCardSubmitted(false); setCardErrors({}); setIsAddingCard(false); showToast('success','Card added.');
  };
  const validateEditCard=(name:string,numStr:string)=>{
    const errs:Record<string,string>={}; if(!name.trim()) errs.name='Card name required'; else if(name.trim().length<3) errs.name='At least 3 chars'; else if(/[<>{}]/.test(name)) errs.name='Invalid chars';
    const c=numStr.replace(/\s+/g,'').replace(/\*/g,''); if(c&&c.length>0&&!/^\d+$/.test(c)) errs.number='Digits only'; setEditCardErrors(errs); return Object.keys(errs).length===0;
  };
  const handleSaveEditCard=(e:React.FormEvent)=>{
    e.preventDefault(); setEditCardSubmitted(true); if(!editingCard) return;
    if(!validateEditCard(editCardName,editCardNumber)) return;
    let clean=editCardNumber.replace(/\s+/g,'').replace(/\*/g,''); if(clean.length>0) clean= clean.length>4 ? `•••• •••• •••• ${clean.slice(-4)}` : `•••• •••• •••• ${clean}`; else clean=editingCard.cardNumber||`•••• •••• •••• ${Math.floor(1000+Math.random()*9000)}`;
    onUpdateCard({ ...editingCard, cardName:editCardName.trim(), cardNumber:clean, cardTheme:editCardTheme, lockedAmount: editingCard.cardType==='Debit'?parseFloat(editCardLockedAmount)||0:undefined });
    setEditingCard(null); showToast('success','Card updated.');
  };
  const handleQuickAdjustCash=(e:React.FormEvent)=>{
    e.preventDefault(); setQuickSubmitted(true); if(!selectedCashId||!actionType) return;
    const acc=cashAccounts.find(c=>c.id===selectedCashId); if(!acc) return;
    if(!validateQuick(qtyAction,true)){ qtyActionInputRef.current?.focus(); showToast('error','Check amount'); return; }
    const amt=parseFloat(qtyAction)||0; const next= actionType==='deposit'? acc.balance+amt : acc.balance-amt;
    onEditCashAccount(selectedCashId,next); setQtyAction(''); setSelectedCashId(null); setActionType(null); setQuickSubmitted(false); setQuickErrors({}); showToast('success','Balance updated.');
  };
  const getCardGradient=(_t:string)=>''; // kept for prop compat, no gradient in Swiss

  const themeOptions = [
    {name:'obsidian', color:'bg-[#0A0A0A] dark:bg-[#FAFAF9]'},
    {name:'sapphire', color:'bg-blue-600'},
    {name:'blue', color:'bg-sky-500'},
    {name:'emerald', color:'bg-emerald-600'},
    {name:'copper', color:'bg-amber-600'},
    {name:'ruby', color:'bg-rose-600'},
    {name:'amethyst', color:'bg-violet-600'},
    {name:'amber', color:'bg-yellow-500'},
    {name:'silver', color:'bg-zinc-400'},
    {name:'slate', color:'bg-slate-500'},
    {name:'graphite', color:'bg-neutral-600'},
  ];

  return (
    <div id="cash-card-vault-view" className="space-y-6">
      {/* Vault total — ULTRA Mitchell + Aivo pill — gradient-card-dark with huge mono */}
      <div className="gradient-card p-6 md:p-8 overflow-hidden" style={{ background: 'var(--gradient-card-dark)' }}>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 relative z-10">
          <div>
            <span className="eyebrow !text-white/60">Vault — Cash in hand</span>
            <div className="mono text-[32px] md:text-[40px] font-bold tracking-tight text-white mt-1 tabular-nums">
              {currency}{vaultTotal.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
            </div>
            <p className="text-[13px] text-white/60 mt-1">{cashAccounts.length} {cashAccounts.length===1?'account':'accounts'} • Physical holdings</p>
          </div>
          <span className="pill !bg-white/10 !border-white/15 !text-white mono !text-[10px] tracking-widest">● Live ledger</span>
        </div>
        <div className="rainbow-bar mt-6 relative z-10 opacity-90" />
      </div>

      {/* Cash Accounts */}
      <section className="card p-5 md:p-7">
        <div className="flex items-center gap-3 pb-4 border-b border-[var(--line)]">
          <div className="w-8 h-8 rounded-full border border-[var(--line)] bg-[var(--surface-2)] flex items-center justify-center text-[var(--ink-2)]"><Wallet size={14} /></div>
          <div>
            <h3 className="text-[13px] font-bold tracking-tight text-[var(--ink)]">Cash in Hand</h3>
            <p className="eyebrow normal-case tracking-normal font-medium">Physical wallets & safes</p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {cashAccounts.length===0 ? (
            <div className="empty"><p className="text-sm font-medium">No cash accounts yet</p><p className="text-xs mt-1 text-[var(--ink-3)]">Add a wallet to start tracking.</p></div>
          ) : cashAccounts.map(account=>(
            <div key={account.id} id={`cash-row-${account.id}`} className="flex items-center gap-3 p-3.5 rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)] hover:border-[var(--line-strong)] transition-colors">
              <div className="w-10 h-10 rounded-full bg-[var(--ink)] text-[var(--accent-fg)] flex items-center justify-center shrink-0">
                <Wallet size={15} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mono text-[13px] font-bold text-[var(--ink)] truncate">{account.name}</div>
                <div className="mono text-[15px] font-bold tabular-nums text-[var(--ink)] tracking-tight">{currency}{account.balance.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
                <span className="pill !py-0.5 !px-2 !text-[10px] mono mt-1">Asset drawer</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button type="button" onClick={()=>{setSelectedCashId(account.id); setActionType('deposit');}} className="pill !px-3 !py-1.5 !text-[11px] mono">+ Deposit</button>
                <button type="button" onClick={()=>{setSelectedCashId(account.id); setActionType('withdraw');}} className="pill !px-3 !py-1.5 !text-[11px] mono">− Withdraw</button>
                <button type="button" onClick={()=>showConfirm({message:`Delete ${account.name}?`, onConfirm:()=>onDeleteCashAccount(account.id)})} className="w-8 h-8 rounded-full border border-[var(--line)] bg-[var(--surface)] flex items-center justify-center text-[var(--ink-3)] hover:text-[var(--danger)] hover:border-[var(--danger)]/30 transition-colors"><Trash2 size={12}/></button>
              </div>
            </div>
          ))}
        </div>

        {selectedCashId && actionType && (
          <form onSubmit={handleQuickAdjustCash} className="mt-4 p-4 rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)] flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <span className="mono text-xs font-semibold flex items-center gap-1.5"><CornerDownRight size={12} className="text-[var(--ink-3)]"/>Quick {actionType}: {cashAccounts.find(c=>c.id===selectedCashId)?.name}</span>
              <button type="button" onClick={()=>{setSelectedCashId(null); setActionType(null);}} className="eyebrow normal-case tracking-normal !text-[11px] hover:text-[var(--ink)]">Cancel</button>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 mono text-xs text-[var(--ink-3)]">{currency}</span>
                <input ref={qtyActionInputRef} type="number" placeholder="Amount" value={qtyAction} onChange={e=>{setQtyAction(e.target.value); validateQuick(e.target.value,quickSubmitted);}} className="input !pl-7 mono" required />
              </div>
              <button type="submit" className="btn-primary whitespace-nowrap">Confirm</button>
            </div>
            {quickErrors.qty && <span className="text-[11px] text-[var(--danger)] mono">{quickErrors.qty}</span>}
          </form>
        )}

        <form onSubmit={handleCreateCash} className="mt-6 pt-5 border-t border-[var(--line)] flex flex-col gap-4">
          <span className="eyebrow">Record new cash holding</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="eyebrow normal-case tracking-normal">Wallet name</label>
              <input ref={cashNameInputRef} type="text" placeholder="Office safe" value={cashName} onChange={e=>{setCashName(e.target.value); validateCash(e.target.value,cashBalance,cashSubmitted);}} className="input" />
              {cashErrors.name && <span className="text-[11px] text-[var(--danger)] mono">{cashErrors.name}</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="eyebrow normal-case tracking-normal">Starting sum ({currency})</label>
              <input ref={cashBalanceInputRef} type="number" placeholder="0.00" value={cashBalance} onChange={e=>{setCashBalance(e.target.value); validateCash(cashName,e.target.value,cashSubmitted);}} className="input mono" />
              {cashErrors.balance && <span className="text-[11px] text-[var(--danger)] mono">{cashErrors.balance}</span>}
            </div>
          </div>
          <button type="submit" className="btn-primary w-full flex items-center justify-center gap-2"><Plus size={14}/>Add holdings account</button>
        </form>
      </section>

      {/* Cards */}
      <section className="card p-5 md:p-7">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[var(--line)]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full border border-[var(--line)] bg-[var(--surface-2)] flex items-center justify-center text-[var(--ink-2)]"><CreditCard size={14}/></div>
            <div>
              <h3 className="text-[13px] font-bold tracking-tight text-[var(--ink)]">Debit & Credit Cards</h3>
              <p className="eyebrow normal-case tracking-normal font-medium">Bank cards & lines of credit</p>
            </div>
          </div>
          {!isAddingCard && <button onClick={()=>setIsAddingCard(true)} className="btn-ghost !text-xs flex items-center gap-1.5"><Plus size={13}/>New Bank Card</button>}
        </div>

        {isAddingCard && (
          <form onSubmit={handleCreateCard} className="mt-5 p-5 rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)] space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-[var(--line)]">
              <span className="eyebrow">Issue card</span>
              <button type="button" onClick={()=>setIsAddingCard(false)} className="eyebrow normal-case tracking-normal hover:text-[var(--ink)]">Cancel</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5"><label className="eyebrow normal-case">Card nickname</label><input ref={cardNameInputRef} type="text" placeholder="Travel Card" value={cardName} onChange={e=>{setCardName(e.target.value); validateCard(e.target.value,bankName,cardBalance,cardNumber,cardSubmitted);}} className="input" />{cardErrors.name && <span className="text-[11px] text-[var(--danger)] mono">{cardErrors.name}</span>}</div>
              <div className="flex flex-col gap-1.5"><label className="eyebrow normal-case">Bank issuer</label><input ref={bankNameInputRef} type="text" placeholder="HNB Bank" value={bankName} onChange={e=>{setBankName(e.target.value); validateCard(cardName,e.target.value,cardBalance,cardNumber,cardSubmitted);}} className="input" />{cardErrors.bank && <span className="text-[11px] text-[var(--danger)] mono">{cardErrors.bank}</span>}</div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5"><label className="eyebrow normal-case">Card type</label><select value={cardType} onChange={e=>setCardType(e.target.value as any)} className="input"><option value="Debit">Debit</option><option value="Credit">Credit</option></select></div>
              <div className="flex flex-col gap-1.5"><label className="eyebrow normal-case">{cardType==='Credit'?'Starting debt ('+currency+')':'Starting balance ('+currency+')'}</label><input ref={cardBalanceInputRef} type="number" placeholder="0.00" value={cardBalance} onChange={e=>{setCardBalance(e.target.value); validateCard(cardName,bankName,e.target.value,cardNumber,cardSubmitted);}} className="input mono" />{cardErrors.balance && <span className="text-[11px] text-[var(--danger)] mono">{cardErrors.balance}</span>}</div>
            </div>
            {cardType==='Credit' && <div className="flex flex-col gap-1.5"><label className="eyebrow normal-case">Credit limit ({currency})</label><input type="number" placeholder="50000" value={cardLimit} onChange={e=>setCardLimit(e.target.value)} className="input mono" /></div>}
            {cardType==='Debit' && <div className="flex flex-col gap-1.5"><label className="eyebrow normal-case">Locked amount ({currency})</label><input type="number" placeholder="Optional" value={cardLockedAmount} onChange={e=>setCardLockedAmount(e.target.value)} className="input mono" /></div>}
            <div className="flex flex-col gap-1.5"><label className="eyebrow normal-case">Card number (optional)</label><input ref={cardNumberInputRef} type="text" placeholder="4201 9283" value={cardNumber} onChange={e=>{setCardNumber(e.target.value); validateCard(cardName,bankName,cardBalance,e.target.value,cardSubmitted);}} maxLength={19} className="input mono" />{cardErrors.number && <span className="text-[11px] text-[var(--danger)] mono">{cardErrors.number}</span>}</div>
            <div className="space-y-2">
              <span className="eyebrow normal-case">Border accent</span>
              <div className="flex gap-2 flex-wrap">
                {themeOptions.map(th=>(
                  <button key={th.name} type="button" onClick={()=>setCardTheme(th.name)} className={`w-7 h-7 rounded-full border ${th.color} ${cardTheme===th.name ? 'ring-2 ring-offset-2 ring-[var(--ink)] ring-offset-[var(--surface-2)] scale-110' : 'opacity-70 hover:opacity-100'} transition-all border-[var(--line)]`} title={th.name} />
                ))}
              </div>
            </div>
            <button type="submit" className="btn-primary w-full">Verify & Add Card</button>
          </form>
        )}

        <div className="mt-5 space-y-4">
          {(()=>{ const active=cards.filter(c=>!c.isCanceled && !(c as any).is_canceled); const canceled=cards.filter(c=>c.isCanceled || (c as any).is_canceled);
            return (
              <>
                {active.length===0 ? <div className="empty"><p className="text-sm font-medium">No active cards</p><p className="text-xs mt-1 text-[var(--ink-3)]">Add a debit or credit card.</p></div> : active.map((card,idx)=>{
                  const isCredit=card.cardType==='Credit'; const hasNeg=card.currentBalance<0; const out=hasNeg?Math.abs(card.currentBalance):0; const lim=card.limit??0; const avail=lim+card.currentBalance; const used=lim>0?Math.max(0,lim-avail):0; const pct=lim>0?Math.min(100,(used/lim)*100):0;
                  const hasDetails=isCredit||(card.lockedAmount!==undefined && card.lockedAmount>0); const isExp=!!expandedCardIds[card.id];
                  return (
                    <div key={card.id} className="space-y-2">
                      <InteractiveBankCard card={card} idx={idx} currency={currency} onUpdateCard={onUpdateCard} onDeleteCard={onDeleteCard} getCardGradient={getCardGradient} setEditingCard={setEditingCard} setEditCardName={setEditCardName} setEditCardNumber={setEditCardNumber} setEditCardTheme={setEditCardTheme} setEditCardErrors={setEditCardErrors} setEditCardSubmitted={setEditCardSubmitted} setEditCardLockedAmount={setEditCardLockedAmount} onClick={()=>{if(hasDetails) setExpandedCardIds(p=>({ ...p,[card.id]:!p[card.id]}));}} />
                      {hasDetails && <div className="flex justify-center"><button type="button" onClick={()=>setExpandedCardIds(p=>({ ...p,[card.id]:!p[card.id]}))} className="btn-ghost !px-3 !py-1 !text-[11px] flex items-center gap-1"><span>{isExp?'Hide':'Show'} details</span><ChevronDown size={12} className={`transition-transform ${isExp?'rotate-180':''}`}/></button></div>}
                      {hasDetails && (
                        <div className={`overflow-hidden transition-all duration-300 ${isExp?'max-h-[520px] opacity-100':'max-h-0 opacity-0 pointer-events-none'}`}>
                          <div className="card-flat p-4 space-y-3">
                            {!isCredit && card.lockedAmount! >0 ? (
                              <>
                                <div className="flex justify-between items-center">
                                  <span className="eyebrow normal-case">Spendable</span>
                                  <span className="mono text-sm font-bold text-[var(--success)]">{currency}{(card.currentBalance-card.lockedAmount!).toLocaleString(undefined,{minimumFractionDigits:2})}</span>
                                </div>
                                <div className="w-full h-1.5 bg-[var(--surface-2)] border border-[var(--line)] rounded-full overflow-hidden"><div className="h-full bg-[var(--ink)]" style={{width:`${card.currentBalance>0?Math.max(0,Math.min(100,((card.currentBalance-card.lockedAmount!)/card.currentBalance*100))):0}%`}}/></div>
                                <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-[var(--line)]">
                                  <div><span className="eyebrow block">Total</span><span className="mono text-xs font-bold">{currency}{card.currentBalance.toLocaleString()}</span></div>
                                  <div className="border-x border-[var(--line)]"><span className="eyebrow block">Locked</span><span className="mono text-xs font-bold text-amber-600">{currency}{card.lockedAmount!.toLocaleString()}</span></div>
                                  <div><span className="eyebrow block">Spendable</span><span className="mono text-xs font-bold text-[var(--success)]">{currency}{Math.max(0,card.currentBalance-card.lockedAmount!).toLocaleString()}</span></div>
                                </div>
                              </>
                            ): null}
                            {isCredit && (
                              <>
                                <div className="flex justify-between items-center">
                                  <span className="eyebrow normal-case">Outstanding</span>
                                  <span className={`mono text-sm font-bold ${hasNeg?'text-[var(--danger)]':'text-[var(--success)]'}`}>{hasNeg?'-':''}{currency}{out.toLocaleString(undefined,{minimumFractionDigits:2})}</span>
                                </div>
                                {lim>0 && <>
                                  <div className="flex justify-between items-center"><span className="eyebrow normal-case">Utilization</span><span className="mono text-xs font-bold">{pct.toFixed(0)}% used</span></div>
                                  <div className="w-full h-1.5 bg-[var(--surface-2)] border border-[var(--line)] rounded-full overflow-hidden"><div className="h-full bg-[var(--ink)]" style={{width:`${pct}%`}}/></div>
                                  <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-[var(--line)]">
                                    <div><span className="eyebrow block">Limit</span><span className="mono text-xs font-bold">{currency}{lim.toLocaleString()}</span></div>
                                    <div className="border-x border-[var(--line)]"><span className="eyebrow block">Used</span><span className="mono text-xs font-bold text-[var(--danger)]">{currency}{used.toLocaleString()}</span></div>
                                    <div><span className="eyebrow block">Avail</span><span className="mono text-xs font-bold text-[var(--success)]">{currency}{Math.max(0,avail).toLocaleString()}</span></div>
                                  </div>
                                </>}
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {canceled.length>0 && (
                  <div className="pt-4 border-t border-[var(--line)]">
                    <button type="button" onClick={()=>setShowCanceled(!showCanceled)} className="w-full btn-ghost flex justify-between !rounded-[12px]"><span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[var(--ink-3)]"/>Archived ({canceled.length})</span><span>{showCanceled?'Hide':'Show'}</span></button>
                    {showCanceled && <div className="space-y-3 mt-3">{canceled.map((card,idx)=>(
                      <div key={card.id} className="relative">
                        <InteractiveBankCard card={card} idx={idx} currency={currency} onUpdateCard={onUpdateCard} onDeleteCard={onDeleteCard} getCardGradient={getCardGradient} setEditingCard={setEditingCard} setEditCardName={setEditCardName} setEditCardNumber={setEditCardNumber} setEditCardTheme={setEditCardTheme} setEditCardErrors={setEditCardErrors} setEditCardSubmitted={setEditCardSubmitted} setEditCardLockedAmount={setEditCardLockedAmount} />
                        <div className="absolute top-3 right-3"><button type="button" onClick={()=>{onUpdateCard({ ...card, isCanceled:false}); showToast('success',`${card.cardName} reactivated.`);}} className="btn-ghost !px-2.5 !py-1 !text-[11px] flex items-center gap-1"><RefreshCw size={10}/>Reactivate</button></div>
                      </div>
                    ))}</div>}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </section>

      {editingCard && (()=>{
        const isCredit=editingCard.cardType==='Credit'; const curCharges=editingCard.charges||[];
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--ink)]/40 backdrop-blur-sm" onClick={()=>setEditingCard(null)}>
            <div className={`card p-6 w-full max-h-[90vh] overflow-y-auto ${isCredit?'max-w-3xl':'max-w-md'}`} onClick={e=>e.stopPropagation()}>
              <div className="flex justify-between items-center pb-4 border-b border-[var(--line)] mb-5">
                <div><h3 className="text-sm font-bold text-[var(--ink)] flex items-center gap-2"><Edit size={14}/>Edit Card</h3><p className="text-xs text-[var(--ink-2)]">Configure {editingCard.cardName}</p></div>
                <button onClick={()=>setEditingCard(null)} className="btn-ghost !px-3 !py-1.5 !text-xs">Close</button>
              </div>
              <div className={`grid grid-cols-1 ${isCredit?'md:grid-cols-2 gap-6':'gap-6'}`}>
                <form onSubmit={handleSaveEditCard} className="space-y-4">
                  <span className="eyebrow">General</span>
                  <div className="card-flat p-4 space-y-3 bg-[var(--surface-2)]">
                    <div className="flex flex-col gap-1.5"><label className="eyebrow normal-case">Card nickname</label><input type="text" value={editCardName} onChange={e=>{setEditCardName(e.target.value); validateEditCard(e.target.value,editCardNumber);}} className="input" />{editCardErrors.name && <span className="text-[11px] text-[var(--danger)] mono">{editCardErrors.name}</span>}</div>
                    <div className="flex flex-col gap-1.5"><label className="eyebrow normal-case">Card number</label><input type="text" value={editCardNumber} onChange={e=>{setEditCardNumber(e.target.value); validateEditCard(editCardName,e.target.value);}} maxLength={19} className="input mono" />{editCardErrors.number && <span className="text-[11px] text-[var(--danger)] mono">{editCardErrors.number}</span>}</div>
                    {!isCredit && <div className="flex flex-col gap-1.5"><label className="eyebrow normal-case">Locked ({currency})</label><input type="number" value={editCardLockedAmount} onChange={e=>setEditCardLockedAmount(e.target.value)} className="input mono" /></div>}
                    <div className="space-y-1.5"><span className="eyebrow normal-case">Border accent</span><div className="flex gap-1.5 flex-wrap">{themeOptions.slice(0,5).map(th=>(
                      <button key={th.name} type="button" onClick={()=>setEditCardTheme(th.name)} className={`w-6 h-6 rounded-full border ${th.color} ${editCardTheme===th.name?'ring-2 ring-[var(--ink)] ring-offset-2 ring-offset-[var(--surface-2)]':''} border-[var(--line)]`} />
                    ))}</div></div>
                  </div>
                  <div className="flex gap-2 justify-end"><button type="button" onClick={()=>setEditingCard(null)} className="btn-ghost">Cancel</button><button type="submit" className="btn-primary">Save</button></div>
                </form>
                {isCredit && (
                  <div className="space-y-3 border-t md:border-t-0 md:border-l border-[var(--line)] pt-4 md:pt-0 md:pl-6">
                    <span className="eyebrow">Charges & Fees</span>
                    <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                      <span className="eyebrow normal-case text-[11px]">Active ({curCharges.length})</span>
                      {curCharges.length===0 ? <div className="empty !py-4"><span className="text-xs">No charges yet.</span></div> : curCharges.map(ch=>(
                        <div key={ch.id} className="flex justify-between items-center gap-2 p-2.5 rounded-[12px] border border-[var(--line)] bg-[var(--surface)]">
                          <div className="min-w-0"><div className="flex gap-1.5 items-center"><span className="text-xs font-bold truncate">{ch.name}</span><span className="text-[9px] px-1.5 py-0.5 rounded-full border border-[var(--line)] mono uppercase">{ch.type.replace('Charge','').replace('Fee','').trim()}</span></div><div className="mono text-[10px] text-[var(--ink-3)]">{ch.appliedDate}{ch.isRecurring && ` • ${ch.recurringInterval}`}</div></div>
                          <div className="flex items-center gap-2 shrink-0"><span className="mono text-xs font-bold text-[var(--danger)]">-{currency}{ch.amount.toLocaleString()}</span><button type="button" onClick={()=>{if(onDeleteCardCharge){ onDeleteCardCharge(editingCard.id,ch.id); setEditingCard({...editingCard, currentBalance: editingCard.currentBalance + ch.amount, charges: curCharges.filter(c=>c.id!==ch.id)});}}} className="w-6 h-6 rounded-full border border-[var(--line)] flex items-center justify-center hover:text-[var(--danger)]"><Trash2 size={11}/></button></div>
                        </div>
                      ))}
                    </div>
                    <div className="card-flat p-3 bg-[var(--surface-2)] space-y-2">
                      <span className="eyebrow normal-case">Apply charge</span>
                      <div className="grid grid-cols-2 gap-2">
                        <select value={chargeType} onChange={e=>{const v=e.target.value as any; setChargeType(v); setChargeName(CHARGE_DEFAULT_NAMES[v]||'Custom');}} className="input !text-xs"><option value="Interest">Interest</option><option value="LatePayment">Late Payment</option><option value="OverLimit">Over-Limit</option><option value="Annual">Annual</option><option value="Custom">Custom</option></select>
                        <input type="text" value={chargeName} onChange={e=>setChargeName(e.target.value)} placeholder="Name" className="input !text-xs" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input type="number" step="0.01" value={chargeAmount} onChange={e=>setChargeAmount(e.target.value)} placeholder="Amount" className="input mono !text-xs" />
                        <DatePicker value={chargeDate} onChange={setChargeDate} />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <select value={chargeRecurring} onChange={e=>setChargeRecurring(e.target.value as any)} className="input !text-xs"><option value="none">One-off</option><option value="Monthly">Monthly</option><option value="Yearly">Yearly</option><option value="Custom">Custom</option></select>
                        <input type="text" value={chargeDescription} onChange={e=>setChargeDescription(e.target.value)} placeholder="Notes" className="input !text-xs" />
                      </div>
                      <button type="button" onClick={()=>{
                        const amt=parseFloat(chargeAmount); if(!chargeName||isNaN(amt)||amt<=0){ showToast('error','Valid name & amount required.'); return; }
                        const newCharge: Charge={ id:`chg-${Date.now()}`, name:chargeName, amount:amt, type:(chargeType==='Interest'?'Interest Charge':chargeType==='LatePayment'?'Late Payment Fee':chargeType==='OverLimit'?'Over-Limit Fee':chargeType==='Annual'?'Annual Fee':'Custom Charge') as any, appliedDate:chargeDate, description: chargeDescription||undefined, isRecurring: chargeRecurring!=='none', recurringInterval: (chargeRecurring!=='none'?chargeRecurring:undefined) as any };
                        if(onApplyCardCharge){ onApplyCardCharge(editingCard.id, newCharge); setEditingCard({...editingCard, currentBalance: editingCard.currentBalance - amt, charges:[...curCharges,newCharge]}); setChargeAmount(''); setChargeDescription('');}
                      }} className="btn-primary w-full !text-xs">Add charge</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {cardToDelete && null}
    </div>
  );
}
