import 'package:flutter/material.dart';

import '../../core/theme/theme.dart';
import '../../models/nera_models.dart';

class OccasionGrid extends StatelessWidget {
  const OccasionGrid({
    super.key,
    required this.onSelected,
    this.enabled = true,
    this.selected,
  });
  final ValueChanged<OccasionType> onSelected;
  final bool enabled;
  final OccasionType? selected;

  @override
  Widget build(BuildContext context) => GridView.builder(
    shrinkWrap: true,
    physics: const NeverScrollableScrollPhysics(),
    itemCount: OccasionType.values.length,
    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
      crossAxisCount: 3,
      mainAxisSpacing: 10,
      crossAxisSpacing: 10,
      childAspectRatio: 1.05,
    ),
    itemBuilder: (context, index) {
      final occasion = OccasionType.values[index];
      final isSelected = occasion == selected;
      final iconColor = !enabled
          ? NeraColors.muted
          : isSelected
          ? NeraColors.onInk
          : NeraColors.textPrimary;
      return AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        decoration: BoxDecoration(
          color: isSelected ? NeraColors.ink : NeraColors.surface,
          borderRadius: BorderRadius.circular(NeraRadius.md),
          border: Border.all(
            color: isSelected ? NeraColors.ink : NeraColors.surfaceBorder,
          ),
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(NeraRadius.md),
            onTap: enabled ? () => onSelected(occasion) : null,
            child: Padding(
              padding: const EdgeInsets.all(NeraSpacing.sm),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(occasion.icon, color: iconColor, size: 25),
                  const SizedBox(height: 8),
                  Text(
                    occasion.label,
                    textAlign: TextAlign.center,
                    maxLines: 1,
                    style: Theme.of(context).textTheme.labelLarge?.copyWith(
                      color: !enabled
                          ? NeraColors.muted
                          : isSelected
                          ? NeraColors.onInk
                          : NeraColors.textPrimary,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    },
  );
}
