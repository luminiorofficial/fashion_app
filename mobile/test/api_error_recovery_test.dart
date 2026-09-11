import 'package:fashion_app/app/nera_app.dart';
import 'package:fashion_app/core/errors/friendly_error.dart';
import 'package:fashion_app/features/wardrobe/wardrobe_screen.dart';
import 'package:fashion_app/features/profile/profile_screen.dart';
import 'package:fashion_app/features/outfits/outfit_result_screen.dart';
import 'package:fashion_app/models/nera_models.dart';
import 'package:fashion_app/services/image_service.dart';
import 'package:fashion_app/services/memory_nera_backend.dart';
import 'package:fashion_app/services/nera_backend.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';

const _technical = 'GMAIL_INTEGRATION_NOT_CONFIGURED 503 Gemini key=secret SQLSTATE 23505';
class _FailingBackend extends MemoryNeraBackend {
  bool fail = true;
  bool reconnect = false;
  int connectAttempts = 0;
  int attempts = 0;
  @override
  Future<void> initialize() async {
    attempts++;
    if (fail) throw const NeraException(_technical, code: 'SERVER_INITIALIZATION_FAILED');
  }
  @override
  Future<List<PurchaseCandidate>> listPurchaseCandidates() async {
    attempts++;
    if (fail) throw const NeraException(_technical, statusCode: 503);
    return [];
  }
  @override
  Future<GmailConnectionStatus> getGmailStatus() async {
    attempts++;
    if (fail) throw const NeraException(_technical, statusCode: 503);
    if (reconnect) return const GmailConnectionStatus(connected: false, syncError: _technical);
    return GmailConnectionStatus.disconnected;
  }
  @override
  Future<String> beginGmailConnect() async {
    connectAttempts++;
    throw const NeraException(_technical);
  }
  @override
  Future<TryOnResult> generateTryOn({required List<String> wardrobeItemIds, String? outfitId}) async {
    attempts++;
    throw const NeraException(_technical, code: 'TRYON_BILLING_REQUIRED', statusCode: 503);
  }
}

void main() {
  setUp(() => GoogleFonts.config.allowRuntimeFetching = false);
  testWidgets('bootstrap failure stops loading and retry reaches login', (tester) async {
    final backend = _FailingBackend();
    await tester.pumpWidget(NeraApp(backend: backend));
    await tester.pumpAndSettle();
    expect(find.text(featureErrorMessage(ErrorFeature.general)), findsOneWidget);
    expect(find.textContaining(_technical), findsNothing);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    backend.fail = false;
    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();
    expect(find.text('Login'), findsOneWidget);
    expect(backend.attempts, 2);
    expect(tester.takeException(), isNull);
  });
  testWidgets('purchases failure has safe copy and working retry', (tester) async {
    final backend = _FailingBackend();
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: WardrobeScreen(
      backend: backend, imageService: NeraImageService(), items: const [], loading: false, onRetry: () {},
    ))));
    await tester.tap(find.text('Purchases'));
    await tester.pumpAndSettle();
    expect(find.text(featureErrorMessage(ErrorFeature.purchases)), findsOneWidget);
    expect(find.textContaining(_technical), findsNothing);
    backend.fail = false;
    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();
    expect(find.text('No purchased items yet.'), findsOneWidget);
    expect(backend.attempts, 2);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    backend.dispose();
  });
  testWidgets('Gmail status failure offers retry instead of disconnected state', (tester) async {
    final backend = _FailingBackend();
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: ProfileScreen(
      backend: backend, imageService: NeraImageService(), user: null,
      profile: const StyleProfile(), wardrobe: const [], loading: false, onRetry: () {},
    ))));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Try again'), 200);
    expect(find.text(featureErrorMessage(ErrorFeature.purchases)), findsOneWidget);
    expect(find.textContaining(_technical), findsNothing);
    backend.fail = false;
    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();
    expect(find.text('Connect'), findsOneWidget);
    expect(backend.attempts, 2);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    backend.dispose();
  });
  testWidgets('try-on failure preserves outfit and enables another attempt', (tester) async {
    final backend = _FailingBackend();
    await tester.pumpWidget(MaterialApp(home: OutfitResultScreen(
      backend: backend, imageService: NeraImageService(),
      outfit: const OutfitPlan(id: 'look', eventType: 'Casual', wardrobeItemIds: ['top'], rationale: 'Your existing look'),
      wardrobe: const [WardrobeItem(id: 'top', name: 'Top', category: 'Top',
        imageUrl: 'https://images.example/top.jpg', imagePath: '', imageStorageProvider: 'cloudinary')],
    )));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Try On Me'), 200);
    await tester.tap(find.text('Try On Me'));
    await tester.pumpAndSettle();
    expect(find.text(featureErrorMessage(ErrorFeature.tryOn)), findsOneWidget);
    expect(find.textContaining(_technical), findsNothing);
    await tester.ensureVisible(find.text('Try again'));
    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();
    expect(backend.attempts, 2);
    expect(find.byType(OutfitResultScreen), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    backend.dispose();
  });
  testWidgets('revoked Gmail connection offers reconnect and retries OAuth', (tester) async {
    final backend = _FailingBackend()..fail = false..reconnect = true;
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: ProfileScreen(
      backend: backend, imageService: NeraImageService(), user: null,
      profile: const StyleProfile(), wardrobe: const [], loading: false, onRetry: () {},
    ))));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Reconnect Gmail'), 200);
    await tester.tap(find.text('Reconnect Gmail'));
    await tester.pumpAndSettle();
    expect(backend.connectAttempts, 1);
    expect(find.textContaining(_technical), findsNothing);
    await tester.tap(find.text('Reconnect Gmail'));
    await tester.pumpAndSettle();
    expect(backend.connectAttempts, 2);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    backend.dispose();
  });
}
