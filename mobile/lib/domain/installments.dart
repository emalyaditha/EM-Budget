import '../data/dates_local.dart';
import '../data/js_semantics.dart';
import '../models/entities.dart';
import '../models/entities_ledger.dart';
import 'money.dart';

/// Port of `src/lib/installments.ts` at the `pre-flutter` tag (blob unchanged),
/// specified by `parity/LOGIC_SPEC.md` §5 and pinned by
/// `parity/fixtures/installments.json` (61 cases).
///
/// Two things about this file are load-bearing and easy to "improve" away, so they are
/// stated where the code is read rather than only in the spec. First, its dates come
/// from [addMonthsClamped] — the **local-midnight** regime — while the credit-card cycle
/// engine (`lib/domain/credit_cards.dart`, when it lands) does UTC string arithmetic on
/// the same plan. That split is the web's, and §5 says to replicate both. Second, the
/// fee table is a lookup with `|| 0`, so an unlisted tenure is not an error: a 18-month
/// plan silently carries no fee, and a 0% fee on a 6-month plan is indistinguishable
/// from a typo. Neither is fixed here.

/// `SAMPATH_ESP_FEES` — tenure months to processing-fee percent.
const Map<int, num> sampathEspFees = <int, num>{6: 0, 12: 7.5, 24: 15, 48: 30};

/// `calculateInstallmentFee`. `|| 0` is [jsTruthy]'s rule, not `?? 0`: a stored `0` or a
/// `NaN` limit behaves the same way here as it does on the web.
num calculateInstallmentFee(num amount, int tenureMonths) {
  final num feePercent = jsTruthy(sampathEspFees[tenureMonths])
      ? sampathEspFees[tenureMonths]!
      : 0;
  return asJsonSafeNumber(jsMathRound((amount * feePercent) / 100 * 100) / 100);
}

/// `calculateMonthlyPayment`. **No guard on `tenureMonths == 0`** — the web divides and
/// gets `Infinity`, and the golden records it as the `Infinity` sentinel.
num calculateMonthlyPayment(num amount, int tenureMonths) {
  return asJsonSafeNumber(jsMathRound(amount / tenureMonths * 100) / 100);
}

/// One row of `generateInstallmentSchedule`'s result: the web's
/// `Omit<CreditCardInstallmentPayment, 'id'>`. It is a separate type because the id does
/// not exist yet at this point — callers mint it when they persist the row.
final class InstallmentScheduleRow {
  const InstallmentScheduleRow({
    required this.installmentId,
    required this.paymentNumber,
    required this.amountDue,
    required this.amountPaid,
    required this.dueDate,
    required this.status,
  });

  final String installmentId;
  final int paymentNumber;
  final num amountDue;
  final num amountPaid;
  final String dueDate;
  final String status;

  Map<String, Object?> toJson() => <String, Object?>{
    'installmentId': installmentId,
    'paymentNumber': paymentNumber,
    'amountDue': amountDue,
    'amountPaid': amountPaid,
    'dueDate': dueDate,
    'status': status,
  };
}

/// `generateInstallmentSchedule`.
List<InstallmentScheduleRow> generateInstallmentSchedule(
  String installmentId,
  num monthlyPayment,
  int tenureMonths,
  String startDate, [
  num? originalAmount,
]) {
  final List<InstallmentScheduleRow> payments = <InstallmentScheduleRow>[];

  final int baseCents = jsMathRound(monthlyPayment * 100).toInt();
  // An equal monthlyPayment rounded to cents usually does not tile the principal
  // (10000 / 12 → 833.33 × 12 = 9999.96), so the last installment absorbs the
  // remainder. `?? ` mirrors `originalAmount ?? monthlyPayment * tenureMonths`: an
  // explicit 0 is used, not skipped.
  final int targetTotalCents = jsMathRound(
    (originalAmount ?? monthlyPayment * tenureMonths) * 100,
  ).toInt();

  for (int i = 1; i <= tenureMonths; i++) {
    int amountDueCents = baseCents;
    if (i == tenureMonths) {
      final int absorbed = targetTotalCents - baseCents * (tenureMonths - 1);
      // Strictly greater than zero: a remainder of `0` or negative leaves the base
      // amount in place, so a plan whose `originalAmount` is smaller than
      // `(tenure − 1) · monthlyPayment` does not tile the principal. That is the web's
      // behaviour and the golden for `[1000, 4, '2026-01-15', 2500]` proves it.
      if (absorbed > 0) amountDueCents = absorbed;
    }

    payments.add(
      InstallmentScheduleRow(
        installmentId: installmentId,
        paymentNumber: i,
        amountDue: asJsonSafeNumber(amountDueCents / 100),
        amountPaid: 0,
        // Clamped, not `setMonth`: a plan started on the 31st would otherwise owe its
        // February payment on 3 March instead of 28 February.
        dueDate: addMonthsClamped(startDate, i),
        status: 'pending',
      ),
    );
  }
  return payments;
}

/// `isCardEligibleForInstallment`'s result. `reason` is **absent**, not null, when the
/// card is eligible — the web returns `{ eligible: true }` and the canonical JSON of
/// that object has one key.
final class InstallmentEligibility {
  const InstallmentEligibility.eligible() : reason = null;
  const InstallmentEligibility.blocked(this.reason);

  final String? reason;

  bool get eligible => reason == null;

