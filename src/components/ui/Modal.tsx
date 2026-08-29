import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  showCloseButton?: boolean;
}

export function Modal({ isOpen, onClose, title, subtitle, children, maxWidth = 'md', showCloseButton = true }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) { document.body.style.overflow = 'hidden'; window.addEventListener('keydown', onKey); }
    return () => { document.body.style.overflow = 'unset'; window.removeEventListener('keydown', onKey); };
  }, [isOpen, onClose]);
  const maxWidths: Record<string,string> = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-xl', '2xl': 'max-w-2xl' };
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} onClick={onClose} className="fixed inset-0 bg-[var(--ink)]/40 backdrop-blur-[2px]" />
          <motion.div role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Dialog'} initial={{ opacity: 0, scale: 0.98, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98, y: 6 }} transition={{ type: 'spring', damping: 26, stiffness: 280 }} className={`relative w-full ${maxWidths[maxWidth]} card p-0 overflow-hidden z-10 my-8`}>
            {(title || showCloseButton) && (
              <div className="flex items-center justify-between px-5 h-12 border-b border-[var(--line)] bg-[var(--surface)]">
                <div>{typeof title === 'string' ? <h3 className="text-[13px] font-bold tracking-tight text-[var(--ink)]">{title}</h3> : title}{subtitle && <p className="mono text-[11px] text-[var(--ink-3)]">{subtitle}</p>}</div>
                {showCloseButton && <button onClick={onClose} aria-label="Close" className="w-7 h-7 rounded-full bg-[var(--surface-2)] border border-[var(--line)] text-[var(--ink-2)] hover:text-[var(--ink)] flex items-center justify-center"><X size={13} /></button>}
              </div>
            )}
            <div className="ledger-rule" />
            <div className="p-5 sm:p-6 max-h-[80vh] overflow-y-auto">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
