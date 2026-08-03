import 'package:fashion_app/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('renders the complete NERA home experience', (tester) async {
    await tester.pumpWidget(const NeraApp());

    expect(find.text('NERA'), findsOneWidget);
    expect(find.text('Upload Wardrobe'), findsOneWidget);
    expect(find.text('AI Styling Suggestions'), findsOneWidget);
    expect(find.text('Wedding'), findsOneWidget);

    await tester.scrollUntilVisible(
      find.text('Your closet is empty!'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Your closet is empty!'), findsOneWidget);

    await tester.scrollUntilVisible(
      find.text('My Style Profile'),
      400,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Not Analyzed'), findsNWidgets(2));
  });

  testWidgets('selecting an event updates styling suggestions', (tester) async {
    await tester.pumpWidget(const NeraApp());

    await tester.tap(find.text('Brunch'));
    await tester.pumpAndSettle();

    expect(find.text('Creating your brunch look'), findsOneWidget);
  });

  testWidgets('upload wardrobe opens image source choices', (tester) async {
    await tester.pumpWidget(const NeraApp());

    await tester.tap(find.text('Upload Wardrobe'));
    await tester.pumpAndSettle();

    expect(find.text('Take a photo'), findsOneWidget);
    expect(find.text('Choose from gallery'), findsOneWidget);
  });

  testWidgets('profile analysis updates only the profile section', (
    tester,
  ) async {
    await tester.pumpWidget(const NeraApp());

    await tester.scrollUntilVisible(
      find.text('Analyze My Photo'),
      500,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.drag(find.byType(CustomScrollView), const Offset(0, -120));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Analyze My Photo'));
    await tester.pump();

    expect(find.byType(CircularProgressIndicator), findsOneWidget);

    await tester.pump(const Duration(milliseconds: 850));
    expect(find.text('Hourglass'), findsOneWidget);
    expect(find.text('Warm'), findsOneWidget);
  });
}
