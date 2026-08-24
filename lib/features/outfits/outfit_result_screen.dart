import 'package:flutter/material.dart';

import '../../core/errors/friendly_error.dart';
import '../../core/theme/theme.dart';
import '../../core/widgets/widgets.dart';
import '../../models/nera_models.dart';
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
  });

  final NeraBackend backend;
  final NeraImageService imageService;
  final OutfitPlan outfit;
  final List<WardrobeItem> wardrobe;

  @override
  State<OutfitResultScreen> createState() => _OutfitResultScreenState();
}

class _OutfitResultScreenState extends State<OutfitResultScreen> {
  late OutfitFeedback? _feedback = widget.outfit.feedback;
  OutfitReaction? _savingReaction;
  bool _markingWorn = false;
  bool _tryingOn = false;
  bool _updatingProfilePhoto = false;
  String? _tryOnError;
  bool _profileAssetUnavailable = false;

  List<WardrobeItem> get _items => widget.wardrobe
      .where((item) => widget.outfit.wardrobeItemIds.contains(item.id))
      .toList();

  List<WardrobeItem> get _tryOnItems =>
      _items.where((item) => item.canUseVirtualTryOn).toList();

  List<WardrobeItem> get _itemsMissingImages =>
      _items.where((item) => !item.canUseVirtualTryOn).toList();

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
      final item = _itemsMissingImages.first;
      setState(
        () => _tryOnError =
            'Re-upload photo for ${item.name} to use Virtual Try-On.',
      );
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
          _tryOnError = friendlyError(error);
          _profileAssetUnavailable =
              error is NeraException &&
              error.code == 'PROFILE_ASSET_UNAVAILABLE';
        });
      }
    } finally {
      if (mounted) setState(() => _tryingOn = false);
    }
  }

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
        setState(() => _tryOnError = friendlyError(error));
        showNeraSnackBar(context, friendlyError(error), error: true);
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Your Look')),
    body: SafeArea(
      child: ListView(
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 10, 20, 40),
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Text(
                  '${widget.outfit.eventType} edit',
                  style: NeraTheme.display(34),
                ),
              ),
              if (widget.outfit.matchScore != null)
                _MatchScore(score: widget.outfit.matchScore!),
            ],
          ),
          const SizedBox(height: NeraSpacing.xxl),
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
              height: 270,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: _items.length,
                separatorBuilder: (_, _) => const SizedBox(width: 12),
                itemBuilder: (context, index) {
                  final item = _items[index];
                  return SizedBox(
                    width: 190,
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
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          const SizedBox(height: NeraSpacing.xxl),
          NeraCard(
            gradient: true,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(Icons.auto_awesome_rounded, color: NeraColors.gold),
                    SizedBox(width: 10),
                    Text(
                      'Why it works',
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 17,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: NeraSpacing.md),
                Text(
                  widget.outfit.rationale.isEmpty
                      ? 'A balanced look selected for your style profile.'
                      : widget.outfit.rationale,
                ),
              ],
            ),
          ),
          const SizedBox(height: NeraSpacing.xxl),
          if (_itemsMissingImages.isNotEmpty) ...[
            NeraCard(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(
                    Icons.info_outline_rounded,
                    color: NeraColors.gold,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      _tryOnItems.isEmpty
                          ? 'Re-upload photo for ${_itemsMissingImages.first.name} to use Virtual Try-On.'
                          : '${_itemsMissingImages.map((item) => item.name).join(', ')} will be excluded from Virtual Try-On. Re-upload ${_itemsMissingImages.length == 1 ? 'its photo' : 'their photos'}.',
                    ),
                  ),
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
          const SizedBox(height: NeraSpacing.xxl),
          const NeraSectionHeader(
            'How does this feel?',
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
                  label: Text(reaction.label),
                  selectedColor: reaction.color.withValues(alpha: .2),
                  side: BorderSide(
                    color: _feedback?.reaction == reaction
                        ? reaction.color
                        : NeraColors.surfaceBorder,
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
      color: NeraColors.gold.withValues(alpha: .12),
      borderRadius: BorderRadius.circular(NeraRadius.pill),
      border: Border.all(color: NeraColors.gold.withValues(alpha: .5)),
    ),
    child: Column(
      children: [
        Text(
          '$score%',
          style: const TextStyle(
            color: NeraColors.gold,
            fontWeight: FontWeight.w800,
            fontSize: 18,
          ),
        ),
        const Text(
          'MATCH',
          style: TextStyle(
            color: NeraColors.muted,
            fontSize: 9,
            letterSpacing: 1.2,
          ),
        ),
      ],
    ),
  );
}
