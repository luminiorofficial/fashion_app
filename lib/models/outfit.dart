import 'package:flutter/material.dart';

import 'feedback.dart';

/// The nine occasions NERA styles for today. Every occasion picker in the
/// app (Home's "Dress Me Today" grid and the Styling screen) is driven by
/// this single enum so the set never drifts between screens.
enum OccasionType {
  office('Office', Icons.business_center_rounded, Color(0xFF9BBFE8)),
  meeting('Meeting', Icons.groups_rounded, Color(0xFFB39DDB)),
  casual('Casual', Icons.weekend_rounded, Color(0xFFFFD166)),
  date('Date', Icons.favorite_rounded, Color(0xFFE86B8A)),
  party('Party', Icons.celebration_rounded, Color(0xFFFF8A65)),
  wedding('Wedding', Icons.diamond_rounded, Color(0xFFE3B872)),
  travel('Travel', Icons.flight_takeoff_rounded, Color(0xFF7FD8C8)),
  dinner('Dinner', Icons.restaurant_rounded, Color(0xFFC79A5B)),
  other('Other', Icons.auto_awesome_rounded, Color(0xFF8B8D98));

  const OccasionType(this.label, this.icon, this.accentColor);
  final String label;
  final IconData icon;
  final Color accentColor;

  static OccasionType? fromLabel(String label) {
    for (final event in OccasionType.values) {
      if (event.label == label) return event;
    }
    return null;
  }
}

class SuggestedPurchase {
  const SuggestedPurchase({required this.name, required this.type, this.buyUrl});
  final String name;
  final String type;
  final String? buyUrl;

  factory SuggestedPurchase.fromMap(Map<String, dynamic> data) => SuggestedPurchase(
    name: data['name'] as String? ?? 'Complementary piece',
    type: data['type'] as String? ?? 'Accessory',
    buyUrl: data['buyUrl'] as String?,
  );

  Map<String, dynamic> toMap() => {
    'name': name,
    'type': type,
    if (buyUrl != null) 'buyUrl': buyUrl,
  };
}

class OutfitPlan {
  const OutfitPlan({
    required this.id,
    required this.eventType,
    required this.wardrobeItemIds,
    required this.rationale,
    this.suggestedPurchaseItem,
    this.matchScore,
    this.feedback,
    this.createdAt,
  });
  final String id;
  final String eventType;
  final List<String> wardrobeItemIds;
  final String rationale;
  final SuggestedPurchase? suggestedPurchaseItem;
  final int? matchScore;
  final OutfitFeedback? feedback;
  final DateTime? createdAt;

  OutfitPlan copyWith({OutfitFeedback? feedback}) => OutfitPlan(
    id: id,
    eventType: eventType,
    wardrobeItemIds: wardrobeItemIds,
    rationale: rationale,
    suggestedPurchaseItem: suggestedPurchaseItem,
    matchScore: matchScore,
    feedback: feedback ?? this.feedback,
    createdAt: createdAt,
  );

  factory OutfitPlan.fromJson(Map<String, dynamic> json) => OutfitPlan(
    id: json['id'] as String,
    eventType: json['eventType'] as String? ?? '',
    wardrobeItemIds: List<String>.from(json['wardrobeItemIds'] as List? ?? const []),
    rationale: json['rationale'] as String? ?? '',
    suggestedPurchaseItem: json['suggestedPurchaseItem'] != null
        ? SuggestedPurchase.fromMap(json['suggestedPurchaseItem'] as Map<String, dynamic>)
        : null,
    matchScore: json['matchScore'] as int?,
    feedback: json['feedback'] != null
        ? OutfitFeedback.fromJson(json['feedback'] as Map<String, dynamic>)
        : null,
    createdAt: DateTime.tryParse(json['createdAt'] as String? ?? ''),
  );
}
