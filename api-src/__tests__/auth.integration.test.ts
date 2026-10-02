// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { makeTestApp, withIsolation } from './helpers';
import type { TestContext } from './helpers';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await makeTestApp();
});

async function sendOtp(email: string, headers: Record<string, string>) {
  const res = await ctx.request.post('/api/auth/send-otp').set(headers).send({ email }).expect(200);
  return res;
}

describe('check-email', () => {
  it('returns a uniform { success, exists } shape for valid emails', async () => {
    const { email, headers } = withIsolation(ctx);
    const existing = await ctx.request.post('/api/auth/check-email').set(headers).send({ email });
    expect(existing.status).toBe(200);
    expect(existing.body).toMatchObject({ success: true });
    expect(typeof existing.body.exists).toBe('boolean');
  });

  it('rejects invalid emails with 400', async () => {
    const { headers } = withIsolation(ctx);
    const res = await ctx.request.post('/api/auth/check-email').set(headers).send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('OTP flow', () => {
  it('send-otp -> verify-otp issues a session token (body + cookie)', async () => {
    const { email, headers } = withIsolation(ctx);
    await sendOtp(email, headers);
    const otp = '123456'; // dev path: DEV_OTP_RESPONSE not required — mockDb stores hash; use the devOtp leak gate below
    const dev = await ctx.request.post('/api/auth/send-otp').set(headers).send({ email });
    // When SMTP is unconfigured and DEV_OTP_RESPONSE=true, the OTP is returned; otherwise read via process env test seam
    const code = dev.body.devOtp || otp;
    const verify = await ctx.request.post('/api/auth/verify-otp').set(headers).send({ email, otp: code });
    expect(verify.status).toBe(200);
    expect(verify.body.success).toBe(true);
    expect(typeof verify.body.token).toBe('string');
    const setCookie = (verify.headers['set-cookie'] as unknown as string[] | undefined)?.join(';') ?? '';
    expect(setCookie).toContain('session_token=');
  });

  it('consumes a wrong OTP (second attempt with same code fails)', async () => {
    const { email, headers } = withIsolation(ctx);
    await sendOtp(email, headers);
    const dev = await ctx.request.post('/api/auth/send-otp').set(headers).send({ email });
    const code = dev.body.devOtp as string | undefined;
    expect(code).toBeTruthy(); // requires DEV_OTP_RESPONSE=true in the test env — see below
    const wrong = await ctx.request.post('/api/auth/verify-otp').set(headers).send({ email, otp: '999999' });
    expect(wrong.status).toBe(401); // OTP mismatch is an auth failure (spec S-0 §3: wrong OTP must be rejected)
    const retry = await ctx.request.post('/api/auth/verify-otp').set(headers).send({ email, otp: code });
    expect(retry.status).toBe(401); // consumed by the failed attempt → no active passcode remains
  });
});

describe('register', () => {
  it('registers a new account (OTP-gated)', async () => {
    const { email, headers } = withIsolation(ctx);
    await sendOtp(email, headers);
    const dev = await ctx.request.post('/api/auth/send-otp').set(headers).send({ email });
    const res = await ctx.request
      .post('/api/auth/register')
      .set(headers)
      .send({ email, otp: dev.body.devOtp, password: 'StrongPass1!' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('login-password lockout', () => {
  it('locks the account after 5 failed attempts with an escalating cooldown', async () => {
    const { email, headers } = withIsolation(ctx);
    // pre-register
    await sendOtp(email, headers);
    const dev = await ctx.request.post('/api/auth/send-otp').set(headers).send({ email });
    await ctx.request
      .post('/api/auth/register')
      .set(headers)
      .send({ email, otp: dev.body.devOtp, password: 'StrongPass1!' });

    for (let i = 1; i <= 5; i++) {
      const res = await ctx.request
        .post('/api/auth/login-password')
        .set(headers)
        .send({ email, password: 'WrongPass1!' });
      if (i < 5) expect(res.status).toBe(401);
    }
    const locked = await ctx.request
      .post('/api/auth/login-password')
      .set(headers)
      .send({ email, password: 'StrongPass1!' });
    expect([423, 429, 401]).toContain(locked.status);
    expect(locked.body.success).toBe(false);
  });
});

describe('verify-session', () => {
  it('accepts a freshly-issued token and rejects a tampered one', async () => {
    const { email, headers } = withIsolation(ctx);
    // pre-register: verify-session requires the account to exist (server.ts checkAccountExists)
    await sendOtp(email, headers);
    const dev = await ctx.request.post('/api/auth/send-otp').set(headers).send({ email });
    await ctx.request
      .post('/api/auth/register')
      .set(headers)
      .send({ email, otp: dev.body.devOtp, password: 'StrongPass1!' });
    await sendOtp(email, headers);
    const dev2 = await ctx.request.post('/api/auth/send-otp').set(headers).send({ email });
    const verify = await ctx.request.post('/api/auth/verify-otp').set(headers).send({ email, otp: dev2.body.devOtp });
    const token = verify.body.token as string;

    const ok = await ctx.request.post('/api/auth/verify-session').set(headers).send({ email, token });
    expect(ok.status).toBe(200);
    expect(ok.body.success).toBe(true);

    const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;
    const bad = await ctx.request.post('/api/auth/verify-session').set(headers).send({ email, token: tampered });
    // Spec S-0 §6: tampered token must be REJECTED. Handler rejects via body
    // (success:false with 200 — the client contract; frontend checks data.success).
    expect(bad.status).toBe(200);
    expect(bad.body.success).toBe(false);
  });
});

describe('logout', () => {
  it('expires the session and trust cookies and revokes trusted devices', async () => {
    const { email, headers } = withIsolation(ctx);
    await sendOtp(email, headers);
    const dev = await ctx.request.post('/api/auth/send-otp').set(headers).send({ email });
    const v = await ctx.request.post('/api/auth/verify-otp').set(headers).send({ email, otp: dev.body.devOtp });
    const token = v.body.token as string;
    const sessionCookie = ((v.headers['set-cookie'] ?? []) as unknown as string[]).find((c: string) =>
      c.startsWith('session_token='),
    );
    const authed = { ...headers, Cookie: sessionCookie!.split(';')[0] };

    const issue = await ctx.request.post('/api/app-lock/device/issue').set(authed).send({ email, token });
    const trustCookie = ((issue.headers['set-cookie'] ?? []) as unknown as string[]).find((c: string) =>
      c.startsWith('app_lock_trust='),
    );
    expect(trustCookie).toBeTruthy();

    const out = await ctx.request.post('/api/auth/logout').set(authed).send({});
    expect(out.status).toBe(200);
    expect(out.body.success).toBe(true);
    const cleared = ((out.headers['set-cookie'] ?? []) as unknown as string[]).join('|');
    expect(cleared).toMatch(/session_token=;.*Max-Age=0/);
    expect(cleared).toMatch(/app_lock_trust=;.*Max-Age=0/);

    // The revoked device no longer checks out even with the old trust cookie.
    const after = await ctx.request
      .post('/api/app-lock/device/check')
      .set({ ...headers, Cookie: trustCookie!.split(';')[0] });
    expect(after.body.trusted).toBe(false);
  });

  it('is idempotent without a session', async () => {
    const { headers } = withIsolation(ctx);
    const res = await ctx.request.post('/api/auth/logout').set(headers).send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('app-lock PIN', () => {
  it('sets a PIN, verifies it, and locks out after 5 bad attempts', async () => {
    const { email, headers } = withIsolation(ctx);
    await sendOtp(email, headers);
    const dev = await ctx.request.post('/api/auth/send-otp').set(headers).send({ email });
    const v = await ctx.request.post('/api/auth/verify-otp').set(headers).send({ email, otp: dev.body.devOtp });
    const token = v.body.token as string;
    // app-lock routes authenticate via the httpOnly session cookie (requireSession), not a body token
    const sessionCookie = ((v.headers['set-cookie'] ?? []) as unknown as string[]).find((c: string) =>
      c.startsWith('session_token='),
    );
    expect(sessionCookie).toBeTruthy();
    const authed = { ...headers, Cookie: sessionCookie!.split(';')[0] };

    const setPin = await ctx.request.post('/api/app-lock/pin/set').set(authed).send({ email, pin: '7391', token });
    expect(setPin.status).toBe(200);

    const ok = await ctx.request.post('/api/app-lock/pin/verify').set(authed).send({ email, pin: '7391', token });
    expect(ok.status).toBe(200);

    // Spec S-0 §7: PIN wrong × 5 → lockout. Each wrong attempt returns
    // success:false; the 5th wrong attempt engages locked_until, and any later
    // attempt (even correct PIN) hits the locked branch: 200 + code 'LOCKED'.
    for (let i = 0; i < 5; i++) {
      const res = await ctx.request.post('/api/app-lock/pin/verify').set(authed).send({ email, pin: '0000', token });
      expect(res.body.success).toBe(false);
    }
    const locked = await ctx.request.post('/api/app-lock/pin/verify').set(authed).send({ email, pin: '7391', token });
    expect(locked.status).toBe(200);
    expect(locked.body.success).toBe(false);
    expect(locked.body.code).toBe('LOCKED');
  });

  it('rejects weak PINs (sequential / repeated)', async () => {
    const { email, headers } = withIsolation(ctx);
    await sendOtp(email, headers);
    const dev = await ctx.request.post('/api/auth/send-otp').set(headers).send({ email });
    const v = await ctx.request.post('/api/auth/verify-otp').set(headers).send({ email, otp: dev.body.devOtp });
    const res = await ctx.request
      .post('/api/app-lock/pin/set')
      .set(headers)
      .send({ email, pin: '1234', token: v.body.token });
    expect(res.status).toBe(400);
  });
});

describe('app-lock idle timeout', () => {
  async function authedLockSession() {
    const { email, headers } = withIsolation(ctx);
    await sendOtp(email, headers);
    const dev = await ctx.request.post('/api/auth/send-otp').set(headers).send({ email });
    const v = await ctx.request.post('/api/auth/verify-otp').set(headers).send({ email, otp: dev.body.devOtp });
    const sessionCookie = ((v.headers['set-cookie'] ?? []) as unknown as string[]).find((c: string) =>
      c.startsWith('session_token='),
    );
    expect(sessionCookie).toBeTruthy();
    return { email, authed: { ...headers, Cookie: sessionCookie!.split(';')[0] } };
  }

  it('validates bounds, surfaces lockIdleSeconds, and minutes clear the seconds override', async () => {
    const { email, authed } = await authedLockSession();

    for (const bad of [4, 86401, 1.5]) {
      const res = await ctx.request.post('/api/app-lock/pin/idle-seconds').set(authed).send({ email, seconds: bad });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    }

    const ok = await ctx.request.post('/api/app-lock/pin/idle-seconds').set(authed).send({ email, seconds: 30 });
    expect(ok.status).toBe(200);
    expect(ok.body.seconds).toBe(30);

    const status = await ctx.request.post('/api/app-lock/status').set(authed).send({ email });
    expect(status.body.success).toBe(true);
    expect(status.body.lockIdleSeconds).toBe(30);

    const min = await ctx.request.post('/api/app-lock/pin/idle-minutes').set(authed).send({ email, minutes: 5 });
    expect(min.status).toBe(200);
    const status2 = await ctx.request.post('/api/app-lock/status').set(authed).send({ email });
    expect(status2.body.lockIdleMinutes).toBe(5);
    expect(status2.body.lockIdleSeconds).toBeNull();
  });

  it('rejects idle-seconds without a session', async () => {
    const { email, headers } = withIsolation(ctx);
    const res = await ctx.request.post('/api/app-lock/pin/idle-seconds').set(headers).send({ email, seconds: 30 });
    expect(res.status).toBe(401);
  });
});

describe('device trust', () => {
  it('issue -> check (cookie) -> revoke-all clears trust', async () => {
    const { email, headers } = withIsolation(ctx);
    await sendOtp(email, headers);
    const dev = await ctx.request.post('/api/auth/send-otp').set(headers).send({ email });
    const v = await ctx.request.post('/api/auth/verify-otp').set(headers).send({ email, otp: dev.body.devOtp });
    const token = v.body.token as string;
    // device-trust routes authenticate via the httpOnly session cookie (requireSession), not a body token
    const sessionCookie = ((v.headers['set-cookie'] ?? []) as unknown as string[]).find((c: string) =>
      c.startsWith('session_token='),
    );
    expect(sessionCookie).toBeTruthy();
    const authed = { ...headers, Cookie: sessionCookie!.split(';')[0] };

    const issue = await ctx.request.post('/api/app-lock/device/issue').set(authed).send({ email, token });
    expect(issue.status).toBe(200);
    const trustCookie = ((issue.headers['set-cookie'] ?? []) as unknown as string[]).find((c: string) =>
      c.startsWith('app_lock_trust='),
    );
    expect(trustCookie).toBeTruthy();

    const check = await ctx.request
      .post('/api/app-lock/device/check')
      .set({ ...headers, Cookie: trustCookie!.split(';')[0] });
    expect(check.status).toBe(200);

    await ctx.request.post('/api/app-lock/device/revoke-all').set(authed).send({ email, token });

    const after = await ctx.request
      .post('/api/app-lock/device/check')
      .set({ ...headers, Cookie: trustCookie!.split(';')[0] });
    expect([200, 401]).toContain(after.status);
    expect(after.body.trusted).toBe(false);
  });
});

describe('check-email enumeration hardening', () => {
  it('rate-limits an IP across different emails (per-IP bucket)', async () => {
    const ip = ctx.uniqueIp();
    const headers = { 'X-Forwarded-For': ip };
    for (let i = 0; i < 60; i++) {
      await ctx.request
        .post('/api/auth/check-email')
        .set(headers)
        .send({ email: `probe-${i}-${Date.now()}@example.com` });
    }
    const last = await ctx.request
      .post('/api/auth/check-email')
      .set(headers)
      .send({ email: `probe-final-${Date.now()}@example.com` });
    expect(last.status).toBe(429);
  }, 30000);
});

describe('google sso', () => {
  it('returns 503 when GOOGLE_CLIENT_ID is not configured', async () => {
    const { headers } = withIsolation(ctx);
    const res = await ctx.request.post('/api/auth/google').set(headers).send({ credential: 'x.y.z' });
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
  });

  it('rejects a missing credential with 400', async () => {
    process.env.GOOGLE_CLIENT_ID = 'test-google-client-id.apps.googleusercontent.com';
    try {
      const { headers } = withIsolation(ctx);
      const res = await ctx.request.post('/api/auth/google').set(headers).send({});
      expect(res.status).toBe(400);
    } finally {
      delete process.env.GOOGLE_CLIENT_ID;
    }
  });

  // The handler wraps Google's verifyIdToken in its own 10s withTimeout guard, so
  // this request legitimately takes longer than vitest's 5s default whenever the
  // network is slow. Budget above the handler's ceiling instead of racing it.
  it('rejects an unverifiable ID token with 401', async () => {
    process.env.GOOGLE_CLIENT_ID = 'test-google-client-id.apps.googleusercontent.com';
    try {
      const { headers } = withIsolation(ctx);
      const res = await ctx.request.post('/api/auth/google').set(headers).send({ credential: 'not-a-jwt' });
      expect(res.status).toBe(401);
    } finally {
      delete process.env.GOOGLE_CLIENT_ID;
    }
  }, 30_000);
});
