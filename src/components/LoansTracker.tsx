import React, { useState } from 'react';
import { LoanGiven, LoanSettlement, CashAccount, BankCard } from '../types';
import { 
  Plus, CheckCircle2, AlertCircle, Sparkles, Calendar, Receipt, 
  ArrowUpRight, ArrowDownLeft, Trash2, HelpCircle, TrendingUp, DollarSign, Wallet, History, CreditCard, ChevronDown, ChevronUp
} from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';
import { DatePicker } from './DatePicker';

interface LoansTrackerProps {
  loans: LoanGiven[];
  cashAccounts: CashAccount[];
  cards: BankCard[];
  onAddLoan: (loan: Omit<LoanGiven, 'id' | 'remainingAmount' | 'status' | 'settlements'>, bankCharge?: number) => void;
  onAddSettlement: (loanId: string, amount: number, receivedInId: string, receivedInType: 'cash' | 'card', receivedInName: string, bankCharge?: number) => void;
  onDeleteLoan: (loanId: string) => void;
  onIncreaseLoan: (
    loanId: string,
    amount: number,
    sourceAccountId: string,
    sourceAccountType: 'cash' | 'card',
    sourceAccountName: string,
    notes?: string,
    bankCharge?: number
  ) => void;
  currency: string;
}

export default function LoansTracker({
  loans = [],
  cashAccounts = [],
  cards = [],
  onAddLoan,
  onAddSettlement,
  onDeleteLoan,
  onIncreaseLoan,
  currency,
}: LoansTrackerProps) {
  const { showConfirm, showToast } = useNotifications();

  // Give Loan form states
  const [isGivingLoan, setIsGivingLoan] = useState(false);
  const [borrowerName, setBorrowerName] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [dateGiven, setDateGiven] = useState(new Date().toISOString().split('T')[0]);
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [sourceAccountType, setSourceAccountType] = useState<'cash' | 'card'>('cash');
  const [giveLoanBankCharge, setGiveLoanBankCharge] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Lend More states
  const [increasingLoanId, setIncreasingLoanId] = useState<string | null>(null);
  const [increaseAmount, setIncreaseAmount] = useState('');
  const [increaseSourceId, setIncreaseSourceId] = useState('');
  const [increaseSourceType, setIncreaseSourceType] = useState<'cash' | 'card'>('cash');
  const [increaseNotes, setIncreaseNotes] = useState('');
  const [increaseLoanBankCharge, setIncreaseLoanBankCharge] = useState('');
  const [increaseError, setIncreaseError] = useState<string | null>(null);

  // Settlement Form states (which loan is currently receiving a settlement)
  const [settlingLoanId, setSettlingLoanId] = useState<string | null>(null);
  const [settlementAmount, setSettlementAmount] = useState('');
  const [settlementDate, setSettlementDate] = useState(new Date().toISOString().split('T')[0]);
  const [receivedInId, setReceivedInId] = useState('');
  const [receivedInType, setReceivedInType] = useState<'cash' | 'card'>('cash');
  const [settleLoanBankCharge, setSettleLoanBankCharge] = useState('');
  const [settlementError, setSettlementError] = useState<string | null>(null);

  // Expanded list states to view settlement history for a loan
  const [expandedLoanId, setExpandedLoanId] = useState<string | null>(null);

  // Combine cash accounts and debit cards for source/dest select options
  const availableAccounts = [
    ...cashAccounts.map(acc => ({ id: acc.id, name: `${acc.name} (Wallet)`, balance: acc.balance, type: 'cash' as const })),
    ...cards.map(c => ({ id: c.id, name: `${c.bankName} - ${c.cardName} (${c.cardType})`, balance: c.currentBalance, type: 'card' as const })),
  ];

  // Set default source account once loaded
  React.useEffect(() => {
    if (availableAccounts.length > 0 && !sourceAccountId) {
      setSourceAccountId(availableAccounts[0].id);
      setSourceAccountType(availableAccounts[0].type);
    }
  }, [cashAccounts, cards]);

  // Set default increase account once loaded
  React.useEffect(() => {
    if (availableAccounts.length > 0 && !increaseSourceId) {
      setIncreaseSourceId(availableAccounts[0].id);
      setIncreaseSourceType(availableAccounts[0].type);
    }
  }, [cashAccounts, cards, increasingLoanId]);

  // Set default received account once loaded for settlement
  React.useEffect(() => {
    if (availableAccounts.length > 0 && !receivedInId) {
      setReceivedInId(availableAccounts[0].id);
      setReceivedInType(availableAccounts[0].type);
    }
  }, [cashAccounts, cards, settlingLoanId]);

  // Calculations
  const activeLoans = loans.filter(l => l.status !== 'Settled');
  const totalLentAmount = loans.reduce((acc, l) => acc + l.totalAmount, 0);
  const totalRemainingAmount = loans.reduce((acc, l) => acc + l.remainingAmount, 0);
  const totalRecoveredAmount = totalLentAmount - totalRemainingAmount;

  const validateLoanForm = () => {
    const errs: Record<string, string> = {};
    if (!borrowerName.trim()) {
      errs.borrowerName = 'Borrower name is required.';
    } else if (borrowerName.trim().length < 2) {
      errs.borrowerName = 'Borrower name must be at least 2 characters.';
    }

    if (!totalAmount || isNaN(parseFloat(totalAmount)) || parseFloat(totalAmount) <= 0) {
      errs.totalAmount = 'Please enter a valid amount larger than zero.';
    } else {
      // Optional balance check warning
      const targetAcc = availableAccounts.find(a => a.id === sourceAccountId && a.type === sourceAccountType);
      const chargeNum = sourceAccountType === 'card' ? (parseFloat(giveLoanBankCharge) || 0) : 0;
      if (targetAcc && targetAcc.balance < parseFloat(totalAmount) + chargeNum) {
        errs.totalAmount = `Note: Selected account has insufficient balance (${currency} ${targetAcc.balance.toLocaleString()}) to cover loan and bank charges. Proceeding will overdraft account.`;
      }
    }

    if (!dateGiven) {
      errs.dateGiven = 'Date given is required.';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleGiveLoanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateLoanForm()) {
      showToast('error', 'Please resolve highlighted errors before proceeding.');
      return;
    }

    const selectedAcc = availableAccounts.find(a => a.id === sourceAccountId && a.type === sourceAccountType);
    const sourceName = selectedAcc ? selectedAcc.name : 'Unknown Account';
    const chargeVal = sourceAccountType === 'card' ? (parseFloat(giveLoanBankCharge) || 0) : 0;

    onAddLoan({
      borrowerName: borrowerName.trim(),
      totalAmount: parseFloat(totalAmount),
      dateGiven,
      sourceAccountId,
      sourceAccountType,
      sourceAccountName: sourceName,
      notes: notes.trim() || 'No extra notes provided.',
    }, chargeVal);

    // Reset Form
    setBorrowerName('');
    setTotalAmount('');
    setGiveLoanBankCharge('');
    setNotes('');
    setIsGivingLoan(false);
    setErrors({});
    showToast('success', 'Smart Loan tracked successfully! Account balances auto-debited.');
  };

  const handleSettleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSettlementError(null);
    if (!settlingLoanId) return;

    const currentLoan = loans.find(l => l.id === settlingLoanId);
    if (!currentLoan) return;

    const amt = parseFloat(settlementAmount);
    if (isNaN(amt) || amt <= 0) {
      setSettlementError('Repayment amount must be larger than zero.');
      return;
    }

    if (amt > currentLoan.remainingAmount) {
      setSettlementError(`Repayment exceeds outstanding loan balance (${currency} ${currentLoan.remainingAmount.toLocaleString()}).`);
      return;
    }

    const destAcc = availableAccounts.find(a => a.id === receivedInId && a.type === receivedInType);
    const destName = destAcc ? destAcc.name : 'Unknown Account';
    const chargeVal = receivedInType === 'card' ? (parseFloat(settleLoanBankCharge) || 0) : 0;

    onAddSettlement(
      settlingLoanId,
      amt,
      receivedInId,
      receivedInType,
      destName,
      chargeVal
    );

    // Reset
    setSettlementAmount('');
    setSettleLoanBankCharge('');
    setSettlingLoanId(null);
    showToast('success', `Logged settlement of ${currency} ${amt.toLocaleString()} successfully credited into ${destName}.`);
  };

  const handleIncreaseSubmit = (e: React.FormEvent, loan: LoanGiven) => {
    e.preventDefault();
    setIncreaseError(null);

    const amt = parseFloat(increaseAmount);
    if (isNaN(amt) || amt <= 0) {
      setIncreaseError('Additional lent amount must be larger than zero.');
      return;
    }

    const selectedAcc = availableAccounts.find(a => a.id === increaseSourceId && a.type === increaseSourceType);
    const sourceName = selectedAcc ? selectedAcc.name : 'Unknown Account';
    const chargeVal = increaseSourceType === 'card' ? (parseFloat(increaseLoanBankCharge) || 0) : 0;

    if (selectedAcc && selectedAcc.balance < amt + chargeVal) {
      setIncreaseError(`Insufficient balance! Available: ${currency} ${selectedAcc.balance.toLocaleString()} to cover loan add-on of ${currency} ${(amt + chargeVal).toLocaleString()}.`);
      return;
    }

    onIncreaseLoan(
      loan.id,
      amt,
      increaseSourceId,
      increaseSourceType,
      sourceName,
      increaseNotes.trim() || 'Additional capital lent',
      chargeVal
    );

    // Reset Form
    setIncreaseAmount('');
    setIncreaseLoanBankCharge('');
    setIncreaseNotes('');
    setIncreasingLoanId(null);
  };

  const handleDeleteLoanClick = (loanId: string, name: string) => {
    showConfirm({
      message: `Are you sure you want to remove the loan tracker for "${name}"? This action will skip financial rollbacks and simply purge records.`,
      onConfirm: () => {
        onDeleteLoan(loanId);
        showToast('info', 'Loan tracker purged from security records.');
      }
    });
  };

  return (
    <div className="space-y-6" id="loans-section-wrapper">
      
      {/* STATISTICS PANEL */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" id="loans-stats-panel">
        <div className="bg-card/40 p-5 rounded-2xl border border-default flex items-center gap-4">
          <div className="p-3 bg-amber-500/10 rounded-xl text-amber-400 border border-amber-950/40">
            <TrendingUp size={20} />
          </div>
          <div>
            <span className="text-[10px] text-muted font-bold uppercase block font-mono">Outstanding Receivable</span>
            <span className="text-xl font-extrabold text-primary">
              {currency} {totalRemainingAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <div className="bg-card/40 p-5 rounded-2xl border border-default flex items-center gap-4">
          <div className="p-3 bg-[var(--accent-primary)]/10 rounded-xl text-[var(--accent-primary)] border border-[var(--accent-primary)]/40">
            <ArrowUpRight size={20} />
          </div>
          <div>
            <span className="text-[10px] text-muted font-bold uppercase block font-mono">Total Capital Lent</span>
            <span className="text-xl font-extrabold text-primary">
              {currency} {totalLentAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <div className="bg-card/40 p-5 rounded-2xl border border-default flex items-center gap-4">
          <div className="p-3 bg-primary rounded-xl text-[var(--accent-primary)] border border-[var(--accent-primary)]/40">
            <ArrowDownLeft size={20} />
          </div>
          <div>
            <span className="text-[10px] text-muted font-bold uppercase block font-mono">Total Recovered Vaults</span>
            <span className="text-xl font-extrabold text-emerald-500 font-bold">
              {currency} {totalRecoveredAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>

      {/* NEW LOAN ENTRY FORM */}
      {isGivingLoan && (
        <form onSubmit={handleGiveLoanSubmit} className="bg-card border border-default p-6 md:p-8 rounded-[24px] space-y-5 animate-fade-in relative overflow-hidden text-left" id="add-loan-form-panel">
          <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-[var(--accent-primary)]/30 to-transparent" />
          <div className="flex items-center gap-2 mb-2 text-[var(--accent-primary)]">
            <Sparkles size={14} className="text-[var(--accent-primary)] animate-spin" />
            <h3 className="text-xs font-black uppercase tracking-wider text-[var(--accent-primary)] font-mono">Vault Asset Loan Dispatch Agreement</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            
            {/* Borrower Name */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-secondary font-mono font-black uppercase tracking-wider block pl-0.5">Borrower Name (Debtor)</label>
              <input
                type="text"
                placeholder="e.g. John Doe, Alice Smith"
                value={borrowerName}
                onChange={(e) => setBorrowerName(e.target.value)}
                className="w-full bg-surface border border-default rounded-2xl py-3.5 px-4 text-xs font-medium text-primary focus:outline-none focus:ring-1 focus:border-indigo-500 focus:ring-indigo-500 transition-colors placeholder:text-muted"
                required
              />
              {errors.borrowerName && <p className="text-[10px] text-rose-455 font-mono font-semibold mt-1.5 block pl-1">{errors.borrowerName}</p>}
            </div>

            {/* Total Principal Amount */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-secondary font-mono font-black uppercase tracking-wider block pl-0.5">Principal Amount Lent ({currency})</label>
              <input
                type="number"
                step="any"
                placeholder="0.00"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                className="w-full bg-surface border border-default rounded-2xl py-3.5 px-4 text-xs font-mono text-primary focus:outline-none focus:ring-1 focus:border-indigo-500 focus:ring-indigo-500 transition-colors placeholder:text-muted"
                required
              />
              {errors.totalAmount && <p className="text-[10px] text-amber-500 font-mono font-semibold mt-1.5 block pl-1 leading-normal">{errors.totalAmount}</p>}
            </div>

            {/* Source Debit Ledger Account */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-secondary font-mono font-black uppercase tracking-wider block pl-0.5">Debit Funds From Account</label>
              <select
                value={`${sourceAccountId}:${sourceAccountType}`}
                onChange={(e) => {
                  const [id, type] = e.target.value.split(':');
                  setSourceAccountId(id);
                  setSourceAccountType(type as 'cash' | 'card');
                }}
                className="w-full bg-surface border border-default rounded-2xl py-3.5 px-3.5 text-xs font-semibold text-primary focus:outline-none focus:ring-1 focus:border-indigo-500 focus:ring-indigo-500 transition-colors cursor-pointer"
              >
                {availableAccounts.length === 0 ? (
                  <option value="">No Accounts Found</option>
                ) : (
                  availableAccounts.map(acc => (
                    <option key={`${acc.id}:${acc.type}`} value={`${acc.id}:${acc.type}`}>
                      {acc.name} - ({currency} {acc.balance.toLocaleString()})
                    </option>
                  ))
                )}
              </select>
            </div>

            {sourceAccountType === 'card' && sourceAccountId && (
              <div className="space-y-1.5 animate-fade-in md:col-span-3 bg-surface/60 p-4 border border-default rounded-2xl">
                <label className="text-[10px] text-secondary font-mono font-black uppercase tracking-wider block pl-0.5">Optional Bank Card Charge ({currency})</label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 150 (Leave blank or 0 if none)"
                  value={giveLoanBankCharge}
                  onChange={(e) => setGiveLoanBankCharge(e.target.value)}
                  className="w-full bg-surface border border-default rounded-2xl py-3 px-4 text-xs text-primary focus:outline-none focus:ring-1 focus:border-indigo-500 focus:ring-indigo-500 font-mono"
                />
                <p className="text-[9.5px] text-muted font-mono pl-0.5 leading-normal">Lending from a bank card might trigger fees. Entering a charge will record the fee as a bank charge expense and reduce your card balance.</p>
              </div>
            )}

          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Date given */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-secondary font-mono font-black uppercase tracking-wider block pl-0.5">Date Lent</label>
              <DatePicker 
                value={dateGiven} 
                onChange={setDateGiven} 
                required 
              />
              {errors.dateGiven && <p className="text-[10px] text-rose-500 font-mono font-semibold mt-1.5 block pl-1">{errors.dateGiven}</p>}
            </div>

          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => { setIsGivingLoan(false); setErrors({}); }}
              className="bg-transparent hover:bg-card border border-default text-secondary hover:text-primary py-3 px-6 rounded-2xl text-xs font-bold transition-all cursor-pointer font-mono font-black uppercase tracking-widest"
            >
              Cancel Setup
            </button>
            <button
              type="submit"
              className="bg-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/90 text-primary py-3 px-6 rounded-2xl text-xs font-black transition-all duration-300 cursor-pointer shadow-lg active:scale-95 flex items-center gap-1.5 font-mono uppercase tracking-widest h-11"
            >
              <Receipt size={13} />
              <span>Authorize & Log Dispatch</span>
            </button>
          </div>
        </form>
      )}

      {/* LOAN REGISTER BOOK */}
      <div className="space-y-4" id="loans-register-book">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-2 border-b border-default/80">
          <h2 className="text-sm font-extrabold text-primary uppercase tracking-wider font-mono">Lent Asset Register Book</h2>
          <button
            onClick={() => setIsGivingLoan(!isGivingLoan)}
            className="flex items-center gap-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/90 text-primary font-extrabold text-xs py-2 px-4 rounded-xl transition-all cursor-pointer shadow-md active:scale-95 shrink-0"
          >
            {isGivingLoan ? 'Minimize Dispatch Form' : (
              <>
                <Plus size={14} />
                <span>Lend & Record Asset</span>
              </>
            )}
          </button>
        </div>
        
        {activeLoans.length === 0 ? (
          <div className="bg-card/15 border border-default rounded-[32px] p-12 text-center flex flex-col items-center justify-center space-y-4 shadow-inner">
            <div className="p-4 bg-card/60 rounded-2xl border border-default text-muted">
              <Wallet size={24} className="text-muted" />
            </div>
            <div>
              <p className="text-primary text-sm font-semibold">No Outstanding Loans Registered</p>
              <p className="text-muted text-xs mt-1 max-w-sm mx-auto leading-relaxed">
                You have not registered any funds given out to others. Use the <strong>"Lend & Record Asset"</strong> button above to start tracing your receivables.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {activeLoans.map((loan) => {
              const activeProgress = loan.totalAmount > 0 
                ? Math.round(((loan.totalAmount - loan.remainingAmount) / loan.totalAmount) * 100) 
                : 0;

              return (
                <div 
                  key={loan.id}
                  data-loan-status={loan.status === 'Settled' ? 'completed' : loan.status === 'Partially Settled' ? 'partial' : 'active'}
                  className={`bg-gradient-to-br from-[#0c0c0f] to-[#040405] border rounded-3xl p-6 shadow-xl transition-all relative overflow-hidden ${
                    loan.status === 'Settled' ? 'border-[var(--accent-primary)]/50' : 'border-default'
                  }`}
                >
                  {/* Subtle right glow line depending on status */}
                  <div className={`absolute top-0 right-0 bottom-0 w-1 ${
                    loan.status === 'Settled' ? 'bg-[var(--accent-primary)]' : loan.status === 'Partially Settled' ? 'bg-yellow-500' : 'bg-rose-500'
                  }`} />

                  {/* Header Row */}
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-4 border-b border-default/70">
                    <div>
                      <h3 className="text-base font-extrabold text-primary flex items-center gap-2">
                        {loan.borrowerName}
                        <span className={`text-[9px] font-bold font-mono px-2 py-0.5 rounded-full uppercase border ${
                          loan.status === 'Settled' 
                            ? 'bg-emerald-950/30 text-success border-emerald-900/50' 
                            : loan.status === 'Partially Settled'
                            ? 'bg-yellow-950/30 text-yellow-450 border-yellow-905/30'
                            : 'bg-rose-950/30 text-danger border-rose-900/50'
                        }`}>
                          {loan.status}
                        </span>
                      </h3>
                      <p className="text-[10px] text-muted font-medium mt-0.5 flex items-center gap-1">
                        <Calendar size={11} /> Lent on {loan.dateGiven} via <strong className="text-secondary font-semibold">{loan.sourceAccountName}</strong>
                      </p>
                    </div>

                    <div className="flex items-center gap-2.5 sm:self-center self-end animate-fade-in">
                      <button
                        onClick={() => {
                          setIncreasingLoanId(increasingLoanId === loan.id ? null : loan.id);
                          setIncreaseAmount('');
                          setIncreaseError(null);
                          setSettlingLoanId(null); // exclusive with settling
                        }}
                        className="bg-card hover:bg-card text-amber-400 border border-default py-1.5 px-3 rounded-xl text-[10px] font-extrabold transition-all duration-300 cursor-pointer shadow-sm active:scale-95 flex items-center gap-1"
                      >
                        <Plus size={12} />
                        <span>Lend More</span>
                      </button>
                      {loan.status !== 'Settled' && (
                        <button
                          onClick={() => {
                            setSettlingLoanId(settlingLoanId === loan.id ? null : loan.id);
                            setSettlementAmount(loan.remainingAmount.toString());
                            setSettlementError(null);
                            setIncreasingLoanId(null); // exclusive with increasing
                          }}
                          className="bg-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/90 text-primary border border-[var(--accent-primary)] py-1.5 px-3.5 rounded-xl text-[10px] font-bold transition-all duration-300 cursor-pointer shadow-sm active:scale-95 flex items-center gap-1"
                        >
                          <CheckCircle2 size={12} />
                          <span>Receive Repayment</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteLoanClick(loan.id, loan.borrowerName)}
                        className="text-muted text-muted hover:text-danger p-2 hover:bg-rose-500/10 rounded-xl transition-all cursor-pointer"
                        title="Delete record"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Body Progress and Financial details */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6 py-4 items-center">
                    
                    {/* Amount Left Panel */}
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-muted uppercase font-mono font-bold block">Outstanding Balance</span>
                      <span className={`text-xl font-black ${loan.status === 'Settled' ? 'text-muted line-through' : 'text-amber-400'}`}>
                        {currency} {loan.remainingAmount.toLocaleString()}
                      </span>
                    </div>

                    {/* Total Principal Panel */}
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-muted uppercase font-mono font-bold block">Capital Lent</span>
                      <span className="text-sm font-extrabold text-primary">
                        {currency} {loan.totalAmount.toLocaleString()}
                      </span>
                    </div>

                    {/* Progress Meter bar */}
                    <div className="md:col-span-2 space-y-1.5">
                      <div className="flex justify-between items-center text-[10px] font-mono">
                        <span className="text-muted font-bold uppercase">Repayment Progress</span>
                        <span className="text-indigo-455 text-indigo-400 font-bold">{activeProgress}% Settled</span>
                      </div>
                      <div className="w-full bg-card/80 border border-default rounded-full h-2 overflow-hidden shadow-inner flex">
                        <div 
                          className="bg-gradient-to-r from-indigo-500 to-emerald-500 h-full rounded-full transition-all duration-700" 
                          style={{ width: `${activeProgress}%` }}
                        />
                      </div>
                    </div>

                  </div>

                  {/* SETTLING ACTION PANEL inline drawer */}
                  {settlingLoanId === loan.id && (
                    <form onSubmit={handleSettleSubmit} className="mt-4 bg-card border border-default p-5 rounded-[20px] space-y-4 shadow-inner scale-98 transition-all animate-fade-in text-xs text-left">
                      <div className="flex items-center gap-1.5 text-indigo-400 font-bold mb-1">
                        <CheckCircle2 size={13} className="text-indigo-400" />
                        <span className="uppercase font-mono text-[10px] tracking-wider font-black">Configure Settlement Credit Transaction</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        
                        {/* Amount */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-mono font-black uppercase tracking-wider text-secondary block pl-0.5">Settled Value ({currency})</label>
                          <input
                            type="number"
                            step="any"
                            value={settlementAmount}
                            onChange={(e) => setSettlementAmount(e.target.value)}
                            max={loan.remainingAmount}
                            className="w-full bg-surface border border-default rounded-2xl py-3.5 px-4 text-xs text-primary focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:ring-indigo-500 transition-all font-mono font-bold"
                            required
                          />
                        </div>

                        {/* Credit Destination Account Route */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-mono font-black uppercase tracking-wider text-secondary block pl-0.5">Credit Destination Account</label>
                          <select
                            value={`${receivedInId}:${receivedInType}`}
                            onChange={(e) => {
                              const [id, type] = e.target.value.split(':');
                              setReceivedInId(id);
                              setReceivedInType(type as 'cash' | 'card');
                            }}
                            className="w-full bg-surface border border-default rounded-2xl py-3.5 px-3.5 text-xs text-primary focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:ring-indigo-500 transition-all cursor-pointer font-semibold"
                          >
                            {availableAccounts.map(acc => (
                              <option key={`dest:${acc.id}:${acc.type}`} value={`${acc.id}:${acc.type}`}>
                                {acc.name} - ({currency} {acc.balance.toLocaleString()})
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Submission */}
                        <div className="flex items-end">
                          <button
                            type="submit"
                            className="w-full h-12 bg-white text-black font-semibold text-xs rounded-2xl hover:bg-surface transition-all cursor-pointer font-mono font-black uppercase tracking-widest flex items-center justify-center gap-2"
                          >
                            Post Repay Receipt
                          </button>
                        </div>

                      </div>

                      {receivedInType === 'card' && receivedInId && (
                        <div className="p-4 bg-surface/60 border border-default rounded-2xl space-y-2 animate-fade-in">
                          <label className="text-[10px] text-secondary font-mono font-black block uppercase pl-0.5">Optional Bank Card Charge ({currency})</label>
                          <input
                            type="number"
                            step="any"
                            placeholder="e.g. 150 (Leave blank or 0 if none)"
                            value={settleLoanBankCharge}
                            onChange={(e) => setSettleLoanBankCharge(e.target.value)}
                            className="w-full bg-surface border border-default rounded-2xl py-3 px-4 text-xs text-primary focus:outline-none focus:ring-1 focus:border-indigo-500 focus:ring-indigo-500 font-mono"
                          />
                          <p className="text-[9.5px] text-muted font-mono pl-0.5 leading-normal">Receiving settled loan funds on a card might incur transaction fees; entering a charge will deduct this fee from the final credited card balance.</p>
                        </div>
                      )}

                      {settlementError && (
                        <p className="text-[10px] text-rose-500 font-mono font-semibold mt-1 block pl-1">{settlementError}</p>
                      )}
                    </form>
                  )}

                  {/* LEND MORE ACTION PANEL inline drawer */}
                  {increasingLoanId === loan.id && (
                    <form onSubmit={(e) => handleIncreaseSubmit(e, loan)} className="mt-4 bg-card border border-default p-5 rounded-[20px] space-y-4 shadow-inner scale-98 transition-all animate-fade-in text-xs text-left relative overflow-hidden" id={`lend-more-form-${loan.id}`}>
                      <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />
                      <div className="flex items-center gap-1 text-amber-400 font-bold mb-1">
                        <ArrowUpRight size={13} className="text-amber-400" />
                        <span className="uppercase font-mono text-[10px] tracking-wider font-black">Configure Additional Capital Inflow (Lend of more principal)</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        
                        {/* Amount */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-mono font-black uppercase tracking-wider text-secondary block pl-0.5">Lent Amount ({currency})</label>
                          <input
                            type="number"
                            step="any"
                            value={increaseAmount}
                            onChange={(e) => setIncreaseAmount(e.target.value)}
                            placeholder="0.00"
                            className="w-full bg-surface border border-default rounded-2xl py-3.5 px-4 text-xs text-primary focus:outline-none focus:ring-1 focus:border-amber-500 focus:ring-amber-500 transition-all font-mono font-bold"
                            required
                          />
                        </div>

                        {/* Debit Source Account Route */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-mono font-black uppercase tracking-wider text-secondary block pl-0.5">Debit Source Account</label>
                          <select
                            value={`${increaseSourceId}:${increaseSourceType}`}
                            onChange={(e) => {
                              const [id, type] = e.target.value.split(':');
                              setIncreaseSourceId(id);
                              setIncreaseSourceType(type as 'cash' | 'card');
                            }}
                            className="w-full bg-surface border border-default rounded-2xl py-3.5 px-3.5 text-xs text-primary focus:outline-none focus:ring-1 focus:border-amber-500 focus:ring-amber-500 transition-all cursor-pointer font-semibold"
                          >
                            {availableAccounts.map(acc => (
                              <option key={`inc-src:${acc.id}:${acc.type}`} value={`${acc.id}:${acc.type}`}>
                                {acc.name} - ({currency} {acc.balance.toLocaleString()})
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Submission */}
                        <div className="flex items-end">
                          <button
                            type="submit"
                            className="w-full h-12 bg-white text-black font-semibold text-xs rounded-2xl hover:bg-surface transition-all cursor-pointer font-mono font-black uppercase tracking-widest flex items-center justify-center gap-2"
                          >
                            Post Add-on Dispatch
                          </button>
                        </div>

                      </div>

                      {increaseSourceType === 'card' && increaseSourceId && (
                        <div className="p-4 bg-surface/60 border border-default rounded-2xl space-y-2 animate-fade-in text-xs">
                          <label className="text-[10px] text-secondary font-mono font-black block uppercase pl-0.5">Optional Bank Card Charge ({currency})</label>
                          <input
                            type="number"
                            step="any"
                            placeholder="e.g. 150 (Leave blank or 0 if none)"
                            value={increaseLoanBankCharge}
                            onChange={(e) => setIncreaseLoanBankCharge(e.target.value)}
                            className="w-full bg-surface border border-default rounded-2xl py-3 px-4 text-xs text-primary focus:outline-none focus:ring-1 focus:border-indigo-500 focus:ring-indigo-500 font-mono"
                          />
                          <p className="text-[9.5px] text-muted font-mono pl-0.5 leading-normal">Lending more funds from a card might incur transaction charges; entering a charge will deduct this fee from your card balance and track it under bank fees.</p>
                        </div>
                      )}

                      {increaseError && (
                        <p className="text-[10px] text-rose-500 font-mono font-semibold mt-1 block pl-1">{increaseError}</p>
                      )}
                    </form>
                  )}

                  {/* HISTORICAL SETTLEMENT TRACKS ACCORDION */}
                  <div className="mt-2.5">
                    <button
                      onClick={() => setExpandedLoanId(expandedLoanId === loan.id ? null : loan.id)}
                      className="text-[10px] tracking-wider text-muted hover:text-primary font-mono font-bold uppercase py-1 flex items-center gap-1 transition-all cursor-pointer outline-none border-b border-transparent hover:border-default"
                    >
                      <History size={11} />
                      <span>Settlements Ledger History ({loan.settlements?.length || 0})</span>
                      {expandedLoanId === loan.id ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                    </button>

                    {expandedLoanId === loan.id && (
                      <div className="mt-2.5 space-y-2 border-t border-subtle pt-2.5 animate-fade-in select-text">
                        {(!loan.settlements || loan.settlements.length === 0) ? (
                          <p className="text-[10px] text-muted font-medium italic py-1">No settlements logged yet inside this dispatcher.</p>
                        ) : (
                          <div className="grid grid-cols-1 gap-2">
                            {loan.settlements.map((setl) => (
                              <div key={setl.id} className="bg-card/60 border border-default rounded-xl p-3 flex justify-between items-center">
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-1.5 text-[10px] text-success font-mono font-bold uppercase">
                                    <ArrowDownLeft size={10} />
                                    <span>Partially Repaid</span>
                                  </div>
                                  <p className="text-[10px] text-secondary font-semibold mt-0.5 leading-normal">
                                    Credited to: <strong className="text-primary font-bold">{setl.receivedInName}</strong>
                                  </p>
                                </div>
                                <div className="text-right">
                                  <span className="text-xs font-black text-primary block">
                                    + {currency} {setl.amount.toLocaleString()}
                                  </span>
                                  <span className="text-[9px] text-muted text-muted font-mono">{setl.date}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
