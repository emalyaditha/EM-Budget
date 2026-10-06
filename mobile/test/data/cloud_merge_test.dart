import 'package:em_budget/data/cloud_merge.dart';
import 'package:em_budget/models/app_state.dart';
import 'package:em_budget/models/entities.dart';
import 'package:flutter_test/flutter_test.dart';

import 'web_source.dart';

/// `mergeCloudIntoLocal` (`src/App.tsx:213-250`).
///
/// The states here are built through `AppState.fromJson` rather than the
/// constructors, so a model change that drops a field shows up as a wrong merge
/// instead of a compile error in a hand-written literal.
AppState state({
  List<Map<String, Object?>> transactions = const <Map<String, Object?>>[],
  List<Map<String, Object?>> cards = const <Map<String, Object?>>[],
  List<Map<String, Object?>> creditCards = const <Map<String, Object?>>[],
  List<Map<String, Object?>> cashAccounts = const <Map<String, Object?>>[],
  String currency = 'Rs.',
  String pinCode = '',
  bool pinEnabled = false,
  String name = 'User',
  String email = 'owner@example.com',
  String? avatarUrl,
}) {
  return AppState.fromJson(<String, Object?>{
    'transactions': transactions,
    'cards': cards,
    'creditCards': creditCards,
    'cashAccounts': cashAccounts,
    'currency': currency,
    'pinCode': pinCode,
    'pinEnabled': pinEnabled,
    'userProfile': <String, Object?>{
      'name': name,
      'email': email,
      'avatarUrl': ?avatarUrl,
    },
  });
}

Map<String, Object?> tx(String id, num amount) => <String, Object?>{
  'id': id,
  'type': 'expense',
  'title': id,
  'amount': amount,
  'date': '2026-10-01',
  'category': 'Food',
};

Map<String, Object?> card(String id, num currentBalance) => <String, Object?>{
  'id': id,
  'cardName': id,
  'bankName': 'Bank',
  'cardType': 'Debit',
  'currentBalance': currentBalance,
};

