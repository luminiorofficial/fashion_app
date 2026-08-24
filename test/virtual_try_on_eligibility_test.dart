import 'package:fashion_app/features/outfits/outfit_result_screen.dart';
import 'package:fashion_app/features/try_on/try_on_result_screen.dart';
import 'package:fashion_app/models/nera_models.dart';
import 'package:fashion_app/services/memory_nera_backend.dart';
import 'package:fashion_app/services/nera_backend.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

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

const _outfit = OutfitPlan(
  id: 'outfit-1',
  eventType: 'Casual',
  wardrobeItemIds: ['photo-top', 'link-bottom'],
  rationale: 'The recommendation remains visible.',
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
          outfit: _outfit,
          wardrobe: const [_photoTop, _linkBottom],
        ),
      ),
    );

    await tester.drag(find.byType(ListView).first, const Offset(0, -700));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Try On Me'));
    await tester.pump();

    expect(backend.requests, [
      ['photo-top'],
    ]);
    expect(find.text('The recommendation remains visible.'), findsOneWidget);
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
          outfit: outfit,
          wardrobe: const [_linkBottom],
        ),
      ),
    );

    await tester.drag(find.byType(ListView).first, const Offset(0, -700));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Try On Me'));
    await tester.pump();

    expect(backend.requests, isEmpty);
    expect(
      find.text('Re-upload photo for Link Bottom to use Virtual Try-On.'),
      findsWidgets,
    );
  });

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

    await tester.tap(find.text('Swap Top'));
    await tester.pumpAndSettle();

    expect(find.text('Replacement Top'), findsOneWidget);
    expect(find.text('Link Top'), findsNothing);
  });
}
