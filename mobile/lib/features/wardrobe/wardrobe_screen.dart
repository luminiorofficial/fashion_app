import 'dart:async';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/errors/friendly_error.dart';
import '../../core/theme/theme.dart';
import '../../core/widgets/widgets.dart';
import '../../models/nera_models.dart';
import '../../services/image_service.dart';
import '../../services/nera_backend.dart';
import 'wardrobe_batch_review_screen.dart';
import 'wardrobe_item_image.dart';

class WardrobeScreen extends StatefulWidget {
  const WardrobeScreen({
    super.key,
    required this.backend,
    required this.imageService,
    required this.items,
    required this.loading,
    required this.onRetry,
    this.error,
  });

  final NeraBackend backend;
  final NeraImageService imageService;
  final List<WardrobeItem> items;
  final bool loading;
  final String? error;
  final VoidCallback onRetry;

  @override
  State<WardrobeScreen> createState() => _WardrobeScreenState();
}

class _WardrobeScreenState extends State<WardrobeScreen> {
  // Caps how many images are analyzed at once so a big multi-select doesn't
  // fire dozens of simultaneous Gemini requests at once.
  static const _maxAnalysisConcurrency = 3;

  bool _processing = false;
  String? _progress;
  String _filter = 'All';
  String _section = 'wardrobe';
  List<PurchaseCandidate> _purchases = [];
  bool _purchasesLoading = false;
  String? _purchasesError;
  final Set<String> _busyPurchaseIds = {};

  List<WardrobeItem> get _visible => _filter == 'All'
      ? widget.items
      : widget.items.where((item) => item.category == _filter).toList();

