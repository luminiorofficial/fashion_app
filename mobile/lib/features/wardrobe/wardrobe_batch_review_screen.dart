import 'package:flutter/material.dart';

import '../../core/theme/theme.dart';
import '../../core/widgets/widgets.dart';
import '../../models/nera_models.dart';

/// One review screen for every analyzed wardrobe draft from a batch upload,
/// each row editable in place. Saving happens once, for every kept item,
/// rather than confirming item-by-item.
///
/// Per-row state below is keyed by list index rather than by draft id: a
/// backend is only required to hand back an id that's unique *within* one
/// analyze call, not necessarily unique across the whole batch (the preview
/// backend, for example, always returns the same fixed draft id), so index
/// keys are the only safe choice here.
class WardrobeBatchReviewScreen extends StatefulWidget {
  const WardrobeBatchReviewScreen({super.key, required this.drafts});

  final List<WardrobeDraft> drafts;

  /// Returns the edited drafts the user chose to keep, or an empty list if
  /// they closed the screen without saving. The caller is responsible for
  /// discarding every draft that isn't in the result.
  static Future<List<WardrobeDraft>> review(
    BuildContext context,
    List<WardrobeDraft> drafts,
  ) async {
    final result = await Navigator.of(context).push<List<WardrobeDraft>>(
      MaterialPageRoute(
        builder: (context) => WardrobeBatchReviewScreen(drafts: drafts),
      ),
    );
    return result ?? const [];
  }

  @override
  State<WardrobeBatchReviewScreen> createState() =>
      _WardrobeBatchReviewScreenState();
}

class _WardrobeBatchReviewScreenState
    extends State<WardrobeBatchReviewScreen> {
  late final List<TextEditingController> _names = [
    for (final draft in widget.drafts) TextEditingController(text: draft.name),
  ];
  late final List<String> _categories = [
    for (final draft in widget.drafts)
      wardrobeCategories.contains(draft.category)
          ? draft.category
          : 'Accessory',
  ];
  final Set<int> _removedIndexes = {};

  int get _keptCount => widget.drafts.length - _removedIndexes.length;

  @override
  void dispose() {
    for (final controller in _names) {
      controller.dispose();
    }
    super.dispose();
  }

  void _save() {
    final result = <WardrobeDraft>[
      for (var index = 0; index < widget.drafts.length; index += 1)
        if (!_removedIndexes.contains(index))
          widget.drafts[index].copyWith(
            name: _names[index].text.trim().isEmpty
                ? widget.drafts[index].name
                : _names[index].text.trim(),
            category: _categories[index],
          ),
    ];
    Navigator.of(context).pop(result);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text('Review ${widget.drafts.length} items')),
    body: SafeArea(
      child: Column(
        children: [
          Expanded(
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
              itemCount: widget.drafts.length,
              separatorBuilder: (_, _) =>
                  const SizedBox(height: NeraSpacing.md),
              itemBuilder: (context, index) {
                final draft = widget.drafts[index];
                final removed = _removedIndexes.contains(index);
                return Opacity(
                  opacity: removed ? .4 : 1,
                  child: NeraCard(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SizedBox(
                          width: 72,
                          height: 72,
                          child: NeraNetworkImage(
                            url: draft.imageUrl,
                            radius: NeraRadius.sm,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              TextField(
                                controller: _names[index],
                                enabled: !removed,
                                decoration: const InputDecoration(
                                  labelText: 'Item name',
                                  isDense: true,
                                ),
                              ),
                              const SizedBox(height: 8),
                              DropdownButtonFormField<String>(
                                initialValue: _categories[index],
                                isDense: true,
                                decoration: const InputDecoration(
                                  labelText: 'Category',
                                  isDense: true,
                                ),
                                items: [
                                  for (final value in wardrobeCategories)
                                    DropdownMenuItem(
                                      value: value,
                                      child: Text(value),
                                    ),
                                ],
                                onChanged: removed
                                    ? null
                                    : (value) => setState(
                                        () => _categories[index] =
                                            value ?? _categories[index],
                                      ),
                              ),
                              if (draft.containsPerson && !removed) ...[
                                const SizedBox(height: 8),
                                Row(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.start,
                                  children: [
                                    const Icon(
                                      Icons.info_outline_rounded,
                                      size: 16,
                                      color: NeraColors.gold,
                                    ),
                                    const SizedBox(width: 6),
                                    Expanded(
                                      child: Text(
                                        'This item can be used for styling. '
                                        'Add a product-only photo to use it '
                                        'for Virtual Try-On.',
                                        style: Theme.of(
                                          context,
                                        ).textTheme.labelSmall,
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ],
                          ),
                        ),
                        IconButton(
                          tooltip: removed
                              ? 'Include ${draft.name}'
                              : 'Remove ${draft.name}',
                          icon: Icon(
                            removed
                                ? Icons.add_circle_outline_rounded
                                : Icons.close_rounded,
                          ),
                          onPressed: () => setState(
                            () => removed
                                ? _removedIndexes.remove(index)
                                : _removedIndexes.add(index),
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
            child: NeraButton(
              label: _keptCount == 0
                  ? 'No items selected'
                  : 'Save All ($_keptCount)',
              icon: Icons.checkroom_rounded,
              onPressed: _keptCount == 0 ? null : _save,
            ),
          ),
        ],
      ),
    ),
  );
}
