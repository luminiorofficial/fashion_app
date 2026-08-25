import 'package:flutter/material.dart';

import '../../core/errors/friendly_error.dart';
import '../../core/theme/theme.dart';
import '../../core/widgets/widgets.dart';
import '../../models/nera_models.dart';
import '../../services/nera_backend.dart';
import '../wardrobe/wardrobe_item_image.dart';

class TryOnResultScreen extends StatefulWidget {
  const TryOnResultScreen({
    super.key,
    required this.backend,
    required this.initialResult,
    required this.wardrobe,
  });

  final NeraBackend backend;
  final TryOnResult initialResult;
  final List<WardrobeItem> wardrobe;

  @override
  State<TryOnResultScreen> createState() => _TryOnResultScreenState();
}

class _TryOnResultScreenState extends State<TryOnResultScreen> {
  late TryOnResult _result = widget.initialResult;
  late List<String> _selectedIds = List.of(
    widget.initialResult.wardrobeItemIds,
  );
  bool _regenerating = false;
  bool _saving = false;
  String? _error;
  int _imageAttempt = 0;

  Future<void> _regenerate({List<String>? ids}) async {
    final nextIds = ids ?? _selectedIds;
    final invalidItem = widget.wardrobe
        .where((item) => nextIds.contains(item.id))
        .where((item) => !item.canUseVirtualTryOn)
        .firstOrNull;
    final validIds = widget.wardrobe
        .where((item) => nextIds.contains(item.id) && item.canUseVirtualTryOn)
        .map((item) => item.id)
        .toList();
    if (invalidItem != null || validIds.length != nextIds.toSet().length) {
      setState(
        () => _error = invalidItem == null
            ? 'One or more selected wardrobe items are unavailable. Choose another item.'
            : invalidItem.tryOnBlockedReason,
      );
      return;
    }
    setState(() {
      _regenerating = true;
      _error = null;
    });
    try {
      final result = await widget.backend.generateTryOn(
        wardrobeItemIds: validIds,
        outfitId: _result.outfitId,
      );
      _validate(result);
      if (mounted) {
        setState(() {
          _result = result;
          _selectedIds = List.of(validIds);
          _imageAttempt += 1;
        });
      }
    } catch (error) {
      if (mounted) setState(() => _error = friendlyError(error));
    } finally {
      if (mounted) setState(() => _regenerating = false);
    }
  }

