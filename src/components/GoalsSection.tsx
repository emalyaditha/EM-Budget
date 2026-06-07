import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { SavingsGoal, CashAccount } from '../types';
import { 
  Plus, Sparkles, TrendingUp, HelpCircle, X, ChevronRight, 
  PlusCircle, MinusCircle, Award, Target, Calendar 
} from 'lucide-react';

interface GoalsSectionProps {
  goals: SavingsGoal[];
  currency: string;
  cashAccounts: CashAccount[];
  onAddGoal: (name: string, target: number, targetDate: string) => void;
  onModifyGoalFunds: (id: string, amount: number, cashAccountId: string | null) => void;
}

export default function GoalsSection({ 
  goals = [], 
  currency, 
  cashAccounts = [],
  onAddGoal,
  onModifyGoalFunds 
}: GoalsSectionProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isFundModalOpen, setIsFundModalOpen] = useState(false);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  
  // Create Goal fields
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalDate, setGoalDate] = useState('');

  // Save Fund action fields
  const [fundAmount, setFundAmount] = useState('');
  const [fundSourceAccountId, setFundSourceAccountId] = useState(cashAccounts[0]?.id || '');
  const [fundAction, setFundAction] = useState<'add' | 'remove'>('add');

  // Success Celebration states
  const [justCommittedGoal, setJustCommittedGoal] = useState<string | null>(null);

  const handleCreateGoal = () => {
    const targetVal = parseFloat(goalTarget);
    if (goalName && !isNaN(targetVal) && targetVal > 0) {
      onAddGoal(goalName, targetVal, goalDate || new Date().toISOString().split('T')[0]);
      setIsAddModalOpen(false);
      // Reset
      setGoalName('');
      setGoalTarget('');
      setGoalDate('');
    }
  };

  const handleFundGoalSubmit = () => {
    if (selectedGoalId) {
      const amountVal = parseFloat(fundAmount);
      if (!isNaN(amountVal) && amountVal > 0) {
        const factor = fundAction === 'add' ? 1 : -1;
        const currentGoal = goals.find(g => g.id === selectedGoalId);
        
        onModifyGoalFunds(selectedGoalId, amountVal * factor, fundSourceAccountId || null);
        
        // If they added funds and hit 100%, trigger celebration burst
        if (currentGoal && fundAction === 'add' && (currentGoal.current + amountVal) >= currentGoal.target) {
          setJustCommittedGoal(currentGoal.id);
          setTimeout(() => {
            setJustCommittedGoal(null);
          }, 4500);
        }

        setIsFundModalOpen(false);
        setFundAmount('');
      }
    }
  };

  const openFundModal = (goalId: string, action: 'add' | 'remove') => {
    setSelectedGoalId(goalId);
    setFundAction(action);
    setIsFundModalOpen(true);
  };

  const calculatePercent = (current: number, target: number) => {
    if (target <= 0) return 0;
    return Math.min(100, Math.round((current / target) * 100));
  };

  const activeGoalsCount = goals.length;
  const completedGoalsCount = goals.filter(g => g.current >= g.target).length;
  const totalSavedValue = goals.reduce((acc, g) => acc + g.current, 0);

  return (
    <div className="space-y-8 animate-fade-in" id="goals-savings-vault">
      
      {/* 1. TOP HEADER SUMMARY */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* BANNER HEADER (7 COLS) */}
        <div className="lg:col-span-8 bg-[var(--bg-card)] border border-[var(--border-primary)] p-6 rounded-[24px] shadow-[var(--shadow-soft)] flex flex-col justify-between">
          <div>
            <span className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 text-[#F59E0B] text-[10px] uppercase font-bold tracking-widest rounded-full items-center gap-1 inline-flex mb-3">
              <Sparkles size={10} className="text-[#F59E0B]" />
              Wealth Accelerator Active
            </span>
            <h3 className="text-xl font-bold text-[var(--text-primary)]">Personal Vault Jars</h3>
            <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
              Carve out money for long term aspirations. Jars ring-fence capital from regular spending, guaranteeing targets are secured.
            </p>
          </div>

          <div className="pt-6 border-t border-[var(--border-primary)] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mt-6">
            <div className="flex gap-6">
              <div>
                <span className="text-[10px] text-[var(--text-secondary)] uppercase font-semibold">Total Saved Reserves</span>
                <span className="text-xl font-mono font-black text-[#10B981] block mt-0.5">
                  {currency}{totalSavedValue.toLocaleString()}
                </span>
              </div>
              <div className="border-l border-[var(--border-primary)] pl-6">
                <span className="text-[10px] text-[var(--text-secondary)] uppercase font-semibold">Progress</span>
                <span className="text-xl font-semibold text-[var(--text-primary)] block mt-0.5">
                  {completedGoalsCount} of {activeGoalsCount} Jars Completed
                </span>
              </div>
            </div>

            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-5 py-3 bg-[#F59E0B] hover:bg-amber-600 border border-[#F59E0B] text-slate-950 font-bold rounded-xl text-xs uppercase cursor-pointer transition-all hover:scale-[1.03] shadow-[0_4px_16px_rgba(245,158,11,0.25)] flex items-center gap-2 shrink-0"
            >
              <Plus size={14} className="stroke-slate-950" />
              <span>Establish Jar</span>
            </button>
          </div>
        </div>

        {/* FUN QUICK SUMMARY CARD (4 COLS) */}
        <div className="lg:col-span-4 bg-gradient-to-br from-[#0F172A] to-[#1E293B] border border-slate-800 rounded-[24px] p-6 flex flex-col justify-between text-left shadow-lg relative overflow-hidden">
          {/* Jar Backdrop Line-art */}
          <div className="absolute right-2 bottom-0 text-[100px] text-emerald-500/5 select-none font-sans pointer-events-none">🏺</div>
          
          <div>
            <span className="text-[10px] tracking-wider text-amber-400 font-mono font-bold uppercase block mb-1">Savings Strategy</span>
            <h4 className="text-sm font-bold text-white">How Jars Sync</h4>
            <p className="text-[11px] text-slate-400 leading-relaxed mt-1.5">
              Tapping **Save capital** allocates funds from any of your Cash Wallets. The selected cash wallet's balance is automatically adjusted, moving capital directly into the ring-fenced bucket.
            </p>
          </div>

          <div className="bg-slate-900/60 p-3.5 border border-slate-800 rounded-xl space-y-1 mt-4">
            <span className="text-[9px] text-slate-400 block uppercase font-semibold">Active Liquidity Available</span>
            <span className="text-xs font-bold text-[#10B981] font-mono">
              {currency}{cashAccounts.reduce((acc, c) => acc + c.balance, 0).toLocaleString()}
            </span>
          </div>
        </div>

      </div>

      {/* 2. SUCCESS EXPLOSION BURST CELEBRATION BANNER */}
      <AnimatePresence>
        {justCommittedGoal && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-gradient-to-r from-amber-500/20 via-emerald-500/20 to-amber-500/20 border border-amber-505/30 border-amber-500/40 p-6 rounded-[24px] flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left justify-between relative shadow-xl">
              <div className="flex items-center gap-3.5 flex-col sm:flex-row">
                <span className="text-4xl animate-bounce">🏆</span>
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-widest text-[#F59E0B] block mb-0.5">VAULT TARGET ACHIEVED</span>
                  <h4 className="text-sm font-extrabold text-white">Congratulations! Confetti Burst Triggered!</h4>
                  <p className="text-[11px] text-slate-300 mt-1">
                    You have successfully matched 100% of the financial goal target. This capital is successfully secured!
                  </p>
                </div>
              </div>
              <span className="text-xs font-mono font-bold text-[#F59E0B] uppercase px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full shrink-0 flex items-center gap-1.5 animate-pulse">
                <Award size={13} />
                Vault Secured
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. GRID OF SAVINGS JARS ACCORDION CARDS */}
      <div>
        {activeGoalsCount === 0 ? (
          <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-[32px] p-12 text-center flex flex-col items-center justify-center space-y-5 shadow-sm">
            <div className="w-16 h-16 bg-slate-900/60 rounded-full flex items-center justify-center text-3xl shadow-inner border border-slate-800">
              🏺
            </div>
            <div className="space-y-1.5 max-w-sm">
              <h4 className="text-base font-bold text-[var(--text-primary)]">Build Your First Savings Jar</h4>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                No active target goals configured. Establish an emergency fund, holiday reserve, or itemized purchase tracker to begin.
              </p>
            </div>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="py-2.5 px-5 bg-[#F59E0B] hover:bg-amber-600 text-slate-950 text-xs font-bold rounded-xl cursor-pointer shadow-md flex items-center gap-1.5"
            >
              <Plus size={14} className="stroke-slate-950" />
              <span>Define Savings Goal</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {goals.map((goal) => {
              const percent = calculatePercent(goal.current, goal.target);
              const isFinished = percent >= 100;

              return (
                <div 
                  key={goal.id} 
                  className={`bg-[var(--bg-card)] border rounded-[24px] p-6 shadow-sm flex flex-col justify-between text-left relative overflow-hidden transition-all hover:shadow-md ${
                    isFinished 
                      ? 'border-[#F59E0B]/50' 
                      : 'border-[var(--border-primary)]'
                  }`}
                >
                  {/* Glowing completed background wrapper */}
                  {isFinished && (
                    <div className="absolute top-0 right-0 w-24 h-24 bg-[#F59E0B]/5 rounded-bl-[100px] pointer-events-none flex items-center justify-center" />
                  )}

                  <div className="space-y-4">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <span className="text-[9px] uppercase tracking-wider text-slate-400 font-mono block">Jar Allocation</span>
                        <h4 className="text-sm font-bold text-[var(--text-primary)] leading-tight max-w-[180px] truncate">{goal.name}</h4>
                      </div>
                      
                      {isFinished ? (
                        <span className="text-xs font-bold text-[#F59E0B] bg-[#F59E0B]/10 border border-[#F59E0B]/20 py-1 px-2.5 rounded-full uppercase shrink-0 flex items-center gap-1 font-mono">
                          <Sparkles size={11} />
                          Saved
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold font-mono text-[#10B981] bg-[#10B981]/10 border border-[#10B981]/20 py-1 px-2 rounded-full uppercase shrink-0">
                          {percent}%
                        </span>
                      )}
                    </div>

                    <div className="space-y-1.5 pt-2">
                      <div className="flex justify-between items-baseline text-xs font-mono">
                        <span className="text-[var(--text-secondary)] text-[11px]">Savings ratio:</span>
                        <span className="font-extrabold text-[var(--text-primary)]">
                          {currency}{goal.current.toLocaleString()} <span className="text-[10px] text-slate-500 font-normal">/ {currency}{goal.target.toLocaleString()}</span>
                        </span>
                      </div>

                      {/* Jar Progress Bar */}
                      <div className="relative w-full h-3 bg-slate-800/40 rounded-full overflow-hidden border border-slate-800/25">
                        <motion.div
                          className={`h-full ${isFinished ? 'bg-[#F59E0B]' : 'bg-[#10B981]'}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${percent}%` }}
                          transition={{ duration: 1.2, ease: 'easeOut' }}
                        />
                      </div>
                    </div>

                    {/* Meta info tags */}
                    <div className="flex items-center gap-4 pt-1.5 text-[10px] text-[var(--text-secondary)] font-mono">
                      <span className="flex items-center gap-1">
                        <Target size={11} />
                        Date: {goal.targetDate}
                      </span>
                    </div>
                  </div>

                  <div className="pt-5 mt-5 border-t border-[var(--border-primary)] flex justify-between items-center gap-2">
                    <button
                      onClick={() => openFundModal(goal.id, 'remove')}
                      className="px-3.5 py-2 hover:bg-red-500/10 border border-slate-800 hover:border-red-500/20 text-[var(--text-secondary)] hover:text-[#F87171] rounded-xl text-[10px] uppercase font-bold transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                      disabled={goal.current <= 0}
                    >
                      <MinusCircle size={12} />
                      Withdraw
                    </button>

                    <button
                      onClick={() => openFundModal(goal.id, 'add')}
                      className={`px-4 py-2 text-[10px] uppercase font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1 shrink-0 ${
                        isFinished 
                          ? 'border border-[#F59E0B]/30 hover:bg-[#F59E0B]/10 text-[#F59E0B]'
                          : 'bg-[#10B981]/20 hover:bg-[#10B981] text-emerald-400 hover:text-white border border-[#10B981]/30 hover:border-emerald-600'
                      }`}
                    >
                      <PlusCircle size={12} />
                      Save Capital
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL: CREATE SAVINGS JAR */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[var(--bg-card)] border border-[var(--border-secondary)] rounded-3xl w-full max-w-sm overflow-hidden p-6 shadow-2xl relative text-left"
            >
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="absolute top-4 right-4 p-1.5 hover:bg-slate-800 rounded-lg text-[var(--text-secondary)] hover:text-white cursor-pointer"
              >
                <X size={16} />
              </button>

              <h4 className="text-base font-bold text-[var(--text-primary)] mb-1">Establish Savings Goal</h4>
              <p className="text-xs text-[var(--text-secondary)] mb-6">Create a locked-away pocket of capital.</p>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-muted)] block">Savings Goal / Jar Name</label>
                  <input
                    type="text"
                    value={goalName}
                    onChange={(e) => setGoalName(e.target.value)}
                    className="w-full p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-[var(--text-primary)] focus:outline-none focus:border-slate-500"
                    placeholder="e.g. Dream Holiday, Laptop Fund"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-muted)] block">Target Cap ({currency})</label>
                  <input
                    type="number"
                    value={goalTarget}
                    onChange={(e) => setGoalTarget(e.target.value)}
                    className="w-full p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-slate-500"
                    placeholder="e.g. 5000"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-muted)] block">Target Due Date</label>
                  <input
                    type="date"
                    value={goalDate}
                    onChange={(e) => setGoalDate(e.target.value)}
                    className="w-full p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-slate-500"
                  />
                </div>

                <div className="flex gap-3 justify-end pt-2">
                  <button
                    onClick={() => setIsAddModalOpen(false)}
                    className="py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-[var(--text-secondary)] hover:text-white rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateGoal}
                    className="py-2.5 px-5 bg-[#F59E0B] hover:bg-amber-600 text-slate-950 rounded-xl text-xs font-extrabold cursor-pointer shadow-md"
                  >
                    Lock Away Jar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: FUND OR WITHDRAW FROM SAVINGS JAR */}
      <AnimatePresence>
        {isFundModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[var(--bg-card)] border border-[var(--border-secondary)] rounded-3xl w-full max-w-sm overflow-hidden p-6 shadow-2xl relative text-left"
            >
              <button
                onClick={() => setIsFundModalOpen(false)}
                className="absolute top-4 right-4 p-1.5 hover:bg-slate-800 rounded-lg text-[var(--text-secondary)] hover:text-white cursor-pointer"
              >
                <X size={16} />
              </button>

              <h4 className="text-base font-bold text-[var(--text-primary)] mb-1">
                {fundAction === 'add' ? 'Save capital into Jar' : 'Withdraw funds from Jar'}
              </h4>
              <p className="text-xs text-[var(--text-secondary)] mb-6">
                {fundAction === 'add' 
                  ? 'Move active cash reserves into this isolated envelope.' 
                  : 'Return pocketed capital to a selected liquid wallet.'}
              </p>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-muted)] block">Amount ({currency})</label>
                  <input
                    type="number"
                    value={fundAmount}
                    onChange={(e) => setFundAmount(e.target.value)}
                    className="w-full p-3 bg-slate-900 border border-slate-800 rounded-xl text-sm font-semibold font-mono text-[var(--text-primary)] focus:outline-none focus:border-slate-500"
                    placeholder="e.g. 250"
                    autoFocus
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-muted)] block">
                    {fundAction === 'add' ? 'Funding Wallet Resource' : 'Disburse back to Wallet'}
                  </label>
                  <select
                    value={fundSourceAccountId}
                    onChange={(e) => setFundSourceAccountId(e.target.value)}
                    className="w-full p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-[var(--text-primary)] focus:outline-none focus:border-slate-500"
                  >
                    {cashAccounts.map((c) => (
                      <option key={c.id} value={c.id}>
                        💵 {c.name} ({currency}{c.balance.toLocaleString()})
                      </option>
                    ))}
                    {cashAccounts.length === 0 && (
                      <option value="">No wallets registered. Sync through local fallback mode.</option>
                    )}
                  </select>
                </div>

                <div className="flex gap-3 justify-end pt-2">
                  <button
                    onClick={() => setIsFundModalOpen(false)}
                    className="py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-[var(--text-secondary)] hover:text-white rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleFundGoalSubmit}
                    className="py-2.5 px-5 bg-[#10B981] hover:bg-emerald-600 text-white rounded-xl text-xs font-bold cursor-pointer shadow-md"
                  >
                    Confirm Ledger Sync
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
