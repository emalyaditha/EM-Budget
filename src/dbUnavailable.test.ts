import { describe, it, expect } from 'vitest';
import { DatabaseUnavailableError, failClosedOnDbError } from '../api-src/db-unavailable';

// A3: app-lock / login-lockout / WebAuthn / trusted-device DB helpers must
// fail CLOSED (503) in production when Supabase errors, instead of silently
// falling back to the (empty, per-instance) in-memory mock — which would read
// as "no app lock" / "no lockout" / "no credentials" and bypass the security
// layer. DEV keeps the mock. The production flag is injected so these tests
// never need to mutate NODE_ENV.
describe('failClosedOnDbError (A3)', () => {
  it('throws DatabaseUnavailableError in production', () => {
    expect(() => failClosedOnDbError(true, new Error('Supabase exploded'))).toThrow(
      DatabaseUnavailableError,
    );
  });

  it('preserves the underlying Supabase error message', () => {
    let caught: unknown;
    try {
      failClosedOnDbError(true, new Error('connection timeout'));
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(DatabaseUnavailableError);
    expect((caught as Error).message).toBe('connection timeout');
  });

  it('uses a fallback message when no error detail is provided', () => {
    let caught: unknown;
    try {
      failClosedOnDbError(true, undefined);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(DatabaseUnavailableError);
    expect((caught as Error).message).toMatch(/temporarily unavailable/i);
  });

  it('is a no-op outside production (DEV keeps the mock fallback)', () => {
    expect(() => failClosedOnDbError(false, new Error('Supabase exploded'))).not.toThrow();
  });

  it('does not throw for non-Error details in production (string detail tolerated)', () => {
    expect(() => failClosedOnDbError(true, 'plain string detail')).toThrow(
      DatabaseUnavailableError,
    );
  });

  it('sets the error name for route-level instanceof-free mapping', () => {
    let caught: unknown;
    try {
      failClosedOnDbError(true, new Error('boom'));
    } catch (err) {
      caught = err;
    }
    expect((caught as Error).name).toBe('DatabaseUnavailableError');
  });
});