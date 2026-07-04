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
  const [name, setName] = useState(state.userProfile?.name || 'User');
  const [tempAvatar, setTempAvatar] = useState<string | undefined>(state.userProfile?.avatarUrl);

  // Keep state in sync if it changes from outside
  useEffect(() => {
    setName(state.userProfile?.name || 'User');
    setTempAvatar(state.userProfile?.avatarUrl);
  }, [state.userProfile]);

  const handleSave = async () => {
    if (!name.trim()) {
      showToast('error', 'Profile name cannot be blank.');
      return;
    }
    
    updateState(prev => ({
        ...prev,
        userProfile: { 
          ...prev.userProfile, 
          name: name.trim(),
          avatarUrl: isAllowedEmail ? tempAvatar : prev.userProfile?.avatarUrl
        }
    }));

    try {
        await updateAuthAccountName(state.userProfile?.email || '', name.trim(), isAllowedEmail ? tempAvatar : undefined);
        showToast('success', 'Profile records synced with secure cloud record.');
    } catch (err) {
        console.error("Failed to sync profile to auth_accounts", err);
        showToast('warning', 'Profile updated locally, cloud database sync pending.');
    }
    setIsEditing(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size (max 1MB to keep Base64 size safe and fast)
    if (file.size > 1.0 * 1024 * 1024) {
      showToast('error', 'Image size is too large (Maximum allowed size is 1MB).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64Url = event.target?.result as string;
      if (base64Url) {
        setTempAvatar(base64Url);
        showToast('success', 'Image loaded! Click "Save Record" to permanently store it.');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setTempAvatar(undefined);
    showToast('info', 'Photo cleared. Save to confirm changes.');
  };

  const firstLetter = name ? name.charAt(0).toUpperCase() : 'U';
  const isAllowedEmail = state.userProfile?.email === 'emalyaditha@gmail.com';

  return (
    <div className="bg-gradient-to-br from-card/90 via-[#0a0a0d] to-zinc-950 border border-default p-6 md:p-8 rounded-[32px] shadow-2xl space-y-6" id="secure-profile-card">
      
      {/* HEADER SECTION */}
      <div className="flex justify-between items-start pb-4 border-b border-default">
        <div>
          <span className="text-[10px] tracking-wider text-indigo-400 font-mono font-bold uppercase block mb-0.5">VAULT SUITE SECURE</span>
          <h2 className="text-lg font-extrabold text-primary">Vault Account</h2>
        </div>
        
        <div className="flex flex-col gap-2 items-end">
          <button onClick={onClose} className="text-muted hover:text-primary transition-colors">
            <X size={20} />
          </button>
          <button 
            onClick={() => {
              if (isEditing) {
                setName(state.userProfile?.name || 'User');
                setTempAvatar(state.userProfile?.avatarUrl);
              }
              setIsEditing(!isEditing);
            }} 
            className="p-2 px-3.5 bg-card hover:bg-card border border-default hover:border-default rounded-xl text-xs font-bold text-secondary hover:text-primary transition-all cursor-pointer flex items-center gap-1.5"
          >
            {isEditing ? (
              <span className="text-danger">Cancel</span>
            ) : (
              <>
                <Edit2 size={13} />
                <span>Modify</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* AVATAR & NAME DISPLAY */}
      <div className="flex flex-col items-center py-4 bg-primary/40 border border-subtle rounded-2xl p-6 relative overflow-hidden">
        {/* Glow effect */}
        <div className="absolute -top-12 -left-12 w-28 h-28 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-10 -right-10 w-28 h-28 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />

        <div className="relative group mb-4">
          <div className="absolute -inset-1.5 bg-gradient-to-tr from-indigo-600 via-purple-600 to-indigo-500 rounded-full blur opacity-60 group-hover:opacity-100 transition duration-500 animate-pulse" />
          <div className="relative w-20 h-20 bg-card border-2 border-default rounded-full overflow-hidden flex items-center justify-center text-primary text-3xl font-extrabold shadow-xl">
            {tempAvatar ? (
              <img 
                src={tempAvatar} 
                alt={name} 
                className="w-full h-full object-cover" 
                referrerPolicy="no-referrer"
              />
            ) : (
              firstLetter
            )}
            
            {isEditing && isAllowedEmail && (
              <label className="absolute inset-0 bg-black/70 hover:bg-black/80 flex flex-col items-center justify-center text-primary hover:text-primary transition-all cursor-pointer">
                <Camera size={18} className="text-indigo-400 mb-0.5 animate-bounce" />
                <span className="text-[8px] font-bold uppercase tracking-wider">Change</span>
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={handleFileChange} 
                  className="hidden" 
                />
              </label>
            )}
          </div>
          {!isEditing && (
            <span className="absolute bottom-0 right-1 w-5.5 h-5.5 bg-blue-500 border-4 border-zinc-950 rounded-full" title="Identity Verified Status" />
          )}
        </div>

        {isEditing ? (
          <div className="w-full max-w-[220px] space-y-2.5 mt-2">
            {tempAvatar && isAllowedEmail && (
              <button
                onClick={handleRemovePhoto}
                className="w-full py-1.5 bg-rose-950/20 hover:bg-rose-950/40 border border-rose-900/45 hover:border-rose-500 text-danger text-[10px] font-bold rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer"
              >
                <Trash2 size={11} />
                <span>Remove Profile Image</span>
              </button>
            )}
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-card border border-default hover:border-default focus:border-indigo-500 text-primary rounded-xl px-4 py-2.5 text-center text-sm font-bold transition-all focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="Display Name"
              maxLength={25}
            />
            
            <button
              onClick={handleSave}
              className="w-full bg-white hover:bg-surface text-black py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md"
            >
              <Save size={13} />
              <span>Save Record</span>
            </button>
          </div>
        ) : (
          <div className="text-center">
            <h3 className="text-xl font-extrabold text-primary tracking-tight">{state.userProfile?.name || 'User'}</h3>
            <span className="px-2.5 py-0.5 bg-emerald-950/40 border border-emerald-900/40 text-success text-[9px] uppercase font-bold tracking-widest rounded-full inline-block mt-2 font-mono">
              PREMIER MEMBER
            </span>
          </div>
        )}
      </div>

      {/* CORE DETAILS LIST CONTAINER */}
      <div className="space-y-3">
        {/* Email information */}
        <div className="flex items-center gap-3.5 bg-card border border-default p-4 rounded-xl">
          <div className="p-2 bg-card rounded-lg text-muted text-secondary">
            <Mail size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[9px] font-mono text-muted block uppercase font-bold text-muted">Linked Account Email</span>
            <span className="text-xs font-mono font-bold text-primary block truncate">{state.userProfile?.email || 'Client Local Storage'}</span>
          </div>
        </div>

        {/* Currency configuration indicator */}
        <div className="flex items-center gap-3.5 bg-card border border-default p-4 rounded-xl">
          <div className="p-2 bg-card rounded-lg text-secondary">
            <CreditCard size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[9px] font-mono text-muted block uppercase font-bold text-muted">Preferred Local Currency</span>
            <select
              value={state.currency}
              onChange={(e) => updateState(prev => ({ ...prev, currency: e.target.value }))}
              className="w-full bg-black/40 border border-default rounded-lg text-xs px-2 py-2 text-primary focus:outline-none focus:border-default transition-colors cursor-pointer"
            >
              <option value="Rs.">Rs. (Sri Lankan Rupee)</option>
              <option value="$">$ (US Dollar)</option>
              <option value="€">€ (Euro)</option>
              <option value="£">£ (British Pound)</option>
              <option value="¥">¥ (Japanese Yen)</option>
              <option value="SAR">SAR (Saudi Riyal)</option>
            </select>
          </div>
        </div>

        {/* Database cloud settings access */}
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center justify-between text-left gap-3.5 bg-card border border-default p-4 rounded-xl hover:bg-card-60 transition-colors cursor-pointer group"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="p-2 bg-card rounded-lg text-secondary group-hover:text-indigo-400 duration-200">
              <KeyRound size={15} />
            </div>
            <div>
              <span className="text-[9px] font-mono text-muted block uppercase font-bold">Cloud Synch Vaults</span>
              <span className="text-xs font-bold text-primary">Encryption PIN & Supabase config</span>
            </div>
          </div>
          <ShieldCheck size={14} className="text-emerald-500 mr-1" />
        </button>
      </div>

      {/* SECURE TERMINATION / LOGOUT */}
      <div className="pt-2 border-t border-zinc-950">
        <button
          onClick={() => {
            showToast('info', 'Secure session terminated. Logging out.');
            onLogout();
          }}
          className="w-full flex items-center justify-center gap-2 bg-rose-500/10 hover:bg-rose-600 border border-rose-950/45 hover:border-rose-500 text-danger hover:text-primary py-3.5 px-4 rounded-xl text-xs font-extrabold transition-all duration-300 cursor-pointer group shadow-lg shadow-rose-950/10"
        >
          <LogOut size={14} className="group-hover:translate-x-0.5 group-hover:scale-110 transition-all duration-300" />
          <span>Settle Session & Terminate Access</span>
        </button>
      </div>

    </div>
  );
}