  Future<void> _chooseSource() async {
    final action = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Add to your wardrobe',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 8),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(
                  Icons.camera_alt_rounded,
                  color: NeraColors.gold,
                ),
                title: const Text('Take a photo'),
                onTap: () => Navigator.pop(context, 'camera'),
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(
                  Icons.photo_library_rounded,
                  color: NeraColors.gold,
                ),
                title: const Text('Choose from gallery'),
                onTap: () => Navigator.pop(context, 'gallery'),
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.link_rounded, color: NeraColors.gold),
                title: const Text('Add a product link'),
                onTap: () => Navigator.pop(context, 'link'),
              ),
            ],
          ),
        ),
      ),
    );
    if (!mounted || action == null) return;
    if (action == 'link') {
      await _addLink();
    } else {
      await _upload(
        action == 'camera' ? ImageSource.camera : ImageSource.gallery,
      );
    }
  }

  // Analyzes every picked image first (up to _maxAnalysisConcurrency at a
  // time, so Gemini never receives an unbounded burst of requests), then
  // shows one review screen with every detected item and a single "Save
  // All" button — no per-item confirmation dialog. Saving happens in one
  // batch call so the wardrobe list is refreshed only once, not after every
  // individual item.
  Future<void> _upload(ImageSource source) async {
    setState(() {
      _processing = true;
      _progress = 'Selecting images…';
    });
    try {
      final images = await widget.imageService.pickMany(source);
      final total = images.length;
      final results = List<WardrobeDraft?>.filled(total, null);
      var completed = 0;
      if (mounted && total > 0) {
        setState(() => _progress = 'Analyzing 0/$total…');
      }
      await _runWithConcurrency(total, _maxAnalysisConcurrency, (
        index,
      ) async {
        try {
          final image = images[index];
          results[index] = await widget.backend.analyzeWardrobeImage(
            Uint8List.fromList(image.bytes),
            image.fileName,
          );
        } catch (error) {
          if (mounted) {
            showNeraSnackBar(context, friendlyError(error), error: true);
          }
        } finally {
          completed += 1;
          if (mounted) {
            setState(() => _progress = 'Analyzing $completed/$total…');
          }
        }
      });
      final drafts = results.whereType<WardrobeDraft>().toList();
      if (!mounted || drafts.isEmpty) return;
      setState(() {
        _processing = false;
        _progress = null;
      });

      final reviewed = await WardrobeBatchReviewScreen.review(
        context,
        drafts,
      );
      final keptIds = reviewed.map((draft) => draft.id).toSet();
      final discarded = drafts.where(
        (draft) => !keptIds.contains(draft.id),
      );
      await Future.wait(discarded.map(widget.backend.discardWardrobeDraft));

      if (reviewed.isNotEmpty && mounted) {
        setState(() {
          _processing = true;
          _progress = 'Saving ${reviewed.length} items…';
        });
        await widget.backend.saveWardrobeDrafts(reviewed);
        if (mounted) {
          showNeraSnackBar(
            context,
            '${reviewed.length} wardrobe '
            '${reviewed.length == 1 ? 'item' : 'items'} added.',
          );
        }
      }
    } catch (error) {
      if (mounted) showNeraSnackBar(context, friendlyError(error), error: true);
    } finally {
      if (mounted) {
        setState(() {
          _processing = false;
          _progress = null;
        });
      }
    }
  }

  // Bounded worker-pool: runs [task] for every index in [0, count), with at
  // most [maxConcurrent] tasks in flight at once. Each worker pulls the next
  // unclaimed index until none remain, so slower items don't hold up faster
  // ones the way a fixed chunked batch would.
  Future<void> _runWithConcurrency(
    int count,
    int maxConcurrent,
    Future<void> Function(int index) task,
  ) async {
    if (count == 0) return;
    var next = 0;
    Future<void> worker() async {
      while (next < count) {
        final index = next;
        next += 1;
        await task(index);
      }
    }

    await Future.wait(
      List.generate(math.min(maxConcurrent, count), (_) => worker()),
    );
  }

  Future<void> _addLink() async {
    final name = TextEditingController();
    final url = TextEditingController();
    var category = 'Accessory';
    final save = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, update) => AlertDialog(
          title: const Text('Add product link'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: name,
                decoration: const InputDecoration(labelText: 'Item name'),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: category,
                decoration: const InputDecoration(labelText: 'Category'),
                items: [
                  for (final value in wardrobeCategories)
                    DropdownMenuItem(value: value, child: Text(value)),
                ],
                onChanged: (value) {
                  if (value != null) update(() => category = value);
                },
              ),
              const SizedBox(height: 12),
              TextField(
                controller: url,
                keyboardType: TextInputType.url,
                decoration: const InputDecoration(labelText: 'Product URL'),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Add item'),
            ),
          ],
        ),
      ),
    );
    try {
      final uri = Uri.tryParse(url.text.trim());
      if (save == true) {
        if (name.text.trim().isEmpty ||
            uri == null ||
            !uri.hasScheme ||
            !uri.hasAuthority) {
          throw const NeraException(
            'Enter an item name and a complete product URL.',
          );
        }
        await widget.backend.addWardrobeLink(
          name: name.text.trim(),
          category: category,
          productUrl: url.text.trim(),
        );
        if (mounted) {
          showNeraSnackBar(context, '${name.text.trim()} was added.');
        }
      }
    } catch (error) {
      if (mounted) showNeraSnackBar(context, friendlyError(error), error: true);
    } finally {
      name.dispose();
      url.dispose();
    }
  }

  Future<void> _openItemDetail(WardrobeItem item) async {
    if (item.isNew) unawaited(_markViewed(item));
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (context) => _WardrobeItemDetailSheet(item: item),
    );
  }

  Future<void> _markViewed(WardrobeItem item) async {
    try {
      await widget.backend.markWardrobeItemViewed(item.id);
    } catch (_) {
      // Best-effort: a failed "mark as viewed" call shouldn't block or
      // interrupt the user looking at the item — it'll simply be retried
      // (harmlessly, see markWardrobeItemViewed's idempotency) next time
      // they open it.
    }
  }

  Future<void> _delete(WardrobeItem item) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Remove item?'),
        content: Text('${item.name} will be removed from your wardrobe.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await widget.backend.deleteWardrobeItem(item);
      if (mounted) showNeraSnackBar(context, '${item.name} was removed.');
    } catch (error) {
      if (mounted) showNeraSnackBar(context, friendlyError(error), error: true);
    }
  }

  void _selectSection(String section) {
    setState(() => _section = section);
    if (section == 'purchases' && _purchases.isEmpty && !_purchasesLoading) {
      unawaited(_loadPurchases());
    }
  }

  Future<void> _loadPurchases() async {
    setState(() {
      _purchasesLoading = true;
      _purchasesError = null;
    });
    try {
      final purchases = await widget.backend.listPurchaseCandidates();
      if (mounted) setState(() => _purchases = purchases);
    } catch (error) {
      if (mounted) setState(() => _purchasesError = friendlyError(error));
    } finally {
      if (mounted) setState(() => _purchasesLoading = false);
    }
  }

  Future<void> _addPurchaseToWardrobe(PurchaseCandidate purchase) async {
    setState(() => _busyPurchaseIds.add(purchase.id));
    try {
      await widget.backend.addPurchaseToWardrobe(purchase.id);
      if (mounted) {
        setState(
          () => _purchases.removeWhere((item) => item.id == purchase.id),
        );
        showNeraSnackBar(
          context,
          '${purchase.productName} was added to your wardrobe.',
        );
      }
    } catch (error) {
      if (mounted) showNeraSnackBar(context, friendlyError(error), error: true);
    } finally {
      if (mounted) setState(() => _busyPurchaseIds.remove(purchase.id));
    }
  }

  Future<void> _ignorePurchase(PurchaseCandidate purchase) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Ignore this purchase?'),
        content: Text(
          '${purchase.productName} will no longer be suggested for your '
          'wardrobe.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Ignore'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() => _busyPurchaseIds.add(purchase.id));
    try {
      await widget.backend.ignorePurchase(purchase.id);
      if (mounted) {
        setState(
          () => _purchases.removeWhere((item) => item.id == purchase.id),
        );
      }
    } catch (error) {
      if (mounted) showNeraSnackBar(context, friendlyError(error), error: true);
    } finally {
      if (mounted) setState(() => _busyPurchaseIds.remove(purchase.id));
    }
  }

  Widget _buildPurchasesSection(BuildContext context) {
    if (_purchasesError != null) {
      return NeraErrorState(message: _purchasesError!, onRetry: _loadPurchases);
    }
    if (_purchasesLoading) {
      return Column(
        children: [
          for (var i = 0; i < 3; i++) ...[
            const NeraSkeleton(
              width: double.infinity,
              height: 120,
              radius: NeraRadius.md,
            ),
            const SizedBox(height: 12),
          ],
        ],
      );
    }
    if (_purchases.isEmpty) {
      return NeraCard(
        child: NeraEmptyState(
          icon: Icons.local_shipping_outlined,
          title: 'No purchases detected yet',
          message: 'Connect Gmail from your Profile to detect delivered '
              'fashion purchases automatically.',
        ),
      );
    }
    return Column(
      children: [
        for (final purchase in _purchases) ...[
          _PurchaseCandidateCard(
            purchase: purchase,
            busy: _busyPurchaseIds.contains(purchase.id),
            onAdd: () => _addPurchaseToWardrobe(purchase),
            onIgnore: () => _ignorePurchase(purchase),
          ),
          const SizedBox(height: 12),
        ],
      ],
    );
  }

  @override
  Widget build(BuildContext context) => Stack(
    children: [
      ListView(
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 120),
        children: [
          Row(
            children: [
              Expanded(child: Text('Wardrobe', style: NeraTheme.heading(32))),
              IconButton.filled(
                onPressed: _processing ? null : _chooseSource,
                icon: const Icon(Icons.add_rounded),
                tooltip: 'Upload Wardrobe',
              ),
            ],
          ),
          Text(
            '${widget.items.length} pieces in your digital closet',
            style: Theme.of(context).textTheme.bodyLarge,
          ),
          const SizedBox(height: NeraSpacing.xl),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'wardrobe', label: Text('My Wardrobe')),
              ButtonSegment(value: 'purchases', label: Text('Purchases')),
            ],
            selected: {_section},
            onSelectionChanged: (selection) => _selectSection(selection.first),
          ),
          const SizedBox(height: NeraSpacing.lg),
          if (_section == 'purchases') ...[
            _buildPurchasesSection(context),
          ] else ...[
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final category in ['All', ...wardrobeCategories])
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(category),
                      selected: _filter == category,
                      onSelected: (_) => setState(() => _filter = category),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: NeraSpacing.lg),
          if (widget.error != null)
            NeraErrorState(message: widget.error!, onRetry: widget.onRetry)
          else if (widget.loading)
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              children: [
                for (var i = 0; i < 4; i++)
                  const NeraSkeleton(height: 200, radius: NeraRadius.md),
              ],
            )
          else if (_visible.isEmpty)
            NeraCard(
              child: NeraEmptyState(
                icon: Icons.checkroom_rounded,
                title: _filter == 'All'
                    ? 'Your closet is empty!'
                    : 'No $_filter pieces yet',
                message: 'Add photos or product links to start styling.',
                action: FilledButton.icon(
                  onPressed: _chooseSource,
                  icon: const Icon(Icons.add_rounded),
                  label: const Text('Upload Wardrobe'),
                ),
              ),
            )
          else
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: _visible.length,
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: .68,
              ),
              itemBuilder: (context, index) {
                final item = _visible[index];
                return NeraCard(
                  padding: const EdgeInsets.all(9),
                  onTap: () => _openItemDetail(item),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            WardrobeItemImage(item: item),
                            if (item.isNew)
                              const Positioned(
                                top: 4,
                                left: 4,
                                child: _NewBadge(),
                              ),
                            Positioned(
                              top: 4,
                              right: 4,
                              child: IconButton.filledTonal(
                                tooltip: 'Remove ${item.name}',
                                onPressed: () => _delete(item),
                                icon: const Icon(
                                  Icons.delete_outline_rounded,
                                  size: 18,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 9),
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
                );
              },
            ),
          ],
        ],
      ),
      if (_processing)
        Positioned.fill(
          child: ColoredBox(
            color: Colors.black54,
            child: Center(
              child: NeraCard(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const CircularProgressIndicator(),
                    const SizedBox(height: 14),
                    Text(_progress ?? 'Working…'),
                  ],
                ),
              ),
            ),
          ),
        ),
    ],
  );
}

