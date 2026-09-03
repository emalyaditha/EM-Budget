import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, ShieldCheck, Fingerprint, AlertCircle, RefreshCw, ArrowLeft, KeyRound } from 'lucide-react';
import {
  verifyPin,
  biometricUnlock,
  isBiometricAvailable,
} from '../lib/appLock';

interface LockScreenProps {
  email: string;
  appLockEnabled: boolean;
  pinEnabled: boolean;
  hasBiometric: boolean;
  onUnlocked: () => void;
  onSwitchAccount: () => void;
  onForgotPin: () => void;
}

type PinEntryState = {
  value: string;
  error: string | null;
  status: 'idle' | 'loading' | 'locked';
  retryAfter: number;
};

export default function LockScreen({
  email,
  appLockEnabled,
  pinEnabled,
  hasBiometric,
  onUnlocked,
  onSwitchAccount,
  onForgotPin,
}: LockScreenProps) {
  const [pin, setPin] = useState<PinEntryState>({ value: '', error: null, status: 'idle', retryAfter: 0 });
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [mode, setMode] = useState<'pin' | 'biometric'>('pin');
  const [inactivityCountdown, setInactivityCountdown] = useState<number | null>(null);
  const lockoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const canUsePin = appLockEnabled && pinEnabled;
  const canUseBiometric = appLockEnabled && hasBiometric && biometricSupported;

  useEffect(() => {
    let active = true;
    isBiometricAvailable().then((ok) => {
      if (active) {
        setBiometricSupported(ok);
        if (canUseBiometric) setMode('biometric');
      }
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  // Trigger a biometric unlock automatically when it becomes available
  useEffect(() => {
    if (mode === 'biometric' && canUseBiometric && !biometricBusy) {
      void attemptBiometric();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, biometricSupported]);

  // Lockout countdown
  useEffect(() => {
    if (pin.status !== 'locked' || !pin.retryAfter) return;
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    let remaining = pin.retryAfter;
    setInactivityCountdown(remaining);
    countdownTimerRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        setPin((p) => ({ ...p, status: 'idle', value: '', retryAfter: 0 }));
        setInactivityCountdown(null);
      } else {
        setInactivityCountdown(remaining);
      }
    }, 1000);
    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [pin.status, pin.retryAfter]);

  useEffect(() => {
    return () => {
      if (lockoutTimerRef.current) clearTimeout(lockoutTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, []);

  const attemptPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.value.length < 4 || pin.status !== 'idle') return;
    setPin((p) => ({ ...p, error: null, status: 'loading' }));
    const result = await verifyPin(email, pin.value);
    if (result.ok) {
      setPin((p) => ({ ...p, status: 'idle' }));
      onUnlocked();
      return;
    }
    if (result.code === 'LOCKED' || result.retryAfter) {
      setPin((p) => ({ ...p, status: 'locked', error: result.error || 'Too many attempts.', retryAfter: result.retryAfter || 60, value: '' }));
      return;
    }
    setPin((p) => ({ ...p, status: 'idle', error: result.error || 'Incorrect PIN. Try again.', value: '' }));
  };

  const attemptBiometric = async () => {
    setBiometricBusy(true);
    const result = await biometricUnlock(email);
    setBiometricBusy(false);
    if (result.ok) {
      onUnlocked();
      return;
    }
    setPin((p) => ({ ...p, error: result.error || 'Biometric unlock failed.' }));
  };

  const switchMode = (next: 'pin' | 'biometric') => {
    setPin((p) => ({ ...p, error: null, value: '' }));
    setMode(next);
  };

  const handleSwitchAccount = () => {
    setPin((p) => ({ ...p, error: null, value: '' }));
    onSwitchAccount();
  };

  return (
    <div id="app-lock-container" className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 overflow-y-auto bg-[var(--bg)] text-[var(--ink)]">
      <div className="w-full max-w-[420px]">
        <div className="card p-8 md:p-9">
          <div className="flex flex-col items-center text-center">
            <motion.div
              key={mode}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.22 }}
              className="w-11 h-11 rounded-full bg-[var(--surface-2)] border border-[var(--line)] flex items-center justify-center text-[var(--ink-2)] mb-5"
            >
              {mode === 'pin' ? <Lock size={18} /> : <Fingerprint size={18} />}
            </motion.div>
            <h1 className="text-[18px] font-bold tracking-tight text-[var(--ink)]">App Locked</h1>
            <p className="eyebrow mt-1.5">Your vault is protected</p>
            <p className="text-[12px] leading-5 text-[var(--ink-2)] mt-3 max-w-[32ch]">
              {mode === 'pin' && `Enter your PIN to open ${email}.`}
              {mode === 'biometric' && `Verify with your device to open ${email}.`}
            </p>
          </div>

          <div className="ledger-rule my-6" />

          <AnimatePresence mode="wait">
            {mode === 'pin' && (
              <motion.form
                key="pin-form"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                onSubmit={attemptPin}
                className="space-y-4"
              >
                <div>
                  <label htmlFor="lock-pin" className="eyebrow block mb-1.5">PIN</label>
                  <div className="relative">
                    <KeyRound size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ink-3)]" />
                    <input
                      id="lock-pin"
                      type="password"
                      inputMode="numeric"
                      autoComplete="current-password"
                      required
                      autoFocus
                      disabled={pin.status === 'locked'}
                      value={pin.value}
                      onChange={(e) => setPin((p) => ({ ...p, value: e.target.value.replace(/\D/g, '').slice(0, 6), error: null }))}
                      placeholder="••••"
                      className="input !pl-9 mono text-center tracking-[0.35em] text-[15px] disabled:opacity-50"
                    />
                  </div>
                  {inactivityCountdown !== null && (
                    <p className="mono text-[11px] text-[var(--danger)] mt-2">Locked. Retry in {inactivityCountdown}s</p>
                  )}
                </div>

                <button type="submit" disabled={pin.status === 'loading' || pin.status === 'locked'} className="btn-primary w-full justify-center inline-flex items-center gap-2 disabled:opacity-50">
                  {pin.status === 'loading' ? <RefreshCw className="animate-spin" size={14} /> : <><ShieldCheck size={14} /><span>Unlock</span></>}
                </button>

                {canUseBiometric && (
                  <button type="button" onClick={() => switchMode('biometric')} className="btn-ghost w-full justify-center inline-flex items-center gap-2">
                    <Fingerprint size={14} /> Use biometrics
                  </button>
                )}

                <div className="flex justify-between text-[12px]">
                  <button type="button" onClick={handleSwitchAccount} className="text-[var(--ink-2)] hover:text-[var(--ink)] underline underline-offset-4 decoration-[var(--line-strong)]">Use a different account</button>
                  <button type="button" onClick={onForgotPin} className="text-[var(--ink-2)] hover:text-[var(--ink)] underline underline-offset-4 decoration-[var(--line-strong)]">Forgot PIN?</button>
                </div>
              </motion.form>
            )}

            {mode === 'biometric' && (
              <motion.div
                key="biometric-panel"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="space-y-4"
              >
                <button
                  type="button"
                  onClick={() => void attemptBiometric()}
                  disabled={biometricBusy}
                  className="btn-primary w-full justify-center inline-flex items-center gap-2 disabled:opacity-50"
                >
                  {biometricBusy ? <RefreshCw className="animate-spin" size={14} /> : <Fingerprint size={14} />}
                  <span>{biometricBusy ? 'Waiting for verification…' : 'Verify now'}</span>
                </button>
                <button type="button" onClick={() => switchMode('pin')} disabled={!canUsePin} className="btn-ghost w-full justify-center inline-flex items-center gap-2 disabled:opacity-50">
                  Use PIN instead
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {pin.error && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--danger-bg)] px-3.5 py-3 flex gap-2.5 text-[12px] leading-5 text-[var(--danger)]">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span>{pin.error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {!appLockEnabled && (
            <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-3 space-y-3">
              <p className="text-[12px] leading-5 text-[var(--ink-2)]">
                App lock is not configured for this account, so you can continue straight to your vault. You can set up a PIN or biometrics anytime in <strong>Settings → App Lock</strong>.
              </p>
              <button type="button" onClick={onUnlocked} className="btn-primary w-full justify-center inline-flex items-center gap-2">Continue to app</button>
            </div>
          )}
        </div>

        <p className="eyebrow text-center mt-6 opacity-60">Paper ledger · local-first · cloud-synced</p>
      </div>
    </div>
  );
}