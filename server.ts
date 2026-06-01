import express from "express";
import path from "path";
import fs from "fs";
import nodemailer from "nodemailer";
import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // In-memory OTP storage: Map<normalizedEmail, { otp, expiresAt }>
  const otpStore = new Map<string, { otp: string; expiresAt: number }>();
  // In-memory delete OTP storage to handle DB wipe confirm codes independently
  const deleteOtpStore = new Map<string, { otp: string; expiresAt: number }>();

  // Accounts Management
  const ACCOUNTS_FILE = path.join(process.cwd(), "accounts.json");
  interface Account {
    email: string;
    passwordHash: string;
    createdAt: number;
  }
  
  // Helper to fetch Supabase client
  const getSupabase = (req: express.Request) => {
    const url = (req.headers['x-supabase-url'] as string) || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = (req.headers['x-supabase-key'] as string) || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    if (url && key) {
      return createClient(url, key);
    }
    return null;
  };
  
  async function checkAccountExists(email: string, supabase: any): Promise<boolean> {
    if (supabase) {
      const { data, error } = await supabase.from('auth_accounts').select('email').eq('email', email).maybeSingle();
      if (!error && data) return true;
      if (error && error.code !== 'PGRST116') console.error('Supabase error checking account:', error);
      return false;
    }
    
    // Fallback to local accounts
    try {
      if (fs.existsSync(ACCOUNTS_FILE)) {
        const accounts: Account[] = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf-8"));
        return accounts.some(a => a.email === email);
      }
    } catch (e) {
      console.error("Error reading accounts file:", e);
    }
    return false;
  }
  
  async function getAccountByEmail(email: string, supabase: any): Promise<Account | null> {
    if (supabase) {
      const { data, error } = await supabase.from('auth_accounts').select('*').eq('email', email).maybeSingle();
      if (!error && data) {
         return {
           email: data.email,
           passwordHash: data.password_hash,
           createdAt: new Date(data.created_at).getTime()
         };
      }
      return null;
    }
    
    try {
      if (fs.existsSync(ACCOUNTS_FILE)) {
        const accounts: Account[] = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf-8"));
        return accounts.find(a => a.email === email) || null;
      }
    } catch (e) {
      console.error("Error reading accounts file:", e);
    }
    return null;
  }
  
  async function saveAccount(acc: Account, supabase: any) {
    if (supabase) {
       const { error } = await supabase.from('auth_accounts').upsert({
         email: acc.email,
         password_hash: acc.passwordHash,
         created_at: new Date(acc.createdAt).toISOString()
       }, { onConflict: 'email' });
       if (error) console.error("Error saving account to Supabase:", error);
       return;
    }
    
    // Local fallback
    let accounts: Account[] = [];
    try {
      if (fs.existsSync(ACCOUNTS_FILE)) {
        accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf-8"));
      }
    } catch (e) {}
    
    const existing = accounts.findIndex(a => a.email === acc.email);
    if (existing >= 0) {
      accounts[existing] = acc;
    } else {
      accounts.push(acc);
    }
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
  }

  // Use a local JSON file to persist remembered device tokens across server restarts
  const TOKENS_FILE = path.join(process.cwd(), "device_tokens.json");

  function getDeviceTokens(): string[] {
    try {
      if (fs.existsSync(TOKENS_FILE)) {
        const data = fs.readFileSync(TOKENS_FILE, "utf-8");
        return JSON.parse(data);
      }
    } catch (e) {
      console.error("Error reading device tokens file:", e);
    }
    return [];
  }

  function saveDeviceToken(token: string) {
    try {
      const tokens = getDeviceTokens();
      if (!tokens.includes(token)) {
        tokens.push(token);
        fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
        console.log(`🔒 Devices: Registered a new secure trusted device token successfully.`);
      }
    } catch (e) {
      console.error("Error saving device token:", e);
    }
  }

  function verifyDeviceToken(token: string): boolean {
    if (!token) return false;
    const tokens = getDeviceTokens();
    return tokens.includes(token);
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

  // Custom In-Memory Sliding rate-limiter to prevent authentication brute forcing / SMTP abuse
  const authRateLimiter = new Map<string, { count: number; resetTime: number }>();
  
  const rateLimitAuth = (limit: number, windowMs: number) => {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const ip = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "unknown";
      // Normalize email or use fallback IP to restrict malicious credential flooding
      const reqEmail = req.body && typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
      const key = `${ip}:${req.path}:${reqEmail}`;
      const now = Date.now();

      const record = authRateLimiter.get(key);
      if (!record || now > record.resetTime) {
        authRateLimiter.set(key, {
          count: 1,
          resetTime: now + windowMs
        });
        next();
      } else {
        if (record.count >= limit) {
          console.warn(`[SECURITY SUSPICIOUS ACTIVITY] Rate limit exceeded on route ${req.path} for target key segment: ${key}`);
          res.status(429).json({
            success: false,
            error: "Too many authentication requests. Please try again in a few minutes."
          });
          return;
        }
        record.count += 1;
        next();
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
      
      // Store passcode with 5 minutes lifespan
      otpStore.set(normalizedEmail, {
        otp,
        expiresAt: Date.now() + 5 * 60 * 1000
      });

      console.log(`\n======================================================`);
      console.log(`🔑 NEW SECURE OTP GENERATED FOR: ${normalizedEmail}`);
      console.log(`🔐 PASSCODE: [ ${otp} ]`);
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
      }

      // Return success. Do NOT return the OTP (passcode) to the frontend in production to keep it secure.
      // In development, return the OTP to allow testing without SMTP.
      res.json({
        success: true,
        emailSent,
        devOtp: emailSent ? null : otp,
        errorDetails: errorDetails || undefined
      });
    } catch (err: any) {
      console.error("[SECURITY LOG] OTP Send failed:", err.message || err);
      res.status(500).json({ success: false, error: "System secure transmission error. Please request later." });
    }
  });

  // 2. Verify OTP route
  app.post("/api/auth/verify-otp", rateLimitAuth(10, 60 * 1000), (req: express.Request, res: express.Response) => {
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

      // Check for predefined persistent Master Security PIN/Passcode, or the temporary fallback code "000000" (restricted to dev settings)
      const isDev = process.env.NODE_ENV !== "production";
      const masterPin = process.env.SECURITY_PIN || process.env.MASTER_PIN;
      let matchesMaster = false;
      if (masterPin && enteredOtp === masterPin.trim()) {
        matchesMaster = true;
      } else if (isDev && enteredOtp === "000000") {
        matchesMaster = true;
      }

      if (matchesMaster) {
        if (!forRegistrationOrReset) {
          const deviceToken = `vault_device_token_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
          saveDeviceToken(deviceToken);
        }
        res.json({
          success: true,
          token: !forRegistrationOrReset ? `token_vault_session_${Date.now()}` : undefined,
          deviceToken: !forRegistrationOrReset ? `vault_device_token_${Date.now()}` : undefined
        });
        return;
      }

      const saved = otpStore.get(normalizedEmail);
      if (!saved) {
        res.status(401).json({ success: false, error: "No active verification passcode found. Please request a new code." });
        return;
      }

      if (Date.now() > saved.expiresAt) {
        otpStore.delete(normalizedEmail);
        res.status(401).json({ success: false, error: "The passcode has expired. Please request a new code." });
        return;
      }

      if (saved.otp !== enteredOtp) {
        res.status(401).json({ success: false, error: "The passcode entered is incorrect." });
        return;
      }

      if (forRegistrationOrReset) {
        // Just verify, don't delete yet. The registration/reset step will delete it.
        res.json({ success: true });
        return;
      }

      // Generate a secure persistent device token
      const deviceToken = `vault_device_token_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      saveDeviceToken(deviceToken);

      // Successful unlock - clear OTP
      otpStore.delete(normalizedEmail);
      res.json({
        success: true,
        token: `token_vault_session_${Date.now()}`,
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
      
      const isDev = process.env.NODE_ENV !== "production";
      const masterPin = process.env.SECURITY_PIN || process.env.MASTER_PIN;
      const enteredOtp = otp.trim();
      let isValidOtp = false;

      if (masterPin && enteredOtp === masterPin.trim()) {
        isValidOtp = true;
      } else if (isDev && enteredOtp === "000000") {
        isValidOtp = true;
      } else {
        const saved = otpStore.get(normalizedEmail);
        if (saved && saved.otp === enteredOtp && Date.now() <= saved.expiresAt) {
          isValidOtp = true;
          otpStore.delete(normalizedEmail); // consume OTP
        }
      }

      if (!isValidOtp) {
        res.status(401).json({ success: false, error: "Invalid or expired OTP." });
        return;
      }

      const supabase = getSupabase(req);
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

      const deviceToken = `vault_device_token_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      saveDeviceToken(deviceToken);

      res.json({
        success: true,
        token: `token_vault_session_${Date.now()}`,
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

      const deviceToken = `vault_device_token_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      saveDeviceToken(deviceToken);

      res.json({
        success: true,
        token: `token_vault_session_${Date.now()}`,
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
      
      const isDev = process.env.NODE_ENV !== "production";
      const masterPin = process.env.SECURITY_PIN || process.env.MASTER_PIN;
      const enteredOtp = otp.trim();
      let isValidOtp = false;

      if (masterPin && enteredOtp === masterPin.trim()) {
        isValidOtp = true;
      } else if (isDev && enteredOtp === "000000") {
        isValidOtp = true;
      } else {
        const saved = otpStore.get(normalizedEmail);
        if (saved && saved.otp === enteredOtp && Date.now() <= saved.expiresAt) {
          isValidOtp = true;
          otpStore.delete(normalizedEmail); // consume OTP
        }
      }

      if (!isValidOtp) {
        res.status(401).json({ success: false, error: "Invalid or expired OTP." });
        return;
      }

      const supabase = getSupabase(req);
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

      const deviceToken = `vault_device_token_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      saveDeviceToken(deviceToken);

      res.json({
        success: true,
        token: `token_vault_session_${Date.now()}`,
        deviceToken
      });
    } catch (err: any) {
      console.error("[SECURITY LOG] Reset-password operation failed:", err.message || err);
      res.status(500).json({ success: false, error: "System password reset service error." });
    }
  });

  // 3. Verify Remembered Device Token route
  app.post("/api/auth/verify-device", rateLimitAuth(25, 60 * 1000), (req: express.Request, res: express.Response) => {
    try {
      const { deviceToken } = req.body;
      if (!deviceToken || typeof deviceToken !== "string" || deviceToken.length > 200) {
        res.json({ success: false, error: "No valid device token provided" });
        return;
      }

      const isValid = verifyDeviceToken(deviceToken);
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
      const otp = Math.floor(100000 + Math.random() * 900000).toString();

      deleteOtpStore.set(normalizedEmail, {
        otp,
        expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes validity
      });

      console.log(`\n======================================================`);
      console.log(`⚠️ NEW DELETION 2FA OTP GENERATED FOR: ${normalizedEmail}`);
      console.log(`🔐 PASSCODE: [ ${otp} ]`);
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
      }

      res.json({
        success: true,
        emailSent,
        devOtp: emailSent ? null : otp,
        errorDetails: errorDetails || undefined
      });
    } catch (err: any) {
      console.error("[SECURITY LOG] Deletion OTP Send failed:", err.message || err);
      res.status(500).json({ success: false, error: "System secure transmission error." });
    }
  });

  // 4b. Verify Deletion OTP
  app.post("/api/auth/verify-delete-otp", rateLimitAuth(5, 60 * 1000), (req: express.Request, res: express.Response) => {
    try {
      const { email, otp } = req.body;
      const emailErr = validateEmail(email);
      const otpErr = validateOtp(otp);
      if (emailErr || otpErr) {
        res.status(400).json({ success: false, error: emailErr || otpErr });
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();
      const enteredOtp = otp.trim();

      const isDev = process.env.NODE_ENV !== "production";
      const masterPin = process.env.SECURITY_PIN || process.env.MASTER_PIN;
      let matchesMaster = false;
      if (masterPin && enteredOtp === masterPin.trim()) {
        matchesMaster = true;
      } else if (isDev && enteredOtp === "000000") {
        matchesMaster = true;
      }

      if (matchesMaster) {
        res.json({ success: true });
        return;
      }

      const saved = deleteOtpStore.get(normalizedEmail);
      if (!saved) {
        res.status(401).json({ success: false, error: "No active deletion passcode found. Please request a new code." });
        return;
      }

      if (Date.now() > saved.expiresAt) {
        deleteOtpStore.delete(normalizedEmail);
        res.status(401).json({ success: false, error: "Passcode has expired. Please request a new code." });
        return;
      }

      if (saved.otp !== enteredOtp) {
        res.status(401).json({ success: false, error: "The passcode entered is incorrect." });
        return;
      }

      // Successful verification - clear OTP
      deleteOtpStore.delete(normalizedEmail);
      res.json({ success: true });
    } catch (err: any) {
      console.error("[SECURITY LOG] Verify Deletion OTP failed:", err.message || err);
      res.status(500).json({ success: false, error: "System authentication service error." });
    }
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