/// One detected delivered purchase awaiting a decision, shown in the
/// Purchases section: marketplace, product name, brand, image, size/color,
/// delivery date, and Add to Wardrobe / Ignore actions.
class _PurchaseCandidateCard extends StatelessWidget {
  const _PurchaseCandidateCard({
    required this.purchase,
    required this.busy,
    required this.onAdd,
    required this.onIgnore,
  });

  final PurchaseCandidate purchase;
  final bool busy;
  final VoidCallback onAdd;
  final VoidCallback onIgnore;

  String _formatDate(DateTime date) =>
      '${date.day}/${date.month}/${date.year}';

  @override
  Widget build(BuildContext context) => NeraCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 64,
              height: 64,
              child: NeraNetworkImage(
                url: purchase.imageUrl ?? '',
                placeholderIcon: Icons.shopping_bag_outlined,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    purchase.marketplace.toUpperCase(),
                    style: const TextStyle(
                      color: NeraColors.gold,
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      letterSpacing: .6,
                    ),
                  ),
                  Text(
                    purchase.productName,
                    style: Theme.of(context).textTheme.titleMedium,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (purchase.brand != null)
                    Text(
                      purchase.brand!,
                      style: const TextStyle(color: NeraColors.muted),
                    ),
                  if (purchase.sizeLabel != null || purchase.colorLabel != null)
                    Text(
                      [
                        purchase.sizeLabel,
                        purchase.colorLabel,
                      ].whereType<String>().join(' · '),
                      style: const TextStyle(
                        color: NeraColors.muted,
                        fontSize: 12,
                      ),
                    ),
                  if (purchase.deliveredAt != null)
                    Text(
                      'Delivered ${_formatDate(purchase.deliveredAt!)}',
                      style: const TextStyle(
                        color: NeraColors.muted,
                        fontSize: 12,
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: NeraButton(
                label: 'Ignore',
                style: NeraButtonStyleType.secondary,
                onPressed: busy ? null : onIgnore,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: NeraButton(
                label: 'Add to Wardrobe',
                loading: busy,
                onPressed: busy ? null : onAdd,
              ),
            ),
          ],
        ),
      ],
    ),
  );
}

