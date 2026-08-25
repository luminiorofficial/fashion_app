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

  test('generateTryOn rejects a development fallback image', () async {
    final mockClient = MockClient(
      (request) async => http.Response(
        jsonEncode({
          'tryOn': {
            'id': 'tryon-1',
            'wardrobeItemIds': ['item-1'],
            'imageUrl': 'https://example.test/profile.jpg',
            'status': 'completed',
            'isSaved': false,
            'developmentFallback': true,
          },
        }),
        201,
        headers: {'content-type': 'application/json'},
      ),
    );
    final backend = RemoteNeraBackend(api: NeraApiClient(client: mockClient));

    await expectLater(
      backend.generateTryOn(wardrobeItemIds: const ['item-1']),
      throwsA(
        isA<NeraException>().having(
          (error) => error.message,
          'message',
          contains('currently unavailable'),
        ),
      ),
    );
  });

  test(
    'try-on uses an extended timeout longer than the normal API timeout',
    () async {
      expect(
        RemoteNeraBackend.tryOnRequestTimeout,
        greaterThan(const Duration(seconds: 30)),
      );
      // Must comfortably exceed the backend's worst case (2 models x one
      // ~120s attempt each, with no same-model retry by default), or the
      // client can cancel a generation the backend would have completed.
      expect(
        RemoteNeraBackend.tryOnRequestTimeout,
        greaterThanOrEqualTo(const Duration(seconds: 240)),
      );
      final mockClient = MockClient((request) async {
        await Future<void>.delayed(const Duration(milliseconds: 40));
        return http.Response(
          jsonEncode({
            'tryOn': {
              'id': 'tryon-slow',
              'wardrobeItemIds': ['item-1'],
              'imageUrl': 'https://example.test/generated.jpg',
              'status': 'completed',
              'isSaved': false,
              'developmentFallback': false,
            },
          }),
          201,
          headers: {'content-type': 'application/json'},
        );
      });
      final backend = RemoteNeraBackend(
        api: NeraApiClient(
          client: mockClient,
          requestTimeout: const Duration(milliseconds: 10),
        ),
      );

      final result = await backend.generateTryOn(
        wardrobeItemIds: const ['item-1'],
      );

      expect(result.id, 'tryon-slow');
    },
  );

  test(
    'generateTryOn surfaces a friendlier message on a request timeout',
    () async {
      final mockClient = MockClient((request) async {
        await Future<void>.delayed(const Duration(milliseconds: 40));
        return http.Response('', 200);
      });
      final backend = RemoteNeraBackend(
        api: NeraApiClient(
          client: mockClient,
          requestTimeout: const Duration(milliseconds: 5),
        ),
      );

      await expectLater(
        backend.generateTryOn(wardrobeItemIds: const ['item-1']),
        throwsA(
          isA<NeraException>()
              .having((error) => error.code, 'code', 'TRYON_TIMEOUT')
              .having(
                (error) => error.message,
                'message',
                contains('taking longer than usual'),
              ),
        ),
      );
    },
  );

  test(
    'saveWardrobeDrafts posts one batch request instead of one per item',
    () async {
      final captured = <http.Request>[];
      final mockClient = MockClient((request) async {
        captured.add(request);
        return http.Response('{}', 201, headers: {
          'content-type': 'application/json',
        });
      });
      final backend = RemoteNeraBackend(api: NeraApiClient(client: mockClient));

      await backend.saveWardrobeDrafts(const [
        WardrobeDraft(
          id: 'asset-1',
          name: 'Blazer',
          category: 'Outerwear',
          imageUrl: '',
          imagePath: '',
          tags: [],
          analysisJobId: 'job-1',
        ),
        WardrobeDraft(
          id: 'asset-2',
          name: 'Shirt',
          category: 'Top',
          imageUrl: '',
          imagePath: '',
          tags: [],
          analysisJobId: 'job-2',
        ),
      ]);

      // One POST for the batch save, one GET for the follow-up wardrobe
      // refresh — never one POST per item.
      final posts = captured.where((request) => request.method == 'POST');
      expect(posts, hasLength(1));
      expect(posts.single.url.path, '/api/v1/wardrobe/items/batch');
      final body = jsonDecode(posts.single.body) as Map<String, dynamic>;
      expect((body['items'] as List), hasLength(2));
    },
  );

  test('API errors retain the backend code and friendly message', () async {
    final mockClient = MockClient(
      (request) async => http.Response(
        jsonEncode({
          'error': {
            'code': 'WARDROBE_ITEM_HAS_NO_IMAGE',
            'message':
                'Every item in a try-on look must have a photo. Product-link items without a photo can\'t be tried on yet.',
          },
        }),
        400,
        headers: {'content-type': 'application/json'},
      ),
    );
    final backend = RemoteNeraBackend(api: NeraApiClient(client: mockClient));

    await expectLater(
      backend.generateTryOn(wardrobeItemIds: const ['link-item']),
      throwsA(
        isA<NeraException>()
            .having((error) => error.code, 'code', 'WARDROBE_ITEM_HAS_NO_IMAGE')
            .having(
              (error) => error.message,
              'message',
              isNot(contains('server could not complete request')),
            ),
      ),
    );
  });
}
