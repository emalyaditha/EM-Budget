import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Budget, CategoryExpense } from '../types';
import { 
  Plus, Edit2, TrendingUp, AlertTriangle, CheckCircle, 
  ChevronRight, Calendar, Sparkles, X, Info, HelpCircle 
} from 'lucide-react';

interface BudgetsSectionProps {
  budgets: Budget[];
  currency: string;
  onUpdateBudgetLimit: (id: string, limit: number) => void;
  onAddBudget: (category: CategoryExpense, limit: number, icon: string) => void;
}

export default function BudgetsSection({ 
  budgets, 
  currency, 
  onUpdateBudgetLimit,
  onAddBudget 
}: BudgetsSectionProps) {
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(budgets[0]?.id || null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [modalBudgetId, setModalBudgetId] = useState<string | null>(null);
  const [editLimitVal, setEditLimitVal] = useState<string>('');
  
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
    if (ratio >= 0.95) return 'bg-[#F87171]'; // soft coral / red
    if (ratio >= 0.70) return 'bg-[#F59E0B]'; // amber / gold
    return 'bg-[#10B981]'; // emerald green
  };

  const getProgressBgColor = (spent: number, limit: number) => {
    const ratio = spent / limit;
    if (ratio >= 0.95) return 'bg-red-500/10 text-[#F87171] border-red-500/20';
    if (ratio >= 0.70) return 'bg-amber-500/10 text-[#F59E0B] border-amber-500/20';
    return 'bg-emerald-500/10 text-[#10B981] border-emerald-500/20';
  };

  const availableIcons = ['🍔', '🚗', '🍿', '⚡', '🛍️', '🎓', '🏥', '✈️', '🎮', '🏠'];

  return (
    <div className="space-y-8 animate-fade-in" id="budgets-ledger-suite">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[var(--bg-card)] border border-[var(--border-primary)] p-6 rounded-[24px] shadow-[var(--shadow-soft)]">
        <div>
          <span className="text-[10px] tracking-widest text-[#10B981] font-mono font-bold uppercase block mb-1">
            Financial Health Limits
          </span>
          <h3 className="text-xl font-bold text-[var(--text-primary)] leading-tight">Master Budget Ledger</h3>
          <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed">
            Monitor limits across monthly spend channels. Set controls to curb unnecessary outflows.
          </p>
        </div>
        
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-2 bg-[#10B981] hover:bg-emerald-600 text-white font-bold py-2.5 px-5 rounded-[12px] text-xs transition-all cursor-pointer shadow-[0_4px_16px_rgba(16,185,129,0.3)] shadow-emerald-555 hover:scale-[1.03]"
        >
          <Plus size={15} />
          <span>Create Budget</span>
        </button>
      </div>

      {/* OVERVIEW PANEL - CIRCULAR PROGRESS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* CIRCULAR GAUGE CARD */}
        <div className="lg:col-span-5 bg-[var(--bg-card)] border border-[var(--border-primary)] p-8 rounded-[24px] flex flex-col md:flex-row items-center justify-center gap-8 shadow-[var(--shadow-soft)] relative overflow-hidden">
          {/* Subtle Ambient BG glow */}
          <div className="absolute -top-24 -left-24 w-48 h-48 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-48 h-48 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

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
                className={percentSpent >= 95 ? 'stroke-[#F87171]' : percentSpent >= 70 ? 'stroke-[#F59E0B]' : 'stroke-[#10B981]'}
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
              <div className="px-3.5 py-2 bg-slate-900/40 border border-slate-800 rounded-xl">
                <span className="text-[9px] text-[var(--text-secondary)] uppercase block font-medium">Days Left</span>
                <span className="text-sm font-extrabold text-[var(--text-primary)] font-mono flex items-center gap-1 mt-0.5">
                  <Calendar size={13} className="text-[#F59E0B]" />
                  {daysRemaining} days
                </span>
              </div>

              <div className="px-3.5 py-2 bg-slate-900/40 border border-slate-800 rounded-xl">
                <span className="text-[9px] text-[var(--text-secondary)] uppercase block font-medium">Safe To Spend</span>
                <span className="text-sm font-extrabold text-[#10B981] font-mono mt-0.5">
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
              <Sparkles size={16} className="text-[#F59E0B] animate-pulse" />
              <span>Smart Budget Diagnostics AI</span>
            </h4>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Based on your transaction pattern, our AI agent evaluated your budget envelopes.
            </p>

            <div className="space-y-3 pt-2">
              {percentSpent > 85 ? (
                <div className="flex gap-3 bg-[#F87171]/10 border border-[#F87171]/20 p-3.5 rounded-xl text-xs text-[#F87171] leading-relaxed">
                  <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Aggressive Outflow Warning!</span>
                    You've utilized {percentSpent}% of your master balance limits. Leisure spending should be optimized or frozen until the new calendar month resets.
                  </div>
                </div>
              ) : (
                <div className="flex gap-3 bg-[#10B981]/15 border border-[#10B981]/30 p-3.5 rounded-xl text-xs text-emerald-400 leading-relaxed">
                  <CheckCircle size={18} className="shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Budget Envelope Healthy!</span>
                    Exquisite control. You are active at {percentSpent}% of your allocations. At this pacing speed, you will add an estimated {currency}{(totalBudgeted - totalSpent).toLocaleString()} surplus to your Savings Jars.
                  </div>
                </div>
              )}

              {budgets.some(b => b.spent > b.limit) && (
                <div className="flex gap-3 bg-amber-500/10 border border-amber-500/20 p-3.5 rounded-xl text-xs text-[#F59E0B] leading-relaxed">
                  <Info size={17} className="shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Deficit Category Identified!</span>
                    One or more channels are operating in deficit. Tapping on category items will allow you to quickly adjust limits or study itemized micro-spend logs.
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="text-[10px] text-[var(--text-secondary)] pt-4 border-t border-[var(--border-primary)] flex justify-between items-center bg-slate-900/20 px-3 py-1.5 rounded-lg">
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
            {budgets.map((budget) => {
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
                      <div className="w-10 h-10 bg-slate-800/80 rounded-xl flex items-center justify-center text-xl shadow-inner">
                        {budget.icon}
                      </div>
                      <div>
                        <h5 className="text-sm font-bold text-[var(--text-primary)]">{budget.category}</h5>
                        <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide">envelope</p>
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenEdit(budget);
                      }}
                      className="p-1.5 hover:bg-slate-705 bg-slate-800/80 border border-slate-750 rounded-lg text-[var(--text-secondary)] hover:text-white transition-colors cursor-pointer"
                      title="Adjust limit"
                    >
                      <Edit2 size={12} />
                    </button>
                  </div>

                  <div className="space-y-2 mt-4">
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-[var(--text-secondary)]">Spent</span>
                      <span className={`font-bold ${isOver ? 'text-[#F87171]' : 'text-[var(--text-primary)]'}`}>
                        {currency}{budget.spent} <span className="text-[10px] text-[var(--text-secondary)] font-normal">/ {currency}{budget.limit}</span>
                      </span>
                    </div>

                    {/* Progress Bar Container */}
                    <div className="w-full h-2 bg-slate-800/60 rounded-full overflow-hidden border border-slate-800/20">
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
            })}
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
                <div className="bg-slate-900/40 p-3.5 rounded-xl border border-slate-800/40">
                  <span className="text-[9px] text-[var(--text-secondary)] uppercase block">Total allocation</span>
                  <span className="text-base font-bold font-mono text-[var(--text-primary)] mt-1 block">
                    {currency}{selectedBudget.limit.toLocaleString()}
                  </span>
                </div>
                <div className="bg-slate-900/40 p-3.5 rounded-xl border border-slate-800/40">
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
                          className="p-3.5 bg-slate-900/20 border border-slate-800/40 hover:bg-slate-900/45 rounded-xl flex justify-between items-center transition-colors"
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
                    <div className="p-8 text-center border border-dashed border-slate-800 text-slate-500 rounded-xl text-xs italic">
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
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[var(--bg-card)] border border-[var(--border-secondary)] rounded-3xl w-full max-w-sm overflow-hidden p-6 shadow-2xl relative"
            >
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="absolute top-4 right-4 p-1.5 hover:bg-slate-800 rounded-lg text-[var(--text-secondary)] hover:text-white cursor-pointer"
              >
                <X size={16} />
              </button>

              <h4 className="text-base font-bold text-[var(--text-primary)] mb-1">Adjust Category Cap</h4>
              <p className="text-xs text-[var(--text-secondary)] mb-6">Modify Monthly Target limit allocation.</p>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-muted)] block">New Limit Cap ({currency})</label>
                  <input
                    type="number"
                    value={editLimitVal}
                    onChange={(e) => setEditLimitVal(e.target.value)}
                    className="w-full p-3.5 bg-slate-900 border border-slate-800 rounded-xl text-sm font-semibold font-mono text-[var(--text-primary)] focus:outline-none focus:border-slate-500"
                    placeholder="Enter limit"
                    autoFocus
                  />
                </div>

                <div className="flex gap-3 justify-end pt-2">
                  <button
                    onClick={() => setIsEditModalOpen(false)}
                    className="py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-[var(--text-secondary)] hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    className="py-2.5 px-5 bg-[#10B981] hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-[0_4px_12px_rgba(16,185,129,0.2)]"
                  >
                    Save limit
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
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[var(--bg-card)] border border-[var(--border-secondary)] rounded-3xl w-full max-w-sm overflow-hidden p-6 shadow-2xl relative"
            >
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="absolute top-4 right-4 p-1.5 hover:bg-slate-800 rounded-lg text-[var(--text-secondary)] hover:text-white cursor-pointer"
              >
                <X size={16} />
              </button>

              <h4 className="text-base font-bold text-[var(--text-primary)] mb-1">Create Budget Wrapper</h4>
              <p className="text-xs text-[var(--text-secondary)] mb-6">Allocate a new monthly spend target budget.</p>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-muted)] block">Spend Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as CategoryExpense)}
                    className="w-full p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-[var(--text-primary)] focus:outline-none focus:border-slate-500"
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

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-muted)] block">Category Icon</label>
                  <div className="grid grid-cols-5 gap-2">
                    {availableIcons.map((ico) => (
                      <button
                        key={ico}
                        onClick={() => setNewIcon(ico)}
                        className={`p-2.5 rounded-xl text-lg flex items-center justify-center transition-all ${
                          newIcon === ico 
                            ? 'bg-[#10B981] border border-[#10B981]' 
                            : 'bg-slate-900 hover:bg-slate-850 border border-slate-800'
                        }`}
                      >
                        {ico}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-muted)] block">Monthly limit target ({currency})</label>
                  <input
                    type="number"
                    value={newLimit}
                    onChange={(e) => setNewLimit(e.target.value)}
                    className="w-full p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-indigo-500"
                    placeholder="e.g. 500"
                  />
                </div>

                <div className="flex gap-3 justify-end pt-2">
                  <button
                    onClick={() => setIsAddModalOpen(false)}
                    className="py-2 px-4 bg-slate-900 hover:bg-slate-800 text-[var(--text-secondary)] hover:text-white rounded-xl text-[11px] font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateBudget}
                    className="py-2 px-5 bg-[#10B981] hover:bg-emerald-600 text-white rounded-xl text-[11px] font-bold cursor-pointer shadow-md"
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
