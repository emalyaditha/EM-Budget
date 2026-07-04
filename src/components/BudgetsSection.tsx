import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Budget, CategoryExpense } from '../types';
import { 
  Plus, Edit2, Trash2, TrendingUp, AlertTriangle, CheckCircle, 
  ChevronRight, Calendar, Sparkles, X, Info, HelpCircle 
} from 'lucide-react';

interface BudgetsSectionProps {
  budgets: Budget[];
  currency: string;
  onUpdateBudgetLimit: (id: string, limit: number) => void;
  onAddBudget: (category: CategoryExpense, limit: number, icon: string) => void;
  onRemoveBudget?: (id: string) => void;
  onClearAllBudgets?: () => void;
}

export default function BudgetsSection({ 
  budgets, 
  currency, 
  onUpdateBudgetLimit,
  onAddBudget,
  onRemoveBudget,
  onClearAllBudgets
}: BudgetsSectionProps) {
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(budgets[0]?.id || null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [modalBudgetId, setModalBudgetId] = useState<string | null>(null);
  const [editLimitVal, setEditLimitVal] = useState<string>('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  
  // States for adding a new budget
  const [newCategory, setNewCategory] = useState<CategoryExpense>('Food');
  const [newLimit, setNewLimit] = useState<string>('');
  const [newIcon, setNewIcon] = useState<string>('🍔');

  // Overall calculations
  const totalBudgeted = budgets.reduce((acc, b) => acc + b.limit, 0);
  const totalSpent = budgets.reduce((acc, b) => acc + b.spent, 0);
  const percentSpent = totalBudgeted > 0 ? Math.round((totalSpent / totalBudgeted) * 100) : 0;
  
  // Calculate remaining days in the current month
  const today = new Date();
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const daysRemaining = lastDayOfMonth.getDate() - today.getDate();

  // Highlight specific budget
  const selectedBudget = budgets.find(b => b.id === selectedBudgetId);

  // SVG Circle parameters for progress gauge
  const radius = 64;
  const strokeWidth = 12;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(100, percentSpent) / 100) * circumference;

  const handleOpenEdit = (budget: Budget) => {
    setModalBudgetId(budget.id);
    setEditLimitVal(budget.limit.toString());
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = () => {
    if (modalBudgetId) {
      const parsed = parseFloat(editLimitVal);
      if (!isNaN(parsed) && parsed > 0) {
        onUpdateBudgetLimit(modalBudgetId, parsed);
        setIsEditModalOpen(false);
      }
    }
  };

  const handleCreateBudget = () => {
    const parsed = parseFloat(newLimit);
    if (!isNaN(parsed) && parsed > 0) {
      onAddBudget(newCategory, parsed, newIcon);
      setIsAddModalOpen(false);
      // Reset forms
      setNewLimit('');
    }
  };

  const getProgressBarColor = (spent: number, limit: number) => {
    const ratio = spent / limit;
    if (ratio >= 0.95) return 'bg-danger-solid'; // soft coral / red
    if (ratio >= 0.70) return 'bg-warning-solid'; // amber / gold
    return 'bg-[var(--accent-primary)]'; // blue blue
  };

  const getProgressBgColor = (spent: number, limit: number) => {
    const ratio = spent / limit;
    if (ratio >= 0.95) return 'bg-red-500/10 text-danger border-subtle';
    if (ratio >= 0.70) return 'bg-amber-500/10 text-warning border-amber-500/20';
    return 'bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] border-[var(--accent-primary)]/20';
  };

  const availableIcons = ['🍔', '🚗', '🍿', '⚡', '🛍️', '🎓', '🏥', '✈️', '🎮', '🏠'];

  return (
    <div className="space-y-8 animate-fade-in" id="budgets-ledger-suite">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[var(--bg-card)] border border-[var(--border-primary)] p-6 rounded-[24px] shadow-[var(--shadow-soft)]">
        <div className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--accent-primary)] font-sans block">
            Financial Health Limits
          </span>
          <h2 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)] leading-tight">Master Budget Ledger</h2>
          <p className="text-sm text-[var(--text-secondary)] mt-1.5 leading-relaxed">
            Monitor limits across monthly spend channels. Set controls to curb unnecessary outflows.
          </p>
        </div>
        
        <div className="flex items-center gap-3 shrink-0">
          {budgets.length > 0 && onClearAllBudgets && (
            <button
              onClick={() => {
                if (showClearConfirm) {
                  onClearAllBudgets();
                  setShowClearConfirm(false);
                } else {
                  setShowClearConfirm(true);
                  setTimeout(() => setShowClearConfirm(false), 4000);
                }
              }}
              className={`flex items-center gap-1.5 border font-bold py-2.5 px-4 rounded-[12px] text-xs transition-all cursor-pointer ${
                showClearConfirm 
                  ? 'border-red-500 bg-red-600 text-primary animate-pulse'
                  : 'border-subtle hover:bg-red-500/5 hover:border-subtle text-red-500 hover:scale-[1.03]'
              }`}
            >
              <Trash2 size={13} />
              <span>{showClearConfirm ? 'Confirm Clear?' : 'Clear All'}</span>
            </button>
          )}

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/90 text-primary font-bold py-2.5 px-5 rounded-[12px] text-xs transition-all cursor-pointer shadow-[0_4px_12px_rgba(0,163,255,0.2)] hover:scale-[1.03]"
          >
            <Plus size={15} />
            <span>Create Budget</span>
          </button>
        </div>
      </div>

      {/* OVERVIEW PANEL - CIRCULAR PROGRESS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* CIRCULAR GAUGE CARD */}
        <div className="lg:col-span-5 bg-[var(--bg-card)] border border-[var(--border-primary)] p-8 rounded-[24px] flex flex-col md:flex-row items-center justify-center gap-8 shadow-[var(--shadow-soft)] relative overflow-hidden">
          {/* Subtle Ambient BG glow */}
          <div className="absolute -top-24 -left-24 w-48 h-48 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-48 h-48 rounded-full bg-[var(--accent-primary)]/10 blur-3xl pointer-events-none" />

          {/* SVG Circular Donut Chart */}
          <div className="relative flex items-center justify-center shrink-0 w-36 h-36">
            <svg className="w-full h-full transform -rotate-90">
              {/* Outer Track circle */}
              <circle
                cx="72"
                cy="72"
                r={radius}
                className="stroke-slate-700/30"
                strokeWidth={strokeWidth}
                fill="transparent"
              />
              {/* Dynamic Progress circular arc */}
              <motion.circle
                cx="72"
                cy="72"
                r={radius}
                className={percentSpent >= 95 ? 'stroke-[#F87171]' : percentSpent >= 70 ? 'stroke-[#F59E0B]' : 'stroke-[var(--accent-primary)]'}
                strokeWidth={strokeWidth}
                fill="transparent"
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute text-center">
              <span className="text-3xl font-extrabold font-mono text-[var(--text-primary)]">{percentSpent}%</span>
              <span className="text-[10px] text-[var(--text-secondary)] block font-medium uppercase mt-0.5">Spent</span>
            </div>
          </div>

          <div className="text-center md:text-left space-y-4">
            <div>
              <span className="text-xs text-[var(--text-secondary)]">Overall Monthly Speedometer</span>
              <h4 className="text-2xl font-black font-mono text-[var(--text-primary)] mt-1">
                {currency}{totalSpent.toLocaleString()}
                <span className="text-sm text-[var(--text-secondary)] font-normal"> of {currency}{totalBudgeted.toLocaleString()}</span>
              </h4>
            </div>

            <div className="flex gap-4 justify-center md:justify-start">
              <div className="px-3.5 py-2 bg-card-40 border border-default rounded-xl">
                <span className="text-[9px] text-[var(--text-secondary)] uppercase block font-medium">Days Left</span>
                <span className="text-sm font-extrabold text-[var(--text-primary)] font-mono flex items-center gap-1 mt-0.5">
                  <Calendar size={13} className="text-warning" />
                  {daysRemaining} days
                </span>
              </div>

              <div className="px-3.5 py-2 bg-card-40 border border-default rounded-xl">
                <span className="text-[9px] text-[var(--text-secondary)] uppercase block font-medium">Safe To Spend</span>
                <span className="text-sm font-extrabold text-[var(--accent-primary)] font-mono mt-0.5">
                  {currency}{Math.max(0, Math.round((totalBudgeted - totalSpent) / (daysRemaining || 1))).toLocaleString()}/d
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* AI BUDGET ADVISOR INSIGHTS */}
        <div className="lg:col-span-7 bg-[var(--bg-card)] border border-[var(--border-primary)] p-6 rounded-[24px] flex flex-col justify-between shadow-[var(--shadow-soft)]">
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-1.5">
              <Sparkles size={16} className="text-warning animate-pulse" />
              <span>Smart Budget Diagnostics AI</span>
            </h4>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Based on your transaction pattern, our AI agent evaluated your budget envelopes.
            </p>

            <div className="space-y-3 pt-2">
              {percentSpent > 85 ? (
                <div className="flex gap-3 bg-danger border border-subtle p-3.5 rounded-xl text-xs text-danger leading-relaxed">
                  <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Aggressive Outflow Warning!</span>
                    You've utilized {percentSpent}% of your master balance limits. Leisure spending should be optimized or frozen until the new calendar month resets.
                  </div>
                </div>
              ) : (
                <div className="flex gap-3 bg-[var(--accent-primary)]/15 border border-[var(--accent-primary)]/30 p-3.5 rounded-xl text-xs text-[var(--accent-primary)] leading-relaxed">
                  <CheckCircle size={18} className="shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Budget Envelope Healthy!</span>
                    Exquisite control. You are active at {percentSpent}% of your allocations. At this pacing speed, you will add an estimated {currency}{(totalBudgeted - totalSpent).toLocaleString()} surplus to your Savings Jars.
                  </div>
                </div>
              )}

              {budgets.some(b => b.spent > b.limit) && (
                <div className="flex gap-3 bg-amber-500/10 border border-amber-500/20 p-3.5 rounded-xl text-xs text-warning leading-relaxed">
                  <Info size={17} className="shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Deficit Category Identified!</span>
                    One or more channels are operating in deficit. Tapping on category items will allow you to quickly adjust limits or study itemized micro-spend logs.
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="text-[10px] text-[var(--text-secondary)] pt-4 border-t border-[var(--border-primary)] flex justify-between items-center bg-card-20 px-3 py-1.5 rounded-lg">
            <span>Last audit computation</span>
            <span className="font-mono">Just Now • Synced</span>
          </div>
        </div>

      </div>

      {/* CORE GRID: CATEGORY BUDGET ROW & DETAIL BREAKDOWN */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* GRID OF BUDGETS (7 COLS) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex justify-between items-center px-1">
            <h4 className="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-wider">Spend Categories</h4>
            <span className="text-xs text-[var(--text-secondary)]">{budgets.length} configured channels</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {budgets.length > 0 ? (
              budgets.map((budget) => {
                const isSelected = selectedBudgetId === budget.id;
                const ratio = budget.spent / budget.limit;
                const isOver = ratio > 1;
                const barColor = getProgressBarColor(budget.spent, budget.limit);
                const statusPill = getProgressBgColor(budget.spent, budget.limit);

                return (
                  <motion.div
                    key={budget.id}
                    onClick={() => setSelectedBudgetId(budget.id)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className={`p-5 rounded-[20px] border cursor-pointer text-left transition-all relative ${
                      isSelected
                        ? 'bg-gradient-to-br from-[var(--bg-card)] to-slate-900/60 border-slate-500'
                        : 'bg-[var(--bg-card)] border-[var(--border-primary)] hover:border-slate-700/60'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-surface-80 rounded-xl flex items-center justify-center text-xl shadow-inner">
                          {budget.icon}
                        </div>
                        <div>
                          <h5 className="text-sm font-bold text-[var(--text-primary)]">{budget.category}</h5>
                          <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide">envelope</p>
                        </div>
                      </div>

                      <div className="flex gap-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEdit(budget);
                          }}
                          className="p-1.5 hover:bg-slate-705 bg-surface-80 border border-slate-750 rounded-lg text-[var(--text-secondary)] hover:text-primary transition-colors cursor-pointer"
                          title="Adjust limit"
                        >
                          <Edit2 size={12} />
                        </button>

                        {onRemoveBudget && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (deleteConfirmId === budget.id) {
                                onRemoveBudget(budget.id);
                                setDeleteConfirmId(null);
                              } else {
                                setDeleteConfirmId(budget.id);
                                // Reset back to normal after 4 seconds if they don't click again
                                setTimeout(() => {
                                  setDeleteConfirmId(current => current === budget.id ? null : current);
                                }, 4000);
                              }
                            }}
                            className={`p-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                              deleteConfirmId === budget.id
                                ? 'bg-red-600 border border-red-500 text-primary font-bold animate-pulse px-2'
                                : 'hover:bg-danger hover:border-subtle hover:text-danger bg-surface-80 border border-slate-750 text-[var(--text-secondary)]'
                            }`}
                            title={deleteConfirmId === budget.id ? 'Click again to confirm delete' : 'Delete envelope'}
                          >
                            <Trash2 size={12} />
                            {deleteConfirmId === budget.id && <span className="text-[10px] font-bold">Confirm?</span>}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2 mt-4">
                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-[var(--text-secondary)]">Spent</span>
                        <span className={`font-bold ${isOver ? 'text-danger' : 'text-[var(--text-primary)]'}`}>
                          {currency}{budget.spent} <span className="text-[10px] text-[var(--text-secondary)] font-normal">/ {currency}{budget.limit}</span>
                        </span>
                      </div>

                      {/* Progress Bar Container */}
                      <div className="w-full h-2 bg-surface-60 rounded-full overflow-hidden border border-default/20">
                        <motion.div
                          className={`h-full ${barColor}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(100, Math.round((budget.spent / budget.limit) * 100))}%` }}
                          transition={{ duration: 1.2, ease: 'easeOut' }}
                        />
                      </div>

                      <div className="flex justify-between items-center pt-2 text-[10px]">
                        <span className="text-[var(--text-secondary)] font-mono">
                          {isOver 
                            ? `Over budget by ${currency}${budget.spent - budget.limit}` 
                            : `${currency}${budget.limit - budget.spent} remaining`}
                        </span>
                        
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${statusPill}`}>
                          {ratio >= 1 ? 'OVER' : ratio >= 0.7 ? 'WARNING' : 'HEALTHY'}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                );
              })
            ) : (
              <div className="col-span-1 md:col-span-2 p-8 text-center border border-dashed border-default/60 text-muted rounded-3xl bg-card-10">
                <HelpCircle className="mx-auto text-slate-600 mb-2" size={32} />
                <p className="text-sm font-bold text-slate-300">No Spending Envelopes Active</p>
                <p className="text-xs text-muted mt-1">Click "Create Budget" above to start tracking monthly allocations!</p>
              </div>
            )}
          </div>
        </div>

        {/* DETAILS SUB-BREAKDOWN PANEL (5 COLS) */}
        <div className="lg:col-span-5 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-[24px] p-6 shadow-[var(--shadow-soft)] min-h-[350px]">
          {selectedBudget ? (
            <div className="space-y-6">
              <div className="pb-4 border-b border-[var(--border-primary)]">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{selectedBudget.icon}</span>
                  <div>
                    <h4 className="text-base font-extrabold text-[var(--text-primary)]">{selectedBudget.category} Breakdown</h4>
                    <p className="text-[10px] text-[var(--text-secondary)] uppercase font-mono tracking-wider">Sub-breakdown ledger mapping</p>
                  </div>
                </div>
              </div>

              {/* Total Sub-stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-card-40 p-3.5 rounded-xl border border-subtle">
                  <span className="text-[9px] text-[var(--text-secondary)] uppercase block">Total allocation</span>
                  <span className="text-base font-bold font-mono text-[var(--text-primary)] mt-1 block">
                    {currency}{selectedBudget.limit.toLocaleString()}
                  </span>
                </div>
                <div className="bg-card-40 p-3.5 rounded-xl border border-subtle">
                  <span className="text-[9px] text-[var(--text-secondary)] uppercase block">Total spent</span>
                  <span className="text-base font-bold font-mono text-[var(--text-primary)] mt-1 block">
                    {currency}{selectedBudget.spent.toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-secondary)] block">Itemized Records</span>
                
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {selectedBudget.subBreakdown && selectedBudget.subBreakdown.length > 0 ? (
                    selectedBudget.subBreakdown.map((item, index) => {
                      const itemPercent = selectedBudget.limit > 0 
                        ? Math.round((item.spent / selectedBudget.limit) * 100)
                        : 0;
                      return (
                        <div 
                          key={index} 
                          className="p-3.5 bg-card-20 border border-subtle hover:bg-card-50 rounded-xl flex justify-between items-center transition-colors"
                        >
                          <div className="space-y-1">
                            <span className="text-xs font-semibold text-[var(--text-primary)] block">{item.name}</span>
                            <span className="text-[9.5px] text-[var(--text-secondary)] font-mono">{itemPercent}% of total envelope</span>
                          </div>
                          <span className="text-xs font-bold font-mono text-[var(--text-primary)]">
                            {currency}{item.spent.toLocaleString()}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-8 text-center border border-dashed border-default text-muted rounded-xl text-xs italic">
                      No descriptive sub-items logs configured yet. Add transactions in ledger registry to map sub-spend logs.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-12 text-center h-full text-[var(--text-secondary)] space-y-4">
              <HelpCircle size={40} className="text-slate-650" />
              <div>
                <p className="font-bold text-sm text-[var(--text-primary)]">No Category Selected</p>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Select any category wallet on the left to review custom breakdowns, allocation rates, and logs.
                </p>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* EDIT BUDGET CAPS LIMIT MODAL */}
      <AnimatePresence>
        {isEditModalOpen && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card border border-default rounded-[24px] w-full max-w-sm overflow-hidden p-6 md:p-8 shadow-2xl relative"
            >
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="absolute top-5 right-5 p-1.5 hover:bg-card rounded-lg text-secondary hover:text-primary cursor-pointer transition-colors"
              >
                <X size={16} />
              </button>

              <h3 className="text-base font-black text-primary mb-1 font-sans">Adjust Category Cap</h3>
              <p className="text-xs text-secondary mb-6 font-mono uppercase tracking-wider">Modify Monthly Target limit allocation.</p>

              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[10px] text-secondary font-mono font-black uppercase tracking-wider block pl-0.5">New Limit Cap ({currency})</label>
                  <input
                    type="number"
                    value={editLimitVal}
                    onChange={(e) => setEditLimitVal(e.target.value)}
                    className="w-full p-4 bg-surface border border-default hover:border-default/80 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-2xl text-xs font-mono font-bold text-primary focus:outline-none placeholder:text-muted/75 transition-all"
                    placeholder="Enter limit"
                    autoFocus
                  />
                </div>

                <div className="flex gap-3 justify-end pt-2">
                  <button
                    onClick={() => setIsEditModalOpen(false)}
                    className="h-11 bg-card border border-default hover:border-default text-primary font-mono font-black text-[9.5px] uppercase rounded-2xl transition-all cursor-pointer flex items-center justify-center px-5"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    className="h-11 bg-white text-black font-mono font-black text-[9.5px] uppercase rounded-2xl hover:bg-surface transition-all flex items-center justify-center px-6 cursor-pointer shadow-lg"
                  >
                    Save Limit
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CREATE NEW BUDGET CATEGORY CARD MODAL */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card border border-default rounded-[24px] w-full max-w-sm overflow-hidden p-6 md:p-8 shadow-2xl relative"
            >
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="absolute top-5 right-5 p-1.5 hover:bg-card rounded-lg text-secondary hover:text-primary cursor-pointer transition-colors"
              >
                <X size={16} />
              </button>

              <h3 className="text-base font-black text-primary mb-1 font-sans">Create Budget Wrapper</h3>
              <p className="text-xs text-secondary mb-6 font-mono uppercase tracking-wider">Allocate a new monthly spend target budget.</p>

              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[10px] text-secondary font-mono font-black uppercase tracking-wider block pl-0.5">Spend Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as CategoryExpense)}
                    className="w-full p-4 bg-surface border border-default hover:border-default/80 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-2xl text-xs text-primary focus:outline-none cursor-pointer font-semibold transition-all"
                  >
                    <option value="Food">🍔 Food / Dining</option>
                    <option value="Transport">🚗 Transport & Vehicle</option>
                    <option value="Entertainment">🍿 Leisure & Entertainment</option>
                    <option value="Shopping">🛍️ Retail & Shopping</option>
                    <option value="Utilities">⚡ Utilities & Bills</option>
                    <option value="Rent">🏠 Rent & Housing</option>
                    <option value="Medical">🏥 Medical & Health</option>
                    <option value="Education">🎓 Knowledge & Education</option>
                    <option value="Insurance">🛡️ Cards & Insurance</option>
                    <option value="Loan">💸 Liabilities & Loans</option>
                    <option value="Other">📦 Miscellaneous</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] text-secondary font-mono font-black uppercase tracking-wider block pl-0.5">Category Icon</label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {availableIcons.map((ico) => (
                      <button
                        key={ico}
                        onClick={() => setNewIcon(ico)}
                        className={`p-2.5 rounded-2xl text-lg flex items-center justify-center transition-all cursor-pointer ${
                          newIcon === ico 
                            ? 'bg-indigo-600/20 border border-indigo-500 text-primary scale-105' 
                            : 'bg-surface hover:bg-card border border-default hover:border-default'
                        }`}
                      >
                        {ico}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] text-secondary font-mono font-black uppercase tracking-wider block pl-0.5">Monthly Limit Target ({currency})</label>
                  <input
                    type="number"
                    value={newLimit}
                    onChange={(e) => setNewLimit(e.target.value)}
                    className="w-full p-4 bg-surface border border-default hover:border-default/80 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-2xl text-xs font-mono font-bold text-primary focus:outline-none placeholder:text-muted/75 transition-all"
                    placeholder="e.g. 500"
                  />
                </div>

                <div className="flex gap-3 justify-end pt-2">
                  <button
                    onClick={() => setIsAddModalOpen(false)}
                    className="h-11 bg-card border border-default hover:border-default text-primary font-mono font-black text-[9.5px] uppercase rounded-2xl transition-all cursor-pointer flex items-center justify-center px-5"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateBudget}
                    className="h-11 bg-white text-black font-mono font-black text-[9.5px] uppercase rounded-2xl hover:bg-surface transition-all flex items-center justify-center px-6 cursor-pointer shadow-lg"
                  >
                    Start Monitoring
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
