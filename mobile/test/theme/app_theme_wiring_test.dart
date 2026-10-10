// Phase 5, playbook 2.4 step 4: the shell must render the ported design system,
// not Material defaults. ui_tokens_test.dart proves the tokens are the measured
// ones; this proves they actually reach a BuildContext in both brightness modes.

import 'package:em_budget/core/theme/app_colors.dart';
import 'package:em_budget/core/theme/app_theme.dart';
import 'package:em_budget/core/theme/app_typography.dart';
import 'package:em_budget/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Future<ThemeData> _themeFor(WidgetTester tester, Brightness brightness) async {
  tester.platformDispatcher.platformBrightnessTestValue = brightness;
  addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
  await tester.pumpWidget(const MainApp());
  return Theme.of(tester.element(find.byType(Scaffold)));
}

void main() {
  testWidgets('the light pass renders the measured light tokens', (
    tester,
  ) async {
    final ThemeData theme = await _themeFor(tester, Brightness.light);
    expect(theme.extension<AppTokens>(), AppTokens.light);
    expect(theme.scaffoldBackgroundColor, AppColors.bgLight);
    expect(theme.cardColor, AppColors.surfaceLight);
    expect(theme.colorScheme.primary, AppColors.accentLight);
    expect(
      theme.textTheme.titleLarge?.fontSize,
      AppTypography.sizesByToken['--text-lg'],
    );
  });

  testWidgets('the dark pass renders the measured dark tokens', (tester) async {
    final ThemeData theme = await _themeFor(tester, Brightness.dark);
    expect(theme.extension<AppTokens>(), AppTokens.dark);
    expect(theme.scaffoldBackgroundColor, AppColors.bgDark);
    expect(theme.cardColor, AppColors.surfaceDark);
    expect(theme.colorScheme.primary, AppColors.accentDark);
  });

  test('a ThemeData registers exactly one AppTokens, per brightness', () {
    for (final bool isDark in <bool>[false, true]) {
      final Map<Object, ThemeExtension<dynamic>> extensions = appThemeData(
        isDark: isDark,
      ).extensions;
      final List<AppTokens> registered = extensions.values
          .whereType<AppTokens>()
          .toList();
      expect(
        registered.length,
        1,
        reason:
            'ThemeData keys extensions by runtimeType: registering '
            'both passes would silently keep the last one, isDark=$isDark',
      );
      expect(
        extensions.length,
        1,
        reason: 'exactly one extension isDark=$isDark',
      );
      expect(registered.single, isDark ? AppTokens.dark : AppTokens.light);
    }
  });

  test('no Material baseline colour survives the port', () {
    for (final bool isDark in <bool>[false, true]) {
      final ColorScheme scheme = appThemeData(isDark: isDark).colorScheme;
      // M3 defaults that would otherwise surface wherever the web never
      // measured a value: purple-40 primary, and its own surface/onSurface.
      expect(
        scheme.primary,
        isDark ? AppColors.accentDark : AppColors.accentLight,
      );
      expect(
        scheme.surface,
        isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
      );
      expect(scheme.onSurface, isDark ? AppColors.inkDark : AppColors.inkLight);
    }
  });
}
