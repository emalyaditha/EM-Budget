import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:em_budget/auth/session_token.dart';

import 'fake_server.dart';

/// The client half of `server/security.ts:16-53`. The server verifies an HMAC the phone
/// cannot compute, so everything the phone can legitimately know is in the payload — and
/// the payload is the one part a tampered token can still parse. That is why these tests
/// assert "parses", never "is authentic".
void main() {
  group('SessionToken.tryParse', () {
    test('reads a token in the shape the server issues', () {
      final raw = makeToken('qa-someone@example.com', 1_800_000_000_000);
      final parsed = SessionToken.tryParse(raw);
      expect(parsed, isNotNull);
      expect(parsed!.email, 'qa-someone@example.com');
      expect(parsed.expiresAt, 1_800_000_000_000);
      expect(parsed.raw, raw);
    });

    test('survives a payload whose base64url needs padding', () {
      // Chosen so the encoded length is not a multiple of four — the server emits no
      // padding, `base64Url.decode` demands it, and this is the branch that would
      // otherwise throw FormatException out of a parse that is documented to return null.
      final raw = makeToken('a@b.co', 1_800_000_000_000);
      final payload = raw.substring(0, raw.lastIndexOf('.'));
      expect(
        payload.length % 4,
        isNot(0),
        reason: 'payload $payload is unpadded, which is the case under test',
      );
      expect(SessionToken.tryParse(raw), isNotNull);
    });

    test('returns null, never throws, on input a hostile storage could hold', () {
      String payload(String json) =>
          base64Url.encode(utf8.encode(json)).replaceAll('=', '');
      final cases = <String>[
        '',
        '.',
        'no-dot',
        'dot-at-end.',
        '.leading',
        'not-base64!!!.abcdef',
        '${payload(r'"a string"')}.deadbeef',
        '${payload(r'{"email":"a@b.co"}')}.deadbeef',
        '${payload(r'{"email":"a@b.co","expiresAt":"1800000000000"}')}.deadbeef',
        '${payload(r'{"email":"a@b.co","expiresAt":1.5}')}.deadbeef',
      ];
      for (final raw in cases) {
        expect(
          SessionToken.tryParse(raw),
          isNull,
          reason: 'should not parse: $raw',
        );
      }
    });

    test('keeps the whole token when the payload itself contains no dot', () {
      final raw = makeToken('has.dot@example.com', 1_800_000_000_000);
      // The signature separator is the LAST dot; a dot inside the email is not it.
      final parsed = SessionToken.tryParse(raw);
      expect(parsed!.email, 'has.dot@example.com');
      expect(parsed.raw, raw);
    });
  });

  group('expiry', () {
    test('a token expiring exactly now is not yet expired, one millisecond later is', () {
      final token = SessionToken.tryParse(makeToken('a@b.co', 1_000))!;
      expect(token.isExpiredAt(1_000), isFalse);
      expect(token.isExpiredAt(1_001), isTrue);
    });

    test('mirrors the server rotation boundary: 24h + 1ms is long-lived, 24h is not', () {
      // `server.ts:3175` `decoded.expiresAt - Date.now() > SESSION_TTL_SHORT`, where
      // SESSION_TTL_SHORT is 24h. The comparison is strict, so exactly 24h of remaining
      // life is treated as a short session and is never rotated.
      final exactly24h = SessionToken.tryParse(
        makeToken('a@b.co', 10_000 + SessionToken.shortTtlMs),
      )!;
      expect(exactly24h.isLongLivedAt(10_000), isFalse);
      final oneMsMore = SessionToken.tryParse(
        makeToken('a@b.co', 10_000 + SessionToken.shortTtlMs + 1),
      )!;
      expect(oneMsMore.isLongLivedAt(10_000), isTrue);
    });

    test('the two TTLs are the server constants, not invented ones', () {
      expect(SessionToken.shortTtlMs, 24 * 60 * 60 * 1000);
      expect(SessionToken.longTtlMs, 30 * 24 * 60 * 60 * 1000);
    });
  });
}
