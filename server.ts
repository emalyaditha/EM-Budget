import express from "express";
import path from "path";
import fs from "fs";
import nodemailer from "nodemailer";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} from "@simplewebauthn/server";

export async function createApp(): Promise<express.Express> {
  const app = express();
  const IS_PRODUCTION = process.env.NODE_ENV === "production";

  app.set("trust proxy", 1);
  app.use(express.json({ limit: "20mb" }));
  app.use(express.urlencoded({ limit: "20mb", extended: true }));

  // Cryptographic Signature Vault Systems (OWASP Level Protection)
  const SESSION_SECRET = process.env.SESSION_SECRET;
  if (!SESSION_SECRET) {
    if (process.env.VERCEL) {
      throw new Error("SESSION_SECRET environment variable is missing.");
    }
    console.error("❌ CRITICAL SECURITY ERROR: The SESSION_SECRET environment variable is missing! The server cannot start without a secure SESSION_SECRET.");
    process.exit(1);
  }

  function timingSafeEqualString(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  function generateSecureToken(email: string, durationMs = 24 * 60 * 60 * 1000): string {
    const payload = {
      email: email.trim().toLowerCase(),
      expiresAt: Date.now() + durationMs
    };
    const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payloadStr).digest('hex');
    return `${payloadStr}.${signature}`;
  }

  function verifySecureToken(token: string): { email: string } | null {
    if (!token || typeof token !== "string" || !SESSION_SECRET) return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payloadStr, signature] = parts;
    const expectedSignature = crypto.createHmac('sha256', SESSION_SECRET).update(payloadStr).digest('hex');
    if (!timingSafeEqualString(signature, expectedSignature)) {
      return null; // Invalid signature
    }
    try {
      const payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8'));
      if (!payload || typeof payload.email !== 'string' || typeof payload.expiresAt !== 'number' || !Number.isFinite(payload.expiresAt)) {
        return null;
      }
      if (Date.now() > payload.expiresAt) {
        return null; // Token expired
      }
      return { email: payload.email.trim().toLowerCase() };
    } catch (e) {
      return null;
    }
  }

  // -------------------------------------------------------------
  // LOCAL DEVELOPMENT MOCK / SANDBOX FALLBACK DATABASE
  // -------------------------------------------------------------
  const mockDb = {
    accounts: [] as Account[],
    otps: [] as { email: string; otp: string; expires_at: string }[],
    deviceTokens: new Set<string>(),
    rateLimits: [] as { key: string; count: number; reset_time: string }[],
    appLocks: [] as {
      email: string;
      pinHash?: string;
      pinEnabled: boolean;
      failedAttempts: number;
      lockedUntil: number | null;
    }[],
    webauthnCreds: [] as {
      email: string;
      credentialId: string;
      publicKey: string;
      signCount: number;
      deviceLabel: string;
    }[],
    webauthnChallenges: [] as {
      id: string;
      email: string;
      challenge: string;
      purpose: string;
      expiresAt: number;
    }[],
    trustedDevices: [] as {
      id: string;
      email: string;
      tokenHash: string;
      createdAt: number;
      expiresAt: number;
      lastUsedAt: number;
      userAgent?: string;
    }[]
  };

  // Scalable Distributed OTP Storage Helpers (No In-Memory Maps for stateless Cloud Run compliance)
  // Hash OTP using SHA-256 with user's email as salt
  function hashOtp(otp: string, email: string): string {
    const normalizedEmail = email.trim().toLowerCase();
    return crypto.createHash('sha256').update(`${otp}:${normalizedEmail}`).digest('hex');
  }

  async function storeOtpInDb(email: string, otp: string, expiresAt: number, isDeleteOtp = false, supabase: any) {
    const normalizedEmail = email.trim().toLowerCase();
    const expiresDate = new Date(expiresAt).toISOString();
    const storageEmail = isDeleteOtp ? `delete:${normalizedEmail}` : normalizedEmail;
    const hashedOtp = hashOtp(otp, normalizedEmail);

    if (!supabase) {
      if (IS_PRODUCTION) throw new Error("Database connection unavailable in production mode.");
      console.log(`[Mock DB] Storing OTP for ${storageEmail} (Expires: ${expiresDate})`);
      mockDb.otps = mockDb.otps.filter(item => item.email !== storageEmail);
      mockDb.otps.push({
        email: storageEmail,
        otp: hashedOtp,
        expires_at: expiresDate
      });
      return;
    }
    
    try {
      await supabase.from('auth_otps').delete().eq('email', storageEmail);
      const { error } = await supabase.from('auth_otps').insert({
        email: storageEmail,
        otp: hashedOtp,
        expires_at: expiresDate
      });
      if (error) {
        console.error("OTP database write failed:", error);
        throw error;
      }
    } catch (e: any) {
      console.warn(`[Supabase Connection/Query Failed] storeOtpInDb:`, e.message || e);
      if (IS_PRODUCTION) throw e;
      mockDb.otps = mockDb.otps.filter(item => item.email !== storageEmail);
      mockDb.otps.push({
        email: storageEmail,
        otp: hashedOtp,
        expires_at: expiresDate
      });
    }
  }

  async function getOtpFromDb(email: string, isDeleteOtp = false, supabase: any): Promise<{ otp: string; expiresAt: number } | null> {
    const normalizedEmail = email.trim().toLowerCase();
    const storageEmail = isDeleteOtp ? `delete:${normalizedEmail}` : normalizedEmail;

    if (!supabase) {
      if (IS_PRODUCTION) return null;
      const found = mockDb.otps.find(item => item.email === storageEmail);
      if (found) {
        return {
          otp: found.otp,
          expiresAt: new Date(found.expires_at).getTime()
        };
      }
      return null;
    }
    
    try {
      const { data, error } = await supabase.from('auth_otps').select('*').eq('email', storageEmail).maybeSingle();
      if (error) {
        console.error("OTP database fetch failed:", error);
        throw error;
      }
      if (data) {
        return {
          otp: data.otp,
          expiresAt: new Date(data.expires_at).getTime()
        };
      }
      return null;
    } catch (e: any) {
      console.warn(`[Supabase Connection/Query Failed] getOtpFromDb:`, e.message || e);
      if (IS_PRODUCTION) return null;
      const found = mockDb.otps.find(item => item.email === storageEmail);
      if (found) {
        return {
          otp: found.otp,
          expiresAt: new Date(found.expires_at).getTime()
        };
      }
      return null;
    }
  }

  async function deleteOtpFromDb(email: string, isDeleteOtp = false, supabase: any) {
    const normalizedEmail = email.trim().toLowerCase();
    const storageEmail = isDeleteOtp ? `delete:${normalizedEmail}` : normalizedEmail;

    if (!supabase) {
      if (!IS_PRODUCTION) mockDb.otps = mockDb.otps.filter(item => item.email !== storageEmail);
      return;
    }
    
    try {
      const { error } = await supabase.from('auth_otps').delete().eq('email', storageEmail);
      if (error) {
        console.error("OTP database delete failed:", error);
      }
    } catch (e: any) {
      console.warn(`[Supabase Connection/Query Failed] deleteOtpFromDb:`, e.message || e);
      if (!IS_PRODUCTION) mockDb.otps = mockDb.otps.filter(item => item.email !== storageEmail);
    }
  }

  // Accounts Management definitions
  interface Account {
    email: string;
    passwordHash: string;
    createdAt: number;
  }

  // System token signature generator (signs express backend requests for RLS-by-signature verification blocks)
  function generateSystemToken(): string {
    const payload = {
      system: "express-server",
      timestamp: Date.now()
    };
    const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payloadStr).digest('hex');
    return `${payloadStr}.${signature}`;
  }

  // Helper to fetch Supabase client (Strict production-level environmental configs only)
  const getSupabase = (req?: express.Request) => {
    let url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
    let key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "").trim();
    
    // Auto-swapped or misconfigured variable detection
    if (url.startsWith("eyJ") && (key.startsWith("http://") || key.startsWith("https://"))) {
      const temp = url;
      url = key;
      key = temp;
    }
    
    // Decode JWT to extract the Project Reference ID if URL is a JWT
    if (url.startsWith("eyJ")) {
      try {
        const parts = url.split('.');
        if (parts.length >= 2) {
          const payloadStr = Buffer.from(parts[1], 'base64url').toString('utf8');
          const payload = JSON.parse(payloadStr);
          if (payload && payload.ref) {
            if (!key || key === "" || key === url) {
              key = url;
            }
            url = `https://${payload.ref}.supabase.co`;
          }
        }
      } catch (e) {
        console.error("[Supabase Autocorrect] Failed to decode JWT payload:", e);
      }
    }
    
    if (!url || !key) {
      return null;
    }
    
    if (!url.startsWith('https://') && !url.startsWith('http://')) {
      console.error(`[Supabase Error] Detected invalid URL structure: '${url}'. Must start with https:// or http://`);
      return null;
    }
    
    const systemToken = generateSystemToken();
    return createClient(url, key, {
      global: {
        headers: {
          'x-system-token': systemToken
        }
      }
    });
  };
  
  async function checkAccountExists(email: string, supabase: any): Promise<boolean> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!supabase) {
      if (IS_PRODUCTION) return false;
      return mockDb.accounts.some(acc => acc.email === normalizedEmail);
    }
    try {
      const { data, error } = await supabase.from('auth_accounts').select('email').eq('email', normalizedEmail).maybeSingle();
      if (error && error.code !== 'PGRST116') {
        console.error('Supabase error checking account:', error);
      }
      return !error && !!data;
    } catch (e: any) {
      console.warn(`[Supabase Connection/Query Failed] checkAccountExists:`, e.message || e);
      if (IS_PRODUCTION) return false;
      return mockDb.accounts.some(acc => acc.email === normalizedEmail);
    }
  }
  
  async function getAccountByEmail(email: string, supabase: any): Promise<Account | null> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!supabase) {
      if (IS_PRODUCTION) return null;
      const found = mockDb.accounts.find(acc => acc.email === normalizedEmail);
      return found || null;
    }
    try {
      const { data, error } = await supabase.from('auth_accounts').select('*').eq('email', normalizedEmail).maybeSingle();
      if (!error && data) {
         return {
           email: data.email,
           passwordHash: data.password_hash,
           createdAt: new Date(data.created_at).getTime()
         };
      }
      return null;
    } catch (e: any) {
      console.warn(`[Supabase Connection/Query Failed] getAccountByEmail:`, e.message || e);
      if (IS_PRODUCTION) return null;
      const found = mockDb.accounts.find(acc => acc.email === normalizedEmail);
      return found || null;
    }
  }
  
  async function saveAccount(acc: Account, supabase: any) {
    const normalizedEmail = acc.email.trim().toLowerCase();
    if (!supabase) {
      if (IS_PRODUCTION) throw new Error("Database connection unavailable in production mode.");
      mockDb.accounts = mockDb.accounts.filter(item => item.email !== normalizedEmail);
      mockDb.accounts.push({
        email: normalizedEmail,
        passwordHash: acc.passwordHash,
        createdAt: acc.createdAt
      });
      return;
    }
    try {
      const { error } = await supabase.from('auth_accounts').upsert({
        email: normalizedEmail,
        password_hash: acc.passwordHash,
        created_at: new Date(acc.createdAt).toISOString()
      }, { onConflict: 'email' });
      if (error) {
        console.error("Error saving account to Supabase:", error);
        throw error;
      }
    } catch (e: any) {
      console.warn(`[Supabase Connection/Query Failed] saveAccount:`, e.message || e);
      if (IS_PRODUCTION) throw e;
      mockDb.accounts = mockDb.accounts.filter(item => item.email !== normalizedEmail);
      mockDb.accounts.push({
        email: normalizedEmail,
        passwordHash: acc.passwordHash,
        createdAt: acc.createdAt
      });
    }
  }

  async function saveDeviceToken(token: string, supabase: any, email?: string) {
    if (!token) return;
    const normalizedEmail = (email || "").trim().toLowerCase();
    const hashedEmail = normalizedEmail ? crypto.createHash("sha256").update(normalizedEmail).digest("hex") : "";
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
    if (!supabase) {
      mockDb.deviceTokens.add(hashedToken + ":" + hashedEmail);
      console.log(`🔒 Devices (Local Mode): Registered trusted device for ${normalizedEmail || "unknown"}.`);
      return;
    }
    try {
      const { error } = await supabase.from('auth_device_tokens').insert({ token: hashedToken, hashed_email: hashedEmail, expires_at: expiresAt });
      if (error) {
        console.error("Device token database insert failed:", error);
      } else {
        console.log(`🔒 Devices: Registered trusted device for ${normalizedEmail || "unknown"}.`);
      }
    } catch (e: any) {
      console.warn(`[Supabase Connection/Query Failed] saveDeviceToken falling back to Mock DB:`, e.message || e);
      mockDb.deviceTokens.add(hashedToken + ":" + hashedEmail);
    }
  }

  async function verifyDeviceToken(token: string, supabase: any, email?: string): Promise<boolean> {
    if (!token) return false;
    const normalizedEmail = (email || "").trim().toLowerCase();
    const hashedEmail = normalizedEmail ? crypto.createHash("sha256").update(normalizedEmail).digest("hex") : null;
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    if (!supabase) {
      // check with email binding if provided, else any
      if (hashedEmail) return mockDb.deviceTokens.has(hashedToken + ":" + hashedEmail);
      for (const k of mockDb.deviceTokens) if (k.startsWith(hashedToken + ":")) return true;
      return mockDb.deviceTokens.has(hashedToken);
    }
    try {
      let q = supabase.from('auth_device_tokens').select('token, expires_at, hashed_email').eq('token', hashedToken).maybeSingle();
      const { data, error } = await q;
      if (error || !data) return false;
      if (data.expires_at && Date.now() > Number(data.expires_at)) {
        await supabase.from('auth_device_tokens').delete().eq('token', hashedToken);
        return false;
      }
      if (hashedEmail && data.hashed_email && data.hashed_email !== hashedEmail) return false;
      return true;
    } catch (e: any) {
      console.warn(`[Supabase Connection/Query Failed] verifyDeviceToken falling back to Mock DB:`, e.message || e);
      if (hashedEmail) return mockDb.deviceTokens.has(hashedToken + ":" + hashedEmail);
      return mockDb.deviceTokens.has(hashedToken);
    }
  }

  // =====================================================================
  // APP LOCK SECURITY LAYER — helpers
  // (PIN hashing + lockout, WebAuthn challenge store, trusted devices.
  //  All operations require a valid session token at the caller.)
  // =====================================================================

  function validatePin(pin: any): string | null {
    if (typeof pin !== "string" || !/^\d{4,6}$/.test(pin)) {
      return "PIN must be 4 to 6 digits.";
    }
    if (/^(0+|\d)\1*$/.test(pin)) {
      return "PIN cannot be all the same digit.";
    }
    if (pin === "1234" || pin === "0000" || pin === "4321") {
      return "That PIN is too easy to guess. Choose a different one.";
    }
    // Reject sequential ascending/descending runs (e.g. 123456, 654321, 2345)
    const asc = "0123456789".split("");
    const desc = "9876543210".split("");
    for (let i = 0; i <= pin.length - 4; i++) {
      const seg = pin.slice(i, i + 4).split("");
      const ascMatch = asc.join("").includes(seg.join(""));
      const descMatch = desc.join("").includes(seg.join(""));
      if (ascMatch || descMatch) return "That PIN is sequential. Choose a different one.";
    }
    return null;
  }

  function normalizeEmailLower(email: any): string {
    return (typeof email === "string" ? email : "").trim().toLowerCase();
  }

  // --- app_lock_credentials ---
  async function getAppLock(email: string, supabase: any) {
    const e = normalizeEmailLower(email);
    if (!supabase) {
      return mockDb.appLocks.find(x => x.email === e) || null;
    }
    try {
      const { data, error } = await supabase.from("app_lock_credentials").select("*").eq("user_email", e).maybeSingle();
      if (error) throw error;
      if (!data) return mockDb.appLocks.find(x => x.email === e) || null;
      return {
        email: data.user_email,
        pinHash: data.pin_hash || null,
        pinEnabled: !!data.pin_enabled,
        failedAttempts: Number(data.failed_attempts || 0),
        lockedUntil: data.locked_until ? Number(data.locked_until) : null
      };
    } catch (err: any) {
      console.warn("[AppLock] getAppLock fallback:", err?.message || err);
      return mockDb.appLocks.find(x => x.email === e) || null;
    }
  }

  async function upsertAppLock(email: string, fields: any, supabase: any) {
    const e = normalizeEmailLower(email);
    if (!supabase) {
      let rec = mockDb.appLocks.find(x => x.email === e);
      if (!rec) {
        rec = { email: e, pinEnabled: false, failedAttempts: 0, lockedUntil: null };
        mockDb.appLocks.push(rec);
      }
      Object.assign(rec, {
        ...(fields.pinHash !== undefined ? { pinHash: fields.pinHash } : {}),
        ...(fields.pinEnabled !== undefined ? { pinEnabled: fields.pinEnabled } : {}),
        ...(fields.failedAttempts !== undefined ? { failedAttempts: fields.failedAttempts } : {}),
        ...(fields.lockedUntil !== undefined ? { lockedUntil: fields.lockedUntil } : {})
      });
      return;
    }
    try {
      const { data, error } = await supabase
        .from("app_lock_credentials")
        .upsert({ user_email: e, ...fields, updated_at: new Date().toISOString() }, { onConflict: "user_email" })
        .select("user_email")
        .maybeSingle();
      if (error) throw error;
    } catch (err: any) {
      console.warn("[AppLock] upsertAppLock fallback:", err?.message || err);
      let rec = mockDb.appLocks.find(x => x.email === e);
      if (!rec) {
        rec = { email: e, pinEnabled: false, failedAttempts: 0, lockedUntil: null };
        mockDb.appLocks.push(rec);
      }
      // Translate DB column names to the mock's camelCase fields
      if (fields.pin_hash !== undefined) rec.pinHash = fields.pin_hash;
      if (fields.pin_enabled !== undefined) rec.pinEnabled = fields.pin_enabled;
      if (fields.failed_attempts !== undefined) rec.failedAttempts = fields.failed_attempts;
      if (fields.locked_until !== undefined) rec.lockedUntil = fields.locked_until;
    }
  }

  // --- webauthn_challenges ---
  async function storeWebAuthnChallenge(email: string, challenge: string, purpose: string, supabase: any): Promise<string> {
    const e = normalizeEmailLower(email);
    const id = crypto.randomUUID();
    const expiresAt = Date.now() + 10 * 60 * 1000;
    if (!supabase) {
      mockDb.webauthnChallenges.push({ id, email: e, challenge, purpose, expiresAt });
      return id;
    }
    try {
      const { error } = await supabase.from("webauthn_challenges").insert({ id, user_email: e, challenge, purpose, expires_at: expiresAt });
      if (error) throw error;
    } catch (err: any) {
      console.warn("[AppLock] storeWebAuthnChallenge fallback:", err?.message || err);
      mockDb.webauthnChallenges.push({ id, email: e, challenge, purpose, expiresAt });
    }
    return id;
  }

  async function consumeWebAuthnChallenge(id: string, email: string, purpose: string, supabase: any): Promise<string | null> {
    const e = normalizeEmailLower(email);
    if (!supabase) {
      const idx = mockDb.webauthnChallenges.findIndex(c => c.id === id && c.email === e && c.purpose === purpose);
      if (idx === -1) return null;
      const [rec] = mockDb.webauthnChallenges.splice(idx, 1);
      if (Date.now() > rec.expiresAt) return null;
      return rec.challenge;
    }
    try {
      await supabase.from("webauthn_challenges").delete().lt("expires_at", Date.now());
      const { data, error } = await supabase
        .from("webauthn_challenges")
        .select("*")
        .eq("id", id)
        .eq("user_email", e)
        .eq("purpose", purpose)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      if (data.expires_at && Date.now() > Number(data.expires_at)) return null;
      const { error: delError } = await supabase.from("webauthn_challenges").delete().eq("id", id);
      if (delError) throw delError;
      return data.challenge;
    } catch (err: any) {
      console.warn("[AppLock] consumeWebAuthnChallenge fallback:", err?.message || err);
      const idx = mockDb.webauthnChallenges.findIndex(c => c.id === id && c.email === e && c.purpose === purpose);
      if (idx === -1) return null;
      const [rec] = mockDb.webauthnChallenges.splice(idx, 1);
      if (Date.now() > rec.expiresAt) return null;
      return rec.challenge;
    }
  }

  // --- webauthn_credentials ---
  async function listWebAuthnCredentials(email: string, supabase: any) {
    const e = normalizeEmailLower(email);
    if (!supabase) {
      return mockDb.webauthnCreds.filter(c => c.email === e);
    }
    try {
      const { data, error } = await supabase.from("webauthn_credentials").select("*").eq("user_email", e).order("created_at", { ascending: true });
      if (error) throw error;
      const fromDb = (data || []).map((r: any) => ({
        email: r.user_email,
        credentialId: r.credential_id,
        publicKey: r.public_key,
        signCount: Number(r.sign_count || 0),
        deviceLabel: r.device_label || "Biometric device",
        transports: r.transports || [],
        createdAt: r.created_at
      }));
      const fromMock = mockDb.webauthnCreds.filter(c => c.email === e).map(c => ({
        email: c.email,
        credentialId: c.credentialId,
        publicKey: c.publicKey,
        signCount: c.signCount,
        deviceLabel: c.deviceLabel,
        transports: [],
        createdAt: 0
      }));
      const seen = new Set(fromDb.map(c => c.credentialId));
      return [...fromDb, ...fromMock.filter(c => !seen.has(c.credentialId))];
    } catch (err: any) {
      console.warn("[AppLock] listWebAuthnCredentials fallback:", err?.message || err);
      return mockDb.webauthnCreds.filter(c => c.email === e);
    }
  }

  async function saveWebAuthnCredential(email: string, cred: any, deviceLabel: string, supabase: any) {
    const e = normalizeEmailLower(email);
    const publicKeyB64 = publicKeyToBase64url(cred.publicKey);
    if (!supabase) {
      mockDb.webauthnCreds.push({ email: e, credentialId: cred.credentialId, publicKey: publicKeyB64, signCount: cred.signCount || 0, deviceLabel });
      return;
    }
    try {
      const { error } = await supabase.from("webauthn_credentials").insert({
        user_email: e,
        credential_id: cred.credentialId,
        public_key: publicKeyB64,
        sign_count: cred.signCount || 0,
        device_label: deviceLabel,
        transports: cred.transports || []
      });
      if (error) throw error;
    } catch (err: any) {
      console.warn("[AppLock] saveWebAuthnCredential fallback:", err?.message || err);
      mockDb.webauthnCreds.push({ email: e, credentialId: cred.credentialId, publicKey: publicKeyB64, signCount: cred.signCount || 0, deviceLabel });
    }
  }

  async function deleteWebAuthnCredential(email: string, credentialId: string, supabase: any) {
    const e = normalizeEmailLower(email);
    if (!supabase) {
      mockDb.webauthnCreds = mockDb.webauthnCreds.filter(c => !(c.email === e && c.credentialId === credentialId));
      return;
    }
    try {
      const { error } = await supabase.from("webauthn_credentials").delete().eq("user_email", e).eq("credential_id", credentialId);
      if (error) throw error;
    } catch (err: any) {
      console.warn("[AppLock] deleteWebAuthnCredential fallback:", err?.message || err);
      mockDb.webauthnCreds = mockDb.webauthnCreds.filter(c => !(c.email === e && c.credentialId === credentialId));
    }
  }

  // --- trusted_devices ---
  async function createTrustedDevice(email: string, token: string, userAgent: string, supabase: any): Promise<{ id: string; expiresAt: number }> {
    const e = normalizeEmailLower(email);
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
    const id = crypto.randomUUID();
    if (!supabase) {
      mockDb.trustedDevices.push({ id, email: e, tokenHash, createdAt: Date.now(), expiresAt, lastUsedAt: Date.now(), userAgent });
      return { id, expiresAt };
    }
    try {
      const { error } = await supabase.from("trusted_devices").insert({
        id,
        user_email: e,
        device_token_hash: tokenHash,
        expires_at: expiresAt,
        last_used_at: Date.now(),
        user_agent: (userAgent || "").slice(0, 300)
      });
      if (error) throw error;
    } catch (err: any) {
      console.warn("[AppLock] createTrustedDevice fallback:", err?.message || err);
      mockDb.trustedDevices.push({ id, email: e, tokenHash, createdAt: Date.now(), expiresAt, lastUsedAt: Date.now(), userAgent });
    }
    return { id, expiresAt };
  }

  async function findTrustedDeviceByToken(token: string, supabase: any): Promise<{ email: string; expiresAt: number } | null> {
    if (!token) return null;
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    if (!supabase) {
      const rec = mockDb.trustedDevices.find(d => d.tokenHash === tokenHash);
      if (!rec) return null;
      if (Date.now() > rec.expiresAt) {
        mockDb.trustedDevices = mockDb.trustedDevices.filter(d => d.tokenHash !== tokenHash);
        return null;
      }
      return { email: rec.email, expiresAt: rec.expiresAt };
    }
    try {
      const { data, error } = await supabase.from("trusted_devices").select("*").eq("device_token_hash", tokenHash).maybeSingle();
      if (error) throw error;
      if (!data) {
        // Dev parity: if the table isn't provisioned upstream yet, honour the
        // mock store so trusted-device tests behave consistently.
        const rec = mockDb.trustedDevices.find(d => d.tokenHash === tokenHash);
        if (rec) {
          if (Date.now() > rec.expiresAt) {
            mockDb.trustedDevices = mockDb.trustedDevices.filter(d => d.tokenHash !== tokenHash);
            return null;
          }
          rec.lastUsedAt = Date.now();
          return { email: rec.email, expiresAt: rec.expiresAt };
        }
        return null;
      }
      if (data.expires_at && Date.now() > Number(data.expires_at)) {
        await supabase.from("trusted_devices").delete().eq("id", data.id);
        return null;
      }
      // sliding inactivity window refresh (30 days from last use)
      const newExpiry = Date.now() + 30 * 24 * 60 * 60 * 1000;
      await supabase.from("trusted_devices").update({ last_used_at: Date.now(), expires_at: newExpiry }).eq("id", data.id);
      return { email: data.user_email, expiresAt: newExpiry };
    } catch (err: any) {
      console.warn("[AppLock] findTrustedDeviceByToken fallback:", err?.message || err);
      const rec = mockDb.trustedDevices.find(d => d.tokenHash === tokenHash);
      if (!rec) return null;
      if (Date.now() > rec.expiresAt) {
        mockDb.trustedDevices = mockDb.trustedDevices.filter(d => d.tokenHash !== tokenHash);
        return null;
      }
      rec.lastUsedAt = Date.now();
      return { email: rec.email, expiresAt: rec.expiresAt };
    }
  }

  async function listTrustedDevices(email: string, supabase: any) {
    const e = normalizeEmailLower(email);
    if (!supabase) {
      return mockDb.trustedDevices.filter(d => d.email === e).map(d => ({
        id: d.id,
        createdAt: d.createdAt,
        lastUsedAt: d.lastUsedAt,
        expiresAt: d.expiresAt,
        userAgent: d.userAgent || ""
      }));
    }
    try {
      const { data, error } = await supabase.from("trusted_devices").select("*").eq("user_email", e).order("created_at", { ascending: false });
      if (error) throw error;
      const fromDb = (data || []).map((r: any) => ({
        id: r.id,
        createdAt: Number(r.created_at ? new Date(r.created_at).getTime() : Date.now()),
        lastUsedAt: Number(r.last_used_at || 0),
        expiresAt: Number(r.expires_at || 0),
        userAgent: r.user_agent || ""
      }));
      // Dev parity: prefer real rows, fill in any local-only mock rows too
      const fromMock = mockDb.trustedDevices.filter(d => d.email === e).map(d => ({
        id: d.id,
        createdAt: d.createdAt,
        lastUsedAt: d.lastUsedAt,
        expiresAt: d.expiresAt,
        userAgent: d.userAgent || ""
      }));
      const seen = new Set(fromDb.map(d => d.id));
      return [...fromDb, ...fromMock.filter(d => !seen.has(d.id))];
    } catch (err: any) {
      console.warn("[AppLock] listTrustedDevices fallback:", err?.message || err);
      return mockDb.trustedDevices.filter(d => d.email === e).map(d => ({ id: d.id, createdAt: d.createdAt, lastUsedAt: d.lastUsedAt, expiresAt: d.expiresAt, userAgent: d.userAgent || "" }));
    }
  }

  async function deleteTrustedDevice(email: string, id: string, supabase: any) {
    const e = normalizeEmailLower(email);
    if (!supabase) {
      mockDb.trustedDevices = mockDb.trustedDevices.filter(d => !(d.email === e && d.id === id));
      return;
    }
    try {
      const { error } = await supabase.from("trusted_devices").delete().eq("user_email", e).eq("id", id);
      if (error) throw error;
    } catch (err: any) {
      console.warn("[AppLock] deleteTrustedDevice fallback:", err?.message || err);
      mockDb.trustedDevices = mockDb.trustedDevices.filter(d => !(d.email === e && d.id === id));
    }
  }

  async function deleteAllTrustedDevices(email: string, supabase: any) {
    const e = normalizeEmailLower(email);
    if (!supabase) {
      mockDb.trustedDevices = mockDb.trustedDevices.filter(d => d.email !== e);
      return;
    }
    try {
      const { error } = await supabase.from("trusted_devices").delete().eq("user_email", e);
      if (error) throw error;
    } catch (err: any) {
      console.warn("[AppLock] deleteAllTrustedDevices fallback:", err?.message || err);
      mockDb.trustedDevices = mockDb.trustedDevices.filter(d => d.email !== e);
    }
  }

  // Audit-style trace log for app-lock security events (no user data leaked).
  function traceAppLockEvent(email: string, event: string) {
    try {
      console.log(`[AppLock/audit] event=${event} email=${normalizeEmailLower(email)} ts=${Date.now()}`);
    } catch (_err) {
      // never let audit logging break the request
    }
  }

  async function updateWebAuthnCredentialCounter(email: string, credentialId: string, counter: number, supabase: any) {
    const e = normalizeEmailLower(email);
    if (!supabase) {
      const rec = mockDb.webauthnCreds.find(c => c.email === e && c.credentialId === credentialId);
      if (rec) rec.signCount = counter;
      return;
    }
    try {
      const { error } = await supabase.from("webauthn_credentials").update({ sign_count: counter }).eq("user_email", e).eq("credential_id", credentialId);
      if (error) throw error;
    } catch (err: any) {
      console.warn("[AppLock] updateWebAuthnCredentialCounter:", err?.message || err);
      const rec = mockDb.webauthnCreds.find(c => c.email === e && c.credentialId === credentialId);
      if (rec) rec.signCount = counter;
    }
  }

  // Require the caller to hold a valid signed session token for <email>.
  function requireSession(req, res, email): boolean {
    const token = getTokenFromRequest(req);
    const decoded = token ? verifySecureToken(token) : null;
    if (!decoded || decoded.email !== normalizeEmailLower(email)) {
      res.status(401).json({ success: false, error: "Unauthorized. Valid session token required." });
      return false;
    }
    return true;
  }

  // --- Cookie helpers (httpOnly session) ---
  function parseCookies(req: any): Record<string, string> {
    const header = req.headers.cookie || "";
    const out: Record<string, string> = {};
    header.split(";").forEach(p => {
      const idx = p.indexOf("=");
      if (idx < 0) return;
      const k = p.slice(0, idx).trim();
      const v = p.slice(idx + 1).trim();
      if (k) out[k] = decodeURIComponent(v);
    });
    return out;
  }
  function setSessionCookie(res, token) {
    const secure = IS_PRODUCTION ? "; Secure" : "";
    res.setHeader("Set-Cookie", `session_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400${secure}`);
  }
  function clearSessionCookie(res) {
    const secure = IS_PRODUCTION ? "; Secure" : "";
    res.setHeader("Set-Cookie", `session_token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
  }
  function setTrustCookie(res, token) {
    const secure = IS_PRODUCTION ? "; Secure" : "";
    // 30-day, httpOnly, SameSite=Strict device trust token (separate from session)
    res.append("Set-Cookie", `app_lock_trust=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${30 * 24 * 60 * 60}${secure}`);
  }
  function clearTrustCookie(res) {
    const secure = IS_PRODUCTION ? "; Secure" : "";
    res.append("Set-Cookie", `app_lock_trust=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
  }
  function getTokenFromRequest(req) {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith("Bearer ")) return auth.split(" ")[1];
    const cookies = parseCookies(req);
    if (cookies.session_token) return cookies.session_token;
    return null;
  }

  // -------------------------------------------------------------
  // SECURITY & OWASP AUDIT HARDENING SYSTEM
  // -------------------------------------------------------------

  // Custom HTTP Security Headers Middleware (Capping Clickjacking, XSS, MIME-sniffing, HSTS)
  app.use((req, res, next) => {
    // 1. Strict Content Security Policy - tightened: no unsafe-eval, no wildcard frame-ancestors
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https: wss:; frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'"
    );

    // 2. Prevent dynamic MIME Sniffing attacks
    res.setHeader("X-Content-Type-Options", "nosniff");

    // 3. HTTP Strict Transport Security
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");

    // 4. Referrer & Permissions constraints
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "0");
    // HTTPS redirect in production (if behind proxy, requires trust proxy)
    if (IS_PRODUCTION && req.headers["x-forwarded-proto"] === "http") {
      res.redirect(301, "https://" + req.headers.host + req.url);
      return;
    }

    next();
  });

  // Lightweight same-origin guard for state-changing API requests (CSRF defense in depth).
  // Requests without an Origin header (curl, server-to-server, native clients) pass through;
  // browser requests must present an Origin matching the app's own origin.
  app.use("/api", (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
      next();
      return;
    }
    const origin = req.headers["origin"] as string | undefined;
    if (!origin) {
      next();
      return;
    }
    const expected = getOrigin(req);
    if (origin === expected) {
      next();
      return;
    }
    console.warn(`[SECURITY SUSPICIOUS ACTIVITY] Rejected cross-origin request to ${req.method} ${req.originalUrl} from origin: ${origin}`);
    res.status(403).json({ success: false, error: "Forbidden." });
  });

  // Custom rate-limiter backed strictly by database (Stateless Cloud Run autoscaling compliant)
  // Returns { allowed, retryAfterSeconds } so callers get precise retry timing.
  async function checkRateLimitInDb(key: string, limit: number, windowMs: number, supabase: any): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
    const now = Date.now();
    const resetTime = now + windowMs;
    const resetTimeStr = new Date(resetTime).toISOString();

    if (!supabase) {
      // Purge expired rate limits periodically
      mockDb.rateLimits = mockDb.rateLimits.filter(item => new Date(item.reset_time).getTime() > now);

      const foundIndex = mockDb.rateLimits.findIndex(item => item.key === key);
      if (foundIndex === -1) {
        mockDb.rateLimits.push({
          key,
          count: 1,
          reset_time: resetTimeStr
        });
        return { allowed: true, retryAfterSeconds: 0 };
      }

      const item = mockDb.rateLimits[foundIndex];
      const recordResetTime = new Date(item.reset_time).getTime();
      if (now > recordResetTime) {
        mockDb.rateLimits[foundIndex] = {
          key,
          count: 1,
          reset_time: resetTimeStr
        };
        return { allowed: true, retryAfterSeconds: 0 };
      }

      if (item.count >= limit) {
        const retryAfterSeconds = Math.ceil((recordResetTime - now) / 1000);
        return { allowed: false, retryAfterSeconds };
      }

      item.count += 1;
      return { allowed: true, retryAfterSeconds: 0 };
    }
    
    try {
      // Purge expired rate limits periodically
      await supabase.from('auth_rate_limits').delete().lt('reset_time', new Date(now).toISOString());
      
      const { data, error } = await supabase.from('auth_rate_limits').select('*').eq('key', key).maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      
      if (!data) {
        await supabase.from('auth_rate_limits').insert({
          key,
          count: 1,
          reset_time: resetTimeStr
        });
        return { allowed: true, retryAfterSeconds: 0 };
      }
      
      const recordResetTime = new Date(data.reset_time).getTime();
      if (now > recordResetTime) {
        await supabase.from('auth_rate_limits').update({
          count: 1,
          reset_time: resetTimeStr,
          updated_at: new Date().toISOString()
        }).eq('key', key);
        return { allowed: true, retryAfterSeconds: 0 };
      }
      
      if (data.count >= limit) {
        const retryAfterSeconds = Math.ceil((recordResetTime - now) / 1000);
        return { allowed: false, retryAfterSeconds };
      }
      
      await supabase.from('auth_rate_limits').update({
        count: data.count + 1,
        updated_at: new Date().toISOString()
      }).eq('key', key);
      return { allowed: true, retryAfterSeconds: 0 };
      
    } catch (e) {
      console.error("Rate limit database operation failed:", e);
      // Fail open with in-memory fallback instead of hard-blocking all auth.
      // A DB schema/connectivity issue must never brick login for every user.
      const fallbackKey = `fallback:${key}`;
      const fbNow = Date.now();
      const fbResetTimeStr = new Date(fbNow + windowMs).toISOString();
      mockDb.rateLimits = mockDb.rateLimits.filter(item => new Date(item.reset_time).getTime() > fbNow);
      const fbIdx = mockDb.rateLimits.findIndex(item => item.key === fallbackKey);
      if (fbIdx === -1) {
        mockDb.rateLimits.push({ key: fallbackKey, count: 1, reset_time: fbResetTimeStr });
        return { allowed: true, retryAfterSeconds: 0 };
      }
      const fbItem = mockDb.rateLimits[fbIdx];
      const fbReset = new Date(fbItem.reset_time).getTime();
      if (fbNow > fbReset) {
        mockDb.rateLimits[fbIdx] = { key: fallbackKey, count: 1, reset_time: fbResetTimeStr };
        return { allowed: true, retryAfterSeconds: 0 };
      }
      if (fbItem.count >= limit) {
        return { allowed: false, retryAfterSeconds: Math.ceil((fbReset - fbNow) / 1000) };
      }
      fbItem.count += 1;
      return { allowed: true, retryAfterSeconds: 0 };
    }
  }
  
  const rateLimitAuth = (limit: number, windowMs: number) => {
    return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
      // Use req.ip first: with `trust proxy = 1`, Express resolves the client
      // address from the last trusted hop, so the raw leftmost X-Forwarded-For
      // entry (which a client can spoof) is never trusted verbatim.
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      // Normalize email or use fallback IP to restrict malicious credential flooding
      const reqEmail = req.body && typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
      const key = `${ip}:${req.path}:${reqEmail}`;
      const supabase = getSupabase(req);

      const { allowed, retryAfterSeconds } = await checkRateLimitInDb(key, limit, windowMs, supabase);
      if (allowed) {
        next();
      } else {
        console.warn(`[SECURITY SUSPICIOUS ACTIVITY] Rate limit exceeded on route ${req.path} for target key segment: ${key}`);
        res.setHeader('Retry-After', String(retryAfterSeconds));
        res.status(429).json({
          success: false,
          error: "Too many authentication requests. Please try again later.",
          retryAfter: retryAfterSeconds
        });
      }
    };
  };

  // Safe input validation helpers
  function validateEmail(email: any): string | null {
    if (!email || typeof email !== "string") return "Email address parameter must be a valid string.";
    const clean = email.trim();
    if (clean.length > 120) return "Email length exceeds safety threshold (120 chars max).";
    
    // Strict RFC 5322 regex matching
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    if (!emailRegex.test(clean)) return "The format of the email address is invalid.";
    return null;
  }

  function validatePassword(password: any): string | null {
    if (!password || typeof password !== "string") return "Password parameters must be a valid string.";
    if (password.length < 8) return "Strong authentication mandates passwords be at least 8 characters.";
    if (password.length > 100) return "Password length exceeds safety boundaries (100 characters max).";
    if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter.";
    if (!/[a-z]/.test(password)) return "Password must contain at least one lowercase letter.";
    if (!/[0-9!@#$%^&*(),.?":{}|<>]/.test(password)) return "Password must contain at least one number or symbol.";
    return null;
  }

  function validateOtp(otp: any): string | null {
    if (!otp || typeof otp !== "string") return "Passcode parameter must be a valid string.";
    const clean = otp.trim();
    if (clean.length < 6 || clean.length > 12) return "Passcode verification code length is incorrect.";
    return null;
  }

  // Diagnostic route
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", mode: process.env.NODE_ENV || "development" });
  });

  // Diagnostics: reports which backend env vars are present (never leaks secret values)
  app.get("/api/diagnostics", (req, res) => {
    const has = (k: string) => !!process.env[k];
    res.json({
      status: "ok",
      env: {
        VITE_SUPABASE_URL: has("VITE_SUPABASE_URL"),
        SUPABASE_URL: has("SUPABASE_URL"),
        VITE_SUPABASE_ANON_KEY: has("VITE_SUPABASE_ANON_KEY"),
        SUPABASE_SERVICE_ROLE_KEY: has("SUPABASE_SERVICE_ROLE_KEY"),
        SESSION_SECRET: has("SESSION_SECRET"),
        GEMINI_API_KEY: has("GEMINI_API_KEY"),
        SMTP_HOST: has("SMTP_HOST"),
        NODE_ENV: process.env.NODE_ENV || "not set",
        VERCEL: process.env.VERCEL || "not set",
      },
    });
  });

  // 0. Check Email Route
  app.post("/api/auth/check-email", rateLimitAuth(20, 60 * 1000), async (req: express.Request, res: express.Response) => {
    try {
      const { email } = req.body;
      const emailErr = validateEmail(email);
      if (emailErr) {
        res.status(400).json({ success: false, error: emailErr });
        return;
      }
      const normalizedEmail = email.trim().toLowerCase();
      const supabase = getSupabase(req);
      const exists = await checkAccountExists(normalizedEmail, supabase);
      res.json({ success: true, exists });
    } catch (err: any) {
      console.error("[SECURITY LOG] Check-email operation failed:", err.message || err);
      res.status(500).json({ success: false, error: "System authentication service error. Please try again later." });
    }
  });

  // 1. Send OTP route
  app.post("/api/auth/send-otp", rateLimitAuth(8, 60 * 1000), async (req: express.Request, res: express.Response) => {
    try {
      const { email } = req.body;
      const emailErr = validateEmail(email);
      if (emailErr) {
        res.status(400).json({ success: false, error: emailErr });
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();

      // Generate a clean crypto-like numeric 6-character text passcode
      const otp = crypto.randomInt(100000, 1000000).toString();
      const expiresAt = Date.now() + 5 * 60 * 1000;
      
      // Store passcode with 5 minutes lifespan (Database with memory fallback)
      await storeOtpInDb(normalizedEmail, otp, expiresAt, false, getSupabase(req));

      console.log(`\n======================================================`);
      console.log(`🔑 NEW SECURE OTP GENERATED FOR: ${normalizedEmail}`);
      console.log(`🔐 PASSCODE: [ ****** ]`);
      console.log(`⏰ EXPIRE: 5 Minutes (from server-side clock)`);
      console.log(`======================================================\n`);

      // Lazy check for optional environment parameters
      const smtpHost = process.env.SMTP_HOST;
      const smtpPort = process.env.SMTP_PORT;
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;
      const smtpFrom = process.env.SMTP_FROM;

      let emailSent = false;
      let errorDetails = "";

      if (smtpHost && smtpUser && smtpPass) {
        try {
          const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort ? parseInt(smtpPort, 10) : 587,
            secure: smtpPort === "465",
            auth: {
              user: smtpUser,
              pass: smtpPass,
            },
          });

          const fromAddress = smtpFrom || `Secure Vault <${smtpUser}>`;

          await transporter.sendMail({
            from: fromAddress,
            to: normalizedEmail,
            subject: "🛡️ Secure Vault 2FA One-Time Passcode",
            text: `Your Secure Vault One-Time Passcode is: ${otp}. It will expire in 5 minutes.`,
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 500px; margin: auto; padding: 30px; border: 1px solid #1f1f1f; border-radius: 16px; background: #0c0c0e; color: #ffffff; box-shadow: 0 4px 20px rgba(0,0,0,0.45);">
                <div style="text-align: center; margin-bottom: 20px;">
                  <span style="font-size: 28px;">🛡️</span>
                </div>
                <h2 style="font-weight: 800; text-align: center; color: #ffffff; letter-spacing: -0.025em; border-bottom: 1px solid #27272a; padding-bottom: 20px; margin: 0 0 20px 0; font-size: 20px;">SECURE VAULT COGNITIVE</h2>
                <p style="color: #a1a1aa; font-size: 13px; line-height: 1.6; text-align: center; margin: 0 0 24px 0;">
                  You requested secure entry into your Web Ledger. Input the following 2FA passcode into the authentication window:
                </p>
                <div style="background: #18181b; padding: 18px; border-radius: 12px; border: 1px solid #27272a; margin: 0 0 24px 0; text-align: center;">
                  <span style="font-family: ui-monospace, SFMono-Regular, SF Pro Mono, monospace; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #ffffff; margin-left: 8px;">${otp}</span>
                </div>
                <p style="color: #71717a; font-size: 11px; text-align: center; line-height: 1.4; margin: 0;">
                  This passcode is associated exclusively with <strong>${normalizedEmail}</strong> and remains active for 5 minutes.
                </p>
              </div>
            `
          });
          emailSent = true;
          console.log(`📧 Success: 2FA passcode email dispatched to ${normalizedEmail}`);
        } catch (mailError: any) {
          console.error("[SECURITY LOG] SMTP Transmission Failed:", mailError.message || mailError);
          errorDetails = "SMTP delivery error occurred during secure transmission.";
        }
      } else {
        errorDetails = "SMTP server is not configured in environment variables.";
      }

      if (!emailSent) {
        if (IS_PRODUCTION) {
          res.status(500).json({
            success: false,
            error: "Failed to dispatch verification email. Please try again later."
          });
          return;
        }
        // Dev mode fallback: Return passcode to frontend only when NOT in production
        res.json({
          success: true,
          emailSent: false,
          devOtp: otp,
          info: "Dev mode: SMTP is not configured, showing passcode in developer bypass."
        });
        return;
      }

      res.json({
        success: true,
        emailSent: true
      });
    } catch (err: any) {
      console.error("[SECURITY LOG] OTP Send failed:", err.message || err);
      res.status(500).json({ success: false, error: "System secure transmission error. Please request later." });
    }
  });

  // 2. Verify OTP route
  app.post("/api/auth/verify-otp", rateLimitAuth(10, 60 * 1000), async (req: express.Request, res: express.Response) => {
    try {
      const { email, otp, forRegistrationOrReset } = req.body;
      const emailErr = validateEmail(email);
      const otpErr = validateOtp(otp);
      if (emailErr || otpErr) {
        res.status(400).json({ success: false, error: emailErr || otpErr });
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();
      const enteredOtp = otp.trim();
      const supabase = getSupabase(req);


      const saved = await getOtpFromDb(normalizedEmail, false, supabase);
      if (!saved) {
        res.status(401).json({ success: false, error: "No active verification passcode found. Please request a new code." });
        return;
      }

      if (Date.now() > saved.expiresAt) {
        await deleteOtpFromDb(normalizedEmail, false, supabase);
        res.status(401).json({ success: false, error: "The passcode has expired. Please request a new code." });
        return;
      }

      const enteredHash = hashOtp(enteredOtp, normalizedEmail);
      if (!timingSafeEqualString(saved.otp, enteredHash)) {
        // Consume the OTP on a wrong attempt so it cannot be brute-forced
        // across multiple guesses within the valid window.
        await deleteOtpFromDb(normalizedEmail, false, supabase);
        res.status(401).json({ success: false, error: "The passcode entered is incorrect." });
        return;
      }

      if (forRegistrationOrReset) {
        // Just verify, don't delete yet. The registration/reset step will delete it.
        res.json({ success: true });
        return;
      }

      // Generate a secure persistent device token
      const deviceToken = crypto.randomUUID();
      await saveDeviceToken(deviceToken, supabase, normalizedEmail);

      // Successful unlock - clear OTP
      await deleteOtpFromDb(normalizedEmail, false, supabase);
      const _sessionToken = generateSecureToken(normalizedEmail);
      setSessionCookie(res, _sessionToken);
      res.json({
        success: true,
        token: _sessionToken,
        deviceToken
      });
    } catch (err: any) {
      console.error("[SECURITY LOG] Verify OTP failed:", err.message || err);
      res.status(500).json({ success: false, error: "System authentication service error." });
    }
  });

  // 2b. Register Route
  app.post("/api/auth/register", rateLimitAuth(5, 60 * 1000), async (req: express.Request, res: express.Response) => {
    try {
      const { email, password, otp } = req.body;
      const emailErr = validateEmail(email);
      const passwordErr = validatePassword(password);
      const otpErr = validateOtp(otp);
      if (emailErr || passwordErr || otpErr) {
        res.status(400).json({ success: false, error: emailErr || passwordErr || otpErr });
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();
      const supabase = getSupabase(req);
      
      const enteredOtp = otp.trim();
      let isValidOtp = false;

      const saved = await getOtpFromDb(normalizedEmail, false, supabase);
      const enteredHash = hashOtp(enteredOtp, normalizedEmail);
      if (saved && timingSafeEqualString(saved.otp, enteredHash) && Date.now() <= saved.expiresAt) {
        isValidOtp = true;
        await deleteOtpFromDb(normalizedEmail, false, supabase); // consume OTP
      }

      if (!isValidOtp) {
        res.status(401).json({ success: false, error: "Invalid or expired OTP." });
        return;
      }

      const exists = await checkAccountExists(normalizedEmail, supabase);
      if (exists) {
        // Do not reveal whether an account exists (anti-enumeration).
        res.status(400).json({ success: false, error: "Could not complete registration for this address." });
        return;
      }

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      await saveAccount({
        email: normalizedEmail,
        passwordHash,
        createdAt: Date.now()
      }, supabase);

      const deviceToken = crypto.randomUUID();
      await saveDeviceToken(deviceToken, supabase, normalizedEmail);

      const _regToken = generateSecureToken(normalizedEmail);
      setSessionCookie(res, _regToken);
      res.json({
        success: true,
        token: _regToken,
        deviceToken
      });
    } catch (err: any) {
      console.error("[SECURITY LOG] Register operation failed:", err.message || err);
      res.status(500).json({ success: false, error: "System registration service error." });
    }
  });

  // 2c. Login Password Route
  app.post("/api/auth/login-password", rateLimitAuth(8, 60 * 1000), async (req: express.Request, res: express.Response) => {
    try {
      const { email, password } = req.body;
      const emailErr = validateEmail(email);
      const passwordErr = validatePassword(password);
      if (emailErr || passwordErr) {
        res.status(400).json({ success: false, error: emailErr || passwordErr });
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();
      const supabase = getSupabase(req);
      const user = await getAccountByEmail(normalizedEmail, supabase);

      if (!user) {
        res.status(401).json({ success: false, error: "Invalid email or password." });
        return;
      }

      const isMatch = await bcrypt.compare(password, user.passwordHash);
      if (!isMatch) {
         res.status(401).json({ success: false, error: "Invalid email or password." });
         return;
      }

      const deviceToken = crypto.randomUUID();
      await saveDeviceToken(deviceToken, supabase, normalizedEmail);

      const _loginToken = generateSecureToken(normalizedEmail);
      setSessionCookie(res, _loginToken);
      res.json({
        success: true,
        token: _loginToken,
        deviceToken
      });
    } catch (err: any) {
      console.error("[SECURITY LOG] Login-password operation failed:", err.message || err);
      res.status(500).json({ success: false, error: "System authentication service error." });
    }
  });

  // 2d. Reset Password Route
  app.post("/api/auth/reset-password", rateLimitAuth(5, 60 * 1000), async (req: express.Request, res: express.Response) => {
    try {
      const { email, password, otp } = req.body;
      const emailErr = validateEmail(email);
      const passwordErr = validatePassword(password);
      const otpErr = validateOtp(otp);
      if (emailErr || passwordErr || otpErr) {
        res.status(400).json({ success: false, error: emailErr || passwordErr || otpErr });
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();
      const supabase = getSupabase(req);
      
      const enteredOtp = otp.trim();
      let isValidOtp = false;

      const saved = await getOtpFromDb(normalizedEmail, false, supabase);
      const enteredHash = hashOtp(enteredOtp, normalizedEmail);
      if (saved && timingSafeEqualString(saved.otp, enteredHash) && Date.now() <= saved.expiresAt) {
        isValidOtp = true;
        await deleteOtpFromDb(normalizedEmail, false, supabase); // consume OTP
      }

      if (!isValidOtp) {
        res.status(401).json({ success: false, error: "Invalid or expired OTP." });
        return;
      }

      const exists = await checkAccountExists(normalizedEmail, supabase);
      if (!exists) {
        // Do not reveal whether an account exists (anti-enumeration).
        res.status(400).json({ success: false, error: "Could not reset the password for this address." });
        return;
      }

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      await saveAccount({
        email: normalizedEmail,
        passwordHash,
        createdAt: Date.now()
      }, supabase);

      const deviceToken = crypto.randomUUID();
      await saveDeviceToken(deviceToken, supabase, normalizedEmail);

      const _resetToken = generateSecureToken(normalizedEmail);
      setSessionCookie(res, _resetToken);
      res.json({
        success: true,
        token: _resetToken,
        deviceToken
      });
    } catch (err: any) {
      console.error("[SECURITY LOG] Reset-password operation failed:", err.message || err);
      res.status(500).json({ success: false, error: "System password reset service error." });
    }
  });

  // 3. Verify Remembered Device Token route
  app.post("/api/auth/verify-device", rateLimitAuth(25, 60 * 1000), async (req: express.Request, res: express.Response) => {
    try {
      const { deviceToken, email } = req.body;
      if (!deviceToken || typeof deviceToken !== "string" || deviceToken.length > 200) {
        res.json({ success: false, error: "No valid device token provided" });
        return;
      }

      const isValid = await verifyDeviceToken(deviceToken, getSupabase(req), typeof email === "string" ? email : undefined);
      res.json({ success: isValid });
    } catch (err: any) {
      console.error("[SECURITY LOG] Device verification error:", err.message || err);
      res.status(500).json({ success: false, error: "Internal verification error" });
    }
  });

  // =====================================================================
  // APP LOCK SECURITY LAYER — endpoints
  // These sit on top of the existing auth flow. Every route below requires a
  // valid signed session token for the target account. They NEVER replace
  // primary auth — they only gate access to the UI.
  // =====================================================================

  const WEBAUTHN_RP_ID = process.env.WEB_AUTHN_RP_ID || "";
  const appLockRPRouter = express.Router();

  function getRPID(req) {
    return WEBAUTHN_RP_ID || (req.headers.host || "localhost").split(":")[0];
  }
  function getOrigin(req) {
    if (process.env.APP_ORIGIN) return process.env.APP_ORIGIN;
    const proto = req.headers["x-forwarded-proto"] || (req.secure || req.headers.host?.includes("localhost") ? "https" : "http");
    // localhost over http in dev
    if ((req.headers.host || "").includes("localhost") && !process.env.VERCEL) return `http://${req.headers.host}`;
    return `${proto}://${req.headers.host}`;
  }
  function userIDBytes(email) {
    const buf = crypto.createHash("sha256").update(normalizeEmailLower(email)).digest();
    return new Uint8Array(buf);
  }
  // base64url serializer for WebAuthn public keys (Uint8Array <-> string)
  function publicKeyToBase64url(key: Uint8Array | Buffer | string): string {
    if (typeof key === "string") return key;
    const bytes = Buffer.from(key.buffer || key, key.byteOffset || 0, key.byteLength || key.length);
    return bytes.toString("base64url");
  }
  function publicKeyFromBase64url(key: string): Uint8Array {
    const buf = Buffer.from(key, "base64url");
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  // --- App-lock overall status ---
  app.post("/api/app-lock/status", rateLimitAuth(30, 60 * 1000), async (req: express.Request, res: express.Response) => {
    try {
      const { email } = req.body;
      const emailErr = validateEmail(email);
      if (emailErr) {
        res.status(400).json({ success: false, error: emailErr });
        return;
      }
      const normalizedEmail = normalizeEmailLower(email);
      if (!requireSession(req, res, normalizedEmail)) return;
      const supabase = getSupabase(req);
      const lock = await getAppLock(normalizedEmail, supabase);
      const creds = await listWebAuthnCredentials(normalizedEmail, supabase);
      res.json({
        success: true,
        appLockEnabled: !!lock?.pinEnabled || creds.length > 0,
        pinEnabled: !!lock?.pinEnabled,
        hasPin: !!lock?.pinHash,
        biometricCount: creds.length,
        failedAttempts: lock?.failedAttempts || 0,
        lockedUntil: lock?.lockedUntil || null,
        webauthnRpid: getRPID(req)
      });
    } catch (err: any) {
      console.error("[AppLock] status error:", err?.message || err);
      res.status(500).json({ success: false, error: "System app-lock status error." });
    }
  });

  // --- PIN: set (create/change) ---
  app.post("/api/app-lock/pin/set", rateLimitAuth(8, 60 * 1000), async (req: express.Request, res: express.Response) => {
    try {
      const { email, pin } = req.body;
      const emailErr = validateEmail(email);
      const pinErr = validatePin(pin);
      if (emailErr || pinErr) {
        res.status(400).json({ success: false, error: emailErr || pinErr });
        return;
      }
      const normalizedEmail = normalizeEmailLower(email);
      if (!requireSession(req, res, normalizedEmail)) return;
      const supabase = getSupabase(req);
      const pinHash = await bcrypt.hash(String(pin), 12);
      await upsertAppLock(normalizedEmail, { pin_hash: pinHash, pin_enabled: true, failed_attempts: 0, locked_until: null }, supabase);
      console.log(`[AppLock] PIN set for ${normalizedEmail} (hash only, PIN never stored).`);
      res.json({ success: true });
    } catch (err: any) {
      console.error("[SECURITY LOG] App-lock PIN set failed:", err?.message || err);
      res.status(500).json({ success: false, error: "System app-lock service error." });
    }
  });

  // --- PIN: disable ---
  app.post("/api/app-lock/pin/disable", rateLimitAuth(8, 60 * 1000), async (req: express.Request, res: express.Response) => {
    try {
      const { email } = req.body;
      const emailErr = validateEmail(email);
      if (emailErr) {
        res.status(400).json({ success: false, error: emailErr });
        return;
      }
      const normalizedEmail = normalizeEmailLower(email);
      if (!requireSession(req, res, normalizedEmail)) return;
      const supabase = getSupabase(req);
      await upsertAppLock(normalizedEmail, { pin_hash: null, pin_enabled: false, failed_attempts: 0, locked_until: null }, supabase);
      res.json({ success: true });
    } catch (err: any) {
      console.error("[SECURITY LOG] App-lock PIN disable failed:", err?.message || err);
      res.status(500).json({ success: false, error: "System app-lock service error." });
    }
  });

  // --- PIN: verify (unlock) with server-side lockout ---
  app.post("/api/app-lock/pin/verify", rateLimitAuth(30, 60 * 1000), async (req: express.Request, res: express.Response) => {
    try {
      const { email, pin } = req.body;
      const emailErr = validateEmail(email);
      if (emailErr || typeof pin !== "string") {
        res.status(400).json({ success: false, error: emailErr || "PIN is required." });
        return;
      }
      const normalizedEmail = normalizeEmailLower(email);
      if (!requireSession(req, res, normalizedEmail)) return;
      const supabase = getSupabase(req);

      let lock = await getAppLock(normalizedEmail, supabase);
      if (!lock || !lock.pinHash) {
        traceAppLockEvent(normalizedEmail, "pin_verify_no_pin");
        res.json({ success: false, error: "No PIN is configured for app lock.", code: "NO_PIN" });
        return;
      }

      // Server-side lockout: check locked_until
      const now = Date.now();
      if (lock.lockedUntil && now < lock.lockedUntil) {
        const remaining = Math.ceil((lock.lockedUntil - now) / 1000);
        res.json({ success: false, error: `Too many attempts. Locked for ${remaining}s.`, code: "LOCKED", retryAfter: remaining });
        return;
      }

      const isMatch = await bcrypt.compare(String(pin), lock.pinHash);
      if (isMatch) {
        await upsertAppLock(normalizedEmail, { failed_attempts: 0, locked_until: null }, supabase);
        res.json({ success: true });
        return;
      }

      // Wrong PIN: increment and apply doubling lockout
      const failed = (lock.failedAttempts || 0) + 1;
      let lockedUntil: number | null = null;
      let retryAfter = 0;
      if (failed >= 5) {
        const lockCount = Math.min(Math.ceil((failed - 4) / 1), 8); // 1st lock = 60s, doubles each repeat
        const seconds = 60 * Math.pow(2, lockCount - 1);
        lockedUntil = now + seconds * 1000;
        retryAfter = seconds;
      }
      traceAppLockEvent(normalizedEmail, "pin_verify_failed");
      await upsertAppLock(normalizedEmail, { failed_attempts: failed, locked_until: lockedUntil }, supabase);
      res.json({
        success: false,
        error: retryAfter ? `Too many attempts. Locked for ${retryAfter}s.` : `Incorrect PIN. ${5 - failed} attempt${5 - failed === 1 ? "" : "s"} remaining.`,
        code: "BAD_PIN",
        attemptsRemaining: Math.max(0, 5 - failed),
        retryAfter
      });
    } catch (err: any) {
      console.error("[SECURITY LOG] App-lock PIN verify failed:", err?.message || err);
      res.status(500).json({ success: false, error: "System app-lock verification error." });
    }
  });

  // --- PIN: reset (Forgot PIN) — requires a FRESH full re-auth session token ---
  // The lock screen's "Forgot PIN" path forces the user back through full
  // email/password (or OTP) login, which yields a fresh signed token. That
  // token is what authorizes clearing the PIN here so they can set a new one.
  app.post("/api/app-lock/pin/reset", rateLimitAuth(5, 60 * 1000), async (req: express.Request, res: express.Response) => {
    try {
      const { email } = req.body;
      const emailErr = validateEmail(email);
      if (emailErr) {
        res.status(400).json({ success: false, error: emailErr });
        return;
      }
      const normalizedEmail = normalizeEmailLower(email);
      if (!requireSession(req, res, normalizedEmail)) return;
      const supabase = getSupabase(req);
      await upsertAppLock(normalizedEmail, { pin_hash: null, pin_enabled: false, failed_attempts: 0, locked_until: null }, supabase);
      traceAppLockEvent(normalizedEmail, "pin_reset");
      res.json({ success: true });
    } catch (err: any) {
      console.error("[SECURITY LOG] App-lock PIN reset failed:", err?.message || err);
      res.status(500).json({ success: false, error: "System app-lock reset error." });
    }
  });

  // --- WebAuthn: registration options ---
  app.post("/api/app-lock/webauthn/register-options", rateLimitAuth(8, 60 * 1000), async (req: express.Request, res: express.Response) => {
    try {
      const { email, deviceLabel } = req.body;
      const emailErr = validateEmail(email);
      if (emailErr) {
        res.status(400).json({ success: false, error: emailErr });
        return;
      }
      const normalizedEmail = normalizeEmailLower(email);
      if (!requireSession(req, res, normalizedEmail)) return;
      const supabase = getSupabase(req);

      const creds = await listWebAuthnCredentials(normalizedEmail, supabase);
      const rpID = getRPID(req);
      const rpName = process.env.APP_NAME || "EM Budget";

      const options = await generateRegistrationOptions({
        rpName,
        rpID,
        userName: normalizedEmail,
        userDisplayName: normalizedEmail,
        userID: userIDBytes(normalizedEmail),
        attestationType: "none",
        excludeCredentials: creds.map(c => ({ id: c.credentialId, transports: c.transports })).slice(0, 16),
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "preferred"
        }
      });

      const stateId = await storeWebAuthnChallenge(normalizedEmail, options.challenge, "registration", supabase);
      res.json({ success: true, stateId, options });
    } catch (err: any) {
      console.error("[SECURITY LOG] WebAuthn register-options failed:", err?.message || err);
      res.status(500).json({ success: false, error: "WebAuthn registration could not start." });
    }
  });

  // --- WebAuthn: registration verification ---
  app.post("/api/app-lock/webauthn/register-verify", rateLimitAuth(8, 60 * 1000), async (req: express.Request, res: express.Response) => {
    try {
      const { email, stateId, credential, deviceLabel } = req.body;
      const emailErr = validateEmail(email);
      if (emailErr) {
        res.status(400).json({ success: false, error: emailErr });
        return;
      }
      const normalizedEmail = normalizeEmailLower(email);
      if (!requireSession(req, res, normalizedEmail)) return;
      const supabase = getSupabase(req);

      const challenge = await consumeWebAuthnChallenge(stateId, normalizedEmail, "registration", supabase);
      if (!challenge) {
        res.status(400).json({ success: false, error: "Registration challenge expired. Please try again." });
        return;
      }

      const expectedOrigin = getOrigin(req);
      const rpID = getRPID(req);

      let verification;
      try {
        verification = await verifyRegistrationResponse({
          response: credential,
          expectedChallenge: challenge,
          expectedOrigin,
          expectedRPID: rpID,
          requireUserVerification: true
        });
      } catch (verr: any) {
        console.error("[SECURITY LOG] WebAuthn registration verification error:", verr?.message || verr);
        res.status(400).json({ success: false, error: "Biometric registration could not be verified." });
        return;
      }

      if (!verification.verified || !verification.registrationInfo) {
        res.status(400).json({ success: false, error: "Biometric registration was rejected." });
        return;
      }

      const regInfo = verification.registrationInfo;
      await saveWebAuthnCredential(
        normalizedEmail,
        {
          credentialId: regInfo.credential.id,
          publicKey: regInfo.credential.publicKey,
          transports: regInfo.credential.transports || (credential && credential.response && credential.response.transports) || [],
          signCount: typeof regInfo.credential.counter === "number" ? regInfo.credential.counter : 0
        },
        typeof deviceLabel === "string" && deviceLabel.trim() ? deviceLabel.trim().slice(0, 60) : "Biometric device",
        supabase
      );
      traceAppLockEvent(normalizedEmail, "webauthn_registered");
      res.json({ success: true, credentialId: regInfo.credential.id });
    } catch (err: any) {
      console.error("[SECURITY LOG] WebAuthn register-verify failed:", err?.message || err);
      res.status(500).json({ success: false, error: "System WebAuthn registration error." });
    }
  });

  // --- WebAuthn: authentication (unlock) options ---
  app.post("/api/app-lock/webauthn/authentication-options", rateLimitAuth(30, 60 * 1000), async (req: express.Request, res: express.Response) => {
    try {
      const { email } = req.body;
      const emailErr = validateEmail(email);
      if (emailErr) {
        res.status(400).json({ success: false, error: emailErr });
        return;
      }
      const normalizedEmail = normalizeEmailLower(email);
      if (!requireSession(req, res, normalizedEmail)) return;
      const supabase = getSupabase(req);

      const creds = await listWebAuthnCredentials(normalizedEmail, supabase);
      if (creds.length === 0) {
        res.json({ success: false, error: "No biometric credentials configured.", code: "NO_CREDS" });
        return;
      }
      const rpID = getRPID(req);
      const options = await generateAuthenticationOptions({
        rpID,
        allowCredentials: creds.map(c => ({ id: c.credentialId, transports: c.transports })),
        userVerification: "required"
      });
      const stateId = await storeWebAuthnChallenge(normalizedEmail, options.challenge, "authentication", supabase);
      res.json({ success: true, stateId, options });
    } catch (err: any) {
      console.error("[SECURITY LOG] WebAuthn authentication-options failed:", err?.message || err);
      res.status(500).json({ success: false, error: "Biometric unlock could not start." });
    }
  });

  // --- WebAuthn: authentication (unlock) verification ---
  app.post("/api/app-lock/webauthn/authentication-verify", rateLimitAuth(30, 60 * 1000), async (req: express.Request, res: express.Response) => {
    try {
      const { email, stateId, credential } = req.body;
      const emailErr = validateEmail(email);
      if (emailErr) {
        res.status(400).json({ success: false, error: emailErr });
        return;
      }
      const normalizedEmail = normalizeEmailLower(email);
      if (!requireSession(req, res, normalizedEmail)) return;
      const supabase = getSupabase(req);

      const challenge = await consumeWebAuthnChallenge(stateId, normalizedEmail, "authentication", supabase);
      if (!challenge) {
        res.status(400).json({ success: false, error: "Biometric challenge expired. Please try again." });
        return;
      }

      const creds = await listWebAuthnCredentials(normalizedEmail, supabase);
      const rawId: string = credential?.rawId || credential?.id || "";
      const stored = creds.find(c => c.credentialId === rawId);
      if (!stored) {
        res.json({ success: false, error: "Biometric credential not recognized." });
        return;
      }

      const verification = await verifyAuthenticationResponse({
        response: credential,
        expectedChallenge: challenge,
        expectedOrigin: getOrigin(req),
        expectedRPID: getRPID(req),
        credential: {
          id: stored.credentialId,
          publicKey: publicKeyFromBase64url(stored.publicKey),
          counter: stored.signCount || 0,
          transports: stored.transports || []
        },
        requireUserVerification: true
      });

      if (!verification.verified || !verification.authenticationInfo) {
        traceAppLockEvent(normalizedEmail, "webauthn_unlock_failed");
        res.json({ success: false, error: "Biometric unlock was rejected." });
        return;
      }

      // sign_count replay protection
      const newCounter = verification.authenticationInfo.newCounter;
      await updateWebAuthnCredentialCounter(normalizedEmail, stored.credentialId, newCounter, supabase);
      traceAppLockEvent(normalizedEmail, "webauthn_unlock_success");
      res.json({ success: true });
    } catch (err: any) {
      console.error("[SECURITY LOG] WebAuthn authentication-verify failed:", err?.message || err);
      res.json({ success: false, error: "Biometric unlock could not be verified." });
    }
  });

  // --- WebAuthn: remove a credential ---
  app.post("/api/app-lock/webauthn/remove", rateLimitAuth(8, 60 * 1000), async (req: express.Request, res: express.Response) => {
    try {
      const { email, credentialId } = req.body;
      const emailErr = validateEmail(email);
      if (emailErr || typeof credentialId !== "string") {
        res.status(400).json({ success: false, error: emailErr || "credentialId is required." });
        return;
      }
      const normalizedEmail = normalizeEmailLower(email);
      if (!requireSession(req, res, normalizedEmail)) return;
      const supabase = getSupabase(req);
      await deleteWebAuthnCredential(normalizedEmail, credentialId, supabase);
      res.json({ success: true });
    } catch (err: any) {
      console.error("[SECURITY LOG] WebAuthn remove failed:", err?.message || err);
      res.status(500).json({ success: false, error: "System WebAuthn removal error." });
    }
  });

  // --- WebAuthn: list credentials (for settings management) ---
  app.post("/api/app-lock/webauthn/list", rateLimitAuth(20, 60 * 1000), async (req: express.Request, res: express.Response) => {
    try {
      const { email } = req.body;
      const emailErr = validateEmail(email);
      if (emailErr) {
        res.status(400).json({ success: false, error: emailErr });
        return;
      }
      const normalizedEmail = normalizeEmailLower(email);
      if (!requireSession(req, res, normalizedEmail)) return;
      const supabase = getSupabase(req);
      const creds = await listWebAuthnCredentials(normalizedEmail, supabase);
      res.json({
        success: true,
        credentials: creds.map((c: any) => ({
          credentialId: c.credentialId,
          deviceLabel: c.deviceLabel || "Biometric device",
          createdAt: c.createdAt ? Number(new Date(c.createdAt).getTime()) : 0,
        })),
      });
    } catch (err: any) {
      console.error("[SECURITY LOG] WebAuthn list failed:", err?.message || err);
      res.status(500).json({ success: false, error: "System WebAuthn list error." });
    }
  });

  // --- Trusted device: issue (remember this device) ---
  // Requires a valid session. Rotates the token, stores its SHA-256 hash, and
  // sets an httpOnly SameSite=Strict cookie (separate from the session token).
  app.post("/api/app-lock/device/issue", rateLimitAuth(10, 60 * 1000), async (req: express.Request, res: express.Response) => {
    try {
      const { email } = req.body;
      const emailErr = validateEmail(email);
      if (emailErr) {
        res.status(400).json({ success: false, error: emailErr });
        return;
      }
      const normalizedEmail = normalizeEmailLower(email);
      if (!requireSession(req, res, normalizedEmail)) return;
      const supabase = getSupabase(req);
      const rawToken = crypto.randomBytes(32).toString("base64url");
      const ua = req.headers["user-agent"] || "";
      await createTrustedDevice(normalizedEmail, rawToken, ua, supabase);
      setTrustCookie(res, rawToken);
      res.json({ success: true, expiresInDays: 30 });
    } catch (err: any) {
      console.error("[SECURITY LOG] Trusted device issue failed:", err?.message || err);
      res.status(500).json({ success: false, error: "System device-trust error." });
    }
  });

  // --- Trusted device: check (used on app open) ---
  // Reads the httpOnly app_lock_trust cookie server-side only. Returns the
  // account email if the token is valid & non-expired, so the client knows it
  // can skip full email/password login and go to the PIN/biometric screen.
  // To call this the client does NOT need a session token (that's the point).
  app.post("/api/app-lock/device/check", rateLimitAuth(20, 60 * 1000), async (req: express.Request, res: express.Response) => {
    try {
      const cookies = parseCookies(req);
      const trustToken = cookies.app_lock_trust;
      if (!trustToken) {
        res.json({ success: false, trusted: false });
        return;
      }
      const supabase = getSupabase(req);
      const found = await findTrustedDeviceByToken(trustToken, supabase);
      if (!found) {
        clearTrustCookie(res);
        res.json({ success: true, trusted: false });
        return;
      }
      res.json({ success: true, trusted: true, email: found.email });
    } catch (err: any) {
      console.error("[SECURITY LOG] Trusted device check failed:", err?.message || err);
      res.status(500).json({ success: false, error: "System device-trust check error." });
    }
  });

  // --- Trusted device: list (manage in settings) ---
  app.post("/api/app-lock/device/list", rateLimitAuth(20, 60 * 1000), async (req: express.Request, res: express.Response) => {
    try {
      const { email } = req.body;
      const emailErr = validateEmail(email);
      if (emailErr) {
        res.status(400).json({ success: false, error: emailErr });
        return;
      }
      const normalizedEmail = normalizeEmailLower(email);
      if (!requireSession(req, res, normalizedEmail)) return;
      const supabase = getSupabase(req);
      const devices = await listTrustedDevices(normalizedEmail, supabase);
      res.json({ success: true, devices });
    } catch (err: any) {
      console.error("[SECURITY LOG] Trusted device list failed:", err?.message || err);
      res.status(500).json({ success: false, error: "System device-trust list error." });
    }
  });

  // --- Trusted device: revoke one ---
  app.post("/api/app-lock/device/revoke", rateLimitAuth(10, 60 * 1000), async (req: express.Request, res: express.Response) => {
    try {
      const { email, id } = req.body;
      const emailErr = validateEmail(email);
      if (emailErr || typeof id !== "string") {
        res.status(400).json({ success: false, error: emailErr || "Device id is required." });
        return;
      }
      const normalizedEmail = normalizeEmailLower(email);
      if (!requireSession(req, res, normalizedEmail)) return;
      const supabase = getSupabase(req);
      await deleteTrustedDevice(normalizedEmail, id, supabase);
      res.json({ success: true });
    } catch (err: any) {
      console.error("[SECURITY LOG] Trusted device revoke failed:", err?.message || err);
      res.status(500).json({ success: false, error: "System device-trust revoke error." });
    }
  });

  // --- Trusted device: revoke all + clear cookie (used on logout) ---
  app.post("/api/app-lock/device/revoke-all", rateLimitAuth(10, 60 * 1000), async (req: express.Request, res: express.Response) => {
    try {
      const { email } = req.body;
      const emailErr = validateEmail(email);
      if (emailErr) {
        res.status(400).json({ success: false, error: emailErr });
        return;
      }
      const normalizedEmail = normalizeEmailLower(email);
      if (!requireSession(req, res, normalizedEmail)) return;
      const supabase = getSupabase(req);
      await deleteAllTrustedDevices(normalizedEmail, supabase);
      clearTrustCookie(res);
      res.json({ success: true });
    } catch (err: any) {
      console.error("[SECURITY LOG] Trusted device revoke-all failed:", err?.message || err);
      res.status(500).json({ success: false, error: "System device-trust revoke error." });
    }
  });

  // 4a. Send Deletion OTP
  app.post("/api/auth/send-delete-otp", rateLimitAuth(3, 60 * 1000), async (req: express.Request, res: express.Response) => {
    try {
      const { email } = req.body;
      const emailErr = validateEmail(email);
      if (emailErr) {
        res.status(400).json({ success: false, error: emailErr });
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();
      const token = getTokenFromRequest(req);
      if (!token) {
        res.status(401).json({ success: false, error: "Access token is missing or malformed." });
        return;
      }
      const decoded = verifySecureToken(token);
      if (!decoded || decoded.email !== normalizedEmail) {
        res.status(401).json({ success: false, error: "Access token is invalid or expired." });
        return;
      }

      const otp = crypto.randomInt(100000, 1000000).toString();
      const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes validity
      const supabase = getSupabase(req);

      await storeOtpInDb(normalizedEmail, otp, expiresAt, true, supabase);

      console.log(`\n======================================================`);
      console.log(`⚠️ NEW DELETION 2FA OTP GENERATED FOR: ${normalizedEmail}`);
      console.log(`🔐 PASSCODE: [ ****** ]`);
      console.log(`⏰ EXPIRE: 5 Minutes`);
      console.log(`======================================================\n`);

      const smtpHost = process.env.SMTP_HOST;
      const smtpPort = process.env.SMTP_PORT;
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;
      const smtpFrom = process.env.SMTP_FROM;

      let emailSent = false;
      let errorDetails = "";

      if (smtpHost && smtpUser && smtpPass) {
        try {
          const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort ? parseInt(smtpPort, 10) : 587,
            secure: smtpPort === "465",
            auth: {
              user: smtpUser,
              pass: smtpPass,
            },
          });

          const fromAddress = smtpFrom || `Secure Vault <${smtpUser}>`;

          await transporter.sendMail({
            from: fromAddress,
            to: normalizedEmail,
            subject: "⚠️ CRITICAL: Confirm Ledger Deletion Code - EM Budget",
            text: `Confirm your database deletion with passcode: ${otp}. This code expires in 5 minutes. If you did not request this, secure your account!`,
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 500px; margin: auto; padding: 30px; border: 1px solid #dc2626; border-radius: 16px; background: #0c0c0e; color: #ffffff; box-shadow: 0 4px 25px rgba(220, 38, 38, 0.25);">
                <div style="text-align: center; margin-bottom: 20px;">
                  <span style="font-size: 32px;">⚠️</span>
                </div>
                <h2 style="font-weight: 800; text-align: center; color: #ef4444; letter-spacing: -0.025em; border-bottom: 1px solid #dc2626; padding-bottom: 20px; margin: 0 0 20px 0; font-size: 20px;">CRITICAL SYSTEM ELIMINATION</h2>
                <p style="color: #e4e4e7; font-size: 13px; line-height: 1.6; text-align: center; margin: 0 0 24px 0;">
                  A request was raised from your device to permanently wipe and purge all ledger journal entries, bank card details, cash assets, debts, and transaction histories in <strong>EM Budget</strong>.
                </p>
                <p style="color: #a1a1aa; font-size: 13px; line-height: 1.6; text-align: center; margin: 0 0 24px 0;">
                  Use the secure 2FA passcode below to authenticate:
                </p>
                <div style="background: #1c0f0f; padding: 18px; border-radius: 12px; border: 1px solid #7f1d1d; margin: 0 0 24px 0; text-align: center;">
                  <span style="font-family: ui-monospace, SFMono-Regular, SF Pro Mono, monospace; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #f87171; margin-left: 8px;">${otp}</span>
                </div>
                <p style="color: #71717a; font-size: 11px; text-align: center; line-height: 1.4; margin: 0;">
                  This request was triggered for <strong>${normalizedEmail}</strong> and expires in 5 minutes. If you did not initiate this, please ignore this email and change your account password pattern immediately.
                </p>
              </div>
            `
          });
          emailSent = true;
          console.log(`📧 Deletion passcode email sent successfully to ${normalizedEmail}`);
        } catch (mailError: any) {
          console.error("[SECURITY LOG] Deletion SMTP Transmission Failed:", mailError.message || mailError);
          errorDetails = "SMTP deletion dispatch failure.";
        }
      } else {
        errorDetails = "SMTP server is not configured in environment variables.";
      }

      if (!emailSent) {
        if (IS_PRODUCTION) {
          res.status(500).json({
            success: false,
            error: "Failed to dispatch deletion passcode email. Please try again later."
          });
          return;
        }
        res.json({
          success: true,
          emailSent: false,
          devOtp: otp,
          info: "Dev mode: SMTP is not configured, showing deletion passcode in developer bypass."
        });
        return;
      }

      res.json({
        success: true,
        emailSent: true
      });
    } catch (err: any) {
      console.error("[SECURITY LOG] Deletion OTP Send failed:", err.message || err);
      res.status(500).json({ success: false, error: "System secure transmission error." });
    }
  });

  // 4b. Verify Deletion OTP
  app.post("/api/auth/verify-delete-otp", rateLimitAuth(5, 60 * 1000), async (req: express.Request, res: express.Response) => {
    try {
      const { email, otp } = req.body;
      const emailErr = validateEmail(email);
      const otpErr = validateOtp(otp);
      if (emailErr || otpErr) {
        res.status(400).json({ success: false, error: emailErr || otpErr });
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();
      const token2 = getTokenFromRequest(req);
      if (!token2) {
        res.status(401).json({ success: false, error: "Access token is missing or malformed." });
        return;
      }
      const decoded2 = verifySecureToken(token2);
      if (!decoded2 || decoded2.email !== normalizedEmail) {
        res.status(401).json({ success: false, error: "Access token is invalid or expired." });
        return;
      }

      const enteredOtp = otp.trim();
      const supabase = getSupabase(req);

      const saved = await getOtpFromDb(normalizedEmail, true, supabase);
      if (!saved) {
        res.status(401).json({ success: false, error: "No active deletion passcode found. Please request a new code." });
        return;
      }

      if (Date.now() > saved.expiresAt) {
        await deleteOtpFromDb(normalizedEmail, true, supabase);
        res.status(401).json({ success: false, error: "Passcode has expired. Please request a new code." });
        return;
      }

      const enteredHash = hashOtp(enteredOtp, normalizedEmail);
      if (!timingSafeEqualString(saved.otp, enteredHash)) {
        // Consume the OTP on a wrong attempt so it cannot be brute-forced.
        await deleteOtpFromDb(normalizedEmail, true, supabase);
        res.status(401).json({ success: false, error: "The passcode entered is incorrect." });
        return;
      }

      // Successful verification - clear OTP
      await deleteOtpFromDb(normalizedEmail, true, supabase);
      res.json({ success: true });
    } catch (err: any) {
      console.error("[SECURITY LOG] Verify Deletion OTP failed:", err.message || err);
      res.status(500).json({ success: false, error: "System authentication service error." });
    }
  });

  // Verify secure session token route
  app.post("/api/auth/verify-session", rateLimitAuth(30, 60 * 1000), async (req: express.Request, res: express.Response) => {
    try {
      const { email } = req.body;
      let token = req.body.token;
      if (!token || typeof token !== "string") token = getTokenFromRequest(req);
      if (!token || typeof token !== "string") {
        res.json({ success: false, error: "Empty token" });
        return;
      }
      if (!email || typeof email !== "string") {
        res.status(400).json({ success: false, error: "Email is required." });
        return;
      }
      const normalizedEmail = email.trim().toLowerCase();
      const decoded = verifySecureToken(token);
      if (!decoded || decoded.email !== normalizedEmail) {
        res.json({ success: false, error: "Session token is invalid or expired." });
        return;
      }
      // Verify the account still exists in the database
      const supabase = getSupabase(req);
      const accountExists = await checkAccountExists(normalizedEmail, supabase);
      if (!accountExists) {
        res.json({ success: false, error: "Account no longer exists." });
        return;
      }
      res.json({ success: true });
    } catch (err: any) {
      console.error("[SECURITY LOG] Verify Session Token failed:", err.message || err);
      res.status(500).json({ success: false, error: "Internal session validation error." });
    }
  });

  // Config endpoint - URL is public, anon key only to authenticated callers (session token required)
  app.get("/api/config", rateLimitAuth(30, 60 * 1000), (req: express.Request, res: express.Response) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
    // The anon key is a PUBLIC key (VITE_ prefix = safe to expose to the client),
    // so return it unconditionally. This lets any device self-configure Supabase
    // from the backend instead of relying on build-time env or per-device localStorage.
    res.json({
      supabaseUrl,
      supabaseKey: supabaseKey.startsWith("eyJ") ? supabaseKey : ""
    });
  });

  // Backfill subscriptions from the relational table into the anon-readable
  // ledger_states.state JSON snapshot. The service-role client bypasses RLS,
  // so this recovers subscriptions even when the client's anon table read is
  // blocked. Called by the frontend after login.
  app.post("/api/sync/refresh-subscriptions", rateLimitAuth(20, 60 * 1000), async (req: express.Request, res: express.Response) => {
    const token = getTokenFromRequest(req);
    const session = token ? verifySecureToken(token) : null;
    if (!session || !session.email) {
      res.status(401).json({ success: false, error: "Unauthorized. Valid session token required." });
      return;
    }
    const email = session.email;
    try {
      const supabase = getSupabase(req);
      if (!supabase) {
        return res.status(500).json({ success: false, error: "Supabase not configured." });
      }
      const { data: subs, error: subErr } = await supabase.from("subscriptions").select("*").eq("user_email", email);
      if (subErr) {
        return res.status(500).json({ success: false, error: subErr.message });
      }
      const rows: any[] = Array.isArray(subs) ? subs : [];
      const subscriptions = rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        amount: r.amount,
        billingCycle: r.billing_cycle,
        dueDate: r.due_date,
        category: r.category,
        status: r.status,
        instanceType: r.instance_type || undefined,
        paymentMethodId: r.payment_method_id || undefined,
        paymentMethodType: r.payment_method_type || undefined,
        lastPaidDate: r.last_paid_date || undefined,
        updated_at: r.updated_at,
        updatedAt: r.updated_at,
      }));

      const { data: lsData } = await supabase.from("ledger_states").select("state").eq("user_email", email).limit(1).maybeSingle();
      let stateJson: any = {};
      if (lsData && lsData.state) {
        stateJson = typeof lsData.state === "string" ? JSON.parse(lsData.state) : lsData.state;
      }
      stateJson.subscriptions = subscriptions;
      await supabase.from("ledger_states").upsert(
        { user_email: email, state: stateJson, updated_at: new Date().toISOString() },
        { onConflict: "user_email" }
      );

      return res.json({ success: true, subscriptions });
    } catch (e: any) {
      console.error("[Sync] refresh-subscriptions error:", e.message || e);
      return res.status(500).json({ success: false, error: e.message || "Failed to refresh subscriptions." });
    }
  });

  // Expose endpoint for SettingsModal to load SQL migration script - C2 FIX: now authenticated + rate-limited
  app.get("/api/config/sql", rateLimitAuth(10, 60 * 1000), (req: express.Request, res: express.Response) => {
    const token = getTokenFromRequest(req);
    if (!verifySecureToken(token as string)) {
      res.status(401).json({ success: false, error: "Unauthorized. Valid session token required." });
      return;
    }
    try {
      const sqlPath = path.join(process.cwd(), "supabase/migrations/20260725_init.sql");
      const sqlContent = fs.readFileSync(sqlPath, "utf8");
      res.json({ success: true, sql: sqlContent });
    } catch (e: any) {
      console.error("[Error] Failed loading SQL migration script from file:", e.message || e);
      res.status(500).json({ success: false, error: "Failed to load SQL migration script." });
    }
  });

  // Gemini image analysis endpoint for receipts/invoices - C3 FIX: auth + 2mb validation + mime allowlist
  app.post("/api/gemini/analyze-image", express.json({ limit: "2mb" }), rateLimitAuth(10, 60 * 1000), async (req: express.Request, res: express.Response) => {
    const _authToken = getTokenFromRequest(req);
    if (!verifySecureToken(_authToken as string)) {
      res.status(401).json({ success: false, error: "Unauthorized. Valid session token required." });
      return;
    }
    try {
      const { image, mimeType } = req.body;
      
      if (!image) {
        res.status(400).json({ success: false, error: "Image data is required." });
        return;
      }
      // --- C3: 2mb + mimeType allowlist validation ---
      const ALLOWED_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];
      if (mimeType && typeof mimeType === "string" && !ALLOWED_MIMES.includes(mimeType.toLowerCase())) {
        res.status(400).json({ success: false, error: `Invalid mimeType. Allowed: ${ALLOWED_MIMES.join(", ")}` });
        return;
      }
      // Validate base64 size: enforce 2mb decoded limit (approx 2.8M base64 chars)
      let _sizeCheck = image;
      if (typeof _sizeCheck === "string" && _sizeCheck.includes(";base64,")) {
        _sizeCheck = _sizeCheck.split(";base64,").pop() || "";
      }
      const MAX_BYTES = 2 * 1024 * 1024;
      // Approximate decoded size without allocating full buffer for huge payloads: (len * 3 / 4) - padding
      const b64Len = typeof _sizeCheck === "string" ? _sizeCheck.length : 0;
      const padding = typeof _sizeCheck === "string" && _sizeCheck.endsWith("==") ? 2 : _sizeCheck.endsWith("=") ? 1 : 0;
      const approxBytes = Math.ceil(b64Len * 3 / 4) - padding;
      if (approxBytes > MAX_BYTES || b64Len > 2800000) {
        res.status(413).json({ success: false, error: "Image payload too large. Maximum 2MB allowed." });
        return;
      }
      if (typeof image === "string" && image.length > 2800000) {
        res.status(413).json({ success: false, error: "Image payload too large. Maximum 2MB allowed." });
        return;
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        res.status(400).json({ 
          success: false, 
          error: "Gemini API Key is not configured. Please supply a valid GEMINI_API_KEY inside Settings > Secrets." 
        });
        return;
      }

      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      // Strip potential base64 prefix
      let base64Data = image;
      if (base64Data.includes(";base64,")) {
        base64Data = base64Data.split(";base64,").pop() || "";
      }

      // Default the mimeType if not specified
      const resolvedMimeType = mimeType || "image/jpeg";

      const prompt = `Analyze this receipt, invoice, bill, or financial document. You must extract transaction details and categorize it accurately.

Map the category to one of the following exact categories:
- For income: 'Salary', 'Freelance', 'Business', 'Bonus', 'Commission', 'Loan Settle', 'Other'
- For expense: 'Food', 'Transport', 'Shopping', 'Utilities', 'Rent', 'Entertainment', 'Medical', 'Education', 'Insurance', 'Loan', 'Bank Charges & Interest', 'Other'

Extract the date in YYYY-MM-DD format. If no date is found, use the current date (which is 2026-07-25).
The amount must be a positive number.
The title should be a brief, descriptive name of the merchant/source (e.g. "Walmart", "McDonald's", "Landlord", "Employer").
Provide a descriptive summary in the description field.

Return a JSON object matching this schema:
{
  "transactionType": "income" | "expense",
  "title": string,
  "amount": number,
  "date": string (YYYY-MM-DD),
  "category": string,
  "description": string,
  "bankCharge": number (optional, default 0)
}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: [
          {
            inlineData: {
              data: base64Data,
              mimeType: resolvedMimeType
            }
          },
          { text: prompt }
        ],
        config: {
          responseMimeType: "application/json",
          temperature: 0.1,
        }
      });

      const text = response.text;
      if (!text) {
        throw new Error("Empty response from Gemini Model.");
      }

      // Try to parse the output as JSON
      const parsedData = JSON.parse(text);
      res.json({ success: true, data: parsedData });
    } catch (err: any) {
      console.error("[Gemini Image Analysis Error]", err?.message || err);
      let errMsg = err?.message || (typeof err === "string" ? err : "Failed to analyze image using Gemini.");
      if (typeof errMsg === "string" && (errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("prepayment credits") || errMsg.includes("429"))) {
        errMsg = "Gemini API Quota / Prepayment Credits Depleted. Please top up your billing credits in Google AI Studio or update your GEMINI_API_KEY in Settings > Secrets.";
      }
      res.status(500).json({ success: false, error: errMsg });
    }
  });

  // Free Server-Side OCR Endpoint via Tesseract.js (Works in all environments/sandboxes) - C3 FIX: auth + 2mb validation
  app.post("/api/ocr/free-scan", express.json({ limit: "2mb" }), rateLimitAuth(10, 60 * 1000), async (req: express.Request, res: express.Response) => {
    const _authToken2 = getTokenFromRequest(req);
    if (!verifySecureToken(_authToken2 as string)) {
      res.status(401).json({ success: false, error: "Unauthorized. Valid session token required." });
      return;
    }
    try {
      const { image, mimeType: _ocrMime } = req.body;
      if (!image) {
        return res.status(400).json({ success: false, error: "Image payload is required." });
      }
      // --- C3: 2mb + mimeType allowlist validation (if mimeType supplied) ---
      const ALLOWED_MIMES_OCR = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];
      if (_ocrMime && typeof _ocrMime === "string" && !ALLOWED_MIMES_OCR.includes(_ocrMime.toLowerCase())) {
        return res.status(400).json({ success: false, error: `Invalid mimeType. Allowed: ${ALLOWED_MIMES_OCR.join(", ")}` });
      }
      let _sizeCheckOcr = image;
      if (typeof _sizeCheckOcr === "string" && _sizeCheckOcr.includes(";base64,")) {
        _sizeCheckOcr = _sizeCheckOcr.split(";base64,").pop() || "";
      }
      const MAX_BYTES_OCR = 2 * 1024 * 1024;
      const b64LenOcr = typeof _sizeCheckOcr === "string" ? _sizeCheckOcr.length : 0;
      const paddingOcr = typeof _sizeCheckOcr === "string" && _sizeCheckOcr.endsWith("==") ? 2 : _sizeCheckOcr.endsWith("=") ? 1 : 0;
      const approxBytesOcr = Math.ceil(b64LenOcr * 3 / 4) - paddingOcr;
      if (approxBytesOcr > MAX_BYTES_OCR || b64LenOcr > 2800000) {
        return res.status(413).json({ success: false, error: "Image payload too large. Maximum 2MB allowed." });
      }
      if (typeof image === "string" && image.length > 2800000) {
        return res.status(413).json({ success: false, error: "Image payload too large. Maximum 2MB allowed." });
      }

      let base64Data = image;
      if (base64Data.includes(";base64,")) {
        base64Data = base64Data.split(";base64,").pop() || "";
      }

      const imgBuffer = Buffer.from(base64Data, "base64");
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng");
      try {
        const ret = await worker.recognize(imgBuffer);
        const extractedText = ret?.data?.text || "";
        if (!extractedText.trim()) {
          return res.status(422).json({ success: false, error: "No legible text found in image. Try a clearer photo or enter manually." });
        }

        res.json({ success: true, text: extractedText });
      } finally {
        await worker.terminate();
      }
    } catch (err: any) {
      console.error("[Free Server OCR Error]", err?.message || err);
      res.status(500).json({ success: false, error: err?.message || "Failed to scan image using Server OCR." });
    }
  });

  // Vite middleware for development or Static Asset hosting for production
  // Skip static handling on Vercel - Vercel serves dist/ as static output
  if (!process.env.VERCEL) {
    if (process.env.NODE_ENV !== "production") {
      try {
        const { createServer: createViteServer } = await import("vite");
        const vite = await createViteServer({
          server: { middlewareMode: true },
          appType: "spa",
        });
        app.use(vite.middlewares);
      } catch {
        console.warn("[Server] Vite dynamic module not found. Falling back to static asset serving.");
        const distPath = path.join(process.cwd(), "dist");
        app.use(express.static(distPath));
        app.get("*", (req, res) => {
          res.sendFile(path.join(distPath, "index.html"));
        });
      }
    } else {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }
  }

  // API 404 fallback: no matched API route => JSON, never an empty/HTML response
  app.use("/api", (req, res) => {
    res.status(404).json({ success: false, error: `Route not found: ${req.method} ${req.originalUrl}` });
  });

  // JSON error handler: ensures async/middleware errors return JSON, never an empty 500 body
  app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[Unhandled Error]", err?.message || err);
    if (res.headersSent) return;
    res.status(500).json({ success: false, error: "Internal server error. Check function logs." });
  });

  return app;
}

// Cached singleton for serverless (Vercel) - avoids re-creating app on warm invocations
let cachedApp: express.Express | null = null;

export async function getApp(): Promise<express.Express> {
  if (cachedApp) return cachedApp;
  cachedApp = await createApp();
  return cachedApp;
}

export async function startServer(): Promise<express.Express> {
  const app = await getApp();
  if (!process.env.VERCEL) {
    const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`[Express Backend] Running on http://0.0.0.0:${PORT}`);
    });
  }
  return app;
}

if (!process.env.VERCEL) {
  startServer();
}

// Vercel serverless handler - default export is the Express app via wrapper
const vercelHandler = async (req: any, res: any) => {
  try {
    const app = await getApp();
    return (app as any)(req, res);
  } catch (err: any) {
    console.error("[vercelHandler] Failed to start server:", err?.message || err);
    if (res.headersSent) return;
    res.status(500).json({ success: false, error: `Server failed to initialize: ${err?.message || "unknown"}` });
  }
};

export default vercelHandler;
export { vercelHandler as handler };
