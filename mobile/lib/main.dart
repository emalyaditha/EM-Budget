import 'package:flutter/material.dart';

import 'core/theme/app_theme.dart';

void main() {
  runApp(const MainApp());
}

/// The app shell. Playbook 2.4 step 4 replaces the flutter-create placeholder
/// styling with the ported design system: every colour, radius and text role
/// below comes from parity/ui-tokens.json via appThemeData, and ThemeMode.system
/// is what the web does (the OS decides, the app never overrides it).
class MainApp extends StatelessWidget {
  const MainApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      theme: appThemeData(isDark: false),
      darkTheme: appThemeData(isDark: true),
      themeMode: ThemeMode.system,
      home: const Scaffold(body: Center(child: Text('Hello World!'))),
    );
  }
}