  Map<String, Object?> toJson() => <String, Object?>{
    'eligible': eligible,
    if (reason != null) 'reason': reason,
  };
}

/// `isCardEligibleForInstallment`. Ordered gates, first failure wins.
InstallmentEligibility isCardEligibleForInstallment(
  BankCard card,
  num purchaseAmount,
) {
  if (card.cardType != 'Credit') {
    return const InstallmentEligibility.blocked(
      'Only credit cards support installment plans',
    );
  }
  if (jsTruthy(card.isCanceled)) {
    return const InstallmentEligibility.blocked('Card is cancelled');
  }
  if (jsTruthy(card.isFrozen)) {
    return const InstallmentEligibility.blocked('Card is frozen');
  }
  if (purchaseAmount < 5000) {
    return const InstallmentEligibility.blocked(
      'Minimum installment amount is Rs. 5,000',
    );
  }
  // `Math.abs` only when the balance is negative: a positive balance is not outstanding.
  final num outstanding = card.currentBalance < 0
      ? card.currentBalance.abs()
      : 0;
  final num limit = jsTruthy(card.limit) ? card.limit! : 0;
  if (outstanding > limit) {
    return InstallmentEligibility.blocked(
      'Card is over limit by Rs. ${jsToFixed(outstanding - limit, 2)}. '
      'Pay down balance before creating installment plans.',
    );
  }
  final num available = limit + card.currentBalance;
  if (purchaseAmount > available) {
    return InstallmentEligibility.blocked(
      'Purchase exceeds available credit of Rs. ${jsToFixed(available, 2)}',
    );
  }
  return const InstallmentEligibility.eligible();
}

/// `getInstallmentProgress`'s result. Every key is always present — `nextDue` is
/// explicitly `null` when nothing is pending, which the golden writes as `"nextDue":null`.
final class InstallmentProgress {
  const InstallmentProgress({
    required this.paid,
    required this.total,
    required this.percentage,
    required this.nextDue,
  });

  final int paid;
  final int total;
  final int percentage;
  final String? nextDue;

  Map<String, Object?> toJson() => <String, Object?>{
    'paid': paid,
    'total': total,
    'percentage': percentage,
    'nextDue': nextDue,
  };
}

/// `getInstallmentProgress`.
InstallmentProgress getInstallmentProgress(
  CreditCardInstallment installment,
  List<CreditCardInstallmentPayment> payments,
) {
  final List<CreditCardInstallmentPayment> matching = payments
      .where(
        (CreditCardInstallmentPayment p) => p.installmentId == installment.id,
      )
      .toList();
  // `Array#sort` is stable in V8 and `List#sort` is not, and this comparator has no
  // tiebreak, so equal `paymentNumber`s would come out in a different order on the
  // phone. Decorating with the original index and ordering by it second reproduces the
  // stability rather than assuming it. (`DATA_SPEC.md` §6, `LOGIC_SPEC.md` §5.)
  final List<int> order = List<int>.generate(matching.length, (int i) => i)
    ..sort((int a, int b) {
      final int byNumber = matching[a].paymentNumber.compareTo(
        matching[b].paymentNumber,
      );
      return byNumber != 0 ? byNumber : a.compareTo(b);
    });
  final List<CreditCardInstallmentPayment> sorted = order
      .map((int i) => matching[i])
      .toList();

  final int paid = sorted
      .where((CreditCardInstallmentPayment p) => p.status == 'paid')
      .length;
  final int total = sorted.length;
  final int percentage = total > 0
      ? jsMathRound(paid / total * 100).toInt()
      : 0;
  CreditCardInstallmentPayment? nextPending;
  for (final CreditCardInstallmentPayment p in sorted) {
    if (p.status == 'pending') {
      nextPending = p;
      break;
    }
  }

  return InstallmentProgress(
    paid: paid,
    total: total,
    percentage: percentage,
    // `nextPending?.dueDate || null` — an empty due date is falsy on the web and
    // becomes null rather than the empty string.
    nextDue: jsTruthy(nextPending?.dueDate) ? nextPending!.dueDate : null,
  );
}

/// `formatFeeBreakdown`'s result.
final class FeeBreakdown {
  const FeeBreakdown({
    required this.processingFee,
    required this.monthlyPayment,
    required this.totalCost,
    required this.feePercent,
  });

  final num processingFee;
  final num monthlyPayment;
  final num totalCost;
  final num feePercent;

  Map<String, Object?> toJson() => <String, Object?>{
    'processingFee': processingFee,
    'monthlyPayment': monthlyPayment,
    'totalCost': totalCost,
    'feePercent': feePercent,
  };
}

/// `formatFeeBreakdown`. `totalCost` is a **plain float add**, not `addMoney` — the web
/// does not route it through the cent core, so this is a second B-04-style site and is
/// ported as one.
FeeBreakdown formatFeeBreakdown(num amount, int tenureMonths) {
  final num processingFee = calculateInstallmentFee(amount, tenureMonths);
  final num monthlyPayment = calculateMonthlyPayment(amount, tenureMonths);
  final num totalCost = amount + processingFee;
  final num feePercent = jsTruthy(sampathEspFees[tenureMonths])
      ? sampathEspFees[tenureMonths]!
      : 0;

  return FeeBreakdown(
    processingFee: processingFee,
    monthlyPayment: monthlyPayment,
    totalCost: asJsonSafeNumber(totalCost),
    feePercent: feePercent,
  );
}
