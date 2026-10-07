/// The transport policy of `src/lib/api.ts` — `withTimeout` (`:36-50`) and
/// `retryWithBackoff` (`:59-75`), plus the budgets the sync path passes them.
///
/// `fetchWithTimeout` (`:19-34`) is not ported as a function: on the phone the
/// abort controller is dio's own connect/send/receive timeout, already set to the
/// same 10 s in `ApiClient` (`lib/auth/api_client.dart:87`). What has to survive is
/// the *policy*, not the plumbing.
///
/// The delay is injectable because the web's schedule is measured in seconds
/// (`RetryBudget.baseDelayMs = 2000`) and a test that really slept would take
/// minutes; every other number here is the web's, unchanged.
library;

import 'dart:async';
import 'dart:math' as math;

/// `RetryOptions` (`:52-57`).
final class RetryBudget {
  const RetryBudget({
    this.maxRetries = 3,
    this.baseDelayMs = 1000,
    this.maxDelayMs = 10000,
  });

  /// Retries **after** the first attempt, so the call runs `maxRetries + 1` times at
  /// most — the web's `for (let attempt = 0; attempt <= maxRetries; attempt++)`.
  final int maxRetries;
  final int baseDelayMs;
  final int maxDelayMs;

  /// The three budgets the web actually uses. They are not interchangeable: the RPC
  /// retry (`src/supabase.ts:518-519`) is the fast one inside a single push, while
  /// the push itself (`:845`) and the pull (`:1168`) are retried by the per-email
  /// chain on a slower schedule.
  static const RetryBudget defaults = RetryBudget();

  /// `SYNC_RPC_RETRY` (`src/supabase.ts:517-520`) — no `maxDelayMs`, so the web's
  /// default 10 s cap applies and never binds at these values.
  static const RetryBudget syncRpc = RetryBudget(
    maxRetries: 2,
    baseDelayMs: 500,
  );

  /// The whole push, and the whole pull (`src/supabase.ts:845`, `:1168`).
  static const RetryBudget syncRoundTrip = RetryBudget(
    maxRetries: 2,
    baseDelayMs: 2000,
    maxDelayMs: 5000,
  );

  /// `SYNC_TIMEOUT` (`src/supabase.ts:922`), which wraps the pull's retry.
  static const Duration syncTimeout = Duration(seconds: 15);

  /// `Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs)` (`:68`), with
  /// `attempt` the **0-based** index of the attempt that just failed. `setTimeout`
  /// truncates a fractional ms, so the duration is truncated too.
  Duration delayAfterAttempt(int attempt) {
    final double ms = math.min(
      baseDelayMs * math.pow(2, attempt).toDouble(),
      maxDelayMs.toDouble(),
    );
    return Duration(milliseconds: ms.toInt());
  }
}

/// `onRetry?: (attempt: number, error: Error) => void` (`:56`). The attempt number
/// is **1-based** (`attempt + 1` at `:69`) — it names the attempt that is about to
/// be re-run, not the one that failed.
typedef OnRetry = void Function(int attempt, Object error);

/// `sleep` seam: `await new Promise((r) => setTimeout(r, delay))` (`:70`).
typedef Sleeper = Future<void> Function(Duration delay);

/// The production sleeper. Named so a caller that forwards its own `sleep` seam can
/// still say "and the default is this".
Future<void> realSleep(Duration delay) => Future<void>.delayed(delay);

/// `retryWithBackoff` (`:59-75`).
///
/// Faithful in the four places a port usually drifts:
/// - the attempt count is `maxRetries + 1`, and **no delay follows the last
///   attempt** — a rejected final attempt rejects immediately (`:67`);
/// - the delay is computed from the 0-based index, so it is `base, 2·base, 4·base…`
///   and never `2·base` first;
/// - `onRetry` fires **before** the sleep, so a log written from it precedes the gap;
/// - the value rethrown is the **last** error, not the first, and a thrown non-Error
///   is wrapped in an `Error` whose message is `String(err)` (`:66`). The wrap is a
///   no-op in Dart (any object can propagate), so [onRetry] and the rethrow carry the
///   original object; `parity/DATA_SPEC.md` records the message-shape difference.
Future<T> retryWithBackoff<T>(
  Future<T> Function() fn, {
  RetryBudget budget = RetryBudget.defaults,
  OnRetry? onRetry,
  Sleeper sleep = realSleep,
}) async {
  Object? lastError;
  for (int attempt = 0; attempt <= budget.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < budget.maxRetries) {
        onRetry?.call(attempt + 1, err);
        await sleep(budget.delayAfterAttempt(attempt));
      }
    }
  }
  // The web's `throw lastError!` (`:74`). Reaching here means the final attempt
  // threw, so `lastError` is always set.
  throw lastError!;
}

/// `withTimeout` (`:36-50`).
///
/// The web races a timer against the promise and **does not cancel** the underlying
/// work — a request that finishes after the timeout still completes, its result just
/// goes nowhere. Dart's `Future.timeout` has the same shape.
///
/// What the web's shape forces is the throw type: `reject(new Error(msg))`
/// (`api.ts:38`) is an Error whose `.message` is the whole string, so a caller that
/// reads the message gets `"$label timed out after ${ms}ms"` and nothing else.
/// `TimeoutException.toString()` prefixes its own class and interval
/// (`"TimeoutException after 0:00:15.000000: …"`), which would put a Dart-internal
/// string in front of the user, so the wall throws [JsError] instead — the same
/// message, no invented prefix (deviation 2 ruling; see also §11 D-01).
Future<T> withTimeout<T>(
  Future<T> future,
  Duration timeout, {
  String label = 'Operation',
}) {
  return future.timeout(
    timeout,
    onTimeout: () {
      throw JsError('$label timed out after ${timeout.inMilliseconds}ms');
    },
  );
}

/// The web's `new Error(message)` — an exception whose `toString()` **is** its
/// message, so every message surface (`_messageOf`, the sync-status copy) reads the
/// same text the browser would show.
final class JsError implements Exception {
  JsError(this.message);

  final String message;

  @override
  String toString() => message;
}
