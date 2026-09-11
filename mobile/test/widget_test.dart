import 'dart:convert';
import 'dart:typed_data';

import 'package:fashion_app/main.dart';
import 'package:fashion_app/models/nera_models.dart';
import 'package:fashion_app/services/image_service.dart';
import 'package:fashion_app/services/location_service.dart';
import 'package:fashion_app/services/memory_nera_backend.dart';
import 'package:fashion_app/services/nera_backend.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';

class _FakeImageService extends NeraImageService {
  _FakeImageService({this.wardrobeImages = 1});

  final int wardrobeImages;

  @override
  Future<PickedImageData?> pick(ImageSource source) async =>
      PickedImageData(bytes: _testImageBytes(), fileName: 'test.jpg');

  @override
  Future<List<PickedImageData>> pickMany(ImageSource source) async => [
    for (var index = 0; index < wardrobeImages; index += 1)
      PickedImageData(bytes: _testImageBytes(), fileName: 'test-$index.jpg'),
  ];
}

Uint8List _testImageBytes() => base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
);

class _GrantedLocationGateway implements LocationGateway {
  @override
  Future<AppLocationPermission> checkPermission() async =>
      AppLocationPermission.whileInUse;

  @override
  Future<LocationCoordinates> getCurrentPosition(Duration timeout) async =>
      const LocationCoordinates(latitude: 12.9716, longitude: 77.5946);

  @override
  Future<bool> isServiceEnabled() async => true;

  @override
  Future<AppLocationPermission> requestPermission() async =>
      AppLocationPermission.whileInUse;
}

class _DisabledLocationGateway extends _GrantedLocationGateway {
  @override
  Future<bool> isServiceEnabled() async => false;
}

const _analyzedProfile = StyleProfile(
  bodyType: 'Hourglass',
  skinTone: 'Warm golden undertones',
);

/// A [MemoryNeraBackend] that can be told to fail its next OTP
/// request/verify call, used to exercise the auth screen's error banner and
/// its clearing behavior without a real network dependency.
class _FlakyOtpBackend extends MemoryNeraBackend {
  bool failRequest = false;
  bool failVerify = false;

  @override
  Future<OtpChallenge> requestOtp({
    String? name,
    String? dateOfBirth,
    required String phoneNumber,
  }) async {
    if (failRequest) {
      throw const NeraException('Simulated OTP request failure.');
    }
    return super.requestOtp(
      name: name,
      dateOfBirth: dateOfBirth,
      phoneNumber: phoneNumber,
    );
  }

