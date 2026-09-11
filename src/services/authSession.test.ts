import { describe, it, expect, beforeEach, vi } from 'vitest';

// authSession is the single in-memory session authority (A1: no localStorage
// persistence of auth credentials). This test locks its memory-only contract:
// getters start null, set/get round-trip, and clear() wipes every value.
import { authSession } from './authSession';

describe('authSession.ts — in-memory session singleton', () => {
  beforeEach(() => {
    authSession.clear();
  });

  it('starts with all fields null', () => {
    expect(authSession.getToken()).toBeNull();
    expect(authSession.getEmail()).toBeNull();
    expect(authSession.getDeviceToken()).toBeNull();
  });

  it('round-trips token/email/deviceToken in memory', () => {
    authSession.setToken('tok-123');
    authSession.setEmail('user@example.com');
    authSession.setDeviceToken('dev-456');

    expect(authSession.getToken()).toBe('tok-123');
    expect(authSession.getEmail()).toBe('user@example.com');
    expect(authSession.getDeviceToken()).toBe('dev-456');
  });

  it('treats null as clearing the value', () => {
    authSession.setToken('tok-123');
    authSession.setToken(null);
    expect(authSession.getToken()).toBeNull();
  });

  it('clear() wipes every stored value', () => {
    authSession.setToken('tok-123');
    authSession.setEmail('user@example.com');
    authSession.setDeviceToken('dev-456');

    authSession.clear();

    expect(authSession.getToken()).toBeNull();
    expect(authSession.getEmail()).toBeNull();
    expect(authSession.getDeviceToken()).toBeNull();
  });

  it('does not touch localStorage (memory-only authority)', () => {
    // If this singleton ever reads/writes localStorage, the contract is
    // violated and A1's security guarantee (credentials never persisted) breaks.
    const spy = vi.spyOn(Storage.prototype, 'getItem');
    const setSpy = vi.spyOn(Storage.prototype, 'setItem');

    authSession.setToken('tok-123');
    authSession.getToken();
    authSession.clear();

    expect(spy).not.toHaveBeenCalled();
    expect(setSpy).not.toHaveBeenCalled();

    spy.mockRestore();
    setSpy.mockRestore();
  });
});