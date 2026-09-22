import React, { createContext, useContext, useState, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle, AlertCircle, Info, XCircle, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ConfirmOptions {
  message: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

interface NotificationContextType {
  showToast: (first: any, second?: any) => void;
  showConfirm: (options: ConfirmOptions) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);

  const showToast = (first: any, second?: any) => {
    let type: ToastType = 'info';
    let message = '';
    const validTypes: ToastType[] = ['success', 'error', 'warning', 'info'];

    if (validTypes.includes(first as ToastType)) {
      type = first as ToastType;
      message = typeof second === 'string' ? second : String(second || '');
    } else if (second && validTypes.includes(second as ToastType)) {
      type = second as ToastType;
      message = typeof first === 'string' ? first : String(first || '');
    } else {
      message = typeof first === 'string' ? first : String(first || '');
      type = 'info';
    }

    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, type, message }]);
    const timeout = type === 'error' ? 8000 : 5000;
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, timeout);
  };

  const showConfirm = (options: ConfirmOptions) => {
    setConfirm(options);
  };

  return (
    <NotificationContext.Provider value={{ showToast, showConfirm }}>
      {children}
      
      {/* Toast Manager */}
      <div aria-live="polite" aria-atomic="true" className="fixed top-4 left-4 right-4 md:left-auto md:right-4 z-[9999] flex flex-col gap-2 items-center md:items-end">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              role="status"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`p-4 rounded-xl shadow-lg border flex items-center gap-3 backdrop-blur-sm w-full max-w-[300px]
                ${toast.type === 'success' ? 'bg-[var(--surface)] border-emerald-500/30 text-emerald-700 dark:text-emerald-100' : 
                  toast.type === 'error' ? 'bg-[var(--surface)] border-[var(--danger)]/30 text-[var(--danger)]' :
                  toast.type === 'warning' ? 'bg-[var(--surface)] border-amber-500/30 text-amber-700 dark:text-amber-100' :
                  'bg-[var(--surface)] border-[var(--line)] text-[var(--ink)]'}`}
            >
              {toast.type === 'success' && <CheckCircle size={20} className="text-emerald-500" />}
              {toast.type === 'error' && <XCircle size={20} className="text-[var(--danger)]" />}
              {toast.type === 'warning' && <AlertCircle size={20} className="text-amber-500" />}
              {toast.type === 'info' && <Info size={20} className="text-[var(--ink-2)]" />}
              <p className="text-sm font-medium">{toast.message}</p>
              <button className="ml-auto text-[var(--ink-2)] hover:text-[var(--ink)]" onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}><X size={16} /></button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {confirm && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Confirm Action"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="card p-6 max-w-sm w-full"
            >
              <h3 className="text-[var(--ink)] font-bold mb-2">Confirm Action</h3>
              <div className="ledger-rule mb-4" />
              <p className="text-[var(--ink-2)] text-sm mb-6">{confirm.message}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => { confirm.onCancel?.(); setConfirm(null); }}
                  className="btn-ghost flex-1"
                >Cancel</button>
                <button
                  onClick={() => { confirm.onConfirm(); setConfirm(null); }}
                  className="btn-primary flex-1"
                >Confirm</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used within a NotificationProvider');
  return context;
};
