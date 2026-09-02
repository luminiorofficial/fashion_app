import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../models/nera_models.dart';
import 'nera_api_client.dart';
import 'nera_backend.dart';

class RemoteNeraBackend implements NeraBackend {
  RemoteNeraBackend({NeraApiClient? api, FlutterSecureStorage? secureStorage})
    : _api = api ?? NeraApiClient(),
      _storage = secureStorage ?? const FlutterSecureStorage();

  // The backend tries up to two models (primary + fallback), each with its
  // own ~120s Gemini timeout and no same-model retry by default, so its own
  // worst case is roughly 240s. This client timeout is kept a little above
  // that so a slow-but-succeeding generation isn't cancelled out from under
  // the backend before it has a chance to finish.
  static const tryOnRequestTimeout = Duration(seconds: 250);
  static const _tokenKey = 'nera_access_token';
  final NeraApiClient _api;
  final FlutterSecureStorage _storage;
  final ValueNotifier<String?> _userId = ValueNotifier(null);
  final ValueNotifier<bool> _authenticated = ValueNotifier(false);
  final ValueNotifier<NeraUser?> _currentUser = ValueNotifier(null);
  final ValueNotifier<StyleProfile?> _profileValue = ValueNotifier(null);
  NeraUser? _lastKnownUser;
  final _wardrobe = StreamController<List<WardrobeItem>>.broadcast();
  final _profile = StreamController<StyleProfile>.broadcast();
  List<WardrobeItem> _wardrobeCache = const [];
  StyleProfile _profileCache = const StyleProfile();

  @override
  ValueListenable<String?> get userId => _userId;
  @override
  ValueListenable<bool> get isAuthenticated => _authenticated;
  @override
  ValueListenable<NeraUser?> get currentUser => _currentUser;
  @override
  ValueListenable<StyleProfile?> get profile => _profileValue;

  @override
  Future<void> initialize() async {
    _api.accessToken = await _storage.read(key: _tokenKey);
    if (_api.accessToken == null) return;
    try {
      final response = await _api.get('/me');
      _setUser(NeraUser.fromJson(response['user'] as Map<String, dynamic>));
      await _refresh();
    } on Object {
      await _storage.delete(key: _tokenKey);
      _api.accessToken = null;
    }
  }

  @override
  Stream<List<WardrobeItem>> watchWardrobe() async* {
    yield _wardrobeCache;
    yield* _wardrobe.stream;
  }

  @override
  Stream<StyleProfile> watchProfile() async* {
    yield _profileCache;
    yield* _profile.stream;
  }

  @override
  Future<OtpChallenge> requestOtp({
    String? name,
    String? dateOfBirth,
    required String phoneNumber,
  }) async {
    final payload = <String, dynamic>{'phoneNumber': phoneNumber};
    if ((name ?? '').trim().isNotEmpty) {
      payload['name'] = name!.trim();
    }
    if ((dateOfBirth ?? '').trim().isNotEmpty) {
      payload['dateOfBirth'] = dateOfBirth!.trim();
    }
    final response = await _api.post('/auth/otp/request', payload);
    return OtpChallenge(
      id: response['challengeId'] as String,
      developmentOtp: response['developmentOtp'] as String?,
      purpose: response['purpose'] as String?,
    );
  }

  @override
  Future<void> verifyOtp({
    required String challengeId,
    required String otp,
  }) async {
    final response = await _api.post('/auth/otp/verify', {
      'challengeId': challengeId,
      'otp': otp,
    });
    _api.accessToken = response['accessToken'] as String;
    await _storage.write(key: _tokenKey, value: _api.accessToken);
    _setUser(NeraUser.fromJson(response['user'] as Map<String, dynamic>));
    await _refresh();
  }

  void _setUser(NeraUser user) {
    _lastKnownUser = user;
    _currentUser.value = user;
    _userId.value = user.id;
    _authenticated.value = true;
  }

  // Full refresh: only needed when both wardrobe and profile might have
  // changed (startup, login). Mutations that only touch one of the two
  // should call the matching single-resource refresh below instead, so a
  // wardrobe edit doesn't also re-fetch (and re-emit) an unchanged profile.
  Future<void> _refresh() =>
      Future.wait([_refreshWardrobe(), _refreshProfile()]);

  Future<void> _refreshWardrobe() async {
    final response = await _api.get('/wardrobe/items');
    _wardrobeCache = (response['items'] as List? ?? const [])
        .map((item) => WardrobeItem.fromJson(item as Map<String, dynamic>))
        .toList();
    _wardrobe.add(_wardrobeCache);
  }

