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
    if (type !== 'error') {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 5000);
    }
  };

  const showConfirm = (options: ConfirmOptions) => {
    setConfirm(options);
  };

  return (
    <NotificationContext.Provider value={{ showToast, showConfirm }}>
      {children}
      
      {/* Toast Manager */}
      <div className="fixed top-4 left-4 right-4 md:left-auto md:right-4 z-[9999] flex flex-col gap-2 items-center md:items-end">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`p-4 rounded-xl shadow-lg border flex items-center gap-3 backdrop-blur-sm w-full max-w-[300px]
                ${toast.type === 'success' ? 'bg-emerald-900/80 border-emerald-500 text-emerald-100' : 
                  toast.type === 'error' ? 'bg-red-900/80 border-red-500 text-red-100' :
                  toast.type === 'warning' ? 'bg-amber-900/80 border-amber-500 text-amber-100' :
                  'bg-blue-900/80 border-blue-500 text-blue-100'}`}
            >
              {toast.type === 'success' && <CheckCircle size={20} />}
              {toast.type === 'error' && <XCircle size={20} />}
              {toast.type === 'warning' && <AlertCircle size={20} />}
              {toast.type === 'info' && <Info size={20} />}
              <p className="text-sm font-medium">{toast.message}</p>
              <button className="ml-auto" onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}><X size={16} /></button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {confirm && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl shadow-2xl max-w-sm w-full"
            >
              <h3 className="text-white font-bold mb-4">Confirm Action</h3>
              <p className="text-zinc-300 text-sm mb-6">{confirm.message}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => { confirm.onCancel?.(); setConfirm(null); }}
                  className="flex-1 px-4 py-2 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition"
                >Cancel</button>
                <button
                  onClick={() => { confirm.onConfirm(); setConfirm(null); }}
                  className="flex-1 px-4 py-2 bg-emerald-500 text-neutral-950 rounded-lg hover:bg-emerald-600 transition"
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
