import 'package:flutter/material.dart';

import '../theme/nera_colors.dart';

enum NeraButtonStyleType { primary, secondary, text }

/// A single button widget that swaps in a spinner while [loading] instead of
/// every screen hand-rolling its own busy/disabled state.
class NeraButton extends StatelessWidget {
  const NeraButton({
    super.key,
    required this.label,
    this.onPressed,
    this.loading = false,
    this.icon,
    this.style = NeraButtonStyleType.primary,
    this.expand = true,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final IconData? icon;
  final NeraButtonStyleType style;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final spinnerColor = style == NeraButtonStyleType.primary
        ? const Color(0xFF241A0B)
        : NeraColors.gold;
    final child = loading
        ? SizedBox.square(
            dimension: 18,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: spinnerColor,
            ),
          )
        : Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[
                Icon(icon, size: 18),
                const SizedBox(width: 8),
              ],
              Text(label),
            ],
          );

    final Widget button;
    switch (style) {
      case NeraButtonStyleType.primary:
        button = FilledButton(
          onPressed: loading ? null : onPressed,
          child: child,
        );
      case NeraButtonStyleType.secondary:
        button = OutlinedButton(
          onPressed: loading ? null : onPressed,
          child: child,
        );
      case NeraButtonStyleType.text:
        button = TextButton(
          onPressed: loading ? null : onPressed,
          child: child,
        );
    }
    return expand ? SizedBox(width: double.infinity, child: button) : button;
  }
}
