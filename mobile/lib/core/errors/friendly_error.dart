import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../../services/image_service.dart';
import '../../services/nera_backend.dart';

enum ErrorFeature { general, outfit, tryOn, imageAnalysis, wardrobeUpload, purchases, weather }

/// Only app-owned copy may reach the UI, including in debug builds.
String friendlyError(Object? error, {
  ErrorFeature feature = ErrorFeature.general,
  String? fallback,
}) {
  logDeveloperError(error);
  final code = error is NeraException ? error.code?.toUpperCase() : null;
  final status = error is NeraException ? error.statusCode : null;
  final text = error.toString().toLowerCase();
  if (error is http.ClientException ||
      code == 'NETWORK_ERROR' || code == 'FAILED_TO_FETCH' ||
      text.contains('failed to fetch') || text.contains('failed_to_fetch') ||
      text.contains('socketexception') || text.contains('network') ||
      text.contains('could not be reached') || text.contains('connection refused') ||
      text.contains('failed host lookup')) {
    return 'We’re having trouble connecting right now. Check your internet and try again.';
  }
  const actionable = <String, String>{
    'INVALID_OTP': 'Invalid code. Please try again.',
    'OTP_INVALID': 'Invalid code. Please try again.',
    'INVALID_OTP_FORMAT': 'Enter the 6-digit code and try again.',
    'CHALLENGE_NOT_FOUND': 'Please request a new code to continue.',
    'OTP_ALREADY_USED': 'Please request a new code to continue.',
    'OTP_ATTEMPTS_EXCEEDED': 'Please request a new code to continue.',
    'OTP_EXPIRED': 'This code has expired. Please request a new one.',
    'GMAIL_RECONNECT_REQUIRED': 'Please reconnect Gmail to continue importing purchased items.',
    'PROFILE_ASSET_UNAVAILABLE': 'Please upload a new full-body photo to use Virtual Try-On.',
    'WARDROBE_ITEM_HAS_NO_IMAGE': 'Add a photo of this item to use Virtual Try-On.',
    'WARDROBE_ASSET_UNAVAILABLE': 'Please upload a new photo of this item to use Virtual Try-On.',
  };
  if (status == null || status < 500) {
    if (actionable.containsKey(code)) return actionable[code]!;
    if (status == 401) return 'Please sign in again to continue.';
    if (status == 413) return 'This photo is too large. Please choose a smaller photo.';
    if (status == 415) return 'Please choose a supported photo format, such as JPG or PNG.';
  }
  // Preserve exact local validation messages, never arbitrary exception text.
  const localMessages = {
    'Enter an item name and a complete product URL.',
    'The selected photo could not be compressed enough. Try another photo.',
    'The wardrobe item was not found.',
    'Connect Gmail before syncing.',
  };
  if (error is NeraImageException && localMessages.contains(error.message)) return error.message;
  if (error is NeraException && error.code == null && error.statusCode == null &&
      localMessages.contains(error.message)) return error.message;
  // Timeouts, malformed responses, other HTTP statuses, provider, storage,
  // database and unknown failures all use the operation's safe fallback.
  if (error is TimeoutException || code == 'REQUEST_TIMEOUT' || code == 'TRYON_TIMEOUT' ||
      status == 408 || status == 504) return fallback ?? featureErrorMessage(feature);
  return fallback ?? featureErrorMessage(feature);
}

String featureErrorMessage(ErrorFeature feature) => switch (feature) {
  ErrorFeature.general => 'This feature isn’t available right now. Please try again shortly.',
  ErrorFeature.outfit => 'We couldn’t style your look right now. Please try again.',
  ErrorFeature.tryOn => 'Virtual Try-On isn’t available right now. Please try again later.',
  ErrorFeature.imageAnalysis => 'We couldn’t analyze this image right now. Please try again or upload another photo.',
  ErrorFeature.wardrobeUpload => 'We couldn’t add this item right now. Please try again.',
  ErrorFeature.purchases => 'Purchased items aren’t available right now. Please try again later.',
  ErrorFeature.weather => 'Weather information isn’t available right now. Please try again later.',
};

void logDeveloperError(Object? error, [StackTrace? stackTrace]) {
  if (!kDebugMode) return;
  debugPrint('NERA failure: $error');
  if (error is NeraException) debugPrint('status=${error.statusCode} code=${error.code}');
  if (stackTrace != null) debugPrintStack(stackTrace: stackTrace);
}
