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
