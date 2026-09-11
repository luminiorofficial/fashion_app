import 'dart:convert';
import 'package:fashion_app/services/nera_api_client.dart';
import 'package:fashion_app/services/nera_backend.dart';
import 'package:fashion_app/services/remote_nera_backend.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('startup refresh failure keeps session retryable without authenticating into a loader', () async {
    FlutterSecureStorage.setMockInitialValues({'nera_access_token': 'session'});
    var fail = true;
    final backend = RemoteNeraBackend(api: NeraApiClient(client: MockClient((request) async {
      if (request.url.path.endsWith('/profile')) {
        if (fail) return http.Response('{"error":{"code":"INTERNAL_ERROR"}}', 503);
        return http.Response('{"profile":{}}', 200);
      }
      if (request.url.path.endsWith('/wardrobe/items')) return http.Response('{"items":[]}', 200);
      return http.Response(jsonEncode({'user': {
        'id': 'u1', 'name': 'Test', 'phoneNumber': '+919876543210', 'dateOfBirth': '1995-01-01',
      }}), 200);
    })));
    await expectLater(backend.initialize(), throwsA(isA<NeraException>()));
    expect(backend.isAuthenticated.value, isFalse);
    expect(await const FlutterSecureStorage().read(key: 'nera_access_token'), 'session');
    fail = false;
    await backend.initialize();
    expect(backend.isAuthenticated.value, isTrue);
    expect(backend.profile.value, isNotNull);
    backend.dispose();
  });
  test('retry after verified OTP refresh failure does not consume OTP again', () async {
    FlutterSecureStorage.setMockInitialValues({});
    var fail = true;
    var verifications = 0;
    final backend = RemoteNeraBackend(api: NeraApiClient(client: MockClient((request) async {
      if (request.url.path.endsWith('/auth/otp/verify')) {
        verifications++;
        if (verifications > 1) return http.Response('{"error":{"code":"OTP_ALREADY_USED"}}', 409);
        return http.Response(jsonEncode({'accessToken': 'session', 'user': {
          'id': 'u1', 'name': 'Test', 'phoneNumber': '+919876543210', 'dateOfBirth': '1995-01-01',
        }}), 200);
      }
      if (request.url.path.endsWith('/profile')) {
        return fail ? http.Response('{}', 503) : http.Response('{"profile":{}}', 200);
      }
      return http.Response('{"items":[]}', 200);
    })));
    await expectLater(backend.verifyOtp(challengeId: 'challenge', otp: '123456'), throwsA(isA<NeraException>()));
    expect(backend.isAuthenticated.value, isFalse);
    fail = false;
    await backend.verifyOtp(challengeId: 'challenge', otp: '123456');
    expect(verifications, 1);
    expect(backend.isAuthenticated.value, isTrue);
    backend.dispose();
  });
}
