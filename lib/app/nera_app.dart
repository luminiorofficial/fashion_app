import 'package:flutter/material.dart';

import '../core/errors/friendly_error.dart';
import '../core/theme/theme.dart';
import '../core/widgets/widgets.dart';
import '../features/auth/auth_screen.dart';
import '../features/onboarding/profile_creation_screen.dart';
import '../features/shell/nera_shell.dart';
import '../models/nera_models.dart';
import '../services/image_service.dart';
import '../services/nera_backend.dart';
import '../services/remote_nera_backend.dart';

class NeraApp extends StatelessWidget {
  const NeraApp({super.key, this.backend, this.imageService});

  final NeraBackend? backend;
  final NeraImageService? imageService;

  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: 'NERA — Personal Stylist AI',
    theme: NeraTheme.dark,
    home: NeraBootstrap(backend: backend, imageService: imageService),
  );
}

class MyApp extends NeraApp {
  const MyApp({super.key});
}

class NeraBootstrap extends StatefulWidget {
  const NeraBootstrap({super.key, this.backend, this.imageService});
  final NeraBackend? backend;
  final NeraImageService? imageService;

  @override
  State<NeraBootstrap> createState() => _NeraBootstrapState();
}

class _NeraBootstrapState extends State<NeraBootstrap> {
  late final NeraBackend _backend;
  late final NeraImageService _imageService;
  late Future<void> _initialization;

  @override
  void initState() {
    super.initState();
    _backend = widget.backend ?? RemoteNeraBackend();
    _imageService = widget.imageService ?? NeraImageService();
    _initialization = _backend.initialize();
  }

  @override
  void dispose() {
    _backend.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<void>(
    future: _initialization,
    builder: (context, snapshot) {
      if (snapshot.connectionState != ConnectionState.done) {
        return const _LaunchScreen();
      }
      if (snapshot.hasError) {
        return Scaffold(
          body: SafeArea(
            child: Center(
              child: NeraErrorState(
                title: 'NERA could not connect',
                message: friendlyError(snapshot.error),
                onRetry: () =>
                    setState(() => _initialization = _backend.initialize()),
              ),
            ),
          ),
        );
      }
      return ValueListenableBuilder<bool>(
        valueListenable: _backend.isAuthenticated,
        builder: (context, authenticated, child) {
          if (!authenticated) {
            return AuthScreen(
              backend: _backend,
              returningUser: _backend.currentUser.value != null,
            );
          }
          return ValueListenableBuilder<StyleProfile?>(
            valueListenable: _backend.profile,
            builder: (context, profile, child) {
              if (profile == null) return const _LaunchScreen();
              return profile.isAnalyzed
                  ? NeraShell(backend: _backend, imageService: _imageService)
                  : ProfileCreationScreen(
                      backend: _backend,
                      imageService: _imageService,
                    );
            },
          );
        },
      );
    },
  );
}

class _LaunchScreen extends StatelessWidget {
  const _LaunchScreen();

  @override
  Widget build(BuildContext context) => const Scaffold(
    body: Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          NeraWordmark(size: 52, showTagline: true),
          SizedBox(height: 28),
          SizedBox.square(
            dimension: 22,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ],
      ),
    ),
  );
}
