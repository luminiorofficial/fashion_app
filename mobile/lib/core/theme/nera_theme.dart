import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'nera_colors.dart';
import 'nera_spacing.dart';

/// The single source of truth for how NERA looks: Plus Jakarta Sans across
/// the app for a clean, modern, professional feel, with the Playfair
/// Display serif reserved for the NERA wordmark and rare premium editorial
/// moments, laid over the light, white-and-black editorial palette in
/// [NeraColors].
abstract final class NeraTheme {
  /// Playfair Display — the wordmark and rare premium editorial headings
  /// only. Everything else in the app uses [heading] or the theme's
  /// [ThemeData.textTheme].
  static TextStyle display(
    double size, {
    FontWeight weight = FontWeight.w600,
    Color? color,
    double? letterSpacing,
  }) => GoogleFonts.playfairDisplay(
    fontSize: size,
    fontWeight: weight,
    color: color ?? NeraColors.textPrimary,
    letterSpacing: letterSpacing,
    height: 1.05,
  );

  /// Plus Jakarta Sans — the app's primary heading style, for screen titles
  /// that aren't the rare editorial moments [display] is reserved for.
  static TextStyle heading(
    double size, {
    FontWeight weight = FontWeight.w600,
    Color? color,
    double? letterSpacing,
  }) => GoogleFonts.plusJakartaSans(
    fontSize: size,
    fontWeight: weight,
    color: color ?? NeraColors.textPrimary,
    letterSpacing: letterSpacing,
    height: 1.1,
  );

  static final ThemeData light = _build();

