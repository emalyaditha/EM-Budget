/// Port of `src/validators/index.ts` at the `pre-flutter` tag, specified by
/// `parity/LOGIC_SPEC.md` §11 and pinned by `parity/fixtures/validators.json`.
///
/// The web app uses Zod; there is no Dart equivalent to depend on, and eight
/// hand-written validators would each have silently re-decided the rules Zod supplies for
/// free — what `received undefined` says versus `received null`, which check speaks
/// first, the order issues come out in, whether an unknown key is kept. So this file is a
/// small Zod-compatible engine containing only the primitives those schemas actually use,
/// followed by the schemas themselves in source order, so a reviewer can read it against
/// `src/validators/index.ts` line by line.
///
/// Every message string is either copied from the schema (a custom message the web author
/// wrote) or measured from Zod 4 at the tag (a default). The defaults are the dangerous
/// half: they read like prose a later editor would "improve", and `validateData`'s output
/// is one joined **string**, so a paraphrase is undetectable. Cases for all of them are in
/// the fixture so nothing here is a guess.
library;

/// The JS value `undefined`, kept distinct from `null`.
///
/// `DATA_SPEC.md` §1 collapses *absent ≡ `undefined`* for ledger state and the port is
/// right to. Here they are separate goldens — `BankCard missing id` reports
/// `received undefined`, `BankCard null cardNumber` reports `received null` — because Zod
/// reads the property, not the key. Validation therefore needs three input states.
class JsUndefined {
  const JsUndefined();
}

/// The single instance; compared by identity.
const JsUndefined jsUndefined = JsUndefined();

/// What a schema returns when it rejected the value, as distinct from [jsUndefined]
/// ("nothing to put in the output").
class Rejected {
  const Rejected();
}

const Rejected _rejected = Rejected();

/// One Zod issue: its path segments and its message.
class SchemaIssue {
  const SchemaIssue(this.path, this.message);

  final List<Object> path;
  final String message;

  /// `${err.path.join('.') || 'Root'}: ${err.message}` — `src/validators/index.ts:194`.
  String render() => '${path.isEmpty ? 'Root' : path.join('.')}: $message';
}

typedef IssueSink = void Function(SchemaIssue issue);

/// A check that runs after the type has been established; returns a message on failure.
typedef SchemaCheck = String? Function(Object? value);

enum SchemaKind {
  string,
  number,
  boolean,
  enumeration,
  literal,
  unknown,
  array,
  object,
  union,
}

/// A schema node. Build one through the named factories, each of which mirrors one Zod
/// call in the web file.
class Schema {
  const Schema._(
    this.kind, {
    this.checks = const <SchemaCheck>[],
    this.optional = false,
    this.defaultTo,
    this.options = const <String>[],
    this.literalValue,
    this.element,
    this.fields = const <SchemaField>[],
    this.branches = const <Schema>[],
  });

  final SchemaKind kind;
  final List<SchemaCheck> checks;

  /// `z.…().optional()` — an absent or `undefined` value is accepted and the key is left
  /// **out** of the output, not set to null.
  final bool optional;

  /// `z.…().default(v)`. A function, so a mutable default (`[]`) is re-created per parse
  /// the way Zod's `_def.defaultValue()` is.
  final Object? Function()? defaultTo;

  final List<String> options;
  final String? literalValue;
  final Schema? element;
  final List<SchemaField> fields;
  final List<Schema> branches;

  factory Schema.string({
    List<SchemaCheck> checks = const <SchemaCheck>[],
    bool optional = false,
    Object? Function()? defaultTo,
  }) => Schema._(
    SchemaKind.string,
    checks: checks,
    optional: optional,
    defaultTo: defaultTo,
  );

  factory Schema.number({
    List<SchemaCheck> checks = const <SchemaCheck>[],
    bool optional = false,
    Object? Function()? defaultTo,
  }) => Schema._(
    SchemaKind.number,
    checks: checks,
    optional: optional,
    defaultTo: defaultTo,
  );

  factory Schema.boolean({
    bool optional = false,
    Object? Function()? defaultTo,
  }) => Schema._(SchemaKind.boolean, optional: optional, defaultTo: defaultTo);

