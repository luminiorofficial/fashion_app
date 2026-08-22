import 'dart:convert';

import 'package:fashion_app/models/nera_models.dart';
import 'package:fashion_app/services/nera_api_client.dart';
import 'package:fashion_app/services/nera_backend.dart';
import 'package:fashion_app/services/remote_nera_backend.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test(
    'generateOutfit posts the event type and parses the returned outfit',
    () async {
      http.Request? captured;
      final mockClient = MockClient((request) async {
        captured = request;
        return http.Response(
          jsonEncode({
            'outfit': {
              'id': 'outfit-1',
              'eventType': 'Wedding',
              'wardrobeItemIds': ['item-1', 'item-2'],
              'rationale': 'A polished wedding-guest look from your wardrobe.',
              'createdAt': '2026-01-01T00:00:00.000Z',
            },
          }),
          201,
          headers: {'content-type': 'application/json'},
        );
      });

      final backend = RemoteNeraBackend(api: NeraApiClient(client: mockClient));
      final outfit = await backend.generateOutfit(
        'Wedding',
        const [],
        const StyleProfile(),
      );

      expect(captured, isNotNull);
      expect(captured!.method, 'POST');
      expect(captured!.url.path, '/api/v1/outfits/generate');
      expect(jsonDecode(captured!.body), {'eventType': 'Wedding'});

      expect(outfit.id, 'outfit-1');
      expect(outfit.eventType, 'Wedding');
      expect(outfit.wardrobeItemIds, ['item-1', 'item-2']);
      expect(
        outfit.rationale,
        'A polished wedding-guest look from your wardrobe.',
      );
      expect(outfit.createdAt, DateTime.parse('2026-01-01T00:00:00.000Z'));
    },
  );

  test(
    'generateOutfit surfaces the server error message as a NeraException',
    () async {
      final mockClient = MockClient(
        (request) async => http.Response(
          jsonEncode({
            'error': {
              'code': 'WARDROBE_TOO_SMALL',
              'message':
                  'Add at least 2 wardrobe items before generating an outfit.',
            },
          }),
          400,
          headers: {'content-type': 'application/json'},
        ),
      );

      final backend = RemoteNeraBackend(api: NeraApiClient(client: mockClient));

      await expectLater(
        backend.generateOutfit('Daily', const [], const StyleProfile()),
        throwsA(
          isA<NeraException>().having(
            (error) => error.message,
            'message',
            'Add at least 2 wardrobe items before generating an outfit.',
          ),
        ),
      );
    },
  );
}
