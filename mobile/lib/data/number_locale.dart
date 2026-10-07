/// The locale metadata `Number.prototype.toLocaleString` reads from the runtime,
/// made an explicit argument.
///
/// `src/lib/money.ts:61` formats with `toLocaleString(undefined, …)`, so the separators,
/// the grouping shape and the digits are the *browser's* locale — an `en-IN` browser
/// renders `1,25,000` and a `de-DE` one renders `1.234.567,89` from the same number. The
/// phone has to do the same with *its* locale or it is not porting that line, and the
/// two must still be reproducible in a test, which is why this is a value passed in
/// rather than a global read deep inside the formatter.
///
/// What is taken from the runtime, and what is not:
///
/// - **Taken**: the separators, the grouping sizes, the zero digit (so `ar-EG` renders
///   `١٢٣٤` and `my-MM` renders `၁၂၃၄`), and the negative prefix/suffix. This is CLDR
///   data, and Dart's `intl` carries the same tables ICU does — measured across ten
///   locales against V8 in `parity/fixtures/number-locale.json`.
/// - **Not taken**: the rounding. `intl`'s `NumberFormat` rounds `1.005` to `1.00` where
///   V8's `toLocaleString` rounds it to `1.01`, and it saturates an integer above
///   `2^63-1` at `9,223,372,036,854,775,807` where V8 expands `1e22` to its real digits.
///   Both were measured, both are in `jsToLocaleStringFixed`'s own fixture, and both are
///   the reason `intl` supplies the *metadata* here while
///   `js_semantics.dart::_ShortestDecimal` supplies the *digits*.
library;

import 'dart:ui' show PlatformDispatcher;

import 'package:intl/intl.dart' show NumberFormat;

/// One locale's number-formatting metadata.
class JsNumberLocale {
  const JsNumberLocale({
    required this.tag,
    required this.decimalSeparator,
    required this.groupSeparator,
    required this.primaryGroup,
    required this.secondaryGroup,
    required this.zeroDigit,
    required this.negativePrefix,
    required this.negativeSuffix,
  });

  /// The BCP-47 tag this was resolved from, as supplied by the caller.
  final String tag;
  final String decimalSeparator;
  final String groupSeparator;

  /// Digits in the right-hand group. `0` disables grouping entirely.
  final int primaryGroup;

  /// Digits in every group left of the first one: `3` for `en-US`, `2` for the
  /// `en-IN`/`hi-IN`/`bn-BD` lakh shape (`12,34,567`).
  final int secondaryGroup;

  /// The code point standing for value `0`, so `ar-EG` is `٠` and `my-MM` is `၀`.
  final String zeroDigit;
  final String negativePrefix;
  final String negativeSuffix;

  static final Map<String, JsNumberLocale> _cache = <String, JsNumberLocale>{};

  /// The metadata for [localeTag], read from the runtime's CLDR data.
  ///
  /// Unknown subtags fall back the way V8's does — the locale is normalised, not
  /// rejected — so `resolve('en-GB')` and `resolve('en-GB-u-nu-latn')` both produce
  /// something rather than throwing, a tag with no data at all still produces the
  /// `en-US` shape (see `_derive`), and `resolve` is cheap because it is cached per tag.
  factory JsNumberLocale.resolve(String localeTag) {
    return _cache.putIfAbsent(localeTag, () => _derive(localeTag));
  }

  /// The locale the app formats in: the phone's, read once per tag.
  ///
  /// This is deliberately the *platform* locale rather than `intl`'s own default, which
  /// is a process-global that stays at `en_US` unless an app sets it — defaulting to that
  /// would pin `en-US` under another name.
  static JsNumberLocale device() => JsNumberLocale.resolve(deviceLocaleTag());

  @override
  String toString() => 'JsNumberLocale($tag)';
}

/// The device's locale tag, e.g. `en-IN` or `de-DE`.
String deviceLocaleTag() => PlatformDispatcher.instance.locale.toLanguageTag();

JsNumberLocale _derive(String tag) {
  final NumberFormat? probe = _probe(tag);
  if (probe == null) {
    // V8 never rejects a locale: an unparseable or unsupported tag falls back to the
    // runtime default and the call still returns. `intl` throws `ArgumentError` once no
    // entry in its fallback chain exists — which is only reachable for a language it has
    // no data for at all, since `en-GB` and `en-GB-u-nu-latn` both resolve. The money
    // formatter must not be the thing that stops a phone from rendering a balance, so the
    // tag is resolved against `en-US`, the default this app's goldens were measured under.
    final JsNumberLocale root = _derive('en-US');
    return JsNumberLocale(
      tag: tag,
      decimalSeparator: root.decimalSeparator,
      groupSeparator: root.groupSeparator,
      primaryGroup: root.primaryGroup,
      secondaryGroup: root.secondaryGroup,
      zeroDigit: root.zeroDigit,
      negativePrefix: root.negativePrefix,
      negativeSuffix: root.negativeSuffix,
    );
  }
  final String groupSep = probe.symbols.GROUP_SEP;
  final List<int> grouping = _groupingOf(probe, groupSep);
  return JsNumberLocale(
    tag: tag,
    decimalSeparator: probe.symbols.DECIMAL_SEP,
    groupSeparator: groupSep,
    primaryGroup: grouping[0],
    secondaryGroup: grouping[1],
    zeroDigit: probe.symbols.ZERO_DIGIT,
    negativePrefix: probe.negativePrefix,
    negativeSuffix: probe.negativeSuffix,
  );
}

/// `intl`'s decimal pattern for [tag], or `null` if it has no data for that language.
NumberFormat? _probe(String tag) {
  try {
    return NumberFormat.decimalPattern(tag.replaceAll('-', '_'));
  } on ArgumentError {
    return null;
  }
}

/// Primary and secondary group sizes, read off a formatted 13-digit integer.
///
/// The sizes are what the pattern says, and `intl` keeps those private, but its output
/// cannot lie about them: splitting a long number on the group separator yields the
/// groups themselves. Thirteen digits is long enough that the right-hand group and at
/// least two of the repeating ones are present in every locale's shape, so `[3,2]` and
/// `[3,3]` are told apart without parsing a CLDR pattern.
List<int> _groupingOf(NumberFormat probe, String groupSep) {
  if (groupSep.isEmpty) return <int>[0, 0];
  final List<String> groups = probe.format(1234567890123).split(groupSep);
  // Fewer than two separators would mean the locale groups nothing, or groups in a run
  // longer than the probe — both are "no grouping" for the amounts this formats.
  if (groups.length < 3) return <int>[0, 0];
  final int primary = groups.last.length;
  final int secondary = groups[groups.length - 2].length;
  return <int>[primary, secondary];
}
