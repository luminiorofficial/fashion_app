import 'package:fashion_app/features/home/home_screen.dart';
import 'package:fashion_app/models/nera_models.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _wrap(Widget child) => MaterialApp(home: Scaffold(body: child));

void main() {
  testWidgets(
    'shows a neutral person icon instead of a solid black circle when there is no profile photo',
    (tester) async {
      await tester.pumpWidget(
        _wrap(
          HomeScreen(
            user: null,
            wardrobe: const [],
            profile: const StyleProfile(),
            loading: false,
            onRetry: () {},
            onOccasion: (_) {},
            onOpenWardrobe: () {},
            weatherLoading: false,
          ),
        ),
      );
      await tester.pump();

      // The old implementation used a raw CircleAvatar; the fixed avatar
      // never renders one, so this alone proves the old failure path is
      // gone.
      expect(find.byType(CircleAvatar), findsNothing);
      expect(find.byIcon(Icons.person_rounded), findsOneWidget);
    },
  );

  testWidgets(
    'the avatar fallback sits on a light, neutral background rather than solid black',
    (tester) async {
      await tester.pumpWidget(
        _wrap(
          HomeScreen(
            user: null,
            wardrobe: const [],
            profile: const StyleProfile(),
            loading: false,
            onRetry: () {},
            onOccasion: (_) {},
            onOpenWardrobe: () {},
            weatherLoading: false,
          ),
        ),
      );
      await tester.pump();

      final container = tester.widget<Container>(
        find
            .ancestor(
              of: find.byIcon(Icons.person_rounded),
              matching: find.byType(Container),
            )
            .first,
      );
      final color = (container.decoration as BoxDecoration?)?.color ?? container.color;
      expect(color, isNot(Colors.black));
      expect(color, isNot(const Color(0xFF000000)));
    },
  );
}