  factory Schema.enumeration(
    List<String> options, {
    bool optional = false,
    Object? Function()? defaultTo,
  }) => Schema._(
    SchemaKind.enumeration,
    options: options,
    optional: optional,
    defaultTo: defaultTo,
  );

  factory Schema.literal(String value) =>
      Schema._(SchemaKind.literal, literalValue: value);

  factory Schema.unknown() => Schema._(SchemaKind.unknown);

  factory Schema.array(
    Schema element, {
    bool optional = false,
    Object? Function()? defaultTo,
  }) => Schema._(
    SchemaKind.array,
    element: element,
    optional: optional,
    defaultTo: defaultTo,
  );

  factory Schema.object(List<SchemaField> fields) =>
      Schema._(SchemaKind.object, fields: fields);

  factory Schema.union(List<Schema> branches) =>
      Schema._(SchemaKind.union, branches: branches);

  /// The word Zod prints for this type in `expected …, received …`.
  String get _typeName => switch (kind) {
    SchemaKind.string => 'string',
    SchemaKind.number => 'number',
    SchemaKind.boolean => 'boolean',
    SchemaKind.array => 'array',
    SchemaKind.object => 'object',
    SchemaKind.enumeration => 'string',
    SchemaKind.literal => 'string',
    SchemaKind.unknown => 'unknown',
    SchemaKind.union => 'union',
  };

  /// `Invalid option: expected one of "Debit"|"Credit"` — options quoted and pipe-joined
  /// in declaration order.
  String get _enumMessage =>
      'Invalid option: expected one of '
      '${options.map((String o) => '"$o"').join('|')}';

  /// The message a **required** field produces when the key was absent. An enum answers
  /// with its option list instead of `received undefined`, and a literal with its own
  /// text — measured on `BankCard missing cardType` and `LedgerExportV1 wrong literal`,
  /// and different from `BankCard missing id` above it.
  String get _missingMessage => switch (kind) {
    SchemaKind.enumeration => _enumMessage,
    SchemaKind.literal => 'Invalid input: expected "$literalValue"',
    _ => 'Invalid input: expected $_typeName, received undefined',
  };

  /// Parses [input], reporting into [emit]. Returns the parsed value, [jsUndefined] when
  /// the key should be omitted, or [Rejected].
  Object? parse(Object? input, List<Object> path, IssueSink emit) {
    final Object? typed = kind == SchemaKind.object
        ? _parseObject(input, path, emit)
        : _parseLeaf(input, path, emit);
    if (identical(typed, _rejected) || identical(typed, jsUndefined)) {
      return typed;
    }
    for (final SchemaCheck check in checks) {
      final String? message = check(typed);
      if (message != null) {
        emit(SchemaIssue(path, message));
        return _rejected;
      }
    }
    return typed;
  }

  /// The entry point for a key of an object: the three-state lookup, then the default,
  /// then optionality, then the real parse.
  Object? parseField(Object? raw, List<Object> path, IssueSink emit) {
    if (identical(raw, jsUndefined)) {
      final Object? Function()? producer = defaultTo;
      if (producer != null) return producer();
      if (optional) return jsUndefined;
      emit(SchemaIssue(path, _missingMessage));
      return _rejected;
    }
    return parse(raw, path, emit);
  }

