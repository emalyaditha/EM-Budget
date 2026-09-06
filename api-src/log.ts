import crypto from 'crypto';

/**
 * Structured JSON logging with request-id correlation and an env-gated
 * error reporter hook (Sentry wired lazily, only when SENTRY_DSN is set).
 *
 * Every request-line emitted by the request-logging middleware carries the
 * same requestId that is returned in the `x-request-id` response header, so
 * server logs and downstream error reports can be traced back to a specific
 * user interaction.
 */

type Level = 'info' | 'warn' | 'error';

interface LogEntry {
  ts: string;
  level: Level;
  event: string;
  requestId?: string;
  email?: string;
  [key: string]: unknown;
}

function write(entry: LogEntry): void {
  const line = JSON.stringify(entry);
  if (entry.level === 'error') {
    console.error(line);
  } else if (entry.level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function logInfo(event: string, meta: Record<string, unknown> = {}): void {
  write({ ts: new Date().toISOString(), level: 'info', event, ...meta });
}

export function logWarn(event: string, meta: Record<string, unknown> = {}): void {
  write({ ts: new Date().toISOString(), level: 'warn', event, ...meta });
}

export function logError(event: string, err: unknown, meta: Record<string, unknown> = {}): void {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  write({
    ts: new Date().toISOString(),
    level: 'error',
    event,
    message,
    ...(stack ? { stack } : {}),
    ...meta,
  });
  reportToSentry(err, { event, ...meta }).catch(() => {});
}

export function newRequestId(incoming?: unknown): string {
  if (typeof incoming === 'string' && incoming.length > 0 && incoming.length <= 128) {
    return incoming;
  }
  return crypto.randomUUID();
}

let sentryInited = false;

/**
 * Report an error to Sentry, but ONLY when SENTRY_DSN is configured and
 * @sentry/node is resolvable. Without SENTRY_DSN this is a no-op, so the
 * app runs fine in dev/CI with no telemetry configured.
 */
async function reportToSentry(err: unknown, meta: Record<string, unknown>): Promise<void> {
  if (!process.env.SENTRY_DSN) return;
  try {
    const { init, captureException } = await import('@sentry/node');
    if (!sentryInited) {
      init({ dsn: process.env.SENTRY_DSN });
      sentryInited = true;
    }
    const explicit = err instanceof Error ? err : new Error(String(err));
    captureException(explicit, { extra: meta });
  } catch (e) {
    // Never let telemetry break the request path.
    console.error('[sentry] failed to capture error:', e);
  }
}
