import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show ScrollCacheExtent;

void main() {
  runApp(const NeraApp());
}

class NeraApp extends StatelessWidget {
  const NeraApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'NERA — Personal Stylist AI',
      theme: NeraTheme.dark,
      home: const NeraHomeScreen(),
    );
  }
}

// Kept as a compatibility alias for integrations that already reference MyApp.
class MyApp extends NeraApp {
  const MyApp({super.key});
}

class NeraColors {
  static const background = Color(0xFF050505);
  static const surface = Color(0xFF191919);
  static const surfaceBorder = Color(0xFF2B2B2B);
  static const tile = Color(0xFF1D2938);
  static const button = Color(0xFF3D485C);
  static const gold = Color(0xFFFFC107);
  static const blue = Color(0xFF9BBFE8);
  static const muted = Color(0xFF7484A1);
  static const textPrimary = Color(0xFFF7F7F7);
}

abstract final class NeraTheme {
  // ThemeData is relatively expensive to construct. Cache it once instead of
  // recreating it if the app root is rebuilt by the platform.
  static final ThemeData dark = ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    scaffoldBackgroundColor: NeraColors.background,
    colorScheme: const ColorScheme.dark(
      primary: NeraColors.gold,
      surface: NeraColors.surface,
    ),
    textTheme: ThemeData.dark().textTheme.apply(
      bodyColor: NeraColors.textPrimary,
      displayColor: NeraColors.textPrimary,
    ),
  );
}

enum StylingEvent {
  wedding('Wedding', Icons.favorite_rounded, Color(0xFFFF477E)),
  brunch('Brunch', Icons.local_bar_rounded, Color(0xFFC9F2DE)),
  workMeeting(
    'Work\nMeeting',
    Icons.business_center_rounded,
    Color(0xFF9A5663),
  );

  const StylingEvent(this.label, this.icon, this.iconColor);

  final String label;
  final IconData icon;
  final Color iconColor;

  String get requestLabel => label.replaceAll('\n', ' ');
}

enum _ProfileAnalysisState { idle, analyzing, analyzed }

class NeraHomeScreen extends StatefulWidget {
  const NeraHomeScreen({super.key});

  @override
  State<NeraHomeScreen> createState() => _NeraHomeScreenState();
}

class _NeraHomeScreenState extends State<NeraHomeScreen> {
  late final ValueNotifier<StylingEvent?> _selectedEvent;
  late final ValueNotifier<_ProfileAnalysisState> _profileAnalysis;

  @override
  void initState() {
    super.initState();
    _selectedEvent = ValueNotifier<StylingEvent?>(null);
    _profileAnalysis = ValueNotifier<_ProfileAnalysisState>(
      _ProfileAnalysisState.idle,
    );
  }

  @override
  void dispose() {
    _selectedEvent.dispose();
    _profileAnalysis.dispose();
    super.dispose();
  }