  Object? _parseLeaf(Object? input, List<Object> path, IssueSink emit) {
    switch (kind) {
      case SchemaKind.string:
        return input is String ? input : _fail(input, path, emit);
      case SchemaKind.number:
        // Zod 4's number *type* check is `typeof x === 'number' && isFinite(x)`, so
        // `.finite()` is never reached: `NaN` is named, and an Infinity is simply a
        // number that fails. Both spellings are goldens.
        if (input is! num) return _fail(input, path, emit);
        if (input is double && !input.isFinite) return _fail(input, path, emit);
        return input;
      case SchemaKind.boolean:
        return input is bool ? input : _fail(input, path, emit);
      case SchemaKind.enumeration:
        if (input is! String || !options.contains(input)) {
          emit(SchemaIssue(path, _enumMessage));
          return _rejected;
        }
        return input;
      case SchemaKind.literal:
        if (input != literalValue) {
          emit(SchemaIssue(path, 'Invalid input: expected "$literalValue"'));
          return _rejected;
        }
        return input;
      case SchemaKind.unknown:
        // `z.unknown()` accepts anything it is handed, `null` included, and keeps the
        // value as it came. This is what a restore collection's elements are made of.
        return input;
      case SchemaKind.array:
        if (input is! List) return _fail(input, path, emit);
        final Schema inner = element!;
        final List<Object?> out = <Object?>[];
        bool failed = false;
        for (int i = 0; i < input.length; i++) {
          final Object? parsed = inner.parse(input[i], <Object>[
            ...path,
            i,
          ], emit);
          if (identical(parsed, _rejected)) {
            failed = true;
            out.add(input[i]);
          } else {
            out.add(parsed);
          }
        }
        return failed ? _rejected : out;
      case SchemaKind.object:
        return _parseObject(input, path, emit);
      case SchemaKind.union:
        // A union does not say which branch spoke: one issue, at the path it was given,
        // message `Invalid input`. That is why `Root: Invalid input` is the whole of a
        // rejected restore payload.
        for (final Schema branch in branches) {
          final List<SchemaIssue> scratch = <SchemaIssue>[];
          final Object? parsed = branch.parse(input, path, scratch.add);
          if (scratch.isEmpty && !identical(parsed, _rejected)) return parsed;
        }
        emit(SchemaIssue(path, 'Invalid input'));
        return _rejected;
    }
  }

  Object? _parseObject(Object? input, List<Object> path, IssueSink emit) {
    if (input is! Map) return _fail(input, path, emit);
    final Map<Object?, Object?> source = input;
    final Map<String, Object?> out = <String, Object?>{};
    bool failed = false;
    for (final SchemaField field in fields) {
      final List<Object> fieldPath = <Object>[...path, field.name];
      final Object? raw = source.containsKey(field.name)
          ? source[field.name]
          : jsUndefined;
      final Object? value = field.schema.parseField(raw, fieldPath, emit);
      if (identical(value, _rejected)) {
        failed = true;
        continue;
      }
      if (identical(value, jsUndefined)) continue;
      // The output is in **schema** key order, not input order, and an absent optional
      // key is missing rather than null — both goldens (`Transaction valid`,
      // `BankCard defaults injected`).
      out[field.name] = value;
    }
    return failed ? _rejected : out;
  }

  Object? _fail(Object? input, List<Object> path, IssueSink emit) {
    emit(
      SchemaIssue(
        path,
        'Invalid input: expected $_typeName, received ${_describe(input)}',
      ),
    );
    return _rejected;
  }
}

/// One `shape` entry of an object schema.
class SchemaField {
  const SchemaField(this.name, this.schema);

  final String name;
  final Schema schema;
}

/// What Zod calls the received value: `undefined`, `null`, `NaN`, `string`, `number`,
/// `boolean`, `array`, `object`. An Infinity is described as `number` even though the
/// check that rejected it was `isFinite`.
String _describe(Object? input) {
  if (identical(input, jsUndefined)) return 'undefined';
  if (input == null) return 'null';
  if (input is String) return 'string';
  if (input is bool) return 'boolean';
  if (input is double && input.isNaN) return 'NaN';
  if (input is num) return 'number';
  if (input is List) return 'array';
  return 'object';
}

// ---------------------------------------------------------------------------
// The checks. A custom message is the web author's text, copied exactly; the `??`
// fallback is Zod 4's default, measured at the tag.
// ---------------------------------------------------------------------------

/// `z.string().min(n, msg)` — default `Too small: expected string to have >=N characters`.
SchemaCheck minLength(int n, [String? message]) =>
    (Object? value) => (value! as String).length >= n
    ? null
    : message ?? 'Too small: expected string to have >=$n characters';

/// `z.string().max(n, msg)` — default `Too big: expected string to have <=N characters`.
SchemaCheck maxLength(int n, [String? message]) =>
    (Object? value) => (value! as String).length <= n
    ? null
    : message ?? 'Too big: expected string to have <=$n characters';

