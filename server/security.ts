import crypto from 'crypto';

export const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export function generateOtp(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

export function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export interface SecureTokenPayload {
  email: string;
  expiresAt: number;
}

export function generateSecureToken(email: string, durationMs: number, sessionSecret: string): string {
  const payload: SecureTokenPayload = {
    email: email.trim().toLowerCase(),
    expiresAt: Date.now() + durationMs,
  };
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', sessionSecret).update(payloadStr).digest('hex');
  return `${payloadStr}.${signature}`;
}

export function verifySecureToken(token: string, sessionSecret: string): SecureTokenPayload | null {
  if (!token || typeof token !== 'string' || !sessionSecret) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadStr, signature] = parts;
  const expectedSignature = crypto.createHmac('sha256', sessionSecret).update(payloadStr).digest('hex');
  if (!timingSafeEqualString(signature, expectedSignature)) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8')) as SecureTokenPayload;
    if (
      !payload ||
      typeof payload.email !== 'string' ||
      typeof payload.expiresAt !== 'number' ||
      !Number.isFinite(payload.expiresAt)
    ) {
      return null;
    }
    if (Date.now() > payload.expiresAt) return null;
    return { email: payload.email.trim().toLowerCase(), expiresAt: payload.expiresAt };
  } catch {
    return null;
  }
}

export function resolveSupabaseConfig(): { url: string; key: string } | null {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ''
  ).trim();

  if (!url || !key) {
    if (IS_PRODUCTION) {
      console.error('[Supabase] Missing VITE_SUPABASE_URL/SUPABASE_URL or anon/service key.');
    }
    return null;
  }

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    console.error(`[Supabase] Invalid URL: ${url}`);
    return null;
  }

  return { url, key };
}
