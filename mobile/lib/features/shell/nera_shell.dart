import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/errors/friendly_error.dart';
import '../../core/theme/theme.dart';
import '../../core/widgets/widgets.dart';
import '../../models/nera_models.dart';
import '../../services/image_service.dart';
import '../../services/location_service.dart';
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
    required this.locationService,
  });
  final NeraBackend backend;
  final NeraImageService imageService;
  final LocationService locationService;

  @override
  State<NeraShell> createState() => _NeraShellState();
}

class _NeraShellState extends State<NeraShell> with WidgetsBindingObserver {
  late Stream<List<WardrobeItem>> _wardrobeStream;
  late Stream<StyleProfile> _profileStream;
  int _tab = 0;
  bool _generating = false;
  bool _weatherLoading = true;
  WeatherSummary? _weather;
  LocationAccessStatus? _locationStatus;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _resetStreams();
    unawaited(_loadWeather());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Location permission/service state can only change while the app is
    // backgrounded (the user granting it in system Settings, or turning GPS
    // on, then switching back). Re-check on resume, but only when the last
    // attempt didn't already succeed — a healthy reading stays cached for
    // its normal TTL instead of re-fetching on every app switch.
    if (state == AppLifecycleState.resumed &&
        _locationStatus != null &&
        _locationStatus != LocationAccessStatus.available) {
      widget.locationService.invalidateCache();
      unawaited(_loadWeather());
    }
  }

  Future<void> _retryWeather() async {
    setState(() => _weatherLoading = true);
    widget.locationService.invalidateCache();
    await _loadWeather();
  }

  Future<void> _loadWeather() async {
    final location = await widget.locationService.getCurrentLocation();
    WeatherSummary? weather;
    if (location.coordinates != null) {
      try {
        weather = await widget.backend.getWeather(location.coordinates!);
      } on Object {
        // Weather is optional; the rest of home and outfit generation stays
        // available when the endpoint or upstream provider cannot respond.
      }
    }
    if (!mounted) return;
    setState(() {
      _weather = weather;
      _weatherLoading = false;
      _locationStatus = location.status;
    });
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
      final location = await widget.locationService.getCurrentLocation();
      final outfit = await widget.backend.generateOutfit(
        occasion.label,
        wardrobe,
        profile,
        location: location.coordinates,
      );
      if (!mounted) return;
      setState(() => _generating = false);
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
            weather: _weather,
            weatherLoading: _weatherLoading,
            locationStatus: _locationStatus,
            onRetryWeather: _retryWeather,
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
                color: NeraColors.surface,
                borderRadius: BorderRadius.circular(NeraRadius.lg),
                border: Border.all(color: NeraColors.surfaceBorder),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: .06),
                    blurRadius: 16,
                    offset: const Offset(0, 4),
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
                  indicatorColor: NeraColors.surfaceElevated,
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
      color: NeraColors.ink,
      borderRadius: BorderRadius.circular(NeraRadius.pill),
      boxShadow: [
        BoxShadow(color: Colors.black.withValues(alpha: .18), blurRadius: 16),
      ],
    ),
    child: const Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox.square(
          dimension: 18,
          child: CircularProgressIndicator(
            strokeWidth: 2,
            color: NeraColors.onInk,
          ),
        ),
        SizedBox(width: 12),
        Text(
          'Styling your look…',
          style: TextStyle(color: NeraColors.onInk),
        ),
      ],
    ),
  );
}
