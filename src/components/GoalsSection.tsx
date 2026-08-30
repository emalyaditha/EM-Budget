import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { SavingsGoal, CashAccount } from '../types';
import { Plus, X, Trash2, MinusCircle, PlusCircle } from 'lucide-react';
import { DatePicker } from './DatePicker';

interface GoalsSectionProps {
  goals: SavingsGoal[];
  currency: string;
  cashAccounts: CashAccount[];
  onAddGoal: (name: string, target: number, targetDate: string) => void;
  onModifyGoalFunds: (id: string, amount: number, cashAccountId: string | null) => void;
  onRemoveGoal?: (id: string) => void;
  onClearAllGoals?: () => void;
}

function formatFecha(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export default function GoalsSection({
  goals = [],
  currency,
  cashAccounts = [],
  onAddGoal,
  onModifyGoalFunds,
  onRemoveGoal,
  onClearAllGoals,
}: GoalsSectionProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isFundModalOpen, setIsFundModalOpen] = useState(false);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalDate, setGoalDate] = useState('');
  const [fundAmount, setFundAmount] = useState('');
  const [fundSourceAccountId, setFundSourceAccountId] = useState(cashAccounts[0]?.id || '');
  const [fundAction, setFundAction] = useState<'add' | 'remove'>('add');
  const [justCommittedGoal, setJustCommittedGoal] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [inlineAmount, setInlineAmount] = useState<Record<string, string>>({});

  const handleCreateGoal = () => {
    const targetVal = parseFloat(goalTarget);
    if (goalName && !isNaN(targetVal) && targetVal > 0) {
      onAddGoal(goalName, targetVal, goalDate || new Date().toISOString().split('T')[0]);
      setIsAddModalOpen(false);
      setGoalName(''); setGoalTarget(''); setGoalDate('');
    }
  };
  const handleFundGoalSubmit = () => {
    if (selectedGoalId) {
      const amountVal = parseFloat(fundAmount);
      if (!isNaN(amountVal) && amountVal > 0) {
        const factor = fundAction === 'add' ? 1 : -1;
        const currentGoal = goals.find(g => g.id === selectedGoalId);
        onModifyGoalFunds(selectedGoalId, amountVal * factor, fundSourceAccountId || null);
        if (currentGoal && fundAction === 'add' && (currentGoal.current + amountVal) >= currentGoal.target) {
          setJustCommittedGoal(currentGoal.id);
          setTimeout(() => setJustCommittedGoal(null), 4000);
        }
        setIsFundModalOpen(false); setFundAmount('');
      }
    }
  };
  const openFundModal = (goalId: string, action: 'add' | 'remove') => {
    setSelectedGoalId(goalId); setFundAction(action); setIsFundModalOpen(true);
  };
  const handleInlineAllocate = (goalId: string, action: 'add' | 'remove', isMock: boolean) => {
    if (isMock) return;
    const raw = inlineAmount[goalId] || '';
    const val = parseFloat(raw);
    if (isNaN(val) || val <= 0) return;
    const factor = action === 'add' ? 1 : -1;
    const currentGoal = goals.find(g => g.id === goalId);
    onModifyGoalFunds(goalId, val * factor, cashAccounts[0]?.id || null);
    if (currentGoal && action === 'add' && (currentGoal.current + val) >= currentGoal.target) {
      setJustCommittedGoal(currentGoal.id);
      setTimeout(() => setJustCommittedGoal(null), 4000);
    }
    setInlineAmount(prev => ({ ...prev, [goalId]: '' }));
  };
  const calculatePercent = (current: number, target: number) => target <= 0 ? 0 : Math.min(100, Math.round((current / target) * 100));

  const activeGoalsCount = goals.length;
  const completedGoalsCount = goals.filter(g => g.current >= g.target).length;
  const totalSavedValue = goals.reduce((acc, g) => acc + g.current, 0);

  
  const displayGoals = goals;
  const isMockMode = false;

  return (
    <div className="space-y-6" id="goals-savings-vault">
      {/* Outer pin card — exactly like the right screen */}
      <div className="card p-6 rounded-[24px] flex flex-col gap-5">
        {/* Header — My savings goals (bold, dark ledger aesthetic via tokens) */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[22px] font-bold tracking-tight leading-none">My savings goals</h2>
            {!isMockMode && (
              <p className="mono text-[11px] mt-2" style={{ color: 'var(--ink-2)' }}>
                {activeGoalsCount} goals · {completedGoalsCount} completed · {currency}{totalSavedValue.toLocaleString()} saved
              </p>
            )}

          </div>
          {goals.length > 0 && onClearAllGoals && (
            <button
              onClick={() => {
                if (showClearConfirm) { onClearAllGoals(); setShowClearConfirm(false); }
                else { setShowClearConfirm(true); setTimeout(() => setShowClearConfirm(false), 4000); }
              }}
              className="btn-ghost !py-1.5 !px-3 text-[11px] shrink-0"
              style={showClearConfirm ? { borderColor: 'var(--danger)', color: 'var(--danger)', background: 'var(--danger-bg)' } : undefined}
            >
              <span className="inline-flex items-center gap-1"><Trash2 size={11} />{showClearConfirm ? 'Confirm' : 'Limpiar'}</span>
            </button>
          )}
        </div>

        {/* New goal — pastel gradient card with dark + button (pin top card) */}
        <div className="mw-nueva p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[14px] font-bold leading-none" style={{ color: '#0A0A0C' }}>Add New goal</p>
            <p className="text-[12px] mt-1 leading-none" style={{ color: 'rgba(10,10,12,0.55)' }}>Create a new savings goal</p>
          </div>
          <button
            aria-label="Add New goal"
            onClick={() => setIsAddModalOpen(v => !v)}
            className="w-10 h-10 rounded-full bg-[#0A0A0C] text-white grid place-items-center shrink-0 hover:scale-[1.04] active:scale-[0.98] transition-transform shadow-sm"
          >
            <Plus size={18} strokeWidth={2.5} />
          </button>
        </div>

        {/* Add form — .input + btn-primary (expands under mw-nueva) */}
        <AnimatePresence>
          {isAddModalOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-[var(--surface-2)] border border-[var(--line)] rounded-[16px] p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="eyebrow !text-[9px]">New goal</p>
                  <button onClick={() => setIsAddModalOpen(false)} className="w-7 h-7 rounded-full grid place-items-center" style={{ border: '1px solid var(--line)', color: 'var(--ink-2)' }}><X size={12} /></button>
                </div>
                <div className="grid gap-3">
                  <div>
                    <label className="eyebrow block mb-1.5 !text-[9px]">Name</label>
                    <input type="text" value={goalName} onChange={e => setGoalName(e.target.value)} className="input mono" placeholder="e.g. Trip to Japan" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="eyebrow block mb-1.5 !text-[9px]">Target ({currency})</label>
                      <input type="number" value={goalTarget} onChange={e => setGoalTarget(e.target.value)} className="input mono" placeholder="5000" />
                    </div>
                    <div>
                      <label className="eyebrow block mb-1.5 !text-[9px]">Deadline</label>
                      <DatePicker value={goalDate} onChange={setGoalDate} />
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button onClick={() => setIsAddModalOpen(false)} className="btn-ghost !py-2 !px-4 text-[12px]">Cancel</button>
                  <button onClick={handleCreateGoal} className="btn-primary !py-2 !px-5 text-[12px]">Create goal</button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Goal list eyebrow */}
        <div className="flex items-center justify-between pt-1">
          <p className="eyebrow">Goal list</p>
          <span className="mono text-[11px]" style={{ color: 'var(--ink-3)' }}>{displayGoals.length} goals</span>
        </div>

        {/* Goal cards — pin spec: bg surface-2 border line rounded 16 p-4 */}
        <div className="flex flex-col gap-3">
          {displayGoals.length === 0 ? (
          <div className="empty py-10">
            <p className="mono text-[11px] text-[var(--ink-3)]">No goals yet — create your first savings goal.</p>
            <p className="mono text-[10px] text-[var(--ink-3)] mt-1">Tap Add New goal above.</p>
          </div>
        ) : displayGoals.map((goal) => {
            const percent = calculatePercent(goal.current, goal.target);
            const expanded = expandedId === goal.id;
            return (
              <div key={goal.id} className="bg-[var(--surface-2)] border border-[var(--line)] rounded-[16px] p-4 flex flex-col gap-3">
                {/* Title row — mono bold + More details link */}
                <div className="flex items-start justify-between gap-2">
                  <h4 className="mono text-[13px] font-bold leading-tight flex-1 min-w-0 truncate">{goal.name}</h4>
                  <button
                    onClick={() => setExpandedId(expanded ? null : goal.id)}
                    className="text-[11px] font-medium underline underline-offset-2 shrink-0"
                    style={{ color: 'var(--ink-2)' }}
                  >
                    {expanded ? 'Hide' : 'More details'}
                  </button>
                </div>

                {/* Progress label + % */}
                <div className="flex items-center justify-between">
                  <span className="eyebrow !text-[9px] !tracking-[0.14em]">Progress</span>
                  <span className="mono text-[11px] font-bold">{percent}%</span>
                </div>

                {/* Bar — h-2 rounded-full bg surface-3 inner mw-progress */}
                <div className="h-2 rounded-full bg-[var(--surface-3)] overflow-hidden">
                  <div className="mw-progress h-full transition-all duration-700" style={{ width: `${percent}%` }} />
                </div>

                {/* 3 cols — Target / Saved / Deadline (mono 11px) */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <p className="eyebrow !text-[8px] !tracking-[0.12em]">Meta</p>
                    <p className="mono text-[11px] font-bold mt-1 leading-none">{currency}{goal.target.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="eyebrow !text-[8px] !tracking-[0.12em]">Saved</p>
                    <p className="mono text-[11px] font-bold mt-1 leading-none">{currency}{goal.current.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="eyebrow !text-[8px] !tracking-[0.12em]">Deadline</p>
                    <p className="mono text-[11px] font-bold mt-1 leading-none">{formatFecha(goal.targetDate)}</p>
                  </div>
                </div>

                {/* Expanded details — allocate funds row with input + btn */}
                <AnimatePresence>
                  {expanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="pt-3 mt-1 flex flex-col gap-3" style={{ borderTop: '1px solid var(--line)' }}>
                        {/* Inline allocate funds row */}
                        <div className="flex gap-2">
                          <input
                            type="number"
                            value={isMockMode ? '' : (inlineAmount[goal.id] ?? '')}
                            onChange={e => setInlineAmount(prev => ({ ...prev, [goal.id]: e.target.value }))}
                            placeholder={isMockMode ? 'Demo — crea una meta real' : 'Amount'}
                            disabled={isMockMode}
                            className="input !py-2 !text-[12px] mono flex-1 disabled:opacity-60"
                          />
                          <button
                            onClick={() => handleInlineAllocate(goal.id, 'add', isMockMode)}
                            disabled={isMockMode}
                            className="btn-primary !py-2 !px-3.5 text-[11px] inline-flex items-center gap-1 shrink-0 disabled:opacity-40"
                          >
                            <PlusCircle size={12} />Add
                          </button>
                          <button
                            onClick={() => handleInlineAllocate(goal.id, 'remove', isMockMode)}
                            disabled={isMockMode || goal.current <= 0}
                            className="btn-ghost !py-2 !px-3 text-[11px] inline-flex items-center gap-1 shrink-0 disabled:opacity-40"
                          >
                            <MinusCircle size={12} />Withdraw
                          </button>
                        </div>

                        {/* Secondary wallet row + modal fallback for mock/reality */}
                        {!isMockMode && (
                          <div className="flex flex-wrap gap-2 items-center">
                            <button onClick={() => openFundModal(goal.id, 'add')} className="mono text-[11px] underline underline-offset-2" style={{ color: 'var(--ink-3)' }}>Choose wallet</button>
                            <span className="mono text-[10px]" style={{ color: 'var(--ink-3)' }}>·</span>
                            <span className="mono text-[10px]" style={{ color: 'var(--ink-3)' }}>{currency}{goal.current.toLocaleString()} / {currency}{goal.target.toLocaleString()}</span>
                            {onRemoveGoal && (
                              <button
                                onClick={() => {
                                  if (deleteConfirmId === goal.id) { onRemoveGoal(goal.id); setDeleteConfirmId(null); setExpandedId(null); }
                                  else { setDeleteConfirmId(goal.id); setTimeout(() => setDeleteConfirmId(c => c === goal.id ? null : c), 3500); }
                                }}
                                className="ml-auto inline-flex items-center gap-1 mono text-[11px] px-2.5 py-1 rounded-full"
                                style={{ border: '1px solid var(--line)', background: deleteConfirmId === goal.id ? 'var(--danger-bg)' : 'transparent', color: deleteConfirmId === goal.id ? 'var(--danger)' : 'var(--ink-2)' }}
                              >
                                <Trash2 size={11} />{deleteConfirmId === goal.id ? 'Confirm' : 'Eliminar'}
                              </button>
                            )}
                          </div>
                        )}
                        {isMockMode && (
                          <p className="mono text-[10px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>
                             “Add New goal” to save real data.
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        <AnimatePresence>
          {justCommittedGoal && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="bg-[var(--surface-2)] border border-[var(--line)] rounded-[16px] p-3 flex items-center justify-between gap-3">
                <p className="text-[12px] font-semibold">¡Goal reached — funds secured!</p>
                <span className="mono text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0" style={{ border: '1px solid var(--line)' }}>Asegurado</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Fund modal — uses .input + btn-primary, keeps wallet selection */}
      <AnimatePresence>
        {isFundModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }} onClick={() => setIsFundModalOpen(false)}>
            <motion.div initial={{ scale: 0.98, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.98, opacity: 0 }} onClick={e => e.stopPropagation()} className="card w-full max-w-sm p-6 relative rounded-[24px]">
              <button onClick={() => setIsFundModalOpen(false)} className="absolute top-4 right-4 w-7 h-7 rounded-full grid place-items-center" style={{ border: '1px solid var(--line)' }}><X size={13} /></button>
              <p className="eyebrow">{fundAction === 'add' ? 'Assign' : 'Withdraw'}</p>
              <h4 className="text-[15px] font-bold mt-1">{fundAction === 'add' ? 'Assign to goal' : 'Withdraw from goal'}</h4>
              <div className="mt-5 space-y-4">
                <div><label className="eyebrow block mb-2">Amount ({currency})</label><input type="number" value={fundAmount} onChange={e => setFundAmount(e.target.value)} className="input mono" placeholder="e.g. 250" autoFocus /></div>
                <div><label className="eyebrow block mb-2">{fundAction === 'add' ? 'Source wallet' : 'Return to wallet'}</label>
                  <select value={fundSourceAccountId} onChange={e => setFundSourceAccountId(e.target.value)} className="input">
                    {cashAccounts.map(c => <option key={c.id} value={c.id}>{c.name} ({currency}{c.balance.toLocaleString()})</option>)}
                    {cashAccounts.length === 0 && <option value="">No wallets</option>}
                  </select>
                </div>
                <div className="flex justify-end gap-2 pt-1"><button onClick={() => setIsFundModalOpen(false)} className="btn-ghost">Cancel</button><button onClick={handleFundGoalSubmit} className="btn-primary">Confirm</button></div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
