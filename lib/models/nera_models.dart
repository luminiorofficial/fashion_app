import 'package:cloud_firestore/cloud_firestore.dart';

const neraAppId = 'nera-mobile';

const wardrobeCategories = <String>[
  'Top',
  'Bottom',
  'Outerwear',
  'Shoes',
  'Accessory',
  'Dress',
];

class WardrobeItem {
  const WardrobeItem({
    required this.id,
    required this.name,
    required this.category,
    required this.imageUrl,
    required this.imagePath,
    this.tags = const [],
    this.createdAt,
  });

  final String id;
  final String name;
  final String category;
  final String imageUrl;
  final String imagePath;
  final List<String> tags;
  final DateTime? createdAt;

  factory WardrobeItem.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> snapshot,
  ) {
    final data = snapshot.data() ?? const <String, dynamic>{};
    return WardrobeItem(
      id: snapshot.id,
      name: data['name'] as String? ?? 'Wardrobe item',
      category: data['category'] as String? ?? 'Accessory',
      imageUrl: data['imageUrl'] as String? ?? '',
      imagePath: data['imagePath'] as String? ?? '',
      tags: List<String>.from(data['tags'] as List? ?? const []),
      createdAt: (data['createdAt'] as Timestamp?)?.toDate(),
    );
  }
}

class WardrobeDraft {
  const WardrobeDraft({
    required this.id,
    required this.name,
    required this.category,
    required this.imageUrl,
    required this.imagePath,
    this.tags = const [],
  });

  final String id;
  final String name;
  final String category;
  final String imageUrl;
  final String imagePath;
  final List<String> tags;

  WardrobeDraft copyWith({String? name, String? category}) => WardrobeDraft(
    id: id,
    name: name ?? this.name,
    category: category ?? this.category,
    imageUrl: imageUrl,
    imagePath: imagePath,
    tags: tags,
  );
}

class StyleProfile {
  const StyleProfile({
    this.bodyType,
    this.skinTone,
    this.preferredStyles = const [],
    this.updatedAt,
  });

  final String? bodyType;
  final String? skinTone;
  final List<String> preferredStyles;
  final DateTime? updatedAt;

  bool get isAnalyzed =>
      bodyType?.trim().isNotEmpty == true &&
      skinTone?.trim().isNotEmpty == true;

  factory StyleProfile.fromMap(Map<String, dynamic>? data) {
    data ??= const <String, dynamic>{};
    return StyleProfile(
      bodyType: data['bodyType'] as String?,
      skinTone: data['skinTone'] as String?,
      preferredStyles: List<String>.from(
        data['preferredStyles'] as List? ?? const [],
      ),
      updatedAt: (data['updatedAt'] as Timestamp?)?.toDate(),
    );
  }
}

class SuggestedPurchase {
  const SuggestedPurchase({
    required this.name,
    required this.type,
    this.buyUrl,
  });

  final String name;
  final String type;
  final String? buyUrl;

  factory SuggestedPurchase.fromMap(Map<String, dynamic> data) =>
      SuggestedPurchase(
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
    this.createdAt,
  });

  final String id;
  final String eventType;
  final List<String> wardrobeItemIds;
  final String rationale;
  final SuggestedPurchase? suggestedPurchaseItem;
  final DateTime? createdAt;
}

class PickedImageData {
  const PickedImageData({required this.bytes, required this.fileName});

  final List<int> bytes;
  final String fileName;
}
