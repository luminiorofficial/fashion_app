import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';

import '../models/nera_models.dart';

abstract interface class NeraBackend {
  ValueListenable<String?> get userId;
  ValueListenable<bool> get isAnonymous;
  Stream<List<WardrobeItem>> watchWardrobe();
  Stream<StyleProfile> watchProfile();
  Future<void> initialize();
  Future<WardrobeDraft> analyzeWardrobeImage(Uint8List bytes, String fileName);
  Future<void> saveWardrobeDraft(WardrobeDraft draft);
  Future<void> discardWardrobeDraft(WardrobeDraft draft);
  Future<void> deleteWardrobeItem(WardrobeItem item);
  Future<StyleProfile> analyzeProfileImage(Uint8List bytes, String fileName);
  Future<OutfitPlan> generateOutfit(
    String eventType,
    List<WardrobeItem> wardrobe,
    StyleProfile profile,
  );
  Future<UserCredential?> signInWithGoogle();
  Future<UserCredential?> signInWithApple();
  void dispose();
}

class NeraException implements Exception {
  const NeraException(this.message);
  final String message;

  @override
  String toString() => message;
}
