import 'dart:typed_data';

import 'package:fashion_app/main.dart';
import 'package:fashion_app/models/nera_models.dart';
import 'package:fashion_app/services/image_service.dart';
import 'package:fashion_app/services/memory_nera_backend.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';

class _FakeImageService extends NeraImageService {
  _FakeImageService({this.wardrobeImages = 1});

  final int wardrobeImages;

  @override
  Future<PickedImageData?> pick(ImageSource source) async => PickedImageData(
    bytes: Uint8List.fromList(<int>[1, 2, 3]),
    fileName: 'test.jpg',
  );

  @override
  Future<List<PickedImageData>> pickMany(ImageSource source) async => [
    for (var index = 0; index < wardrobeImages; index += 1)
      PickedImageData(
        bytes: Uint8List.fromList(<int>[1, 2, 3]),
        fileName: 'test-$index.jpg',
      ),
  ];
}

const _analyzedProfile = StyleProfile(
  bodyType: 'Hourglass',
  skinTone: 'Warm golden undertones',
);

void main() {
  testWidgets('shows login and register choices before the form', (
    tester,
  ) async {
    await tester.pumpWidget(
      NeraApp(backend: MemoryNeraBackend(), imageService: _FakeImageService()),
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

  testWidgets(
    'existing user without an analyzed profile lands on profile creation',
    (tester) async {
      await tester.pumpWidget(
        NeraApp(
          backend: MemoryNeraBackend(authenticated: true),
          imageService: _FakeImageService(),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Create Profile'), findsOneWidget);
      expect(find.text('Upload Image'), findsOneWidget);
      expect(find.text('Upload Wardrobe'), findsNothing);
    },
  );

  testWidgets('existing user with an analyzed profile lands on home directly', (
    tester,
  ) async {
    await tester.pumpWidget(
      NeraApp(
        backend: MemoryNeraBackend(
          authenticated: true,
          initialProfile: _analyzedProfile,
        ),
        imageService: _FakeImageService(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Dress Me Today'), findsOneWidget);
    expect(find.text('Create Profile'), findsNothing);
  });

  testWidgets('renders the live NERA home experience', (tester) async {
    await tester.pumpWidget(
      NeraApp(
        backend: MemoryNeraBackend(
          authenticated: true,
          initialProfile: _analyzedProfile,
        ),
        imageService: _FakeImageService(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('NERA'), findsOneWidget);
    expect(find.text('Dress Me Today'), findsOneWidget);
    expect(find.text('Wedding'), findsOneWidget);

    await tester.tap(find.text('Wardrobe'));
    await tester.pumpAndSettle();
    expect(find.text('Your closet is empty!'), findsOneWidget);

    await tester.tap(find.text('Profile'));
    await tester.pumpAndSettle();
    expect(find.text('My Style Profile'), findsOneWidget);
    expect(find.text('Hourglass'), findsOneWidget);
    expect(find.text('Warm golden undertones'), findsOneWidget);
  });

  testWidgets('camera or gallery item can be reviewed and saved', (
    tester,
  ) async {
    await tester.pumpWidget(
      NeraApp(
        backend: MemoryNeraBackend(
          authenticated: true,
          initialProfile: _analyzedProfile,
        ),
        imageService: _FakeImageService(),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Wardrobe'));
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
    expect(find.text('Black Silk Blazer'), findsOneWidget);
    expect(find.text('Outerwear'), findsNWidgets(2));
  });

  testWidgets('gallery uploads and saves each selected wardrobe image', (
    tester,
  ) async {
    await tester.pumpWidget(
      NeraApp(
        backend: MemoryNeraBackend(
          authenticated: true,
          initialProfile: _analyzedProfile,
        ),
        imageService: _FakeImageService(wardrobeImages: 2),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Wardrobe'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Upload Wardrobe'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Choose from gallery'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Review AI details'), findsOneWidget);
    await tester.tap(find.text('Save item'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Review AI details'), findsOneWidget);
    await tester.tap(find.text('Save item'));
    await tester.pumpAndSettle();

    expect(find.text('Black Silk Blazer'), findsNWidgets(2));
  });

  testWidgets(
    'new registration goes through OTP and profile creation before reaching home',
    (tester) async {
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

      // A brand-new user has no style profile yet, so profile creation
      // comes before home — not straight to the wardrobe.
      expect(find.text('Create Profile'), findsOneWidget);
      expect(find.text('Upload Wardrobe'), findsNothing);

      await backend.logout();
      await tester.pumpAndSettle();

      expect(find.text('Login'), findsOneWidget);
      expect(find.text('Register'), findsOneWidget);
    },
  );

  testWidgets(
    'analyzing the profile photo during onboarding moves straight to home',
    (tester) async {
      await tester.pumpWidget(
        NeraApp(
          backend: MemoryNeraBackend(authenticated: true),
          imageService: _FakeImageService(),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Create Profile'), findsOneWidget);
      await tester.tap(find.text('Upload Image'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Choose from gallery'));
      await tester.pumpAndSettle();

      // The profile is now analyzed, so the app has moved on to home.
      expect(find.text('Dress Me Today'), findsOneWidget);
      expect(find.text('Create Profile'), findsNothing);

      await tester.tap(find.text('Profile'));
      await tester.pumpAndSettle();
      expect(find.text('Hourglass'), findsOneWidget);
      expect(find.text('Warm golden undertones'), findsOneWidget);
    },
  );

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
    await tester.tap(find.text('Style'));
    await tester.pumpAndSettle();
    await tester.drag(find.byType(ListView).first, const Offset(0, -180));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Wedding'));
    await tester.pumpAndSettle();

    expect(find.text('Wedding edit'), findsOneWidget);
    expect(
      find.text('A polished, balanced look selected from your wardrobe.'),
      findsOneWidget,
    );
    expect(find.text('60%'), findsOneWidget);
    await tester.drag(find.byType(ListView).first, const Offset(0, -350));
    await tester.pumpAndSettle();
    expect(find.text('Love It'), findsOneWidget);
    expect(find.text('Would Wear'), findsOneWidget);
    expect(find.text('Not Sure'), findsOneWidget);
    expect(find.text('Not My Style'), findsOneWidget);
    expect(find.text('I Wore This'), findsOneWidget);
    expect(find.text('Try On Me'), findsOneWidget);

    await tester.tap(find.text('Try On Me'));
    await tester.pumpAndSettle();
    expect(find.text('Virtual try-on unavailable'), findsOneWidget);
  });
}
