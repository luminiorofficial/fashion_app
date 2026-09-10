import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/theme/theme.dart';
import '../../models/nera_models.dart';
import '../../services/image_service.dart';
import '../../services/nera_backend.dart';
import '../camera/camera_capture_screen.dart';

/// Shared picker and profile analysis flow used by onboarding, Profile, and
/// Virtual Try-On recovery.
abstract final class FullBodyPhotoFlow {
  static Future<StyleProfile?> start({
    required BuildContext context,
    required NeraBackend backend,
    required NeraImageService imageService,
    required ValueChanged<bool> onProcessingChanged,
  }) async {
    while (context.mounted) {
      final source = await _chooseSource(context);
      if (source == null || !context.mounted) return null;

      final image = source == ImageSource.camera
          ? await _capture(context, imageService)
          : await imageService.pick(source);
      if (image == null || !context.mounted) return null;

      final usePhoto = await _confirmPhoto(context, image.bytes);
      if (!context.mounted || usePhoto == null) return null;
      if (!usePhoto) continue;

      onProcessingChanged(true);
      try {
        // Keep the existing endpoint and image payload intact. The preview
        // simply lets someone approve the locally picked image first.
        return await backend.analyzeProfileImage(
          Uint8List.fromList(image.bytes),
          image.fileName,
        );
      } finally {
        onProcessingChanged(false);
      }
    }
    return null;
  }

  static Future<PickedImageData?> _capture(
    BuildContext context,
    NeraImageService imageService,
  ) async {
    final captured = await CameraCaptureScreen.open(context);
    if (captured == null) return null;
    return imageService.prepareProfileCapture(captured);
  }

  static Future<ImageSource?> _chooseSource(BuildContext context) =>
      showModalBottomSheet<ImageSource>(
        context: context,
        showDragHandle: true,
        builder: (context) => SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.camera_alt_rounded),
                  title: const Text('Take a photo'),
                  onTap: () => Navigator.pop(context, ImageSource.camera),
                ),
                const Divider(),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.photo_library_rounded),
                  title: const Text('Choose from gallery'),
                  onTap: () => Navigator.pop(context, ImageSource.gallery),
                ),
              ],
            ),
          ),
        ),
      );

  static Future<bool?> _confirmPhoto(
    BuildContext context,
    List<int> imageBytes,
  ) => showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (context) => _PhotoPreviewSheet(imageBytes: imageBytes),
  );
}

class _PhotoPreviewSheet extends StatelessWidget {
  const _PhotoPreviewSheet({required this.imageBytes});

  final List<int> imageBytes;

  @override
  Widget build(BuildContext context) => FractionallySizedBox(
    heightFactor: 0.92,
    child: Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Your photo', style: NeraTheme.display(30)),
          const SizedBox(height: NeraSpacing.sm),
          Text(
            'Make sure your full body is clearly visible before continuing.',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: NeraSpacing.xl),
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(NeraRadius.md),
              child: ColoredBox(
                color: NeraColors.surfaceElevated,
                child: Image.memory(
                  Uint8List.fromList(imageBytes),
                  width: double.infinity,
                  fit: BoxFit.contain,
                  filterQuality: FilterQuality.medium,
                ),
              ),
            ),
          ),
          const SizedBox(height: NeraSpacing.xl),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Use this photo'),
          ),
          const SizedBox(height: NeraSpacing.sm),
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Choose another'),
          ),
        ],
      ),
    ),
  );
}
