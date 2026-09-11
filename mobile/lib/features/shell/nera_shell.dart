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
  double _generationProgress = 0;
  Timer? _generationProgressTimer;
  bool _weatherLoading = true;
  WeatherSummary? _weather;
  String? _weatherError;
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
    _generationProgressTimer?.cancel();
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
    WeatherSummary? weather;
    LocationAccessStatus? status;
    String? errorMessage;
    try {
      final location = await widget.locationService.getCurrentLocation();
      status = location.status;
      if (location.coordinates != null) {
        weather = await widget.backend.getWeather(location.coordinates!);
      }
    } catch (error) {
      errorMessage = friendlyError(error, feature: ErrorFeature.weather);
    } finally {
      if (mounted) {
        setState(() {
          _weather = weather;
          _weatherError = errorMessage;
          _weatherLoading = false;
          _locationStatus = status;
        });
      }
    }
  }

  void _resetStreams() {
    _wardrobeStream = widget.backend.watchWardrobe();
    _profileStream = widget.backend.watchProfile();
  }

  void _retry() => setState(_resetStreams);

  void _startGenerationProgress() {
    _generationProgressTimer?.cancel();
    setState(() {
      _generating = true;
      _generationProgress = .01;
    });
    // The endpoint does not emit progress events. This presentation-only
    // estimate moves quickly first, eases toward 94%, and cannot reach 100%
    // until the outfit request has actually succeeded.
    _generationProgressTimer = Timer.periodic(
      const Duration(milliseconds: 350),
      (_) {
        if (!mounted || !_generating) return;
        setState(() {
          final current = _generationProgress;
          final increment = current < .55
              ? .035
              : current < .82
              ? .018
              : current < .92
              ? .006
              : .001;
          _generationProgress = (current + increment).clamp(0, .94);
        });
      },
    );
  }

  Future<void> _completeGenerationProgress() async {
    _generationProgressTimer?.cancel();
    if (!mounted) return;
    setState(() => _generationProgress = 1);
    await Future<void>.delayed(const Duration(milliseconds: 320));
    if (!mounted) return;
    setState(() {
      _generating = false;
      _generationProgress = 0;
    });
  }

  void _stopGenerationProgress() {
    _generationProgressTimer?.cancel();
    if (!mounted) return;
    setState(() {
      _generating = false;
      _generationProgress = 0;
    });
  }

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
    _startGenerationProgress();
    try {
      final location = await widget.locationService.getCurrentLocation();
      final outfit = await widget.backend.generateOutfit(
        occasion.label,
        wardrobe,
        profile,
        location: location.coordinates,
      );
      if (!mounted) return;
      await _completeGenerationProgress();
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
      _stopGenerationProgress();
      if (mounted) {
        await showDialog<void>(
          context: context,
          builder: (dialogContext) => AlertDialog(
            title: const Text('Could not create your look'),
            content: Text(friendlyError(error, feature: ErrorFeature.outfit)),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: () {
                  Navigator.pop(dialogContext);
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
            weatherError: _weatherError,
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
          bottomNavigationBar: DecoratedBox(
            decoration: const BoxDecoration(
              color: NeraColors.surface,
              border: Border(top: BorderSide(color: NeraColors.divider)),
            ),
            child: SafeArea(
              top: false,
              child: NavigationBarTheme(
                data: NavigationBarThemeData(
                  height: 64,
                  backgroundColor: NeraColors.surface,
                  elevation: 0,
                  surfaceTintColor: Colors.transparent,
                  indicatorColor: Colors.transparent,
                  iconTheme: WidgetStateProperty.resolveWith((states) {
                    final selected = states.contains(WidgetState.selected);
                    return IconThemeData(
                      color: selected ? NeraColors.ink : NeraColors.muted,
                      size: 23,
                    );
                  }),
                  labelTextStyle: WidgetStateProperty.resolveWith((states) {
                    final selected = states.contains(WidgetState.selected);
                    return Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: selected ? NeraColors.ink : NeraColors.muted,
                      fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
                      fontSize: 11,
                      letterSpacing: 0,
                    );
                  }),
                ),
                child: NavigationBar(
                  selectedIndex: _tab,
                  onDestinationSelected: (value) =>
                      setState(() => _tab = value),
                  labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
                  destinations: const [
                    NavigationDestination(
                      icon: Icon(Icons.home_outlined),
                      selectedIcon: Icon(Icons.home_rounded),
                      label: 'Today',
                    ),
                    NavigationDestination(
                      icon: Icon(Icons.checkroom_outlined),
                      selectedIcon: Icon(Icons.checkroom_rounded),
                      label: 'Wardrobe',
                    ),
                    NavigationDestination(
                      icon: Icon(Icons.auto_awesome_outlined),
                      selectedIcon: Icon(Icons.auto_awesome_rounded),
                      label: 'NERA',
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
          floatingActionButton: _generating
              ? _GeneratingOverlay(progress: _generationProgress)
              : null,
          floatingActionButtonLocation:
              FloatingActionButtonLocation.centerFloat,
        );
      },
    ),
  );
}

class _GeneratingOverlay extends StatelessWidget {
  const _GeneratingOverlay({required this.progress});

  final double progress;

  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(bottom: 84),
    width: 264,
    padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
    decoration: BoxDecoration(
      color: NeraColors.ink,
      borderRadius: BorderRadius.circular(NeraRadius.pill),
      boxShadow: [
        BoxShadow(color: NeraColors.ink.withValues(alpha: .18), blurRadius: 16),
      ],
    ),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            const Expanded(
              child: Text(
                'Styling your look',
                style: TextStyle(
                  color: NeraColors.onInk,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            Text(
              '${(progress * 100).round()}%',
              style: const TextStyle(
                color: NeraColors.onInk,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        ClipRRect(
          borderRadius: BorderRadius.circular(NeraRadius.pill),
          child: TweenAnimationBuilder<double>(
            duration: const Duration(milliseconds: 320),
            curve: Curves.easeOutCubic,
            tween: Tween<double>(end: progress),
            builder: (context, value, _) => LinearProgressIndicator(
              minHeight: 5,
              value: value,
              backgroundColor: NeraColors.onInk.withValues(alpha: .2),
              valueColor: const AlwaysStoppedAnimation(NeraColors.onInk),
            ),
          ),
        ),
      ],
    ),
  );
}
