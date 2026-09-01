import 'package:flutter/foundation.dart';
import '../models/nera_models.dart';

abstract interface class NeraBackend {
  ValueListenable<String?> get userId;
  ValueListenable<bool> get isAuthenticated;
  ValueListenable<NeraUser?> get currentUser;

  /// Null while the profile hasn't been fetched yet for the current
  /// session. Once known, callers use [StyleProfile.isAnalyzed] to decide
  /// between showing profile creation or the home screen.
  ValueListenable<StyleProfile?> get profile;
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

  /// Saves multiple reviewed drafts in one batch, refreshing the wardrobe
  /// only once afterward (rather than once per item).
  Future<void> saveWardrobeDrafts(List<WardrobeDraft> drafts);
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
    StyleProfile profile, {
    LocationCoordinates? location,
  });
  Future<WeatherSummary> getWeather(LocationCoordinates location);
  Future<List<OutfitPlan>> listOutfitHistory();
  Future<OutfitFeedback> submitOutfitFeedback(
    String outfitId,
    OutfitReaction reaction,
  );
  Future<OutfitFeedback> markOutfitWorn(String outfitId);
  Future<TryOnResult> generateTryOn({
    required List<String> wardrobeItemIds,
    String? outfitId,
  });
  Future<TryOnResult> saveTryOnLook(String tryOnId);
  Future<List<TryOnResult>> listSavedLooks();
  Future<TryOnResult> unsaveTryOnLook(String tryOnId);
  void dispose();
}

class NeraException implements Exception {
  const NeraException(this.message, {this.code, this.statusCode});
  final String message;
  final String? code;
  final int? statusCode;
  @override
  String toString() => message;
}
