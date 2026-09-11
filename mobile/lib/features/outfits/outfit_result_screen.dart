import 'package:flutter/material.dart';

import '../../core/errors/friendly_error.dart';
import '../../core/theme/theme.dart';
import '../../core/widgets/widgets.dart';
import '../../models/nera_models.dart';
import '../../services/complete_look_provider.dart';
import '../../services/image_service.dart';
import '../../services/nera_backend.dart';
import '../profile/full_body_photo_flow.dart';
import '../try_on/try_on_result_screen.dart';
import '../wardrobe/wardrobe_item_image.dart';

class OutfitResultScreen extends StatefulWidget {
  const OutfitResultScreen({
    super.key,
    required this.backend,
    required this.imageService,
    required this.outfit,
    required this.wardrobe,
    this.completeLookProvider = const PlaceholderCompleteLookProvider(),
  });

  final NeraBackend backend;
  final NeraImageService imageService;
  final OutfitPlan outfit;
  final List<WardrobeItem> wardrobe;
  final CompleteLookProvider completeLookProvider;

  @override
  State<OutfitResultScreen> createState() => _OutfitResultScreenState();
}

class _OutfitResultScreenState extends State<OutfitResultScreen> {
  late final Future<CompleteLookVisual> _completeLookVisual;
  late OutfitFeedback? _feedback = widget.outfit.feedback;
  OutfitReaction? _savingReaction;
  bool _markingWorn = false;
  bool _tryingOn = false;
  bool _updatingProfilePhoto = false;
  String? _tryOnError;
  bool _profileAssetUnavailable = false;

  @override
  void initState() {
    super.initState();
    _completeLookVisual = widget.completeLookProvider.createVisual(
      outfit: widget.outfit,
      wardrobeItems: _items,
    );
  }

  List<WardrobeItem> get _items => widget.wardrobe
      .where((item) => widget.outfit.wardrobeItemIds.contains(item.id))
      .toList();

  List<WardrobeItem> get _tryOnItems =>
      _items.where((item) => item.canUseVirtualTryOn).toList();

  List<WardrobeItem> get _itemsMissingImages =>
      _items.where((item) => !item.canUseVirtualTryOn).toList();

  // Single item: its own specific reason (e.g. the "add a product-only
  // photo" message for a model-worn shot). Multiple items: a combined
  // summary, since the individual reasons may differ.
  String _tryOnExclusionMessage() {
    final missing = _itemsMissingImages;
    if (missing.length == 1) {
      final item = missing.first;
      return item.containsPerson
          ? item.tryOnBlockedReason!
          : 'Re-upload photo for ${item.name} to use Virtual Try-On.';
    }
    final names = missing.map((item) => item.name).join(', ');
    return missing.every((item) => item.containsPerson)
        ? '$names will be excluded from Virtual Try-On. Items showing a '
              'person need a product-only photo to be included.'
        : 'Not available yet, will start soon.';
  }

  Future<void> _react(OutfitReaction reaction) async {
    setState(() => _savingReaction = reaction);
    try {
      final feedback = await widget.backend.submitOutfitFeedback(
        widget.outfit.id,
        reaction,
      );
      if (mounted) setState(() => _feedback = feedback);
    } catch (error) {
      if (mounted) showNeraSnackBar(context, friendlyError(error), error: true);
    } finally {
      if (mounted) setState(() => _savingReaction = null);
    }
  }

  Future<void> _markWorn() async {
    setState(() => _markingWorn = true);
    try {
      final feedback = await widget.backend.markOutfitWorn(widget.outfit.id);
      if (mounted) setState(() => _feedback = feedback);
    } catch (error) {
      if (mounted) showNeraSnackBar(context, friendlyError(error), error: true);
    } finally {
      if (mounted) setState(() => _markingWorn = false);
    }
  }

