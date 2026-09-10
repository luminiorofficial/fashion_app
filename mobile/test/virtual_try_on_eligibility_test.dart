import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:fashion_app/features/outfits/outfit_result_screen.dart';
import 'package:fashion_app/features/try_on/try_on_result_screen.dart';
import 'package:fashion_app/models/nera_models.dart';
import 'package:fashion_app/services/image_service.dart';
import 'package:fashion_app/services/memory_nera_backend.dart';
import 'package:fashion_app/services/nera_backend.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';

class _FakeImageService extends NeraImageService {
  @override
  Future<PickedImageData?> pick(ImageSource source) async => PickedImageData(
    bytes: base64Decode(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    ),
    fileName: 'profile.jpg',
  );
}

class _RecordingBackend extends MemoryNeraBackend {
  final List<List<String>> requests = [];

  @override
  Future<TryOnResult> generateTryOn({
    required List<String> wardrobeItemIds,
    String? outfitId,
  }) async {
    requests.add(List.of(wardrobeItemIds));
    throw const NeraException('Test stopped after recording the request.');
  }
}

class _UnavailableProfileBackend extends MemoryNeraBackend {
  int tryOnRequests = 0;
  int profileUploads = 0;
  final profileUpload = Completer<StyleProfile>();

  @override
  Future<TryOnResult> generateTryOn({
    required List<String> wardrobeItemIds,
    String? outfitId,
  }) async {
    tryOnRequests += 1;
    if (tryOnRequests == 1) {
      throw const NeraException(
        'Re-upload your full-body profile photo.',
        code: 'PROFILE_ASSET_UNAVAILABLE',
      );
    }
    throw const NeraException('Test stopped after retrying.');
  }

  @override
  Future<StyleProfile> analyzeProfileImage(Uint8List bytes, String fileName) {
    profileUploads += 1;
    return profileUpload.future;
  }
}

const _outfit = OutfitPlan(
  id: 'outfit-1',
  eventType: 'Casual',
  wardrobeItemIds: ['photo-top', 'link-bottom'],
  rationale: 'The recommendation remains visible.',
  suggestedItems: [
    SuggestedItem(name: 'External shoes', type: 'Shoes', role: 'essential'),
  ],
);

const _photoTop = WardrobeItem(
  id: 'photo-top',
  name: 'Photo Top',
  category: 'Top',
  imageUrl: 'https://images.example/photo-top.jpg',
  imagePath: '',
  imageStorageProvider: 'cloudinary',
);

const _linkBottom = WardrobeItem(
  id: 'link-bottom',
  name: 'Link Bottom',
  category: 'Bottom',
  imageUrl: '',
  imagePath: '',
  productUrl: 'https://shop.example/link-bottom',
  sourceType: 'product_link',
);

