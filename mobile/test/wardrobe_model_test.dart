import 'package:fashion_app/models/nera_models.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('WardrobeItem.fromJson parses sourceMarketplace and isNew', () {
    final item = WardrobeItem.fromJson({
      'id': 'item-1',
      'name': 'Roadster Shirt',
      'category': 'Top',
      'imageUrl': 'https://example.test/shirt.jpg',
      'sourceMarketplace': 'amazon',
      'isNew': true,
    });

    expect(item.sourceMarketplace, 'amazon');
    expect(item.isNew, isTrue);
  });

  test(
    'WardrobeItem.fromJson defaults to no source and not NEW when absent',
    () {
      final item = WardrobeItem.fromJson({
        'id': 'item-2',
        'name': 'Silk Scarf',
        'category': 'Accessory',
        'imageUrl': '',
      });

      expect(item.sourceMarketplace, isNull);
      expect(item.isNew, isFalse);
    },
  );

  test('copyWith(isNew: false) clears the badge without touching other fields', () {
    const item = WardrobeItem(
      id: 'item-1',
      name: 'Roadster Shirt',
      category: 'Top',
      imageUrl: 'https://example.test/shirt.jpg',
      imagePath: '',
      sourceMarketplace: 'amazon',
      isNew: true,
    );

    final viewed = item.copyWith(isNew: false);

    expect(viewed.isNew, isFalse);
    expect(viewed.sourceMarketplace, 'amazon');
    expect(viewed.id, item.id);
    expect(viewed.name, item.name);
    expect(viewed.category, item.category);
    expect(viewed.imageUrl, item.imageUrl);
  });

  test('WardrobeItem.fromJson parses an AI-detected subcategory', () {
    final item = WardrobeItem.fromJson({
      'id': 'item-1',
      'name': 'White Sneakers',
      'category': 'Shoes',
      'subcategory': 'Sneakers',
      'imageUrl': 'https://example.test/sneakers.jpg',
    });

    expect(item.category, 'Shoes');
    expect(item.subcategory, 'Sneakers');
  });

  test('WardrobeItem.fromJson defaults subcategory to null when absent', () {
    final item = WardrobeItem.fromJson({
      'id': 'item-1',
      'name': 'Silk Scarf',
      'category': 'Accessory',
      'imageUrl': '',
    });

    expect(item.subcategory, isNull);
  });

  test(
    "a wardrobe item's category is unaffected by an unrelated or misleading name",
    () {
      const shoeNamedAccessory = WardrobeItem(
        id: 'item-1',
        name: 'Accessory',
        category: 'Shoes',
        imageUrl: '',
        imagePath: '',
      );

      expect(shoeNamedAccessory.category, 'Shoes');
    },
  );

  test(
    'category filtering (mirroring the wardrobe screen chips) reads only the '
    'category field, never the name',
    () {
      const items = [
        WardrobeItem(
          id: '1',
          name: 'Accessory', // deliberately misleading name
          category: 'Shoes',
          imageUrl: '',
          imagePath: '',
        ),
        WardrobeItem(
          id: '2',
          name: 'Shoes', // deliberately misleading name
          category: 'Accessory',
          imageUrl: '',
          imagePath: '',
        ),
        WardrobeItem(
          id: '3',
          name: 'White Sneakers',
          category: 'Shoes',
          imageUrl: '',
          imagePath: '',
        ),
      ];

      List<WardrobeItem> visibleFor(String filter) => filter == 'All'
          ? items
          : items.where((item) => item.category == filter).toList();

      expect(
        visibleFor('Shoes').map((item) => item.id),
        containsAll(['1', '3']),
      );
      expect(visibleFor('Shoes'), hasLength(2));
      expect(visibleFor('Accessory').single.id, '2');
    },
  );
}
