import React, { useState, useEffect, useRef } from 'react';
import { Mail, ShieldCheck, KeyRound, AlertCircle, RefreshCw, Lock, ArrowRight, Sparkles, Key } from 'lucide-react';
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
  const [rememberMe, setRememberMe] = useState(false);
  const [otpValue, setOtpValue] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  
  const [sandboxOtp, setSandboxOtp] = useState<string | null>(null);

  const [resendTimer, setResendTimer] = useState<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (resendTimer > 0) {
      timerRef.current = setTimeout(() => {
        setResendTimer(prev => prev - 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resendTimer]);

  const getHeaders = () => {
    const config = getSupabaseConfig();
    return {
      'Content-Type': 'application/json',
      'x-supabase-url': config.url,
      'x-supabase-key': config.key
    };
  };

  const validatePasswordStrength = (pass: string): string | null => {
    if (pass.length < 8) {
      return 'Password must be at least 8 characters long.';
    }
    if (!/[A-Z]/.test(pass)) {
      return 'Password must contain at least one uppercase letter (A-Z).';
    }
    if (!/[a-z]/.test(pass)) {
      return 'Password must contain at least one lowercase letter (a-z).';
    }
    if (!/[0-9]/.test(pass) && !/[!@#$%^&*(),.?":{}|<>]/.test(pass)) {
      return 'Password must contain at least one number or special character.';
    }
    return null;
  };

  const handleCheckEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMsg('Please enter a valid email address.'); return;
    }
    // Strict regular expression email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setErrorMsg('Invalid email format. Match guidelines (e.g. user@domain.com).');
      return;
    }
    setLoading(true); setErrorMsg(null); setInfoMsg(null); setSandboxOtp(null);

    try {
      const resp = await fetch('/api/auth/check-email', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ email: cleanEmail }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) throw new Error(data.error || 'Failed to check account');

      if (data.exists) {
        setStep('login-password');
      } else {
        await initOtpSend();
        setStep('verify-otp');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'System error. Check connection.');
    } finally {
      setLoading(false);
    }
  };

  const initOtpSend = async () => {
    const cleanEmail = email.trim();
    const resp = await fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ email: cleanEmail }),
    });
    const data = await resp.json();
    if (!resp.ok || !data.success) throw new Error(data.error || 'Failed to dispatch verification code.');
    
    setResendTimer(60);
    if (!data.emailSent) {
      setSandboxOtp(data.devOtp);
      setInfoMsg('2FA Key prepared! Copy the developer bypass code from console or use: ' + data.devOtp);
    } else {
      setInfoMsg('A secure 2FA passcode has been dispatched directly to your email!');
    }
  };

  const handleSendForgotPassword = async () => {
    setLoading(true); setErrorMsg(null); setInfoMsg(null); setSandboxOtp(null);
    try {
      await initOtpSend();
      setStep('reset-otp');
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent, isReset: boolean) => {
    e.preventDefault();
    const cleanOtp = otpValue.trim();
    if (cleanOtp.length !== 6 || !/^\d+$/.test(cleanOtp)) {
      setErrorMsg('Please input a complete 6-digit numeric confirmation code.'); return;
    }

    setLoading(true); setErrorMsg(null);
    try {
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          email: email.trim(),
          otp: cleanOtp,
          forRegistrationOrReset: true
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'The code entered could not be verified.');
      
      setStep(isReset ? 'reset-password' : 'create-password');
    } catch(err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) { setErrorMsg('Enter your lock password.'); return; }
    
    setLoading(true); setErrorMsg(null);
    try {
      const response = await fetch('/api/auth/login-password', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error);
      
      onUnlocked(email.trim().toLowerCase(), data.token || '', rememberMe, data.deviceToken);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOrResetPassword = async (e: React.FormEvent, isReset: boolean) => {
    e.preventDefault();
    
    // Entropy check
    const strengthErrorMsg = validatePasswordStrength(password);
    if (strengthErrorMsg) {
      setErrorMsg(strengthErrorMsg);
      return;
    }
    
    if (password !== confirmPassword) {
      setErrorMsg('Master keys do not match. Review passwords entries.'); return;
    }

    setLoading(true); setErrorMsg(null);
    try {
      const endpoint = isReset ? '/api/auth/reset-password' : '/api/auth/register';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ email: email.trim(), password, otp: otpValue.trim() }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error);
      
      onUnlocked(email.trim().toLowerCase(), data.token || '', rememberMe, data.deviceToken);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const renderIcon = () => {
    if (step === 'enter-email') return <Lock size={32} />;
    if (step === 'login-password' || step === 'create-password' || step === 'reset-password') return <Key size={32} />;
    return <KeyRound size={32} />;
  };

  return (
    <div id="email-2fa-container" className="fixed inset-0 z-50 bg-[#0A0A0C] text-white flex flex-col justify-center items-center p-6 select-none overflow-y-auto">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-indigo-950/15 rounded-full blur-3xl pointer-events-none animate-pulse duration-[8000ms]" />
      <div className="absolute bottom-10 left-10 w-64 h-64 bg-zinc-955 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-zinc-900/40 border border-zinc-850 backdrop-blur-xl rounded-[32px] p-8 md:p-10 shadow-2xl relative overflow-hidden">
        {/* Sleek top edge highlight */}
        <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-[var(--accent-primary)]/40 to-transparent" />
        
        <div className="flex flex-col items-center text-center">
          <div className="p-4 bg-zinc-950 rounded-2xl border border-zinc-805 shadow-inner mb-6 relative text-[var(--accent-primary)]">
            <div className="absolute inset-0 bg-[var(--accent-primary)]/5 rounded-2xl blur-sm" />
            {renderIcon()}
          </div>

          <h1 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-2">
            Vault Suite Secure
            <span className="text-[9px] py-0.5 px-2 rounded-full font-mono text-[var(--accent-primary)] bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/30 font-bold uppercase tracking-wider flex items-center gap-1">
              <Sparkles size={9} /> PORTAL
            </span>
          </h1>
          <p className="text-zinc-400 text-xs mt-2.5 px-4 leading-relaxed font-medium">
            {step === 'enter-email' && "Enter your credentials to connect with your corporate vault session."}
            {step === 'login-password' && `Authenticate vault access for ${email}`}
            {(step === 'verify-otp' || step === 'reset-otp') && `A secure OTP token was dispatched to ${email}. Provide code to establish identity.`}
            {(step === 'create-password' || step === 'reset-password') && "Establish your lock keys to seal the security vault."}
          </p>
        </div>

        <div className="mt-8">
          <AnimatePresence mode="wait">
            {step === 'enter-email' && (
              <motion.form 
                key="email-form" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                onSubmit={handleCheckEmail} className="space-y-5"
              >
                <div>
                  <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-2 font-mono">
                    Identity Account (Email)
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500"><Mail size={16} /></span>
                    <input
                      type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter verified email..."
                      className="w-full bg-[#060608]/90 border border-zinc-855 text-white rounded-xl py-3.5 pl-11 pr-4 text-sm font-medium focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors placeholder-zinc-700 font-sans"
                    />
                  </div>
                </div>
                <button type="submit" disabled={loading} className="w-full bg-white hover:bg-zinc-200 text-black font-extrabold text-sm py-4 rounded-xl flex items-center justify-center gap-2 transition-all duration-300 cursor-pointer shadow-lg active:scale-[0.99] disabled:opacity-50">
                  {loading ? <RefreshCw className="animate-spin text-black" size={16} /> : <><span>Next Step</span><ArrowRight size={15} /></>}
                </button>
              </motion.form>
            )}

            {step === 'login-password' && (
              <motion.form 
                key="login-password-form" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                onSubmit={handlePasswordSubmit} className="space-y-5"
              >
                <div>
                  <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-2 font-mono">
                    Master Password Entry
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500"><Lock size={16} /></span>
                    <input
                      type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-[#060608]/90 border border-zinc-855 text-white tracking-[3px] rounded-xl py-3.5 pl-11 pr-4 text-sm font-medium focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-sans"
                    />
                  </div>
                  <div className="flex items-center gap-2 mt-3.5">
                    <input
                      type="checkbox"
                      id="rememberMe"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="accent-indigo-500 w-4 h-4 cursor-pointer rounded border-zinc-800 focus:ring-0"
                    />
                    <label htmlFor="rememberMe" className="text-xs text-zinc-400 cursor-pointer select-none font-medium hover:text-zinc-300">Remember me</label>
                  </div>
                </div>
                <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-extrabold text-sm py-4 rounded-xl flex items-center justify-center gap-2 transition-all duration-300 cursor-pointer shadow-lg shadow-indigo-950/20 active:scale-[0.99] disabled:opacity-50">
                  {loading ? <RefreshCw className="animate-spin text-white" size={16} /> : <><ShieldCheck size={16} /><span>Authenticate Vault</span></>}
                </button>
                <div className="flex justify-between mt-5 text-sm font-mono font-bold">
                  <button type="button" onClick={() => setStep('enter-email')} className="text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer">Change Email</button>
                  <button type="button" onClick={handleSendForgotPassword} className="text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer">Forgot Password?</button>
                </div>
              </motion.form>
            )}

            {(step === 'verify-otp' || step === 'reset-otp') && (
              <motion.form 
                key="otp-form" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                onSubmit={(e) => handleVerifyOtp(e, step === 'reset-otp')} className="space-y-5"
              >
                <div>
                  <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-2 font-mono">
                    Security Passcode Verification
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-400"><KeyRound size={16} /></span>
                    <input
                      type="password" required value={otpValue} onChange={(e) => setOtpValue(e.target.value)}
                      placeholder="Input 6-digit OTP"
                      className="w-full bg-[#060608]/90 border border-indigo-950 text-indigo-405 tracking-[8px] font-mono text-center text-lg font-bold rounded-xl py-3.5 pl-11 pr-4 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-sans"
                    />
                  </div>
                </div>
                <div className="flex justify-between items-center text-xs font-mono">
                  <span className="text-zinc-500">Passcode valid 5m</span>
                  {resendTimer > 0 ? (
                    <span className="text-zinc-650 text-zinc-600 flex items-center gap-1 font-semibold">Resend in {resendTimer}s</span>
                  ) : (
                    <button type="button" onClick={() => initOtpSend()} disabled={loading} className="text-indigo-400 hover:text-indigo-300 cursor-pointer font-bold flex items-center gap-1.5 active:scale-95 transition-all">
                      <RefreshCw size={11} /> Request New Pin
                    </button>
                  )}
                </div>
                <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-extrabold text-sm py-4 rounded-xl flex items-center justify-center gap-2 transition-all duration-300 cursor-pointer shadow-lg active:scale-[0.99] disabled:opacity-50">
                  {loading ? <RefreshCw className="animate-spin text-white" size={16} /> : <><ShieldCheck size={16} /><span>Verify Entry PIN</span></>}
                </button>
                <button type="button" onClick={() => setStep('enter-email')} className="w-full bg-transparent border border-zinc-850 hover:bg-zinc-900/40 text-zinc-400 hover:text-zinc-300 text-xs py-3 rounded-xl font-bold transition-all cursor-pointer">
                  Cancel Choice
                </button>
              </motion.form>
            )}

            {(step === 'create-password' || step === 'reset-password') && (
              <motion.form 
                key="create-password-form" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                onSubmit={(e) => handleCreateOrResetPassword(e, step === 'reset-password')} className="space-y-4"
              >
                <div>
                  <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-2 font-mono">
                    New Secure Password
                  </label>
                  <input
                    type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#060608]/90 border border-zinc-850 text-white rounded-xl py-3.5 px-4 text-sm font-medium focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-sans"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-2 font-mono">
                    Confirm Secure Password
                  </label>
                  <input
                    type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#060608]/90 border border-zinc-850 text-white rounded-xl py-3 px-4 text-sm font-medium focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-sans"
                  />
                </div>
                <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-extrabold text-sm py-4 rounded-xl shadow-lg transition-all duration-300 active:scale-[0.99] disabled:opacity-50 mt-2">
                  {loading ? <RefreshCw className="animate-spin text-white mx-auto" size={16} /> : <span>{step === 'reset-password' ? 'Reset and Terminate Lock' : 'Seal Account and Authenticate'}</span>}
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>

        {/* System Error Notification Banner */}
        <AnimatePresence>
          {errorMsg && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              className="mt-5 bg-rose-950/20 border border-rose-900/30 p-4 rounded-xl flex items-start gap-2.5 text-xs text-rose-400"
            >
              <AlertCircle size={14} className="shrink-0 mt-0.5 text-rose-500" />
              <span>{errorMsg}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Status / Sandbox Assisted Banner */}
        <AnimatePresence>
          {infoMsg && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              className="mt-5 p-4 rounded-xl border border-indigo-900/25 text-xs leading-relaxed space-y-2 bg-indigo-950/20 text-indigo-400"
            >
              <p className="flex items-center gap-1.5 break-all font-medium animate-fade-in">
                <ShieldCheck size={13} className="shrink-0 text-indigo-405 text-indigo-400" />
                <span>{infoMsg}</span>
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <span className="text-zinc-700 text-[9px] tracking-[4px] font-mono font-bold uppercase mt-8 pointer-events-none select-none">
        Active Vault Link / Secure Suite Session
      </span>
    </div>
  );
}
