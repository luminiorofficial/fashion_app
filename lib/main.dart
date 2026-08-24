import 'package:flutter/widgets.dart';

import 'app/nera_app.dart';

export 'app/nera_app.dart' show MyApp, NeraApp;

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const NeraApp());
}