  Future<void> _tryOn() async {
    if (_items.isEmpty) {
      setState(
        () => _tryOnError =
            'This look has no wardrobe items to try on. Generate another look.',
      );
      return;
    }
    final tryOnItems = _tryOnItems;
    if (tryOnItems.isEmpty) {
      setState(() => _tryOnError = 'Not available yet, will start soon.');
      return;
    }
    setState(() {
      _tryingOn = true;
      _tryOnError = null;
      _profileAssetUnavailable = false;
    });
    try {
      final result = await widget.backend.generateTryOn(
        wardrobeItemIds: tryOnItems.map((item) => item.id).toList(),
        outfitId: widget.outfit.id,
      );
      _validateTryOn(result);
      if (!mounted) return;
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (context) => TryOnResultScreen(
            backend: widget.backend,
            initialResult: result,
            wardrobe: widget.wardrobe,
          ),
        ),
      );
    } catch (error) {
      if (mounted) {
        setState(() {
          _tryOnError = _tryOnUnavailableMessage(error);
          _profileAssetUnavailable =
              error is NeraException &&
              error.code == 'PROFILE_ASSET_UNAVAILABLE';
        });
      }
    } finally {
      if (mounted) setState(() => _tryingOn = false);
    }
  }

  String _tryOnUnavailableMessage(Object error) => friendlyError(error, feature: ErrorFeature.tryOn);

  Future<void> _updateFullBodyPhoto() async {
    try {
      final profile = await FullBodyPhotoFlow.start(
        context: context,
        backend: widget.backend,
        imageService: widget.imageService,
        onProcessingChanged: (processing) {
          if (mounted) setState(() => _updatingProfilePhoto = processing);
        },
      );
      if (profile != null && mounted) {
        setState(() {
          _profileAssetUnavailable = false;
          _tryOnError = null;
        });
        showNeraSnackBar(
          context,
          'Full-body photo updated. You can try this outfit on now.',
        );
      }
    } catch (error) {
      if (mounted) {
        setState(() => _tryOnError = friendlyError(error, feature: ErrorFeature.imageAnalysis));
        showNeraSnackBar(context, friendlyError(error, feature: ErrorFeature.imageAnalysis), error: true);
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('NERA Edit')),
    body: SafeArea(
      child: ListView(
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 10, 20, 40),
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      widget.outfit.eventType.toUpperCase(),
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: NeraColors.textSecondary,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1.8,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      '${widget.outfit.eventType} edit',
                      style: NeraTheme.display(34),
                    ),
                  ],
                ),
              ),
              if (widget.outfit.matchScore != null)
                _MatchScore(score: widget.outfit.matchScore!),
            ],
          ),
          const SizedBox(height: NeraSpacing.xxxl),
          const _EditorialSectionTitle('COMPLETE LOOK'),
          const SizedBox(height: NeraSpacing.md),
          _CompleteLookComposition(
            visual: _completeLookVisual,
            wardrobeItems: _items,
            suggestedItems: widget.outfit.suggestedItems,
          ),
          const SizedBox(height: NeraSpacing.xxxl),
          const _EditorialSectionTitle('FROM YOUR WARDROBE'),
          const SizedBox(height: NeraSpacing.md),
          if (_items.isEmpty)
            const NeraCard(
              child: NeraEmptyState(
                icon: Icons.checkroom_rounded,
                title: 'Outfit pieces unavailable',
                message:
                    'Some wardrobe items may have been removed. Generate a fresh look.',
              ),
            )
          else
            SizedBox(
              height: 248,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: _items.length,
                separatorBuilder: (_, _) => const SizedBox(width: 12),
                itemBuilder: (context, index) {
                  final item = _items[index];
                  return SizedBox(
                    width: 174,
                    child: NeraCard(
                      padding: const EdgeInsets.all(10),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(child: WardrobeItemImage(item: item)),
                          const SizedBox(height: 10),
                          Text(
                            item.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          Text(
                            item.category,
                            style: Theme.of(context).textTheme.labelSmall,
                          ),
                          const SizedBox(height: 6),
                          const Text(
                            'From Your Wardrobe',
                            style: TextStyle(
                              color: NeraColors.textSecondary,
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          if (widget.outfit.suggestedItems.isNotEmpty) ...[
            const SizedBox(height: NeraSpacing.xxxl),
            const _EditorialSectionTitle('NERA SUGGESTS'),
            const SizedBox(height: NeraSpacing.md),
            for (
              var index = 0;
              index < widget.outfit.suggestedItems.length;
              index++
            ) ...[
              _SuggestedItemCard(item: widget.outfit.suggestedItems[index]),
              if (index < widget.outfit.suggestedItems.length - 1)
                const SizedBox(height: NeraSpacing.sm),
            ],
          ],
          const SizedBox(height: NeraSpacing.xxxl),
          const _EditorialSectionTitle('WHY THIS WORKS'),
          const SizedBox(height: NeraSpacing.md),
          NeraCard(
            highlighted: true,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.outfit.rationale.isEmpty
                      ? 'A balanced look selected for your style profile.'
                      : widget.outfit.rationale,
                ),
              ],
            ),
          ),
          const SizedBox(height: NeraSpacing.xxxl),
          const _EditorialSectionTitle('TRY ON ME'),
          const SizedBox(height: NeraSpacing.md),
          if (_itemsMissingImages.isNotEmpty) ...[
            NeraCard(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(
                    Icons.info_outline_rounded,
                    color: NeraColors.textSecondary,
                  ),
                  const SizedBox(width: 10),
                  Expanded(child: Text(_tryOnExclusionMessage())),
                ],
              ),
            ),
            const SizedBox(height: NeraSpacing.md),
          ],
          NeraButton(
            label: 'Try On Me',
            icon: Icons.person_rounded,
            loading: _tryingOn,
            onPressed: _tryOn,
          ),
          if (_tryOnError != null) ...[
            const SizedBox(height: NeraSpacing.md),
            NeraErrorState(
              title: 'Virtual try-on unavailable',
              message: _tryOnError!,
              retryLabel: _profileAssetUnavailable
                  ? 'Upload Full-Body Photo'
                  : 'Try again',
              retrying: _updatingProfilePhoto,
              onRetry: _tryingOn
                  ? null
                  : _profileAssetUnavailable
                  ? _updateFullBodyPhoto
                  : _tryOn,
            ),
          ],
          const SizedBox(height: NeraSpacing.xxxl),
          const _EditorialSectionTitle('FEEDBACK / WORN ACTIONS'),
          const SizedBox(height: NeraSpacing.md),
          const NeraSectionHeader(
            'How does this look feel?',
            subtitle: 'Your feedback makes future matches more personal.',
          ),
          const SizedBox(height: NeraSpacing.md),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final reaction in OutfitReaction.values)
                ChoiceChip(
                  selected: _feedback?.reaction == reaction,
                  onSelected: _savingReaction == null
                      ? (_) => _react(reaction)
                      : null,
                  avatar: _savingReaction == reaction
                      ? const SizedBox.square(
                          dimension: 14,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Text(reaction.emoji),
                  label: Text(
                    reaction.label,
                    style: TextStyle(
                      color: _feedback?.reaction == reaction
                          ? NeraColors.onInk
                          : NeraColors.textPrimary,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: NeraSpacing.lg),
          NeraButton(
            label: _feedback?.hasBeenWorn == true
                ? 'Worn — saved to your profile'
                : 'I Wore This',
            icon: _feedback?.hasBeenWorn == true
                ? Icons.check_circle_rounded
                : Icons.checkroom_rounded,
            loading: _markingWorn,
            style: NeraButtonStyleType.secondary,
            onPressed: _feedback?.hasBeenWorn == true ? null : _markWorn,
          ),
        ],
      ),
    ),
  );
}

