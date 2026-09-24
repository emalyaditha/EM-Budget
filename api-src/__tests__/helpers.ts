// @vitest-environment node
// Module-scope env neutralization: MUST execute before the `../../server` import
// chain evaluates (server.ts line 9 `import 'dotenv/config'` loads .env which
// contains real Supabase vars; server.ts throws at module scope if
// SESSION_SECRET is missing). Under vitest's esbuild->CJS transpile, statement
// order IS execution order, so this block sits physically above the imports.
process.env.NODE_ENV = 'test';
delete process.env.VITE_SUPABASE_URL;
delete process.env.SUPABASE_URL;
delete process.env.VITE_SUPABASE_ANON_KEY;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.SMTP_HOST;
process.env.SESSION_SECRET = 'test-session-secret-not-for-production';
process.env.DEV_OTP_RESPONSE = 'true';

import { createApp } from '../../server';
import type { Express } from 'express';
import supertest from 'supertest';

let emailCounter = 0;
let ipCounter = 0;

export function uniqueEmail(): string {
  emailCounter += 1;
  return `test-user-${Date.now()}-${emailCounter}@example.com`;
}

export function uniqueIp(): string {
  ipCounter += 1;
  return `198.51.100.${(ipCounter % 254) + 1}`;
}

export interface TestContext {
  app: Express;
  request: ReturnType<typeof supertest>;
  uniqueEmail: typeof uniqueEmail;
  uniqueIp: typeof uniqueIp;
}

/**
 * Fresh app per call. NODE_ENV=test (NOT 'production') so:
 *  - IS_PRODUCTION=false  -> mockDb fallback path is live
 *  - no Supabase env vars -> getSupabase() returns null -> in-memory mock DB
 *  - SESSION_SECRET present -> server boots
 */
export async function makeTestApp(): Promise<TestContext> {
  process.env.NODE_ENV = 'test';
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.SUPABASE_URL;
  delete process.env.VITE_SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SMTP_HOST;
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-not-for-production';
  process.env.DEV_OTP_RESPONSE = 'true';
  const app = await createApp();
  return { app, request: supertest(app), uniqueEmail, uniqueIp };
}

/** Per-request isolation: distinct email + X-Forwarded-For IP so rate-limit and lockout buckets never bleed between tests. */
export function withIsolation(ctx: TestContext) {
  const email = ctx.uniqueEmail();
  const ip = ctx.uniqueIp();
  const headers = { 'X-Forwarded-For': ip };
  return { email, ip, headers };
}