void main() {
  group('the union keeps the LOCAL copy of a shared id', () {
    test('a row edited locally while the pull was in flight survives', () {
      final AppState merged = mergeCloudIntoLocal(
        state(transactions: <Map<String, Object?>>[tx('t1', 1)]),
        state(transactions: <Map<String, Object?>>[tx('t1', 100)]),
      );
      // `INVENTORY.md` §6 says "cloud wins"; `:216` iterates local first and `:219`
      // keeps the first entry, so the cloud copy of an id the local state already
      // holds is the one that is thrown away.
      expect(merged.transactions.single.amount, 100);
    });

    test('the same is true for cards', () {
      final AppState merged = mergeCloudIntoLocal(
        state(cards: <Map<String, Object?>>[card('bc-1', 5)]),
        state(cards: <Map<String, Object?>>[card('bc-1', 500)]),
      );
      expect(merged.cards.single.currentBalance, 500);
    });

    test('a local-only row and a cloud-only row both survive, local first', () {
      final AppState merged = mergeCloudIntoLocal(
        state(transactions: <Map<String, Object?>>[tx('cloud-only', 2)]),
        state(transactions: <Map<String, Object?>>[tx('local-only', 1)]),
      );
      // `Array.from(byId.values())` is insertion order, and the loop is
      // `[...localArr, ...cloudArr]`.
      expect(merged.transactions.map((Transaction t) => t.id), <String>[
        'local-only',
        'cloud-only',
      ]);
    });

    test('a duplicate id within one side is first-wins, not last-wins', () {
      final AppState merged = mergeCloudIntoLocal(
        state(),
        state(transactions: <Map<String, Object?>>[tx('t1', 1), tx('t1', 2)]),
      );
      expect(merged.transactions, hasLength(1));
      expect(merged.transactions.single.amount, 1);
    });

    test('a row with no id is dropped from either side', () {
      final AppState merged = mergeCloudIntoLocal(
        state(transactions: <Map<String, Object?>>[tx('', 1)]),
        state(transactions: <Map<String, Object?>>[tx('', 2)]),
      );
      expect(merged.transactions, isEmpty);
    });
  });

  group('tombstones', () {
    test('remove the id from the cloud copy', () {
      final AppState merged = mergeCloudIntoLocal(
        state(transactions: <Map<String, Object?>>[tx('gone', 9)]),
        state(),
        tombstones: <String>{'gone'},
      );
      expect(merged.transactions, isEmpty);
    });

    test('and from the LOCAL copy too — the guard runs on every item', () {
      // `:219` tests `!tombstones.has(item.id)` before anything distinguishes the
      // two sides, so a local row whose id was recorded as deleted cannot be kept
      // by the merge either.
      final AppState merged = mergeCloudIntoLocal(
        state(),
        state(transactions: <Map<String, Object?>>[tx('gone', 9)]),
        tombstones: <String>{'gone'},
      );
      expect(merged.transactions, isEmpty);
    });

    test(
      'are the only thing that can drop a cloud id the local state never had',
      () {
        final AppState merged = mergeCloudIntoLocal(
          state(transactions: <Map<String, Object?>>[tx('a', 1), tx('b', 2)]),
          state(),
          tombstones: <String>{'a'},
        );
        expect(merged.transactions.map((Transaction t) => t.id), <String>['b']);
      },
    );
  });

  group('what the union does NOT cover', () {
    test('creditCards is cloud-wins wholesale', () {
      final AppState merged = mergeCloudIntoLocal(
        state(
          creditCards: <Map<String, Object?>>[
            <String, Object?>{'id': 'cc-cloud', 'name': 'Cloud'},
          ],
        ),
        state(
          creditCards: <Map<String, Object?>>[
            <String, Object?>{'id': 'cc-local', 'name': 'Local'},
          ],
        ),
      );
      // Not in the union list at `:226-242`, so `...cloud` at `:225` decides it.
      expect(merged.creditCards.map((CreditCard c) => c.id), <String>[
        'cc-cloud',
      ]);
    });

    test(
      'cashAccounts IS unioned — the list is not "the money collections"',
      () {
        final AppState merged = mergeCloudIntoLocal(
          state(
            cashAccounts: <Map<String, Object?>>[
              <String, Object?>{'id': 'ca-2', 'name': 'Cloud', 'balance': 1},
            ],
          ),
          state(
            cashAccounts: <Map<String, Object?>>[
              <String, Object?>{'id': 'ca-1', 'name': 'Local', 'balance': 2},
            ],
          ),
        );
        expect(merged.cashAccounts.map((CashAccount c) => c.id), <String>[
          'ca-1',
          'ca-2',
        ]);
      },
    );
  });

  group('scalars', () {
    test('currency prefers a truthy local value', () {
      expect(
        mergeCloudIntoLocal(
          state(currency: 'USD'),
          state(currency: 'LKR'),
        ).currency,
        'LKR',
      );
      // `local.currency || cloud.currency` — an empty local currency is falsy.
      expect(
        mergeCloudIntoLocal(
          state(currency: 'USD'),
          state(currency: ''),
        ).currency,
        'USD',
      );
    });

    test('everything else on AppState follows the cloud', () {
      final AppState merged = mergeCloudIntoLocal(
        state(pinCode: '1234', pinEnabled: true),
        state(pinCode: '', pinEnabled: false),
      );
      expect(merged.pinCode, '1234');
      expect(merged.pinEnabled, isTrue);
    });

    test(
      'the profile is field-wise: cloud for name and avatar, local for email',
      () {
        final AppState merged = mergeCloudIntoLocal(
          state(
            name: 'Cloud K',
            email: 'cloud@example.com',
            avatarUrl: '/c.png',
          ),
          state(
            name: 'Local K',
            email: 'local@example.com',
            avatarUrl: '/l.png',
          ),
        );
        expect(merged.userProfile.name, 'Cloud K');
        expect(merged.userProfile.avatarUrl, '/c.png');
        expect(merged.userProfile.email, 'local@example.com');
      },
    );

    test('a cloud avatar wipes a local one, and an empty local email falls back', () {
      final AppState merged = mergeCloudIntoLocal(
        state(name: 'Cloud K', email: 'cloud@example.com'),
        state(name: 'Local K', email: '', avatarUrl: '/only-local.png'),
      );
      // `{ ...local.userProfile, ...cloud.userProfile }` copies `avatarUrl: undefined`
      // as an own key, and the phone's model has no other reading of it either.
      expect(merged.userProfile.avatarUrl, isNull);
      expect(merged.userProfile.email, 'cloud@example.com');
    });
  });

  group('drift guard against the web source', () {
    test(
      'the unioned collection list is exactly the fourteen this port merges',
      () {
        final String appTsx = webSource('src/App.tsx');
        final int at = appTsx.indexOf('function mergeCloudIntoLocal(');
        expect(
          at,
          greaterThanOrEqualTo(0),
          reason: 'mergeCloudIntoLocal moved',
        );
        final String body = appTsx.substring(at, appTsx.indexOf('\n}', at));
        final List<String> unioned = RegExp(
          r'^\s{4}([A-Za-z]+): union\(',
          multiLine: true,
        ).allMatches(body).map((RegExpMatch m) => m.group(1)!).toList();
        expect(unioned.toSet(), <String>{
          'cards',
          'cashAccounts',
          'transactions',
          'creditCardPurchases',
          'debts',
          'incomes',
          'expenses',
          'notifications',
          'subscriptions',
          'loansGiven',
          'budgets',
          'savingsGoals',
          'creditCardInstallments',
          'creditCardInstallmentPayments',
        });
        // `creditCards` is deliberately absent — that is the finding, not an oversight.
        expect(unioned, isNot(contains('creditCards')));
      },
    );

    test('local still comes first in both spreads', () {
      final String appTsx = webSource('src/App.tsx');
      expect(
        appTsx.contains('[...(localArr || []), ...(cloudArr || [])]'),
        isTrue,
        reason: 'the union order flipped; the merge now destroys local edits',
      );
      expect(
        RegExp(r'\.\.\.local,\s*\.\.\.cloud,').hasMatch(appTsx),
        isTrue,
        reason: 'the scalar spread flipped; cloud no longer wins by default',
      );
      expect(
        appTsx.contains('currency: local.currency || cloud.currency'),
        isTrue,
      );
    });
  });
}