class _EditorialSectionTitle extends StatelessWidget {
  const _EditorialSectionTitle(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Text(
    text,
    style: Theme.of(context).textTheme.labelLarge?.copyWith(
      fontWeight: FontWeight.w800,
      letterSpacing: 1.7,
    ),
  );
}

class _CompleteLookComposition extends StatelessWidget {
  const _CompleteLookComposition({
    required this.visual,
    required this.wardrobeItems,
    required this.suggestedItems,
  });

  final Future<CompleteLookVisual> visual;
  final List<WardrobeItem> wardrobeItems;
  final List<SuggestedItem> suggestedItems;

  @override
  Widget build(BuildContext context) {
    final leftItems = wardrobeItems.take(2).toList();
    final remainingWardrobe = wardrobeItems.skip(2).take(2).toList();

    return NeraCard(
      padding: const EdgeInsets.all(NeraSpacing.md),
      child: Column(
        children: [
          SizedBox(
            height: 322,
            child: LayoutBuilder(
              builder: (context, constraints) {
                final cardWidth = ((constraints.maxWidth - 132) / 2)
                    .clamp(72.0, 104.0)
                    .toDouble();
                return Stack(
                  children: [
                    Positioned.fill(
                      left: cardWidth + 8,
                      right: cardWidth + 8,
                      top: 28,
                      bottom: 18,
                      child: FutureBuilder<CompleteLookVisual>(
                        future: visual,
                        builder: (context, snapshot) {
                          final result = snapshot.data;
                          if (result != null && !result.isPlaceholder) {
                            return NeraNetworkImage(
                              url: result.imageUrl!,
                              radius: NeraRadius.lg,
                            );
                          }
                          return const _NeutralFigurePlaceholder();
                        },
                      ),
                    ),
                    for (var index = 0; index < leftItems.length; index++)
                      Positioned(
                        left: 0,
                        top: index == 0 ? 12 : null,
                        bottom: index == 1 ? 12 : null,
                        child: _FloatingWardrobeCard(
                          item: leftItems[index],
                          width: cardWidth,
                        ),
                      ),
                    if (suggestedItems.isNotEmpty)
                      for (
                        var index = 0;
                        index < suggestedItems.take(2).length;
                        index++
                      )
                        Positioned(
                          right: 0,
                          top: index == 0 ? 12 : null,
                          bottom: index == 1 ? 12 : null,
                          child: _FloatingSuggestionCard(
                            item: suggestedItems[index],
                            width: cardWidth,
                          ),
                        )
                    else
                      for (
                        var index = 0;
                        index < remainingWardrobe.length;
                        index++
                      )
                        Positioned(
                          right: 0,
                          top: index == 0 ? 12 : null,
                          bottom: index == 1 ? 12 : null,
                          child: _FloatingWardrobeCard(
                            item: remainingWardrobe[index],
                            width: cardWidth,
                          ),
                        ),
                  ],
                );
              },
            ),
          ),
          const SizedBox(height: NeraSpacing.sm),
          const Text(
            'A visual layout preview using your selected pieces.',
            textAlign: TextAlign.center,
            style: TextStyle(color: NeraColors.textSecondary, fontSize: 12),
          ),
        ],
      ),
    );
  }
}

class _NeutralFigurePlaceholder extends StatelessWidget {
  const _NeutralFigurePlaceholder();

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      color: NeraColors.surfaceElevated,
      borderRadius: BorderRadius.circular(NeraRadius.lg),
    ),
    child: const CustomPaint(painter: _NeutralFigurePainter()),
  );
}

