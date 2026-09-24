// @vitest-environment node
import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { generateSecureToken, verifySecureToken } from '../../server/security';

const SECRET = 'unit-test-secret-0123456789abcdef';

describe('generateSecureToken / verifySecureToken', () => {
  it('round-trips a valid token with normalized email', () => {
    const token = generateSecureToken('  User@Example.COM ', 60_000, SECRET);
    const decoded = verifySecureToken(token, SECRET);
    expect(decoded).not.toBeNull();
    expect(decoded!.email).toBe('user@example.com');
  });

  it('rejects a tampered signature', () => {
    const token = generateSecureToken('a@b.com', 60_000, SECRET);
    const [payload] = token.split('.');
    const forged = `${payload}.${crypto.createHmac('sha256', 'wrong-secret').update(payload).digest('hex')}`;
    expect(verifySecureToken(forged, SECRET)).toBeNull();
  });

  it('rejects an expired token', () => {
    const token = generateSecureToken('a@b.com', -1, SECRET);
    expect(verifySecureToken(token, SECRET)).toBeNull();
  });

  it('rejects malformed / garbage tokens', () => {
    expect(verifySecureToken('', SECRET)).toBeNull();
    expect(verifySecureToken('no-dot-separator', SECRET)).toBeNull();
    expect(verifySecureToken('a.b.c', SECRET)).toBeNull();
    expect(verifySecureToken('!!!.???', SECRET)).toBeNull();
  });

  it('rejects tokens with non-numeric expiresAt', () => {
    const payload = Buffer.from(JSON.stringify({ email: 'a@b.com', expiresAt: 'soon' })).toString('base64url');
    const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
    expect(verifySecureToken(`${payload}.${sig}`, SECRET)).toBeNull();
  });
});
