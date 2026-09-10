import 'package:flutter/material.dart';

import '../../core/theme/theme.dart';
import '../../core/widgets/widgets.dart';
import '../../models/nera_models.dart';
import '../../services/location_service.dart';
import '../wardrobe/wardrobe_item_image.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({
    super.key,
    required this.user,
    required this.wardrobe,
    required this.profile,
    required this.loading,
    required this.onRetry,
    required this.onOccasion,
    required this.onOpenWardrobe,
    required this.weatherLoading,
    this.weather,
    this.locationStatus,
    this.onRetryWeather,
    this.error,
  });

  final NeraUser? user;
  final List<WardrobeItem> wardrobe;
  final StyleProfile profile;
  final bool loading;
  final String? error;
  final VoidCallback onRetry;
  final ValueChanged<OccasionType> onOccasion;
  final VoidCallback onOpenWardrobe;
  final WeatherSummary? weather;
  final bool weatherLoading;
  final LocationAccessStatus? locationStatus;
  final VoidCallback? onRetryWeather;

  @override
  Widget build(BuildContext context) => CustomScrollView(
    physics: const BouncingScrollPhysics(),
    slivers: [
      SliverPadding(
        padding: const EdgeInsets.fromLTRB(
          NeraSpacing.xl,
          NeraSpacing.lg,
          NeraSpacing.xl,
          120,
        ),
        sliver: SliverList.list(
          children: [
            Row(
              children: [
                const NeraWordmark(size: 30),
                const Spacer(),
                CircleAvatar(
                  radius: 21,
                  backgroundColor: NeraColors.surfaceElevated,
                  foregroundImage:
                      (profile.profileImageUrl?.isNotEmpty ?? false)
                      ? NetworkImage(profile.profileImageUrl!)
                      : null,
                  // A broken/expired signed URL must fall back to the
                  // person icon below instead of the framework's default
                  // unhandled-image-error report.
                  onForegroundImageError:
                      (profile.profileImageUrl?.isNotEmpty ?? false)
                      ? (_, _) {}
                      : null,
                  child: const Icon(
                    Icons.person_outline_rounded,
                    color: NeraColors.textSecondary,
                    size: 21,
                  ),
                ),
              ],
            ),
            const SizedBox(height: NeraSpacing.xxl),
            Text(
              '${_dayPartGreeting(DateTime.now())}, ${_firstName(user?.name)}',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: NeraTheme.heading(27, letterSpacing: -0.4),
            ),
            const SizedBox(height: NeraSpacing.sm),
            _WeatherDisplay(
              weather: weather,
              loading: weatherLoading,
              locationStatus: locationStatus,
              onRetry: onRetryWeather,
            ),
            const SizedBox(height: NeraSpacing.xxxl),
            if (error != null)
              NeraErrorState(message: error!, onRetry: onRetry)
            else if (loading)
              const _HomeSkeleton()
            else ...[
              Text(
                'What are you dressing for?',
                style: NeraTheme.heading(24, letterSpacing: -0.3),
              ),
              const SizedBox(height: NeraSpacing.sm),
              Text(
                'Choose an occasion and NERA will create a complete look from your wardrobe.',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
              const SizedBox(height: NeraSpacing.lg),
              _OccasionStrip(onSelected: onOccasion),
              if (wardrobe.length < 2) ...[
                const SizedBox(height: NeraSpacing.md),
                Text(
                  'Add ${2 - wardrobe.length} more ${wardrobe.length == 1 ? 'item' : 'items'} for complete outfit suggestions.',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: NeraColors.muted,
                  ),
                ),
              ],
              const SizedBox(height: NeraSpacing.xxxl),
              NeraSectionHeader(
                'Your Wardrobe',
                subtitle:
                    '${wardrobe.length} ${wardrobe.length == 1 ? 'piece' : 'pieces'} ready to style',
                action: TextButton(
                  onPressed: onOpenWardrobe,
                  child: const Text('View all'),
                ),
              ),
              const SizedBox(height: NeraSpacing.lg),
              if (wardrobe.isEmpty)
                _EmptyWardrobe(onAdd: onOpenWardrobe)
              else
                _WardrobePreview(wardrobe: wardrobe),
            ],
          ],
        ),
      ),
    ],
  );
}

class _OccasionStrip extends StatelessWidget {
  const _OccasionStrip({required this.onSelected});

  final ValueChanged<OccasionType> onSelected;

  @override
  Widget build(BuildContext context) => SizedBox(
    height: 48,
    child: ListView.separated(
      scrollDirection: Axis.horizontal,
      itemCount: OccasionType.values.length,
      separatorBuilder: (_, _) => const SizedBox(width: NeraSpacing.sm),
      itemBuilder: (context, index) {
        final occasion = OccasionType.values[index];
        return OutlinedButton.icon(
          onPressed: () => onSelected(occasion),
          icon: Icon(occasion.icon, size: 18),
          label: Text(occasion.label),
          style: OutlinedButton.styleFrom(
            foregroundColor: NeraColors.textPrimary,
            backgroundColor: NeraColors.surface,
            side: const BorderSide(color: NeraColors.surfaceBorder),
            minimumSize: const Size(0, 48),
            padding: const EdgeInsets.symmetric(horizontal: NeraSpacing.lg),
            textStyle: Theme.of(context).textTheme.labelMedium?.copyWith(
              fontWeight: FontWeight.w600,
            ),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(NeraRadius.pill),
            ),
          ),
        );
      },
    ),
  );
}

