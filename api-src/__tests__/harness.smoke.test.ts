// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { makeTestApp } from './helpers';

describe('test harness', () => {
  it('boots the app and serves health', async () => {
    const { request } = await makeTestApp();
    const res = await request.get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
