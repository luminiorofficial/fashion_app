import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'nera_colors.dart';
import 'nera_spacing.dart';

/// The single source of truth for how NERA looks: a serif display face for
/// the wordmark/headlines paired with a clean grotesque for everything else,
/// laid over the dark editorial palette in [NeraColors].
abstract final class NeraTheme {
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

  static final ThemeData dark = _build();

  static ThemeData _build() {
    final base = ThemeData(useMaterial3: true, brightness: Brightness.dark);
    final bodyFont = GoogleFonts.manropeTextTheme(base.textTheme);

    final textTheme = bodyFont
        .apply(
          bodyColor: NeraColors.textPrimary,
          displayColor: NeraColors.textPrimary,
        )
        .copyWith(
          displayLarge: display(46, letterSpacing: -1.2),
          displayMedium: display(34, letterSpacing: -0.6),
          displaySmall: display(26),
          headlineMedium: bodyFont.headlineMedium?.copyWith(
            fontWeight: FontWeight.w700,
            fontSize: 22,
          ),
          headlineSmall: bodyFont.headlineSmall?.copyWith(
            fontWeight: FontWeight.w700,
            fontSize: 19,
          ),
          titleLarge: bodyFont.titleLarge?.copyWith(
            fontWeight: FontWeight.w700,
            fontSize: 17,
          ),
          titleMedium: bodyFont.titleMedium?.copyWith(
            fontWeight: FontWeight.w600,
            fontSize: 15,
          ),
          bodyLarge: bodyFont.bodyLarge?.copyWith(
            fontSize: 15,
            height: 1.45,
            color: NeraColors.textSecondary,
          ),
          bodyMedium: bodyFont.bodyMedium?.copyWith(
            fontSize: 13.5,
            height: 1.4,
            color: NeraColors.textSecondary,
          ),
          labelLarge: bodyFont.labelLarge?.copyWith(
            fontWeight: FontWeight.w600,
            letterSpacing: 0.2,
          ),
          labelSmall: bodyFont.labelSmall?.copyWith(
            color: NeraColors.muted,
            letterSpacing: 0.6,
          ),
        );

    return base.copyWith(
      scaffoldBackgroundColor: NeraColors.background,
      textTheme: textTheme,
      colorScheme: const ColorScheme.dark(
        primary: NeraColors.gold,
        onPrimary: Color(0xFF241A0B),
        secondary: NeraColors.blue,
        surface: NeraColors.surface,
        error: NeraColors.error,
        outline: NeraColors.surfaceBorder,
      ),
      splashFactory: InkSparkle.splashFactory,
      dividerTheme: const DividerThemeData(
        color: NeraColors.divider,
        thickness: 1,
        space: 1,
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: NeraColors.surfaceElevated,
        contentTextStyle: textTheme.bodyMedium?.copyWith(
          color: NeraColors.textPrimary,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(NeraRadius.sm),
        ),
        insetPadding: const EdgeInsets.all(NeraSpacing.lg),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: NeraColors.gold,
          foregroundColor: const Color(0xFF241A0B),
          textStyle: textTheme.labelLarge,
          padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 22),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(NeraRadius.pill),
          ),
          disabledBackgroundColor: NeraColors.surfaceElevated,
          disabledForegroundColor: NeraColors.muted,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: NeraColors.textPrimary,
          side: const BorderSide(color: NeraColors.surfaceBorder),
          textStyle: textTheme.labelLarge,
          padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 22),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(NeraRadius.pill),
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: NeraColors.gold,
          textStyle: textTheme.labelLarge,
        ),
      ),
      iconTheme: const IconThemeData(color: NeraColors.textPrimary),
      cardTheme: CardThemeData(
        color: NeraColors.surface,
        elevation: 0,
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
        labelStyle: textTheme.bodyMedium,
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
          borderSide: const BorderSide(color: NeraColors.gold, width: 1.4),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(NeraRadius.sm),
          borderSide: const BorderSide(color: NeraColors.error),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: NeraColors.surfaceElevated,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(NeraRadius.lg),
        ),
        titleTextStyle: textTheme.headlineSmall,
        contentTextStyle: textTheme.bodyLarge,
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: NeraColors.surfaceElevated,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(
            top: Radius.circular(NeraRadius.lg),
          ),
        ),
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: NeraColors.gold,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: NeraColors.surfaceElevated,
        selectedColor: NeraColors.gold.withValues(alpha: 0.18),
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