/// `z.string().regex(re, msg)` — default `Invalid string: must match pattern /source/`,
/// where the source is printed as the web file wrote it.
SchemaCheck matches(RegExp pattern, String source, [String? message]) =>
    (Object? value) => pattern.hasMatch(value! as String)
    ? null
    : message ?? 'Invalid string: must match pattern /$source/';

/// `z.number().positive(msg)`. Every `positive()` in these eight schemas carries its own
/// message, so there is no default to reproduce and none is invented here.
SchemaCheck positive(String message) =>
    (Object? value) => (value! as num) > 0 ? null : message;

/// `z.number().nonnegative(msg)` — default `Too small: expected number to be >=0`, which
/// `DebtSchema.remainingAmount` is the only field ever to show.
SchemaCheck nonNegative([String? message]) =>
    (Object? value) => (value! as num) >= 0
    ? null
    : message ?? 'Too small: expected number to be >=0';

/// `.refine((val) => !/[<>{}]/.test(val), {message})` — runs **after** `min` and `max`.
SchemaCheck noHtml(String message) =>
    (Object? value) => _htmlChars.hasMatch(value! as String) ? message : null;

final RegExp _htmlChars = RegExp(r'[<>{}]');

/// `/^\d{4}-\d{2}-\d{2}/` — anchored at the start only, so a full timestamp validates
/// (`BankCard dueDate as full timestamp`). The web's laxness, replicated.
SchemaCheck datePrefix([String? message]) =>
    matches(_datePattern, _datePatternSource, message);

final RegExp _datePattern = RegExp(r'^\d{4}-\d{2}-\d{2}');
const String _datePatternSource = r'^\d{4}-\d{2}-\d{2}';

/// The PAN rule, inline in `BankCardSchema.cardNumber` — there is no exported pattern.
final RegExp _panPattern = RegExp(
  r'^(\*\*\*\* \d{4}|[•*]{4} [•*]{4} [•*]{4} \d{4}|\d{16})$',
);
const String _panPatternSource =
    r'^(\*\*\*\* \d{4}|[•*]{4} [•*]{4} [•*]{4} \d{4}|\d{16})$';

// ---------------------------------------------------------------------------
// The eight schemas, in the order `src/validators/index.ts` declares them.
// ---------------------------------------------------------------------------

/// `CategoryExpenseSchema` — the private twelve-option expense list.
final Schema _categoryExpense = Schema.enumeration(<String>[
  'Food',
  'Transport',
  'Shopping',
  'Utilities',
  'Rent',
  'Entertainment',
  'Medical',
  'Education',
  'Insurance',
  'Loan',
  'Bank Charges & Interest',
  'Other',
]);

/// `CashAccountSchema`.
final Schema cashAccountSchema = Schema.object(<SchemaField>[
  SchemaField(
    'id',
    Schema.string(checks: <SchemaCheck>[minLength(1, 'ID is required')]),
  ),
  SchemaField(
    'name',
    Schema.string(
      checks: <SchemaCheck>[
        minLength(3, 'Account name must be at least 3 characters'),
        maxLength(50, 'Account name must be under 50 characters'),
        noHtml('Account name contains illegal HTML characters'),
      ],
    ),
  ),
  SchemaField('balance', Schema.number(defaultTo: () => 0)),
]);

