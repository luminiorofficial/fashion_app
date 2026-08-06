import 'dart:typed_data';

import 'package:fashion_app/main.dart';
import 'package:fashion_app/models/nera_models.dart';
import 'package:fashion_app/services/image_service.dart';
import 'package:fashion_app/services/memory_nera_backend.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';

class _FakeImageService extends NeraImageService {
  @override
  Future<PickedImageData?> pick(ImageSource source) async => PickedImageData(
    bytes: Uint8List.fromList(<int>[1, 2, 3]),
    fileName: 'test.jpg',
  );
}

void main() {
  testWidgets('renders the live NERA home experience', (tester) async {
    await tester.pumpWidget(
      NeraApp(
        backend: MemoryNeraBackend(authenticated: true),
        imageService: _FakeImageService(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('NERA'), findsOneWidget);
    expect(find.text('Upload Wardrobe'), findsOneWidget);
    expect(find.text('AI Styling Suggestions'), findsOneWidget);
    expect(find.text('Wedding'), findsOneWidget);

    await tester.drag(find.byType(ListView).first, const Offset(0, -900));
    await tester.pumpAndSettle();
    expect(find.text('Your closet is empty!'), findsOneWidget);

    await tester.drag(find.byType(ListView).first, const Offset(0, -700));
    await tester.pumpAndSettle();
    expect(find.text('My Style Profile'), findsOneWidget);
    expect(find.text('Not Analyzed'), findsNWidgets(2));
  });

  testWidgets('camera or gallery item can be reviewed and saved', (
    tester,
  ) async {
    await tester.pumpWidget(
      NeraApp(
        backend: MemoryNeraBackend(authenticated: true),
        imageService: _FakeImageService(),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Upload Wardrobe'));
    await tester.pumpAndSettle();
    expect(find.text('Take a photo'), findsOneWidget);
    expect(find.text('Choose from gallery'), findsOneWidget);

    await tester.tap(find.text('Choose from gallery'));
    // The upload card intentionally animates while the review dialog is open.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Review AI details'), findsOneWidget);
    expect(find.text('Black Silk Blazer'), findsOneWidget);

    await tester.tap(find.text('Save item'));
    await tester.pumpAndSettle();
    await tester.drag(find.byType(ListView).first, const Offset(0, -1000));
    await tester.pumpAndSettle();
    expect(find.text('Black Silk Blazer'), findsOneWidget);
    expect(find.text('Outerwear'), findsOneWidget);
  });

  testWidgets('shows login and register choices before the form', (
    tester,
  ) async {
    await tester.pumpWidget(
      NeraApp(
        backend: MemoryNeraBackend(),
        imageService: _FakeImageService(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Login'), findsOneWidget);
    expect(find.text('Register'), findsOneWidget);
    expect(find.text('Full name'), findsNothing);
    expect(find.text('Phone number'), findsNothing);

    await tester.tap(find.text('Register'));
    await tester.pumpAndSettle();
    expect(find.text('Full name'), findsOneWidget);
    expect(find.text('Date of birth'), findsOneWidget);
  });

  testWidgets('returns to phone-only auth after a completed registration', (
    tester,
  ) async {
    final backend = MemoryNeraBackend();
    await tester.pumpWidget(
      NeraApp(backend: backend, imageService: _FakeImageService()),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Register'));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextFormField).at(0), 'Ada Lovelace');
    await tester.enterText(find.byType(TextFormField).at(1), '1815-12-10');
    await tester.enterText(find.byType(TextFormField).at(2), '+919876543210');
    await tester.tap(find.text('Send OTP'));
    await tester.pumpAndSettle();

    expect(find.text('Verify your phone'), findsOneWidget);
    await tester.tap(find.text('Verify & continue'));
    await tester.pumpAndSettle();

    expect(find.text('Upload Wardrobe'), findsOneWidget);

    await backend.logout();
    await tester.pumpAndSettle();

    expect(find.text('Login'), findsOneWidget);
    expect(find.text('Register'), findsOneWidget);
  });

  testWidgets('profile photo analysis updates the style profile', (
    tester,
  ) async {
    await tester.pumpWidget(
      NeraApp(
        backend: MemoryNeraBackend(authenticated: true),
        imageService: _FakeImageService(),
      ),
    );
    await tester.pumpAndSettle();

    await tester.drag(find.byType(ListView).first, const Offset(0, -1500));
    await tester.pumpAndSettle();
    expect(find.text('Analyze My Photo'), findsOneWidget);
    await tester.tap(find.text('Analyze My Photo'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Choose from gallery'));
    await tester.pumpAndSettle();

    expect(find.text('Hourglass'), findsOneWidget);
    expect(find.text('Warm golden undertones'), findsOneWidget);
  });

  testWidgets('event selection renders an outfit plan', (tester) async {
    final backend = MemoryNeraBackend(authenticated: true);
    await backend.saveWardrobeDraft(
      const WardrobeDraft(
        id: 'top',
        name: 'Silk Top',
        category: 'Top',
        imageUrl: '',
        imagePath: '',
      ),
    );
    await backend.saveWardrobeDraft(
      const WardrobeDraft(
        id: 'bottom',
        name: 'Tailored Trouser',
        category: 'Bottom',
        imageUrl: '',
        imagePath: '',
      ),
    );
    await backend.analyzeProfileImage(Uint8List(1), 'profile.jpg');

    await tester.pumpWidget(
      NeraApp(backend: backend, imageService: _FakeImageService()),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Wedding'));
    await tester.pumpAndSettle();

    expect(find.text('Wedding edit'), findsOneWidget);
    expect(
      find.text('A polished, balanced look selected from your wardrobe.'),
      findsOneWidget,
    );
  });
}
