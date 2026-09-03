import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Budget, CategoryExpense } from '../types';
import { Plus, Edit2, Trash2, X } from 'lucide-react';

interface BudgetsSectionProps {
  budgets: Budget[];
  currency: string;
  onUpdateBudgetLimit: (id: string, limit: number) => void;
  onAddBudget: (category: CategoryExpense, limit: number, icon: string) => void;
  onRemoveBudget?: (id: string) => void;
  onClearAllBudgets?: () => void;
}

function pastelForCategory(cat: string): string {
  const n = cat.toLowerCase();
  if (n.includes('food')) return 'bar-pink';
  if (n.includes('transport')) return 'bar-blue';
  if (n.includes('shopping')) return 'bar-yellow';
  if (n.includes('utilities')) return 'bar-mint';
  if (n.includes('rent')) return 'bar-lavender';
  if (n.includes('entertainment')) return 'bar-pink';
  if (n.includes('medical')) return 'bar-mint';
  if (n.includes('education')) return 'bar-lavender';
  if (n.includes('insurance')) return 'bar-blue';
  if (n.includes('loan')) return 'bar-yellow';
  if (n.includes('other')) return 'bar-mint';
  if (n.includes('bank')) return 'bar-lavender';
  const fallback = ['bar-pink', 'bar-mint', 'bar-yellow', 'bar-lavender', 'bar-blue'];
  let h = 0;
  for (let i = 0; i < cat.length; i++) h = (h * 31 + cat.charCodeAt(i)) >>> 0;
  return fallback[h % fallback.length];
}

