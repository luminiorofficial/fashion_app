import 'dart:typed_data';

import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:image_picker/image_picker.dart';

import '../models/nera_models.dart';

class NeraImageService {
  NeraImageService({ImagePicker? picker}) : _picker = picker ?? ImagePicker();

  static const maxUploadBytes = NeraImageLimits.maxBytes;
  final ImagePicker _picker;

  Future<PickedImageData?> pick(ImageSource source) async {
    final picked = await _picker.pickImage(
      source: source,
      imageQuality: 92,
      maxWidth: 2400,
      maxHeight: 2400,
      requestFullMetadata: false,
    );
    if (picked == null) return null;

    final original = await picked.readAsBytes();
    final compressed = await _compressBelowLimit(original);
    return PickedImageData(
      bytes: compressed,
      fileName: '${DateTime.now().millisecondsSinceEpoch}.jpg',
    );
  }

  Future<Uint8List> _compressBelowLimit(Uint8List original) async {
    if (original.lengthInBytes <= maxUploadBytes) {
      final optimized = await FlutterImageCompress.compressWithList(
        original,
        minWidth: 1024,
        minHeight: 1024,
        quality: 76,
        format: CompressFormat.jpeg,
      );
      if (optimized.lengthInBytes <= maxUploadBytes) return optimized;
    }

    for (final quality in <int>[70, 55, 40, 28]) {
      final result = await FlutterImageCompress.compressWithList(
        original,
        minWidth: quality >= 55 ? 1024 : 768,
        minHeight: quality >= 55 ? 1024 : 768,
        quality: quality,
        format: CompressFormat.jpeg,
      );
      if (result.lengthInBytes <= maxUploadBytes) return result;
    }

    throw const NeraImageException(
      'The selected photo could not be reduced below 2 MB. Try another photo.',
    );
  }
}

abstract final class NeraImageLimits {
  static const maxBytes = 2 * 1024 * 1024;
}

class NeraImageException implements Exception {
  const NeraImageException(this.message);
  final String message;

  @override
  String toString() => message;
}
