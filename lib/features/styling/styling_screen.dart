import 'package:flutter/material.dart';

import '../../core/theme/theme.dart';
import '../../core/widgets/widgets.dart';
import '../../models/nera_models.dart';
import 'occasion_grid.dart';

class StylingScreen extends StatefulWidget {
  const StylingScreen({
    super.key,
    required this.wardrobe,
    required this.profile,
    required this.loading,
    required this.onOccasion,
    required this.loadHistory,
    required this.onOpenOutfit,
    this.error,
    required this.onRetry,
  });

  final List<WardrobeItem> wardrobe;
  final StyleProfile profile;
  final bool loading;
  final String? error;
  final VoidCallback onRetry;
  final ValueChanged<OccasionType> onOccasion;
  final Future<List<OutfitPlan>> Function() loadHistory;
  final ValueChanged<OutfitPlan> onOpenOutfit;

  @override
  State<StylingScreen> createState() => _StylingScreenState();
}

class _StylingScreenState extends State<StylingScreen> {
  late Future<List<OutfitPlan>> _history = widget.loadHistory();

  void _retryHistory() => setState(() => _history = widget.loadHistory());

  @override
  Widget build(BuildContext context) => ListView(
    physics: const BouncingScrollPhysics(),
    padding: const EdgeInsets.fromLTRB(20, 20, 20, 120),
    children: [
      Text('Styling', style: NeraTheme.display(38)),
      const SizedBox(height: 6),
      Text(
        'Complete looks, personalized to you.',
        style: Theme.of(context).textTheme.bodyLarge,
      ),
      const SizedBox(height: NeraSpacing.xxl),
      if (widget.error != null)
        NeraErrorState(message: widget.error!, onRetry: widget.onRetry)
      else if (widget.loading)
        const NeraSkeleton(
          width: double.infinity,
          height: 370,
          radius: NeraRadius.md,
        )
      else ...[
        NeraCard(
          gradient: true,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const NeraSectionHeader(
                'Dress Me Today',
                subtitle: 'What are you dressing for?',
              ),
              const SizedBox(height: NeraSpacing.lg),
              OccasionGrid(onSelected: widget.onOccasion),
              if (widget.wardrobe.length < 2) ...[
                const SizedBox(height: NeraSpacing.md),
                const Text(
                  'Add at least 2 wardrobe items to generate a complete look.',
                  style: TextStyle(color: NeraColors.gold),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: NeraSpacing.xxl),
        const NeraSectionHeader(
          'Recent looks',
          subtitle: 'Your generated outfit history',
        ),
        const SizedBox(height: NeraSpacing.md),
        FutureBuilder<List<OutfitPlan>>(
          future: _history,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const NeraSkeleton(
                width: double.infinity,
                height: 150,
                radius: NeraRadius.md,
              );
            }
            if (snapshot.hasError) {
              return NeraErrorState(
                message: snapshot.error.toString(),
                onRetry: _retryHistory,
              );
            }
            final outfits = snapshot.data ?? const [];
            if (outfits.isEmpty) {
              return const NeraCard(
                child: NeraEmptyState(
                  icon: Icons.auto_awesome_motion_rounded,
                  title: 'No looks yet',
                  message: 'Choose an occasion above to create your first one.',
                ),
              );
            }
            return Column(
              children: [
                for (final outfit in outfits) ...[
                  NeraCard(
                    onTap: () => widget.onOpenOutfit(outfit),
                    child: Row(
                      children: [
                        Container(
                          width: 52,
                          height: 52,
                          decoration: BoxDecoration(
                            color: NeraColors.gold.withValues(alpha: .12),
                            borderRadius: BorderRadius.circular(NeraRadius.sm),
                          ),
                          child: Icon(
                            OccasionType.fromLabel(outfit.eventType)?.icon ??
                                Icons.auto_awesome_rounded,
                            color: NeraColors.gold,
                          ),
                        ),
                        const SizedBox(width: NeraSpacing.md),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '${outfit.eventType} edit',
                                style: Theme.of(context).textTheme.titleMedium,
                              ),
                              Text(
                                '${outfit.wardrobeItemIds.length} pieces',
                                style: Theme.of(context).textTheme.bodyMedium,
                              ),
                            ],
                          ),
                        ),
                        if (outfit.matchScore != null)
                          Text(
                            '${outfit.matchScore}%',
                            style: const TextStyle(
                              color: NeraColors.gold,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        const SizedBox(width: 4),
                        const Icon(
                          Icons.chevron_right_rounded,
                          color: NeraColors.muted,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: NeraSpacing.md),
                ],
              ],
            );
          },
        ),
      ],
    ],
  );
}