/// `BankCardSchema`. Four fields carry defaults the port must inject; `cardNumber` is the
/// rule that accepts a raw 16-digit PAN (B-13) and rejects the QA harness's mask (B-14).
final Schema bankCardSchema = Schema.object(<SchemaField>[
  SchemaField(
    'id',
    Schema.string(checks: <SchemaCheck>[minLength(1, 'ID is required')]),
  ),
  SchemaField(
    'cardName',
    Schema.string(
      checks: <SchemaCheck>[
        minLength(3, 'Card name must be at least 3 characters'),
        maxLength(40, 'Card name must be under 40 characters'),
        noHtml('Card name contains illegal HTML characters'),
      ],
    ),
  ),
  SchemaField(
    'bankName',
    Schema.string(
      checks: <SchemaCheck>[
        minLength(2, 'Bank name must be at least 2 characters'),
        maxLength(50, 'Bank name must be under 50 characters'),
        noHtml('Bank name contains illegal HTML characters'),
      ],
    ),
  ),
  SchemaField('cardType', Schema.enumeration(<String>['Debit', 'Credit'])),
  SchemaField('currentBalance', Schema.number()),
  SchemaField(
    'limit',
    Schema.number(
      optional: true,
      checks: <SchemaCheck>[
        nonNegative('Limit must be greater than or equal to 0'),
      ],
    ),
  ),
  SchemaField(
    'isLimitLocked',
    Schema.boolean(optional: true, defaultTo: () => true),
  ),
  SchemaField(
    'cardNumber',
    Schema.string(
      optional: true,
      checks: <SchemaCheck>[
        matches(
          _panPattern,
          _panPatternSource,
          'Card number must be 16 digits or masked standard (**** 1234)',
        ),
      ],
    ),
  ),
  SchemaField(
    'isCanceled',
    Schema.boolean(optional: true, defaultTo: () => false),
  ),
  SchemaField(
    'cardTheme',
    Schema.string(optional: true, defaultTo: () => 'obsidian'),
  ),
  SchemaField(
    'isFrozen',
    Schema.boolean(optional: true, defaultTo: () => false),
  ),
  SchemaField(
    'dueDate',
    Schema.string(
      optional: true,
      checks: <SchemaCheck>[
        datePrefix('Invalid due date (must be YYYY-MM-DD)'),
      ],
    ),
  ),
  SchemaField(
    'minPayment',
    Schema.number(
      optional: true,
      checks: <SchemaCheck>[nonNegative('Minimum payment cannot be negative')],
    ),
  ),
  SchemaField(
    'apr',
    Schema.number(
      optional: true,
      checks: <SchemaCheck>[nonNegative('APR cannot be negative')],
    ),
  ),
  SchemaField(
    'lastPaymentDate',
    Schema.string(
      optional: true,
      checks: <SchemaCheck>[
        datePrefix('Invalid last payment date (must be YYYY-MM-DD)'),
      ],
    ),
  ),
  SchemaField(
    'statementCloseDate',
    Schema.string(
      optional: true,
      checks: <SchemaCheck>[
        datePrefix('Invalid statement close date (must be YYYY-MM-DD)'),
      ],
    ),
  ),
]);

/// `TransactionSchema`. `category` is a **free string** here, which is landmine 11 in
/// `INVENTORY.md` §5: the value a subscription rejects, a transaction accepts.
final Schema transactionSchema = Schema.object(<SchemaField>[
  SchemaField(
    'id',
    Schema.string(checks: <SchemaCheck>[minLength(1, 'ID is required')]),
  ),
  SchemaField(
    'type',
    Schema.enumeration(<String>[
      'income',
      'expense',
      'debt_payment',
      'deposit',
      'withdrawal',
      'transfer',
      'credit_card_charge',
      'financing',
    ]),
  ),
  SchemaField(
    'title',
    Schema.string(
      checks: <SchemaCheck>[
        minLength(3, 'Title is too short'),
        maxLength(100, 'Title is too long'),
      ],
    ),
  ),
  SchemaField(
    'amount',
    Schema.number(
      checks: <SchemaCheck>[
        positive('Transaction amount must be a positive number'),
      ],
    ),
  ),
  SchemaField(
    'charge',
    Schema.number(
      optional: true,
      checks: <SchemaCheck>[nonNegative('Charge cannot be negative')],
    ),
  ),
  SchemaField(
    'date',
    Schema.string(
      checks: <SchemaCheck>[
        datePrefix('Invalid date format (must be YYYY-MM-DD)'),
      ],
    ),
  ),
  SchemaField(
    'category',
    Schema.string(checks: <SchemaCheck>[minLength(1, 'Category is required')]),
  ),
  SchemaField('accountId', Schema.string(optional: true)),
  SchemaField(
    'accountType',
    Schema.enumeration(<String>['cash', 'card'], optional: true),
  ),
  SchemaField('targetAccountId', Schema.string(optional: true)),
  SchemaField(
    'targetAccountType',
    Schema.enumeration(<String>['cash', 'card'], optional: true),
  ),
  SchemaField('referenceId', Schema.string(optional: true)),
]);

