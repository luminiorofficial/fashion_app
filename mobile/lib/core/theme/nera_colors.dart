import 'package:flutter/material.dart';

/// The NERA brand palette: a premium, minimal white-and-black editorial
/// system. Shared by every screen so the app reads as one consistent
/// product rather than a set of independently styled pages.
///
/// `ink` is the single accent color — near-black, used anywhere the old
/// champagne-gold accent used to appear (primary buttons, selected states,
/// active icons). Color is otherwise reserved for states that communicate
/// real information (error/success), not decoration.
abstract final class NeraColors {
  static const background = Color(0xFFFAF9F6);
  static const surface = Color(0xFFFFFFFF);
  static const surfaceElevated = Color(0xFFF3F2EE);
  static const surfaceBorder = Color(0xFFE5E2DB);
  static const divider = Color(0xFFECEAE4);

  static const ink = Color(0xFF141413);
  static const onInk = Color(0xFFFFFFFF);

  static const textPrimary = Color(0xFF161615);
  static const textSecondary = Color(0xFF5B5951);
  static const muted = Color(0xFF8F8C86);

  static const error = Color(0xFFB3261E);
  static const errorSurface = Color(0xFFFBEAEA);
  static const success = Color(0xFF2E7D4F);
  static const warning = Color(0xFF9A6B08);

  // The outfit-feedback reactions stay monochrome: the label and emoji
  // already carry the meaning, so selection is shown with ink, not hue.
  static const loveIt = ink;
  static const wouldWear = ink;
  static const notSure = ink;
  static const notMyStyle = ink;
}
