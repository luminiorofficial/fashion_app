import 'package:cached_network_image_ce/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../theme/nera_colors.dart';
import '../theme/nera_spacing.dart';
import 'nera_states.dart';

/// A cached, shimmer-while-loading image for every signed Cloudinary/local
/// asset URL in the app (wardrobe photos, profile photo, try-on results).
/// Falls back to a soft placeholder icon for an empty/broken URL instead of
/// a jarring red error box.
class NeraNetworkImage extends StatelessWidget {
  const NeraNetworkImage({
    super.key,
    required this.url,
    this.fit = BoxFit.cover,
    this.radius = NeraRadius.sm,
    this.placeholderIcon = Icons.checkroom_rounded,
  });

  final String url;
  final BoxFit fit;
  final double radius;
  final IconData placeholderIcon;

  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: BorderRadius.circular(radius),
    child: url.isEmpty
        ? _placeholder()
        : CachedNetworkImage(
            imageUrl: url,
            fit: fit,
            fadeInDuration: const Duration(milliseconds: 220),
            placeholder: (context, url) => const NeraSkeleton(
              width: double.infinity,
              height: double.infinity,
              radius: 0,
            ),
            errorBuilder: (context, url, error) => _placeholder(),
          ),
  );

  Widget _placeholder() => Container(
    color: NeraColors.surfaceElevated,
    alignment: Alignment.center,
    child: Icon(placeholderIcon, color: NeraColors.muted, size: 26),
  );
}
