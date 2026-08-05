import 'dart:async';
import 'package:flutter/foundation.dart';
import '../models/nera_models.dart';
import 'nera_backend.dart';

class MemoryNeraBackend implements NeraBackend {
  final ValueNotifier<String?> _userId = ValueNotifier('preview-user');
  final ValueNotifier<bool> _authenticated = ValueNotifier(true);
  final ValueNotifier<NeraUser?> _currentUser = ValueNotifier(
    const NeraUser(
      id: 'preview-user',
      name: 'Preview User',
      dateOfBirth: '1995-01-01',
      phoneNumber: '+919999999999',
    ),
  );
  final _wardrobeController = StreamController<List<WardrobeItem>>.broadcast();
  final _profileController = StreamController<StyleProfile>.broadcast();
  final List<WardrobeItem> _items = [];
  StyleProfile _styleProfile = const StyleProfile();
  @override
  ValueListenable<String?> get userId => _userId;
  @override
  ValueListenable<bool> get isAuthenticated => _authenticated;
  @override
  ValueListenable<NeraUser?> get currentUser => _currentUser;
  @override
  Future<void> initialize() async {}
  @override
  Stream<List<WardrobeItem>> watchWardrobe() async* {
    yield List.unmodifiable(_items);
    yield* _wardrobeController.stream;
  }

  @override
  Stream<StyleProfile> watchProfile() async* {
    yield _styleProfile;
    yield* _profileController.stream;
  }

  @override
  Future<OtpChallenge> requestOtp({
    required String name,
    required String dateOfBirth,
    required String phoneNumber,
  }) async =>
      const OtpChallenge(id: 'preview-challenge', developmentOtp: '123456');
  @override
  Future<void> verifyOtp({
    required String challengeId,
    required String otp,
  }) async {
    _authenticated.value = true;
  }

  @override
  Future<void> logout() async {
    _authenticated.value = false;
  }

  @override
  Future<WardrobeDraft> analyzeWardrobeImage(
    Uint8List bytes,
    String fileName,
  ) async => const WardrobeDraft(
    id: 'preview-draft',
    name: 'Black Silk Blazer',
    category: 'Outerwear',
    imageUrl: '',
    imagePath: '',
    tags: ['black', 'silk', 'tailored'],
  );
  @override
  Future<void> saveWardrobeDraft(WardrobeDraft draft) async {
    _items.insert(
      0,
      WardrobeItem(
        id: draft.id,
        name: draft.name,
        category: draft.category,
        imageUrl: draft.imageUrl,
        imagePath: draft.imagePath,
        tags: draft.tags,
        createdAt: DateTime.now(),
      ),
    );
    _wardrobeController.add(List.unmodifiable(_items));
  }

  @override
  Future<void> discardWardrobeDraft(WardrobeDraft draft) async {}
  @override
  Future<void> addWardrobeLink({
    required String name,
    required String category,
    required String productUrl,
  }) async {
    _items.insert(
      0,
      WardrobeItem(
        id: DateTime.now().microsecondsSinceEpoch.toString(),
        name: name,
        category: category,
        imageUrl: '',
        imagePath: '',
        productUrl: productUrl,
        sourceType: 'product_link',
      ),
    );
    _wardrobeController.add(List.unmodifiable(_items));
  }

  @override
  Future<void> deleteWardrobeItem(WardrobeItem item) async {
    _items.removeWhere((candidate) => candidate.id == item.id);
    _wardrobeController.add(List.unmodifiable(_items));
  }

  @override
  Future<StyleProfile> analyzeProfileImage(
    Uint8List bytes,
    String fileName,
  ) async {
    _styleProfile = const StyleProfile(
      bodyType: 'Hourglass',
      skinTone: 'Warm golden undertones',
      hairColor: 'Dark brown',
      facialStructure: 'Oval',
    );
    _profileController.add(_styleProfile);
    return _styleProfile;
  }

  @override
  Future<OutfitPlan> generateOutfit(
    String eventType,
    List<WardrobeItem> wardrobe,
    StyleProfile profile,
  ) async => OutfitPlan(
    id: 'preview-outfit',
    eventType: eventType,
    wardrobeItemIds: wardrobe.take(3).map((item) => item.id).toList(),
    rationale: 'A polished, balanced look selected from your wardrobe.',
  );
  @override
  void dispose() {
    _userId.dispose();
    _authenticated.dispose();
    _currentUser.dispose();
    _wardrobeController.close();
    _profileController.close();
  }
}
