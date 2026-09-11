import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/theme/theme.dart';
import '../../core/widgets/widgets.dart';
import '../../models/nera_models.dart';

class WardrobeItemImage extends StatefulWidget {
  const WardrobeItemImage({
    super.key,
    required this.item,
    this.size,
    this.radius = NeraRadius.sm,
  });
  final WardrobeItem item;
  final double? size;
  final double radius;

  @override
  State<WardrobeItemImage> createState() => _WardrobeItemImageState();
}

class _WardrobeItemImageState extends State<WardrobeItemImage> {
  Future<Uint8List>? _localBytes;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant WardrobeItemImage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.item.imagePath != widget.item.imagePath) _load();
  }

  void _load() {
    _localBytes = widget.item.imagePath.isEmpty
        ? null
        : XFile(widget.item.imagePath).readAsBytes();
  }

  @override
  Widget build(BuildContext context) => SizedBox(
    width: widget.size,
    height: widget.size,
    child: _localBytes == null
        ? NeraNetworkImage(url: widget.item.imageUrl, radius: widget.radius)
        : ClipRRect(
            borderRadius: BorderRadius.circular(widget.radius),
            child: FutureBuilder<Uint8List>(
              future: _localBytes,
              builder: (context, snapshot) {
                if (snapshot.hasData) {
                  return Image.memory(snapshot.data!, fit: BoxFit.cover);
                }
                if (snapshot.hasError) {
                  return const ColoredBox(
                    color: NeraColors.surfaceElevated,
                    child: Icon(
                      Icons.broken_image_outlined,
                      color: NeraColors.muted,
                    ),
                  );
                }
                return const NeraSkeleton(
                  width: double.infinity,
                  height: double.infinity,
                  radius: 0,
                );
              },
            ),
          ),
  );
}
