import '../data/js_semantics.dart';

/// The first unit of `src/lib/creditCards.ts` to land: [interestForCycle], which
/// `parity/fixtures/display-interest.json` needs on the **engine** side of every
/// `pair:` case. The rest of the Sampath cycle engine — the deduction anchor,
/// `computeMinimumPayment`, `latePaymentFee`, `runCycleRollover` — arrives with task
/// #63 **in this file**, so the two halves of the interest pair are never maintained by
/// two copies that can drift apart.
///
/// Note the guard shape. `!(aprPercent > 0)` is not `aprPercent <= 0`: the negated
/// comparison makes `NaN` and `undefined` APR return `0`, while the display twin
/// (`displayInterest`, `LOGIC_SPEC.md` §12) tests `apr <= 0`, lets both through and
/// multiplies them into `NaN`. That asymmetry is the whole point of B-03 and is pinned
/// by `display-interest.json`.

/// `interestForCycle` — `src/lib/creditCards.ts:233-237`. The **charged** figure: the
/// Sampath daily-balance rule rounded to two decimals, and `0` for a credit balance, an
/// unset/zero/negative/NaN APR, or no elapsed days.
num interestForCycle(num balance, num aprPercent, num days) {
  if (balance >= 0 || !(aprPercent > 0) || days <= 0) return 0;
  final num raw = balance.abs() * (aprPercent / 100 / 365) * days;
  return jsMathRound(raw * 100) / 100;
}
