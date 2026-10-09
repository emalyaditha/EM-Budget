/// Port of the **unrounded** interest figure, `calculateInterest` at
/// `src/components/CreditCardManagement.tsx:67-71` (B-03, ruled *replicate* in
/// `parity/LOGIC_SPEC.md` §12).
///
/// This function is module-private inside a `.tsx`, so the fixture generator could not
/// import it: it extracts those five lines from the `pre-flutter` blob and evaluates them
/// verbatim, recording the extracted text and its hash in the fixture's provenance. The
/// golden is therefore the original bytes, not a re-implementation — and this file is the
/// only hand-written half of the pair.
///
/// It differs from `interestForCycle` (`lib/domain/credit_cards.dart`, the figure the
/// engine actually charges) in exactly two ways, both of which must survive:
///
/// * **no rounding** — the UI can show `786.2942465753425` for a cycle the engine bills as
///   `786.29`;
/// * **no day guard** — `days <= 0` is untested, so a negative day count yields a negative
///   interest figure where the engine returns `0`.
///
/// The live call site (`CreditCardManagement.tsx:326`) is
/// `calculateInterest(c.currentBalance, c.apr || 0, 30)`: `|| 0` means an unset APR can
/// never reach it as `undefined`, and the day count is a literal 30, so the `NaN`/`-1`
/// cases in the fixture are contract probes rather than observed UI states. They are
/// ported anyway — the signature accepts any `num`, and a later caller would find the
/// behaviour, not a guard.
library;

/// `calculateInterest` — the figure the card list shows, not the figure the ledger charges.
num displayInterest(num balance, num apr, num days) {
  if (balance >= 0 || apr <= 0) return 0;
  final num dailyRate = apr / 100 / 365;
  return balance.abs() * dailyRate * days;
}