  Future<void> _toggleSave() async {
    final wasSaved = _result.isSaved;
    setState(() => _saving = true);
    try {
      final updated = wasSaved
          ? await widget.backend.unsaveTryOnLook(_result.id)
          : await widget.backend.saveTryOnLook(_result.id);
      if (mounted) {
        setState(() => _result = _result.copyWith(isSaved: updated.isSaved));
        showNeraSnackBar(context, wasSaved ? 'Look removed.' : 'Look saved.');
      }
    } catch (error) {
      if (mounted) showNeraSnackBar(context, friendlyError(error), error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  List<WardrobeItem> get _selectedItems => widget.wardrobe
      .where((item) => _selectedIds.contains(item.id))
      .toList();

  bool _isWearing(String category) => _selectedItems.any(
    (item) => item.category.toLowerCase() == category.toLowerCase(),
  );

  bool get _hasDress => _isWearing('Dress');

  bool get _hasLayer => _isWearing('Outerwear');

  /// Keeps a look from wearing a Dress and a Top/Bottom at once. A Dress
  /// always replaces any Top/Bottom; picking a Top or Bottom while a Dress
  /// is on drops the Dress and pulls in a compatible counterpart so the
  /// look never ends up half-dressed.
  ///
  /// Returns null when [category] is Top/Bottom, a Dress was on, and no
  /// eligible counterpart exists in the wardrobe to complete the look —
  /// callers should abort the swap in that case.
  List<String>? _applyCompatibility(List<String> ids, String category) {
    final byId = {for (final item in widget.wardrobe) item.id: item};
    String? categoryOf(String id) => byId[id]?.category.toLowerCase();
    final normalized = category.toLowerCase();
    final next = ids.toList();

    if (normalized == 'dress') {
      next.removeWhere((id) {
        final c = categoryOf(id);
        return c == 'top' || c == 'bottom';
      });
      return next;
    }

    if (normalized == 'top' || normalized == 'bottom') {
      final hadDress = next.any((id) => categoryOf(id) == 'dress');
      if (!hadDress) return next;
      next.removeWhere((id) => categoryOf(id) == 'dress');
      final otherCategory = normalized == 'top' ? 'bottom' : 'top';
      if (next.any((id) => categoryOf(id) == otherCategory)) return next;
      final fallback = widget.wardrobe
          .where(
            (item) =>
                item.category.toLowerCase() == otherCategory &&
                item.canUseVirtualTryOn,
          )
          .firstOrNull;
      if (fallback == null) {
        setState(
          () => _error =
              'Add a ${otherCategory[0].toUpperCase()}${otherCategory.substring(1)} '
              'to your wardrobe to complete this look.',
        );
        return null;
      }
      next.add(fallback.id);
      return next;
    }

    return next;
  }

  Future<void> _swap(String category, String label) async {
    final options = widget.wardrobe
        .where(
          (item) =>
              item.category.toLowerCase() == category.toLowerCase() &&
              item.canUseVirtualTryOn &&
              !_selectedIds.contains(item.id),
        )
        .toList();
    if (options.isEmpty) {
      setState(
        () => _error =
            'Add another $category to your wardrobe before using $label.',
      );
      return;
    }
    final replacement = await showModalBottomSheet<WardrobeItem>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: NeraSpacing.md),
              SizedBox(
                height: 150,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: options.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 12),
                  itemBuilder: (context, index) {
                    final item = options[index];
                    return GestureDetector(
                      onTap: () => Navigator.pop(context, item),
                      child: SizedBox(
                        width: 108,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            WardrobeItemImage(item: item, size: 108),
                            const SizedBox(height: 6),
                            Text(
                              item.name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
    if (replacement == null) return;
    final categoryIds = widget.wardrobe
        .where((item) => item.category.toLowerCase() == category.toLowerCase())
        .map((item) => item.id)
        .toSet();
    final withReplacement =
        _selectedIds.where((id) => !categoryIds.contains(id)).toList()
          ..add(replacement.id);
    final next = _applyCompatibility(withReplacement, category);
    if (next == null) return;
    await _regenerate(ids: next);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    extendBodyBehindAppBar: true,
    appBar: AppBar(
      backgroundColor: Colors.black.withValues(alpha: .25),
      title: const Text('Virtual Try-On'),
      actions: [
        IconButton(
          tooltip: _result.isSaved ? 'Remove Look' : 'Save Look',
          onPressed: _saving ? null : _toggleSave,
          icon: Icon(
            _result.isSaved
                ? Icons.bookmark_rounded
                : Icons.bookmark_border_rounded,
          ),
        ),
      ],
    ),
    body: Stack(
      children: [
        Positioned.fill(
          child: _TryOnImage(
            key: ValueKey('${_result.imageUrl}-$_imageAttempt'),
            url: _result.imageUrl,
            onRetry: () => setState(() => _imageAttempt += 1),
          ),
        ),
        Positioned.fill(
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Colors.black.withValues(alpha: .45),
                  Colors.transparent,
                  Colors.black.withValues(alpha: .92),
                ],
                stops: const [0, .42, 1],
              ),
            ),
          ),
        ),
        SafeArea(
          child: Align(
            alignment: Alignment.bottomCenter,
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 90, 16, 20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (_error != null)
                    Container(
                      margin: const EdgeInsets.only(bottom: 12),
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: NeraColors.errorSurface,
                        borderRadius: BorderRadius.circular(NeraRadius.md),
                      ),
                      child: Row(
                        children: [
                          const Icon(
                            Icons.error_outline_rounded,
                            color: NeraColors.error,
                          ),
                          const SizedBox(width: 10),
                          Expanded(child: Text(_error!)),
                          IconButton(
                            onPressed: () => setState(() => _error = null),
                            icon: const Icon(Icons.close_rounded),
                          ),
                        ],
                      ),
                    ),
                  NeraCard(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: NeraButton(
                                label: _result.isSaved
                                    ? 'Remove from Saved'
                                    : 'Save Look',
                                icon: _result.isSaved
                                    ? Icons.bookmark_remove_rounded
                                    : Icons.bookmark_add_rounded,
                                loading: _saving,
                                onPressed: _toggleSave,
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: NeraButton(
                                label: 'Try Another Look',
                                icon: Icons.refresh_rounded,
                                loading: _regenerating,
                                style: NeraButtonStyleType.secondary,
                                onPressed: () => _regenerate(),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 14),
                        Align(
                          alignment: Alignment.centerLeft,
                          child: Padding(
                            padding: const EdgeInsets.only(
                              bottom: 8,
                              left: 2,
                            ),
                            child: Text(
                              'Restyle this look',
                              style: Theme.of(context).textTheme.labelSmall,
                            ),
                          ),
                        ),
                        SingleChildScrollView(
                          scrollDirection: Axis.horizontal,
                          child: Row(children: _restyleButtons()),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        if (_regenerating)
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
                      Text(
                        'Creating your new look…',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
      ],
    ),
  );

  /// The look wears either a Dress or a Top+Bottom pair, never both, so the
  /// restyle actions only ever offer the piece(s) actually on the model.
  List<Widget> _restyleButtons() {
    final layerLabel = _hasLayer ? 'Change Layer' : 'Add Layer';
    if (_hasDress) {
      return [
        _SwapButton(
          label: 'Change Dress',
          icon: Icons.checkroom_rounded,
          onTap: () => _swap('Dress', 'Change Dress'),
        ),
        _SwapButton(
          label: 'Change Shoes',
          icon: Icons.ice_skating_rounded,
          onTap: () => _swap('Shoes', 'Change Shoes'),
        ),
        _SwapButton(
          label: layerLabel,
          icon: Icons.layers_rounded,
          onTap: () => _swap('Outerwear', layerLabel),
        ),
        _SwapButton(
          label: 'Accessories',
          icon: Icons.diamond_outlined,
          onTap: () => _swap('Accessory', 'Accessories'),
        ),
      ];
    }
    return [
      _SwapButton(
        label: 'Change Top',
        icon: Icons.checkroom_rounded,
        onTap: () => _swap('Top', 'Change Top'),
      ),
      _SwapButton(
        label: 'Change Bottom',
        icon: Icons.dry_cleaning_rounded,
        onTap: () => _swap('Bottom', 'Change Bottom'),
      ),
      _SwapButton(
        label: 'Change Shoes',
        icon: Icons.ice_skating_rounded,
        onTap: () => _swap('Shoes', 'Change Shoes'),
      ),
      _SwapButton(
        label: layerLabel,
        icon: Icons.layers_rounded,
        onTap: () => _swap('Outerwear', layerLabel),
      ),
    ];
  }
}

void _validate(TryOnResult result) {
  if (result.developmentFallback ||
      result.imageUrl.trim().isEmpty ||
      result.status != 'completed') {
    throw const NeraException(
      'Virtual try-on is unavailable. The service did not generate a new image.',
    );
  }
}

class _TryOnImage extends StatelessWidget {
  const _TryOnImage({super.key, required this.url, required this.onRetry});
  final String url;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Image.network(
    url,
    fit: BoxFit.cover,
    frameBuilder: (context, child, frame, synchronous) {
      if (synchronous || frame != null) return child;
      return const ColoredBox(
        color: NeraColors.background,
        child: Center(child: CircularProgressIndicator()),
      );
    },
    errorBuilder: (context, error, stackTrace) => ColoredBox(
      color: NeraColors.background,
      child: Center(
        child: NeraErrorState(
          title: 'Generated image unavailable',
          message:
              'The try-on image could not be loaded. Check your connection and retry.',
          onRetry: onRetry,
        ),
      ),
    ),
  );
}

class _SwapButton extends StatelessWidget {
  const _SwapButton({
    required this.label,
    required this.icon,
    required this.onTap,
  });
  final String label;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(right: 8),
    child: ActionChip(
      avatar: Icon(icon, size: 17),
      label: Text(label),
      onPressed: onTap,
    ),
  );
}
