import 'package:flutter/material.dart';

import '../core/theme/nera_colors.dart';

/// The four reactions NERA learns from, plus the separate "I wore this"
/// signal captured on [OutfitFeedback.wornAt]. Matches the server's
/// `outfit_reaction` enum exactly.
enum OutfitReaction {
  loveIt('love_it', 'Love It', '\u2764\uFE0F', NeraColors.loveIt),
  wouldWear('would_wear', 'Would Wear', '\u{1F44D}', NeraColors.wouldWear),
  notSure('not_sure', 'Not Sure', '\u{1F610}', NeraColors.notSure),
  notMyStyle(
    'not_my_style',
    'Not My Style',
    '\u{1F44E}',
    NeraColors.notMyStyle,
  );

  const OutfitReaction(this.wireValue, this.label, this.emoji, this.color);
  final String wireValue;
  final String label;
  final String emoji;
  final Color color;

  static OutfitReaction? fromWire(String? value) {
    for (final reaction in OutfitReaction.values) {
      if (reaction.wireValue == value) return reaction;
    }
    return null;
  }
}

class OutfitFeedback {
  const OutfitFeedback({required this.outfitId, this.reaction, this.wornAt});

  final String outfitId;
  final OutfitReaction? reaction;
  final DateTime? wornAt;

  bool get hasBeenWorn => wornAt != null;

  OutfitFeedback copyWith({OutfitReaction? reaction, DateTime? wornAt}) =>
      OutfitFeedback(
        outfitId: outfitId,
        reaction: reaction ?? this.reaction,
        wornAt: wornAt ?? this.wornAt,
      );

  factory OutfitFeedback.fromJson(Map<String, dynamic> json) => OutfitFeedback(
    outfitId: json['outfitId'] as String,
    reaction: OutfitReaction.fromWire(json['reaction'] as String?),
    wornAt: json['wornAt'] != null
        ? DateTime.tryParse(json['wornAt'] as String)
        : null,
  );
}
