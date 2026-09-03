import 'dart:async';
import 'package:flutter/foundation.dart';
import '../models/nera_models.dart';
import 'nera_backend.dart';

class MemoryNeraBackend implements NeraBackend {
  MemoryNeraBackend({
    bool authenticated = false,
    NeraUser? initialUser,
    StyleProfile? initialProfile,
  }) {
    _userId.value = initialUser?.id ?? (authenticated ? 'preview-user' : null);
    _authenticated.value = authenticated;
    _currentUser.value =
        initialUser ??
        (authenticated
            ? const NeraUser(
                id: 'preview-user',
                name: 'Preview User',
                dateOfBirth: '1995-01-01',
                phoneNumber: '+919999999999',
              )
            : null);
    _styleProfile = initialProfile ?? const StyleProfile();
    _profileValue.value = authenticated ? _styleProfile : null;
  }

  final ValueNotifier<String?> _userId = ValueNotifier(null);
  final ValueNotifier<bool> _authenticated = ValueNotifier(false);
  final ValueNotifier<NeraUser?> _currentUser = ValueNotifier(null);
  final ValueNotifier<StyleProfile?> _profileValue = ValueNotifier(null);
  final _wardrobeController = StreamController<List<WardrobeItem>>.broadcast();
  final _profileController = StreamController<StyleProfile>.broadcast();
  final List<WardrobeItem> _items = [];
  final List<OutfitPlan> _outfits = [];
  final List<PurchaseCandidate> _purchases = [];
  bool _gmailConnected = false;
  late StyleProfile _styleProfile;
  @override
  ValueListenable<String?> get userId => _userId;
  @override
  ValueListenable<bool> get isAuthenticated => _authenticated;
  @override
  ValueListenable<NeraUser?> get currentUser => _currentUser;
  @override
  ValueListenable<StyleProfile?> get profile => _profileValue;
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
    String? name,
    String? dateOfBirth,
    required String phoneNumber,
  }) async => OtpChallenge(
    id: 'preview-challenge',
    developmentOtp: '123456',
    purpose:
        ((name ?? '').trim().isNotEmpty &&
            (dateOfBirth ?? '').trim().isNotEmpty)
        ? 'registration'
        : 'login',
  );
  @override
  Future<void> verifyOtp({
    required String challengeId,
    required String otp,
  }) async {
    _authenticated.value = true;
    _currentUser.value ??= const NeraUser(
      id: 'preview-user',
      name: 'Preview User',
      dateOfBirth: '1995-01-01',
      phoneNumber: '+919999999999',
    );
    _userId.value = _currentUser.value?.id;
    _profileValue.value ??= _styleProfile;
  }

  @override
  Future<void> logout() async {
    _authenticated.value = false;
    _userId.value = null;
    _currentUser.value ??= const NeraUser(
      id: 'preview-user',
      name: 'Preview User',
      dateOfBirth: '1995-01-01',
      phoneNumber: '+919999999999',
    );
    _profileValue.value = null;
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
  Future<void> saveWardrobeDrafts(List<WardrobeDraft> drafts) async {
    for (final draft in drafts) {
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
    }
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
  Future<WardrobeItem> markWardrobeItemViewed(String itemId) async {
    final index = _items.indexWhere((item) => item.id == itemId);
    if (index == -1) {
      throw const NeraException('The wardrobe item was not found.');
    }
    final updated = _items[index].copyWith(isNew: false);
    _items[index] = updated;
    _wardrobeController.add(List.unmodifiable(_items));
    return updated;
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
    _profileValue.value = _styleProfile;
    return _styleProfile;
  }

  @override
  Future<OutfitPlan> generateOutfit(
    String eventType,
    List<WardrobeItem> wardrobe,
    StyleProfile profile, {
    LocationCoordinates? location,
  }) async {
    final outfit = OutfitPlan(
      id: 'preview-outfit-${_outfits.length}',
      eventType: eventType,
      wardrobeItemIds: wardrobe.take(3).map((item) => item.id).toList(),
      rationale: 'A polished, balanced look selected from your wardrobe.',
      matchScore: 60,
      createdAt: DateTime.now(),
    );
    _outfits.insert(0, outfit);
    return outfit;
  }

  @override
  Future<WeatherSummary> getWeather(LocationCoordinates location) async =>
      const WeatherSummary(
        temperatureC: 24,
        feelsLikeC: 25,
        humidityPercent: 58,
        rainProbabilityPercent: 20,
        condition: 'Partly cloudy',
        windKph: 9,
      );

  @override
  Future<List<OutfitPlan>> listOutfitHistory() async =>
      List.unmodifiable(_outfits);

  @override
  Future<OutfitFeedback> submitOutfitFeedback(
    String outfitId,
    OutfitReaction reaction,
  ) async {
    final feedback = OutfitFeedback(outfitId: outfitId, reaction: reaction);
    _applyFeedback(outfitId, feedback);
    return feedback;
  }

  @override
  Future<OutfitFeedback> markOutfitWorn(String outfitId) async {
    final index = _outfits.indexWhere((outfit) => outfit.id == outfitId);
    final existing = index == -1 ? null : _outfits[index].feedback;
    final feedback = (existing ?? OutfitFeedback(outfitId: outfitId)).copyWith(
      wornAt: DateTime.now(),
    );
    _applyFeedback(outfitId, feedback);
    return feedback;
  }

  void _applyFeedback(String outfitId, OutfitFeedback feedback) {
    final index = _outfits.indexWhere((outfit) => outfit.id == outfitId);
    if (index != -1) {
      _outfits[index] = _outfits[index].copyWith(feedback: feedback);
    }
  }

  @override
  Future<TryOnResult> generateTryOn({
    required List<String> wardrobeItemIds,
    String? outfitId,
  }) async => throw const NeraException(
    'Virtual try-on is unavailable in preview mode. Connect to the configured try-on service and try again.',
  );

  @override
  Future<TryOnResult> saveTryOnLook(String tryOnId) async =>
      throw const NeraException(
        'Virtual try-on is unavailable in preview mode.',
      );

  @override
  Future<List<TryOnResult>> listSavedLooks() async => const [];

  @override
  Future<TryOnResult> unsaveTryOnLook(String tryOnId) async =>
      throw const NeraException(
        'Virtual try-on is unavailable in preview mode.',
      );

  @override
  Future<String> beginGmailConnect() async {
    // No real OAuth round trip in preview mode: connect immediately so the
    // rest of the flow (status, sync, Purchases UI) can be exercised.
    _gmailConnected = true;
    return 'https://accounts.google.com/o/oauth2/v2/auth?preview=1';
  }

  @override
  Future<GmailConnectionStatus> getGmailStatus() async => _gmailConnected
      ? GmailConnectionStatus(
          connected: true,
          email: 'preview.user@gmail.com',
          lastSyncedAt: DateTime.now(),
          syncStatus: 'completed',
        )
      : GmailConnectionStatus.disconnected;

  @override
  Future<GmailSyncSummary> syncGmail() async {
    if (!_gmailConnected) {
      throw const NeraException('Connect Gmail before syncing.');
    }
    if (_purchases.isEmpty) {
      _purchases.addAll(const [
        PurchaseCandidate(
          id: 'preview-purchase-1',
          marketplace: 'amazon',
          productName: 'Roadster Men Navy Blue Casual Shirt',
          brand: 'Roadster',
          sizeLabel: 'L',
          colorLabel: 'Navy Blue',
        ),
      ]);
    }
    return const GmailSyncSummary(processed: 1, hasMore: false);
  }

  @override
  Future<void> disconnectGmail() async {
    _gmailConnected = false;
    _purchases.clear();
  }

  @override
  Future<List<PurchaseCandidate>> listPurchaseCandidates() async =>
      List.unmodifiable(_purchases);

  @override
  Future<WardrobeItem> addPurchaseToWardrobe(String purchaseId) async {
    final index = _purchases.indexWhere(
      (candidate) => candidate.id == purchaseId,
    );
    if (index == -1) {
      throw const NeraException('The purchase was not found.');
    }
    final candidate = _purchases.removeAt(index);
    final item = WardrobeItem(
      id: 'preview-imported-${DateTime.now().microsecondsSinceEpoch}',
      name: candidate.productName,
      category: 'Top',
      imageUrl: candidate.imageUrl ?? '',
      imagePath: '',
      sourceMarketplace: candidate.marketplace,
      isNew: true,
      createdAt: DateTime.now(),
    );
    _items.insert(0, item);
    _wardrobeController.add(List.unmodifiable(_items));
    return item;
  }

  @override
  Future<void> ignorePurchase(String purchaseId) async {
    _purchases.removeWhere((candidate) => candidate.id == purchaseId);
  }

  @override
  void dispose() {
    _userId.dispose();
    _authenticated.dispose();
    _currentUser.dispose();
    _profileValue.dispose();
    _wardrobeController.close();
    _profileController.close();
  }
}
