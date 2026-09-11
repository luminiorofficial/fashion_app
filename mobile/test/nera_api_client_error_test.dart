import 'dart:async';
import 'dart:typed_data';
import 'package:fashion_app/services/nera_api_client.dart';
import 'package:fashion_app/services/nera_backend.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

class _StalledBodyClient extends http.BaseClient {
  final body = StreamController<List<int>>();
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async => http.StreamedResponse(body.stream, 200);
  @override
  void close() { unawaited(body.close()); }
}

void main() {
  test('malformed success payloads fail explicitly', () async {
    for (final body in ['<html>503 secret</html>', '[]', 'null', '{', '{"error":{"code":"INTERNAL_ERROR"}}']) {
      final api = NeraApiClient(client: MockClient((_) async => http.Response(body, 200)));
      await expectLater(api.get('/profile'), throwsA(isA<NeraException>().having((e) => e.code, 'code', 'MALFORMED_RESPONSE')));
      api.close();
    }
  });
  test('ill-typed errors retain HTTP status and unauthorized callback', () async {
    final api = NeraApiClient(client: MockClient((_) async => http.Response('{"error":{"code":500,"message":{}}}', 401)));
    var expired = false;
    api.accessToken = 'test-token';
    api.onUnauthorized = () => expired = true;
    await expectLater(api.get('/me'), throwsA(isA<NeraException>().having((e) => e.statusCode, 'status', 401)));
    expect(expired, isTrue);
    api.close();
  });
  test('valid responses and empty delete responses are unchanged', () async {
    final api = NeraApiClient(client: MockClient((r) async => r.method == 'DELETE'
      ? http.Response('', 204) : http.Response('{"items":[]}', 200)));
    expect(await api.get('/wardrobe/items'), {'items': []});
    await api.delete('/wardrobe/items/1');
    api.close();
  });
  for (final upload in [false, true]) {
    test('stalled ${upload ? "upload" : "GET"} body times out', () async {
      final api = NeraApiClient(client: _StalledBodyClient(),
        requestTimeout: const Duration(milliseconds: 10), uploadTimeout: const Duration(milliseconds: 10));
      await expectLater(upload ? api.upload('/profile/analyze', Uint8List(1), 'photo.jpg') : api.get('/profile'),
        throwsA(isA<NeraException>().having((e) => e.code, 'code', 'REQUEST_TIMEOUT')));
      api.close();
    });
  }
  test('network exceptions have a stable code', () async {
    final api = NeraApiClient(client: MockClient((_) async => throw http.ClientException('Failed to fetch')));
    await expectLater(api.get('/profile'), throwsA(isA<NeraException>().having((e) => e.code, 'code', 'NETWORK_ERROR')));
    api.close();
  });
}
