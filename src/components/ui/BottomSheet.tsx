import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';

export interface BottomSheetProps { isOpen: boolean; onClose: () => void; title?: React.ReactNode; subtitle?: string; children: React.ReactNode; }

export function BottomSheet({ isOpen, onClose, title, subtitle, children }: BottomSheetProps) {
  useEffect(() => { if (isOpen) document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = 'unset'; }; }, [isOpen]);
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} onClick={onClose} className="fixed inset-0 bg-[var(--ink)]/40 backdrop-blur-[2px]" />
          <motion.div role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Sheet'} initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 26, stiffness: 220 }} className="relative w-full max-w-lg bg-[var(--surface)] border-t sm:border border-[var(--line)] rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden z-10 max-h-[85vh] flex flex-col">
            <div className="w-10 h-1 bg-[var(--line-strong)] rounded-full mx-auto my-3 shrink-0 sm:hidden" />
            {title && (
              <div className="flex items-center justify-between px-5 h-12 border-b border-[var(--line)] shrink-0">
                <div>{typeof title === 'string' ? <h3 className="text-[13px] font-bold tracking-tight text-[var(--ink)]">{title}</h3> : title}{subtitle && <p className="mono text-[11px] text-[var(--ink-3)]">{subtitle}</p>}</div>
                <button onClick={onClose} aria-label="Close" className="w-7 h-7 rounded-full bg-[var(--surface-2)] border border-[var(--line)] text-[var(--ink-2)] hover:text-[var(--ink)] flex items-center justify-center"><X size={13} /></button>
              </div>
            )}
            <div className="ledger-rule" />
            <div className="p-5 sm:p-6 overflow-y-auto flex-1">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
