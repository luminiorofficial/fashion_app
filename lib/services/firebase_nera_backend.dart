import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../models/nera_models.dart';
import 'local_image_store.dart';
import 'nera_api_client.dart';
import 'nera_backend.dart';

class FirebaseNeraBackend implements NeraBackend {
  FirebaseNeraBackend({
    FirebaseAuth? auth,
    FirebaseFirestore? firestore,
    LocalImageStore? localImages,
    NeraApiClient? api,
  }) : _auth = auth ?? FirebaseAuth.instance,
       _firestore = firestore ?? FirebaseFirestore.instance,
       _localImages = localImages ?? LocalImageStore(),
       _api = api ?? NeraApiClient(auth: auth ?? FirebaseAuth.instance);

  final FirebaseAuth _auth;
  final FirebaseFirestore _firestore;
  final LocalImageStore _localImages;
  final NeraApiClient _api;
  final ValueNotifier<String?> _userId = ValueNotifier(null);
  final ValueNotifier<bool> _isAnonymous = ValueNotifier(true);
  StreamSubscription<User?>? _authSubscription;

  @override
  ValueListenable<String?> get userId => _userId;

  @override
  ValueListenable<bool> get isAnonymous => _isAnonymous;

  User get _user {
    final user = _auth.currentUser;
    if (user == null) throw const NeraException('Authentication is not ready.');
    return user;
  }

  DocumentReference<Map<String, dynamic>> get _userDoc => _firestore
      .collection('artifacts')
      .doc(neraAppId)
      .collection('users')
      .doc(_user.uid);

  @override
  Future<void> initialize() async {
    if (_auth.currentUser == null) await _auth.signInAnonymously();
    _syncUser(_auth.currentUser);
    _authSubscription = _auth.authStateChanges().listen(_syncUser);
  }

  void _syncUser(User? user) {
    _userId.value = user?.uid;
    _isAnonymous.value = user?.isAnonymous ?? true;
  }

  @override
  Stream<List<WardrobeItem>> watchWardrobe() {
    return _userDoc
        .collection('wardrobe')
        .orderBy('createdAt', descending: true)
        .snapshots()
        .map(
          (snapshot) => snapshot.docs.map(WardrobeItem.fromFirestore).toList(),
        );
  }

  @override
  Stream<StyleProfile> watchProfile() => _userDoc
      .collection('profile')
      .doc('style')
      .snapshots()
      .map((snapshot) => StyleProfile.fromMap(snapshot.data()));

  @override
  Future<WardrobeDraft> analyzeWardrobeImage(
    Uint8List bytes,
    String fileName,
  ) async {
    final itemDoc = _userDoc.collection('wardrobe').doc();
    final imagePath = await _localImages.saveWardrobeImage(
      userId: _user.uid,
      itemId: itemDoc.id,
      bytes: bytes,
    );

    try {
      final analysis = await _api.analyzeItem(bytes);
      final category = analysis['category'] as String?;
      return WardrobeDraft(
        id: itemDoc.id,
        name: analysis['item_name'] as String? ?? 'Wardrobe item',
        category: wardrobeCategories.contains(category)
            ? category!
            : 'Accessory',
        imageUrl: '',
        imagePath: imagePath,
        tags: List<String>.from(analysis['tags'] as List? ?? const []),
      );
    } catch (_) {
      await _localImages.delete(imagePath);
      rethrow;
    }
  }

  @override
  Future<void> saveWardrobeDraft(WardrobeDraft draft) =>
      _userDoc.collection('wardrobe').doc(draft.id).set({
        'name': draft.name.trim(),
        'category': draft.category,
        'imageUrl': draft.imageUrl,
        'imagePath': draft.imagePath,
        'tags': draft.tags,
        'createdAt': FieldValue.serverTimestamp(),
      });

  @override
  Future<void> discardWardrobeDraft(WardrobeDraft draft) =>
      _localImages.delete(draft.imagePath);

  @override
  Future<void> deleteWardrobeItem(WardrobeItem item) async {
    await _userDoc.collection('wardrobe').doc(item.id).delete();
    if (item.imagePath.isNotEmpty) {
      await _localImages.delete(item.imagePath);
    }
  }

  @override
  Future<StyleProfile> analyzeProfileImage(
    Uint8List bytes,
    String fileName,
  ) async {
    final analysis = await _api.analyzeProfile(bytes);
    final profile = StyleProfile(
      bodyType: analysis['body_type'] as String?,
      skinTone: analysis['skin_tone'] as String?,
    );
    await _userDoc.collection('profile').doc('style').set({
      'bodyType': profile.bodyType,
      'skinTone': profile.skinTone,
      'preferredStyles': profile.preferredStyles,
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
    await _localImages.saveProfileImage(userId: _user.uid, bytes: bytes);
    return profile;
  }

  @override
  Future<OutfitPlan> generateOutfit(
    String eventType,
    List<WardrobeItem> wardrobe,
    StyleProfile profile,
  ) async {
    if (wardrobe.isEmpty) {
      throw const NeraException('Add at least two wardrobe items first.');
    }
    if (!profile.isAnalyzed) {
      throw const NeraException('Analyze your style profile first.');
    }
    final result = await _api.generateOutfit(eventType: eventType);
    final historyDoc = _userDoc.collection('outfit_history').doc();
    final suggestedMap = result['suggested_item'] as Map<String, dynamic>?;
    final plan = OutfitPlan(
      id: historyDoc.id,
      eventType: eventType,
      wardrobeItemIds: List<String>.from(
        result['outfit_items'] as List? ?? const [],
      ),
      rationale: result['description'] as String? ?? 'Your NERA look is ready.',
      suggestedPurchaseItem: suggestedMap == null
          ? null
          : SuggestedPurchase.fromMap(suggestedMap),
    );
    await historyDoc.set({
      'eventType': plan.eventType,
      'wardrobeItemIds': plan.wardrobeItemIds,
      'rationale': plan.rationale,
      'suggestedPurchaseItem': plan.suggestedPurchaseItem?.toMap(),
      'createdAt': FieldValue.serverTimestamp(),
    });
    return plan;
  }

  @override
  Future<UserCredential?> signInWithGoogle() async {
    if (kIsWeb) {
      final provider = GoogleAuthProvider();
      if (_user.isAnonymous) return _user.linkWithPopup(provider);
      return _auth.signInWithPopup(provider);
    }
    await GoogleSignIn.instance.initialize();
    final googleUser = await GoogleSignIn.instance.authenticate();
    final credential = GoogleAuthProvider.credential(
      idToken: googleUser.authentication.idToken,
    );
    if (_user.isAnonymous) return _user.linkWithCredential(credential);
    return _auth.signInWithCredential(credential);
  }

  @override
  Future<UserCredential?> signInWithApple() async {
    final provider = AppleAuthProvider()..addScope('email');
    if (_user.isAnonymous) {
      return kIsWeb
          ? _user.linkWithPopup(provider)
          : _user.linkWithProvider(provider);
    }
    return kIsWeb
        ? _auth.signInWithPopup(provider)
        : _auth.signInWithProvider(provider);
  }

  @override
  void dispose() {
    _authSubscription?.cancel();
    _api.close();
    _userId.dispose();
    _isAnonymous.dispose();
  }
}
