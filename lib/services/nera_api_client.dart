import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;

import 'image_service.dart';
import 'nera_backend.dart';

class NeraApiClient {
  NeraApiClient({FirebaseAuth? auth, http.Client? client})
    : _auth = auth ?? FirebaseAuth.instance,
      _client = client ?? http.Client();

  static const _defaultBaseUrl =
      'https://us-central1-fashion-app-9d056.cloudfunctions.net/api/mobile';
  static const baseUrl = String.fromEnvironment(
    'NERA_API_BASE_URL',
    defaultValue: _defaultBaseUrl,
  );

  final FirebaseAuth _auth;
  final http.Client _client;

  Future<Map<String, dynamic>> analyzeItem(Uint8List bytes) =>
      _postImage('/analyze-item', bytes);

  Future<Map<String, dynamic>> analyzeProfile(Uint8List bytes) =>
      _postImage('/analyze-profile', bytes);

  Future<Map<String, dynamic>> _postImage(String path, Uint8List bytes) {
    if (bytes.isEmpty || bytes.lengthInBytes > NeraImageLimits.maxBytes) {
      throw const NeraException('The image must be smaller than 2 MB.');
    }
    return _post(path, {
      'imageBase64': base64Encode(bytes),
      'mimeType': 'image/jpeg',
    });
  }

  Future<Map<String, dynamic>> generateOutfit({required String eventType}) =>
      _post('/generate-outfit', {'eventType': eventType});

  Future<Map<String, dynamic>> _post(
    String path,
    Map<String, dynamic> payload,
  ) async {
    final token = await _auth.currentUser?.getIdToken();
    if (token == null) {
      throw const NeraException('Please sign in before using the AI stylist.');
    }

    http.Response response;
    try {
      response = await _client
          .post(
            Uri.parse('$baseUrl$path'),
            headers: {
              'content-type': 'application/json',
              'authorization': 'Bearer $token',
            },
            body: jsonEncode(payload),
          )
          .timeout(const Duration(seconds: 90));
    } on TimeoutException {
      throw const NeraException(
        'The AI stylist took too long to respond. Please try again.',
      );
    } on http.ClientException {
      throw const NeraException(
        'The AI stylist could not be reached. Check your connection and try again.',
      );
    } on Exception {
      throw const NeraException(
        'The AI stylist could not be reached. Check the API address and try again.',
      );
    }

    Map<String, dynamic> decoded;
    try {
      decoded = jsonDecode(response.body) as Map<String, dynamic>;
    } on Object {
      decoded = const <String, dynamic>{};
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw NeraException(
        decoded['error'] as String? ??
            'The AI stylist returned an error (${response.statusCode}).',
      );
    }
    return decoded;
  }

  void close() => _client.close();
}