class _NeutralFigurePainter extends CustomPainter {
  const _NeutralFigurePainter();

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = NeraColors.muted.withValues(alpha: .46);
    final center = Offset(size.width / 2, size.height * .18);
    canvas.drawCircle(center, size.width * .16, paint);
    final body = Path()
      ..moveTo(size.width * .34, size.height * .35)
      ..quadraticBezierTo(
        size.width * .5,
        size.height * .27,
        size.width * .66,
        size.height * .35,
      )
      ..lineTo(size.width * .77, size.height * .78)
      ..lineTo(size.width * .61, size.height * .82)
      ..lineTo(size.width * .57, size.height)
      ..lineTo(size.width * .43, size.height)
      ..lineTo(size.width * .39, size.height * .82)
      ..lineTo(size.width * .23, size.height * .78)
      ..close();
    canvas.drawPath(body, paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _FloatingWardrobeCard extends StatelessWidget {
  const _FloatingWardrobeCard({required this.item, required this.width});

  final WardrobeItem item;
  final double width;

  @override
  Widget build(BuildContext context) => Container(
    width: width,
    height: 126,
    padding: const EdgeInsets.all(6),
    decoration: BoxDecoration(
      color: NeraColors.surface,
      border: Border.all(color: NeraColors.surfaceBorder),
      borderRadius: BorderRadius.circular(NeraRadius.md),
      boxShadow: const [
        BoxShadow(
          color: Color(0x12000000),
          blurRadius: 16,
          offset: Offset(0, 6),
        ),
      ],
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: WardrobeItemImage(item: item, radius: NeraRadius.sm),
        ),
        const SizedBox(height: 4),
        Text(
          item.name,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700),
        ),
        const Text(
          'YOUR WARDROBE',
          maxLines: 1,
          style: TextStyle(
            color: NeraColors.textSecondary,
            fontSize: 7,
            fontWeight: FontWeight.w700,
            letterSpacing: .4,
          ),
        ),
      ],
    ),
  );
}

