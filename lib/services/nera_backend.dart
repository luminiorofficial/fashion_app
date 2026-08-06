import 'package:flutter/foundation.dart';
import '../models/nera_models.dart';

abstract interface class NeraBackend {
  ValueListenable<String?> get userId;
  ValueListenable<bool> get isAuthenticated;
  ValueListenable<NeraUser?> get currentUser;
  Stream<List<WardrobeItem>> watchWardrobe();
  Stream<StyleProfile> watchProfile();
  Future<void> initialize();
  Future<OtpChallenge> requestOtp({
    String? name,
    String? dateOfBirth,
    required String phoneNumber,
  });
  Future<void> verifyOtp({required String challengeId, required String otp});
  Future<void> logout();
  Future<WardrobeDraft> analyzeWardrobeImage(Uint8List bytes, String fileName);
  Future<void> saveWardrobeDraft(WardrobeDraft draft);
  Future<void> discardWardrobeDraft(WardrobeDraft draft);
  Future<void> addWardrobeLink({
    required String name,
    required String category,
    required String productUrl,
  });
  Future<void> deleteWardrobeItem(WardrobeItem item);
  Future<StyleProfile> analyzeProfileImage(Uint8List bytes, String fileName);
  Future<OutfitPlan> generateOutfit(
    String eventType,
    List<WardrobeItem> wardrobe,
    StyleProfile profile,
  );
  void dispose();
}

class NeraException implements Exception {
  const NeraException(this.message);
  final String message;
  @override
  String toString() => message;
}
