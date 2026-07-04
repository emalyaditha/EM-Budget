import React, { useState } from 'react';
import { CashAccount, BankCard, Charge } from '../types';
import { Plus, Trash2, Edit, Wallet, CreditCard, ChevronRight, ChevronDown, CornerDownRight, Landmark, ArrowUpRight, ArrowDownLeft, Snowflake, RefreshCw, Lock, Calendar } from 'lucide-react';
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
  key?: any;
  card: BankCard;
  idx: number;
  currency: string;
  onUpdateCard: (card: BankCard) => void;
  onDeleteCard: (id: string) => void;
  getCardGradient: (theme: string) => string;
  setEditingCard: (card: BankCard | null) => void;
  setEditcardName: (name: string) => void;
  setEditcardNumber: (num: string) => void;
  setEditcardTheme: (theme: string) => void;
  setEditCardErrors: (errs: Record<string, string>) => void;
  setEditCardSubmitted: (sub: boolean) => void;
  onApplyCardCharge?: (cardId: string, charge: any) => void;
  onDeleteCardCharge?: (cardId: string, chargeId: string) => void;
  setEditCardLockedAmount?: (val: string) => void;
  onClick?: () => void;
}

function InteractiveBankCard({
  card,
  idx,
  currency,
  onUpdateCard,
  onDeleteCard,
  getCardGradient,
  setEditingCard,
  setEditcardName,
  setEditcardNumber,
  setEditcardTheme,
  setEditCardErrors,
  setEditCardSubmitted,
  onApplyCardCharge,
  onDeleteCardCharge,
  setEditCardLockedAmount,
  onClick,
}: InteractiveBankCardProps) {
  const { showToast } = useNotifications();
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const CardRef = React.useRef<HTMLDivElement>(null);

  const themeCodes = ['obsidian', 'sapphire', 'blue', 'emerald', 'copper', 'ruby', 'amethyst', 'amber', 'silver', 'slate', 'graphite'];
  const derivedTheme = card.cardTheme || themeCodes[idx % themeCodes.length];
  const isCanceled = card.isCanceled || (card as any).is_canceled;

  React.useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (isCanceled || card.isFrozen) return;
      if (e.beta !== null && e.gamma !== null) {
        const rotX = Math.min(Math.max((e.beta - 45) / 5, -8), 8);
        const rotY = Math.min(Math.max(e.gamma / 5, -8), 8);
        setCoords({ x: rotX, y: rotY });
      }
    };
    if (typeof window !== 'undefined' && 'DeviceOrientationEvent' in window) {
      window.addEventListener('deviceorientation', handleOrientation);
    }
    return () => {
      if (typeof window !== 'undefined' && 'DeviceOrientationEvent' in window) {
        window.removeEventListener('deviceorientation', handleOrientation);
      }
    };
  }, [isCanceled, card.isFrozen]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isCanceled || card.isFrozen) return;
    const CardEl = CardRef.current;
    if (!CardEl) return;
    setIsHovered(true);

    const rect = CardEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const miaX = rect.width / 2;
    const miaY = rect.height / 2;
    const rotX = -((y - miaY) / miaY) * 10; 
    const rotY = ((x - miaX) / miaX) * 10;  

    setCoords({ x: rotX, y: rotY });

    const pctX = (x / rect.width) * 100;
    const pctY = (y / rect.height) * 100;
    CardEl.style.setProperty('--glow-x', `${pctX}%`);
    CardEl.style.setProperty('--glow-y', `${pctY}%`);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setCoords({ x: 0, y: 0 });
    const CardEl = CardRef.current;
    if (CardEl) {
      CardEl.style.setProperty('--glow-x', '50%');
      CardEl.style.setProperty('--glow-y', '50%');
    }
  };

  const CardGradientStyle = getCardGradient(derivedTheme);

  const inlineStyle: React.CSSProperties = {
    transform: isHovered 
      ? `perspective(1000px) rotateX(${coords.x}deg) rotateY(${coords.y}deg) scale3d(1.02, 1.02, 1.02)` 
      : `perspective(1000px) rotateX(${coords.x}deg) rotateY(${coords.y}deg) scale3d(1, 1, 1)`,
    transition: isHovered ? 'none' : 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1), background 0.4s ease',
  };

  return (
    <div
      ref={CardRef}
      id={`Card-view-${card.id}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      style={inlineStyle}
      className={`relative p-5 rounded-[24px] bg-card bg-gradient-to-br ${CardGradientStyle} border shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] flex flex-col min-h-[220px] overflow-hidden duration-300 group cursor-pointer ${
        isCanceled ? 'opacity-50 filter grayscale contrast-75 brightness-90 hover:grayscale-0 hover:opacity-85' : ''
      }`}
    >
      {isHovered && !isCanceled && !card.isFrozen && (
        <div 
          className="absolute inset-0 pointer-events-none mix-blend-overlay opacity-95 z-20"
          style={{
            background: `radial-gradient(circle 160px at var(--glow-x, 50%) var(--glow-y, 50%), rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.15) 45%, transparent 80%), linear-gradient(135deg, rgba(255,255,255,0) 30%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0) 70%)`
          }}
        />
      )}

      {/* Glossy bank card circuitry overlay pattern */}
      <div className="absolute inset-0 bg-white/[0.012] bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 w-32 h-32 rounded-full bg-white/5 blur-2xl pointer-events-none z-0" />
      
      {card.isFrozen && !isCanceled && (
        <div className="absolute inset-0 z-30 bg-black/80 backdrop-blur-[12px] flex flex-col items-center justify-center border border-sky-500/20 rounded-[24px] transition-all duration-300">
          <div className="p-3 bg-sky-950/80 border border-sky-400/30 text-sky-300 rounded-full shadow-lg shadow-sky-500/10 animate-pulse">
            <Snowflake size={20} className="stroke-[2.5px]" />
          </div>
          <span className="text-[10px] font-black font-mono tracking-[0.2em] text-sky-200 mt-2.5">
            TEMP FROZEN
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onUpdateCard({ ...card, isFrozen: false });
              showToast('success', `${card.cardName} un-frozen successfully.`);
            }}
            className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium backdrop-blur-sm transition-all bg-sky-500/20 border border-sky-500/30 text-primary hover:bg-sky-500/35 active:scale-95 cursor-pointer"
          >
            <Snowflake size={11} />
            <span>Unfreeze Card</span>
          </button>
        </div>
      )}

      {/* Top row: bank name left, action buttons right */}
      <div className="flex items-start justify-between z-10 gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] uppercase font-bold tracking-[0.15em] text-primary/50 truncate">{card.bankName}</span>
            <span className="w-1 h-1 rounded-full bg-white/30 shrink-0" />
            <span className="text-[8px] font-mono font-bold uppercase text-primary/70 bg-white/10 px-1.5 py-0.5 rounded leading-none shrink-0">{card.cardType}</span>
          </div>
          <h4 className="text-base font-bold text-primary mt-1 truncate tracking-tight">
            {card.cardName}
          </h4>
        </div>

        {!isCanceled && !card.isFrozen && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditingCard(card);
                setEditcardName(card.cardName);
                setEditcardNumber(card.cardNumber ? card.cardNumber.replace(/\*/g, '').trim() : '');
                setEditcardTheme(derivedTheme);
                setEditCardErrors({});
                setEditCardSubmitted(false);
                setEditCardLockedAmount?.(card.lockedAmount?.toString() || '0');
              }}
              className="bg-white/10 hover:bg-white/20 border border-white/15 text-primary text-[11px] px-3 py-1.5 rounded-full backdrop-blur-md flex items-center gap-1.5 font-semibold transition-all shadow-md active:scale-95 cursor-pointer"
              title="Edit card details"
            >
              <Edit size={11} strokeWidth={2.5} className="text-primary/90" />
              <span>Edit</span>
            </button>
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                const Updated = { ...card, isFrozen: true };
                onUpdateCard(Updated);
                showToast('warning', `${card.cardName} soft-locked and frozen.`);
              }}
              className="bg-white/10 hover:bg-white/20 border border-white/15 text-primary text-[11px] px-3 py-1.5 rounded-full backdrop-blur-md flex items-center gap-1.5 font-semibold transition-all shadow-md active:scale-95 cursor-pointer"
              title="Freeze Card"
            >
              <Snowflake size={11} strokeWidth={2.5} className="text-primary/90" />
              <span>Freeze</span>
            </button>

            <button
              onClick={(e) => { e.stopPropagation(); onDeleteCard(card.id); }}
              className="bg-white/10 hover:bg-rose-500/30 border border-white/15 text-rose-300 text-[11px] p-1.5 rounded-full backdrop-blur-md flex items-center justify-center transition-all shadow-md active:scale-95 cursor-pointer"
              title="Delete card"
            >
              <Trash2 size={11} />
            </button>
          </div>
        )}
      </div>

      {/* Chip visual */}
      <div className="z-10 -my-1">
        <div className="w-9 h-7 rounded-lg bg-gradient-to-r from-amber-500/20 via-yellow-400/10 to-amber-600/20 border border-amber-500/35 opacity-90 shadow-inner relative overflow-hidden flex items-center justify-center">
          <div className="w-3.5 h-full border-r border-white/10 absolute left-1" />
          <div className="w-full h-2.5 border-b border-t border-white/10 absolute" />
        </div>
      </div>

      {/* card Middle: Balance as the absolute visual focus */}
      <div className="z-10 flex-1 flex flex-col justify-center py-1">
        <span className="text-[9px] uppercase tracking-widest text-primary/40 block font-medium">
          {card.cardType === 'Credit' ? 'Available Limit' : 'Available Balance'}
        </span>
        <span className="text-2xl sm:text-3xl font-bold font-mono text-primary leading-none tracking-tight block mt-1 drop-shadow-md">
          {currency}{
            card.cardType === 'Credit' 
              ? ((card.limit ?? 0) + card.currentBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              : (card.currentBalance - (card.lockedAmount ?? 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          }
        </span>
        {card.cardType === 'Debit' && card.lockedAmount && card.lockedAmount > 0 ? (
          <span className="text-[9px] font-bold text-amber-300 inline-flex items-center gap-1 mt-1.5 font-mono uppercase bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md leading-none self-start">
            <Lock size={8} /> {currency}{card.lockedAmount.toLocaleString()} locked
          </span>
        ) : null}
      </div>

      {/* card Footer: Card number left, network orbs right */}
      <div className="z-10 flex justify-between items-center border-t border-white/5 pt-3 mt-auto">
        <div className="text-[12px] font-mono tracking-[0.2em] text-primary/70 font-semibold select-all min-w-0 truncate">
          {card.cardNumber ? card.cardNumber : '•••• •••• •••• 1234'}
        </div>

        {/* Overlapping orbs (MasterCard style visual signature) */}
        <div className="flex -space-x-2.5 shrink-0 select-none">
          <span className="w-5 h-5 rounded-full bg-rose-500/60 backdrop-blur-sm" />
          <span className="w-5 h-5 rounded-full bg-amber-500/60 backdrop-blur-sm" />
        </div>
      </div>
    </div>
  );
}

export default function CashCardManagement({
  cashAccounts,
  cards,
  onAddCashAccount,
  onEditCashAccount,
  onAddCard,
  onDeleteCard,
  onDeleteCashAccount,
  currency,
  onUpdateCard,
  onApplyCardCharge,
  onDeleteCardCharge,
}: CashCardManagementProps) {
  const { showToast, showConfirm } = useNotifications();
  // Cash form states
  const [cashName, setCashName] = useState('');
  const [cashBalance, setCashBalance] = useState('');
  const [cashErrors, setCashErrors] = useState<Record<string, string>>({});
  const [cashsubmitted, setCashsubmitted] = useState(false);

  // card form states
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [cardName, setCardName] = useState('');
  const [bankName, setBankName] = useState('');
  const [cardType, setCardType] = useState<'Debit' | 'Credit'>('Debit');
  const [CardBalance, setCardBalance] = useState('');
  const [CardLimit, setCardLimit] = useState('50000');
  const [cardNumber, setcardNumber] = useState('');
  const [cardTheme, setCardTheme] = useState('obsidian'); // obsidian, sapphire, emerald, copper, ruby
  const [CardLockedAmount, setCardLockedAmount] = useState('');
  const [CardErrors, setCardErrors] = useState<Record<string, string>>({});
  const [Cardsubmitted, setCardsubmitted] = useState(false);

  // Edit card state fields
  const [EditingCard, setEditingCard] = useState<BankCard | null>(null);
  const [editcardName, setEditcardName] = useState('');
  const [editcardNumber, setEditcardNumber] = useState('');
  const [editCardLockedAmount, setEditCardLockedAmount] = useState('0');
  const [editcardTheme, setEditcardTheme] = useState('obsidian');
  const [editCardErrors, setEditCardErrors] = useState<Record<string, string>>({});
  const [editCardsubmitted, setEditCardSubmitted] = useState(false);
  const [showCanceled, setShowCanceled] = useState(false);
  const [expandedCardIds, setExpandedCardIds] = useState<Record<string, boolean>>({});

  // Charges Form States
  const [chargeType, setchargeType] = useState<'Interest' | 'LatePayment' | 'OverLimit' | 'Annual' | 'Custom'>('Interest');
  const [chargeName, setChargeName] = useState('Interest Charge');
  const [chargeAmount, setChargeAmount] = useState('');
  const [chargedate, setChargedate] = useState(new Date().toISOString().split('T')[0]);
  const [chargedescription, setChargedescription] = useState('');
  const [chargeRecurring, setChargeRecurring] = useState<'none' | 'Monthly' | 'Yearly' | 'Custom'>('none');

  const CHARGE_DEFAULT_NAMES: Record<string, string> = {
    Interest: 'Interest Charge',
    LatePayment: 'Late Payment Fee',
    OverLimit: 'Over-Limit Fee',
    Annual: 'Annual Fee',
    Custom: 'Custom Charge'
  };

  // Quick action states
  const [selectedCashId, setSelectedCashId] = useState<string | null>(null);
  const [qtyAction, setQtyAction] = useState('');
  const [actionType, setActionType] = useState<'Deposit' | 'Withdraw' | null>(null);
  const [quickErrors, setQuickErrors] = useState<Record<string, string>>({});
  const [quicksubmitted, setQuicksubmitted] = useState(false);

  // Refs for focusing first invalid fields
  const cashNameInputRef = React.useRef<HTMLInputElement>(null);
  const cashBalanceInputRef = React.useRef<HTMLInputElement>(null);

  const cardNameInputRef = React.useRef<HTMLInputElement>(null);
  const bankNameInputRef = React.useRef<HTMLInputElement>(null);
  const CardBalanceInputRef = React.useRef<HTMLInputElement>(null);
  const cardNumberInputRef = React.useRef<HTMLInputElement>(null);

  const qtyActionInputRef = React.useRef<HTMLInputElement>(null);

  // deletion confirmation
  const [CardTodelete, setCardTodelete] = useState<string | null>(null);

  // Live validator for Cash Account
  const validateCash = (name: string, balance: string, submitted: boolean) => {
    const errs: Record<string, string> = {};
    if (submitted || name) {
      if (!name.trim()) {
        errs.name = 'Account name is required';
      } else if (name.trim().length < 3) {
        errs.name = 'Account name must be at least 3 characters long';
      } else if (cashAccounts.some(acc => acc.name.toLowerCase().trim() === name.toLowerCase().trim())) {
        errs.name = 'An account with this name already exists';
      } else if (/[<>{}]/.test(name)) {
        errs.name = 'Invalid characters are not allowed';
      }
    }
    if (submitted || balance) {
      if (balance === '') {
        errs.balance = 'Starting amount is required';
      } else {
        const num = parseFloat(balance);
        if (isNaN(num)) {
          errs.balance = 'Starting amount must be a number';
        } else if (num < 0) {
          errs.balance = 'Starting amount cannot be negative';
        }
      }
    }
    setCashErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // Live validator for card Account
  const validateCard = (name: string, bank: string, balance: string, numStr: string, submitted: boolean) => {
    const errs: Record<string, string> = {};
    if (submitted || name) {
      if (!name.trim()) {
        errs.name = 'Card nickname is required';
      } else if (name.trim().length < 3) {
        errs.name = 'Nickname must be at least 3 characters';
      } else if (cards.some(c => c.cardName.toLowerCase().trim() === name.toLowerCase().trim())) {
        errs.name = 'A card with this name already exists';
      } else if (/[<>{}]/.test(name)) {
        errs.name = 'Invalid characters are not allowed';
      }
    }
    if (submitted || bank) {
      if (!bank.trim()) {
        errs.bank = 'Bank issuer name is required';
      } else if (bank.trim().length < 2) {
        errs.bank = 'Bank name must be at least 2 characters';
      } else if (/[<>{}]/.test(bank)) {
        errs.bank = 'Invalid characters are not allowed';
      }
    }
    if (submitted || balance) {
      if (balance === '') {
        errs.balance = 'Starting balance is required';
      } else {
        const amt = parseFloat(balance);
        if (isNaN(amt)) {
          errs.balance = 'Starting balance must be a number';
        } else if (amt < 0) {
          errs.balance = 'Starting balance cannot be negative';
        }
      }
    }
    if (numStr) {
      const cleanNum = numStr.replace(/\s+/g, '');
      if (cleanNum && !/^\d+$/.test(cleanNum)) {
        errs.number = 'Card number must be numeric-only';
      } else if (cleanNum && (cleanNum.length < 8 || cleanNum.length > 19)) {
        errs.number = 'Card number must be between 8 and 19 digits';
      }
    }
    setCardErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // Live validator for Quick actions
  const validateQuick = (qty: string, sub: boolean) => {
    const errs: Record<string, string> = {};
    if (sub || qty) {
      if (!qty) {
        errs.qty = 'Amount is required';
      } else {
        const num = parseFloat(qty);
        if (isNaN(num)) {
          errs.qty = 'Must be a valid number';
        } else if (num <= 0) {
          errs.qty = 'Amount must be positive';
        } else if (actionType === 'Withdraw' && selectedCashId) {
          const account = cashAccounts.find(c => c.id === selectedCashId);
          if (account && account.balance < num) {
            errs.qty = `Insufficient balance in hand! Available: ${currency} ${account.balance}`;
          }
        }
      }
    }
    setQuickErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCreateCash = (e: React.FormEvent) => {
    e.preventDefault();
    setCashsubmitted(true);
    const isValid = validateCash(cashName, cashBalance, true);
    if (!isValid) {
      // Focus first invalid element
      if (!cashName.trim() || cashName.trim().length < 3 || cashAccounts.some(acc => acc.name.toLowerCase().trim() === cashName.toLowerCase().trim()) || /[<>{}]/.test(cashName)) {
        cashNameInputRef.current?.focus();
      } else {
        cashBalanceInputRef.current?.focus();
      }
      showToast('error', 'Please resolve the highlightea wallet errors.');
      return;
    }
    const balanceNum = parseFloat(cashBalance) || 0;
    onAddCashAccount(cashName.trim(), balanceNum);
    setCashName('');
    setCashBalance('');
    setCashsubmitted(false);
    setCashErrors({});
    showToast('success', 'Cash workspace holdings Recorded securely.');
  };

  const handleCreateCard = (e: React.FormEvent) => {
    e.preventDefault();
    setCardsubmitted(true);
    const isValid = validateCard(cardName, bankName, CardBalance, cardNumber, true);
    if (!isValid) {
      // Focus first invalid input item
      if (!cardName.trim() || cardName.trim().length < 3 || cards.some(c => c.cardName.toLowerCase().trim() === cardName.toLowerCase().trim()) || /[<>{}]/.test(cardName)) {
        cardNameInputRef.current?.focus();
      } else if (!bankName.trim() || bankName.trim().length < 2 || /[<>{}]/.test(bankName)) {
        bankNameInputRef.current?.focus();
      } else if (!CardBalance || parseFloat(CardBalance) < 0 || isNaN(parseFloat(CardBalance))) {
        CardBalanceInputRef.current?.focus();
      } else {
        cardNumberInputRef.current?.focus();
      }
      showToast('error', 'Please resolve highlighted credit card validations/');
      return;
    }
    const balanceNum = parseFloat(CardBalance) || 0;
    const limitNum = cardType === 'Credit' ? parseFloat(CardLimit) || 0 : undefined;
    
    // Mask helper
    let cleanNum = cardNumber.replace(/\s+/g, '');
    if (cleanNum.length > 0) {
      if (cleanNum.length > 4) {
        cleanNum = `**** **** **** ${cleanNum.slice(-4)}`;
      } else {
        cleanNum = `**** **** **** ${cleanNum}`;
      }
    } else {
      cleanNum = `**** **** **** ${Math.floor(1000 + Math.random() * 9000)}`;
    }

    onAddCard({
      cardName: cardName.trim(),
      bankName: bankName.trim(),
      cardType,
      currentBalance: cardType === 'Credit' ? -Math.abs(balanceNum) : balanceNum,
      limit: limitNum,
      cardNumber: cleanNum,
      cardTheme: cardTheme,
      lockedAmount: cardType === 'Debit' ? parseFloat(CardLockedAmount) || 0 : undefined,
    });

    // Reset card form
    setCardName('');
    setBankName('');
    setCardBalance('');
    setCardLimit('50000');
    setcardNumber('');
    setCardLockedAmount('');
    setCardsubmitted(false);
    setCardErrors({});
    setIsAddingCard(false);
    showToast('success', 'Your bank asset card is certifiea.');
  };

  const validateeditCard = (name: string, numStr: string) => {
    const errs: Record<string, string> = {};
    if (!name.trim()) {
      errs.name = 'Card name is required';
    } else if (name.trim().length < 3) {
      errs.name = 'Card name must be at least 3 characters long';
    } else if (/[<>{}]/.test(name)) {
      errs.name = 'Invalid characters are not allowed';
    }
    
    const cleanNum = numStr.replace(/\s+/g, '').replace(/\*/g, '');
    if (cleanNum && cleanNum.length > 0 && !/^\d+$/.test(cleanNum)) {
      errs.number = 'Card number must contain digits only';
    }
    
    setEditCardErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSaveeditCard = (e: React.FormEvent) => {
    e.preventDefault();
    setEditCardSubmitted(true);
    if (!EditingCard) return;
    
    const isValid = validateeditCard(editcardName, editcardNumber);
    if (!isValid) {
      return;
    }
    
    let cleanNum = editcardNumber.replace(/\s+/g, '').replace(/\*/g, '');
    if (cleanNum.length > 0) {
      if (cleanNum.length > 4) {
        cleanNum = `**** **** **** ${cleanNum.slice(-4)}`;
      } else {
        cleanNum = `**** **** **** ${cleanNum}`;
      }
    } else {
      cleanNum = EditingCard.cardNumber || `**** **** **** ${Math.floor(1000 + Math.random() * 9000)}`;
    }
    
    const Updated: BankCard = {
      ...EditingCard,
      cardName: editcardName.trim(),
      cardNumber: cleanNum,
      cardTheme: editcardTheme,
      lockedAmount: EditingCard.cardType === 'Debit' ? parseFloat(editCardLockedAmount) || 0 : undefined,
    };
    
    onUpdateCard(Updated);
    setEditingCard(null);
    showToast('success', 'Card details Updated successfully.');
  };

  const handleQuickAdjustCash = (e: React.FormEvent) => {
    e.preventDefault();
    setQuicksubmitted(true);
    if (!selectedCashId || !actionType) return;
    const account = cashAccounts.find(c => c.id === selectedCashId);
    if (!account) return;

    const isValid = validateQuick(qtyAction, true);
    if (!isValid) {
      qtyActionInputRef.current?.focus();
      showToast('error', 'Check quick aajust inputs');
      return;
    }

    const amountNum = parseFloat(qtyAction) || 0;
    let nextBalance = account.balance;
    if (actionType === 'Deposit') {
      nextBalance += amountNum;
    } else if (actionType === 'Withdraw') {
      nextBalance -= amountNum;
    }

    onEditCashAccount(selectedCashId, nextBalance);
    setQtyAction('');
    setSelectedCashId(null);
    setActionType(null);
    setQuicksubmitted(false);
    setQuickErrors({});
    showToast('success', 'Holdingss recalculated instantly.');
  };

  const getCardGradient = (theme: string) => {
    switch (theme) {
      case 'sapphire': return 'from-blue-900 via-card to-indigo-900 border-blue-500/30';
      case 'emerald': return 'from-emerald-950 via-card to-emerald-950 border-subtle/30';
      case 'blue': return 'from-sky-950 via-card to-blue-950 border-sky-500/30';
      case 'copper': return 'from-amber-950 via-card to-orange-950 border-amber-600/30';
      case 'ruby': return 'from-rose-950 via-card to-rea-950 border-rose-500/30';
      case 'amethyst': return 'from-purple-950 via-card to-violet-950 border-purple-500/30';
      case 'amber': return 'from-yellow-950 via-card to-amber-900 border-yellow-600/30';
      case 'silver': return 'from-surface via-zinc-900 to-zinc-800 border-zinc-400/30';
      case 'slate': return 'from-slate-950 via-card to-slate-900 border-slate-500/30';
      case 'graphite': return 'from-[#0a0a0a] via-card to-[#171717] border-neutral-500/30';
      default: return 'from-card via-neutral-950 to-zinc-900 border-default';
    }
  };

  return (
    <div id="cash-Card-vault-view" className="space-y-8">
      
      {/* 1. Cash Accounts drawer Setup */}
      <div className="bg-card border border-default rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-6 opacity-[0.06] pointer-events-none select-none">
          <Wallet size={80} className="stroke-[1px]" />
        </div>

        {/* Section Header */}
        <div className="space-y-2 pb-5 border-b border-default/60 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 text-blue-600 rounded-xl">
              <Wallet size={20} className="stroke-[2px]" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-primary tracking-tight">
                Cash in Hand Repositories
              </h3>
              <p className="text-xs text-muted dark:text-secondary mt-0.5">Track and maintain your physical cash holdings, office safes, or piggy banks</p>
            </div>
          </div>
        </div>

        {/* List Cash Accounts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {cashAccounts.map(account => (
            <div key={account.id} id={`cash-row-${account.id}`} className="bg-card/40 border border-default p-5 rounded-2xl hover:border-default hover:bg-card-60 transition-all duration-300 shadow-sm group space-y-4">
              {/* Top Section: Icon, Name and delete Button */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-surface dark:bg-card border border-subtle dark:border-default flex items-center justify-center text-secondary dark:text-primary shadow-inner group-hover:border-subtle dark:group-hover:border-default transition-all shrink-0">
                    <Wallet size={20} className="text-muted dark:text-secondary" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-primary dark:text-primary truncate">{account.name}</h4>
                    <span className="text-[10px] font-mono text-muted dark:text-muted uppercase tracking-widest font-semibold mt-0.5 block">Asset drawer</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    showConfirm({
                      message: `delete ${account.name} wallet?`,
                      onConfirm: () => onDeleteCashAccount(account.id)
                    });
                  }}
                  className="p-2.5 bg-surface dark:bg-card border border-subtle dark:border-default hover:border-rose-500/30 text-muted hover:text-rose-500 dark:hover:text-danger rounded-xl transition-all cursor-pointer active:scale-90 shadow-sm shrink-0"
                  title="Remove Account"
                >
                  <Trash2 size={13} />
                </button>
              </div>

              {/* Subtle divider */}
              <div className="border-t border-subtle dark:border-default/60" />

              {/* Bottom Section: Balance & Action Buttons */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <div>
                  <span className="text-[10px] font-mono text-muted dark:text-muted uppercase tracking-widest font-semibold block mb-0.5">Balance</span>
                  <span className="text-lg font-bold font-mono text-primary dark:text-primary tracking-tight block leading-none">
                    {currency}{account.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCashId(account.id);
                      setActionType('Deposit');
                    }}
                    className="text-[10px] font-bold text-blue-600 dark:text-success hover:text-primary dark:hover:text-black px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500 dark:hover:bg-blue-400 transition-all uppercase tracking-wider cursor-pointer font-mono"
                  >
                    + Deposit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCashId(account.id);
                      setActionType('Withdraw');
                    }}
                    className="text-[10px] font-bold text-rose-600 dark:text-danger hover:text-primary dark:hover:text-black px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500 dark:hover:bg-rose-400 transition-all uppercase tracking-wider cursor-pointer font-mono"
                  >
                    - Withdraw
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Quick Deposit/Withdraw Action Slider */}
        {selectedCashId && actionType && (
          <form onSubmit={handleQuickAdjustCash} className="bg-surface dark:bg-card border border-subtle dark:border-default p-6 rounded-[24px] mb-6 space-y-4 animate-fade-in text-left">
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-mono font-bold text-primary dark:text-primary uppercase tracking-wider flex items-center gap-2">
                <CornerDownRight size={13} className="text-blue-500 dark:text-success animate-pulse" />
                Quick {actionType}: {cashAccounts.find(c => c.id === selectedCashId)?.name}
              </span>
              <button
                type="button"
                className="text-[10px] font-bold text-secondary hover:text-muted dark:text-muted dark:hover:text-primary uppercase tracking-wider transition-colors cursor-pointer"
                onClick={() => {
                  setSelectedCashId(null);
                  setActionType(null);
                }}
              >
                Cancel
              </button>
            </div>
            
            <div className="flex flex-col gap-2">
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-mono text-secondary dark:text-muted">{currency}</span>
                  <input
                    ref={qtyActionInputRef}
                    type="number"
                    placeholder="Enter amount"
                    value={qtyAction}
                    onChange={(e) => {
                      setQtyAction(e.target.value);
                      validateQuick(e.target.value, quicksubmitted);
                    }}
                    className={`w-full bg-card text-primary dark:text-primary rounded-2xl border text-xs pl-9 pr-4 py-4 focus:outline-none font-mono focus:ring-1 transition-all placeholder:text-secondary dark:placeholder:text-muted/70 ${
                      quickErrors.qty
                        ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500'
                        : qtyAction && !quickErrors.qty
                        ? 'border-blue-500 focus:border-blue-500 focus:ring-blue-500'
                        : 'border-subtle dark:border-default hover:border-subtle dark:hover:border-default/80 focus:border-indigo-500 focus:ring-indigo-500'
                    }`}
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="bg-card hover:bg-surface text-primary dark:bg-white dark:hover:bg-surface dark:text-black font-mono font-bold text-xs px-6 rounded-2xl transition-all cursor-pointer h-[50px]"
                >
                  Confirm
                </button>
              </div>
              {quickErrors.qty && (
                <span className="text-rose-500 dark:text-danger text-[10px] font-mono pl-1">{quickErrors.qty}</span>
              )}
            </div>
          </form>
        )}

        {/* Add Cash Account Form inline */}
        <form onSubmit={handleCreateCash} className="border-t border-subtle dark:border-default/60 pt-6 flex flex-col gap-5 text-left">
          <span className="text-[10px] font-black text-secondary dark:text-muted uppercase tracking-widest block">Record New Cash Holdingss</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-mono font-black text-muted dark:text-secondary uppercase tracking-wider pl-0.5">Wallet/Holdings Name</label>
              <input
                ref={cashNameInputRef}
                type="text"
                placeholder="e.g. Office Desk Safe"
                value={cashName}
                onChange={(e) => {
                  setCashName(e.target.value);
                  validateCash(e.target.value, cashBalance, cashsubmitted);
                }}
                className={`bg-card border text-primary dark:text-primary rounded-2xl text-xs px-5 py-4 focus:outline-none focus:ring-1 transition-all font-semibold placeholder:text-secondary dark:placeholder:text-muted/70 ${
                  cashErrors.name
                    ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500'
                    : cashName && !cashErrors.name
                    ? 'border-blue-500 focus:border-blue-500 focus:ring-blue-500'
                    : 'border-subtle dark:border-default hover:border-subtle dark:hover:border-default/80 focus:border-indigo-500 focus:ring-indigo-500'
                }`}
              />
              {cashErrors.name && (
                <span className="text-rose-500 dark:text-danger text-[10px] font-mono pl-1">{cashErrors.name}</span>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-mono font-black text-muted dark:text-secondary uppercase tracking-wider pl-0.5">Starting Sum ({currency})</label>
              <input
                ref={cashBalanceInputRef}
                type="number"
                placeholder="0.00"
                value={cashBalance}
                onChange={(e) => {
                  setCashBalance(e.target.value);
                  validateCash(cashName, e.target.value, cashsubmitted);
                }}
                className={`bg-card border text-primary dark:text-primary rounded-2xl text-xs px-5 py-4 focus:outline-none focus:ring-1 transition-all font-mono placeholder:text-secondary dark:placeholder:text-muted/70 ${
                  cashErrors.balance
                    ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500'
                    : cashBalance !== '' && !cashErrors.balance
                    ? 'border-blue-500 focus:border-blue-500 focus:ring-blue-500'
                    : 'border-subtle dark:border-default hover:border-subtle dark:hover:border-default/80 focus:border-indigo-500 focus:ring-indigo-500'
                }`}
              />
              {cashErrors.balance && (
                <span className="text-rose-500 dark:text-danger text-[10px] font-mono pl-1">{cashErrors.balance}</span>
              )}
            </div>
          </div>

          <button
            type="submit"
            className="w-full h-13 bg-card text-primary hover:bg-surface dark:bg-white dark:text-black rounded-2xl dark:hover:bg-surface text-xs font-mono font-black tracking-widest uppercase flex items-center justify-center gap-2 cursor-pointer shadow-lg hover:shadow-xl active:scale-[0.99] transition-all"
          >
            <Plus size={15} /> Add holdings account
          </button>
        </form>
      </div>

      {/* 2. cards Setup and displays */}
      <div className="bg-card border border-default rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-6 opacity-[0.06] pointer-events-none select-none">
          <CreditCard size={80} className="stroke-[1px]" />
        </div>

        {/* Section Header */}
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 pb-5 border-b border-default/60 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 rounded-xl">
              <CreditCard size={20} className="stroke-[2px]" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-primary tracking-tight">
                Debit & Credit Bank cards
              </h3>
              <p className="text-xs text-muted dark:text-secondary mt-0.5">Manage unlimited physical and electronic cards and lines of credit</p>
            </div>
          </div>
          {!isAddingCard && (
            <button
              onClick={() => setIsAddingCard(true)}
              className="text-[11px] font-bold text-secondary dark:text-primary uppercase bg-surface dark:bg-card border border-subtle dark:border-default px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 hover:border-subtle dark:hover:border-default hover:bg-surface dark:hover:bg-card active:scale-95 cursor-pointer transition-all shadow-sm self-start sm:self-auto"
            >
              <Plus size={13} /> New Bank card
            </button>
          )}
        </div>

        {/* card Creation form toggle sheet */}
        {isAddingCard && (
          <form onSubmit={handleCreateCard} className="bg-surface dark:bg-card border border-subtle dark:border-default p-6 md:p-8 rounded-[24px] mb-6 space-y-6 animate-fade-in text-left">
            <div className="flex justify-between items-center pb-4 border-b border-subtle dark:border-default/60">
              <span className="text-xs font-black text-primary dark:text-primary uppercase tracking-widest font-mono">Issue Electronic Card</span>
              <button
                type="button"
                className="text-xs font-mono font-bold text-secondary hover:text-muted dark:text-muted dark:hover:text-primary uppercase transition-colors cursor-pointer"
                onClick={() => setIsAddingCard(false)}
              >
                Cancel
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-mono font-black text-muted dark:text-secondary uppercase tracking-wider pl-0.5">Card Nickname</label>
                <input
                  ref={cardNameInputRef}
                  type="text"
                  placeholder="e.g. Travel Silver Black"
                  value={cardName}
                  onChange={(e) => {
                    setCardName(e.target.value);
                    validateCard(e.target.value, bankName, CardBalance, cardNumber, Cardsubmitted);
                  }}
                  className={`w-full bg-card border text-primary dark:text-primary rounded-2xl text-xs px-5 py-4 focus:outline-none focus:ring-1 transition-all font-semibold placeholder:text-secondary dark:placeholder:text-muted/70 ${
                    CardErrors.name
                      ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500'
                      : cardName && !CardErrors.name
                      ? 'border-blue-500 focus:border-blue-500 focus:ring-blue-500'
                      : 'border-subtle dark:border-default hover:border-subtle dark:hover:border-default/80 focus:border-indigo-500 focus:ring-indigo-500'
                  }`}
                />
                {CardErrors.name && (
                  <span className="text-rose-500 dark:text-danger text-[10px] font-mono pl-1">{CardErrors.name}</span>
                )}
              </div>
              
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-mono font-black text-muted dark:text-secondary uppercase tracking-wider pl-0.5">Bank Issuer Name</label>
                <input
                  ref={bankNameInputRef}
                  type="text"
                  placeholder="e.g. HNB Bank, BOC"
                  value={bankName}
                  onChange={(e) => {
                    setBankName(e.target.value);
                    validateCard(cardName, e.target.value, CardBalance, cardNumber, Cardsubmitted);
                  }}
                  className={`w-full bg-card border text-primary dark:text-primary rounded-2xl text-xs px-5 py-4 focus:outline-none focus:ring-1 transition-all font-semibold placeholder:text-secondary dark:placeholder:text-muted/70 ${
                    CardErrors.bank
                      ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500'
                      : bankName && !CardErrors.bank
                      ? 'border-blue-500 focus:border-blue-500 focus:ring-blue-500'
                      : 'border-subtle dark:border-default hover:border-subtle dark:hover:border-default/80 focus:border-indigo-500 focus:ring-indigo-500'
                  }`}
                />
                {CardErrors.bank && (
                  <span className="text-rose-500 dark:text-danger text-[10px] font-mono pl-1">{CardErrors.bank}</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-mono font-black text-muted dark:text-secondary uppercase tracking-wider pl-0.5">Card Type</label>
                <select
                  value={cardType}
                  onChange={(e) => setCardType(e.target.value as 'Debit' | 'Credit')}
                  className="w-full bg-card border border-subtle dark:border-default text-primary dark:text-primary rounded-2xl text-xs px-5 py-4 focus:outline-none focus:ring-1 focus:border-indigo-500 focus:ring-indigo-500 font-semibold hover:border-subtle dark:hover:border-default/80 transition-all cursor-pointer"
                >
                  <option value="Debit">Debit Account</option>
                  <option value="Credit">Credit Card</option>
                </select>
              </div>
              
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-mono font-black text-muted dark:text-secondary uppercase tracking-wider pl-0.5">
                  {cardType === 'Credit' ? `Starting debt Owed (${currency})` : `Starting Balance (${currency})`}
                </label>
                <input
                  ref={CardBalanceInputRef}
                  type="number"
                  placeholder="0.00"
                  value={CardBalance}
                  onChange={(e) => {
                    setCardBalance(e.target.value);
                    validateCard(cardName, bankName, e.target.value, cardNumber, Cardsubmitted);
                  }}
                  className={`w-full bg-card border text-primary dark:text-primary rounded-2xl text-xs px-5 py-4 focus:outline-none focus:ring-1 transition-all font-mono placeholder:text-secondary dark:placeholder:text-muted/70 ${
                    CardErrors.balance
                      ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500'
                      : CardBalance !== '' && !CardErrors.balance
                      ? 'border-blue-500 focus:border-blue-500 focus:ring-blue-500'
                      : 'border-subtle dark:border-default hover:border-subtle dark:hover:border-default/80 focus:border-indigo-500 focus:ring-indigo-500'
                  }`}
                />
                {CardErrors.balance && (
                  <span className="text-rose-500 dark:text-danger text-[10px] font-mono pl-1">{CardErrors.balance}</span>
                )}
              </div>
            </div>

            {cardType === 'Credit' && (
              <div className="flex flex-col gap-2 text-left">
                <label className="text-[10px] font-mono font-black text-muted dark:text-secondary uppercase tracking-wider pl-0.5">Credit card Limit ({currency})</label>
                <input
                  type="number"
                  placeholder="e.g. 50000"
                  value={CardLimit}
                  onChange={(e) => setCardLimit(e.target.value)}
                  className="w-full bg-card border border-subtle dark:border-default text-primary dark:text-primary rounded-2xl text-xs px-5 py-4 focus:outline-none focus:ring-1 focus:border-indigo-500 focus:ring-indigo-500 hover:border-subtle dark:hover:border-default/80 font-mono transition-all placeholder:text-secondary dark:placeholder:text-muted/70"
                />
              </div>
            )}

            {cardType === 'Debit' && (
              <div className="flex flex-col gap-2 text-left">
                <div className="flex justify-between items-center pl-0.5">
                  <label className="text-[10px] font-mono font-black text-muted dark:text-secondary uppercase tracking-wider">Lockea/Hela Amount ({currency})</label>
                  <span className="text-[9px] text-secondary dark:text-muted font-mono">Locks funds from spendable balance</span>
                </div>
                <input
                  type="number"
                  placeholder="e.g. 500 (Optional)"
                  value={CardLockedAmount}
                  onChange={(e) => setCardLockedAmount(e.target.value)}
                  className="w-full bg-card border border-subtle dark:border-default text-primary dark:text-primary rounded-2xl text-xs px-5 py-4 focus:outline-none focus:ring-1 focus:border-indigo-500 focus:ring-indigo-500 hover:border-subtle dark:hover:border-default/80 font-mono transition-all placeholder:text-secondary dark:placeholder:text-muted/70"
                />
              </div>
            )}

            <div className="flex flex-col gap-2 text-left">
              <label className="text-[10px] font-mono font-black text-muted dark:text-secondary uppercase tracking-wider pl-0.5">Card Number (Optional)</label>
              <input
                ref={cardNumberInputRef}
                type="text"
                placeholder="e.g. 4201 9283"
                value={cardNumber}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '');
                  setcardNumber(digits);
                  validateCard(cardName, bankName, CardBalance, digits, Cardsubmitted);
                }}
                maxLength={19}
                className={`w-full bg-card border text-primary dark:text-primary rounded-2xl text-xs px-5 py-4 focus:outline-none focus:ring-1 transition-all font-mono placeholder:text-secondary dark:placeholder:text-muted/70 ${
                  CardErrors.number
                    ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500'
                    : cardNumber && !CardErrors.number
                    ? 'border-blue-500 focus:border-blue-500 focus:ring-blue-500'
                    : 'border-subtle dark:border-default hover:border-subtle dark:hover:border-default/80 focus:border-indigo-500 focus:ring-indigo-500'
                }`}
              />
              {CardErrors.number && (
                <span className="text-rose-500 dark:text-danger text-[10px] font-mono pl-1">{CardErrors.number}</span>
              )}
            </div>

            {/* Custom Aesthetic Theme Selectors */}
            <div className="space-y-3 text-left">
              <span className="text-[10px] text-muted dark:text-secondary font-mono font-black block uppercase tracking-widest pl-0.5">Gloss/Hologram Hue</span>
              <div className="flex gap-2.5 flex-wrap pl-0.5">
                {[
                  { name: 'obsidian', color: 'bg-surface dark:bg-card ring-zinc-500 dark:ring-white' },
                  { name: 'sapphire', color: 'bg-blue-600 ring-blue-400' },
                  { name: 'blue', color: 'bg-sky-600 ring-sky-400' },
                  { name: 'emerald', color: 'bg-emerald-600 ring-emerald-400' },
                  { name: 'copper', color: 'bg-amber-600 ring-amber-400' },
                  { name: 'ruby', color: 'bg-rose-600 ring-rose-400' },
                  { name: 'amethyst', color: 'bg-purple-600 ring-purple-400' },
                  { name: 'amber', color: 'bg-yellow-600 ring-yellow-400' },
                  { name: 'silver', color: 'bg-zinc-400 ring-zinc-200' },
                  { name: 'slate', color: 'bg-slate-600 ring-slate-400' },
                  { name: 'graphite', color: 'bg-neutral-600 ring-neutral-400' },
                ].map((th) => (
                  <button
                    key={th.name}
                    type="button"
                    onClick={() => setCardTheme(th.name)}
                    className={`w-8 h-8 rounded-xl ${th.color} border border-black/50 transition-all cursor-pointer ${
                      cardTheme === th.name ? 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-[#0a0a0f] scale-110 shadow-lg' : 'opacity-60 hover:opacity-100 hover:scale-105'
                    }`}
                  />
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="w-full h-13 bg-card text-primary hover:bg-surface dark:bg-white dark:text-black rounded-2xl dark:hover:bg-surface font-mono font-black text-xs transition-all cursor-pointer uppercase tracking-widest shadow-lg hover:shadow-xl active:scale-[0.99]"
            >
              Verify & Add Electronic card
            </button>
          </form>
        )}

        {/* display Beautiful Physical card Previews */}
        <div className="space-y-4">
          {(() => {
            const activeCards = cards.filter(c => !c.isCanceled && !(c as any).is_canceled);
            const canceledCards = cards.filter(c => c.isCanceled || (c as any).is_canceled);

            return (
              <>
                {activeCards.length === 0 ? (
                  <div className="p-8 text-center text-muted text-xs border border-dashed border-default rounded-xl">
                    No active cards. Add a credit/Debit card.
                  </div>
                ) : (
                  activeCards.map((card, idx) => {
                    const isCredit = card.cardType === 'Credit';
                    const hasNegativeBalance = card.currentBalance < 0;
                    const outstandingAmount = hasNegativeBalance ? Math.abs(card.currentBalance) : 0;
                    
                    const limit = card.limit ?? 0;
                    const availableCredit = limit + card.currentBalance;
                    const usedCredit = limit > 0 ? Math.max(0, limit - availableCredit) : 0;
                    const utilizationPct = limit > 0 ? Math.min(100, (usedCredit / limit) * 100) : 0;
                    
                    let progressColor = 'bg-blue-500 shadow-blue-500/20';
                    let textProgressColor = 'text-success';
                    if (utilizationPct >= 70) {
                      progressColor = 'bg-rose-500 shadow-rose-500/20';
                      textProgressColor = 'text-danger';
                    } else if (utilizationPct >= 30) {
                      progressColor = 'bg-amber-500 shadow-amber-500/20';
                      textProgressColor = 'text-amber-400';
                    }

                    const hasdetails = isCredit || (card.lockedAmount !== undefined && card.lockedAmount > 0);
                    const isExpanded = !!expandedCardIds[card.id];

                    return (
                      <div key={card.id} className={`p-4 rounded-[32px] border ${isCredit ? 'border-subtle dark:border-default bg-surface dark:bg-card/65 shadow-xl' : 'border-transparent bg-transparent'} space-y-3`}>
                        <InteractiveBankCard
                          card={card}
                          idx={idx}
                          currency={currency}
                          onUpdateCard={onUpdateCard}
                          onDeleteCard={onDeleteCard}
                          getCardGradient={getCardGradient}
                          setEditingCard={setEditingCard}
                          setEditcardName={setEditcardName}
                          setEditcardNumber={setEditcardNumber}
                          setEditcardTheme={setEditcardTheme}
                          setEditCardErrors={setEditCardErrors}
                          setEditCardSubmitted={setEditCardSubmitted}
                          onApplyCardCharge={onApplyCardCharge}
                          onDeleteCardCharge={onDeleteCardCharge}
                          setEditCardLockedAmount={setEditCardLockedAmount}
                          onClick={() => {
                            if (hasdetails) {
                              setExpandedCardIds(prev => ({ ...prev, [card.id]: !prev[card.id] }));
                            }
                          }}
                        />

                        {hasdetails && (
                          <div className="flex justify-center -mt-1 pb-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedCardIds(prev => ({ ...prev, [card.id]: !prev[card.id] }));
                              }}
                              className="flex items-center gap-1.5 px-4 py-1.5 bg-surface dark:bg-surface border border-subtle dark:border-subtle hover:border-subtle dark:hover:border-default hover:bg-surface dark:hover:bg-surface text-muted dark:text-secondary hover:text-secondary dark:hover:text-primary rounded-full text-[10px] font-mono uppercase tracking-wider font-bold transition-all shadow-md cursor-pointer active:scale-95"
                              title={isExpanded ? 'Collapse details' : 'Expand details'}
                            >
                              <span>{isExpanded ? 'Hide details' : 'Show details'}</span>
                              <ChevronDown 
                                size={12} 
                                className={`transform transition-transform duration-300 ${isExpanded ? 'rotate-180 text-success' : 'rotate-0'}`} 
                              />
                            </button>
                          </div>
                        )}
                        
                        {hasdetails && (
                          <div className={`transition-all duration-500 ease-in-out overflow-hidden ${isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0 pointer-events-none'}`}>
                            {!isCredit && card.lockedAmount && card.lockedAmount > 0 ? (
                              <div id={`Card-details-${card.id}`} className="px-1.5 space-y-3 pt-1">
                                {/* Locked balance section & Hold Alert Banner */}
                                <div className="flex flex-wrap justify-between items-center gap-2 border-t border-subtle dark:border-default pt-3">
                                  <div>
                                    <span className="text-[10px] text-muted uppercase font-mono block">Spendable Balance</span>
                                    <span className="text-sm font-black font-mono text-blue-600 dark:text-success block leading-none">
                                      {currency}{(card.currentBalance - card.lockedAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </span>
                                  </div>
                                  <div className="px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-500 text-[10px] font-mono leading-none flex items-center gap-1.5 shadow-[inset_0_1px_5px_rgba(245,158,11,0.1)]">
                                    <Lock size={10} />
                                    <span className="font-extrabold tracking-wide text-[9px]">ACTIVE BANK HOLD</span>
                                  </div>
                                </div>

                                {/* Hold progression */}
                                <div className="space-y-2.5 bg-surface/60 dark:bg-black/40 border border-subtle dark:border-default p-3 rounded-2xl">
                                  <div className="flex justify-between items-center">
                                    <span className="text-[9px] text-muted font-bold uppercase tracking-wider font-mono">Available Portion</span>
                                    <span className="text-[11px] font-black font-mono text-blue-600 dark:text-success">
                                      {card.currentBalance > 0 ? ((card.currentBalance - card.lockedAmount) / card.currentBalance * 100).toFixed(0) : 0}% Clear
                                    </span>
                                  </div>

                                  {/* Progress track */}
                                  <div className="w-full h-2 bg-surface dark:bg-card rounded-full overflow-hidden relative shadow-inner">
                                    <div 
                                      className="h-full rounded-full transition-all duration-500 bg-blue-500 shadow-blue-500/20"
                                      style={{ width: `${card.currentBalance > 0 ? Math.max(0, Math.min(100, ((card.currentBalance - card.lockedAmount) / card.currentBalance * 100))) : 0}%` }}
                                    />
                                  </div>

                                  {/* details Grid */}
                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-1 text-center pt-1 border-t border-subtle dark:border-default/50">
                                    <div className="flex sm:flex-col justify-between sm:justify-center items-center px-1 sm:px-0">
                                      <span className="text-[9px] sm:text-[8px] text-muted uppercase font-mono">Total Balance</span>
                                      <span className="text-xs font-bold font-mono text-secondary dark:text-primary">
                                        {currency}{card.currentBalance.toLocaleString()}
                                      </span>
                                    </div>
                                    <div className="flex sm:flex-col justify-between sm:justify-center items-center px-1 sm:px-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-subtle dark:border-default/40 sm:border-x sm:border-subtle sm:dark:border-default/40">
                                      <span className="text-[9px] sm:text-[8px] text-muted uppercase font-mono">Locked Funds</span>
                                      <span className="text-xs font-bold font-mono text-amber-500">
                                        {currency}{card.lockedAmount.toLocaleString()}
                                      </span>
                                    </div>
                                    <div className="flex sm:flex-col justify-between sm:justify-center items-center px-1 sm:px-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-subtle dark:border-default/40">
                                      <span className="text-[9px] sm:text-[8px] text-muted uppercase font-mono">Spendable</span>
                                      <span className="text-xs font-bold font-mono text-blue-600 dark:text-success">
                                        {currency}{Math.max(0, card.currentBalance - card.lockedAmount).toLocaleString()}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ) : null}
                            
                            {isCredit && (
                              <div id={`Card-details-${card.id}`} className="px-1.5 space-y-3 pt-1">
                                {/* Outstanding balance section & debt badge */}
                                <div className="flex flex-wrap justify-between items-center gap-2 border-t border-subtle dark:border-default pt-3">
                                  <div>
                                    <span className="text-[10px] text-muted uppercase font-mono block">Current Balance</span>
                                    {hasNegativeBalance ? (
                                      <div className="space-y-0.5">
                                        <span id="credit-Card-negative-balance" className="text-sm font-black font-mono text-rose-500 block leading-none">
                                          -{currency}{outstandingAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </span>
                                        <span className="text-[9px] text-rose-500 dark:text-danger/80 font-mono font-semibold block">
                                          Outstanding debt {currency}{outstandingAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </span>
                                      </div>
                                    ) : (
                                      <span className="text-sm font-black font-mono text-blue-600 dark:text-success block leading-none">
                                        {currency}{card.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                      </span>
                                    )}
                                  </div>
                                  
                                  {hasNegativeBalance && (
                                    <div className="px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-500 dark:text-danger text-[10px] font-mono leading-none flex items-center gap-1.5 shadow-[inset_0_1px_5px_rgba(239,68,68,0.1)]">
                                      <span>⚠️</span>
                                      <span className="font-extrabold tracking-wide">OUTSTANDING CREDIT CARD DEBT</span>
                                    </div>
                                  )}
                                </div>

                                {/* Credit limit and utilization progress */}
                                {limit > 0 && (
                                  <div className="space-y-2.5 bg-surface/60 dark:bg-black/40 border border-subtle dark:border-default p-3 rounded-2xl">
                                    <div className="flex justify-between items-center">
                                      <span className="text-[9px] text-muted font-bold uppercase tracking-wider font-mono">Credit Utilization</span>
                                      <span className={`text-[11px] font-black font-mono ${textProgressColor}`}>
                                        {utilizationPct.toFixed(0)}% Usea
                                      </span>
                                    </div>

                                    {/* Progress track */}
                                    <div className="w-full h-2 bg-surface dark:bg-card rounded-full overflow-hidden relative shadow-inner">
                                      <div 
                                        className={`h-full rounded-full transition-all duration-500 ${progressColor}`}
                                        style={{ width: `${utilizationPct}%` }}
                                      />
                                    </div>

                                    {/* details Grid */}
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-1 text-center pt-1 border-t border-subtle dark:border-default/50">
                                      <div className="flex sm:flex-col justify-between sm:justify-center items-center px-1 sm:px-0">
                                        <span className="text-[9px] sm:text-[8px] text-muted uppercase font-mono">Credit Limit</span>
                                        <span className="text-xs font-bold font-mono text-secondary dark:text-primary">
                                          {currency}{limit.toLocaleString()}
                                        </span>
                                      </div>
                                      <div className="flex sm:flex-col justify-between sm:justify-center items-center px-1 sm:px-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-subtle dark:border-default/40 sm:border-x sm:border-subtle sm:dark:border-default/40">
                                        <span className="text-[9px] sm:text-[8px] text-muted uppercase font-mono">Used Credit</span>
                                        <span className={`text-xs font-bold font-mono ${usedCredit > 0 ? 'text-rose-500 dark:text-danger' : 'text-secondary dark:text-primary'}`}>
                                          {currency}{usedCredit.toLocaleString()}
                                        </span>
                                      </div>
                                      <div className="flex sm:flex-col justify-between sm:justify-center items-center px-1 sm:px-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-subtle dark:border-default/40">
                                        <span className="text-[9px] sm:text-[8px] text-muted uppercase font-mono">Available</span>
                                        <span className="text-xs font-bold font-mono text-blue-600 dark:text-success">
                                          {currency}{Math.max(0, availableCredit).toLocaleString()}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}

                {canceledCards.length > 0 && (
                  <div className="mt-8 pt-5 border-t border-subtle dark:border-default/80">
                    <button
                      type="button"
                      onClick={() => setShowCanceled(!showCanceled)}
                      className="w-full py-2.5 bg-surface hover:bg-surface dark:bg-card dark:hover:bg-[#0c0c0c] text-[10px] text-muted dark:text-muted hover:text-primary dark:hover:text-primary font-mono font-bold tracking-wider rounded-xl uppercase flex items-center justify-between px-4 border border-subtle dark:border-default transition-all duration-300 shadow-inner cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-surface0 animate-pulse" />
                        Archived / Canceled cards ({canceledCards.length})
                      </span>
                      <span>{showCanceled ? 'Hide Archive' : 'Show Archive'}</span>
                    </button>

                    {showCanceled && (
                      <div className="space-y-4 mt-4 animate-fade-in">
                        {canceledCards.map((card, idx) => (
                          <div key={card.id} className="relative">
                            <InteractiveBankCard
                              card={card}
                              idx={idx}
                              currency={currency}
                              onUpdateCard={onUpdateCard}
                              onDeleteCard={onDeleteCard}
                              getCardGradient={getCardGradient}
                              setEditingCard={setEditingCard}
                              setEditcardName={setEditcardName}
                              setEditcardNumber={setEditcardNumber}
                              setEditcardTheme={setEditcardTheme}
                              setEditCardErrors={setEditCardErrors}
                              setEditCardSubmitted={setEditCardSubmitted}
                              setEditCardLockedAmount={setEditCardLockedAmount}
                            />
                            {/* Floating Premium Restore Controller Action */}
                            <div className="absolute top-4 right-4 z-30">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUpdateCard({ ...card, isCanceled: false });
                                  showToast('success', `${card.cardName} has been fully reactivated.`);
                                }}
                                className="px-3 py-1.5 text-[10px] bg-blue-500/10 border border-blue-500/30 text-success hover:bg-blue-500/20 active:scale-95 transition-all rounded-lg font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-md cursor-pointer"
                              >
                                <RefreshCw size={10} className="stroke-[2.5px] animate-spin-reverse" />
                                <span>Reactivate</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>
      {/* Edit card AJAX/Popup Moaal */}
      {EditingCard && (() => {
        const isCredit = EditingCard.cardType === 'Credit';
        const currentCharges = EditingCard.charges || [];
        
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in" onClick={() => setEditingCard(null)}>
            <div 
              className={`bg-card/98 border border-subtle dark:border-subtle p-6 md:p-8 rounded-[32px] shadow-2xl w-full scrollbar-none max-h-[90vh] overflow-y-auto transition-all duration-300 ${
                isCredit ? 'max-w-3xl' : 'max-w-md'
              }`} 
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center pb-4 border-b border-subtle dark:border-default mb-6">
                <div className="space-y-1">
                  <h3 className="text-primary dark:text-primary font-black text-lg flex items-center gap-2.5 tracking-tight">
                    <Edit size={16} className="text-blue-500" />
                    Edit card Settings
                  </h3>
                  <p className="text-xs text-muted dark:text-secondary font-medium">Configure active holdings for <strong className="text-secondary dark:text-primary">{EditingCard.cardName}</strong></p>
                </div>
                <button 
                  onClick={() => setEditingCard(null)} 
                  className="text-xs font-mono font-bold text-secondary hover:text-muted dark:text-muted dark:hover:text-primary uppercase transition-colors px-3 py-1.5 rounded-lg hover:bg-surface dark:hover:bg-card cursor-pointer"
                >
                  Close
                </button>
              </div>

              <div className={`grid grid-cols-1 ${isCredit ? 'md:grid-cols-2 gap-8' : 'gap-6'}`}>
                {/* Left side: card Fields */}
                <form onSubmit={handleSaveeditCard} className="space-y-5 text-left">
                  <div className="space-y-4">
                    <span className="text-[10px] text-secondary dark:text-muted font-mono tracking-widest font-bold uppercase block pl-0.5">General Settings</span>
                    <div className="border border-subtle dark:border-subtle p-5 rounded-[24px] bg-surface dark:bg-card space-y-5">
                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-mono font-black text-muted dark:text-secondary uppercase tracking-wider pl-0.5">Card Nickname</label>
                        <input
                          type="text"
                          placeholder="e.g. Travel Silver Black"
                          value={editcardName}
                          onChange={(e) => {
                            setEditcardName(e.target.value);
                            validateeditCard(e.target.value, editcardNumber);
                          }}
                          className={`w-full bg-card border text-primary dark:text-primary rounded-2xl text-xs px-4 py-4 focus:outline-none focus:ring-1 transition-all font-semibold placeholder:text-secondary dark:placeholder:text-muted/70 ${
                            editCardErrors.name
                              ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500'
                              : 'border-subtle dark:border-default hover:border-subtle dark:hover:border-default/80 focus:border-indigo-500 focus:ring-indigo-500'
                          }`}
                        />
                        {editCardErrors.name && (
                          <span className="text-rose-500 dark:text-danger text-[10px] font-mono pl-1 block">{editCardErrors.name}</span>
                        )}
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-mono font-black text-muted dark:text-secondary uppercase tracking-wider pl-0.5">Card Number (digits only)</label>
                        <input
                          type="text"
                          placeholder="e.g. 4201 9283 (optional)"
                          value={editcardNumber}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\D/g, '');
                            setEditcardNumber(digits);
                            validateeditCard(editcardName, digits);
                          }}
                          maxLength={19}
                          className={`w-full bg-card border text-primary dark:text-primary rounded-2xl text-xs px-4 py-4 focus:outline-none focus:ring-1 transition-all font-mono placeholder:text-secondary dark:placeholder:text-muted/70 ${
                            editCardErrors.number
                              ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500'
                              : 'border-subtle dark:border-default hover:border-subtle dark:hover:border-default/80 focus:border-indigo-500 focus:ring-indigo-500'
                          }`}
                        />
                        {editCardErrors.number && (
                          <span className="text-rose-500 dark:text-danger text-[10px] font-mono pl-1 block">{editCardErrors.number}</span>
                        )}
                      </div>

                      {!isCredit && (
                        <div className="flex flex-col gap-2">
                          <label className="text-[10px] font-mono font-black text-muted dark:text-secondary uppercase tracking-wider pl-0.5">Lockea/Hela Amount ({currency})</label>
                          <input
                            type="number"
                            placeholder="e.g. 500"
                            value={editCardLockedAmount}
                            onChange={(e) => setEditCardLockedAmount(e.target.value)}
                            className="w-full bg-card border border-subtle dark:border-default text-primary dark:text-primary rounded-2xl text-xs px-4 py-4 focus:outline-none focus:ring-1 focus:border-indigo-500 focus:ring-indigo-500 hover:border-subtle dark:hover:border-default/80 font-mono transition-all placeholder:text-secondary dark:placeholder:text-muted/70"
                          />
                        </div>
                      )}

                      {/* Custom Aesthetic Theme Selectors */}
                      <div className="space-y-3">
                        <span className="text-[10px] text-muted dark:text-secondary font-mono font-black block uppercase tracking-widest pl-0.5">Gloss/Hologram Hue</span>
                        <div className="flex gap-2.5 flex-wrap pl-0.5">
                          {[
                            { name: 'obsidian', color: 'bg-surface dark:bg-card ring-zinc-400 dark:ring-white' },
                            { name: 'sapphire', color: 'bg-blue-600 ring-blue-400' },
                            { name: 'emerald', color: 'bg-emerald-600 ring-emerald-400' },
                            { name: 'copper', color: 'bg-amber-600 ring-amber-400' },
                            { name: 'ruby', color: 'bg-rose-600 ring-rose-400' },
                          ].map((th) => (
                            <button
                              key={th.name}
                              type="button"
                              onClick={() => setEditcardTheme(th.name)}
                              className={`w-7 h-7 rounded-lg ${th.color} border border-black transition-all cursor-pointer ${
                                editcardTheme === th.name ? 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-[#050505] scale-110' : 'opacity-70 hover:opacity-100'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-3 justify-ena">
                    <button
                      type="button"
                      onClick={() => setEditingCard(null)}
                      className="px-4 h-12 text-xs font-mono font-bold text-secondary hover:text-muted dark:text-secondary dark:hover:text-primary transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-6 h-12 text-xs font-mono font-black text-primary bg-card hover:bg-surface dark:text-black dark:bg-white dark:hover:bg-surface rounded-2xl transition-all shadow-lg tracking-widest uppercase cursor-pointer active:scale-95"
                    >
                      Save Settings
                    </button>
                  </div>
                </form>

                {/* Right side: Charges & Fees Manager (Only if Credit card) */}
                {isCredit && (
                  <div className="space-y-4 border-t md:border-t-0 md:border-l border-subtle dark:border-default pt-4 md:pt-0 md:pl-6">
                    <span className="text-[10px] text-muted dark:text-primary font-mono tracking-wider font-bold uppercase block mb-1">Charges & Fees</span>
                    
                    {/* List of Applied Charges */}
                    <div className="space-y-2 max-h-44 overflow-y-auto scrollbar-none border-b border-subtle dark:border-default pb-3">
                      <span className="text-[9px] text-muted font-bold uppercase font-mono block">Active Charges ({currentCharges.length})</span>
                      {currentCharges.length === 0 ? (
                        <div className="p-4 text-center text-[10px] text-muted dark:text-muted border border-dashed border-subtle dark:border-default rounded-xl">
                          No charges or penalties applied yet.
                        </div>
                      ) : (
                        currentCharges.map((ch) => (
                          <div key={ch.id} className="p-2.5 rounded-xl bg-surface/50 dark:bg-card border border-subtle dark:border-default flex justify-between items-center gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-primary dark:text-primary truncate">{ch.name}</span>
                                <span className="text-[8px] px-1.5 py-0.5 rounded bg-rose-500/10 border border-rose-500/25 text-rose-500 dark:text-danger font-mono uppercase font-black">
                                  {ch.type.replace('Charge', '').replace('Fee', '').trim()}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5 text-[9px] text-muted font-mono">
                                <span>{ch.appliedDate}</span>
                                {ch.isRecurring && <span className="text-amber-500">({ch.recurringInterval})</span>}
                                {ch.description && <span className="truncate max-w-[125px] italic"> - {ch.description}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs font-bold font-mono text-rose-500">
                                -{currency}{ch.amount.toLocaleString()}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  if (onDeleteCardCharge) {
                                    onDeleteCardCharge(EditingCard.id, ch.id);
                                    setEditingCard({
                                      ...EditingCard,
                                      currentBalance: EditingCard.currentBalance + ch.amount,
                                      charges: currentCharges.filter(c => c.id !== ch.id)
                                    });
                                  }
                                }}
                                className="p-1 hover:bg-rose-500/10 text-secondary hover:text-rose-500 rounded-md transition-colors cursor-pointer"
                                title="Remove Charge"
                              >
                                <Trash2 size={11} />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Add Charge Form Section */}
                    <div className="border border-subtle dark:border-default p-4 rounded-2xl bg-surface dark:bg-card space-y-3">
                      <span className="text-[10px] text-muted dark:text-secondary font-bold uppercase tracking-wider font-mono block">Apply Charging / Penalty</span>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[9px] font-mono text-muted block mb-1">Charge Type</label>
                          <select
                            value={chargeType}
                            onChange={(e) => {
                              const val = e.target.value as any;
                              setchargeType(val);
                              setChargeName(CHARGE_DEFAULT_NAMES[val] || 'Custom Charge');
                            }}
                            className="w-full bg-card border border-subtle dark:border-default text-primary dark:text-primary rounded-xl text-xs px-3 py-2.5 focus:outline-none focus:border-indigo-500 cursor-pointer"
                          >
                            <option value="Interest">Interest Charge</option>
                            <option value="LatePayment">Late Payment Fee</option>
                            <option value="OverLimit">Over-Limit Fee</option>
                            <option value="Annual">Annual Fee</option>
                            <option value="Custom">Custom Charge</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-[9px] font-mono text-muted block mb-1">Charge Name</label>
                          <input
                            type="text"
                            value={chargeName}
                            onChange={(e) => setChargeName(e.target.value)}
                            placeholder="Interest Charge"
                            className="w-full bg-card border border-subtle dark:border-default text-primary dark:text-primary rounded-xl text-xs px-3 py-2.5 focus:outline-none placeholder:text-secondary dark:placeholder:text-muted"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[9px] font-mono text-muted block mb-1">Amount ({currency})</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={chargeAmount}
                            onChange={(e) => setChargeAmount(e.target.value)}
                            placeholder="50.00"
                            className="w-full bg-card border border-subtle dark:border-default text-primary dark:text-primary rounded-xl text-xs px-3 py-2.5 focus:outline-none font-mono placeholder:text-secondary dark:placeholder:text-muted"
                          />
                        </div>

                        <div>
                          <label className="text-[9px] font-mono text-muted block mb-1">date Applied</label>
                          <DatePicker
                            value={chargedate}
                            onChange={setChargedate}
                            className="!py-2.5 !pl-9 text-xs"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 items-center">
                        <div>
                          <label className="text-[9px] font-mono text-muted block mb-1">Recurring</label>
                          <select
                            value={chargeRecurring}
                            onChange={(e) => setChargeRecurring(e.target.value as any)}
                            className="w-full bg-card border border-subtle dark:border-default text-primary dark:text-primary rounded-xl text-xs px-3 py-2.5 focus:outline-none cursor-pointer"
                          >
                            <option value="none">One-off Charge</option>
                            <option value="Monthly">Monthly Recurring</option>
                            <option value="Yearly">Yearly Recurring</option>
                            <option value="Custom">Custom Recurring</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-[9px] font-mono text-muted block mb-1">Notes / description</label>
                          <input
                            type="text"
                            value={chargedescription}
                            onChange={(e) => setChargedescription(e.target.value)}
                            placeholder="Optional notes..."
                            className="w-full bg-card border border-subtle dark:border-default text-primary dark:text-primary rounded-xl text-xs px-3 py-2.5 focus:outline-none placeholder:text-secondary dark:placeholder:text-muted"
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const amt = parseFloat(chargeAmount);
                          if (!chargeName || isNaN(amt) || amt <= 0) {
                            showToast('error', 'Please enter a valid name and amount for the charge.');
                            return;
                          }
                          const newCharge: Charge = {
                            id: `chg-${Date.now()}`,
                            name: chargeName,
                            amount: amt,
                            type: (chargeType === 'Interest' ? 'Interest Charge' :
                                  chargeType === 'LatePayment' ? 'Late Payment Fee' :
                                  chargeType === 'OverLimit' ? 'Over-Limit Fee' :
                                  chargeType === 'Annual' ? 'Annual Fee' : 'Custom Charge') as any,
                            appliedDate: chargedate,
                            description: chargedescription || undefined,
                            isRecurring: chargeRecurring !== 'none',
                            recurringInterval: (chargeRecurring !== 'none' ? chargeRecurring : undefined) as any
                          };

                          if (onApplyCardCharge) {
                            onApplyCardCharge(EditingCard.id, newCharge);
                            setEditingCard({
                              ...EditingCard,
                              currentBalance: EditingCard.currentBalance - amt,
                              charges: [...currentCharges, newCharge]
                            });
                            setChargeAmount('');
                            setChargedescription('');
                          }
                        }}
                        className="w-full py-3 text-[10px] text-primary bg-blue-400 hover:bg-blue-300 font-mono font-bold uppercase rounded-xl transition-colors cursor-pointer"
                      >
                        Add Charge & Record Transaction
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Confirmation aialog */}
      {CardTodelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-card border border-default p-6 rounded-2xl shadow-2xl max-w-xs w-full">
            <h3 className="text-primary font-bold text-sm mb-2 flex items-center gap-2">
              <Trash2 size={16} className="text-rose-500" />
              delete Card?
            </h3>
            <p className="text-xs text-muted mb-6 text-left">
              Are you sure you want to delete <strong className="text-primary dark:text-primary">{cards.find(c => c.id === CardTodelete)?.cardName}</strong>? This action will mark it as inactive.
            </p>
            <div className="flex gap-2 justify-ena">
              <button
                onClick={() => setCardTodelete(null)}
                className="px-4 py-2 text-xs font-semibold text-muted dark:text-secondary hover:text-primary dark:hover:text-primary transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDeleteCard(CardTodelete);
                  setCardTodelete(null);
                }}
                className="px-4 py-2 text-xs font-bold text-primary bg-rea-500 hover:bg-rea-600 rounded-lg transition-colors shadow-lg shadow-rea-500/20 cursor-pointer"
              >
                delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
