import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';

import '../models/nera_models.dart';
import 'nera_backend.dart';

/// Used by widget tests and previews where Firebase is intentionally absent.
class MemoryNeraBackend implements NeraBackend {
  final ValueNotifier<String?> _userId = ValueNotifier('preview-user');
  final ValueNotifier<bool> _isAnonymous = ValueNotifier(true);
  final _wardrobeController = StreamController<List<WardrobeItem>>.broadcast();
  final _profileController = StreamController<StyleProfile>.broadcast();
  final List<WardrobeItem> _items = [];
  StyleProfile _profile = const StyleProfile();

  @override
  ValueListenable<String?> get userId => _userId;

  @override
  ValueListenable<bool> get isAnonymous => _isAnonymous;

  @override
  Future<void> initialize() async {}

  @override
  Stream<List<WardrobeItem>> watchWardrobe() async* {
    yield List.unmodifiable(_items);
    yield* _wardrobeController.stream;
  }

  @override
  Stream<StyleProfile> watchProfile() async* {
    yield _profile;
    yield* _profileController.stream;
  }

  @override
  Future<WardrobeDraft> analyzeWardrobeImage(
    Uint8List bytes,
    String fileName,
  ) async => WardrobeDraft(
    id: DateTime.now().microsecondsSinceEpoch.toString(),
    name: 'Black Silk Blazer',
    category: 'Outerwear',
    imageUrl: '',
    imagePath: '',
    tags: const ['black', 'silk', 'tailored'],
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
  Future<void> deleteWardrobeItem(WardrobeItem item) async {
    _items.removeWhere((candidate) => candidate.id == item.id);
    _wardrobeController.add(List.unmodifiable(_items));
  }

  @override
  Future<StyleProfile> analyzeProfileImage(
    Uint8List bytes,
    String fileName,
  ) async {
    _profile = const StyleProfile(
      bodyType: 'Hourglass',
      skinTone: 'Warm golden undertones',
    );
    _profileController.add(_profile);
    return _profile;
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
  Future<UserCredential?> signInWithApple() async => null;

  @override
  Future<UserCredential?> signInWithGoogle() async => null;

  @override
  void dispose() {
    _userId.dispose();
    _isAnonymous.dispose();
    _wardrobeController.close();
    _profileController.close();
  }
}
