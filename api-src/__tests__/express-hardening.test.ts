// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { makeTestApp } from './helpers';

describe('express baseline hardening', () => {
  it('does not leak x-powered-by', async () => {
    const { request } = await makeTestApp();
    const res = await request.get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('rejects oversized JSON bodies on auth routes with 413', async () => {
    const { request, uniqueEmail, uniqueIp } = await makeTestApp();
    const big = { email: uniqueEmail(), padding: 'x'.repeat(300 * 1024) }; // > 256KB
    const res = await request.post('/api/auth/check-email').set({ 'X-Forwarded-For': uniqueIp() }).send(big);
    expect(res.status).toBe(413);
  });

  it('rejects non-JSON content-type on state-changing /api routes with 415', async () => {
    const { request, uniqueIp } = await makeTestApp();
    const res = await request
      .post('/api/auth/check-email')
      .set({ 'X-Forwarded-For': uniqueIp(), 'Content-Type': 'application/x-www-form-urlencoded' })
      .send('email=foo%40bar.com');
    expect(res.status).toBe(415);
  });
});