class _FloatingSuggestionCard extends StatelessWidget {
  const _FloatingSuggestionCard({required this.item, required this.width});

  final SuggestedItem item;
  final double width;

  @override
  Widget build(BuildContext context) => Container(
    width: width,
    height: 126,
    padding: const EdgeInsets.all(8),
    decoration: BoxDecoration(
      color: NeraColors.ink,
      borderRadius: BorderRadius.circular(NeraRadius.md),
      boxShadow: const [
        BoxShadow(
          color: Color(0x1F000000),
          blurRadius: 16,
          offset: Offset(0, 6),
        ),
      ],
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Icon(Icons.auto_awesome_rounded, color: NeraColors.onInk),
        const Spacer(),
        Text(
          item.name,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            color: NeraColors.onInk,
            fontSize: 10,
            fontWeight: FontWeight.w700,
          ),
        ),
        Text(
          'NERA · ${item.type.toUpperCase()}',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            color: NeraColors.onInk.withValues(alpha: .7),
            fontSize: 7,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    ),
  );
}

class _SuggestedItemCard extends StatelessWidget {
  const _SuggestedItemCard({required this.item});

  final SuggestedItem item;

  @override
  Widget build(BuildContext context) {
    final roleCopy = switch (item.role) {
      'essential' => 'Completes the look',
      'accessory' => 'Optional finishing touch',
      _ => null,
    };
    return NeraCard(
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: NeraColors.surfaceElevated,
              borderRadius: BorderRadius.circular(NeraRadius.sm),
            ),
            child: const Icon(Icons.auto_awesome_rounded),
          ),
          const SizedBox(width: NeraSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item.name, style: Theme.of(context).textTheme.titleMedium),
                Text(
                  item.type,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: NeraColors.textSecondary,
                  ),
                ),
                if (roleCopy != null) ...[
                  const SizedBox(height: 3),
                  Text(
                    roleCopy,
                    style: const TextStyle(
                      color: NeraColors.textSecondary,
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

void _validateTryOn(TryOnResult result) {
  if (result.developmentFallback ||
      result.imageUrl.trim().isEmpty ||
      result.status != 'completed') {
    throw const NeraException(
      'Our virtual try-on service is currently unavailable. No generated image was returned. Please try again later.',
    );
  }
}

class _MatchScore extends StatelessWidget {
  const _MatchScore({required this.score});
  final int score;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
    decoration: BoxDecoration(
      color: NeraColors.ink,
      borderRadius: BorderRadius.circular(NeraRadius.pill),
    ),
    child: Column(
      children: [
        Text(
          '$score%',
          style: const TextStyle(
            color: NeraColors.onInk,
            fontWeight: FontWeight.w800,
            fontSize: 18,
          ),
        ),
        Text(
          'MATCH',
          style: TextStyle(
            color: NeraColors.onInk.withValues(alpha: .7),
            fontSize: 9,
            letterSpacing: 1.2,
          ),
        ),
      ],
    ),
  );
}
