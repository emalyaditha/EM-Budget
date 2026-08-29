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

export default function NotificationDrawer({ notifications, onMarkRead, onClear, isOpen, onClose }: NotificationDrawerProps) {
  if (!isOpen) return null;
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div id="notification-sheet" className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center sm:items-end p-0 sm:p-6">
      <button aria-label="Close notifications" onClick={onClose} className="absolute inset-0 bg-[var(--ink)]/40 backdrop-blur-[2px]" />

      <div className="relative z-10 w-full sm:max-w-[420px] bg-[var(--surface)] border-t sm:border border-[var(--line)] sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[82vh] sm:max-h-[78vh] overflow-hidden">
        <div className="w-10 h-1 bg-[var(--line-strong)] rounded-full mx-auto my-3 sm:hidden shrink-0" />

        <div className="px-5 h-12 flex items-center justify-between border-b border-[var(--line)] shrink-0">
          <div className="min-w-0 flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-[var(--surface-2)] border border-[var(--line)] flex items-center justify-center text-[var(--ink-2)]"><Bell size={13} /></span>
            <div className="min-w-0">
              <h3 className="text-[12px] font-bold tracking-tight text-[var(--ink)] leading-none flex items-center gap-2">Notifications
                {unreadCount > 0 && <span className="mono text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--ink)] text-[var(--bg)]">{unreadCount} new</span>}
              </h3>
              <p className="mono text-[10px] text-[var(--ink-3)] leading-none mt-1">Dues, alerts, and ledger notes</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-7 h-7 rounded-full bg-[var(--surface-2)] border border-[var(--line)] text-[var(--ink-2)] hover:text-[var(--ink)] flex items-center justify-center"><X size={13} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {notifications.length === 0 ? (
            <div className="py-14 text-center">
              <div className="w-10 h-10 rounded-full bg-[var(--surface-2)] border border-[var(--line)] flex items-center justify-center mx-auto text-[var(--ink-3)]"><Bell size={16} /></div>
              <p className="eyebrow mt-3">All clear</p>
              <p className="text-[12px] leading-5 text-[var(--ink-2)] mt-1 max-w-[28ch] mx-auto">No alerts — your ledger is quiet.</p>
            </div>
          ) : (
            <>
              {notifications.map((notif) => {
                const tone = notif.type === 'alert' ? 'text-[var(--danger)] bg-[var(--danger-bg)] border-[var(--line)]' : notif.type === 'reminder' ? 'text-[var(--warning)] bg-[var(--warning-bg)] border-[var(--line)]' : 'text-[var(--ink-2)] bg-[var(--surface-2)] border-[var(--line)]';
                return (
                  <div key={notif.id} className={`rounded-xl border p-3.5 ${notif.read ? 'bg-[var(--surface-2)] border-[var(--line)] opacity-70' : 'bg-[var(--surface)] border-[var(--line)]'}`}>
                    <div className="flex gap-3">
                      <span className={`w-8 h-8 rounded-full border flex items-center justify-center shrink-0 ${tone}`}>
                        {notif.type === 'alert' && <AlertTriangle size={13} />}
                        {notif.type === 'reminder' && <Calendar size={13} />}
                        {notif.type === 'system' && <Info size={13} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] leading-5 text-[var(--ink)]">{notif.message}</p>
                        <p className="mono text-[10px] text-[var(--ink-3)] mt-1">{notif.date}</p>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 mt-2.5 pt-2.5 border-t border-[var(--line)]">
                      {!notif.read && <button onClick={() => onMarkRead(notif.id)} className="mono text-[11px] px-2.5 py-1 rounded-full border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink-2)] hover:text-[var(--ink)] inline-flex items-center gap-1"><Check size={11} /> Read</button>}
                      <button onClick={() => onClear(notif.id)} className="mono text-[11px] px-2.5 py-1 rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--ink-3)] hover:text-[var(--danger)] inline-flex items-center gap-1"><Trash2 size={11} /> Clear</button>
                    </div>
                  </div>
                );
              })}
              <div className="h-2" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
