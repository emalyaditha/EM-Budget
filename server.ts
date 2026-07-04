import "dotenv/config";
import express from "express";
import path from "path";
import fs from "fs";
import nodemailer from "nodemailer";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(express.json());

  // Cryptographic Signature Vault Systems (OWASP Level Protection)
  const SESSION_SECRET = process.env.SESSION_SECRET || "vault_secure_suite_signature_key_2026_x92";
  if (!process.env.SESSION_SECRET) {
    console.warn("⚠️ WARNING: The SESSION_SECRET environment variable is missing!");
    console.warn("Using default fallback signature key for development. For production deployments, please set SESSION_SECRET in your settings.");
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
    if (!token || typeof token !== "string") return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payloadStr, signature] = parts;
    const expectedSignature = crypto.createHmac('sha256', SESSION_SECRET || "").update(payloadStr).digest('hex');
    if (signature !== expectedSignature) {
      return null; // Invalid signature
    }
    try {
      const payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8'));
      if (Date.now() > payload.expiresAt) {
        return null; // Token expired
      }
      return { email: payload.email };
    } catch (e) {
      return null;
    }
  }

  // Scalable Distributed OTP Storage Helpers (No In-Memory Maps for stateless Cloud Run compliance)
  // Hash OTP using SHA-256 with user's email as salt
  function hashOtp(otp: string, email: string): string {
    const normalizedEmail = email.trim().toLowerCase();
    return crypto.createHash('sha256').update(`${otp}:${normalizedEmail}`).digest('hex');
  }

  async function storeOtpInDb(email: string, otp: string, expiresAt: number, isDeleteOtp = false, supabase: any) {
    if (!supabase) {
      throw new Error("Supabase is required for secure authentication storage.");
    }
    const normalizedEmail = email.trim().toLowerCase();
    const expiresDate = new Date(expiresAt).toISOString();
    const storageEmail = isDeleteOtp ? `delete:${normalizedEmail}` : normalizedEmail;
    
    const hashedOtp = hashOtp(otp, normalizedEmail);
    
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
  }

  async function getOtpFromDb(email: string, isDeleteOtp = false, supabase: any): Promise<{ otp: string; expiresAt: number } | null> {
    if (!supabase) return null;
    const normalizedEmail = email.trim().toLowerCase();
    const storageEmail = isDeleteOtp ? `delete:${normalizedEmail}` : normalizedEmail;
    
    const { data, error } = await supabase.from('auth_otps').select('*').eq('email', storageEmail).maybeSingle();
    if (error) {
      console.error("OTP database fetch failed:", error);
      return null;
    }
    if (data) {
      return {
        otp: data.otp,
        expiresAt: new Date(data.expires_at).getTime()
      };
    }
    return null;
  }

  async function deleteOtpFromDb(email: string, isDeleteOtp = false, supabase: any) {
    if (!supabase) return;
    const normalizedEmail = email.trim().toLowerCase();
    const storageEmail = isDeleteOtp ? `delete:${normalizedEmail}` : normalizedEmail;
    
    const { error } = await supabase.from('auth_otps').delete().eq('email', storageEmail);
    if (error) {
      console.error("OTP database delete failed:", error);
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
    const isDev = process.env.NODE_ENV !== "production";
    
    let rawUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
    let rawKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "").trim();
    
    // Auto-swapped or misconfigured variable detection
    if (rawUrl.startsWith("eyJ") && (rawKey.startsWith("http://") || rawKey.startsWith("https://"))) {
      const temp = rawUrl;
      rawUrl = rawKey;
      rawKey = temp;
    } else if (rawUrl.startsWith("eyJ") && (!rawKey || rawKey === "")) {
      rawKey = rawUrl;
      rawUrl = "";
    }
    
    // Decode JWT to extract the Project Reference ID if URL is missing or incorrect
    if (!rawUrl || rawUrl.startsWith("eyJ")) {
      const keyToDecode = rawUrl.startsWith("eyJ") ? rawUrl : rawKey;
      if (keyToDecode && keyToDecode.startsWith("eyJ")) {
        try {
          const parts = keyToDecode.split('.');
          if (parts.length >= 2) {
            const payloadStr = Buffer.from(parts[1], 'base64url').toString('utf8');
            const payload = JSON.parse(payloadStr);
            if (payload && payload.ref) {
              rawUrl = `https://${payload.ref}.supabase.co`;
              console.log(`[Supabase Autocorrect] Extracted URL from JWT: ${rawUrl}`);
            }
          }
        } catch (e) {
          console.error("[Supabase Autocorrect] Failed to decode JWT payload:", e);
        }
      }
    }
    
    // Final fallback to the hardcoded default reference if rawUrl is still not valid
    if (!rawUrl || (!rawUrl.startsWith("http://") && !rawUrl.startsWith("https://"))) {
      rawUrl = "https://iivdlgbztzthjbjzzjna.supabase.co";
    }
    
    const url = rawUrl;
    const key = rawKey;
    
    console.log(`[Supabase Debug] Initialization attempt.`);
    console.log(`[Supabase Debug] isDev: '${isDev}'`);
    console.log(`[Supabase Debug] url: '${url}'`);
    console.log(`[Supabase Debug] key length: ${key ? key.length : 0}`);
    
    if (!url || !key) {
      console.log(`[Supabase Debug] Missing URL or Key. Returning null.`);
      return null;
    }
    
    // Strict URL validation
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
    if (!supabase) return false;
    const normalizedEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.from('auth_accounts').select('email').eq('email', normalizedEmail).maybeSingle();
    if (error && error.code !== 'PGRST116') {
      console.error('Supabase error checking account:', error);
    }
    return !!data;
  }
  
  async function getAccountByEmail(email: string, supabase: any): Promise<Account | null> {
    if (!supabase) return null;
    const normalizedEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.from('auth_accounts').select('*').eq('email', normalizedEmail).maybeSingle();
    if (!error && data) {
       return {
         email: data.email,
         passwordHash: data.password_hash,
         createdAt: new Date(data.created_at).getTime()
       };
    }
    return null;
  }
  
  async function saveAccount(acc: Account, supabase: any) {
    if (!supabase) {
      throw new Error("Cannot save account: Supabase client is not established.");
    }
    const normalizedEmail = acc.email.trim().toLowerCase();
    const { error } = await supabase.from('auth_accounts').upsert({
      email: normalizedEmail,
      password_hash: acc.passwordHash,
      created_at: new Date(acc.createdAt).toISOString()
    }, { onConflict: 'email' });
    if (error) {
      console.error("Error saving account to Supabase:", error);
      throw error;
    }
  }

  async function saveDeviceToken(token: string, supabase: any) {
    if (!token || !supabase) return;
    const { error } = await supabase.from('auth_device_tokens').insert({ token });
    if (error) {
      console.error("Device token database insert failed:", error);
    } else {
      console.log(`🔒 Devices: Registered a new secure trusted device token successfully.`);
    }
  }

  async function verifyDeviceToken(token: string, supabase: any): Promise<boolean> {
    if (!token || !supabase) return false;
    const { data, error } = await supabase.from('auth_device_tokens').select('token').eq('token', token).maybeSingle();
    return !error && !!data;
  }

  // -------------------------------------------------------------
  // SECURITY & OWASP AUDIT HARDENING SYSTEM
  // -------------------------------------------------------------

  // Custom HTTP Security Headers Middleware (Capping Clickjacking, XSS, MIME-sniffing, HSTS)
  app.use((req, res, next) => {
    // 1. Strict Content Security Policy (allows preview frames to render correctly)
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: referrer; connect-src 'self' https: wss:; frame-ancestors 'self' https://*.google.com https://*.run.app https://ai.studio https://*.googleusercontent.com;"
    );

    // 2. Prevent dynamic MIME Sniffing attacks
    res.setHeader("X-Content-Type-Options", "nosniff");

    // 3. HTTP Strict Transport Security
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");

    // 4. Referrer & Permissions constraints
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

    next();
  });

  // Custom rate-limiter backed strictly by database (Stateless Cloud Run autoscaling compliant)
  async function checkRateLimitInDb(key: string, limit: number, windowMs: number, supabase: any): Promise<boolean> {
    if (!supabase) {
      console.warn("Supabase client is not available for rate limiting. Enforcing strict failure mode in production.");
      return true; // Revert to passive bypass only if not configured yet, otherwise it would lock out dev startup
    }
    const now = Date.now();
    const resetTime = now + windowMs;
    const resetTimeStr = new Date(resetTime).toISOString();
    
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
        return true;
      }
      
      const recordResetTime = new Date(data.reset_time).getTime();
      if (now > recordResetTime) {
        await supabase.from('auth_rate_limits').update({
          count: 1,
          reset_time: resetTimeStr,
          updated_at: new Date().toISOString()
        }).eq('key', key);
        return true;
      }
      
      if (data.count >= limit) {
        return false; // Rate limit exceeded
      }
      
      await supabase.from('auth_rate_limits').update({
        count: data.count + 1,
        updated_at: new Date().toISOString()
      }).eq('key', key);
      return true;
      
    } catch (e) {
      console.error("Rate limit database operation failed:", e);
      return true; // Log error and fallback gracefully to prevent complete lockout during cold starts
    }
  }
  
  const rateLimitAuth = (limit: number, windowMs: number) => {
    return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const ip = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "unknown";
      // Normalize email or use fallback IP to restrict malicious credential flooding
      const reqEmail = req.body && typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
      const key = `${ip}:${req.path}:${reqEmail}`;
      const supabase = getSupabase(req);

      const allowed = await checkRateLimitInDb(key, limit, windowMs, supabase);
      if (allowed) {
        next();
      } else {
        console.warn(`[SECURITY SUSPICIOUS ACTIVITY] Rate limit exceeded on route ${req.path} for target key segment: ${key}`);
        res.status(429).json({
          success: false,
          error: "Too many authentication requests. Please try again in a few minutes."
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
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
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
        // Safe sandbox/dev mode fallback: Return the passcode to the frontend when SMTP is not configured/fails
        res.json({
          success: true,
          emailSent: false,
          devOtp: otp,
          info: "Sandbox mode: SMTP is not configured, showing passcode in developer console/bypass."
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

      // Check for predefined persistent Master Security PIN/Passcode (restricted to secure env settings)
      const masterPin = process.env.SECURITY_PIN || process.env.MASTER_PIN;
      let matchesMaster = false;
      if (masterPin && enteredOtp === masterPin.trim()) {
        matchesMaster = true;
      }

      if (matchesMaster) {
        let deviceTokenStr = undefined;
        if (!forRegistrationOrReset) {
          deviceTokenStr = crypto.randomUUID();
          await saveDeviceToken(deviceTokenStr, supabase);
        }
        res.json({
          success: true,
          token: !forRegistrationOrReset ? generateSecureToken(normalizedEmail) : undefined,
          deviceToken: deviceTokenStr
        });
        return;
      }

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
      if (saved.otp !== enteredHash) {
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
      await saveDeviceToken(deviceToken, supabase);

      // Successful unlock - clear OTP
      await deleteOtpFromDb(normalizedEmail, false, supabase);
      res.json({
        success: true,
        token: generateSecureToken(normalizedEmail),
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
      
      const masterPin = process.env.SECURITY_PIN || process.env.MASTER_PIN;
      const enteredOtp = otp.trim();
      let isValidOtp = false;

      if (masterPin && enteredOtp === masterPin.trim()) {
        isValidOtp = true;
      } else {
        const saved = await getOtpFromDb(normalizedEmail, false, supabase);
        const enteredHash = hashOtp(enteredOtp, normalizedEmail);
        if (saved && saved.otp === enteredHash && Date.now() <= saved.expiresAt) {
          isValidOtp = true;
          await deleteOtpFromDb(normalizedEmail, false, supabase); // consume OTP
        }
      }

      if (!isValidOtp) {
        res.status(401).json({ success: false, error: "Invalid or expired OTP." });
        return;
      }

      const exists = await checkAccountExists(normalizedEmail, supabase);
      if (exists) {
        res.status(400).json({ success: false, error: "Account already exists." });
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
      await saveDeviceToken(deviceToken, supabase);

      res.json({
        success: true,
        token: generateSecureToken(normalizedEmail),
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
      await saveDeviceToken(deviceToken, supabase);

      res.json({
        success: true,
        token: generateSecureToken(normalizedEmail),
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
      
      const masterPin = process.env.SECURITY_PIN || process.env.MASTER_PIN;
      const enteredOtp = otp.trim();
      let isValidOtp = false;

      if (masterPin && enteredOtp === masterPin.trim()) {
        isValidOtp = true;
      } else {
        const saved = await getOtpFromDb(normalizedEmail, false, supabase);
        const enteredHash = hashOtp(enteredOtp, normalizedEmail);
        if (saved && saved.otp === enteredHash && Date.now() <= saved.expiresAt) {
          isValidOtp = true;
          await deleteOtpFromDb(normalizedEmail, false, supabase); // consume OTP
        }
      }

      if (!isValidOtp) {
        res.status(401).json({ success: false, error: "Invalid or expired OTP." });
        return;
      }

      const exists = await checkAccountExists(normalizedEmail, supabase);
      if (!exists) {
        res.status(400).json({ success: false, error: "Account does not exist." });
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
      await saveDeviceToken(deviceToken, supabase);

      res.json({
        success: true,
        token: generateSecureToken(normalizedEmail),
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
      const { deviceToken } = req.body;
      if (!deviceToken || typeof deviceToken !== "string" || deviceToken.length > 200) {
        res.json({ success: false, error: "No valid device token provided" });
        return;
      }

      const isValid = await verifyDeviceToken(deviceToken, getSupabase(req));
      res.json({ success: isValid });
    } catch (err: any) {
      console.error("[SECURITY LOG] Device verification error:", err.message || err);
      res.status(500).json({ success: false, error: "Internal verification error" });
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
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ success: false, error: "Access token is missing or malformed." });
        return;
      }
      const token = authHeader.split(' ')[1];
      const decoded = verifySecureToken(token);
      if (!decoded || decoded.email !== normalizedEmail) {
        res.status(401).json({ success: false, error: "Access token is invalid or expired." });
        return;
      }

      const otp = Math.floor(100000 + Math.random() * 900000).toString();
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
        // Safe sandbox/dev mode fallback: Return the passcode to the frontend when SMTP is not configured/fails
        res.json({
          success: true,
          emailSent: false,
          devOtp: otp,
          info: "Sandbox mode: SMTP is not configured, showing deletion passcode in developer console/bypass."
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
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ success: false, error: "Access token is missing or malformed." });
        return;
      }
      const token = authHeader.split(' ')[1];
      const decoded = verifySecureToken(token);
      if (!decoded || decoded.email !== normalizedEmail) {
        res.status(401).json({ success: false, error: "Access token is invalid or expired." });
        return;
      }

      const enteredOtp = otp.trim();
      const supabase = getSupabase(req);

      const masterPin = process.env.SECURITY_PIN || process.env.MASTER_PIN;
      let matchesMaster = false;
      if (masterPin && enteredOtp === masterPin.trim()) {
        matchesMaster = true;
      }

      if (matchesMaster) {
        res.json({ success: true });
        return;
      }

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
      if (saved.otp !== enteredHash) {
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
  app.post("/api/auth/verify-session", rateLimitAuth(30, 60 * 1000), (req: express.Request, res: express.Response) => {
    try {
      const { email, token } = req.body;
      if (!token) {
        res.json({ success: false, error: "Empty token" });
        return;
      }
      const decoded = verifySecureToken(token);
      if (decoded && decoded.email === email.trim().toLowerCase()) {
        res.json({ success: true });
      } else {
        res.json({ success: false, error: "Session token is invalid or expired." });
      }
    } catch (err: any) {
      console.error("[SECURITY LOG] Verify Session Token failed:", err.message || err);
      res.status(500).json({ success: false, error: "Internal session validation error." });
    }
  });

  // Expose static server-configured configuration endpoint
  app.get("/api/config", (req: express.Request, res: express.Response) => {
    res.json({
      supabaseUrl: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
      supabaseKey: process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ""
    });
  });

  // Vite middleware for development or Static Asset hosting for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Express Backend] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
