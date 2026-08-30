import React, { useState, useEffect, useRef } from 'react';
import { apiUrl, safeJson } from "../lib/api";
import { Mail, ShieldCheck, KeyRound, AlertCircle, RefreshCw, Lock, ArrowRight, Eye, EyeOff, Key } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getSupabaseConfig } from '../supabase';
import { useNotifications } from '../context/NotificationContext';

interface EmailLoginProps {
  onUnlocked: (email: string, token: string, rememberMe: boolean, deviceToken?: string) => void;
}

type AuthStep = 'enter-email' | 'login-password' | 'verify-otp' | 'create-password' | 'reset-otp' | 'reset-password';

export default function EmailLogin({ onUnlocked }: EmailLoginProps) {
  const { showToast } = useNotifications();
  const [step, setStep] = useState<AuthStep>('enter-email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [otpValue, setOtpValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [sandboxOtp, setSandboxOtp] = useState<string | null>(null);
  const [resendTimer, setResendTimer] = useState<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (resendTimer > 0) {
      timerRef.current = setTimeout(() => setResendTimer((p) => p - 1), 1000);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resendTimer]);

  const getHeaders = () => {
    const config = getSupabaseConfig();
    return { 'Content-Type': 'application/json', 'x-supabase-url': config.url, 'x-supabase-key': config.key };
  };

  const validatePasswordStrength = (pass: string): string | null => {
    if (pass.length < 8) return 'Password must be at least 8 characters.';
    if (!/[A-Z]/.test(pass)) return 'Password must contain an uppercase letter (A-Z).';
    if (!/[a-z]/.test(pass)) return 'Password must contain a lowercase letter (a-z).';
    if (!/[0-9]/.test(pass) && !/[!@#$%^&*(),.?":{}|<>]/.test(pass)) return 'Password must contain a number or special character.';
    return null;
  };

  const handleCheckEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail) { setErrorMsg('Please enter a valid email address.'); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) { setErrorMsg('Invalid email format. Use user@domain.com.'); return; }
    setLoading(true); setErrorMsg(null); setInfoMsg(null); setSandboxOtp(null);
    try {
      const resp = await fetch(apiUrl('/api/auth/check-email'), { method: 'POST', headers: getHeaders(), body: JSON.stringify({ email: cleanEmail }) });
      const data = await safeJson(resp);
      if (!data) throw new Error("Empty response");
      if (!resp.ok || !data.success) throw new Error(data.error || 'Failed to check account');
      if (data.exists) setStep('login-password');
      else { await initOtpSend(); setStep('verify-otp'); }
    } catch (err: any) { setErrorMsg(err.message || 'System error. Check connection.'); }
    finally { setLoading(false); }
  };

  const initOtpSend = async () => {
    const cleanEmail = email.trim();
    const resp = await fetch(apiUrl('/api/auth/send-otp'), { method: 'POST', headers: getHeaders(), body: JSON.stringify({ email: cleanEmail }) });
    const data = await safeJson(resp);
    if (!data) throw new Error("Empty response");
    if (!resp.ok || !data.success) throw new Error(data.error || 'Failed to dispatch verification code.');
    setResendTimer(60);
    if (!data.emailSent) { setSandboxOtp(data.devOtp); setInfoMsg('Dev bypass code: ' + data.devOtp); }
    else setInfoMsg('A 6-digit code was sent to your email. Valid for 5 minutes.');
  };

  const handleSendForgotPassword = async () => {
    setLoading(true); setErrorMsg(null); setInfoMsg(null); setSandboxOtp(null);
    try { await initOtpSend(); setStep('reset-otp'); }
    catch (err: any) { setErrorMsg(err.message); }
    finally { setLoading(false); }
  };

  const handleVerifyOtp = async (e: React.FormEvent, isReset: boolean) => {
    e.preventDefault();
    const cleanOtp = otpValue.trim();
    if (cleanOtp.length !== 6 || !/^\d+$/.test(cleanOtp)) { setErrorMsg('Enter a complete 6-digit code.'); return; }
    setLoading(true); setErrorMsg(null);
    try {
      const resp = await fetch(apiUrl('/api/auth/verify-otp'), { method: 'POST', headers: getHeaders(), body: JSON.stringify({ email: email.trim(), otp: cleanOtp, forRegistrationOrReset: true }) });
      const data = await safeJson(resp);
      if (!data) throw new Error("Empty response");
      if (!resp.ok || !data.success) throw new Error(data.error || 'Code could not be verified.');
      setStep(isReset ? 'reset-password' : 'create-password');
    } catch (err: any) { setErrorMsg(err.message); }
    finally { setLoading(false); }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) { setErrorMsg('Enter your password.'); return; }
    setLoading(true); setErrorMsg(null);
    try {
      const resp = await fetch(apiUrl('/api/auth/login-password'), { method: 'POST', headers: getHeaders(), body: JSON.stringify({ email: email.trim(), password }) });
      const data = await safeJson(resp);
      if (!data) throw new Error("Empty response");
      if (!resp.ok || !data.success) throw new Error(data.error);
      onUnlocked(email.trim().toLowerCase(), data.token || '', rememberMe, data.deviceToken);
    } catch (err: any) { setErrorMsg(err.message); }
    finally { setLoading(false); }
  };

  const handleCreateOrResetPassword = async (e: React.FormEvent, isReset: boolean) => {
    e.preventDefault();
    const se = validatePasswordStrength(password);
    if (se) { setErrorMsg(se); return; }
    if (password !== confirmPassword) { setErrorMsg('Passwords do not match.'); return; }
    setLoading(true); setErrorMsg(null);
    try {
      const endpoint = isReset ? '/api/auth/reset-password' : '/api/auth/register';
      const resp = await fetch(apiUrl(endpoint), { method: 'POST', headers: getHeaders(), body: JSON.stringify({ email: email.trim(), password, otp: otpValue.trim() }) });
      const data = await safeJson(resp);
      if (!data) throw new Error("Empty response");
      if (!resp.ok || !data.success) throw new Error(data.error);
      onUnlocked(email.trim().toLowerCase(), data.token || '', rememberMe, data.deviceToken);
    } catch (err: any) { setErrorMsg(err.message); }
    finally { setLoading(false); }
  };

  const isOtpStep = step === 'verify-otp' || step === 'reset-otp';
  const isCreateStep = step === 'create-password' || step === 'reset-password';

  return (
    <div id="email-2fa-container" className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 overflow-y-auto bg-[var(--bg)] text-[var(--ink)]">
      {/* dot-grid is on body; no gradients */}
      <div className="w-full max-w-[420px]">
        <div className="card p-8 md:p-9">
          <div className="flex flex-col items-center text-center">
            <div className="w-11 h-11 rounded-full bg-[var(--surface-2)] border border-[var(--line)] flex items-center justify-center text-[var(--ink-2)] mb-5">
              {step === 'enter-email' ? <Lock size={18} /> : step === 'login-password' || isCreateStep ? <Key size={18} /> : <KeyRound size={18} />}
            </div>
            <h1 className="text-[18px] font-bold tracking-tight text-[var(--ink)]">EM Budget</h1>
            <p className="eyebrow mt-1.5">Secure ledger — sign in</p>
            <p className="text-[12px] leading-5 text-[var(--ink-2)] mt-3 max-w-[32ch]">
              {step === 'enter-email' && "Enter your email to continue. We\u2019ll check your vault or create one."}
              {step === 'login-password' && `Enter the password for ${email}.`}
              {isOtpStep && `Code sent to ${email}. Enter the 6-digit code.`}
              {isCreateStep && "Create a strong password to seal your vault."}
            </p>
          </div>

          <div className="ledger-rule my-6" />

          <AnimatePresence mode="wait">
            {step === 'enter-email' && (
              <motion.form key="email-form" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} onSubmit={handleCheckEmail} className="space-y-4">
                <div>
                  <label htmlFor="login-email" className="eyebrow block mb-1.5">Email</label>
                  <div className="relative">
                    <Mail size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ink-3)]" />
                    <input id="login-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@domain.com" className="input !pl-9" />
                  </div>
                </div>
                <button type="submit" disabled={loading} className="btn-primary w-full justify-center inline-flex items-center gap-2 disabled:opacity-50">
                  {loading ? <RefreshCw className="animate-spin" size={14} /> : <><span>Continue</span><ArrowRight size={14} /></>}
                </button>
                <p className="text-[11px] leading-4 text-[var(--ink-3)] text-center">We\u2019ll email you only for verification. No marketing.</p>
              </motion.form>
            )}

            {step === 'login-password' && (
              <motion.form key="login-password-form" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} onSubmit={handlePasswordSubmit} className="space-y-4">
                <div>
                  <label htmlFor="login-password" className="eyebrow block mb-1.5">Password</label>
                  <div className="relative">
                    <Lock size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ink-3)]" />
                    <input id="login-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="input !pl-9 !pr-9" />
                    <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-[var(--ink-3)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)] transition-colors">
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" id="rememberMe" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="w-3.5 h-3.5 rounded border-[var(--line)] bg-[var(--surface)] accent-[var(--ink)]" />
                  <span className="text-[12px] text-[var(--ink-2)]">Remember this device</span>
                </label>
                <button type="submit" disabled={loading} className="btn-primary w-full justify-center inline-flex items-center gap-2 disabled:opacity-50">
                  {loading ? <RefreshCw className="animate-spin" size={14} /> : <><ShieldCheck size={14} /><span>Sign in</span></>}
                </button>
                <div className="flex justify-between text-[12px]">
                  <button type="button" onClick={() => setStep('enter-email')} className="text-[var(--ink-2)] hover:text-[var(--ink)] underline underline-offset-4 decoration-[var(--line-strong)]">Change email</button>
                  <button type="button" onClick={handleSendForgotPassword} className="text-[var(--ink-2)] hover:text-[var(--ink)] underline underline-offset-4 decoration-[var(--line-strong)]">Forgot password?</button>
                </div>
              </motion.form>
            )}

            {isOtpStep && (
              <motion.form key="otp-form" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} onSubmit={(e) => handleVerifyOtp(e, step === 'reset-otp')} className="space-y-4">
                <div>
                  <label htmlFor="otp" className="eyebrow block mb-1.5">6-digit code</label>
                  <div className="relative">
                    <KeyRound size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ink-3)]" />
                    <input id="otp" inputMode="numeric" autoComplete="one-time-code" required value={otpValue} onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" className="input !pl-9 mono text-center tracking-[0.35em] text-[15px]" maxLength={6} />
                  </div>
                  {sandboxOtp && <p className="mono text-[11px] text-[var(--ink-2)] mt-2">Dev bypass: <span className="text-[var(--ink)] font-semibold">{sandboxOtp}</span></p>}
                </div>
                <div className="flex justify-between items-center text-[11px] mono">
                  <span className="text-[var(--ink-3)]">Valid 5 min</span>
                  {resendTimer > 0 ? <span className="text-[var(--ink-3)]">Resend in {resendTimer}s</span> : <button type="button" onClick={() => initOtpSend()} disabled={loading} className="text-[var(--ink)] underline underline-offset-4 decoration-[var(--line-strong)] hover:decoration-[var(--ink)]">Resend code</button>}
                </div>
                <button type="submit" disabled={loading} className="btn-primary w-full justify-center inline-flex items-center gap-2 disabled:opacity-50">
                  {loading ? <RefreshCw className="animate-spin" size={14} /> : <><ShieldCheck size={14} /><span>Verify code</span></>}
                </button>
                <button type="button" onClick={() => setStep('enter-email')} className="btn-ghost w-full justify-center">Cancel</button>
              </motion.form>
            )}

            {isCreateStep && (
              <motion.form key="create-password-form" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} onSubmit={(e) => handleCreateOrResetPassword(e, step === 'reset-password')} className="space-y-4">
                <div>
                  <label htmlFor="new-password" className="eyebrow block mb-1.5">New password</label>
                  <div className="relative">
                    <Lock size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ink-3)]" />
                    <input id="new-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="input !pl-9 !pr-9" />
                    <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-[var(--ink-3)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)] transition-colors">{showPassword ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                  </div>
                  <p className="text-[11px] text-[var(--ink-3)] mt-1.5">8+ chars, upper + lower, number or symbol.</p>
                </div>
                <div>
                  <label htmlFor="confirm-password" className="eyebrow block mb-1.5">Confirm password</label>
                  <div className="relative">
                    <Lock size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ink-3)]" />
                    <input id="confirm-password" type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" className="input !pl-9 !pr-9" />
                    <button type="button" onClick={() => setShowConfirmPassword((v) => !v)} aria-label={showConfirmPassword ? 'Hide' : 'Show'} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-[var(--ink-3)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)] transition-colors">{showConfirmPassword ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                  </div>
                </div>
                <button type="submit" disabled={loading} className="btn-primary w-full justify-center disabled:opacity-50">
                  {loading ? <RefreshCw className="animate-spin mx-auto" size={14} /> : <span>{step === 'reset-password' ? 'Reset password' : 'Create account'}</span>}
                </button>
              </motion.form>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {errorMsg && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--danger-bg)] px-3.5 py-3 flex gap-2.5 text-[12px] leading-5 text-[var(--danger)]">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {infoMsg && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-3 flex gap-2.5 text-[12px] leading-5 text-[var(--ink-2)]">
                <ShieldCheck size={14} className="shrink-0 mt-0.5 text-[var(--ink-3)]" />
                <span className="break-all">{infoMsg}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="eyebrow text-center mt-6 opacity-60">Paper ledger · local-first · cloud-synced</p>
      </div>
    </div>
  );
}