void main() {
  test('only Cloudinary wardrobe photos with valid URLs are eligible', () {
    expect(_photoTop.canUseVirtualTryOn, isTrue);
    expect(_linkBottom.canUseVirtualTryOn, isFalse);
    expect(
      const WardrobeItem(
        id: 'bad-url',
        name: 'Bad URL',
        category: 'Top',
        imageUrl: 'not-a-url',
        imagePath: '',
      ).canUseVirtualTryOn,
      isFalse,
    );
    expect(
      const WardrobeItem(
        id: 'legacy-r2',
        name: 'Legacy R2 Top',
        category: 'Top',
        imageUrl: 'https://images.example/legacy-top.jpg',
        imagePath: '',
        imageStorageProvider: 'r2',
      ).canUseVirtualTryOn,
      isFalse,
    );
  });

  testWidgets('mixed outfits exclude no-image items from try-on', (
    tester,
  ) async {
    final backend = _RecordingBackend();
    await tester.pumpWidget(
      MaterialApp(
        home: OutfitResultScreen(
          backend: backend,
          imageService: _FakeImageService(),
          outfit: _outfit,
          wardrobe: const [_photoTop, _linkBottom],
        ),
      ),
    );
    await tester.scrollUntilVisible(
      find.text('NERA SUGGESTS'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('External shoes'), findsWidgets);
    expect(find.text('Completes the look'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('WHY THIS WORKS'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('The recommendation remains visible.'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Try On Me'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.drag(find.byType(Scrollable).first, const Offset(0, 120));
    await tester.pump();
    await tester.tap(find.text('Try On Me'));
    await tester.pump();

    expect(backend.requests, [
      ['photo-top'],
    ]);
  });

  testWidgets('empty suggestions omit the NERA Suggests section', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: OutfitResultScreen(
          backend: _RecordingBackend(),
          imageService: _FakeImageService(),
          outfit: const OutfitPlan(
            id: 'complete-look',
            eventType: 'Casual',
            wardrobeItemIds: ['photo-top'],
            rationale: 'Complete from the wardrobe.',
          ),
          wardrobe: const [_photoTop],
        ),
      ),
    );
    await tester.scrollUntilVisible(
      find.text('FROM YOUR WARDROBE'),
      200,
      scrollable: find.byType(Scrollable).first,
    );

    expect(find.text('NERA SUGGESTS'), findsNothing);
    expect(find.text('FROM YOUR WARDROBE'), findsOneWidget);
  });

  testWidgets('an all-no-image outfit prompts for the named item', (
    tester,
  ) async {
    final backend = _RecordingBackend();
    const outfit = OutfitPlan(
      id: 'outfit-2',
      eventType: 'Casual',
      wardrobeItemIds: ['link-bottom'],
      rationale: 'Still recommended.',
    );
    await tester.pumpWidget(
      MaterialApp(
        home: OutfitResultScreen(
          backend: backend,
          imageService: _FakeImageService(),
          outfit: outfit,
          wardrobe: const [_linkBottom],
        ),
      ),
    );

    await tester.scrollUntilVisible(
      find.text('Try On Me'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('Try On Me'));
    await tester.pump();

    expect(backend.requests, isEmpty);
    expect(
      find.text('Re-upload photo for Link Bottom to use Virtual Try-On.'),
      findsWidgets,
    );
  });

  testWidgets(
    'missing profile asset opens the shared upload flow and returns to outfit',
    (tester) async {
      final backend = _UnavailableProfileBackend();
      await tester.pumpWidget(
        MaterialApp(
          home: OutfitResultScreen(
            backend: backend,
            imageService: _FakeImageService(),
            outfit: const OutfitPlan(
              id: 'outfit-profile-recovery',
              eventType: 'Casual',
              wardrobeItemIds: ['photo-top'],
              rationale: 'The outfit stays open.',
            ),
            wardrobe: const [_photoTop],
          ),
        ),
      );

      await tester.scrollUntilVisible(
        find.text('Try On Me'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('Try On Me'));
      await tester.pump();

      expect(find.text('Upload Full-Body Photo'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text('Upload Full-Body Photo'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('Upload Full-Body Photo'));
      await tester.pumpAndSettle();
      expect(find.text('Take a photo'), findsOneWidget);
      expect(find.text('Choose from gallery'), findsOneWidget);

      await tester.tap(find.text('Choose from gallery'));
      await tester.pumpAndSettle();
      expect(find.text('Your photo'), findsOneWidget);
      await tester.tap(find.text('Use this photo'));
      await tester.pump();
      expect(backend.profileUploads, 1);
      expect(find.text('Uploading & analyzing…'), findsOneWidget);

      backend.profileUpload.complete(
        const StyleProfile(bodyType: 'Hourglass', skinTone: 'Warm'),
      );
      await tester.pumpAndSettle();
      expect(find.text('Upload Full-Body Photo'), findsNothing);
      await tester.scrollUntilVisible(
        find.text('Try On Me'),
        200,
        scrollable: find.byType(Scrollable).first,
      );

      await tester.tap(find.text('Try On Me'));
      await tester.pump();
      expect(backend.tryOnRequests, 2);
    },
  );

  testWidgets('swap choices contain only items with real uploaded images', (
    tester,
  ) async {
    final backend = _RecordingBackend();
    const replacement = WardrobeItem(
      id: 'replacement-top',
      name: 'Replacement Top',
      category: 'Top',
      imageUrl: 'https://images.example/replacement-top.jpg',
      imagePath: '',
      imageStorageProvider: 'cloudinary',
    );
    const linkTop = WardrobeItem(
      id: 'link-top',
      name: 'Link Top',
      category: 'Top',
      imageUrl: '',
      imagePath: '',
      productUrl: 'https://shop.example/link-top',
      sourceType: 'product_link',
    );
    await tester.pumpWidget(
      MaterialApp(
        home: TryOnResultScreen(
          backend: backend,
          initialResult: const TryOnResult(
            id: 'tryon-1',
            wardrobeItemIds: ['photo-top'],
            imageUrl: 'https://images.example/result.jpg',
            status: 'completed',
            isSaved: false,
            developmentFallback: false,
          ),
          wardrobe: const [_photoTop, replacement, linkTop],
        ),
      ),
    );
    await tester.pump();

    await tester.tap(find.text('Change Top'));
    await tester.pumpAndSettle();

    expect(find.text('Replacement Top'), findsOneWidget);
    expect(find.text('Link Top'), findsNothing);
  });
}
