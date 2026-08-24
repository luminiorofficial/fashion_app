import 'package:flutter/material.dart';

/// The NERA brand palette: a warm, near-black editorial base with a
/// champagne-gold accent. Shared by every screen so the app reads as one
/// consistent product rather than a set of independently styled pages.
abstract final class NeraColors {
  static const background = Color(0xFF07070A);
  static const surface = Color(0xFF16171D);
  static const surfaceElevated = Color(0xFF1E2027);
  static const surfaceBorder = Color(0xFF2B2D36);
  static const divider = Color(0xFF24252B);

  static const gold = Color(0xFFE3B872);
  static const goldMuted = Color(0xFFC79A5B);
  static const blue = Color(0xFF9BBFE8);

  static const textPrimary = Color(0xFFF7F5F2);
  static const textSecondary = Color(0xFFB7B8C2);
  static const muted = Color(0xFF8B8D98);

  static const error = Color(0xFFE5696D);
  static const errorSurface = Color(0xFF3A1D1F);
  static const success = Color(0xFF63B489);

  static const loveIt = Color(0xFFE86B8A);
  static const wouldWear = Color(0xFF7FBF8F);
  static const notSure = Color(0xFFE3B872);
  static const notMyStyle = Color(0xFF8B8D98);

  static const cardGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [surfaceElevated, surface],
  );

  static const goldGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFF0CD94), gold, goldMuted],
  );
}
