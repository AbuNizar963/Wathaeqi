import 'package:flutter/material.dart';

/// Semantic brand tokens mirrored by client/src/index.css and
/// docs/DESIGN_SYSTEM_WEB_MOBILE_AR.md. Keep platform layouts native while
/// keeping the shared visual identity stable.
abstract final class AppPalette {
  static const navy = Color(0xFF132D43);
  static const brandBlue = Color(0xFF0F9F9A);
  static const canvas = Color(0xFFF4F7FA);
  static const surface = Color(0xFFFFFFFF);
  static const ink = Color(0xFF16283B);
  static const muted = Color(0xFFEEF2F6);
  static const mutedInk = Color(0xFF5B6B7C);
  static const border = Color(0xFFDCE5ED);
  static const danger = Color(0xFFC2414D);
  static const success = Color(0xFF147A66);
  static const warning = Color(0xFF8C570F);
  static const info = Color(0xFF3978C5);
  static const sidebarAccent = Color(0xFF1D4054);

  static const darkCanvas = Color(0xFF0C1722);
  static const darkSurface = Color(0xFF142536);
  static const darkInk = Color(0xFFECF3F8);
  static const darkMuted = Color(0xFF1D3345);
  static const darkMutedInk = Color(0xFFAFC0CE);
  static const darkBorder = Color(0xFF294154);
  static const darkOutline = Color(0xFF3A5368);
  static const darkSidebarAccent = Color(0xFF1D4054);
  static const darkSuccess = Color(0xFF54D5C9);
  static const darkWarning = Color(0xFFF2C36B);
  static const darkInfo = Color(0xFF72B6F2);
  static const successContainer = Color(0xFFE7F6F1);
  static const darkSuccessContainer = Color(0xFF123A35);
  static const warningContainer = Color(0xFFFFF4E2);
  static const darkWarningContainer = Color(0xFF40331B);
  static const infoContainer = Color(0xFFEAF2FC);
  static const darkInfoContainer = Color(0xFF172B45);

  static const lightScheme = ColorScheme.light(
    primary: navy,
    onPrimary: surface,
    secondary: brandBlue,
    onSecondary: navy,
    surface: surface,
    onSurface: ink,
    onSurfaceVariant: mutedInk,
    tertiary: info,
    onTertiary: surface,
    primaryContainer: Color(0xFFE7EEF4),
    onPrimaryContainer: navy,
    secondaryContainer: Color(0xFFDDF4F1),
    onSecondaryContainer: navy,
    surfaceTint: navy,
    error: danger,
    onError: surface,
    outline: border,
    outlineVariant: border,
    surfaceContainerLowest: surface,
    surfaceContainerLow: canvas,
    surfaceContainer: muted,
    surfaceContainerHigh: muted,
    surfaceContainerHighest: muted,
  );

  static const darkScheme = ColorScheme.dark(
    primary: brandBlue,
    onPrimary: navy,
    secondary: brandBlue,
    onSecondary: navy,
    surface: darkSurface,
    onSurface: darkInk,
    onSurfaceVariant: darkMutedInk,
    tertiary: Color(0xFF72B6F2),
    onTertiary: Color(0xFF132D43),
    primaryContainer: Color(0xFF1D4054),
    onPrimaryContainer: darkInk,
    secondaryContainer: Color(0xFF1D3B5D),
    onSecondaryContainer: Color(0xFFDDF4F1),
    surfaceTint: brandBlue,
    error: Color(0xFFF97066),
    onError: Color(0xFF341118),
    outline: darkOutline,
    outlineVariant: darkBorder,
    surfaceContainerLowest: darkCanvas,
    surfaceContainerLow: darkSurface,
    surfaceContainer: darkMuted,
    surfaceContainerHigh: darkMuted,
    surfaceContainerHighest: darkMuted,
  );
}

