import React, { useState, useEffect } from 'react';
import { 
  Settings, Database, Zap, FileDown, X, Info, Shield, HelpCircle, 
  Cloud, RefreshCw, Check, Copy, Eye, EyeOff, Code, ChevronDown, ChevronUp, AlertCircle,
  LogOut
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AppState } from '../types';
import { 
  getSupabaseConfig, 
  saveSupabaseConfig, 
  syncStateToSupabase, 
  syncStateFromSupabase, 
  getSupabaseSQLScript,
  getSupabaseUpgradeSQLScript,
  truncateAllDataInSupabase
} from '../supabase';
import { useNotifications } from '../context/NotificationContext';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  userEmail: string;
  updateState: (updater: (prev: AppState) => AppState) => void;
  exportStateAsJSON: (state: AppState, userEmail?: string) => void;
  handleJSONRestore: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onLogout: () => void;
}

export default function SettingsModal({
  isOpen,
  onClose,
  state,
  userEmail,
  updateState,
  exportStateAsJSON,
  handleJSONRestore,
  onLogout
}: SettingsModalProps) {
  const { showConfirm, showToast } = useNotifications();
  // Supabase Configuration State
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [autoSync, setAutoSync] = useState(false);
  const [showKey, setShowKey] = useState(false);

  // Status and logs
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // DB Purge 2FA verification states
  const [showPurge2FA, setShowPurge2FA] = useState(false);
  const [purgeOtp, setPurgeOtp] = useState('');
  const [purgeLoading, setPurgeLoading] = useState(false);
  const [purgeError, setPurgeError] = useState<string | null>(null);
  const [purgeDevOtp, setPurgeDevOtp] = useState<string | null>(null);

  // Accordion UI tabs for developers
  const [expandedSection, setExpandedSection] = useState<'none' | 'sql' | 'flutter' | 'upgrade'>('none');
  const [sqlCopied, setSqlCopied] = useState(false);
  const [flutterCopied, setFlutterCopied] = useState(false);
  const [upgradeCopied, setUpgradeCopied] = useState(false);

  // Authenticated email passed via props

  // Load backend configurations
  useEffect(() => {
    if (isOpen) {
      const config = getSupabaseConfig();
      setSupabaseUrl(config.url);
      setSupabaseKey(config.key);
      setAutoSync(config.autoSync);
      setSyncStatus('idle');
      setSyncMessage(null);
      setShowPurge2FA(false);
      setPurgeOtp('');
      setPurgeError(null);
      setPurgeDevOtp(null);
    }
  }, [isOpen]);

  // Saves credentials to localStorage
  const handleSaveCredentials = () => {
    saveSupabaseConfig(supabaseUrl.trim(), supabaseKey.trim(), autoSync);
    setSyncStatus('success');
    setSyncMessage('Supabase credentials registered successfully.');
    setTimeout(() => setSyncMessage(null), 3000);
  };

  // Triggers Push Sync to Supabase
  const handlePushSync = async () => {
    // Automatically save modern configuration settings first
    saveSupabaseConfig(supabaseUrl.trim(), supabaseKey.trim(), autoSync);

    if (!supabaseUrl.trim() || !supabaseKey.trim()) {
      setSyncStatus('error');
      setSyncMessage('Both Supabase URL and Anon Key are required to sync.');
      return;
    }

    setSyncStatus('loading');
    setSyncMessage('Syncing active Ledger index upward to cloud database...');

    const res = await syncStateToSupabase(userEmail, state);
    if (res.success) {
      setSyncStatus('success');
      setSyncMessage('Vault backup published successfully to Supabase! Flutter ready.');
    } else {
      setSyncStatus('error');
      setSyncMessage(res.error || 'Failed to authenticate cloud write transaction.');
    }
  };

  // Triggers Pull Sync from Supabase
  const handlePullSync = async () => {
    // Automatically save modern configuration settings first
    saveSupabaseConfig(supabaseUrl.trim(), supabaseKey.trim(), autoSync);

    if (!supabaseUrl.trim() || !supabaseKey.trim()) {
      setSyncStatus('error');
      setSyncMessage('Both Supabase URL and Anon Key are required to sync.');
      return;
    }

    setSyncStatus('loading');
    setSyncMessage('Retrieving cloud ledger node and rebuilding state...');

    const res = await syncStateFromSupabase(userEmail);
    if (res.success && res.state) {
      // Re-hydrate the local memory + reload state
      updateState(() => res.state!);
      setSyncStatus('success');
      setSyncMessage('Cloud state fetched successfully! UI synchronized.');
    } else {
      setSyncStatus('error');
      setSyncMessage(res.error || 'No backup record found or auth rejected.');
    }
  };

  const handleWipeDatabase = async () => {
    if (!userEmail) {
      setSyncStatus('error');
      setSyncMessage('Active identity Email is required to execute deletion.');
      return;
    }

    setSyncStatus('loading');
    setSyncMessage('Generating secure deletion 2FA passcode...');
    setPurgeLoading(true);
    setPurgeError(null);

    try {
      const token = localStorage.getItem('auth_session_token') || '';
      const response = await fetch('/api/auth/send-delete-otp', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ email: userEmail })
      });

      const data = await response.json();
      setPurgeLoading(false);

      if (data.success) {
        setShowPurge2FA(true);
        if (data.devOtp) {
          setPurgeDevOtp(data.devOtp);
        } else {
          setPurgeDevOtp(null);
        }
        setSyncStatus('success');
        setSyncMessage(data.emailSent ? 'A deletion passcode has been dispatched to your email address.' : 'Deletion passcode generated in browser logs.');
        showToast('success', 'Passcode dispatched! Complete your verification code below.');
      } else {
        setSyncStatus('error');
        setSyncMessage(data.error || 'Failed to dispatch deletion 2FA code.');
        showToast('error', data.error || 'Identity delivery failure.');
      }
    } catch (err: any) {
      setPurgeLoading(false);
      setSyncStatus('error');
      setSyncMessage(err.message || 'Network error triggering secure deletion code.');
      showToast('error', 'Connection failure.');
    }
  };

  const handleConfirmPurge2FA = async () => {
    if (!purgeOtp.trim()) {
      setPurgeError('Please enter the 6-digit verification passcode.');
      return;
    }

    setPurgeLoading(true);
    setPurgeError(null);
    setSyncStatus('loading');
    setSyncMessage('Verifying 2FA authorization token...');

    try {
      const token = localStorage.getItem('auth_session_token') || '';
      const response = await fetch('/api/auth/verify-delete-otp', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ email: userEmail, otp: purgeOtp })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        setPurgeLoading(false);
        setSyncStatus('error');
        const errMsg = data.error || 'The passcode entered is incorrect or expired.';
        setSyncMessage(errMsg);
        setPurgeError(errMsg);
        showToast('error', errMsg);
        return;
      }

      // 2FA code verified successfully! Now purge only this user's data from Supabase
      setSyncMessage('Wiping database entries for your identity email...');
      
      // Clear out client state first
      updateState(prev => ({
        ...prev,
        cashAccounts: [],
        cards: [],
        transactions: [],
        debts: [],
        incomes: [],
        expenses: [],
        notifications: []
      }));

      const result = await truncateAllDataInSupabase(userEmail);
      setPurgeLoading(false);
      setShowPurge2FA(false);
      setPurgeOtp('');
      setPurgeDevOtp(null);

      if (!result.success) {
        setSyncStatus('error');
        setSyncMessage(result.error || 'Wiped local state. Note: Cloud database failed to truncate.');
        showToast('error', 'Cloud sync failure, local books cleared.');
        return;
      }

      setSyncStatus('success');
      setSyncMessage('Purge Complete: All secure ledger books have been completely zeroed.');
      showToast('success', 'LEDGER PURGED COMPLETELY!');
    } catch (err: any) {
      setPurgeLoading(false);
      setSyncStatus('error');
      const errTxt = err.message || 'Verification timed out. Check network connection.';
      setSyncMessage(errTxt);
      setPurgeError(errTxt);
      showToast('error', errTxt);
    }
  };

  const copyToClipboard = (text: string, type: 'sql' | 'flutter' | 'upgrade') => {
    navigator.clipboard.writeText(text);
    if (type === 'sql') {
      setSqlCopied(true);
      setTimeout(() => setSqlCopied(false), 2000);
    } else if (type === 'upgrade') {
      setUpgradeCopied(true);
      setTimeout(() => setUpgradeCopied(false), 2000);
    } else {
      setFlutterCopied(true);
      setTimeout(() => setFlutterCopied(false), 2000);
    }
  };

  const flutterCode = `// Flutter Dart helper to Sync with this same Supabase Ledger!
import 'package:supabase_flutter/supabase_flutter.dart';

class CloudSyncService {
  final _supabase = Supabase.instance.client;

  // Retrieve shared system state loaded from Supabase matching owner identity (latest state row-by-row)
  Future<Map<String, dynamic>?> pullLedgerState(String userEmail) async {
    try {
      final response = await _supabase
          .from('ledger_states')
          .select('state')
          .eq('user_email', userEmail)
          .order('updated_at', descending: true)
          .limit(1)
          .maybeSingle();
      
      return response != null ? response['state'] as Map<String, dynamic>? : null;
    } catch (e) {
      print('Cloud Retrieve Error: $e');
      return null;
    }
  }

  // Push local Flutter updates to cloud (appends a new log/history row each time)
  Future<bool> pushLedgerState(String userEmail, Map<String, dynamic> stateJson) async {
    try {
      await _supabase.from('ledger_states').insert({
        'user_email': userEmail,
        'state': stateJson,
        'updated_at': DateTime.now().toUtc().toIso8601String(),
      });
      return true;
    } catch (e) {
      print('Cloud Dispatch Error: $e');
      return false;
    }
  }
}`;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black z-40 cursor-pointer"
            id="settings-backdrop-overlay"
          />

          {/* Settings Sidebar Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 bottom-0 w-full max-w-lg bg-[#09090b] border-l border-zinc-850 z-50 shadow-2xl flex flex-col font-sans"
            id="settings-panel-drawer"
          >
            {/* Header */}
            <div className="p-6 border-b border-zinc-850 flex justify-between items-center bg-[#070709]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-zinc-900 rounded-lg border border-zinc-800 text-zinc-300">
                  <Settings size={16} />
                </div>
                <div>
                  <h2 className="text-sm font-black uppercase tracking-wider text-white">System Settings</h2>
                  <p className="text-[10px] text-zinc-500 font-mono">Vault configuration & cloud sync</p>
                </div>
              </div>

              <button
                onClick={onClose}
                className="p-2 text-zinc-500 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-850 hover:border-zinc-700 rounded-lg transition-all cursor-pointer"
                title="Close settings"
              >
                <X size={15} />
              </button>
            </div>

            {/* Scrollable content areas */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5" style={{ scrollbarWidth: 'none' }}>
              
              {/* SECTION: Supabase Cloud Synchronization (Flutter Connected) */}
              <div className="bg-zinc-900/50 border border-zinc-850 p-5 rounded-2xl space-y-4 shadow-sm">
                <div className="flex justify-between items-center pb-2 border-b border-zinc-900">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Cloud size={14} className="text-teal-400" />
                    Supabase Cloud Sync
                  </h3>
                  <span className="text-[9px] py-0.5 px-2 bg-teal-980/30 border border-teal-900/50 text-teal-400 rounded-full font-bold uppercase font-mono tracking-wider animate-pulse">
                    Flutter Capable
                  </span>
                </div>

                {/* Subtext description */}
                <p className="text-[11px] text-zinc-400 leading-normal">
                  Connect your remote Supabase database to synchronize accounts, transactions, and balances instantly with your Flutter codebase.
                </p>

                {/* Inputs */}
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] text-zinc-500 font-semibold font-mono uppercase block mb-1">
                      Supabase Project URL
                    </label>
                    <input
                      type="url"
                      value={supabaseUrl}
                      onChange={(e) => setSupabaseUrl(e.target.value)}
                      placeholder="https://your-project.supabase.co"
                      className="w-full bg-black/40 border border-zinc-800 rounded-lg text-xs px-2.5 py-2 text-white focus:outline-none focus:border-zinc-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-zinc-500 font-semibold font-mono uppercase block mb-1">
                      Anon / Public Public Key
                    </label>
                    <div className="relative">
                      <input
                        type={showKey ? 'text' : 'password'}
                        value={supabaseKey}
                        onChange={(e) => setSupabaseKey(e.target.value)}
                        placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                        className="w-full bg-black/40 border border-zinc-800 rounded-lg text-xs pl-2.5 pr-8 py-2 text-white focus:outline-none focus:border-zinc-500 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(!showKey)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                      >
                        {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                  </div>

                  {/* Finder Helper Box */}
                  <div className="bg-zinc-950/70 border border-zinc-850 p-3 rounded-xl space-y-1.5 text-[10px] text-zinc-400 font-sans">
                    <span className="font-bold text-zinc-200 block">💡 Quick Guide: Where to find these values?</span>
                    <ol className="list-decimal list-inside space-y-1 text-zinc-400">
                      <li>Log in to your <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-teal-400 hover:underline">Supabase Dashboard</a> and choose project <strong>iivdlgbzt...</strong></li>
                      <li>Click the <strong className="text-zinc-300">Settings Gear icon</strong> (⚙️ bottom left side-bar menu).</li>
                      <li>In the sub-menu, select <strong className="text-zinc-300">API</strong> under settings.</li>
                      <li>Copy <strong className="text-zinc-300">Project URL</strong> into the top URL input.</li>
                      <li>Copy the key labeled as <strong className="text-zinc-350">`anon / public`</strong> under Project API keys into the bottom Key input.</li>
                    </ol>
                  </div>

                  {/* Auto Push Sync Selection */}
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="autoSyncToggle"
                      checked={autoSync}
                      onChange={(e) => {
                        setAutoSync(e.target.checked);
                        saveSupabaseConfig(supabaseUrl, supabaseKey, e.target.checked);
                      }}
                      className="rounded border-zinc-800 bg-black text-teal-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                    />
                    <label htmlFor="autoSyncToggle" className="text-[10px] text-zinc-400 font-medium select-none cursor-pointer">
                      Automatically push local modifications to Cloud Database in real-time
                    </label>
                  </div>
                </div>

                {/* Cloud Sync Manual Commands */}
                <div className="grid grid-cols-2 gap-2.5 pt-2">
                  <button
                    onClick={handlePushSync}
                    disabled={syncStatus === 'loading'}
                    className="py-2 px-3 bg-teal-950/40 hover:bg-teal-900/50 border border-teal-900 hover:border-teal-700 text-teal-300 rounded-xl transition-all text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {syncStatus === 'loading' ? (
                      <RefreshCw size={13} className="animate-spin" />
                    ) : (
                      <Cloud size={13} />
                    )}
                    Push To Cloud
                  </button>

                  <button
                    onClick={handlePullSync}
                    disabled={syncStatus === 'loading'}
                    className="py-2 px-3 bg-zinc-900 border border-zinc-800 hover:border-zinc-600 text-zinc-200 rounded-xl transition-all text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {syncStatus === 'loading' ? (
                      <RefreshCw size={13} className="animate-spin" />
                    ) : (
                      <RefreshCw size={12} className="text-zinc-400" />
                    )}
                    Pull From Cloud
                  </button>
                </div>

                {/* Save Credentials trigger button */}
                <button
                  type="button"
                  onClick={handleSaveCredentials}
                  className="w-full py-2 bg-neutral-900 hover:bg-neutral-800 text-xs font-bold text-zinc-300 hover:text-white border border-zinc-850 hover:border-zinc-700 rounded-xl transition-all cursor-pointer shadow"
                >
                  Save Connection Configuration
                </button>

                {/* Status Logs Notification inside modular box */}
                {syncMessage && (
                  <div className={`p-3 rounded-xl border text-[11px] font-sans flex items-start gap-2 ${
                    syncStatus === 'success' 
                      ? 'bg-emerald-950/20 border-emerald-900/60 text-emerald-400' 
                      : syncStatus === 'error'
                      ? 'bg-red-950/20 border-red-900/60 text-red-400'
                      : 'bg-zinc-950/40 border-zinc-850 text-zinc-400'
                  }`}>
                    {syncStatus === 'loading' && <RefreshCw size={13} className="animate-spin shrink-0 mt-0.5" />}
                    {syncStatus === 'success' && <Check size={13} className="shrink-0 mt-0.5" />}
                    {syncStatus === 'error' && <AlertCircle size={13} className="shrink-0 mt-0.5" />}
                    <span>{syncMessage}</span>
                  </div>
                )}
              </div>

              {/* DEVELOPER SECTION: COLLAPSIBLE DELEGATED SCHEMA CODES */}
              <div className="space-y-2">
                <span className="text-[10px] text-zinc-500 font-bold tracking-wider font-mono uppercase block px-1">
                  Cross-Platform Developer Blueprints
                </span>

                <div className="bg-zinc-900/25 border border-zinc-850 rounded-2xl overflow-hidden">
                  <button
                    onClick={() => setExpandedSection(expandedSection === 'sql' ? 'none' : 'sql')}
                    className="w-full p-4 flex justify-between items-center text-xs font-bold text-zinc-300 hover:bg-zinc-900/45 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Code size={13} className="text-zinc-400" />
                      <span>1. Prepare Supabase Database Tables & Functions (SQL)</span>
                    </div>
                    {expandedSection === 'sql' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  
                  {expandedSection === 'sql' && (
                    <div className="p-4 bg-black/80 text-[10px] space-y-2 border-t border-zinc-900">
                      <p className="text-zinc-400 text-[11px]">
                        Execute this inside your <strong>Supabase SQL Editor</strong> to construct the state synchronization core.
                      </p>
                      <div className="relative">
                        <pre className="p-3 bg-zinc-950 rounded-xl overflow-x-auto text-[10px] text-emerald-400/90 font-mono border border-zinc-900 whitespace-pre scrollbar-none" style={{ maxHeight: '180px' }}>
                          {getSupabaseSQLScript()}
                        </pre>
                        <button
                          onClick={() => copyToClipboard(getSupabaseSQLScript(), 'sql')}
                          className="absolute right-2 top-2 p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded transition-colors"
                          title="Copy SQL Query"
                        >
                          {sqlCopied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Flutter setup guide */}
                <div className="bg-zinc-900/25 border border-zinc-850 rounded-2xl overflow-hidden">
                  <button
                    onClick={() => setExpandedSection(expandedSection === 'flutter' ? 'none' : 'flutter')}
                    className="w-full p-4 flex justify-between items-center text-xs font-bold text-zinc-300 hover:bg-zinc-900/45 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Zap size={13} className="text-amber-400 animate-pulse" />
                      <span>2. Sync with Flutter App (Dart)</span>
                    </div>
                    {expandedSection === 'flutter' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  
                  {expandedSection === 'flutter' && (
                    <div className="p-4 bg-black/80 text-[10px] space-y-2 border-t border-zinc-900">
                      <p className="text-zinc-400 text-[11px]">
                        Add the <code>supabase_flutter</code> package to your Flutter project config, and use this service helper class to pull and push state in Dart!
                      </p>
                      <div className="relative">
                        <pre className="p-3 bg-zinc-950 rounded-xl overflow-x-auto text-[10px] text-teal-400/90 font-mono border border-zinc-900 whitespace-pre scrollbar-none" style={{ maxHeight: '200px' }}>
                          {flutterCode}
                        </pre>
                        <button
                          onClick={() => copyToClipboard(flutterCode, 'flutter')}
                          className="absolute right-2 top-2 p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded transition-colors"
                          title="Copy Dart helper"
                        >
                          {flutterCopied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* SQL structure upgrade migration guide */}
                <div className="bg-zinc-900/25 border border-zinc-850 rounded-2xl overflow-hidden">
                  <button
                    onClick={() => setExpandedSection(expandedSection === 'upgrade' ? 'none' : 'upgrade')}
                    className="w-full p-4 flex justify-between items-center text-xs font-bold text-zinc-300 hover:bg-zinc-900/45 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Database size={13} className="text-amber-500 animate-pulse" />
                      <span>3. Upgrade Live Database Functions (SQL Migration)</span>
                    </div>
                    {expandedSection === 'upgrade' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  
                  {expandedSection === 'upgrade' && (
                    <div className="p-4 bg-black/80 text-[10px] space-y-2 border-t border-zinc-900">
                      <p className="text-zinc-400 text-[11px]">
                        To update your live Supabase database instantly, go to your <strong>Supabase Dashboard &gt; SQL Editor</strong> and copy-paste the matching upgrade migration query below:
                      </p>
                      <div className="relative">
                        <pre className="p-3 bg-zinc-950 rounded-xl overflow-x-auto text-[10px] text-emerald-400/90 font-mono border border-zinc-900 whitespace-pre scrollbar-none" style={{ maxHeight: '180px' }}>
                          {getSupabaseUpgradeSQLScript()}
                        </pre>
                        <button
                          onClick={() => copyToClipboard(getSupabaseUpgradeSQLScript(), 'upgrade')}
                          className="absolute right-2 top-2 p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded transition-colors"
                          title="Copy Upgrade Migration"
                        >
                          {upgradeCopied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* OLD SECTION 1: Settings & Encryption */}
              <div className="bg-zinc-900/40 border border-zinc-850 p-5 rounded-2xl space-y-4">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Shield size={14} className="text-zinc-500" />
                  Settings & Encryption
                </h3>
                
                <div className="space-y-3.5">
                  {/* Linked Owner Identity Information */}
                  <div>
                    <span className="text-xs font-bold text-white block">Secure Bonded Identity</span>
                    <p className="text-[10px] text-zinc-500">Startup Authentication Bounds</p>
                  </div>
                  <div className="bg-black/40 border border-zinc-850 p-3.5 rounded-xl space-y-2">
                    <span className="text-[10px] text-zinc-400 font-mono block">Registered System Owner:</span>
                    <div className="flex items-center gap-2 text-xs text-emerald-400 font-semibold font-mono bg-emerald-950/20 py-2 px-3 border border-emerald-950/35 rounded-lg">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span>{userEmail}</span>
                    </div>
                    <p className="text-[9px] text-zinc-500 leading-normal">
                      Access is restricted exclusively to this email address via secure 2FA passcode validation.
                    </p>
                  </div>

                  {/* Currency Selector */}
                  <div className="space-y-2 pt-2 border-t border-zinc-900">
                    <span className="text-[10px] text-zinc-400 font-mono block">Accounting Currency</span>
                    <select
                      value={state.currency}
                      onChange={(e) => updateState(prev => ({ ...prev, currency: e.target.value }))}
                      className="w-full bg-black/40 border border-zinc-800 rounded-lg text-xs px-2 py-2 text-white focus:outline-none focus:border-zinc-500 transition-colors cursor-pointer"
                    >
                      <option value="Rs.">Rs. (Sri Lankan Rupee)</option>
                      <option value="$">$ (US Dollar)</option>
                      <option value="€">€ (Euro)</option>
                      <option value="£">£ (British Pound)</option>
                      <option value="¥">¥ (Japanese Yen)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* OLD SECTION 2: Backup & Database State */}
              <div className="bg-zinc-900/40 border border-zinc-850 p-5 rounded-2xl space-y-4">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Database size={14} className="text-zinc-500" />
                  Backup & Database State
                </h3>
                
                <div className="space-y-3.5">
                  <button
                    onClick={() => {
                      exportStateAsJSON(state, userEmail);
                    }}
                    className="w-full py-2.5 bg-black border border-zinc-800 rounded-xl hover:text-white hover:border-zinc-500 transition-colors text-xs font-semibold text-zinc-350 flex items-center justify-center gap-2 cursor-pointer shadow-lg active:scale-[0.99]"
                    title="Export all financial ledger records to a transferable JSON file linked to this account"
                  >
                    <FileDown size={13} /> Export Personal Ledger Backup (.JSON)
                  </button>

                  <div className="space-y-1.5 pt-2 border-t border-zinc-900">
                    <label className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider block font-mono">
                      Import/Sync Database File
                    </label>
                    <input
                      type="file"
                      id="database-config-uploader"
                      accept=".json"
                      onChange={handleJSONRestore}
                      className="w-full text-xs text-zinc-500 file:mr-2 file:py-1.5 file:px-2.5 file:rounded-md file:border-0 file:text-[10px] file:font-semibold file:bg-zinc-800 file:text-white file:cursor-pointer"
                    />
                  </div>
                  
                  {showPurge2FA ? (
                    <div className="space-y-3 p-3.5 bg-red-950/10 border border-red-900/40 rounded-xl mt-3">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={14} />
                        <div>
                          <p className="text-xs font-bold text-red-500">Identity Verification Required</p>
                          <p className="text-[10px] text-zinc-400 mt-1 leading-relaxed">
                            We recorded a request to purge your database records. A 6-digit confirmation code was dispatched to <span className="text-zinc-200 font-mono font-bold">{userEmail}</span>. Enter it to finalize the purge.
                          </p>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <input
                          type="text"
                          maxLength={6}
                          placeholder="Enter 6-Digit Passcode"
                          value={purgeOtp}
                          onChange={(e) => setPurgeOtp(e.target.value.replace(/\D/g, ''))}
                          className="w-full bg-black border border-red-900/60 rounded-lg text-xs px-2.5 py-1.5 focus:outline-none focus:border-red-500 text-center font-mono tracking-widest text-white uppercase"
                          disabled={purgeLoading}
                        />
                        {purgeError && (
                          <p className="text-[10px] text-red-400 font-semibold">{purgeError}</p>
                        )}
                      </div>

                      {purgeDevOtp && (
                        <div className="p-2 bg-zinc-900/65 rounded border border-zinc-800 text-[10px] text-amber-400 font-mono flex items-center justify-between">
                          <span>[Dev Assist] One-Time OTP:</span>
                          <span className="font-bold underline">{purgeDevOtp}</span>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShowPurge2FA(false);
                            setPurgeOtp('');
                            setPurgeError(null);
                            setPurgeDevOtp(null);
                            setSyncStatus('idle');
                            setSyncMessage(null);
                          }}
                          className="py-1.5 bg-zinc-900 hover:bg-zinc-850 text-zinc-400 hover:text-zinc-200 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer text-center"
                          disabled={purgeLoading}
                        >
                          Abort Deletion
                        </button>
                        <button
                          type="button"
                          onClick={handleConfirmPurge2FA}
                          className="py-1.5 bg-red-650 hover:bg-red-700 text-white rounded-lg text-[11px] font-semibold transition-colors cursor-pointer text-center flex items-center justify-center gap-1.5"
                          disabled={purgeLoading}
                        >
                          {purgeLoading ? 'Purging...' : 'Confirm Purge'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5 pt-4 border-t border-red-900/30">
                      <button
                        onClick={handleWipeDatabase}
                        className="w-full py-2.5 bg-red-950/20 border border-red-900/50 rounded-xl hover:bg-red-950/40 hover:text-white hover:border-red-500/50 transition-colors text-xs font-semibold text-red-500 flex items-center justify-center gap-2 cursor-pointer shadow-lg active:scale-[0.99]"
                      >
                        <Shield size={13} /> DANGER: Wipe Cloud Database & Local State
                      </button>
                      <p className="text-[9px] text-red-500/80 text-center uppercase tracking-wider font-mono">This action is irreversible.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* OLD SECTION 3: Smart Ledger Directives */}
              <div className="bg-zinc-900/10 border border-zinc-850 p-5 rounded-2xl space-y-3.5">
                <div className="flex gap-2 items-center text-xs font-bold text-zinc-300">
                  <Zap size={14} className="text-amber-400 animate-pulse" />
                  <span>Smart Ledger Directives</span>
                </div>
                <ul className="text-[11px] text-zinc-500 space-y-2 list-disc list-inside leading-relaxed">
                  <li>Incomes automatically increment target balance on selected accounts.</li>
                  <li>Expenses check for insufficient balances; failing settled items are blocked.</li>
                  <li>Repaying debt triggers partial decreases on card/cash portfolios in real time.</li>
                </ul>
              </div>

              {/* LOGOUT / RE-LOCK BUTTON */}
              <div className="pt-2">
                <button
                  id="settings-logout-btn"
                  onClick={onLogout}
                  className="w-full py-3 bg-[#1d0e11] hover:bg-[#2c1216] border border-red-950/70 hover:border-red-900 text-red-400 hover:text-red-300 rounded-xl transition-all text-xs font-mono font-bold flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-[0.99]"
                >
                  <LogOut size={13} />
                  TERMINATE ACTIVE SESSION (LOGOUT)
                </button>
              </div>

            </div>

            {/* Sticky footer info */}
            <div className="p-4 bg-[#070709] border-t border-zinc-850 text-center font-mono text-[9px] text-zinc-600 select-none">
              Secured Connection &bull; 64-bit Device Bound
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
