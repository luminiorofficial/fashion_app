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
    this.highlighted = false,
    this.borderColor,
  });

  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsetsGeometry? padding;
  /// A subtle off-white fill used to lift one hero card above the plain
  /// white cards around it, without resorting to a gradient or shadow.
  final bool highlighted;
  final Color? borderColor;

  @override
  Widget build(BuildContext context) => Container(
    decoration: BoxDecoration(
      color: highlighted ? NeraColors.surfaceElevated : NeraColors.surface,
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