  void _showUploadOptions() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: NeraColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) => SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 14, 24, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.white24,
                    borderRadius: BorderRadius.circular(99),
                  ),
                ),
              ),
              const SizedBox(height: 22),
              const Text(
                'Add to your wardrobe',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 10),
              _UploadOption(
                icon: Icons.camera_alt_rounded,
                label: 'Take a photo',
                onTap: () => _closeUploadAndNotify(sheetContext, 'Camera'),
              ),
              _UploadOption(
                icon: Icons.photo_library_rounded,
                label: 'Choose from gallery',
                onTap: () =>
                    _closeUploadAndNotify(sheetContext, 'Photo gallery'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _closeUploadAndNotify(BuildContext sheetContext, String feature) {
    Navigator.of(sheetContext).pop();
    _showComingSoon(feature);
  }

  void _showComingSoon(String feature) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text('$feature will be connected in the Firebase phase.'),
          backgroundColor: NeraColors.button,
          behavior: SnackBarBehavior.floating,
        ),
      );
  }

  Future<void> _analyzeProfile() async {
    if (_profileAnalysis.value == _ProfileAnalysisState.analyzing) return;
    _profileAnalysis.value = _ProfileAnalysisState.analyzing;
    await Future<void>.delayed(const Duration(milliseconds: 850));
    if (mounted) {
      _profileAnalysis.value = _ProfileAnalysisState.analyzed;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 430),
            child: CustomScrollView(
              scrollCacheExtent: const ScrollCacheExtent.pixels(180),
              physics: const BouncingScrollPhysics(),
              slivers: [
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(20, 18, 20, 32),
                  sliver: SliverList(
                    delegate: SliverChildBuilderDelegate(
                      _buildHomeItem,
                      childCount: 13,
                      addAutomaticKeepAlives: false,
                      addRepaintBoundaries: true,
                      addSemanticIndexes: false,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildHomeItem(BuildContext context, int index) {
    return switch (index) {
      0 => const _NeraHeader(),
      1 => const SizedBox(height: 28),
      2 => _UploadWardrobeCard(onTap: _showUploadOptions),
      3 || 5 || 7 || 9 || 11 => const SizedBox(height: 22),
      4 => _StylingSuggestionsCard(selection: _selectedEvent),
      6 => _EventStylingCard(selection: _selectedEvent),
      8 => _ShopTheLookCard(onTap: () => _showComingSoon('Luxury brand links')),
      10 => const _WardrobeCard(),
      12 => _StyleProfileCard(
        analysis: _profileAnalysis,
        onAnalyze: _analyzeProfile,
      ),
      _ => const SizedBox.shrink(),
    };
  }
}

class _NeraHeader extends StatelessWidget {
  const _NeraHeader();

  @override
  Widget build(BuildContext context) {
    return const Column(
      children: [
        Text(
          'NERA',
          style: TextStyle(
            color: NeraColors.gold,
            fontFamily: 'serif',
            fontSize: 44,
            height: 1,
            letterSpacing: -1.5,
            fontWeight: FontWeight.w700,
          ),
        ),
        SizedBox(height: 5),
        Text(
          'PERSONAL STYLIST AI',
          style: TextStyle(
            color: NeraColors.blue,
            fontSize: 15,
            letterSpacing: .15,
            fontWeight: FontWeight.w400,
          ),
        ),
        SizedBox(height: 8),
        Text(
          'UserID: IDNrJiuO...',
          style: TextStyle(
            color: Color(0xFF455776),
            fontSize: 11,
            letterSpacing: .2,
          ),
        ),
      ],
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({
    required this.child,
    this.padding = const EdgeInsets.all(19),
    this.onTap,
  });

  final Widget child;
  final EdgeInsets padding;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: NeraColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: const BorderSide(color: NeraColors.surfaceBorder),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(padding: padding, child: child),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        fontSize: 18,
        height: 1.15,
        fontWeight: FontWeight.w700,
        letterSpacing: -.35,
      ),
    );
  }
}

class _UploadWardrobeCard extends StatelessWidget {
  const _UploadWardrobeCard({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return _SectionCard(
      onTap: onTap,
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 19),
      child: Row(
        children: [
          Container(
            width: 53,
            height: 53,
            decoration: const BoxDecoration(
              color: NeraColors.tile,
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.dry_cleaning_outlined,
              color: NeraColors.gold,
              size: 31,
            ),
          ),
          const SizedBox(width: 15),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _SectionTitle('Upload Wardrobe'),
                SizedBox(height: 3),
                Text(
                  'Add your clothing items',
                  style: TextStyle(color: NeraColors.blue, fontSize: 14),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _StylingSuggestionsCard extends StatelessWidget {
  const _StylingSuggestionsCard({required this.selection});

  final ValueListenable<StylingEvent?> selection;

  @override
  Widget build(BuildContext context) {
    return _SectionCard(
      padding: const EdgeInsets.fromLTRB(19, 22, 19, 22),
      child: SizedBox(
        height: 117,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const _SectionTitle('AI Styling Suggestions'),
            Expanded(
              child: ValueListenableBuilder<StylingEvent?>(
                valueListenable: selection,
                builder: (context, selectedEvent, child) {
                  final hasSelection = selectedEvent != null;
                  return Center(
                    child: AnimatedSwitcher(
                      duration: const Duration(milliseconds: 250),
                      child: Text(
                        hasSelection
                            ? 'Creating your ${selectedEvent.requestLabel.toLowerCase()} look'
                            : 'Click an event below to get started!',
                        key: ValueKey(selectedEvent),
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: hasSelection
                              ? NeraColors.blue
                              : NeraColors.muted,
                          fontSize: 15.5,
                          height: 1.3,
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EventStylingCard extends StatelessWidget {
  const _EventStylingCard({required this.selection});

  final ValueNotifier<StylingEvent?> selection;

  @override
  Widget build(BuildContext context) {
    return _SectionCard(
      padding: const EdgeInsets.fromLTRB(19, 21, 19, 19),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionTitle('Event Styling'),
          const SizedBox(height: 18),
          ValueListenableBuilder<StylingEvent?>(
            valueListenable: selection,
            builder: (context, selectedEvent, child) => Row(
              children: [
                for (
                  var index = 0;
                  index < StylingEvent.values.length;
                  index++
                ) ...[
                  Expanded(
                    child: _EventTile(
                      event: StylingEvent.values[index],
                      selected: selectedEvent == StylingEvent.values[index],
                      onTap: () => selection.value = StylingEvent.values[index],
                    ),
                  ),
                  if (index != StylingEvent.values.length - 1)
                    const SizedBox(width: 14),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _EventTile extends StatelessWidget {
  const _EventTile({
    required this.event,
    required this.selected,
    required this.onTap,
  });

  final StylingEvent event;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 180),
      height: 100,
      decoration: BoxDecoration(
        color: NeraColors.tile,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: selected ? NeraColors.gold : Colors.transparent,
          width: 1.4,
        ),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(8),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 6),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(event.icon, color: event.iconColor, size: 21),
                const SizedBox(height: 6),
                Text(
                  event.label,
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 14, height: 1.15),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ShopTheLookCard extends StatelessWidget {
  const _ShopTheLookCard({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return _SectionCard(
      onTap: onTap,
      padding: const EdgeInsets.symmetric(horizontal: 19, vertical: 20),
      child: const Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _SectionTitle('Shop the Look'),
                SizedBox(height: 4),
                Text(
                  'Luxury brand links',
                  style: TextStyle(color: NeraColors.blue, fontSize: 14),
                ),
              ],
            ),
          ),
          Icon(Icons.chevron_right_rounded, color: Color(0xFF77808E), size: 27),
        ],
      ),
    );
  }
}

class _WardrobeCard extends StatelessWidget {
  const _WardrobeCard();

  @override
  Widget build(BuildContext context) {
    return const _SectionCard(
      padding: EdgeInsets.fromLTRB(19, 21, 19, 20),
      child: SizedBox(
        height: 120,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _SectionTitle('My Wardrobe'),
            Expanded(
              child: Center(
                child: Text(
                  'Your closet is empty!',
                  style: TextStyle(color: NeraColors.muted, fontSize: 15.5),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StyleProfileCard extends StatelessWidget {
  const _StyleProfileCard({required this.analysis, required this.onAnalyze});

  final ValueListenable<_ProfileAnalysisState> analysis;
  final VoidCallback onAnalyze;

  @override
  Widget build(BuildContext context) {
    return _SectionCard(
      padding: const EdgeInsets.fromLTRB(19, 21, 19, 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const _SectionTitle('My Style Profile'),
          const SizedBox(height: 18),
          ValueListenableBuilder<_ProfileAnalysisState>(
            valueListenable: analysis,
            builder: (context, state, child) {
              final isAnalyzing = state == _ProfileAnalysisState.analyzing;
              final analyzed = state == _ProfileAnalysisState.analyzed;
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _ProfileRow(
                    label: 'Body Type',
                    value: analyzed ? 'Hourglass' : 'Not Analyzed',
                  ),
                  const SizedBox(height: 14),
                  _ProfileRow(
                    label: 'Skin Tone',
                    value: analyzed ? 'Warm' : 'Not Analyzed',
                  ),
                  const SizedBox(height: 18),
                  SizedBox(
                    height: 34,
                    child: FilledButton(
                      onPressed: isAnalyzing ? null : onAnalyze,
                      style: FilledButton.styleFrom(
                        backgroundColor: NeraColors.button,
                        disabledBackgroundColor: NeraColors.button,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(7),
                        ),
                        padding: EdgeInsets.zero,
                      ),
                      child: isAnalyzing
                          ? const SizedBox.square(
                              dimension: 17,
                              child: CircularProgressIndicator(
                                color: Colors.white,
                                strokeWidth: 2,
                              ),
                            )
                          : Text(
                              analyzed ? 'Analyze Again' : 'Analyze My Photo',
                              style: const TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                    ),
                  ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

class _ProfileRow extends StatelessWidget {
  const _ProfileRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: const TextStyle(color: NeraColors.blue, fontSize: 15.5),
          ),
        ),
        Text(
          value,
          textAlign: TextAlign.right,
          style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700),
        ),
      ],
    );
  }
}

class _UploadOption extends StatelessWidget {
  const _UploadOption({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(icon, color: NeraColors.gold),
      title: Text(label),
      trailing: const Icon(Icons.chevron_right_rounded, color: Colors.white38),
      onTap: onTap,
    );
  }
}