class _EmptyWardrobe extends StatelessWidget {
  const _EmptyWardrobe({required this.onAdd});

  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: NeraSpacing.lg),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Build your wardrobe',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: NeraSpacing.sm),
        Text(
          'Add a few pieces so NERA can start creating personalized looks.',
          style: Theme.of(context).textTheme.bodyMedium,
        ),
        const SizedBox(height: NeraSpacing.lg),
        FilledButton(
          onPressed: onAdd,
          child: const Text('Add Clothes'),
        ),
      ],
    ),
  );
}

class _WardrobePreview extends StatelessWidget {
  const _WardrobePreview({required this.wardrobe});

  final List<WardrobeItem> wardrobe;

  @override
  Widget build(BuildContext context) => SizedBox(
    height: 174,
    child: ListView.separated(
      scrollDirection: Axis.horizontal,
      itemCount: wardrobe.take(8).length,
      separatorBuilder: (_, _) => const SizedBox(width: NeraSpacing.md),
      itemBuilder: (context, index) {
        final item = wardrobe[index];
        return SizedBox(
          width: 124,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              WardrobeItemImage(item: item, size: 124),
              const SizedBox(height: NeraSpacing.sm),
              Text(
                item.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.labelMedium?.copyWith(
                  color: NeraColors.textPrimary,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: NeraSpacing.xs),
              Text(
                item.category,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: NeraColors.muted,
                  letterSpacing: 0,
                ),
              ),
            ],
          ),
        );
      },
    ),
  );
}

class _WeatherDisplay extends StatelessWidget {
  const _WeatherDisplay({
    required this.weather,
    required this.loading,
    this.locationStatus,
    this.onRetry,
  });

  final WeatherSummary? weather;
  final bool loading;
  final LocationAccessStatus? locationStatus;
  final VoidCallback? onRetry;

  String _unavailableMessage() {
    switch (locationStatus) {
      case LocationAccessStatus.deniedForever:
        return 'Enable location in Settings for weather';
      case LocationAccessStatus.denied:
        return 'Allow location for local weather';
      case LocationAccessStatus.servicesDisabled:
        return 'Turn on location services for weather';
      case LocationAccessStatus.unavailable:
      case LocationAccessStatus.available:
      case null:
        return 'Local weather unavailable';
    }
  }

  @override
  Widget build(BuildContext context) {
    final weather = this.weather;
    final canRetry = weather == null && !loading && onRetry != null;
    final message = weather == null
        ? loading
              ? 'Checking local weather…'
              : _unavailableMessage()
        : '${weather.temperatureC.round()}°C  ·  ${weather.condition}  ·  ${weather.rainProbabilityPercent}% rain';

    final content = Padding(
      padding: const EdgeInsets.symmetric(vertical: NeraSpacing.xs),
      child: Row(
        children: [
          Icon(
            weather == null
                ? (canRetry ? Icons.refresh_rounded : Icons.cloud_outlined)
                : _weatherIcon(weather),
            size: 16,
            color: NeraColors.muted,
          ),
          const SizedBox(width: NeraSpacing.sm),
          Expanded(
            child: Text(
              message,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: NeraColors.textSecondary,
              ),
            ),
          ),
        ],
      ),
    );

    return Semantics(
      label: weather == null
          ? loading
                ? 'Loading local weather'
                : message
          : 'Local weather: ${weather.temperatureC.round()} degrees, ${weather.condition}',
      hint: canRetry ? 'Double tap to try again' : null,
      button: canRetry,
      child: canRetry
          ? ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 48),
              child: InkWell(
                onTap: onRetry,
                borderRadius: BorderRadius.circular(NeraRadius.sm),
                child: content,
              ),
            )
          : content,
    );
  }

  IconData _weatherIcon(WeatherSummary weather) {
    final condition = weather.condition.toLowerCase();
    if (condition.contains('rain') || condition.contains('drizzle')) {
      return Icons.water_drop_outlined;
    }
    if (condition.contains('clear') || condition.contains('sun')) {
      return Icons.wb_sunny_outlined;
    }
    return Icons.cloud_outlined;
  }
}

String _firstName(String? name) {
  final clean = name?.trim() ?? '';
  return clean.isEmpty ? 'beautiful' : clean.split(RegExp(r'\s+')).first;
}

String _dayPartGreeting(DateTime now) {
  if (now.hour < 12) return 'Good morning';
  if (now.hour < 17) return 'Good afternoon';
  return 'Good evening';
}

class _HomeSkeleton extends StatelessWidget {
  const _HomeSkeleton();

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const NeraSkeleton(width: 250, height: 26),
      const SizedBox(height: NeraSpacing.md),
      const NeraSkeleton(width: double.infinity, height: 14),
      const SizedBox(height: NeraSpacing.xl),
      SizedBox(
        height: 48,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          itemCount: 4,
          separatorBuilder: (_, _) => const SizedBox(width: NeraSpacing.sm),
          itemBuilder: (_, _) => const NeraSkeleton(
            width: 104,
            height: 48,
            radius: NeraRadius.pill,
          ),
        ),
      ),
      const SizedBox(height: NeraSpacing.xxxl),
      const NeraSkeleton(width: 170, height: 22),
      const SizedBox(height: NeraSpacing.lg),
      SizedBox(
        height: 124,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          itemCount: 3,
          separatorBuilder: (_, _) => const SizedBox(width: NeraSpacing.md),
          itemBuilder: (_, _) => const NeraSkeleton(
            width: 124,
            height: 124,
            radius: NeraRadius.sm,
          ),
        ),
      ),
    ],
  );
}
