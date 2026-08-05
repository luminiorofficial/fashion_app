import 'dart:io';
import 'dart:typed_data';

import 'package:path/path.dart' as path;
import 'package:path_provider/path_provider.dart';

import 'nera_backend.dart';

/// Persists private images inside this app's documents directory.
///
/// These paths are intentionally device-local and isolated by owning user id.
class LocalImageStore {
  LocalImageStore({Future<Directory> Function()? documentsDirectory})
    : _documentsDirectory =
          documentsDirectory ?? getApplicationDocumentsDirectory;

  final Future<Directory> Function() _documentsDirectory;

  Future<String> saveWardrobeImage({
    required String userId,
    required String itemId,
    required Uint8List bytes,
  }) {
    if (!_safeSegment(itemId)) {
      throw const NeraException('The local image destination is invalid.');
    }
    return _write(
      userId: userId,
      relativePath: path.join('wardrobe', '$itemId.jpg'),
      bytes: bytes,
    );
  }

  Future<String> saveProfileImage({
    required String userId,
    required Uint8List bytes,
  }) => _write(
    userId: userId,
    relativePath: path.join('profile', 'style.jpg'),
    bytes: bytes,
  );

  Future<void> delete(String filePath) async {
    if (filePath.trim().isEmpty) return;
    final root = await _rootDirectory();
    final candidate = path.canonicalize(filePath);
    if (!path.isWithin(root.path, candidate)) return;
    final file = File(candidate);
    if (await file.exists()) await file.delete();
  }

  Future<String> _write({
    required String userId,
    required String relativePath,
    required Uint8List bytes,
  }) async {
    if (!_safeSegment(userId)) {
      throw const NeraException('The local image destination is invalid.');
    }
    final root = await _rootDirectory();
    final destination = path.join(root.path, 'users', userId, relativePath);
    final file = File(destination);
    await file.parent.create(recursive: true);
    await file.writeAsBytes(bytes, flush: true);
    return file.path;
  }

  Future<Directory> _rootDirectory() async {
    final documents = await _documentsDirectory();
    return Directory(path.join(documents.path, 'nera'));
  }

  bool _safeSegment(String value) =>
      value.isNotEmpty && RegExp(r'^[A-Za-z0-9_-]+$').hasMatch(value);
}
