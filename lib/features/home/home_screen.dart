import 'package:flutter/material.dart';

import '../../core/theme/theme.dart';
import '../../core/widgets/widgets.dart';
import '../../models/nera_models.dart';
import '../styling/occasion_grid.dart';
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

  @override
  Widget build(BuildContext context) => CustomScrollView(
    physics: const BouncingScrollPhysics(),
    slivers: [
      SliverPadding(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 120),
        sliver: SliverList.list(
          children: [
            Row(
              children: [
                const NeraWordmark(size: 34),
                const Spacer(),
                CircleAvatar(
                  radius: 22,
                  backgroundColor: NeraColors.surfaceElevated,
                  foregroundImage:
                      (profile.profileImageUrl?.isNotEmpty ?? false)
                      ? NetworkImage(profile.profileImageUrl!)
                      : null,
                  child: const Icon(
                    Icons.person_rounded,
                    color: NeraColors.gold,
                  ),
                ),
              ],
            ),
            const SizedBox(height: NeraSpacing.xxl),
            Text(
              'Good to see you,',
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            Text(_firstName(user?.name), style: NeraTheme.heading(32)),
            const SizedBox(height: NeraSpacing.xxl),
            if (error != null)
              NeraErrorState(message: error!, onRetry: onRetry)
            else if (loading)
              const _HomeSkeleton()
            else ...[
              NeraCard(
                gradient: true,
                padding: const EdgeInsets.all(NeraSpacing.xl),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: NeraColors.gold.withValues(alpha: .12),
                            borderRadius: BorderRadius.circular(NeraRadius.sm),
                          ),
                          child: const Icon(
                            Icons.auto_awesome_rounded,
                            color: NeraColors.gold,
                          ),
                        ),
                        const SizedBox(width: NeraSpacing.md),
                        Expanded(
                          child: Text(
                            'Dress Me Today',
                            style: Theme.of(context).textTheme.headlineSmall,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Choose where you are going. NERA will style a complete look from your wardrobe.',
                    ),
                    const SizedBox(height: NeraSpacing.lg),
                    OccasionGrid(onSelected: onOccasion),
                    if (wardrobe.length < 2) ...[
                      const SizedBox(height: NeraSpacing.md),
                      Text(
                        'Add ${2 - wardrobe.length} more ${wardrobe.length == 1 ? 'item' : 'items'} for complete outfit suggestions.',
                        style: const TextStyle(color: NeraColors.gold),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: NeraSpacing.xxl),
              NeraSectionHeader(
                'Your wardrobe',
                subtitle: wardrobe.isEmpty
                    ? 'Start building your digital closet'
                    : '${wardrobe.length} pieces ready to style',
                action: TextButton(
                  onPressed: onOpenWardrobe,
                  child: const Text('View all'),
                ),
              ),
              const SizedBox(height: NeraSpacing.md),
              if (wardrobe.isEmpty)
                NeraCard(
                  onTap: onOpenWardrobe,
                  child: NeraEmptyState(
                    icon: Icons.add_photo_alternate_rounded,
                    title: 'Your closet is empty!',
                    message:
                        'Add clear photos of your clothes to unlock personal styling.',
                    action: FilledButton.icon(
                      onPressed: onOpenWardrobe,
                      icon: const Icon(Icons.add_rounded),
                      label: const Text('Upload Wardrobe'),
                    ),
                  ),
                )
              else
                SizedBox(
                  height: 154,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: wardrobe.take(8).length,
                    separatorBuilder: (_, _) => const SizedBox(width: 12),
                    itemBuilder: (context, index) {
                      final item = wardrobe[index];
                      return SizedBox(
                        width: 112,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            WardrobeItemImage(item: item, size: 112),
                            const SizedBox(height: 6),
                            Text(
                              item.name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: Theme.of(context).textTheme.labelLarge,
                            ),
                            Text(
                              item.category,
                              style: Theme.of(context).textTheme.labelSmall,
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                ),
            ],
          ],
        ),
      ),
    ],
  );
}

String _firstName(String? name) {
  final clean = name?.trim() ?? '';
  return clean.isEmpty ? 'beautiful' : clean.split(RegExp(r'\s+')).first;
}

class _HomeSkeleton extends StatelessWidget {
  const _HomeSkeleton();

  @override
  Widget build(BuildContext context) => const Column(
    children: [
      NeraSkeleton(width: double.infinity, height: 390, radius: NeraRadius.md),
      SizedBox(height: NeraSpacing.xxl),
      NeraSkeleton(width: double.infinity, height: 150, radius: NeraRadius.md),
    ],
  );
}