/// Centralized Material 3 themes for the mobile application.
///
/// Keep component defaults here instead of scattering platform colors
/// throughout individual screens. Use [ColorScheme] for contextual colors.
abstract final class AppTheme {
  static ThemeData get light =>
      ThemeData(
        useMaterial3: true,
        fontFamily: 'Cairo',
        scaffoldBackgroundColor: AppPalette.canvas,
        colorScheme: AppPalette.lightScheme,
        textTheme:
            const TextTheme(
              bodyLarge: TextStyle(fontSize: 14, height: 1.55),
              bodyMedium: TextStyle(fontSize: 13, height: 1.5),
              titleLarge: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
              titleMedium: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
              labelLarge: TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
            ).apply(
              fontFamily: 'Cairo',
              bodyColor: AppPalette.ink,
              displayColor: AppPalette.ink,
            ),
        appBarTheme: AppBarTheme(
          backgroundColor: AppPalette.canvas,
          foregroundColor: AppPalette.navy,
          elevation: 0,
          scrolledUnderElevation: 0,
          surfaceTintColor: Colors.transparent,
          centerTitle: false,
          toolbarHeight: 58,
          titleSpacing: 8,
          iconTheme: const IconThemeData(color: AppPalette.navy, size: 22),
          actionsIconTheme: const IconThemeData(
            color: AppPalette.navy,
            size: 21,
          ),
          shape: const Border(bottom: BorderSide(color: AppPalette.border)),
          titleTextStyle: const TextStyle(
            color: AppPalette.navy,
            fontFamily: 'Cairo',
            fontSize: 16,
            fontWeight: FontWeight.w800,
          ),
        ),
        cardTheme: CardThemeData(
          color: AppPalette.surface,
          elevation: 0,
          margin: const EdgeInsets.symmetric(vertical: 5),
          clipBehavior: Clip.antiAlias,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: const BorderSide(color: AppPalette.border),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: AppPalette.surface,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 14,
          ),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: AppPalette.border),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: AppPalette.border),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(
              color: AppPalette.brandBlue,
              width: 1.5,
            ),
          ),
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            backgroundColor: AppPalette.navy,
            foregroundColor: Colors.white,
            minimumSize: const Size(48, 46),
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
            ),
            textStyle: const TextStyle(
              fontFamily: 'Cairo',
              fontSize: 13,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
            foregroundColor: AppPalette.navy,
            minimumSize: const Size(44, 44),
            padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 10),
            side: const BorderSide(color: AppPalette.border),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
            ),
            textStyle: const TextStyle(
              fontFamily: 'Cairo',
              fontSize: 13,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        textButtonTheme: TextButtonThemeData(
          style: TextButton.styleFrom(
            foregroundColor: AppPalette.navy,
            textStyle: const TextStyle(
              fontFamily: 'Cairo',
              fontSize: 13,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        chipTheme: ChipThemeData(
          backgroundColor: AppPalette.muted,
          selectedColor: const Color(0xFFDDF4F1),
          secondarySelectedColor: AppPalette.muted,
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          labelStyle: const TextStyle(
            fontFamily: 'Cairo',
            fontSize: 11,
            fontWeight: FontWeight.w700,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
            side: BorderSide.none,
          ),
        ),
        popupMenuTheme: PopupMenuThemeData(
          color: AppPalette.surface,
          elevation: 4,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: const BorderSide(color: Color(0xFFDCE5ED)),
          ),
          textStyle: const TextStyle(fontFamily: 'Cairo', fontSize: 13),
        ),
        drawerTheme: const DrawerThemeData(
          backgroundColor: AppPalette.navy,
          width: 280,
          elevation: 8,
        ),
        listTileTheme: ListTileThemeData(
          contentPadding: const EdgeInsets.symmetric(horizontal: 16),
          minTileHeight: 48,
          iconColor: AppPalette.mutedInk,
          textColor: AppPalette.ink,
          selectedColor: AppPalette.navy,
          selectedTileColor: const Color(0xFFE4EDF3),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          titleTextStyle: const TextStyle(
            fontFamily: 'Cairo',
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: AppPalette.ink,
          ),
        ),
        navigationBarTheme: const NavigationBarThemeData(
          backgroundColor: AppPalette.surface,
          indicatorColor: Color(0xFFE4EDF3),
          iconTheme: WidgetStateProperty<IconThemeData>.fromMap({
            WidgetState.selected: IconThemeData(color: AppPalette.navy),
            WidgetState.any: IconThemeData(color: AppPalette.mutedInk),
          }),
          labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
          labelTextStyle: WidgetStatePropertyAll(
            TextStyle(
              fontFamily: 'Cairo',
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: AppPalette.mutedInk,
            ),
          ),
        ),
        dialogTheme: const DialogThemeData(
          backgroundColor: AppPalette.surface,
          surfaceTintColor: Colors.transparent,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.all(Radius.circular(20)),
          ),
        ),
        bottomSheetTheme: const BottomSheetThemeData(
          backgroundColor: AppPalette.surface,
          surfaceTintColor: Colors.transparent,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
          ),
        ),
        snackBarTheme: const SnackBarThemeData(
          behavior: SnackBarBehavior.floating,
          backgroundColor: AppPalette.navy,
          contentTextStyle: TextStyle(
            color: Colors.white,
            fontFamily: 'Cairo',
            fontWeight: FontWeight.w600,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.all(Radius.circular(14)),
          ),
        ),
        progressIndicatorTheme: const ProgressIndicatorThemeData(
          color: AppPalette.brandBlue,
          linearTrackColor: Color(0xFFDDF4F1),
        ),
        floatingActionButtonTheme: FloatingActionButtonThemeData(
          backgroundColor: AppPalette.brandBlue,
          foregroundColor: Colors.white,
          elevation: 2,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
        ),
        dividerTheme: const DividerThemeData(
          color: Color(0xFFDCE5ED),
          thickness: 1,
        ),
      ).copyWith(
        primaryColor: AppPalette.navy,
        iconTheme: const IconThemeData(color: AppPalette.navy, size: 20),
        primaryIconTheme: const IconThemeData(color: AppPalette.navy, size: 20),
        textSelectionTheme: const TextSelectionThemeData(
          cursorColor: AppPalette.navy,
          selectionColor: Color(0x330F9F9A),
          selectionHandleColor: AppPalette.navy,
        ),
      );

  static ThemeData get dark => ThemeData.dark(useMaterial3: true)
      .copyWith(
        textTheme: ThemeData.dark().textTheme.apply(
          fontFamily: 'Cairo',
          bodyColor: AppPalette.darkInk,
          displayColor: AppPalette.darkInk,
        ),
        scaffoldBackgroundColor: AppPalette.darkCanvas,
        colorScheme: AppPalette.darkScheme,
        iconTheme: const IconThemeData(color: AppPalette.darkInk),
        textSelectionTheme: TextSelectionThemeData(
          cursorColor: AppPalette.brandBlue,
          selectionColor: AppPalette.brandBlue.withValues(alpha: 0.28),
          selectionHandleColor: AppPalette.brandBlue,
        ),
        dialogTheme: const DialogThemeData(
          backgroundColor: AppPalette.darkSurface,
          surfaceTintColor: Colors.transparent,
        ),
        bottomSheetTheme: const BottomSheetThemeData(
          backgroundColor: AppPalette.darkSurface,
          surfaceTintColor: Colors.transparent,
        ),
        snackBarTheme: const SnackBarThemeData(
          backgroundColor: AppPalette.darkSurface,
          contentTextStyle: TextStyle(
            color: AppPalette.darkInk,
            fontFamily: 'Cairo',
          ),
        ),
        progressIndicatorTheme: const ProgressIndicatorThemeData(
          color: AppPalette.brandBlue,
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: AppPalette.darkCanvas,
          foregroundColor: AppPalette.darkInk,
          elevation: 0,
          scrolledUnderElevation: 0,
          surfaceTintColor: Colors.transparent,
          toolbarHeight: 58,
          iconTheme: IconThemeData(color: AppPalette.darkInk, size: 22),
          actionsIconTheme: IconThemeData(color: AppPalette.darkInk, size: 21),
          titleTextStyle: TextStyle(
            color: AppPalette.darkInk,
            fontFamily: 'Cairo',
            fontSize: 16,
            fontWeight: FontWeight.w800,
          ),
          shape: Border(bottom: BorderSide(color: AppPalette.darkBorder)),
        ),
        listTileTheme: ListTileThemeData(
          contentPadding: const EdgeInsets.symmetric(horizontal: 16),
          minTileHeight: 48,
          iconColor: AppPalette.darkMutedInk,
          textColor: AppPalette.darkInk,
          selectedColor: AppPalette.brandBlue,
          selectedTileColor: AppPalette.darkSidebarAccent,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          titleTextStyle: const TextStyle(
            fontFamily: 'Cairo',
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: AppPalette.darkInk,
          ),
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            backgroundColor: AppPalette.brandBlue,
            foregroundColor: AppPalette.navy,
            minimumSize: const Size(48, 46),
            textStyle: const TextStyle(
              fontFamily: 'Cairo',
              fontSize: 13,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
            foregroundColor: AppPalette.darkInk,
            side: const BorderSide(color: AppPalette.darkOutline),
            minimumSize: const Size(44, 44),
            textStyle: const TextStyle(
              fontFamily: 'Cairo',
              fontSize: 13,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        textButtonTheme: TextButtonThemeData(
          style: TextButton.styleFrom(
            foregroundColor: AppPalette.brandBlue,
            textStyle: const TextStyle(
              fontFamily: 'Cairo',
              fontSize: 13,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        chipTheme: ThemeData.dark().chipTheme.copyWith(
          backgroundColor: AppPalette.darkMuted,
          selectedColor: AppPalette.darkOutline,
          labelStyle: const TextStyle(
            fontFamily: 'Cairo',
            fontSize: 11,
            fontWeight: FontWeight.w700,
          ),
        ),
        navigationBarTheme: const NavigationBarThemeData(
          backgroundColor: AppPalette.darkSurface,
          indicatorColor: AppPalette.darkOutline,
          iconTheme: WidgetStateProperty<IconThemeData>.fromMap({
            WidgetState.selected: IconThemeData(color: AppPalette.darkInk),
            WidgetState.any: IconThemeData(color: AppPalette.darkMutedInk),
          }),
          labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
          labelTextStyle: WidgetStatePropertyAll(
            TextStyle(
              fontFamily: 'Cairo',
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: AppPalette.darkMutedInk,
            ),
          ),
        ),
        cardTheme: CardThemeData(
          color: AppPalette.darkSurface,
          elevation: 0,
          margin: const EdgeInsets.symmetric(vertical: 5),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: const BorderSide(color: AppPalette.darkBorder),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: AppPalette.darkSurface,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 12,
            vertical: 10,
          ),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(9),
            borderSide: const BorderSide(color: AppPalette.darkOutline),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(9),
            borderSide: const BorderSide(color: AppPalette.darkOutline),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(9),
            borderSide: const BorderSide(
              color: AppPalette.brandBlue,
              width: 1.6,
            ),
          ),
          labelStyle: const TextStyle(color: Color(0xFFAFC0CE)),
          floatingLabelStyle: const TextStyle(color: AppPalette.brandBlue),
        ),
        popupMenuTheme: PopupMenuThemeData(
          color: AppPalette.darkSurface,
          surfaceTintColor: Colors.transparent,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: const BorderSide(color: AppPalette.darkBorder),
          ),
          textStyle: const TextStyle(
            fontFamily: 'Cairo',
            fontSize: 13,
            color: AppPalette.darkInk,
          ),
        ),
        drawerTheme: const DrawerThemeData(
          backgroundColor: AppPalette.navy,
          width: 280,
        ),
        dividerTheme: const DividerThemeData(color: AppPalette.darkBorder),
      )
      .copyWith(
        primaryColor: AppPalette.brandBlue,
        iconTheme: const IconThemeData(color: AppPalette.darkInk, size: 20),
        primaryIconTheme: const IconThemeData(
          color: AppPalette.darkInk,
          size: 20,
        ),
        textSelectionTheme: TextSelectionThemeData(
          cursorColor: AppPalette.brandBlue,
          selectionColor: AppPalette.brandBlue.withValues(alpha: 0.28),
          selectionHandleColor: AppPalette.brandBlue,
        ),
      );
}

/// Context-aware semantic colors for status messages, badges, and surfaces.
extension AppThemeContextTokens on BuildContext {
  bool get _isDarkAppTheme => Theme.of(this).brightness == Brightness.dark;

  Color get appSuccess =>
      _isDarkAppTheme ? AppPalette.darkSuccess : AppPalette.success;
  Color get appSuccessContainer => _isDarkAppTheme
      ? AppPalette.darkSuccessContainer
      : AppPalette.successContainer;

  Color get appWarning =>
      _isDarkAppTheme ? AppPalette.darkWarning : AppPalette.warning;
  Color get appWarningContainer => _isDarkAppTheme
      ? AppPalette.darkWarningContainer
      : AppPalette.warningContainer;

  Color get appInfo => _isDarkAppTheme ? AppPalette.darkInfo : AppPalette.info;
  Color get appInfoContainer =>
      _isDarkAppTheme ? AppPalette.darkInfoContainer : AppPalette.infoContainer;

  Color get appDanger => Theme.of(this).colorScheme.error;
  Color get appDangerContainer => Theme.of(this).colorScheme.errorContainer;
  Color get appDangerText => Theme.of(this).colorScheme.onErrorContainer;

  Color get appMutedText => Theme.of(this).colorScheme.onSurfaceVariant;
  Color get appMutedSurface => Theme.of(this).colorScheme.surfaceContainerHigh;
  Color get appBorder => Theme.of(this).colorScheme.outlineVariant;
}
