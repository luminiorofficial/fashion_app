import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';

import '../theme/nera_colors.dart';
import '../theme/nera_spacing.dart';

class NeraSectionHeader extends StatelessWidget {
  const NeraSectionHeader(this.title, {super.key, this.subtitle, this.action});

  final String title;
  final String? subtitle;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.headlineSmall),
            if (subtitle != null) ...[
              const SizedBox(height: 4),
              Text(subtitle!, style: Theme.of(context).textTheme.bodyMedium),
            ],
          ],
        ),
      ),
      ?action,
    ],
  );
}

/// A centered icon + title + optional message + optional action, used for
/// every "nothing here yet" and full-blown error state in the app so they
/// all read as one deliberate design rather than ad-hoc Text widgets.
class NeraEmptyState extends StatelessWidget {
  const NeraEmptyState({
    super.key,
    required this.icon,
    required this.title,
    this.message,
    this.action,
    this.iconColor = NeraColors.gold,
  });

  final IconData icon;
  final String title;
  final String? message;
  final Widget? action;
  final Color iconColor;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(
      vertical: NeraSpacing.xxl,
      horizontal: NeraSpacing.lg,
    ),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 64,
          height: 64,
          decoration: BoxDecoration(
            color: NeraColors.surfaceElevated,
            shape: BoxShape.circle,
          ),
          child: Icon(icon, color: iconColor, size: 28),
        ),
        const SizedBox(height: NeraSpacing.lg),
        Text(
          title,
          style: Theme.of(context).textTheme.titleLarge,
          textAlign: TextAlign.center,
        ),
        if (message != null) ...[
          const SizedBox(height: NeraSpacing.sm),
          Text(
            message!,
            style: Theme.of(context).textTheme.bodyMedium,
            textAlign: TextAlign.center,
          ),
        ],
        if (action != null) ...[
          const SizedBox(height: NeraSpacing.lg),
          action!,
        ],
      ],
    ),
  );
}

class NeraErrorState extends StatelessWidget {
  const NeraErrorState({
    super.key,
    required this.message,
    this.onRetry,
    this.title = 'Something went wrong',
    this.retryLabel = 'Try again',
    this.retrying = false,
  });

  final String message;
  final String title;
  final VoidCallback? onRetry;
  final String retryLabel;
  final bool retrying;

  @override
  Widget build(BuildContext context) => NeraEmptyState(
    icon: Icons.cloud_off_rounded,
    iconColor: NeraColors.error,
    title: title,
    message: message,
    action: onRetry == null
        ? null
        : OutlinedButton(
            onPressed: retrying ? null : onRetry,
            child: retrying
                ? const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      SizedBox.square(
                        dimension: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                      SizedBox(width: 8),
                      Text('Uploading & analyzing…'),
                    ],
                  )
                : Text(retryLabel),
          ),
  );
}

class NeraSkeleton extends StatelessWidget {
  const NeraSkeleton({
    super.key,
    this.width,
    this.height = 16,
    this.radius = 8,
  });

  final double? width;
  final double height;
  final double radius;

  @override
  Widget build(BuildContext context) => Shimmer.fromColors(
    baseColor: NeraColors.surfaceElevated,
    highlightColor: NeraColors.surfaceBorder,
    child: Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: NeraColors.surfaceElevated,
        borderRadius: BorderRadius.circular(radius),
      ),
    ),
  );
}

/// Fades and lifts [child] in on entry, with an optional stagger [delay] so
/// lists read as a gentle cascade rather than popping in all at once.
class NeraFadeIn extends StatefulWidget {
  const NeraFadeIn({
    super.key,
    required this.child,
    this.delay = Duration.zero,
  });

  final Widget child;
  final Duration delay;

  @override
  State<NeraFadeIn> createState() => _NeraFadeInState();
}

class _NeraFadeInState extends State<NeraFadeIn>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 420),
  );

  @override
  void initState() {
    super.initState();
    Future.delayed(widget.delay, () {
      if (mounted) _controller.forward();
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final curved = CurvedAnimation(
      parent: _controller,
      curve: Curves.easeOutCubic,
    );
    return AnimatedBuilder(
      animation: curved,
      child: widget.child,
      builder: (context, child) => Opacity(
        opacity: curved.value.clamp(0, 1),
        child: Transform.translate(
          offset: Offset(0, (1 - curved.value) * 14),
          child: child,
        ),
      ),
    );
  }
}

void showNeraSnackBar(
  BuildContext context,
  String message, {
  bool error = false,
}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: error
            ? NeraColors.errorSurface
            : NeraColors.surfaceElevated,
      ),
    );
}
