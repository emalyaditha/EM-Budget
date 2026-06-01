import React from 'react';
import { AppNotification } from '../types';
import { Bell, Check, Trash2, X, AlertTriangle, Info, Calendar } from 'lucide-react';

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
    <div id="notification-sheet" className="absolute inset-0 bg-[#0B0B0B]/90 backdrop-blur-md z-40 flex flex-col justify-end transition-all duration-300">
      <div className="bg-neutral-950 border-t border-zinc-900 rounded-t-[32px] h-[85%] flex flex-col overflow-hidden shadow-2xl relative">
        
        {/* Pull Indicator style */}
        <div className="w-12 h-1 bg-zinc-800 rounded-full mx-auto my-3 shrink-0" />

        {/* Toolbar Header */}
        <div className="px-5 pb-3 border-b border-zinc-900 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-white text-md flex items-center gap-2">
              <Bell size={18} className="text-zinc-400" />
              Notifications
              {unreadCount > 0 && (
                <span className="bg-white text-black font-semibold font-mono text-[9px] px-2 py-0.5 rounded-full">
                  {unreadCount} NEW
                </span>
              )}
            </h3>
            <p className="text-[10px] text-zinc-500 font-medium">Real-time balances & alerts core</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 bg-neutral-900 border border-zinc-800 rounded-full text-zinc-400 hover:text-white"
          >
            <X size={15} />
          </button>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {notifications.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <Bell size={32} className="text-zinc-800 mb-2" />
              <p className="text-zinc-500 text-xs">Your ledger feed is completely quiet</p>
              <p className="text-zinc-600 text-[10px]">Upcoming dues will list here</p>
            </div>
          ) : (
            notifications.map((notif) => {
              const iconColor = 
                notif.type === 'alert' ? 'text-rose-400 bg-rose-500/10' :
                notif.type === 'reminder' ? 'text-amber-400 bg-amber-500/10' : 'text-blue-400 bg-blue-500/10';

              return (
                <div
                  key={notif.id}
                  className={`p-3.5 rounded-2xl border transition-all ${
                    notif.read 
                      ? 'bg-neutral-950/40 border-zinc-900/60 opacity-60' 
                      : 'bg-neutral-900/45 border-zinc-805 ring-1 ring-white/5'
                  }`}
                >
                  <div className="flex gap-3">
                    <div className={`p-2 rounded-xl shrink-0 ${iconColor}`}>
                      {notif.type === 'alert' && <AlertTriangle size={15} />}
                      {notif.type === 'reminder' && <Calendar size={15} />}
                      {notif.type === 'system' && <Info size={15} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-200 leading-relaxed font-medium">
                        {notif.message}
                      </p>
                      <span className="text-[9px] font-mono text-zinc-600 block mt-1">
                        {notif.date}
                      </span>
                    </div>
                  </div>

                  {/* Actions buttons */}
                  <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-zinc-900/70">
                    {!notif.read && (
                      <button
                        onClick={() => onMarkRead(notif.id)}
                        className="text-[10px] text-emerald-400 font-medium flex items-center gap-1 hover:text-emerald-300"
                      >
                        <Check size={12} /> Mark read
                      </button>
                    )}
                    <button
                      onClick={() => onClear(notif.id)}
                      className="text-[10px] text-zinc-600 font-medium flex items-center gap-1 hover:text-rose-400"
                    >
                      <Trash2 size={12} /> Dismiss
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