  Future<void> _refreshProfile() async {
    final response = await _api.get('/profile');
    final fetchedProfile = StyleProfile.fromJson(
      response['profile'] as Map<String, dynamic>?,
    );
    _profileCache = fetchedProfile;
    _profile.add(fetchedProfile);
    _profileValue.value = fetchedProfile;
  }

  @override
  Future<void> logout() async {
    try {
      await _api.post('/auth/logout', const {});
    } on Object {
      /* clear the local session regardless */
    }
    await _storage.delete(key: _tokenKey);
    _api.accessToken = null;
    _userId.value = null;
    _authenticated.value = false;
    _currentUser.value = _lastKnownUser;
    _wardrobe.add(const []);
    _profile.add(const StyleProfile());
    _wardrobeCache = const [];
    _profileCache = const StyleProfile();
    _profileValue.value = null;
  }

  @override
  Future<WardrobeDraft> analyzeWardrobeImage(
    Uint8List bytes,
    String fileName,
  ) async {
    final response = await _api.upload('/wardrobe/analyze', bytes, fileName);
    final draft = response['draft'] as Map<String, dynamic>;
    return WardrobeDraft(
      id: draft['assetId'] as String,
      name: draft['name'] as String? ?? 'Wardrobe item',
      category: draft['category'] as String? ?? 'Accessory',
      imageUrl: draft['imageUrl'] as String? ?? '',
      imagePath: '',
      tags: List<String>.from(draft['tags'] as List? ?? const []),
      containsPerson: draft['containsPerson'] as bool? ?? false,
      garmentVisibility: draft['garmentVisibility'] as String? ?? 'full',
      virtualTryOnEligible: draft['virtualTryOnEligible'] as bool? ?? true,
      analysisJobId: draft['analysisJobId'] as String?,
    );
  }

  @override
  Future<void> saveWardrobeDraft(WardrobeDraft draft) async {
    await _api.post('/wardrobe/items', {
      'assetId': draft.id,
      'name': draft.name,
      'category': draft.category,
      'tags': draft.tags,
      'analysisJobId': draft.analysisJobId,
    });
    await _refreshWardrobe();
  }

  @override
  Future<void> saveWardrobeDrafts(List<WardrobeDraft> drafts) async {
    if (drafts.isEmpty) return;
    await _api.post('/wardrobe/items/batch', {
      'items': drafts
          .map(
            (draft) => {
              'assetId': draft.id,
              'name': draft.name,
              'category': draft.category,
              'tags': draft.tags,
              'analysisJobId': draft.analysisJobId,
            },
          )
          .toList(),
    });
    await _refreshWardrobe();
  }

  @override
  Future<void> discardWardrobeDraft(WardrobeDraft draft) =>
      _api.delete('/wardrobe/drafts/${draft.id}');
  @override
  Future<void> addWardrobeLink({
    required String name,
    required String category,
    required String productUrl,
  }) async {
    await _api.post('/wardrobe/links', {
      'name': name,
      'category': category,
      'productUrl': productUrl,
    });
    await _refreshWardrobe();
  }

  @override
  Future<void> deleteWardrobeItem(WardrobeItem item) async {
    await _api.delete('/wardrobe/items/${item.id}');
    await _refreshWardrobe();
  }

  @override
  Future<StyleProfile> analyzeProfileImage(
    Uint8List bytes,
    String fileName,
  ) async {
    final response = await _api.upload('/profile/analyze', bytes, fileName);
    final profile = StyleProfile.fromJson(
      response['profile'] as Map<String, dynamic>,
    );
    _profileCache = profile;
    _profile.add(profile);
    _profileValue.value = profile;
    return profile;
  }

  @override
  Future<OutfitPlan> generateOutfit(
    String eventType,
    List<WardrobeItem> wardrobe,
    StyleProfile profile, {
    LocationCoordinates? location,
  }) async {
    final response = await _api.post('/outfits/generate', {
      'eventType': eventType,
      if (location != null) ...{
        'lat': location.latitude,
        'lng': location.longitude,
      },
    });
    return OutfitPlan.fromJson(response['outfit'] as Map<String, dynamic>);
  }

  @override
  Future<WeatherSummary> getWeather(LocationCoordinates location) async {
    final query = Uri(
      queryParameters: {
        'lat': location.latitude.toString(),
        'lng': location.longitude.toString(),
      },
    ).query;
    final response = await _api.get('/weather?$query');
    return WeatherSummary.fromJson(response['weather'] as Map<String, dynamic>);
  }

