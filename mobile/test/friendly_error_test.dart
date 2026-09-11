import 'dart:async';
import 'dart:io';
import 'package:fashion_app/core/errors/friendly_error.dart';
import 'package:fashion_app/services/nera_backend.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

void main() {
  const secret = 'Gemini API key=secret SQLSTATE 23505 {"error":"INTERNAL_ERROR"}\n#0 stack';
  test('all server statuses and unknown codes use app-owned feature copy', () {
    for (final feature in ErrorFeature.values) {
      for (final status in [400, 403, 404, 408, 409, 410, 422, 429, 500, 502, 503, 504]) {
        for (final code in ['INTERNAL_ERROR', 'GMAIL_INTEGRATION_NOT_CONFIGURED',
          'SERVER_INITIALIZATION_FAILED', 'TRYON_BILLING_REQUIRED',
          'GEMINI_API_ERROR', '23505', 'STORAGE_ERROR', 'UNKNOWN']) {
          expect(friendlyError(const NeraException(secret), feature: feature), featureErrorMessage(feature));
          expect(friendlyError(NeraException(secret, code: code, statusCode: status), feature: feature), featureErrorMessage(feature));
        }
      }
    }
  });
  test('unknown and malformed errors never return their text', () {
    for (final error in [null, secret, Exception(secret), FormatException(secret),
      StateError(secret), PlatformException(code: secret), {'error': secret}]) {
      expect(friendlyError(error), featureErrorMessage(ErrorFeature.general));
    }
  });
  test('network failures use connection guidance across features', () {
    for (final error in [const SocketException('offline'), http.ClientException('offline'),
      Exception('Failed to fetch'), const NeraException(secret, code: 'NETWORK_ERROR'),
      const NeraException(secret, code: 'FAILED_TO_FETCH')]) {
      for (final feature in ErrorFeature.values) {
        expect(friendlyError(error, feature: feature),
          'We’re having trouble connecting right now. Check your internet and try again.');
      }
    }
  });
  test('timeouts keep feature copy and validation stays actionable', () {
    expect(friendlyError(TimeoutException(secret), feature: ErrorFeature.tryOn), featureErrorMessage(ErrorFeature.tryOn));
    expect(friendlyError(const NeraException(secret, code: 'INVALID_OTP', statusCode: 401)), 'Invalid code. Please try again.');
    expect(friendlyError(const NeraException(secret, statusCode: 401)), 'Please sign in again to continue.');
    expect(friendlyError(const NeraException(secret, statusCode: 413)), contains('smaller photo'));
    expect(friendlyError(const NeraException(secret, statusCode: 415)), contains('JPG or PNG'));
    expect(friendlyError(const NeraException(secret, code: 'OTP_EXPIRED')), contains('request a new one'));
    expect(friendlyError(const NeraException(secret, code: 'PROFILE_ASSET_UNAVAILABLE')), contains('full-body photo'));
  });
}
