import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:em_budget/main.dart';

void main() {
  // The shell is the `flutter create --empty` placeholder; Phase 5 replaces it with the
  // ported theme and router, at which point this test is replaced by screen goldens.
  testWidgets('the shell renders a Scaffold', (tester) async {
    await tester.pumpWidget(const MainApp());
    expect(find.byType(Scaffold), findsOneWidget);
  });
}
