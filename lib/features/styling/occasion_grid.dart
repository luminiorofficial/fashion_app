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
      return AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        decoration: BoxDecoration(
          color: isSelected
              ? occasion.accentColor.withValues(alpha: .14)
              : NeraColors.surfaceElevated,
          borderRadius: BorderRadius.circular(NeraRadius.md),
          border: Border.all(
            color: isSelected ? occasion.accentColor : NeraColors.surfaceBorder,
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
                  Icon(
                    occasion.icon,
                    color: enabled ? occasion.accentColor : NeraColors.muted,
                    size: 25,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    occasion.label,
                    textAlign: TextAlign.center,
                    maxLines: 1,
                    style: Theme.of(context).textTheme.labelLarge?.copyWith(
                      color: enabled
                          ? NeraColors.textPrimary
                          : NeraColors.muted,
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
