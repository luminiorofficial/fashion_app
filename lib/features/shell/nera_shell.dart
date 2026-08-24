import 'package:flutter/material.dart';

import '../../core/errors/friendly_error.dart';
import '../../core/theme/theme.dart';
import '../../core/widgets/widgets.dart';
import '../../models/nera_models.dart';
import '../../services/image_service.dart';
import '../../services/nera_backend.dart';
import '../home/home_screen.dart';
import '../outfits/outfit_result_screen.dart';
import '../profile/profile_screen.dart';
import '../styling/styling_screen.dart';
import '../wardrobe/wardrobe_screen.dart';

class NeraShell extends StatefulWidget {
  const NeraShell({
    super.key,
    required this.backend,
    required this.imageService,
  });
  final NeraBackend backend;
  final NeraImageService imageService;

  @override
  State<NeraShell> createState() => _NeraShellState();
}

class _NeraShellState extends State<NeraShell> {
  late Stream<List<WardrobeItem>> _wardrobeStream;
  late Stream<StyleProfile> _profileStream;
  int _tab = 0;
  bool _generating = false;

  @override
  void initState() {
    super.initState();
    _resetStreams();
  }

  void _resetStreams() {
    _wardrobeStream = widget.backend.watchWardrobe();
    _profileStream = widget.backend.watchProfile();
  }

  void _retry() => setState(_resetStreams);

  Future<void> _generate(
    OccasionType occasion,
    List<WardrobeItem> wardrobe,
    StyleProfile profile,
  ) async {
    if (_generating) return;
    if (wardrobe.length < 2) {
      showNeraSnackBar(
        context,
        'Add at least 2 wardrobe items before generating an outfit.',
        error: true,
      );
      setState(() => _tab = 1);
      return;
    }
    if (!profile.isAnalyzed) {
      showNeraSnackBar(
        context,
        'Analyze your style profile before generating an outfit.',
        error: true,
      );
      setState(() => _tab = 3);
      return;
    }
    setState(() => _generating = true);
    try {
      final outfit = await widget.backend.generateOutfit(
        occasion.label,
        wardrobe,
        profile,
      );
      if (!mounted) return;
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (context) => OutfitResultScreen(
            backend: widget.backend,
            imageService: widget.imageService,
            outfit: outfit,
            wardrobe: wardrobe,
          ),
        ),
      );
    } catch (error) {
      if (mounted) {
        await showDialog<void>(
          context: context,
          builder: (dialogContext) => AlertDialog(
            title: const Text('Could not create your look'),
            content: Text(friendlyError(error)),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: () {
                  Navigator.pop(dialogContext);
                  setState(() => _generating = false);
                  Future<void>.microtask(
                    () => _generate(occasion, wardrobe, profile),
                  );
                },
                child: const Text('Try again'),
              ),
            ],
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _generating = false);
    }
  }

  void _openOutfit(OutfitPlan outfit, List<WardrobeItem> wardrobe) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => OutfitResultScreen(
          backend: widget.backend,
          imageService: widget.imageService,
          outfit: outfit,
          wardrobe: wardrobe,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => StreamBuilder<List<WardrobeItem>>(
    stream: _wardrobeStream,
    builder: (context, wardrobeSnapshot) => StreamBuilder<StyleProfile>(
      stream: _profileStream,
      builder: (context, profileSnapshot) {
        final wardrobe = wardrobeSnapshot.data ?? const <WardrobeItem>[];
        final profile =
            profileSnapshot.data ??
            widget.backend.profile.value ??
            const StyleProfile();
        final loading =
            wardrobeSnapshot.connectionState == ConnectionState.waiting ||
            profileSnapshot.connectionState == ConnectionState.waiting;
        final streamError = wardrobeSnapshot.error ?? profileSnapshot.error;
        final error = streamError == null ? null : friendlyError(streamError);
        final pages = <Widget>[
          HomeScreen(
            user: widget.backend.currentUser.value,
            wardrobe: wardrobe,
            profile: profile,
            loading: loading,
            error: error,
            onRetry: _retry,
            onOccasion: (occasion) => _generate(occasion, wardrobe, profile),
            onOpenWardrobe: () => setState(() => _tab = 1),
          ),
          WardrobeScreen(
            backend: widget.backend,
            imageService: widget.imageService,
            items: wardrobe,
            loading: loading,
            error: error,
            onRetry: _retry,
          ),
          StylingScreen(
            wardrobe: wardrobe,
            profile: profile,
            loading: loading,
            error: error,
            onRetry: _retry,
            onOccasion: (occasion) => _generate(occasion, wardrobe, profile),
            loadHistory: widget.backend.listOutfitHistory,
            onOpenOutfit: (outfit) => _openOutfit(outfit, wardrobe),
          ),
          ProfileScreen(
            backend: widget.backend,
            imageService: widget.imageService,
            user: widget.backend.currentUser.value,
            profile: profile,
            wardrobe: wardrobe,
            loading: loading,
            error: error,
            onRetry: _retry,
          ),
        ];
        return Scaffold(
          extendBody: true,
          body: SafeArea(
            bottom: false,
            child: IndexedStack(index: _tab, children: pages),
          ),
          bottomNavigationBar: SafeArea(
            minimum: const EdgeInsets.fromLTRB(12, 0, 12, 10),
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: NeraColors.surface.withValues(alpha: .96),
                borderRadius: BorderRadius.circular(NeraRadius.lg),
                border: Border.all(color: NeraColors.surfaceBorder),
                boxShadow: const [
                  BoxShadow(
                    color: Colors.black45,
                    blurRadius: 24,
                    offset: Offset(0, 8),
                  ),
                ],
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(NeraRadius.lg),
                child: NavigationBar(
                  selectedIndex: _tab,
                  onDestinationSelected: (value) =>
                      setState(() => _tab = value),
                  backgroundColor: Colors.transparent,
                  indicatorColor: NeraColors.gold.withValues(alpha: .16),
                  labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
                  destinations: const [
                    NavigationDestination(
                      icon: Icon(Icons.home_outlined),
                      selectedIcon: Icon(Icons.home_rounded),
                      label: 'Home',
                    ),
                    NavigationDestination(
                      icon: Icon(Icons.checkroom_outlined),
                      selectedIcon: Icon(Icons.checkroom_rounded),
                      label: 'Wardrobe',
                    ),
                    NavigationDestination(
                      icon: Icon(Icons.auto_awesome_outlined),
                      selectedIcon: Icon(Icons.auto_awesome_rounded),
                      label: 'Style',
                    ),
                    NavigationDestination(
                      icon: Icon(Icons.person_outline_rounded),
                      selectedIcon: Icon(Icons.person_rounded),
                      label: 'Profile',
                    ),
                  ],
                ),
              ),
            ),
          ),
          floatingActionButton: _generating ? const _GeneratingOverlay() : null,
          floatingActionButtonLocation:
              FloatingActionButtonLocation.centerFloat,
        );
      },
    ),
  );
}

class _GeneratingOverlay extends StatelessWidget {
  const _GeneratingOverlay();

  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(bottom: 84),
    padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 13),
    decoration: BoxDecoration(
      color: NeraColors.surfaceElevated,
      borderRadius: BorderRadius.circular(NeraRadius.pill),
      border: Border.all(color: NeraColors.gold.withValues(alpha: .45)),
      boxShadow: const [BoxShadow(color: Colors.black54, blurRadius: 20)],
    ),
    child: const Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox.square(
          dimension: 18,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
        SizedBox(width: 12),
        Text('Styling your look…'),
      ],
    ),
  );
}
