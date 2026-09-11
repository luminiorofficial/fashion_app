import 'package:flutter/foundation.dart';

import '../../services/image_service.dart';
import '../../services/nera_backend.dart';

String friendlyError(Object? error) {
  if (error is NeraException) {
    final code = error.code?.trim();
    if (kDebugMode && code != null && code.isNotEmpty) {
      return '${error.message}\n\nError code: $code';
    }
    return error.message;
  }
  if (error is NeraImageException) return error.message;
  final text = error.toString().replaceFirst(RegExp(r'^Exception:\s*'), '');
  if (text.toLowerCase().contains('network') ||
      text.toLowerCase().contains('could not be reached') ||
      text.toLowerCase().contains('socket')) {
    return 'No network connection. Please reconnect and try again.';
  }
  return text.isEmpty ? 'Something went wrong. Please try again.' : text;
}
