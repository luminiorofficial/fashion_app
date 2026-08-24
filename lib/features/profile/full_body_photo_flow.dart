import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/theme/theme.dart';
import '../../models/nera_models.dart';
import '../../services/image_service.dart';
import '../../services/nera_backend.dart';

/// Shared picker and profile analysis flow used by onboarding, Profile, and
/// Virtual Try-On recovery.
abstract final class FullBodyPhotoFlow {
  static Future<StyleProfile?> start({
    required BuildContext context,
    required NeraBackend backend,
    required NeraImageService imageService,
    required ValueChanged<bool> onProcessingChanged,
  }) async {
    final source = await showModalBottomSheet<ImageSource>(
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
                leading: const Icon(
                  Icons.camera_alt_rounded,
                  color: NeraColors.gold,
                ),
                title: const Text('Take a photo'),
                onTap: () => Navigator.pop(context, ImageSource.camera),
              ),
              ListTile(
                leading: const Icon(
                  Icons.photo_library_rounded,
                  color: NeraColors.gold,
                ),
                title: const Text('Choose from gallery'),
                onTap: () => Navigator.pop(context, ImageSource.gallery),
              ),
            ],
          ),
        ),
      ),
    );
    if (source == null || !context.mounted) return null;

    onProcessingChanged(true);
    try {
      final image = await imageService.pick(source);
      if (image == null) return null;
      // Await inside the try so the shared loading state covers both upload
      // and server-side AI analysis before the finally block clears it.
      return await backend.analyzeProfileImage(
        Uint8List.fromList(image.bytes),
        image.fileName,
      );
    } finally {
      onProcessingChanged(false);
    }
  }
}
