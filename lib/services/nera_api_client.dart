import 'dart:async';
import 'dart:convert';
import 'dart:io' show Platform;
import 'dart:typed_data';
import 'package:flutter/foundation.dart' show kDebugMode, kIsWeb;
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'nera_backend.dart';

class NeraApiClient {
  NeraApiClient({http.Client? client}) : _client = client ?? http.Client();

  /// Set at build time via `--dart-define=NERA_API_BASE_URL=...`. There is
  /// no production default — release builds must configure this.
  static const _configuredBaseUrl = String.fromEnvironment('NERA_API_BASE_URL');

  static String get baseUrl {
    if (_configuredBaseUrl.isNotEmpty) {
      return _normalizeBaseUrl(_configuredBaseUrl);
    }
    if (kDebugMode) return _devBaseUrl;
    throw const NeraException(
      'The app is missing its server address. Rebuild with '
      '--dart-define=NERA_API_BASE_URL=https://your-api.example.com/api/v1.',
    );
  }

  static String _normalizeBaseUrl(String value) {
    final uri = Uri.parse(value.trim());
    final path = uri.path.replaceFirst(RegExp(r'/+$'), '');
    final apiPath = path.endsWith('/api/v1') ? path : '$path/api/v1';
    return uri
        .replace(path: apiPath)
        .toString()
        .replaceFirst(RegExp(r'/+$'), '');
  }

  /// Development-only fallback: the Android emulator reaches the host
  /// machine through 10.0.2.2, while every other local target (iOS
  /// simulator, desktop) can reach it via localhost directly.
  static String get _devBaseUrl {
    if (!kIsWeb && Platform.isAndroid) return 'http://10.0.2.2:8080/api/v1';
    return 'http://localhost:8080/api/v1';
  }

  final http.Client _client;
  String? accessToken;

  Future<Map<String, dynamic>> get(String path) => _send('GET', path);
  Future<Map<String, dynamic>> post(String path, Map<String, dynamic> body) =>
      _send('POST', path, body: body);

  Future<void> delete(String path) async {
    await _send('DELETE', path);
  }

  Future<Map<String, dynamic>> upload(
    String path,
    Uint8List bytes,
    String fileName,
  ) async {
    final request = http.MultipartRequest('POST', Uri.parse('$baseUrl$path'));
    if (accessToken != null) {
      request.headers['authorization'] = 'Bearer $accessToken';
    }
    final mimeType = _detectMimeType(fileName, bytes);
    final parsedMimeType = mimeType.split('/');
    request.files.add(
      http.MultipartFile.fromBytes(
        'image',
        bytes,
        filename: fileName,
        contentType: MediaType(parsedMimeType[0], parsedMimeType[1]),
      ),
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
      throw NeraException(
        'The NERA server could not be reached: ${error.message}',
      );
    }
  }

  String _detectMimeType(String fileName, Uint8List bytes) {
    final lowerName = fileName.toLowerCase();
    if (lowerName.endsWith('.png')) return 'image/png';
    if (lowerName.endsWith('.heic') || lowerName.endsWith('.heif')) {
      return 'image/heic';
    }
    if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) {
      return 'image/jpeg';
    }
    if (bytes.length >= 3 &&
        bytes[0] == 0xff &&
        bytes[1] == 0xd8 &&
        bytes[2] == 0xff) {
      return 'image/jpeg';
    }
    if (bytes.length >= 8 &&
        bytes[0] == 0x89 &&
        bytes[1] == 0x50 &&
        bytes[2] == 0x4e &&
        bytes[3] == 0x47) {
      return 'image/png';
    }
    if (bytes.length >= 12 &&
        bytes[4] == 0x66 &&
        bytes[5] == 0x74 &&
        bytes[6] == 0x79 &&
        bytes[7] == 0x70) {
      return 'image/heic';
    }
    return 'image/jpeg';
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
      final request = http.Request(method, Uri.parse('$baseUrl$path'))
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
      throw NeraException(
        'The NERA server could not be reached: ${error.message}',
      );
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
