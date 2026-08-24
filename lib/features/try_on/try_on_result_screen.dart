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
            : 'Re-upload photo for ${invalidItem.name} to use Virtual Try-On.',
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

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final saved = await widget.backend.saveTryOnLook(_result.id);
      if (mounted) {
        setState(() => _result = _result.copyWith(isSaved: saved.isSaved));
        showNeraSnackBar(context, 'Look saved.');
      }
    } catch (error) {
      if (mounted) showNeraSnackBar(context, friendlyError(error), error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
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
    final next = _selectedIds.where((id) => !categoryIds.contains(id)).toList()
      ..add(replacement.id);
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
          tooltip: 'Save Look',
          onPressed: _saving || _result.isSaved ? null : _save,
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
                                    ? 'Look Saved'
                                    : 'Save Look',
                                icon: _result.isSaved
                                    ? Icons.check_rounded
                                    : Icons.bookmark_add_rounded,
                                loading: _saving,
                                onPressed: _result.isSaved ? null : _save,
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
                        const SizedBox(height: 10),
                        SingleChildScrollView(
                          scrollDirection: Axis.horizontal,
                          child: Row(
                            children: [
                              _SwapButton(
                                label: 'Swap Top',
                                icon: Icons.checkroom_rounded,
                                onTap: () => _swap('Top', 'Swap Top'),
                              ),
                              _SwapButton(
                                label: 'Swap Bottom',
                                icon: Icons.dry_cleaning_rounded,
                                onTap: () => _swap('Bottom', 'Swap Bottom'),
                              ),
                              _SwapButton(
                                label: 'Change Shoes',
                                icon: Icons.ice_skating_rounded,
                                onTap: () => _swap('Shoes', 'Change Shoes'),
                              ),
                            ],
                          ),
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
