import { Page, expect } from '@playwright/test';

export interface TestUser {
  email: string;
  password: string;
}

export function uniqueEmail(prefix: string): TestUser {
  const stamp = Date.now();
  return {
    email: `${prefix}-${stamp}@example.com`,
    password: `Str0ngP@ss${stamp}`,
  };
}

async function api(page: Page, path: string, body: unknown) {
  const resp = await page.request.post(path, { data: body });
  const data = await resp.json().catch(() => ({}));
  return { status: resp.status(), data };
}

/**
 * Register a brand-new account end-to-end against the real stack
 * (send-otp -> verify-otp -> register). Requires the dev server to be
 * running with DEV_OTP_RESPONSE=true so send-otp returns the passcode.
 */
export async function registerUser(page: Page, user: TestUser): Promise<void> {
  const send = await api(page, '/api/auth/send-otp', { email: user.email });
  expect(send.status).toBe(200);
  expect(send.data.success).toBe(true);
  const otp: string = send.data.devOtp || '';
  expect(otp).toMatch(/^\d{6}$/);

  const verify = await api(page, '/api/auth/verify-otp', {
    email: user.email,
    otp,
    forRegistrationOrReset: true,
  });
  expect(verify.status).toBe(200);
  expect(verify.data.success).toBe(true);

  const reg = await api(page, '/api/auth/register', {
    email: user.email,
    password: user.password,
    otp,
    rememberMe: false,
  });
  expect(reg.status).toBe(200);
  expect(reg.data.success).toBe(true);
}

/** Log in an existing account with a known password via the login-password route. */
export async function loginUser(page: Page, user: TestUser): Promise<{ token: string; deviceToken: string }> {
  const resp = await api(page, '/api/auth/login-password', {
    email: user.email,
    password: user.password,
    rememberMe: false,
  });
  expect(resp.status).toBe(200);
  expect(resp.data.success).toBe(true);
  await page.goto('/');
  await page.evaluate(
    ([email, token, deviceToken]) => {
      window.localStorage.setItem('auth_user_email', email as string);
      window.localStorage.setItem('auth_session_token', token as string);
      window.localStorage.setItem('auth_device_token', deviceToken as string);
      window.localStorage.setItem('auth_remember_me', 'false');
    },
    [user.email, resp.data.token, resp.data.deviceToken],
  );
  return { token: resp.data.token, deviceToken: resp.data.deviceToken };
}
