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

  static const tryOnRequestTimeout = Duration(seconds: 180);
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

  Future<void> _refresh() async {
    final results = await Future.wait([
      _api.get('/wardrobe/items'),
      _api.get('/profile'),
    ]);
    _wardrobeCache = (results[0]['items'] as List? ?? const [])
        .map((item) => WardrobeItem.fromJson(item as Map<String, dynamic>))
        .toList();
    _wardrobe.add(_wardrobeCache);
    final fetchedProfile = StyleProfile.fromJson(
      results[1]['profile'] as Map<String, dynamic>?,
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
    await _refresh();
  }

  @override
  Future<void> saveWardrobeDrafts(List<WardrobeDraft> drafts) async {
    if (drafts.isEmpty) return;
    await Future.wait(
      drafts.map(
        (draft) => _api.post('/wardrobe/items', {
          'assetId': draft.id,
          'name': draft.name,
          'category': draft.category,
          'tags': draft.tags,
          'analysisJobId': draft.analysisJobId,
        }),
      ),
    );
    await _refresh();
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
    await _refresh();
  }

  @override
  Future<void> deleteWardrobeItem(WardrobeItem item) async {
    await _api.delete('/wardrobe/items/${item.id}');
    await _refresh();
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
    StyleProfile profile,
  ) async {
    final response = await _api.post('/outfits/generate', {
      'eventType': eventType,
    });
    return OutfitPlan.fromJson(response['outfit'] as Map<String, dynamic>);
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
    final response = await _api.post(
      '/tryon/generate',
      {'wardrobeItemIds': wardrobeItemIds, 'outfitId': ?outfitId},
      timeout: tryOnRequestTimeout,
    );
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
