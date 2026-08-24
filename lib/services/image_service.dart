import 'dart:typed_data';

import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:image_picker/image_picker.dart';

import '../models/nera_models.dart';

// A dimension/quality ladder tried in order until the result fits under
// [maxBytes]. Wardrobe photos target a much smaller ceiling than full-body
// profile photos, since a single garment needs less detail than a photo the
// AI must read body shape and skin tone from.
class _CompressionProfile {
  const _CompressionProfile({
    required this.maxBytes,
    required this.dimensionSteps,
    required this.qualitySteps,
  });

  final int maxBytes;
  final List<int> dimensionSteps;
  final List<int> qualitySteps;
}

const _wardrobeCompression = _CompressionProfile(
  maxBytes: 150 * 1024,
  dimensionSteps: [1024, 900, 768, 640],
  qualitySteps: [80, 70, 60, 50, 40],
);

const _profileCompression = _CompressionProfile(
  maxBytes: 350 * 1024,
  dimensionSteps: [1600, 1400, 1200, 1000],
  qualitySteps: [85, 75, 65, 55, 45],
);

class NeraImageService {
  NeraImageService({ImagePicker? picker}) : _picker = picker ?? ImagePicker();

  /// Hard safety-net ceiling if even the smallest compression step still
  /// exceeds it (extremely unlikely given the profiles above).
  static const maxUploadBytes = NeraImageLimits.maxBytes;
  final ImagePicker _picker;

  /// Used for the full-body profile photo, compressed toward 200-350 KB.
  Future<PickedImageData?> pick(ImageSource source) async {
    final picked = await _picker.pickImage(
      source: source,
      imageQuality: 92,
      maxWidth: 2400,
      maxHeight: 2400,
      requestFullMetadata: false,
    );
    if (picked == null) return null;

    return _toPickedImage(picked, 0, _profileCompression);
  }

  /// Used for wardrobe item photos, compressed toward 80-150 KB.
  Future<List<PickedImageData>> pickMany(ImageSource source) async {
    final picked = source == ImageSource.gallery
        ? await _picker.pickMultiImage(
            imageQuality: 92,
            maxWidth: 2400,
            maxHeight: 2400,
            requestFullMetadata: false,
          )
        : await _pickSingle(source);
    if (picked.isEmpty) return const [];

    final results = <PickedImageData>[];
    for (var index = 0; index < picked.length; index += 1) {
      results.add(
        await _toPickedImage(picked[index], index, _wardrobeCompression),
      );
    }
    return results;
  }

  Future<List<XFile>> _pickSingle(ImageSource source) async {
    final picked = await _picker.pickImage(
      source: source,
      imageQuality: 92,
      maxWidth: 2400,
      maxHeight: 2400,
      requestFullMetadata: false,
    );
    return picked == null ? const [] : [picked];
  }

  // _compressToTarget always re-encodes to CompressFormat.jpeg regardless of
  // the source format (HEIC, PNG, ...), so the output is always JPEG. The
  // file name must reflect that actual output format, not the original
  // picked file's extension, or the declared Content-Type sent to the
  // server (derived from this file name) would not match the real bytes.
  Future<PickedImageData> _toPickedImage(
    XFile picked,
    int index,
    _CompressionProfile profile,
  ) async {
    final original = await picked.readAsBytes();
    final compressed = await _compressToTarget(original, profile);
    return PickedImageData(
      bytes: compressed,
      fileName: '${DateTime.now().millisecondsSinceEpoch}-$index.jpg',
    );
  }

  Future<Uint8List> _compressToTarget(
    Uint8List original,
    _CompressionProfile profile,
  ) async {
    Uint8List? smallestAttempt;
    for (final dimension in profile.dimensionSteps) {
      for (final quality in profile.qualitySteps) {
        final result = await FlutterImageCompress.compressWithList(
          original,
          minWidth: dimension,
          minHeight: dimension,
          quality: quality,
          format: CompressFormat.jpeg,
        );
        if (result.lengthInBytes <= profile.maxBytes) return result;
        if (smallestAttempt == null ||
            result.lengthInBytes < smallestAttempt.lengthInBytes) {
          smallestAttempt = result;
        }
      }
    }

    // Every step still exceeded the target range: fall back to the
    // smallest attempt made, as long as it respects the hard safety ceiling.
    if (smallestAttempt != null &&
        smallestAttempt.lengthInBytes <= maxUploadBytes) {
      return smallestAttempt;
    }

    throw const NeraImageException(
      'The selected photo could not be compressed enough. Try another photo.',
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
