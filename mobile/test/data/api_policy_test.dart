import 'dart:async';

import 'package:em_budget/data/api_policy.dart';
import 'package:flutter_test/flutter_test.dart';

/// The retry/timeout schedule of `src/lib/api.ts`, with the sleeps replaced by a
/// recorder so the *shape* is measurable: how many attempts ran, what delay sat
/// between them, and when `onRetry` fired relative to that delay.
///
/// There is no `api.json` fixture — `parity/fixtures/generate.ts` measures pure
/// value functions, and this unit is a control-flow function whose output is a
/// schedule, so the assertions are read off the web's source lines and named here.
void main() {
  /// Collects the delays `retryWithBackoff` asked for, without waiting.
  final List<Duration> slept = <Duration>[];
  Sleeper record() =>
      (Duration d) async => slept.add(d);

  late List<String> log;

  setUp(() {
    slept.clear();
    log = <String>[];
  });

  group('delay schedule — Math.min(base * 2^attempt, max) (:68)', () {
    test('the web defaults run 4 attempts with 1000, 2000, 4000', () {
      expect(
        RetryBudget.defaults.delayAfterAttempt(0),
        const Duration(milliseconds: 1000),
      );
      expect(
        RetryBudget.defaults.delayAfterAttempt(1),
        const Duration(milliseconds: 2000),
      );
      expect(
        RetryBudget.defaults.delayAfterAttempt(2),
        const Duration(milliseconds: 4000),
      );
      expect(
        RetryBudget.defaults.delayAfterAttempt(3),
        const Duration(milliseconds: 8000),
      );
    });

    test('the cap binds at 10000, as Math.min caps it', () {
      expect(
        RetryBudget.defaults.delayAfterAttempt(4),
        const Duration(milliseconds: 10000),
      );
      expect(
        RetryBudget.defaults.delayAfterAttempt(30),
        const Duration(milliseconds: 10000),
      );
    });

    test('SYNC_RPC_RETRY is 500 then 1000 (:517-520)', () {
      expect(
        RetryBudget.syncRpc.delayAfterAttempt(0),
        const Duration(milliseconds: 500),
      );
      expect(
        RetryBudget.syncRpc.delayAfterAttempt(1),
        const Duration(milliseconds: 1000),
      );
      // A third delay would never be used: maxRetries 2 means attempts 0,1,2 and
      // no sleep after the last.
      expect(
        RetryBudget.syncRpc.delayAfterAttempt(2),
        const Duration(milliseconds: 2000),
      );
    });

    test(
      'the round-trip budget is 2000 then 4000, capped at 5000 (:845, :1168)',
      () {
        expect(
          RetryBudget.syncRoundTrip.delayAfterAttempt(0),
          const Duration(milliseconds: 2000),
        );
        expect(
          RetryBudget.syncRoundTrip.delayAfterAttempt(1),
          const Duration(milliseconds: 4000),
        );
        expect(
          RetryBudget.syncRoundTrip.delayAfterAttempt(2),
          const Duration(milliseconds: 5000),
        );
      },
    );

    test('the pull timeout is 15 s (:922)', () {
      expect(RetryBudget.syncTimeout, const Duration(seconds: 15));
    });
  });

  group('retryWithBackoff', () {
    test('a first-attempt success runs once and never sleeps', () async {
      int calls = 0;
      final String result = await retryWithBackoff<String>(() async {
        calls++;
        return 'ok';
      }, sleep: record());
      expect(result, 'ok');
      expect(calls, 1);
      expect(slept, isEmpty);
    });

    test(
      'maxRetries+1 attempts run, and no delay follows the last one (:62-71)',
      () async {
        int calls = 0;
        await expectLater(
          retryWithBackoff<String>(
            () async {
              calls++;
              throw StateError('attempt $calls');
            },
            budget: RetryBudget.syncRpc,
            sleep: record(),
          ),
          throwsStateError,
        );
        expect(calls, 3); // 2 retries after the first attempt
        expect(slept, const <Duration>[
          Duration(milliseconds: 500),
          Duration(milliseconds: 1000),
        ]);
      },
    );

    test('the default budget runs four attempts', () async {
      int calls = 0;
      await expectLater(
        retryWithBackoff<String>(() async {
          calls++;
          throw StateError('boom');
        }, sleep: record()),
        throwsStateError,
      );
      expect(calls, 4);
      expect(slept.length, 3);
    });

    test('a failure that recovers returns the recovered value', () async {
      int calls = 0;
      final String result = await retryWithBackoff<String>(
        () async {
          calls++;
          if (calls < 3) throw StateError('not yet');
          return 'third time';
        },
        budget: RetryBudget.syncRpc,
        sleep: record(),
      );
      expect(result, 'third time');
      expect(slept.length, 2);
    });

    test('the LAST error is rethrown, not the first (:66, :74)', () async {
      int calls = 0;
      Object? caught;
      try {
        await retryWithBackoff<void>(
          () async {
            calls++;
            throw StateError('failure $calls');
          },
          budget: const RetryBudget(maxRetries: 1, baseDelayMs: 0),
          sleep: record(),
        );
      } catch (err) {
        caught = err;
      }
      expect((caught as StateError).message, 'failure 2');
    });

    test('onRetry is 1-based and fires before the sleep (:69-70)', () async {
      int calls = 0;
      await expectLater(
        retryWithBackoff<String>(
          () async {
            calls++;
            throw StateError('e$calls');
          },
          budget: RetryBudget.syncRpc,
          sleep: record(),
          onRetry: (int attempt, Object err) {
            // The web logs *then* waits; if the order flipped, the log would appear
            // after the gap in a real run and mis-date the failure.
            log.add('retry $attempt slept=${slept.length}');
          },
        ),
        throwsStateError,
      );
      expect(log, <String>['retry 1 slept=0', 'retry 2 slept=1']);
    });

    test('maxRetries 0 runs once and rejects immediately', () async {
      int calls = 0;
      await expectLater(
        retryWithBackoff<String>(
          () async {
            calls++;
            throw StateError('only');
          },
          budget: const RetryBudget(maxRetries: 0),
          sleep: record(),
        ),
        throwsStateError,
      );
      expect(calls, 1);
      expect(slept, isEmpty);
    });
  });

  group('withTimeout (:36-50)', () {
    test('a fast future passes through', () async {
      expect(
        await withTimeout<String>(
          Future<String>.value('ok'),
          const Duration(seconds: 1),
        ),
        'ok',
      );
    });

    test('a slow future rejects with the web\'s message', () async {
      final Future<String> slow = Future<String>.delayed(
        const Duration(milliseconds: 50),
        () => 'late',
      );
      await expectLater(
        withTimeout<String>(
          slow,
          const Duration(milliseconds: 5),
          label: 'SlowOp',
        ),
        throwsA(
          isA<JsError>().having(
            (JsError e) => e.message,
            'message',
            'SlowOp timed out after 5ms',
          ),
        ),
      );
    });

    test('the rejection string is the web\'s message with no prefix', () async {
      // `api.ts:38` rejects `new Error(msg)`, so `String(err)` on the web is
      // `'Error: msg'` at worst and `err.message` is exactly `msg`. Dart's
      // `TimeoutException.toString()` leads with the class and the interval
      // (`'TimeoutException after 0:00:15.000000: …'`), which would put a
      // Dart-internal string in front of the user (deviation 2 ruling).
      await expectLater(
        withTimeout<String>(
          Completer<String>().future,
          const Duration(milliseconds: 2),
          label: 'syncStateFromSupabase',
        ),
        throwsA(
          predicate<Object>(
            (Object e) =>
                e.toString() == 'syncStateFromSupabase timed out after 2ms',
            'toString() equal to the web message',
          ),
        ),
      );
    });

    test('the default label is "Operation"', () async {
      await expectLater(
        withTimeout<String>(
          Completer<String>().future,
          const Duration(milliseconds: 1),
        ),
        throwsA(
          isA<JsError>().having(
            (JsError e) => e.message,
            'message',
            'Operation timed out after 1ms',
          ),
        ),
      );
    });

    test('a rejecting future rejects as itself, not as a timeout', () async {
      await expectLater(
        withTimeout<String>(
          Future<String>.error(StateError('boom')),
          const Duration(seconds: 1),
        ),
        throwsStateError,
      );
    });

    test('the underlying work is not cancelled (:38-48)', () async {
      // The web's timer only rejects the race; the promise keeps running and its
      // result is dropped. Dart's `Future.timeout` does the same, and this pins it,
      // because a cancelled-dio port would abort requests the web leaves in flight.
      bool completed = false;
      await expectLater(
        withTimeout<String>(
          Future<String>.delayed(const Duration(milliseconds: 20), () {
            completed = true;
            return 'done';
          }),
          const Duration(milliseconds: 2),
        ),
        throwsA(isA<JsError>()),
      );
      await Future<void>.delayed(const Duration(milliseconds: 40));
      expect(completed, isTrue);
    });
  });

  test('the two nested budgets multiply, as the web composes them', () async {
    // A push runs the round-trip budget around a function that itself uses the RPC
    // budget, so a fully failing push sleeps
    // (500, 1000) then (2000, 4000) — 7.5 s of waiting before the caller sees an
    // error. Recorded here so a "simplification" of either budget is a visible
    // change, not an accidental one.
    final List<Duration> rpcSleeps = <Duration>[];
    final List<Duration> pushSleeps = <Duration>[];

    Future<void> rpc() => retryWithBackoff<void>(
      () async => throw StateError('rpc'),
      budget: RetryBudget.syncRpc,
      sleep: (Duration d) async => rpcSleeps.add(d),
    );

    await expectLater(
      retryWithBackoff<void>(
        rpc,
        budget: RetryBudget.syncRoundTrip,
        sleep: (Duration d) async => pushSleeps.add(d),
      ),
      throwsStateError,
    );
    expect(
      rpcSleeps.length,
      2 * 3,
    ); // each push attempt burns the full RPC schedule
    expect(pushSleeps, const <Duration>[
      Duration(milliseconds: 2000),
      Duration(milliseconds: 4000),
    ]);
  });
}
