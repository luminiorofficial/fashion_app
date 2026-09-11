import 'package:fashion_app/features/auth/auth_screen.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('validatePhoneNumber', () {
    test('accepts a 10-digit number starting with 6, 7, 8, or 9', () {
      for (final digit in ['6', '7', '8', '9']) {
        expect(validatePhoneNumber('${digit}876543210'), isNull);
      }
    });

    test('rejects an all-zero placeholder number', () {
      expect(validatePhoneNumber('0000000000'), isNotNull);
    });

    test('rejects a number starting with 0-5', () {
      expect(validatePhoneNumber('5876543210'), isNotNull);
      expect(validatePhoneNumber('1234567890'), isNotNull);
    });

    test('rejects an incomplete number', () {
      expect(validatePhoneNumber('98765'), isNotNull);
    });

    test('rejects letters and special characters', () {
      expect(validatePhoneNumber('98765432a1'), isNotNull);
      expect(validatePhoneNumber('9876-54321'), isNotNull);
    });

    test('rejects empty input', () {
      expect(validatePhoneNumber(''), isNotNull);
      expect(validatePhoneNumber(null), isNotNull);
    });

    test('returns the exact required validation message', () {
      expect(
        validatePhoneNumber('123'),
        'Please enter a valid 10-digit mobile number.',
      );
    });
  });

  group('cleanFullName', () {
    test('trims leading and trailing whitespace', () {
      expect(cleanFullName('  Riya Sharma  '), 'Riya Sharma');
    });

    test('collapses multiple consecutive spaces into one', () {
      expect(cleanFullName('Riya    Sharma'), 'Riya Sharma');
      expect(cleanFullName('Riya   \t  Sharma'), 'Riya Sharma');
    });
  });

  group('validateFullName', () {
    test('accepts a genuine name containing spaces', () {
      expect(validateFullName('Riya Sharma'), isNull);
    });

    test('accepts names with hyphens and apostrophes', () {
      expect(validateFullName("Anne-Marie O'Brien"), isNull);
    });

    test('rejects empty input', () {
      expect(validateFullName(''), isNotNull);
      expect(validateFullName('   '), isNotNull);
      expect(validateFullName(null), isNotNull);
    });

    test('rejects numbers-only input', () {
      expect(validateFullName('12345'), isNotNull);
    });

    test('rejects special-character-only input', () {
      expect(validateFullName('!!!@@@'), isNotNull);
      expect(validateFullName('----'), isNotNull);
    });

    test('rejects a single character', () {
      expect(validateFullName('A'), isNotNull);
    });

    test('does not overvalidate: a simple two-word name passes', () {
      expect(validateFullName('Ada Lovelace'), isNull);
    });
  });

  group('validateBirthDate', () {
    test('requires a date to be picked', () {
      expect(validateBirthDate(null), isNotNull);
    });

    test('accepts any already-picked date (picker enforces bounds)', () {
      expect(validateBirthDate(DateTime(1995, 5, 5)), isNull);
    });
  });

  group('isoDate', () {
    test('formats a date as zero-padded YYYY-MM-DD', () {
      expect(isoDate(DateTime(1995, 5, 5)), '1995-05-05');
      expect(isoDate(DateTime(2000, 12, 31)), '2000-12-31');
    });
  });

  group('displayDate', () {
    test('formats a date as DD Mon YYYY', () {
      expect(displayDate(DateTime(1995, 5, 5)), '05 May 1995');
    });
  });
}