  @override
  Future<void> verifyOtp({
    required String challengeId,
    required String otp,
  }) async {
    if (failVerify) {
      throw const NeraException('Simulated OTP verify failure.');
    }
    return super.verifyOtp(challengeId: challengeId, otp: otp);
  }
}

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
    expect(find.text('Mobile number'), findsNothing);

    await tester.tap(find.text('Register'));
    await tester.pumpAndSettle();
    expect(find.text('Full name'), findsOneWidget);
    expect(find.text('Date of birth'), findsOneWidget);
    expect(find.text('Mobile number'), findsOneWidget);
  });

  testWidgets(
    'shows a validation error for an invalid mobile number and never calls the OTP API',
    (tester) async {
      final backend = _FlakyOtpBackend()..failRequest = true;
      await tester.pumpWidget(
        NeraApp(backend: backend, imageService: _FakeImageService()),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Login'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextFormField).first, '0000000000');
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();

      // Local validation must block the request before the (failing) OTP
      // API is ever called, so the API-failure message must never appear.
      expect(
        find.text('Please enter a valid 10-digit mobile number.'),
        findsOneWidget,
      );
      expect(
        find.text("We couldn't send the code. Try again."),
        findsNothing,
      );
    },
  );

  testWidgets(
    "shows the OTP-failure message only when the OTP API actually fails, and clears it when the phone number changes",
    (tester) async {
      final backend = _FlakyOtpBackend()..failRequest = true;
      await tester.pumpWidget(
        NeraApp(backend: backend, imageService: _FakeImageService()),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Login'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextFormField).first, '9876543210');
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();

      expect(
        find.text("We couldn't send the code. Try again."),
        findsOneWidget,
      );

      // The stale error must not survive an edit to the input that produced
      // it.
      await tester.enterText(find.byType(TextFormField).first, '9876543211');
      await tester.pump();
      expect(
        find.text("We couldn't send the code. Try again."),
        findsNothing,
      );
    },
  );

  testWidgets(
    'pressing Back after a failed attempt clears the stale error from a fresh form',
    (tester) async {
      final backend = _FlakyOtpBackend()..failRequest = true;
      await tester.pumpWidget(
        NeraApp(backend: backend, imageService: _FakeImageService()),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Login'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextFormField).first, '9876543210');
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();
      expect(
        find.text("We couldn't send the code. Try again."),
        findsOneWidget,
      );

      await tester.tap(find.text('Back'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Login'));
      await tester.pumpAndSettle();

      expect(
        find.text("We couldn't send the code. Try again."),
        findsNothing,
      );
    },
  );

  testWidgets(
    'changing phone number after a failed OTP verification clears the stale error',
    (tester) async {
      final backend = _FlakyOtpBackend()..failVerify = true;
      await tester.pumpWidget(
        NeraApp(backend: backend, imageService: _FakeImageService()),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Login'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextFormField).first, '9876543210');
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();

      expect(find.text('Enter verification code'), findsOneWidget);
      await tester.tap(find.text('Verify'));
      await tester.pumpAndSettle();
      expect(find.text('Something went wrong. Please try again.'), findsOneWidget);

      await tester.tap(find.text('Change phone number'));
      await tester.pumpAndSettle();

      expect(
        find.text('Something went wrong. Please try again.'),
        findsNothing,
      );
      expect(find.text('Mobile number'), findsOneWidget);
    },
  );

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

      expect(find.text('Create your Style Profile'), findsOneWidget);
      expect(find.text('Add a photo'), findsOneWidget);
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
        locationService: LocationService(gateway: _DisabledLocationGateway()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('What are you dressing for?'), findsOneWidget);
    expect(find.text('Create your Style Profile'), findsNothing);
  });

  testWidgets('shows local weather on the home screen', (tester) async {
    await tester.pumpWidget(
      NeraApp(
        backend: MemoryNeraBackend(
          authenticated: true,
          initialProfile: _analyzedProfile,
        ),
        imageService: _FakeImageService(),
        locationService: LocationService(gateway: _GrantedLocationGateway()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.textContaining('24°C'), findsOneWidget);
    expect(find.textContaining('Partly cloudy'), findsOneWidget);
    expect(find.textContaining('20% rain'), findsOneWidget);
  });

  testWidgets('renders the live NERA home experience', (tester) async {
    await tester.pumpWidget(
      NeraApp(
        backend: MemoryNeraBackend(
          authenticated: true,
          initialProfile: _analyzedProfile,
        ),
        imageService: _FakeImageService(),
        locationService: LocationService(gateway: _DisabledLocationGateway()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('NERA'), findsNWidgets(2));
    expect(find.text('What are you dressing for?'), findsOneWidget);
    expect(find.text('Wedding'), findsOneWidget);

    await tester.tap(find.text('Wardrobe'));
    await tester.pumpAndSettle();
    expect(find.text('Your closet is empty!'), findsOneWidget);

    await tester.tap(find.text('Profile'));
    await tester.pumpAndSettle();
    expect(find.text('MY STYLE DNA'), findsOneWidget);
    expect(find.text('Hourglass'), findsOneWidget);
    expect(find.text('Warm golden undertones'), findsOneWidget);
    expect(find.text('Update Style Profile'), findsOneWidget);

    await tester.tap(find.text('Update Style Profile'));
    await tester.pumpAndSettle();
    expect(find.text('Take a photo'), findsOneWidget);
    expect(find.text('Choose from gallery'), findsOneWidget);
  });

  testWidgets(
    'deleting the account requires confirmation and returns to login',
    (tester) async {
      await tester.pumpWidget(
        NeraApp(
          backend: MemoryNeraBackend(
            authenticated: true,
            initialProfile: _analyzedProfile,
          ),
          imageService: _FakeImageService(),
          locationService: LocationService(gateway: _DisabledLocationGateway()),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Profile'));
      await tester.pumpAndSettle();
      await tester.dragUntilVisible(
        find.text('Delete account'),
        find.byType(ListView).first,
        const Offset(0, -200),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Delete account'));
      await tester.pumpAndSettle();
      expect(find.text('Delete your account?'), findsOneWidget);

      // Cancelling must not touch the session: the dialog closes and the
      // still-scrolled profile screen (with its own session intact) shows.
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(find.text('Delete your account?'), findsNothing);
      expect(find.text('Delete account'), findsOneWidget);

      await tester.tap(find.text('Delete account'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Delete account').last);
      await tester.pumpAndSettle();

      expect(find.text('Login'), findsOneWidget);
      expect(find.text('Register'), findsOneWidget);
      expect(find.text('MY STYLE DNA'), findsNothing);
    },
  );

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
        locationService: LocationService(gateway: _DisabledLocationGateway()),
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
    await tester.pumpAndSettle();
    expect(find.text('Review 1 items'), findsOneWidget);
    expect(find.text('Black Silk Blazer'), findsOneWidget);

    await tester.tap(find.text('Save All (1)'));
    await tester.pumpAndSettle();
    expect(find.text('Black Silk Blazer'), findsOneWidget);
    expect(find.text('Outerwear'), findsNWidgets(2));
  });

  testWidgets(
    'gallery uploads and saves every selected wardrobe image in one batch',
    (tester) async {
      await tester.pumpWidget(
        NeraApp(
          backend: MemoryNeraBackend(
            authenticated: true,
            initialProfile: _analyzedProfile,
          ),
          imageService: _FakeImageService(wardrobeImages: 2),
          locationService: LocationService(gateway: _DisabledLocationGateway()),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Wardrobe'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Upload Wardrobe'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Choose from gallery'));
      await tester.pumpAndSettle();

      // Both images are analyzed first and shown together on one review
      // screen, not confirmed one at a time.
      expect(find.text('Review 2 items'), findsOneWidget);
      expect(find.text('Black Silk Blazer'), findsNWidgets(2));

      await tester.tap(find.text('Save All (2)'));
      await tester.pumpAndSettle();

      expect(find.text('Black Silk Blazer'), findsNWidgets(2));
    },
  );

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

      // Date of birth is now a date picker rather than free text. Opening
      // it and confirming immediately accepts the picker's own default
      // initial date (well in the past), which is all this flow needs.
      await tester.tap(find.byKey(const Key('dateOfBirthField')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextFormField).at(1), '9876543210');
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();

      expect(find.text('Enter verification code'), findsOneWidget);
      await tester.tap(find.text('Verify'));
      await tester.pumpAndSettle();

      // A brand-new user has no style profile yet, so profile creation
      // comes before home — not straight to the wardrobe.
      expect(find.text('Create your Style Profile'), findsOneWidget);
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
          locationService: LocationService(gateway: _DisabledLocationGateway()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Create your Style Profile'), findsOneWidget);
      await tester.tap(find.text('Add a photo'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Choose from gallery'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Use this photo'));
      await tester.pumpAndSettle();
      expect(find.text('Your Style Profile is ready.'), findsOneWidget);
      await tester.tap(find.text('Continue to NERA'));
      await tester.pumpAndSettle();

      // The profile is now analyzed, so the app has moved on to home.
      expect(find.text('What are you dressing for?'), findsOneWidget);
      expect(find.text('Create your Style Profile'), findsNothing);

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
      NeraApp(
        backend: backend,
        imageService: _FakeImageService(),
        locationService: LocationService(gateway: _DisabledLocationGateway()),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(
      find.descendant(
        of: find.byType(NavigationBar),
        matching: find.text('NERA'),
      ),
    );
    await tester.pumpAndSettle();
    await tester.drag(find.byType(ListView).first, const Offset(0, -180));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Wedding'));
    await tester.pumpAndSettle();

    expect(find.text('Wedding edit'), findsOneWidget);
    expect(find.text('60%'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('WHY THIS WORKS'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(
      find.text('A polished, balanced look selected from your wardrobe.'),
      findsOneWidget,
    );
    await tester.scrollUntilVisible(
      find.text('Try On Me'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.drag(find.byType(Scrollable).first, const Offset(0, 120));
    await tester.pump();
    expect(find.text('Try On Me'), findsOneWidget);
    await tester.tap(find.text('Try On Me'));
    await tester.pumpAndSettle();
    expect(find.text('Virtual try-on unavailable'), findsOneWidget);

    await tester.scrollUntilVisible(
      find.text('FEEDBACK / WORN ACTIONS'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Love It'), findsOneWidget);
    expect(find.text('Would Wear'), findsOneWidget);
    expect(find.text('Not Sure'), findsOneWidget);
    expect(find.text('Not My Style'), findsOneWidget);
    expect(find.text('I Wore This'), findsOneWidget);
  });
}