  @override
  Future<List<OutfitPlan>> listOutfitHistory() async {
    final response = await _api.get('/outfits');
    return (response['outfits'] as List? ?? const [])
        .map((outfit) => OutfitPlan.fromJson(outfit as Map<String, dynamic>))
        .toList();
  }

  @override
  Future<OutfitFeedback> submitOutfitFeedback(
    String outfitId,
    OutfitReaction reaction,
  ) async {
    final response = await _api.post('/outfits/$outfitId/feedback', {
      'reaction': reaction.wireValue,
    });
    return OutfitFeedback.fromJson(
      response['feedback'] as Map<String, dynamic>,
    );
  }

  @override
  Future<OutfitFeedback> markOutfitWorn(String outfitId) async {
    final response = await _api.post('/outfits/$outfitId/wear', const {});
    return OutfitFeedback.fromJson(
      response['feedback'] as Map<String, dynamic>,
    );
  }

  @override
  Future<TryOnResult> generateTryOn({
    required List<String> wardrobeItemIds,
    String? outfitId,
  }) async {
    Map<String, dynamic> response;
    try {
      response = await _api.post(
        '/tryon/generate',
        {'wardrobeItemIds': wardrobeItemIds, 'outfitId': ?outfitId},
        timeout: tryOnRequestTimeout,
      );
    } on NeraException catch (error) {
      if (error.code == 'REQUEST_TIMEOUT') {
        throw const NeraException(
          'Virtual try-on is taking longer than usual. Please try again in a moment.',
          code: 'TRYON_TIMEOUT',
        );
      }
      rethrow;
    }
    final result = TryOnResult.fromJson(
      response['tryOn'] as Map<String, dynamic>,
    );
    if (result.developmentFallback ||
        result.imageUrl.trim().isEmpty ||
        result.status != 'completed') {
      throw const NeraException(
        'Our virtual try-on service is currently unavailable. No generated image was returned.',
      );
    }
    return result;
  }

  @override
  Future<TryOnResult> saveTryOnLook(String tryOnId) async {
    final response = await _api.post('/tryon/$tryOnId/save', const {});
    return TryOnResult.fromJson(response['tryOn'] as Map<String, dynamic>);
  }

  @override
  Future<List<TryOnResult>> listSavedLooks() async {
    final response = await _api.get('/tryon/saved');
    return (response['tryOns'] as List? ?? const [])
        .map((tryOn) => TryOnResult.fromJson(tryOn as Map<String, dynamic>))
        .toList();
  }

  @override
  Future<TryOnResult> unsaveTryOnLook(String tryOnId) async {
    final response = await _api.post('/tryon/$tryOnId/unsave', const {});
    return TryOnResult.fromJson(response['tryOn'] as Map<String, dynamic>);
  }

  @override
  Future<String> beginGmailConnect() async {
    final response = await _api.post('/commerce/gmail/connect', const {});
    return response['authUrl'] as String;
  }

  @override
  Future<GmailConnectionStatus> getGmailStatus() async {
    final response = await _api.get('/commerce/gmail/status');
    return GmailConnectionStatus.fromJson(response);
  }

  @override
  Future<GmailSyncSummary> syncGmail() async {
    final response = await _api.post('/commerce/gmail/sync', const {});
    return GmailSyncSummary.fromJson(response);
  }

  @override
  Future<void> disconnectGmail() => _api.delete('/commerce/gmail/connection');

  @override
  Future<List<PurchaseCandidate>> listPurchaseCandidates() async {
    final response = await _api.get('/commerce/purchases');
    return (response['purchases'] as List? ?? const [])
        .map(
          (purchase) =>
              PurchaseCandidate.fromJson(purchase as Map<String, dynamic>),
        )
        .toList();
  }

  @override
  Future<WardrobeItem> addPurchaseToWardrobe(String purchaseId) async {
    final response = await _api.post(
      '/commerce/purchases/$purchaseId/add-to-wardrobe',
      const {},
    );
    final item = WardrobeItem.fromJson(response['item'] as Map<String, dynamic>);
    await _refreshWardrobe();
    return item;
  }

  @override
  Future<void> ignorePurchase(String purchaseId) async {
    await _api.post('/commerce/purchases/$purchaseId/ignore', const {});
  }

  @override
  void dispose() {
    _api.close();
    _userId.dispose();
    _authenticated.dispose();
    _currentUser.dispose();
    _profileValue.dispose();
    _wardrobe.close();
    _profile.close();
  }
}