  static ThemeData _build() {
    final base = ThemeData(useMaterial3: true, brightness: Brightness.light);
    final bodyFont = GoogleFonts.plusJakartaSansTextTheme(base.textTheme);

    final textTheme = bodyFont
        .apply(
          bodyColor: NeraColors.textPrimary,
          displayColor: NeraColors.textPrimary,
        )
        .copyWith(
          displayLarge: heading(46, letterSpacing: -1.0),
          displayMedium: heading(34, letterSpacing: -0.5),
          displaySmall: heading(26, letterSpacing: -0.2),
          headlineMedium: bodyFont.headlineMedium?.copyWith(
            fontWeight: FontWeight.w600,
            fontSize: 22,
          ),
          headlineSmall: bodyFont.headlineSmall?.copyWith(
            fontWeight: FontWeight.w600,
            fontSize: 19,
          ),
          titleLarge: bodyFont.titleLarge?.copyWith(
            fontWeight: FontWeight.w600,
            fontSize: 17,
          ),
          titleMedium: bodyFont.titleMedium?.copyWith(
            fontWeight: FontWeight.w600,
            fontSize: 15,
          ),
          bodyLarge: bodyFont.bodyLarge?.copyWith(
            fontWeight: FontWeight.w400,
            fontSize: 15,
            height: 1.45,
            color: NeraColors.textSecondary,
          ),
          bodyMedium: bodyFont.bodyMedium?.copyWith(
            fontWeight: FontWeight.w400,
            fontSize: 13.5,
            height: 1.4,
            color: NeraColors.textSecondary,
          ),
          labelLarge: bodyFont.labelLarge?.copyWith(
            fontWeight: FontWeight.w600,
            letterSpacing: 0.2,
          ),
          labelMedium: bodyFont.labelMedium?.copyWith(
            fontWeight: FontWeight.w500,
          ),
          labelSmall: bodyFont.labelSmall?.copyWith(
            fontWeight: FontWeight.w500,
            color: NeraColors.muted,
            letterSpacing: 0.6,
          ),
        );

    return base.copyWith(
      scaffoldBackgroundColor: NeraColors.background,
      textTheme: textTheme,
      colorScheme: const ColorScheme.light(
        primary: NeraColors.ink,
        onPrimary: NeraColors.onInk,
        primaryContainer: NeraColors.ink,
        onPrimaryContainer: NeraColors.onInk,
        secondary: NeraColors.textSecondary,
        onSecondary: NeraColors.onInk,
        secondaryContainer: NeraColors.surfaceElevated,
        onSecondaryContainer: NeraColors.textPrimary,
        tertiary: NeraColors.textSecondary,
        onTertiary: NeraColors.onInk,
        surface: NeraColors.surface,
        onSurface: NeraColors.textPrimary,
        surfaceContainerHighest: NeraColors.surfaceElevated,
        onSurfaceVariant: NeraColors.textSecondary,
        outline: NeraColors.surfaceBorder,
        outlineVariant: NeraColors.divider,
        error: NeraColors.error,
        onError: NeraColors.onInk,
        errorContainer: NeraColors.errorSurface,
        onErrorContainer: NeraColors.error,
        inverseSurface: NeraColors.ink,
        onInverseSurface: NeraColors.onInk,
        inversePrimary: NeraColors.onInk,
        shadow: NeraColors.ink,
        scrim: NeraColors.ink,
        surfaceTint: Colors.transparent,
      ),
      splashFactory: InkRipple.splashFactory,
      dividerTheme: const DividerThemeData(
        color: NeraColors.divider,
        thickness: 1,
        space: 1,
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: NeraColors.background,
        foregroundColor: NeraColors.textPrimary,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        iconTheme: const IconThemeData(color: NeraColors.textPrimary),
        titleTextStyle: textTheme.headlineSmall,
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: NeraColors.ink,
        contentTextStyle: textTheme.bodyMedium?.copyWith(
          color: NeraColors.onInk,
        ),
        actionTextColor: NeraColors.onInk,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(NeraRadius.sm),
        ),
        insetPadding: const EdgeInsets.all(NeraSpacing.lg),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: NeraColors.ink,
          foregroundColor: NeraColors.onInk,
          textStyle: textTheme.labelLarge,
          padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 22),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(NeraRadius.sm),
          ),
          disabledBackgroundColor: NeraColors.surfaceElevated,
          disabledForegroundColor: NeraColors.muted,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: NeraColors.textPrimary,
          side: const BorderSide(color: NeraColors.ink, width: 1.2),
          textStyle: textTheme.labelLarge,
          padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 22),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(NeraRadius.sm),
          ),
          disabledForegroundColor: NeraColors.muted,
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: NeraColors.ink,
          textStyle: textTheme.labelLarge,
        ),
      ),
      iconTheme: const IconThemeData(color: NeraColors.textPrimary),
      cardTheme: CardThemeData(
        color: NeraColors.surface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(NeraRadius.md),
          side: const BorderSide(color: NeraColors.surfaceBorder),
        ),
        margin: EdgeInsets.zero,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: NeraColors.surfaceElevated,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 18,
          vertical: 16,
        ),
        labelStyle: textTheme.bodyMedium?.copyWith(
          color: NeraColors.textSecondary,
        ),
        hintStyle: textTheme.bodyMedium?.copyWith(color: NeraColors.muted),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(NeraRadius.sm),
          borderSide: const BorderSide(color: NeraColors.surfaceBorder),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(NeraRadius.sm),
          borderSide: const BorderSide(color: NeraColors.surfaceBorder),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(NeraRadius.sm),
          borderSide: const BorderSide(color: NeraColors.ink, width: 1.4),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(NeraRadius.sm),
          borderSide: const BorderSide(color: NeraColors.error),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(NeraRadius.sm),
          borderSide: const BorderSide(color: NeraColors.error, width: 1.4),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: NeraColors.surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(NeraRadius.lg),
        ),
        titleTextStyle: textTheme.headlineSmall,
        contentTextStyle: textTheme.bodyLarge,
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: NeraColors.surface,
        surfaceTintColor: Colors.transparent,
        dragHandleColor: NeraColors.surfaceBorder,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(
            top: Radius.circular(NeraRadius.lg),
          ),
        ),
      ),
      popupMenuTheme: PopupMenuThemeData(
        color: NeraColors.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 3,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(NeraRadius.sm),
          side: const BorderSide(color: NeraColors.surfaceBorder),
        ),
      ),
      segmentedButtonTheme: SegmentedButtonThemeData(
        style: SegmentedButton.styleFrom(
          backgroundColor: NeraColors.surface,
          foregroundColor: NeraColors.textPrimary,
          selectedBackgroundColor: NeraColors.ink,
          selectedForegroundColor: NeraColors.onInk,
          side: const BorderSide(color: NeraColors.surfaceBorder),
          textStyle: textTheme.labelLarge,
        ),
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: NeraColors.ink,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: NeraColors.surfaceElevated,
        selectedColor: NeraColors.ink,
        labelStyle: textTheme.bodyMedium?.copyWith(
          color: NeraColors.textPrimary,
        ),
        side: const BorderSide(color: NeraColors.surfaceBorder),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(NeraRadius.pill),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      ),
    );
  }
}
