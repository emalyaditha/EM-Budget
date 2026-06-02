import React, { useState } from 'react';
import { Mail, Save, Edit2, ShieldCheck, KeyRound, CreditCard, LogOut } from 'lucide-react';
import { AppState } from '../types';
import { updateAuthAccountName } from '../supabase';
import { useNotifications } from '../context/NotificationContext';

interface ProfileSectionProps {
  state: AppState;
  updateState: (updater: (prev: AppState) => AppState) => void;
  onOpenSettings: () => void;
  onLogout: () => void;
}

export default function ProfileSection({ state, updateState, onOpenSettings, onLogout }: ProfileSectionProps) {
  const { showToast } = useNotifications();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(state.userProfile?.name || 'User');

  const handleSave = async () => {
    if (!name.trim()) {
      showToast('error', 'Profile name cannot be blank.');
      return;
    }
    
    updateState(prev => ({
        ...prev,
        userProfile: { ...prev.userProfile, name: name.trim() }
    }));
    try {
        await updateAuthAccountName(state.userProfile?.email || '', name.trim());
        showToast('success', 'Profile name synced with secure cloud record.');
    } catch (err) {
        console.error("Failed to sync name to auth_accounts", err);
    }
    setIsEditing(false);
  };

  const firstLetter = state.userProfile?.name ? state.userProfile.name.charAt(0).toUpperCase() : 'U';

  return (
    <div className="bg-gradient-to-br from-zinc-900/90 via-[#0a0a0d] to-zinc-950 border border-zinc-850 p-6 md:p-8 rounded-[32px] shadow-2xl space-y-6" id="secure-profile-card">
      
      {/* HEADER SECTION */}
      <div className="flex justify-between items-center pb-4 border-b border-zinc-900">
        <div>
          <span className="text-[10px] tracking-wider text-indigo-400 font-mono font-bold uppercase block mb-0.5">VAULT SUITE SECURE</span>
          <h2 className="text-lg font-extrabold text-white">Vault Account</h2>
        </div>
        
        <button 
          onClick={() => {
            if (isEditing) {
              setName(state.userProfile.name);
            }
            setIsEditing(!isEditing);
          }} 
          className="p-2 px-3.5 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl text-xs font-bold text-zinc-400 hover:text-white transition-all cursor-pointer flex items-center gap-1.5"
        >
          {isEditing ? (
            <span className="text-rose-400">Cancel</span>
          ) : (
            <>
              <Edit2 size={13} />
              <span>Modify</span>
            </>
          )}
        </button>
      </div>

      {/* AVATAR & NAME DISPLAY */}
      <div className="flex flex-col items-center py-4 bg-[#050505]/40 border border-zinc-900/60 rounded-2xl p-6 relative overflow-hidden">
        {/* Glow effect */}
        <div className="absolute -top-12 -left-12 w-28 h-28 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-10 -right-10 w-28 h-28 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />

        <div className="relative group mb-4">
          <div className="absolute -inset-1.5 bg-gradient-to-tr from-indigo-600 via-purple-600 to-indigo-500 rounded-full blur opacity-60 group-hover:opacity-100 transition duration-500 animate-pulse" />
          <div className="relative w-20 h-20 bg-zinc-950 border-2 border-zinc-800 rounded-full flex items-center justify-center text-white text-3xl font-extrabold shadow-xl">
            {firstLetter}
          </div>
          <span className="absolute bottom-0 right-1 w-5.5 h-5.5 bg-emerald-500 border-4 border-zinc-950 rounded-full" title="Identity Verified Status" />
        </div>

        {isEditing ? (
          <div className="w-full max-w-[220px] space-y-2 mt-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#070707] border border-zinc-800 hover:border-zinc-700 focus:border-indigo-500 text-white rounded-xl px-4 py-2.5 text-center text-sm font-bold transition-all focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="Display Name"
              maxLength={25}
            />
            
            <button
              onClick={handleSave}
              className="w-full bg-white hover:bg-zinc-200 text-black py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md"
            >
              <Save size={13} />
              <span>Save Record</span>
            </button>
          </div>
        ) : (
          <div className="text-center">
            <h3 className="text-xl font-extrabold text-white tracking-tight">{state.userProfile?.name || 'User'}</h3>
            <span className="px-2.5 py-0.5 bg-emerald-950/40 border border-emerald-900/40 text-emerald-400 text-[9px] uppercase font-bold tracking-widest rounded-full inline-block mt-2 font-mono">
              PREMIER MEMBER
            </span>
          </div>
        )}
      </div>

      {/* CORE DETAILS LIST CONTAINER */}
      <div className="space-y-3">
        {/* Email information */}
        <div className="flex items-center gap-3.5 bg-zinc-950 border border-zinc-900 p-4 rounded-xl">
          <div className="p-2 bg-zinc-900 rounded-lg text-zinc-550 text-zinc-400">
            <Mail size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[9px] font-mono text-zinc-550 block uppercase font-bold text-zinc-500">Linked Account Email</span>
            <span className="text-xs font-mono font-bold text-zinc-300 block truncate">{state.userProfile?.email || 'Client Local Storage'}</span>
          </div>
        </div>

        {/* Currency configuration indicator */}
        <div className="flex items-center gap-3.5 bg-zinc-950 border border-zinc-900 p-4 rounded-xl">
          <div className="p-2 bg-zinc-900 rounded-lg text-zinc-400">
            <CreditCard size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[9px] font-mono text-zinc-550 block uppercase font-bold text-zinc-500">Preferred Local Currency</span>
            <span className="text-xs font-bold text-white block mt-0.5">{state.currency || 'Rs.'} (Default Prefix)</span>
          </div>
        </div>

        {/* Database cloud settings access */}
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center justify-between text-left gap-3.5 bg-zinc-950 border border-zinc-900 p-4 rounded-xl hover:bg-zinc-900/60 transition-colors cursor-pointer group"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="p-2 bg-zinc-900 rounded-lg text-zinc-400 group-hover:text-indigo-400 duration-200">
              <KeyRound size={15} />
            </div>
            <div>
              <span className="text-[9px] font-mono text-zinc-500 block uppercase font-bold">Cloud Synch Vaults</span>
              <span className="text-xs font-bold text-zinc-300">Encryption PIN & Supabase config</span>
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
          className="w-full flex items-center justify-center gap-2 bg-rose-500/10 hover:bg-rose-600 border border-rose-950/45 hover:border-rose-500 text-rose-400 hover:text-white py-3.5 px-4 rounded-xl text-xs font-extrabold transition-all duration-300 cursor-pointer group shadow-lg shadow-rose-950/10"
        >
          <LogOut size={14} className="group-hover:translate-x-0.5 group-hover:scale-110 transition-all duration-300" />
          <span>Settle Session & Terminate Access</span>
        </button>
      </div>

    </div>
  );
}
