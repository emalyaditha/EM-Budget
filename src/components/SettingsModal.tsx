import React, { useState, useEffect } from 'react';
import { apiUrl, safeJson } from "../lib/api";
import { Settings, Database, Zap, FileDown, X, Shield, Cloud, RefreshCw, Check, Copy, Eye, EyeOff, Code, ChevronDown, ChevronUp, AlertCircle, LogOut, Sun, Moon, Lock, Fingerprint, Smartphone, KeyRound } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AppState } from '../types';
import { getSupabaseConfig, saveSupabaseConfig, syncStateToSupabase, syncStateFromSupabase, truncateAllDataInSupabase } from '../supabase';
import { useNotifications } from '../context/NotificationContext';
import { useTheme } from '../context/ThemeContext';
import {
  exportCashAccountsCSV,
  exportCardsCSV,
  exportDebtsCSV,
  exportLoansCSV,
  exportSubscriptionsCSV,
  exportBudgetsCSV,
  exportGoalsCSV,
  exportIncomesCSV,
  exportExpensesCSV,
} from '../utils';
import {
  getAppLockStatus,
  setPin,
  disablePin,
  setLockOnOpen,
  startBiometricRegistration,
  removeBiometricCredential,
  listBiometricCredentials,
  listTrustedDevices,
  revokeTrustedDevice,
  revokeAllDevices,
  isBiometricAvailable,
} from '../lib/appLock';

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

