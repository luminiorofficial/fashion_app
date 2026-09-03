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
}
