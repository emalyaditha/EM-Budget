import React from 'react';
import { AppNotification } from '../types';
import { Bell, Check, Trash2, X, AlertTriangle, Info, Calendar, Sparkles } from 'lucide-react';

interface NotificationDrawerProps {
  notifications: AppNotification[];
  onMarkRead: (id: string) => void;
  onClear: (id: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export default function NotificationDrawer({
  notifications,
  onMarkRead,
  onClear,
  isOpen,
  onClose,
}: NotificationDrawerProps) {
  if (!isOpen) return null;

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div id="notification-sheet" className="absolute inset-0 bg-black/40 dark:bg-[#05050a]/90 backdrop-blur-sm z-50 flex flex-col justify-end transition-all duration-300">
      
      {/* Tap out trigger background */}
      <div className="absolute inset-0 cursor-pointer" onClick={onClose} />

      <div className="bg-card border-t border-border rounded-t-[32px] h-[85%] flex flex-col overflow-hidden shadow-2xl relative z-10 max-w-lg mx-auto w-full">
        
        {/* Pull Drag Line bar */}
        <div className="w-12 h-1 bg-zinc-200 dark:bg-zinc-800 rounded-full mx-auto my-3 shrink-0 cursor-pointer" onClick={onClose} />

        {/* Header toolbar */}
        <div className="px-4 sm:px-6 pb-4 border-b border-border flex justify-between items-center">
          <div className="min-w-0">
            <h3 className="font-extrabold text-card-foreground text-sm sm:text-base flex items-center gap-2">
              <Bell size={16} className="text-muted-foreground shrink-0" />
              Intelligence Center
              {unreadCount > 0 && (
                <span className="bg-indigo-600 text-white font-black font-mono text-[9px] px-2 py-0.5 rounded-full border border-indigo-500 shadow-md shrink-0">
                  {unreadCount} NEW
                </span>
              )}
            </h3>
            <p className="text-[10px] sm:text-[10.5px] text-muted-foreground font-semibold mt-0.5 font-sans truncate">Run-rates, dues, and transaction records</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 sm:p-2.5 bg-secondary border border-border rounded-full text-muted-foreground hover:text-card-foreground transition-colors cursor-pointer shrink-0 ml-2"
          >
            <X size={14} />
          </button>
        </div>

        {/* Notifications Feed List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3.5 overscroll-contain touch-auto" style={{ scrollbarWidth: 'thin' }}>
          {notifications.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-center space-y-3">
              <div className="p-4 bg-secondary rounded-full border border-border">
                <Bell size={32} className="text-muted-foreground" />
              </div>
              <div>
                <p className="text-card-foreground text-xs font-bold font-mono uppercase tracking-wider">Secure Vault Clear</p>
                <p className="text-muted-foreground text-[11px] leading-relaxed max-w-[240px] mt-1">
                  Your budget ledger feed is completely quiet. All automated cycles are balanced.
                </p>
              </div>
            </div>
          ) : (
            <>
              {notifications.map((notif) => {
                const iconColor = 
                  notif.type === 'alert' ? 'text-rose-500 bg-rose-500/10 border border-rose-500/20' :
                  notif.type === 'reminder' ? 'text-amber-500 bg-amber-500/10 border border-amber-500/20' : 
                  'text-indigo-500 bg-indigo-500/10 border border-indigo-500/20';

                return (
                  <div
                    key={notif.id}
                    className={`p-4 rounded-2xl border transition-all ${
                      notif.read 
                        ? 'bg-secondary/40 border-border opacity-55' 
                        : 'bg-secondary/80 border-border hover:border-muted-foreground shadow-sm ring-1 ring-black/5 dark:ring-white/5'
                    }`}
                  >
                    <div className="flex gap-3.5">
                      <div className={`p-2.5 rounded-xl shrink-0 ${iconColor} flex items-center justify-center h-10 w-10`}>
                        {notif.type === 'alert' && <AlertTriangle size={15} />}
                        {notif.type === 'reminder' && <Calendar size={15} />}
                        {notif.type === 'system' && <Info size={15} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-card-foreground leading-relaxed font-semibold">
                          {notif.message}
                        </p>
                        <span className="text-[9px] font-mono font-bold text-muted-foreground block mt-1.5 uppercase">
                          {notif.date}
                        </span>
                      </div>
                    </div>

                    {/* Actions buttons */}
                    <div className="flex justify-end gap-3 mt-3 pt-2.5 border-t border-border">
                      {!notif.read && (
                        <button
                          onClick={() => onMarkRead(notif.id)}
                          className="text-[10.5px] text-blue-600 dark:text-emerald-400 font-bold font-mono uppercase flex items-center gap-1 hover:text-emerald-500 cursor-pointer"
                        >
                          <Check size={11} className="stroke-[2.5px]" /> Read
                        </button>
                      )}
                      <button
                        onClick={() => onClear(notif.id)}
                        className="text-[10.5px] text-muted-foreground font-bold font-mono uppercase flex items-center gap-1 hover:text-rose-500 cursor-pointer"
                      >
                        <Trash2 size={11.5} /> Clear
                      </button>
                    </div>
                  </div>
                );
              })}
              {/* Extra spacing for better scrolling experience */}
              <div className="h-10" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
