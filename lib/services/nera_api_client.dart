import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:http/http.dart' as http;
import 'nera_backend.dart';

class NeraApiClient {
  NeraApiClient({http.Client? client}) : _client = client ?? http.Client();
  static const baseUrl = String.fromEnvironment(
    'NERA_API_BASE_URL',
    defaultValue: 'http://192.168.1.107:8080/api/v1',
  );
  static const _fallbackBaseUrls = <String>[
    'http://10.0.2.2:8080/api/v1',
    'http://localhost:8080/api/v1',
  ];
  final http.Client _client;
  String? accessToken;

  Future<Map<String, dynamic>> get(String path) => _send('GET', path);
  Future<Map<String, dynamic>> post(String path, Map<String, dynamic> body) =>
      _send('POST', path, body: body);

  Future<String> _resolveBaseUrl() async {
    final candidates = <String>{baseUrl, ..._fallbackBaseUrls}.toList();
    for (final candidate in candidates) {
      try {
        final response = await _client
            .get(Uri.parse('$candidate/health'))
            .timeout(const Duration(seconds: 5));
        if (response.statusCode == 200) {
          return candidate;
        }
      } on Object {
        // Try the next candidate.
      }
    }
    return baseUrl;
  }
  Future<void> delete(String path) async {
    await _send('DELETE', path);
  }

  Future<Map<String, dynamic>> upload(
    String path,
    Uint8List bytes,
    String fileName,
  ) async {
    final resolvedBaseUrl = await _resolveBaseUrl();
    final request = http.MultipartRequest('POST', Uri.parse('$resolvedBaseUrl$path'));
    if (accessToken != null) {
      request.headers['authorization'] = 'Bearer $accessToken';
    }
    request.files.add(
      http.MultipartFile.fromBytes('image', bytes, filename: fileName),
    );
    try {
      final streamed = await _client
          .send(request)
          .timeout(const Duration(seconds: 90));
      return _decode(
        streamed.statusCode,
        await streamed.stream.bytesToString(),
      );
    } on TimeoutException {
      throw const NeraException('The server took too long to respond.');
    } on http.ClientException catch (error) {
      throw NeraException('The NERA server could not be reached: ${error.message}');
    }
  }

  Future<Map<String, dynamic>> _send(
    String method,
    String path, {
    Map<String, dynamic>? body,
  }) async {
    final headers = <String, String>{
      'content-type': 'application/json',
      if (accessToken != null) 'authorization': 'Bearer $accessToken',
    };
    try {
      final resolvedBaseUrl = await _resolveBaseUrl();
      final request = http.Request(method, Uri.parse('$resolvedBaseUrl$path'))
        ..headers.addAll(headers);
      if (body != null) request.body = jsonEncode(body);
      final response = await http.Response.fromStream(
        await _client.send(request).timeout(const Duration(seconds: 30)),
      );
      if (response.statusCode == 204) return const {};
      return _decode(response.statusCode, response.body);
    } on TimeoutException {
      throw const NeraException('The server took too long to respond.');
    } on http.ClientException catch (error) {
      throw NeraException('The NERA server could not be reached: ${error.message}');
    }
  }

  Map<String, dynamic> _decode(int statusCode, String body) {
    Map<String, dynamic> json;
    try {
      json = jsonDecode(body) as Map<String, dynamic>;
    } catch (_) {
      json = {};
    }
    if (statusCode < 200 || statusCode >= 300) {
      final error = json['error'];
      throw NeraException(
        error is Map
            ? error['message'] as String? ?? 'Request failed ($statusCode).'
            : 'Request failed ($statusCode).',
      );
    }
    return json;
  }

  void close() => _client.close();
}