/// `DebtPaymentSchema` — private in the web file, reached only through a debt's
/// `payments` array, and the reason the messageless defaults are in the fixture.
final Schema _debtPaymentSchema = Schema.object(<SchemaField>[
  SchemaField(
    'id',
    Schema.string(checks: <SchemaCheck>[minLength(1, 'ID is required')]),
  ),
  SchemaField('debtId', Schema.string(checks: <SchemaCheck>[minLength(1)])),
  SchemaField(
    'amount',
    Schema.number(checks: <SchemaCheck>[positive('Payment must be positive')]),
  ),
  SchemaField('date', Schema.string(checks: <SchemaCheck>[datePrefix()])),
  SchemaField('paidFromId', Schema.string(checks: <SchemaCheck>[minLength(1)])),
  SchemaField('paidFromType', Schema.enumeration(<String>['cash', 'card'])),
]);

/// `DebtSchema`.
final Schema debtSchema = Schema.object(<SchemaField>[
  SchemaField(
    'id',
    Schema.string(checks: <SchemaCheck>[minLength(1, 'ID is required')]),
  ),
  SchemaField(
    'debtSource',
    Schema.string(
      checks: <SchemaCheck>[
        minLength(3, 'Debt source too short'),
        maxLength(60),
      ],
    ),
  ),
  SchemaField(
    'totalAmount',
    Schema.number(
      checks: <SchemaCheck>[positive('Total debt amount must be positive')],
    ),
  ),
  SchemaField(
    'remainingAmount',
    Schema.number(checks: <SchemaCheck>[nonNegative()]),
  ),
  SchemaField('dueDate', Schema.string(checks: <SchemaCheck>[datePrefix()])),
  SchemaField(
    'notes',
    Schema.string(checks: <SchemaCheck>[maxLength(500)], defaultTo: () => ''),
  ),
  SchemaField(
    'payments',
    Schema.array(_debtPaymentSchema, defaultTo: () => <Object?>[]),
  ),
  SchemaField('accountId', Schema.string(optional: true)),
  SchemaField(
    'accountType',
    Schema.enumeration(<String>['cash', 'card'], optional: true),
  ),
  SchemaField('accountName', Schema.string(optional: true)),
  SchemaField(
    'status',
    Schema.enumeration(
      <String>['Active', 'Closed', 'Fully Repaid'],
      optional: true,
      defaultTo: () => 'Active',
    ),
  ),
]);

/// `SubscriptionSchema`.
final Schema subscriptionSchema = Schema.object(<SchemaField>[
  SchemaField(
    'id',
    Schema.string(checks: <SchemaCheck>[minLength(1, 'ID is required')]),
  ),
  SchemaField(
    'name',
    Schema.string(
      checks: <SchemaCheck>[minLength(3, 'Name is too short'), maxLength(60)],
    ),
  ),
  SchemaField(
    'amount',
    Schema.number(
      checks: <SchemaCheck>[positive('Subscription charge must be positive')],
    ),
  ),
  SchemaField(
    'billingCycle',
    Schema.enumeration(<String>['Monthly', 'Yearly']),
  ),
  SchemaField('dueDate', Schema.string(checks: <SchemaCheck>[datePrefix()])),
  SchemaField('category', _categoryExpense),
  SchemaField(
    'status',
    Schema.enumeration(<String>[
      'Active',
      'Paused',
      'Cancelled',
    ], defaultTo: () => 'Active'),
  ),
  SchemaField(
    'paymentMethodId',
    Schema.string(optional: true, checks: <SchemaCheck>[minLength(1)]),
  ),
  SchemaField(
    'paymentMethodType',
    Schema.enumeration(<String>['cash', 'card'], optional: true),
  ),
  SchemaField(
    'lastPaidDate',
    Schema.string(optional: true, checks: <SchemaCheck>[datePrefix()]),
  ),
  SchemaField('instanceType', Schema.string(optional: true)),
]);

