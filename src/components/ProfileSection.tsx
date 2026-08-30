import React, { useState, useEffect } from 'react';
import { Mail, Save, Edit2, ShieldCheck, KeyRound, CreditCard, LogOut, X, Camera, Trash2 } from 'lucide-react';
import { AppState } from '../types';
import { updateAuthAccountName } from '../supabase';
import { useNotifications } from '../context/NotificationContext';

interface ProfileSectionProps {
  state: AppState;
  updateState: (updater: (prev: AppState) => AppState) => void;
  onOpenSettings: () => void;
  onLogout: () => void;
  onClose: () => void;
}

export default function ProfileSection({ state, updateState, onOpenSettings, onLogout, onClose }: ProfileSectionProps) {
  const { showToast } = useNotifications();
  const [isEditing, setIsEditing] = useState(false);
  const profileFallback = (() => {
    const e = state.userProfile?.email;
    if (e && typeof e === 'string') {
      const local = e.trim().split('@')[0] || '';
      if (local) return local.charAt(0).toUpperCase() + local.slice(1).replace(/[._-]+/g, ' ');
    }
    return 'User';
  })();
  const [name, setName] = useState(state.userProfile?.name || profileFallback);
  const [tempAvatar, setTempAvatar] = useState<string | undefined>(state.userProfile?.avatarUrl);

  useEffect(() => {
    setName(state.userProfile?.name || profileFallback);
    setTempAvatar(state.userProfile?.avatarUrl);
  }, [state.userProfile]);

  const handleSave = async () => {
    if (!name.trim()) { showToast('Profile name cannot be blank.', 'error'); return; }
    updateState((prev) => ({ ...prev, userProfile: { ...prev.userProfile, name: name.trim(), avatarUrl: tempAvatar } }));
    try { await updateAuthAccountName(state.userProfile?.email || '', name.trim(), tempAvatar); showToast('Profile synced.', 'success'); }
    catch { showToast('Saved locally — cloud sync pending.', 'warning'); }
    setIsEditing(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1 * 1024 * 1024) { showToast('Image too large (max 1 MB).', 'error'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const b64 = ev.target?.result as string;
      if (b64) { setTempAvatar(b64); showToast('Image loaded — Save to keep it.', 'success'); }
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => { setTempAvatar(undefined); showToast('Photo cleared — Save to confirm.', 'info'); };
  const firstLetter = name ? name.charAt(0).toUpperCase() : 'U';

  return (
    <div className="card p-6 md:p-7 space-y-5" id="secure-profile-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Vault account</p>
          <h2 className="text-[16px] font-bold tracking-tight text-[var(--ink)] mt-1">Profile</h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { if (isEditing) { setName(state.userProfile?.name || profileFallback); setTempAvatar(state.userProfile?.avatarUrl); } setIsEditing((v) => !v); }} className="btn-ghost px-3 py-1.5 text-[12px] inline-flex items-center gap-1.5">
            {isEditing ? <span>Cancel</span> : <><Edit2 size={12} /><span>Edit</span></>}
          </button>
          <button onClick={onClose} aria-label="Close profile" className="w-7 h-7 rounded-full bg-[var(--surface-2)] border border-[var(--line)] text-[var(--ink-2)] hover:text-[var(--ink)] flex items-center justify-center">
            <X size={13} />
          </button>
        </div>
      </div>

      <div className="ledger-rule" />

      <div className="flex flex-col items-center text-center">
        <div className="relative">
          <div className="w-[76px] h-[76px] rounded-full bg-[var(--surface-2)] border border-[var(--line)] overflow-hidden flex items-center justify-center text-[var(--ink)] text-[22px] font-bold">
            {tempAvatar ? <img src={tempAvatar} alt={name} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : firstLetter}
            {isEditing && (
              <label className="absolute inset-0 rounded-full bg-[var(--ink)]/55 backdrop-blur-[1px] flex flex-col items-center justify-center text-white cursor-pointer">
                <Camera size={16} />
                <span className="mono text-[9px] mt-0.5">Change</span>
                <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
              </label>
            )}
          </div>
          {!isEditing && <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[var(--success)] border-2 border-[var(--surface)]" aria-hidden />}
        </div>

        {isEditing ? (
          <div className="w-full max-w-[260px] mt-4 space-y-2.5">
            {tempAvatar && <button onClick={handleRemovePhoto} className="btn-ghost w-full justify-center text-[12px]"><Trash2 size={12} /> Remove photo</button>}
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name" maxLength={25} className="input text-center" />
            <button onClick={handleSave} className="btn-primary w-full justify-center inline-flex items-center gap-1.5"><Save size={12} /> Save</button>
          </div>
        ) : (
          <div className="mt-3">
            <h3 className="text-[15px] font-bold text-[var(--ink)] tracking-tight">{state.userProfile?.name || profileFallback}</h3>
            <p className="mono text-[11px] text-[var(--ink-2)] mt-0.5">{state.userProfile?.email || 'Local vault'}</p>
            <span className="mt-2 inline-flex mono text-[10px] px-2 py-0.5 rounded-full border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink-2)]">Premier member</span>
          </div>
        )}
      </div>

      <div className="ledger-rule" />

      <div className="space-y-3">
        <div className="flex items-center gap-3 py-1">
          <span className="w-8 h-8 rounded-full bg-[var(--surface-2)] border border-[var(--line)] flex items-center justify-center text-[var(--ink-2)] shrink-0"><Mail size={13} /></span>
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Email</p>
            <p className="mono text-[12px] text-[var(--ink)] truncate">{state.userProfile?.email || 'Local storage'}</p>
          </div>
        </div>
        <div className="ledger-rule" />
        <div className="flex items-center gap-3 py-1">
          <span className="w-8 h-8 rounded-full bg-[var(--surface-2)] border border-[var(--line)] flex items-center justify-center text-[var(--ink-2)] shrink-0"><CreditCard size={13} /></span>
          <div className="flex-1 min-w-0">
            <p className="eyebrow">Currency</p>
            <select value={state.currency} onChange={(e) => updateState((prev) => ({ ...prev, currency: e.target.value }))} className="input mt-1 text-[12px]">
              <option value="Rs.">Rs. — Sri Lankan Rupee</option>
              <option value="$">$ — US Dollar</option>
              <option value="€">€ — Euro</option>
              <option value="£">£ — British Pound</option>
              <option value="¥">¥ — Japanese Yen</option>
              <option value="SAR">SAR — Saudi Riyal</option>
            </select>
          </div>
        </div>
        <div className="ledger-rule" />
        <button onClick={onOpenSettings} className="w-full flex items-center justify-between py-2 text-left group">
          <span className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-[var(--surface-2)] border border-[var(--line)] flex items-center justify-center text-[var(--ink-2)] group-hover:text-[var(--ink)]"><KeyRound size={13} /></span>
            <span><span className="eyebrow block">Cloud vault</span><span className="text-[12px] font-semibold text-[var(--ink)]">Encryption &amp; sync settings</span></span>
          </span>
          <ShieldCheck size={13} className="text-[var(--success)]" />
        </button>
      </div>

      <div className="ledger-rule" />

      <button onClick={() => { showToast('Session ended.', 'info'); onLogout(); }} className="btn-ghost w-full justify-center inline-flex items-center gap-2 text-[var(--danger)] hover:bg-[var(--danger-bg)] border-[var(--line)]">
        <LogOut size={13} /> Sign out
      </button>
    </div>
  );
}
