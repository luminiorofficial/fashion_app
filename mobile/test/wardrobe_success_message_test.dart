import 'package:fashion_app/features/wardrobe/wardrobe_screen.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('formatWardrobeLabel', () {
    test('capitalizes a lowercase single word', () {
      expect(formatWardrobeLabel('shoes'), 'Shoes');
    });

    test('capitalizes every word in a multi-word label', () {
      expect(formatWardrobeLabel('white sneakers'), 'White Sneakers');
    });

    test('normalizes a shouty all-caps label', () {
      expect(formatWardrobeLabel('SHOES'), 'Shoes');
    });

    test('leaves an already-proper label unchanged', () {
      expect(formatWardrobeLabel('Silk Scarf'), 'Silk Scarf');
    });

    test('collapses extra internal whitespace', () {
      expect(formatWardrobeLabel('white   sneakers'), 'White Sneakers');
    });
  });
}