/// The fifteen keys of `RestoreCollectionFieldsSchema`, in the web's order — which is the
/// order a successful parse emits.
const List<String> _collectionKeys = <String>[
  'cashAccounts',
  'cards',
  'creditCards',
  'creditCardPurchases',
  'creditCardInstallments',
  'creditCardInstallmentPayments',
  'incomes',
  'expenses',
  'debts',
  'transactions',
  'notifications',
  'subscriptions',
  'loansGiven',
  'budgets',
  'savingsGoals',
];

/// `CollectionListSchema` = `z.array(z.unknown())`. The guard is only that the collection
/// **is an array**; its contents pass through untouched.
Schema _collectionList({bool optional = true}) =>
    Schema.array(Schema.unknown(), optional: optional);

/// `BareRestoreStateSchema` — the fifteen optional keys with the three that could wipe
/// state made required. `.extend()` overwrites the value but keeps the key's original
/// position (`{...a.shape, ...b.shape}`), so this is one list in the base order rather
/// than the base followed by the three overrides.
final Schema bareRestoreStateSchema = Schema.object(<SchemaField>[
  for (final String key in _collectionKeys)
    SchemaField(
      key,
      _collectionList(
        optional: !const <String>[
          'cashAccounts',
          'cards',
          'transactions',
        ].contains(key),
      ),
    ),
]);

/// `LedgerExportV1Schema`.
final Schema ledgerExportV1Schema = Schema.object(<SchemaField>[
  SchemaField('version', Schema.literal('EM_BUDGET_SECURE_EX_V1')),
  SchemaField('exportedBy', Schema.string(optional: true)),
  SchemaField('exportedAt', Schema.string(optional: true)),
  SchemaField(
    'data',
    Schema.object(<SchemaField>[
      for (final String key in _collectionKeys)
        SchemaField(key, _collectionList()),
    ]),
  ),
]);

/// `LedgerRestorePayloadSchema` — envelope first, bare state second. Which branch matched
/// is invisible in a rejection and visible in a success, so the order is part of the
/// contract even though no message says so.
final Schema ledgerRestorePayloadSchema = Schema.union(<Schema>[
  ledgerExportV1Schema,
  bareRestoreStateSchema,
]);

/// `validateData` (`src/validators/index.ts:188-198`).
class ValidationResult {
  const ValidationResult._(this.success, this.data, this.error);

  /// `{ success: true, data }`.
  factory ValidationResult.ok(Object? data) =>
      ValidationResult._(true, data, null);

  /// `{ success: false, error }` — a **joined string**, there is no `errors` array to
  /// port.
  factory ValidationResult.fail(String error) =>
      ValidationResult._(false, null, error);

  final bool success;
  final Object? data;
  final String? error;

  /// The shape `validators.json` measures — `{ok, parsed}` or `{ok, error}` — so a replay
  /// compares whole maps instead of re-deciding which half is meaningful.
  Map<String, Object?> asFixtureJson() => success
      ? <String, Object?>{'ok': true, 'parsed': data}
      : <String, Object?>{'ok': false, 'error': error};
}

ValidationResult validateData(Schema schema, Object? data) {
  final List<SchemaIssue> issues = <SchemaIssue>[];
  final Object? parsed = schema.parse(data, const <Object>[], issues.add);
  if (issues.isEmpty && !identical(parsed, _rejected)) {
    return ValidationResult.ok(parsed);
  }
  return ValidationResult.fail(
    issues.map((SchemaIssue issue) => issue.render()).join('; '),
  );
}

/// The web's eight exported schemas, by the name `validators/index.ts` gives them.
///
/// `validators.json` names the schema each case ran, so the replay looks it up instead of
/// hard-coding one per test — the same reason `DebtPaymentSchema` is reachable only through
/// a debt and is not listed here.
Schema schemaNamed(String name) => switch (name) {
  'CashAccountSchema' => cashAccountSchema,
  'BankCardSchema' => bankCardSchema,
  'TransactionSchema' => transactionSchema,
  'DebtSchema' => debtSchema,
  'SubscriptionSchema' => subscriptionSchema,
  'BareRestoreStateSchema' => bareRestoreStateSchema,
  'LedgerExportV1Schema' => ledgerExportV1Schema,
  'LedgerRestorePayloadSchema' => ledgerRestorePayloadSchema,
  _ => throw StateError('No schema ported under the name $name'),
};