export default function BudgetsSection({
  budgets,
  currency,
  onUpdateBudgetLimit,
  onAddBudget,
  onRemoveBudget,
  onClearAllBudgets,
}: BudgetsSectionProps) {
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(budgets[0]?.id || null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAddInlineOpen, setIsAddInlineOpen] = useState(false);
  const [modalBudgetId, setModalBudgetId] = useState<string | null>(null);
  const [editLimitVal, setEditLimitVal] = useState<string>('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [newCategory, setNewCategory] = useState<CategoryExpense>('Food');
  const [newLimit, setNewLimit] = useState<string>('');
  const [newIcon, setNewIcon] = useState<string>('🍔');

  const totalBudgeted = budgets.reduce((acc, b) => acc + b.limit, 0);
  const totalSpent = budgets.reduce((acc, b) => acc + b.spent, 0);
  const percentSpent = totalBudgeted > 0 ? Math.round((totalSpent / totalBudgeted) * 100) : 0;
  const today = new Date();
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const daysRemaining = lastDayOfMonth.getDate() - today.getDate();
  const selectedBudget = budgets.find((b) => b.id === selectedBudgetId);
  const availableIcons = ['🍔', '🚗', '🍿', '⚡', '🛍️', '🎓', '🏥', '✈️', '🎮', '🏠'];

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
      setIsAddInlineOpen(false);
      setNewLimit('');
    }
  };

  return (
    <div className="space-y-6" id="budgets-ledger-suite">
      {/* Outer pin card — same luxury as Goals: rounded 24, dark ledger via tokens */}
      <div className="card p-6 rounded-[24px] flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[22px] font-bold tracking-tight leading-none">Budgets</h2>
            <p className="mono text-[11px] mt-2" style={{ color: 'var(--ink-2)' }}>
              {budgets.length > 0
                ? `${percentSpent}% spent · ${currency}${totalSpent.toLocaleString()} / ${currency}${totalBudgeted.toLocaleString()} · ${daysRemaining} days remaining`
                : 'Define monthly envelopes by category — pastel style replicates the Financial report of the pin.'}
            </p>
          </div>
          {budgets.length > 0 && onClearAllBudgets && (
            <button
              onClick={() => {
                if (showClearConfirm) { onClearAllBudgets(); setShowClearConfirm(false); }
                else { setShowClearConfirm(true); setTimeout(() => setShowClearConfirm(false), 3500); }
              }}
              className="btn-ghost !py-1.5 !px-3 text-[11px] shrink-0"
              style={showClearConfirm ? { borderColor: 'var(--danger)', color: 'var(--danger)', background: 'var(--danger-bg)' } : undefined}
            >
              <span className="inline-flex items-center gap-1"><Trash2 size={11} />{showClearConfirm ? 'Confirm' : 'Limpiar'}</span>
            </button>
          )}
        </div>

        {/* Overview pastel bar — homage to pin's Financial report */}
        {budgets.length > 0 && (
          <div className="bg-[var(--surface-2)] border border-[var(--line)] rounded-[16px] p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="eyebrow !text-[9px]">Resumen del mes</span>
              <span className="mono text-[11px] font-bold">{percentSpent}%</span>
            </div>
            <div className="h-2 rounded-full bg-[var(--surface-3)] overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, percentSpent)}%`, background: 'var(--ink)' }} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="eyebrow !text-[8px]">Presupuestado</p>
                <p className="mono text-[11px] font-bold mt-1">{currency}{totalBudgeted.toLocaleString()}</p>
              </div>
              <div>
                <p className="eyebrow !text-[8px]">Safe per day</p>
                <p className="mono text-[11px] font-bold mt-1">{currency}{Math.max(0, Math.round((totalBudgeted - totalSpent) / (daysRemaining || 1))).toLocaleString()}/d</p>
              </div>
            </div>
          </div>
        )}

        {/* Nueva envelope — same mw-nueva gradient + dark + button as Goals */}
        <div className="mw-nueva p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[14px] font-bold leading-none" style={{ color: '#0A0A0C' }}>Add New Envelope</p>
            <p className="text-[12px] mt-1 leading-none" style={{ color: 'rgba(10,10,12,0.55)' }}>Create an envelope per category</p>
          </div>
          <button
            aria-label="Add New Envelope"
            onClick={() => setIsAddInlineOpen(v => !v)}
            className="w-10 h-10 rounded-full bg-[var(--accent)] text-[var(--accent-fg)] grid place-items-center shrink-0 hover:scale-[1.04] active:scale-[0.98] transition-transform shadow-sm"
          >
            <Plus size={18} strokeWidth={2.5} />
          </button>
        </div>

        <AnimatePresence>
          {isAddInlineOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="bg-[var(--surface-2)] border border-[var(--line)] rounded-[16px] p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="eyebrow !text-[9px]">Nuevo sobre</p>
                  <button onClick={() => setIsAddInlineOpen(false)} className="w-7 h-7 rounded-full grid place-items-center" style={{ border: '1px solid var(--line)', color: 'var(--ink-2)' }}><X size={12} /></button>
                </div>
                <div>
                  <label className="eyebrow block mb-1.5 !text-[9px]">Category</label>
                  <select value={newCategory} onChange={e => setNewCategory(e.target.value as CategoryExpense)} className="input">
                    <option value="Food">Food / Dining</option>
                    <option value="Transport">Transport</option>
                    <option value="Entertainment">Entertainment</option>
                    <option value="Shopping">Shopping</option>
                    <option value="Utilities">Utilities</option>
                    <option value="Rent">Rent</option>
                    <option value="Medical">Medical</option>
                    <option value="Education">Education</option>
                    <option value="Insurance">Insurance</option>
                    <option value="Loan">Loan</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="eyebrow block mb-1.5 !text-[9px]">Icono</label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {availableIcons.map(ico => (
                      <button key={ico} onClick={() => setNewIcon(ico)} className="h-10 rounded-xl grid place-items-center text-lg" style={{ border: `1px solid ${newIcon === ico ? 'var(--ink)' : 'var(--line)'}`, background: newIcon === ico ? 'var(--surface-3)' : 'var(--surface)' }}>{ico}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="eyebrow block mb-1.5 !text-[9px]">Limit ({currency})</label>
                  <input type="number" value={newLimit} onChange={e => setNewLimit(e.target.value)} className="input mono" placeholder="e.g. 500" />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button onClick={() => setIsAddInlineOpen(false)} className="btn-ghost !py-2 !px-4 text-[12px]">Cancel</button>
                  <button onClick={handleCreateBudget} className="btn-primary !py-2 !px-5 text-[12px]">Create sobre</button>
                </div>
                <button onClick={() => setIsAddModalOpen(true)} className="mono text-[11px] underline underline-offset-2 text-center" style={{ color: 'var(--ink-3)' }}>Open classic modal</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Envelope list eyebrow */}
        <div className="flex items-center justify-between pt-1">
          <p className="eyebrow">Envelope list</p>
          <span className="mono text-[11px]" style={{ color: 'var(--ink-3)' }}>{budgets.length} sobres</span>
        </div>

        {budgets.length === 0 ? (
          <div className="bg-[var(--surface-2)] border border-[var(--line)] rounded-[16px] p-8 text-center">
            <p className="mono text-[13px] font-bold">No envelopes yet</p>
            <p className="mono text-[11px] mt-1" style={{ color: 'var(--ink-2)' }}>Tap “Add New Envelope” to create your first pastel envelope.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {budgets.map((budget) => {
              const ratio = budget.spent / budget.limit;
              const isOver = ratio > 1;
              const pct = Math.min(100, Math.round(ratio * 100));
              const pastel = pastelForCategory(budget.category);
              const expanded = expandedId === budget.id;
              const isSelected = selectedBudgetId === budget.id;
              return (
                <div
                  key={budget.id}
                  className="bg-[var(--surface-2)] border rounded-[16px] p-4 flex flex-col gap-3"
                  style={{ borderColor: isSelected ? 'var(--ink)' : 'var(--line)' }}
                >
                  {/* Title row — mono bold + More details + icon */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-8 h-8 rounded-full grid place-items-center text-[15px] shrink-0" style={{ border: '1px solid var(--line)', background: 'var(--surface)' }}>{budget.icon}</span>
                      <h4 className="mono text-[13px] font-bold leading-tight truncate">{budget.category}</h4>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => setExpandedId(expanded ? null : budget.id)}
                        className="text-[11px] font-medium underline underline-offset-2"
                        style={{ color: 'var(--ink-2)' }}
                      >
                        {expanded ? 'Hide' : 'More details'}
                      </button>
                      <button onClick={() => handleOpenEdit(budget)} className="w-7 h-7 rounded-full grid place-items-center" style={{ border: '1px solid var(--line)', background: 'var(--surface)' }}><Edit2 size={11} /></button>
                      {onRemoveBudget && (
                        <button
                          onClick={() => {
                            if (deleteConfirmId === budget.id) { onRemoveBudget(budget.id); setDeleteConfirmId(null); }
                            else { setDeleteConfirmId(budget.id); setTimeout(() => setDeleteConfirmId(c => c === budget.id ? null : c), 3500); }
                          }}
                          className="w-7 h-7 rounded-full grid place-items-center"
                          style={{ border: '1px solid var(--line)', background: deleteConfirmId === budget.id ? 'var(--danger-bg)' : 'var(--surface)', color: deleteConfirmId === budget.id ? 'var(--danger)' : undefined }}
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Progress eyebrow + % */}
                  <div className="flex items-center justify-between">
                    <span className="eyebrow !text-[9px] !tracking-[0.14em]">Progress</span>
                    <span className="mono text-[11px] font-bold" style={{ color: isOver ? 'var(--danger)' : 'var(--ink)' }}>{pct}%</span>
                  </div>

                  {/* Pastel bar — h-2 rounded-full bg surface-3 inner bar-pink etc */}
                  <div className="h-2 rounded-full bg-[var(--surface-3)] overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-700 ${pastel}`} style={{ width: `${pct}%` }} />
                  </div>

                  {/* 3 cols — Limit / Spent / Remaining (mono 11px) */}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <p className="eyebrow !text-[8px] !tracking-[0.12em]">Limit</p>
                      <p className="mono text-[11px] font-bold mt-1 leading-none">{currency}{budget.limit.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="eyebrow !text-[8px] !tracking-[0.12em]">Spent</p>
                      <p className="mono text-[11px] font-bold mt-1 leading-none" style={{ color: isOver ? 'var(--danger)' : 'var(--ink)' }}>{currency}{budget.spent.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="eyebrow !text-[8px] !tracking-[0.12em]">Remaining</p>
                      <p className="mono text-[11px] font-bold mt-1 leading-none">{currency}{Math.max(0, budget.limit - budget.spent).toLocaleString()}</p>
                    </div>
                  </div>

                  {isOver && (
                    <p className="mono text-[10px] leading-relaxed px-2.5 py-1.5 rounded-full" style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--line)' }}>
                      Exceeded by {currency}{(budget.spent - budget.limit).toLocaleString()} — adjust the limit.
                    </p>
                  )}

                  {/* Expanded — ledger lines like Financial report */}
                  <AnimatePresence>
                    {expanded && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="pt-3 mt-1 flex flex-col gap-3" style={{ borderTop: '1px solid var(--line)' }}>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setSelectedBudgetId(budget.id)}
                              className="mono text-[11px] font-semibold px-3 py-1 rounded-full"
                              style={{ border: '1px solid var(--line)', background: isSelected ? 'var(--ink)' : 'var(--surface)', color: isSelected ? 'var(--accent-fg)' : 'var(--ink)' }}
                            >
                              {isSelected ? 'Selected' : 'View ledger'}
                            </button>
                            <span className="mono text-[10px]" style={{ color: 'var(--ink-3)' }}>{budget.subBreakdown?.length ?? 0} entries</span>
                          </div>

                          {selectedBudgetId === budget.id && selectedBudget && (
                            <div className="rounded-[12px] border p-3 flex flex-col gap-2" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="rounded-[10px] border p-2.5" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
                                  <p className="eyebrow !text-[8px]">Allocation</p>
                                  <p className="mono text-[12px] font-bold mt-1">{currency}{selectedBudget.limit.toLocaleString()}</p>
                                </div>
                                <div className="rounded-[10px] border p-2.5" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
                                  <p className="eyebrow !text-[8px]">Spent</p>
                                  <p className="mono text-[12px] font-bold mt-1">{currency}{selectedBudget.spent.toLocaleString()}</p>
                                </div>
                              </div>
                              <p className="eyebrow !text-[8px] mt-1">Entries</p>
                              <div className="divide-y" style={{ borderTop: '1px solid var(--line)' }}>
                                {selectedBudget.subBreakdown?.length ? selectedBudget.subBreakdown.map((item, i) => (
                                  <div key={i} className="flex justify-between items-center py-2.5 gap-3">
                                    <div className="min-w-0">
                                      <p className="text-[12px] font-medium truncate">{item.name}</p>
                                      <p className="mono text-[10px]" style={{ color: 'var(--ink-3)' }}>{Math.round((item.spent / (selectedBudget.limit || 1)) * 100)}% del sobre</p>
                                    </div>
                                    <span className="mono text-[11px] font-bold shrink-0">{currency}{item.spent.toLocaleString()}</span>
                                  </div>
                                )) : <div className="py-6 text-center mono text-[11px]" style={{ color: 'var(--ink-3)' }}>No entries yet.</div>}
                              </div>
                            </div>
                          )}

                          {!isOver && (
                            <p className="mono text-[10px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>
                              Healthy pace · {daysRemaining} days remaining · projected remainder {currency}{(budget.limit - budget.spent).toLocaleString()}.
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
        )}
      </div>

      {/* Edit modal — .input + btn-primary */}
      <AnimatePresence>
        {isEditModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }} onClick={() => setIsEditModalOpen(false)}>
            <motion.div initial={{ scale: 0.98, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.98, opacity: 0 }} onClick={e => e.stopPropagation()} className="card w-full max-w-sm p-6 relative rounded-[24px]">
              <button onClick={() => setIsEditModalOpen(false)} className="absolute top-4 right-4 w-7 h-7 rounded-full grid place-items-center" style={{ border: '1px solid var(--line)' }}><X size={13} /></button>
              <p className="eyebrow">Adjust limit</p>
              <h3 className="text-[15px] font-bold mt-1">Edit limit</h3>
              <div className="mt-5 space-y-3">
                <label className="eyebrow">New limit ({currency})</label>
                <input type="number" value={editLimitVal} onChange={e => setEditLimitVal(e.target.value)} className="input mono" placeholder="Enter limit" autoFocus />
                <div className="flex justify-end gap-2 pt-2"><button onClick={() => setIsEditModalOpen(false)} className="btn-ghost">Cancel</button><button onClick={handleSaveEdit} className="btn-primary">Save</button></div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }} onClick={() => setIsAddModalOpen(false)}>
            <motion.div initial={{ scale: 0.98, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.98, opacity: 0 }} onClick={e => e.stopPropagation()} className="card w-full max-w-sm p-6 relative rounded-[24px]">
              <button onClick={() => setIsAddModalOpen(false)} className="absolute top-4 right-4 w-7 h-7 rounded-full grid place-items-center" style={{ border: '1px solid var(--line)' }}><X size={13} /></button>
              <p className="eyebrow">Nuevo sobre</p>
              <h3 className="text-[15px] font-bold mt-1">Create sobre</h3>
              <div className="mt-5 space-y-4">
                <div><label className="eyebrow block mb-2">Category</label><select value={newCategory} onChange={e => setNewCategory(e.target.value as CategoryExpense)} className="input"><option value="Food">Food / Dining</option><option value="Transport">Transport</option><option value="Entertainment">Entertainment</option><option value="Shopping">Shopping</option><option value="Utilities">Utilities</option><option value="Rent">Rent</option><option value="Medical">Medical</option><option value="Education">Education</option><option value="Insurance">Insurance</option><option value="Loan">Loan</option><option value="Other">Other</option></select></div>
                <div><label className="eyebrow block mb-2">Icono</label><div className="grid grid-cols-5 gap-1.5">{availableIcons.map(ico => <button key={ico} onClick={() => setNewIcon(ico)} className="h-10 rounded-xl grid place-items-center text-lg" style={{ border: `1px solid ${newIcon === ico ? 'var(--ink)' : 'var(--line)'}`, background: newIcon === ico ? 'var(--surface-2)' : 'var(--surface)' }}>{ico}</button>)}</div></div>
                <div><label className="eyebrow block mb-2">Limit ({currency})</label><input type="number" value={newLimit} onChange={e => setNewLimit(e.target.value)} className="input mono" placeholder="e.g. 500" /></div>
                <div className="flex justify-end gap-2 pt-1"><button onClick={() => setIsAddModalOpen(false)} className="btn-ghost">Cancel</button><button onClick={handleCreateBudget} className="btn-primary">Create</button></div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
