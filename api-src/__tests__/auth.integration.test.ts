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