export default function SettingsModal({ isOpen, onClose, state, userEmail, updateState, exportStateAsJSON, handleJSONRestore, onLogout }: SettingsModalProps) {
  const { showToast } = useNotifications();
  const { theme, toggleTheme } = useTheme();
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [autoSync, setAutoSync] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [showPurge2FA, setShowPurge2FA] = useState(false);
  const [purgeOtp, setPurgeOtp] = useState('');
  const [purgeLoading, setPurgeLoading] = useState(false);
  const [purgeError, setPurgeError] = useState<string | null>(null);
  const [purgeDevOtp, setPurgeDevOtp] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<'none' | 'sql' | 'flutter' | 'upgrade'>('none');
  const [sqlCopied, setSqlCopied] = useState(false);
  const [flutterCopied, setFlutterCopied] = useState(false);
  const [upgradeCopied, setUpgradeCopied] = useState(false);
  const [sqlScript, setSqlScript] = useState('');
  const [appLockStatus, setAppLockStatus] = useState<{ appLockEnabled: boolean; lockOnOpen: boolean; hasPin: boolean; pinEnabled: boolean; biometricCount: number } | null>(null);
  const [appLockBusy, setAppLockBusy] = useState(false);
  const [appLockMsg, setAppLockMsg] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [newPin, setNewPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [deviceLabel, setDeviceLabel] = useState('');
  const [devices, setDevices] = useState<{ id: string; label: string; lastUsed: string }[]>([]);
  const [biometricCredIds, setBiometricCredIds] = useState<string[]>([]);
  const [confirmRemoveBiometric, setConfirmRemoveBiometric] = useState<string | null>(null);

  const refreshAppLock = async () => {
    if (!userEmail) return;
    const status = await getAppLockStatus(userEmail);
    setAppLockStatus(status ? { appLockEnabled: status.appLockEnabled, lockOnOpen: status.lockOnOpen, hasPin: status.hasPin, pinEnabled: status.pinEnabled, biometricCount: status.biometricCount } : null);
    const devs = await listTrustedDevices(userEmail);
    setDevices(devs.map((d) => ({ id: d.id, label: d.userAgent.split(/[ (/]/)[0] || 'Device', lastUsed: new Date(d.lastUsedAt || d.createdAt).toLocaleDateString() })));
    const creds = await listBiometricCredentials(userEmail);
    setBiometricCredIds(creds.map((c) => c.credentialId));
    try {
      setBiometricSupported(await isBiometricAvailable());
    } catch {
      setBiometricSupported(false);
    }
  };

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
      fetch(apiUrl('/api/config/sql')).then((r) => safeJson(r)).then((d) => { if (d?.success) setSqlScript(d.sql); }).catch(() => {});
      void refreshAppLock();
    }
  }, [isOpen]);

  const handleSaveCredentials = () => {
    saveSupabaseConfig(supabaseUrl.trim(), supabaseKey.trim(), autoSync);
    setSyncStatus('success');
    setSyncMessage('Credentials saved.');
    setTimeout(() => setSyncMessage(null), 3000);
  };

  const handlePushSync = async () => {
    saveSupabaseConfig(supabaseUrl.trim(), supabaseKey.trim(), autoSync);
    if (!supabaseUrl.trim() || !supabaseKey.trim()) { setSyncStatus('error'); setSyncMessage('Supabase URL and Anon Key are required.'); return; }
    setSyncStatus('loading'); setSyncMessage('Pushing ledger to cloud...');
    const res = await syncStateToSupabase(userEmail, state, true);
    if (res.success) { setSyncStatus('success'); setSyncMessage('Backup published to cloud.'); }
    else { setSyncStatus('error'); setSyncMessage(res.error || 'Cloud write failed.'); }
  };

  const handlePullSync = async () => {
    saveSupabaseConfig(supabaseUrl.trim(), supabaseKey.trim(), autoSync);
    if (!supabaseUrl.trim() || !supabaseKey.trim()) { setSyncStatus('error'); setSyncMessage('Supabase URL and Anon Key are required.'); return; }
    setSyncStatus('loading'); setSyncMessage('Pulling ledger from cloud...');
    const res = await syncStateFromSupabase(userEmail);
    if (res.success && res.state) { updateState(() => res.state!); setSyncStatus('success'); setSyncMessage('Cloud state restored.'); }
    else { setSyncStatus('error'); setSyncMessage(res.error || 'No backup found.'); }
  };

  const handleWipeDatabase = async () => {
    if (!userEmail) { setSyncStatus('error'); setSyncMessage('Email required.'); return; }
    setSyncStatus('loading'); setSyncMessage('Sending verification code...'); setPurgeLoading(true); setPurgeError(null);
    try {
      const token = localStorage.getItem('auth_session_token') || '';
      const res = await fetch(apiUrl('/api/auth/send-delete-otp'), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ email: userEmail }) });
      const data = await safeJson(res); setPurgeLoading(false);
      if (!data) throw new Error("Empty response from API (" + res.status + " " + res.statusText + ") — check VITE_API_URL (should be your Railway URL) and Vercel function logs for /api");
      if (data.success) { setShowPurge2FA(true); setPurgeDevOtp(data.devOtp || null); setSyncStatus('success'); setSyncMessage(data.emailSent ? 'Code sent to your email.' : 'Dev code generated.'); showToast('Passcode sent. Enter the code below.', 'success'); }
      else { setSyncStatus('error'); setSyncMessage(data.error || 'Failed to send code.'); showToast(data.error || 'Failed.', 'error'); }
    } catch (err: any) { setPurgeLoading(false); setSyncStatus('error'); setSyncMessage(err.message || 'Network error.'); showToast('Connection failure.', 'error'); }
  };

  const handleConfirmPurge2FA = async () => {
    if (!purgeOtp.trim()) { setPurgeError('Enter the 6-digit code.'); return; }
    setPurgeLoading(true); setPurgeError(null); setSyncStatus('loading'); setSyncMessage('Verifying code...');
    try {
      const token = localStorage.getItem('auth_session_token') || '';
      const res = await fetch(apiUrl('/api/auth/verify-delete-otp'), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ email: userEmail, otp: purgeOtp }) });
      const data = await safeJson(res);
      if (!data) { setPurgeLoading(false); setSyncStatus('error'); const m = "Empty response"; setSyncMessage(m); setPurgeError(m); showToast(m, 'error'); return; }
      if (!res.ok || !data.success) { setPurgeLoading(false); setSyncStatus('error'); const m = data.error || 'Invalid or expired code.'; setSyncMessage(m); setPurgeError(m); showToast(m, 'error'); return; }
      setSyncStatus('loading'); setSyncMessage('Wiping cloud records...');
      const result = await truncateAllDataInSupabase(userEmail);
      setPurgeLoading(false); setShowPurge2FA(false); setPurgeOtp(''); setPurgeDevOtp(null);
      if (!result.success) { setSyncStatus('error'); setSyncMessage(result.error || 'Cloud truncate failed.'); showToast('Cloud sync failure.', 'error'); return; }
      updateState((prev) => ({ ...prev, cashAccounts: [], cards: [], transactions: [], debts: [], incomes: [], expenses: [], notifications: [] }));
      setSyncStatus('success'); setSyncMessage('Ledger purged.'); showToast('Ledger purged.', 'success');
    } catch (err: any) { setPurgeLoading(false); setSyncStatus('error'); const m = err.message || 'Verification failed.'; setSyncMessage(m); setPurgeError(m); showToast(m, 'error'); }
  };

  const copyToClipboard = (text: string, type: 'sql' | 'flutter' | 'upgrade') => {
    navigator.clipboard.writeText(text);
    if (type === 'sql') { setSqlCopied(true); setTimeout(() => setSqlCopied(false), 2000); }
    else if (type === 'upgrade') { setUpgradeCopied(true); setTimeout(() => setUpgradeCopied(false), 2000); }
    else { setFlutterCopied(true); setTimeout(() => setFlutterCopied(false), 2000); }
  };

  // ================= APP LOCK =================
  const handleSetPin = async () => {
    const pin = newPin.replace(/\D/g, '').trim();
    if (!/^\d{4,6}$/.test(pin)) { setPinError('PIN must be 4–6 digits.'); return; }
    if (/^(0+|\d)\1*$/.test(pin) || pin === '1234' || pin === '0000' || pin === '4321') { setPinError('That PIN is too easy to guess. Choose a different one.'); return; }
    setAppLockBusy(true); setPinError(null); setAppLockMsg(null);
    const r = await setPin(userEmail, pin);
    setAppLockBusy(false);
    if (r.ok) { setAppLockMsg({ kind: 'success', text: 'PIN set. App lock is now active.' }); setNewPin(''); await refreshAppLock(); }
    else setAppLockMsg({ kind: 'error', text: r.error || 'Failed to set PIN.' });
  };

  const handleDisablePin = async () => {
    setAppLockBusy(true); setAppLockMsg(null);
    const r = await disablePin(userEmail);
    setAppLockBusy(false);
    if (r.ok) { setAppLockMsg({ kind: 'success', text: 'PIN disabled.' }); await refreshAppLock(); }
    else setAppLockMsg({ kind: 'error', text: r.error || 'Failed to disable PIN.' });
  };

  const handleDisableAll = async () => {
    setAppLockBusy(true); setAppLockMsg(null);
    const a = await disablePin(userEmail);
    const b = await revokeAllDevices(userEmail);
    setAppLockBusy(false);
    if (a.ok && b.ok) { setAppLockMsg({ kind: 'success', text: 'App lock disabled and all trusted devices removed.' }); setNewPin(''); await refreshAppLock(); }
    else setAppLockMsg({ kind: 'error', text: 'Could not fully disable app lock.' });
  };

  const handleSetLockOnOpen = async (enabled: boolean) => {
    setAppLockBusy(true); setAppLockMsg(null);
    const r = await setLockOnOpen(userEmail, enabled);
    setAppLockBusy(false);
    if (r.ok) { setAppLockMsg({ kind: 'success', text: enabled ? 'PIN will now be asked every time the app opens.' : 'PIN only asked on new/unknown devices.' }); await refreshAppLock(); }
    else setAppLockMsg({ kind: 'error', text: r.error || 'Failed to update lock preference.' });
  };

  const handleRegisterBiometric = async () => {
    setAppLockBusy(true); setAppLockMsg(null);
    const label = deviceLabel.trim() || 'Biometric device';
    const r = await startBiometricRegistration(userEmail, label);
    setAppLockBusy(false);
    if (r.ok) { setAppLockMsg({ kind: 'success', text: 'Biometric added. You can now unlock with this device.' }); setDeviceLabel(''); await refreshAppLock(); }
    else setAppLockMsg({ kind: 'error', text: r.error || 'Biometric registration failed.' });
  };

  const handleRemoveBiometric = async (credentialId: string) => {
    setAppLockBusy(true); setAppLockMsg(null);
    let ok = true; let err = '';
    const ids = credentialId === '__all__' ? biometricCredIds : [credentialId];
    for (const id of ids) {
      const r = await removeBiometricCredential(userEmail, id);
      if (!r.ok) { ok = false; err = r.error || 'Failed to remove biometric.'; }
    }
    setAppLockBusy(false);
    setConfirmRemoveBiometric(null);
    if (ok) { setAppLockMsg({ kind: 'success', text: 'Biometric removed.' }); await refreshAppLock(); }
    else setAppLockMsg({ kind: 'error', text: err || 'Failed to remove biometric.' });
  };

  const handleRevokeDevice = async (id: string) => {
    setAppLockBusy(true); setAppLockMsg(null);
    const r = await revokeTrustedDevice(userEmail, id);
    setAppLockBusy(false);
    if (r.ok) { setAppLockMsg({ kind: 'success', text: 'Device removed.' }); await refreshAppLock(); }
    else setAppLockMsg({ kind: 'error', text: r.error || 'Failed to remove device.' });
  };

  const flutterCode = `// Flutter Dart helper to Sync with this same Supabase Ledger!
import 'package:supabase_flutter/supabase_flutter.dart';

class CloudSyncService {
  final _supabase = Supabase.instance.client;
  Future<Map<String, dynamic>?> pullLedgerState(String userEmail) async {
    try {
      final response = await _supabase.from('ledger_states').select('state').eq('user_email', userEmail).order('updated_at', descending: true).limit(1).maybeSingle();
      return response != null ? response['state'] as Map<String, dynamic>? : null;
    } catch (e) { print('Cloud Retrieve Error: $e'); return null; }
  }
  Future<bool> pushLedgerState(String userEmail, Map<String, dynamic> stateJson) async {
    try {
      await _supabase.from('ledger_states').insert({ 'user_email': userEmail, 'state': stateJson, 'updated_at': DateTime.now().toUtc().toIso8601String() });
      return true;
    } catch (e) { print('Cloud Dispatch Error: $e'); return false; }
  }
}`;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} onClick={onClose} className="fixed inset-0 z-40 bg-[var(--ink)]/40 backdrop-blur-[2px]" id="settings-backdrop-overlay" />
          <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 28, stiffness: 260 }} className="fixed top-0 right-0 bottom-0 w-full max-w-[600px] bg-[var(--surface)] border-l border-[var(--line)] z-50 flex flex-col shadow-2xl" id="settings-panel-drawer" role="dialog" aria-modal="true" aria-label="Settings">
            <div className="px-6 h-14 flex items-center justify-between border-b border-[var(--line)] bg-[var(--surface)]/80 backdrop-blur shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-full bg-[var(--surface-2)] border border-[var(--line)] flex items-center justify-center text-[var(--ink-2)]"><Settings size={13} /></span>
                <div>
                  <h2 className="text-[13px] font-bold tracking-tight text-[var(--ink)] leading-none">Settings</h2>
                  <p className="eyebrow normal-case tracking-normal text-[11px]">Vault &amp; cloud sync</p>
                </div>
              </div>
              <button onClick={onClose} aria-label="Close settings" className="w-7 h-7 rounded-full bg-[var(--surface-2)] border border-[var(--line)] text-[var(--ink-2)] hover:text-[var(--ink)] flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]">
                <X size={14} />
              </button>
            </div>
            <div className="ledger-rule" />

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Cloud Sync */}
              <section className="space-y-3">
                <div className="eyebrow flex items-center justify-between"><span className="inline-flex items-center gap-1.5"><Cloud size={11} /> Cloud sync</span><span className="mono text-[10px] font-normal normal-case tracking-normal px-2 py-0.5 rounded-full border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink-2)]">Flutter ready</span></div>
                <div className="card-flat p-5 space-y-4">
                  <p className="text-[12px] leading-5 text-[var(--ink-2)]">Connect Supabase to sync your ledger. Credentials are locked to build-time env vars for safety.</p>
                  <div className="space-y-3">
                    <div>
                      <label className="eyebrow block mb-1.5">Supabase URL (read-only)</label>
                      <input type="url" value={supabaseUrl} disabled placeholder="https://your-project.supabase.co" className="input opacity-60 cursor-not-allowed mono text-[12px]" />
                    </div>
                    <div>
                      <label className="eyebrow block mb-1.5">Anon key (read-only)</label>
                      <div className="relative">
                        <input type={showKey ? 'text' : 'password'} value={supabaseKey} disabled placeholder="eyJhbGciOi..." className="input opacity-60 cursor-not-allowed mono text-[12px] pr-9" />
                        <button type="button" onClick={() => setShowKey((v) => !v)} aria-label={showKey ? 'Hide key' : 'Show key'} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-[var(--ink-3)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)]"><span className="sr-only">toggle</span>{showKey ? <EyeOff size={13} /> : <Eye size={13} />}</button>
                      </div>
                    </div>
                    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 flex gap-2 text-[11px] leading-4 text-[var(--ink-2)]"><Lock size={12} className="shrink-0 mt-0.5 text-[var(--ink-3)]" /><span>Connection credentials are locked to environment variables.</span></div>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input type="checkbox" id="autoSyncToggle" checked={autoSync} onChange={(e) => { const v = e.target.checked; setAutoSync(v); const cfg = getSupabaseConfig(); saveSupabaseConfig(cfg.url, cfg.key, v); }} className="w-3.5 h-3.5 rounded border-[var(--line)] bg-[var(--surface)] accent-[var(--ink)]" />
                      <span className="text-[12px] text-[var(--ink-2)]">Auto-push local changes to cloud</span>
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button onClick={handlePushSync} disabled={syncStatus === 'loading'} className="btn-ghost justify-center inline-flex items-center gap-1.5 text-[12px] disabled:opacity-50">{syncStatus === 'loading' ? <RefreshCw size={12} className="animate-spin" /> : <Cloud size={12} />} Push</button>
                    <button onClick={handlePullSync} disabled={syncStatus === 'loading'} className="btn-ghost justify-center inline-flex items-center gap-1.5 text-[12px] disabled:opacity-50">{syncStatus === 'loading' ? <RefreshCw size={12} className="animate-spin" /> : <RefreshCw size={12} />} Pull</button>
                  </div>
                  {syncMessage && (
                    <div className={`rounded-xl border px-3 py-2.5 flex gap-2 text-[12px] leading-5 ${syncStatus === 'success' ? 'bg-[var(--success-bg)] border-[var(--line)] text-[var(--success)]' : syncStatus === 'error' ? 'bg-[var(--danger-bg)] border-[var(--line)] text-[var(--danger)]' : 'bg-[var(--surface-2)] border-[var(--line)] text-[var(--ink-2)]'}`}>
                      {syncStatus === 'loading' && <RefreshCw size={13} className="animate-spin shrink-0 mt-0.5" />}
                      {syncStatus === 'success' && <Check size={13} className="shrink-0 mt-0.5" />}
                      {syncStatus === 'error' && <AlertCircle size={13} className="shrink-0 mt-0.5" />}
                      <span>{syncMessage}</span>
                    </div>
                  )}
                </div>
              </section>

              {/* App Lock */}
              <section className="space-y-3">
                <div className="eyebrow flex items-center justify-between"><span className="inline-flex items-center gap-1.5"><Fingerprint size={11} /> App Lock</span><span className="mono text-[10px] font-normal normal-case tracking-normal px-2 py-0.5 rounded-full border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink-2)]">{appLockStatus?.appLockEnabled ? 'Active' : 'Off'}</span></div>
                <div className="card-flat p-5 space-y-4">
                  {!appLockStatus && <p className="text-[12px] text-[var(--ink-3)]">Loading app lock status…</p>}
                  {appLockStatus && (
                    <>
                      <div className="flex items-start gap-2.5 text-[12px] leading-5 text-[var(--ink-2)]">
                        <Lock size={13} className="shrink-0 mt-0.5 text-[var(--ink-3)]" />
                        <p>App lock adds a PIN or biometric layer on top of your login, so a stolen/borrowed session still can't be read until you unlock.</p>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-2 py-2.5">
                          <p className="text-[15px] font-bold text-[var(--ink)]">{appLockStatus.pinEnabled ? 'On' : 'Off'}</p>
                          <p className="eyebrow text-[10px] mt-0.5">PIN</p>
                        </div>
                        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-2 py-2.5">
                          <p className="text-[15px] font-bold text-[var(--ink)]">{appLockStatus.biometricCount}</p>
                          <p className="eyebrow text-[10px] mt-0.5">Biometrics</p>
                        </div>
                        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-2 py-2.5">
                          <p className="text-[15px] font-bold text-[var(--ink)]">{devices.length}</p>
                          <p className="eyebrow text-[10px] mt-0.5">Devices</p>
                        </div>
                      </div>

                      <div className="ledger-rule" />

                      {/* PIN setup */}
                      <div className="space-y-2">
                        <p className="text-[12px] font-semibold text-[var(--ink)] inline-flex items-center gap-1.5"><KeyRound size={12} /> PIN</p>
                        {appLockStatus.hasPin ? (
                          <button type="button" onClick={handleDisablePin} disabled={appLockBusy} className="btn-ghost w-full justify-center text-[12px] disabled:opacity-50">Disable PIN</button>
                        ) : (
                          <div className="space-y-2">
                            <div>
                              <label htmlFor="settings-pin" className="eyebrow block mb-1.5">Set a 4–6 digit PIN</label>
                              <div className="flex gap-2">
                                <input id="settings-pin" type="password" inputMode="numeric" maxLength={6} value={newPin} onChange={(e) => { setNewPin(e.target.value.replace(/\D/g, '')); setPinError(null); }} placeholder="••••" className="input mono text-center tracking-[0.35em] flex-1" />
                                <button type="button" onClick={handleSetPin} disabled={appLockBusy || newPin.length < 4} className="btn-primary disabled:opacity-50">Set PIN</button>
                              </div>
                              {pinError && <p className="text-[11px] text-[var(--danger)] mt-1.5">{pinError}</p>}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Always ask for PIN on open */}
                      <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5">
                        <div className="flex items-start gap-2.5">
                          <Shield size={13} className="shrink-0 mt-0.5 text-[var(--ink-3)]" />
                          <div>
                            <p className="text-[12px] font-semibold text-[var(--ink)]">Always ask for PIN on open</p>
                            <p className="text-[11px] leading-4 text-[var(--ink-3)] mt-0.5">Require the PIN every time the app opens, even on a remembered device.</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={appLockStatus.lockOnOpen}
                          aria-label="Always ask for PIN on open"
                          disabled={appLockBusy}
                          onClick={() => handleSetLockOnOpen(!appLockStatus.lockOnOpen)}
                          className={`relative shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)] ${appLockStatus.lockOnOpen ? 'bg-[var(--accent)]' : 'bg-[var(--line)]'}`}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${appLockStatus.lockOnOpen ? 'translate-x-5' : ''}`} />
                        </button>
                      </div>

                      {/* Biometric */}
                      <div className="space-y-2">
                        <p className="text-[12px] font-semibold text-[var(--ink)] inline-flex items-center gap-1.5"><Fingerprint size={12} /> Biometrics</p>
                        {appLockStatus.biometricCount > 0 ? (
                          confirmRemoveBiometric ? (
                            <div className="rounded-xl border border-[var(--line)] bg-[var(--danger-bg)] p-3 space-y-2">
                              <p className="text-[11px] leading-4 text-[var(--ink-2)]">Remove all biometric unlock methods for this account?</p>
                              <div className="grid grid-cols-2 gap-2">
                                <button type="button" onClick={() => setConfirmRemoveBiometric(null)} className="btn-ghost justify-center text-[12px]" disabled={appLockBusy}>Cancel</button>
                                <button type="button" onClick={() => { const id = confirmRemoveBiometric === '__all__' ? (biometricCredIds[0] || '') : confirmRemoveBiometric; if (id) handleRemoveBiometric(id); }} className="btn-primary justify-center text-[12px] bg-[var(--danger)] border-[var(--danger)] hover:brightness-95 disabled:opacity-50" disabled={appLockBusy}>Remove</button>
                              </div>
                            </div>
                          ) : (
                            <button type="button" onClick={() => setConfirmRemoveBiometric('__all__')} disabled={appLockBusy} className="btn-ghost w-full justify-center text-[12px] text-[var(--danger)] disabled:opacity-50">Remove biometric unlock ({appLockStatus.biometricCount})</button>
                          )
                        ) : (
                          <div className="space-y-2">
                            <p className="text-[11px] leading-4 text-[var(--ink-3)]">{biometricSupported ? 'Add fingerprint / face unlock using this device.' : 'This device does not support platform biometrics.'}</p>
                            <div className="flex gap-2">
                              <input value={deviceLabel} onChange={(e) => setDeviceLabel(e.target.value)} placeholder="Device label (this phone)" maxLength={60} className="input flex-1 text-[12px]" />
                              <button type="button" onClick={handleRegisterBiometric} disabled={appLockBusy || !biometricSupported} className="btn-primary disabled:opacity-50">Add</button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Trusted devices */}
                      <div className="space-y-2">
                        <p className="text-[12px] font-semibold text-[var(--ink)] inline-flex items-center gap-1.5"><Smartphone size={12} /> Trusted devices</p>
                        {devices.length === 0 ? (
                          <p className="text-[11px] leading-4 text-[var(--ink-3)]">No trusted devices. On login, tick "Remember this device" to skip the lock on this browser.</p>
                        ) : (
                          <div className="space-y-2">
                            {devices.map((d) => (
                              <div key={d.id} className="flex items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-[12px]">
                                <span className="truncate flex items-center gap-1.5"><Smartphone size={11} className="shrink-0 text-[var(--ink-3)]" />{d.label} <span className="mono text-[10px] text-[var(--ink-3)] shrink-0">{d.lastUsed}</span></span>
                                <button type="button" onClick={() => handleRevokeDevice(d.id)} disabled={appLockBusy} className="text-[11px] text-[var(--danger)] hover:underline shrink-0 disabled:opacity-40">Remove</button>
                              </div>
                            ))}
                            <button type="button" onClick={async () => { const r = await revokeAllDevices(userEmail); if (r.ok) { setAppLockMsg({ kind: 'success', text: 'All trusted devices removed.' }); await refreshAppLock(); } }} disabled={appLockBusy} className="btn-ghost w-full justify-center text-[12px] disabled:opacity-50">Remove all</button>
                          </div>
                        )}
                      </div>

                      {/* Disable all */}
                      <div className="pt-3 border-t border-[var(--line)]">
                        <button type="button" onClick={handleDisableAll} disabled={appLockBusy} className="w-full rounded-full border border-[var(--line)] bg-[var(--danger-bg)] text-[var(--danger)] hover:brightness-95 px-4 py-2.5 text-[12px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"><Shield size={12} /> Disable app lock everywhere</button>
                      </div>
                    </>
                  )}
                  {appLockMsg && (
                    <div className={`rounded-xl border px-3 py-2.5 flex gap-2 text-[12px] leading-5 ${appLockMsg.kind === 'success' ? 'bg-[var(--success-bg)] border-[var(--line)] text-[var(--success)]' : appLockMsg.kind === 'error' ? 'bg-[var(--danger-bg)] border-[var(--line)] text-[var(--danger)]' : 'bg-[var(--surface-2)] border-[var(--line)] text-[var(--ink-2)]'}`}>
                      {appLockMsg.kind === 'success' ? <Check size={13} className="shrink-0 mt-0.5" /> : appLockMsg.kind === 'error' ? <AlertCircle size={13} className="shrink-0 mt-0.5" /> : <Shield size={13} className="shrink-0 mt-0.5" />}
                      <span>{appLockMsg.text}</span>
                    </div>
                  )}
                </div>
              </section>

              {/* Developer */}
              <section className="space-y-2">
                <p className="eyebrow">Developer blueprints</p>
                {[
                  { key: 'sql' as const, icon: <Code size={12} />, label: '1. Prepare DB tables & functions (SQL)' },
                  { key: 'flutter' as const, icon: <Zap size={12} />, label: '2. Sync with Flutter (Dart)' },
                  { key: 'upgrade' as const, icon: <Database size={12} />, label: '3. Upgrade live DB (migration)' },
                ].map((row) => (
                  <div key={row.key} className="card-flat overflow-hidden">
                    <button onClick={() => setExpandedSection(expandedSection === row.key ? 'none' : row.key)} className="w-full px-4 h-11 flex items-center justify-between text-[12px] font-semibold text-[var(--ink)] hover:bg-[var(--surface-2)] transition-colors">
                      <span className="inline-flex items-center gap-2 text-[var(--ink-2)]">{row.icon}<span className="text-[var(--ink)]">{row.label}</span></span>
                      {expandedSection === row.key ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                    <AnimatePresence>
                      {expandedSection === row.key && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="border-t border-[var(--line)] bg-[var(--surface-2)] p-4">
                          <p className="text-[11px] leading-4 text-[var(--ink-2)] mb-2">{row.key === 'flutter' ? 'Add supabase_flutter and use this helper.' : 'Run this in Supabase SQL Editor.'}</p>
                          <div className="relative">
                            <pre className="mono text-[11px] leading-4 bg-[var(--surface)] border border-[var(--line)] rounded-xl p-3 overflow-x-auto max-h-[180px] text-[var(--ink-2)] whitespace-pre">{row.key === 'flutter' ? flutterCode : (sqlScript || '-- Loading SQL...' )}</pre>
                            <button onClick={() => copyToClipboard(row.key === 'flutter' ? flutterCode : sqlScript, row.key)} className="absolute right-2 top-2 w-7 h-7 rounded-full bg-[var(--surface)] border border-[var(--line)] flex items-center justify-center text-[var(--ink-2)] hover:text-[var(--ink)]" aria-label="Copy">{(row.key === 'sql' && sqlCopied) || (row.key === 'flutter' && flutterCopied) || (row.key === 'upgrade' && upgradeCopied) ? <Check size={11} /> : <Copy size={11} />}</button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </section>

              {/* Identity & prefs */}
              <section className="space-y-3">
                <p className="eyebrow inline-flex items-center gap-1.5"><Shield size={11} /> Identity &amp; preferences</p>
                <div className="card-flat p-5 space-y-4">
                  <div>
                    <p className="text-[12px] font-semibold text-[var(--ink)]">Signed in as</p>
                    <p className="mono text-[12px] text-[var(--ink-2)] break-all mt-1 inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[var(--success)] animate-pulse" />{userEmail}</p>
                  </div>
                  <div className="ledger-rule" />
                  <div>
                    <label className="eyebrow block mb-1.5">Currency</label>
                    <select value={state.currency} onChange={(e) => updateState((prev) => ({ ...prev, currency: e.target.value }))} className="input">
                      <option value="Rs.">Rs. — Sri Lankan Rupee</option>
                      <option value="$">$ — US Dollar</option>
                      <option value="€">€ — Euro</option>
                      <option value="£">£ — British Pound</option>
                      <option value="¥">¥ — Japanese Yen</option>
                      <option value="SAR">SAR — Saudi Riyal</option>
                    </select>
                  </div>
                  <div>
                    <p className="eyebrow mb-1.5">Theme</p>
                    <button type="button" onClick={toggleTheme} className="btn-ghost w-full justify-between">
                      <span className="inline-flex items-center gap-2">{theme === 'light' ? <Sun size={13} /> : <Moon size={13} />}<span>{theme === 'light' ? 'Light' : 'Dark'}</span></span>
                      <span className="mono text-[10px] px-2 py-0.5 rounded-full border border-[var(--line)] bg-[var(--surface-2)]">Toggle</span>
                    </button>
                  </div>
                </div>
              </section>

              {/* Backup */}
              <section className="space-y-3">
                <p className="eyebrow inline-flex items-center gap-1.5"><Database size={11} /> Backup</p>
                <div className="card-flat p-5 space-y-3">
                  <button onClick={() => exportStateAsJSON(state, userEmail)} className="btn-ghost w-full justify-center inline-flex items-center gap-2"><FileDown size={13} /> Export JSON backup</button>
                  <div>
                    <label htmlFor="database-config-uploader" className="eyebrow block mb-1.5">Restore from JSON</label>
                    <input type="file" id="database-config-uploader" accept=".json" onChange={handleJSONRestore} className="block w-full text-[12px] text-[var(--ink-2)] file:mr-3 file:btn-ghost file:py-1.5 file:px-3 file:text-[12px]" />
                  </div>
                  {/* CSV exports – one-click spreadsheet downloads per collection */}
                  <div className="pt-3 border-t border-[var(--line)] space-y-2">
                    <p className="eyebrow inline-flex items-center gap-1.5"><FileDown size={11} /> CSV exports (spreadsheet)</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => exportCashAccountsCSV(state.cashAccounts, state.currency)} className="btn-ghost justify-center text-[11px] px-2 py-2">Cash accounts</button>
                      <button onClick={() => exportCardsCSV(state.cards, state.currency)} className="btn-ghost justify-center text-[11px] px-2 py-2">Cards</button>
                      <button onClick={() => exportDebtsCSV(state.debts, state.currency)} className="btn-ghost justify-center text-[11px] px-2 py-2">Debts</button>
                      <button onClick={() => exportLoansCSV(state.loansGiven, state.currency)} className="btn-ghost justify-center text-[11px] px-2 py-2">Loans</button>
                      <button onClick={() => exportSubscriptionsCSV(state.subscriptions, state.currency)} className="btn-ghost justify-center text-[11px] px-2 py-2">Subscriptions</button>
                      <button onClick={() => exportBudgetsCSV(state.budgets || [], state.currency)} className="btn-ghost justify-center text-[11px] px-2 py-2">Budgets</button>
                      <button onClick={() => exportGoalsCSV(state.savingsGoals || [], state.currency)} className="btn-ghost justify-center text-[11px] px-2 py-2">Goals</button>
                      <button onClick={() => exportIncomesCSV(state.incomes, state.currency)} className="btn-ghost justify-center text-[11px] px-2 py-2">Incomes</button>
                      <button onClick={() => exportExpensesCSV(state.expenses, state.currency)} className="btn-ghost justify-center text-[11px] px-2 py-2">Expenses</button>
                    </div>
                  </div>
                  {!showPurge2FA ? (
                    <div className="pt-3 border-t border-[var(--line)] space-y-2">
                      <button onClick={handleWipeDatabase} className="w-full rounded-full border border-[var(--line)] bg-[var(--danger-bg)] text-[var(--danger)] hover:brightness-95 px-4 py-2.5 text-[12px] font-semibold inline-flex items-center justify-center gap-2"><Shield size={12} /> Wipe cloud &amp; local state</button>
                      <p className="mono text-[10px] text-[var(--ink-3)] text-center">Irreversible. Requires email 2FA.</p>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-[var(--line)] bg-[var(--danger-bg)] p-3.5 space-y-3">
                      <p className="text-[12px] font-semibold text-[var(--danger)] inline-flex items-center gap-1.5"><AlertCircle size={13} /> Verify to wipe</p>
                      <p className="text-[11px] leading-4 text-[var(--ink-2)]">Code sent to <span className="mono text-[var(--ink)]">{userEmail}</span>.</p>
                      <input type="text" maxLength={6} placeholder="000000" value={purgeOtp} onChange={(e) => setPurgeOtp(e.target.value.replace(/\D/g, ''))} className="input mono text-center tracking-[0.35em]" disabled={purgeLoading} />
                      {purgeError && <p className="text-[11px] text-[var(--danger)]">{purgeError}</p>}
                      {purgeDevOtp && <p className="mono text-[11px] text-[var(--ink-2)]">Dev OTP: <span className="text-[var(--ink)] font-semibold">{purgeDevOtp}</span></p>}
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => { setShowPurge2FA(false); setPurgeOtp(''); setPurgeError(null); setPurgeDevOtp(null); setSyncStatus('idle'); setSyncMessage(null); }} className="btn-ghost justify-center" disabled={purgeLoading}>Cancel</button>
                        <button type="button" onClick={handleConfirmPurge2FA} className="btn-primary justify-center bg-[var(--danger)] border-[var(--danger)] hover:brightness-95 disabled:opacity-50" disabled={purgeLoading}>{purgeLoading ? 'Purging...' : 'Confirm wipe'}</button>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              <div className="card-flat p-4 flex gap-2.5 text-[11px] leading-5 text-[var(--ink-2)]">
                <Zap size={12} className="shrink-0 mt-0.5 text-[var(--ink-3)]" />
                <ul className="space-y-1 list-disc list-inside"><li>Incomes credit the chosen account.</li><li>Expenses check balance before posting.</li><li>Debt payments update remaining in real time.</li></ul>
              </div>

              <button id="settings-logout-btn" onClick={onLogout} className="btn-ghost w-full justify-center inline-flex items-center gap-2 text-[var(--danger)] border-[var(--line)] hover:bg-[var(--danger-bg)]"><LogOut size={13} /> Log out</button>
            </div>

            <div className="px-6 h-10 border-t border-[var(--line)] flex items-center justify-center mono text-[10px] text-[var(--ink-3)] shrink-0">Secured · local-first</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
