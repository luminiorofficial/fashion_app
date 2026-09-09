import 'package:flutter/material.dart';

import '../theme/nera_colors.dart';
import '../theme/nera_spacing.dart';

/// The base surface every section/list card in the app is built on top of,
/// so spacing, radius, and border treatment stay identical everywhere.
class NeraCard extends StatelessWidget {
  const NeraCard({
    super.key,
    required this.child,
    this.onTap,
    this.padding,
    this.gradient = false,
    this.borderColor,
  });

  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsetsGeometry? padding;
  final bool gradient;
  final Color? borderColor;

  @override
  Widget build(BuildContext context) => Container(
    decoration: BoxDecoration(
      color: gradient ? null : NeraColors.surface,
      gradient: gradient ? NeraColors.cardGradient : null,
      borderRadius: BorderRadius.circular(NeraRadius.md),
      border: Border.all(color: borderColor ?? NeraColors.surfaceBorder),
    ),
    clipBehavior: Clip.antiAlias,
    child: Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: padding ?? const EdgeInsets.all(NeraSpacing.lg),
          child: child,
        ),
      ),
    ),
  );
}