/// Small pill shown on a wardrobe item's grid card while it's flagged
/// [WardrobeItem.isNew] — cleared once its detail view is opened (see
/// _WardrobeScreenState._openItemDetail).
class _NewBadge extends StatelessWidget {
  const _NewBadge();

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
    decoration: BoxDecoration(
      gradient: NeraColors.goldGradient,
      borderRadius: BorderRadius.circular(999),
    ),
    child: const Text(
      'NEW',
      style: TextStyle(
        color: NeraColors.background,
        fontSize: 10,
        fontWeight: FontWeight.w700,
        letterSpacing: .6,
      ),
    ),
  );
}

/// Full detail view for one wardrobe item, opened by tapping its grid card.
/// Opening this is what clears the item's "NEW" badge — see
/// _WardrobeScreenState._openItemDetail, which calls markWardrobeItemViewed
/// before this sheet is shown.
class _WardrobeItemDetailSheet extends StatelessWidget {
  const _WardrobeItemDetailSheet({required this.item});

  final WardrobeItem item;

  String _marketplaceLabel(String marketplace) => switch (marketplace) {
    'amazon' => 'Amazon',
    'flipkart' => 'Flipkart',
    'myntra' => 'Myntra',
    'ajio' => 'Ajio',
    'meesho' => 'Meesho',
    _ => 'a marketplace purchase',
  };

  @override
  Widget build(BuildContext context) => SafeArea(
    top: false,
    child: Padding(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(NeraRadius.md),
            child: SizedBox(
              height: 280,
              width: double.infinity,
              child: WardrobeItemImage(item: item),
            ),
          ),
          const SizedBox(height: NeraSpacing.lg),
          if (item.sourceMarketplace != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                'DETECTED FROM ${_marketplaceLabel(item.sourceMarketplace!).toUpperCase()}',
                style: const TextStyle(
                  color: NeraColors.gold,
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  letterSpacing: .6,
                ),
              ),
            ),
          Text(item.name, style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 4),
          Text(item.category, style: Theme.of(context).textTheme.bodyLarge),
          if (item.tags.isNotEmpty) ...[
            const SizedBox(height: NeraSpacing.lg),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [for (final tag in item.tags) Chip(label: Text(tag))],
            ),
          ],
        ],
      ),
    ),
  );
}
