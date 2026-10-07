import 'dart:convert';

/// The transport the ledger repository is written against.
///
/// `src/supabase.ts` talks to PostgREST through one `SupabaseClient`, and the two
/// functions that move the ledger use four distinct query shapes. They are named here
/// as they are used on the web, so a missing-table branch or a swallowed error can be
/// traced back to the line that decides it:
///
/// - [syncCompleteLedger] — the 14-parameter `SECURITY DEFINER` transaction
///   (`:790`), the only write path (B2);
/// - [upsertLedgerSnapshot] — the best-effort JSON mirror that follows a successful
///   RPC (`:824-833`);
/// - [fetchTable] — the ten relational reads of the pull path, which are allowed to
///   fail *only* as "this table is not there" (`:927-954`);
/// - [fetchSubscriptions], [fetchAuthAccount], [fetchLedgerSnapshot],
///   [fetchLoansGiven] — the four parallel reads whose errors the web swallows with a
///   warning (`:991-1070`).
///
/// Per-request timeouts are the implementation's business, not the repository's: the
/// web wraps every call in `withTimeout(…, 5000, …)`, which does not cancel the
/// underlying request either, and `ApiClient` already pins the same budget on the
/// transport. The one timeout the repository *does* own is the 15-second wall over the
/// whole pull (`:922`, `:1167`), because that is a property of the sync, not of a call.
abstract class LedgerGateway {
  /// Runs `sync_complete_ledger`. Throws [LedgerErrorException] when PostgREST reports
  /// an error or the RPC returns `{success: false}`, which is what the web turns into a
  /// thrown `Error` inside the retry (`:791-796`).
  Future<void> syncCompleteLedger(Map<String, Object?> payload);

  /// `upsert` of the sanitised snapshot into `ledger_states`, keyed on `user_email`.
  Future<void> upsertLedgerSnapshot({
    required String email,
    required Map<String, Object?> state,
    required String updatedAtIso,
  });

  /// `select *` from [table], filtered to this account when the table has a user column.
  ///
  /// The web reads `getSchemaColumns(table)` first and skips the query entirely when
  /// the table is unknown (`:929-932`), then re-checks the error for the same
  /// condition (`:944-951`). Both routes mean "no rows", and are the caller's business;
  /// an implementation reports the second as a [LedgerErrorException] carrying the
  /// SQLSTATE or message the driver gave.
  Future<List<Map<String, Object?>>> fetchTable(String table);

  Future<List<Map<String, Object?>>> fetchSubscriptions(String email);

  /// `auth_accounts` by email, or `null` when there is no row (`maybeSingle`).
  Future<Map<String, Object?>?> fetchAuthAccount(String email);

  /// The newest `ledger_states.state` for [email].
  ///
  /// [exists] is the web's `hasLedgerStateRecord` (`:1036`): it is set as soon as a row
  /// comes back, *before* the JSON body is read, so a row holding a corrupt string
  /// still counts as "this user has a database". That distinction decides whether the
  /// budgets and savings jars of a new user fall back to the seed.
  Future<LedgerSnapshot> fetchLedgerSnapshot(String email);

  Future<List<Map<String, Object?>>> fetchLoansGiven(String email);
}

/// `ledger_states` as the pull path sees it: whether a row exists, and whatever the
/// `state` column held — a decoded object, or the JSON string PostgREST may return.
class LedgerSnapshot {
  const LedgerSnapshot({required this.exists, this.state});

  const LedgerSnapshot.none() : exists = false, state = null;

  final bool exists;
  final Object? state;

  /// `typeof latestStateData.state === 'string' ? JSON.parse(...) : state` (`:1038-1039`).
  ///
  /// A string that will not decode **throws**, because that is what `JSON.parse` does
  /// inside the web's `try`: the fetch logs its warning and the snapshot is lost, while
  /// [exists] — set at `:1036`, *before* the body was read — stays true. Callers must
  /// therefore read this after setting their own flag, not before.
  ///
  /// The result is `Object?`, not a map: `JSON.parse('[1,2]')` is truthy on the web and
  /// becomes a `fullJsonStateStr` with no fields, so a non-object decodes to "no state"
  /// without being an error.
  Object? decode() {
    final Object? raw = state;
    if (raw is String) return jsonDecode(raw);
    return raw;
  }
}

/// A PostgREST failure with the two facts the web branches on: `code` (the SQLSTATE,
/// tested against `42P01`) and `message` (tested for `does not exist` / `schema cache`).
final class LedgerErrorException implements Exception {
  const LedgerErrorException(this.message, {this.code});

  final String message;
  final String? code;

  /// `error.code === '42P01' || (error.message && (message.includes('does not exist')
  /// || message.includes('schema cache')))` (`:944-947`).
  ///
  /// The `error.message &&` guard is a truthiness test, so an empty message never
  /// matches; the two substrings are case-sensitive on the web and stay so here.
  bool get isMissingTable {
    if (code == '42P01') return true;
    if (message.isEmpty) return false;
    return message.contains('does not exist') ||
        message.contains('schema cache');
  }

  @override
  String toString() => 'LedgerErrorException($code): $message';
}
