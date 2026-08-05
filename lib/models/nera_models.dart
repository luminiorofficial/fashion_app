const wardrobeCategories = <String>[
  'Top',
  'Bottom',
  'Outerwear',
  'Shoes',
  'Accessory',
  'Dress',
];

class NeraUser {
  const NeraUser({
    required this.id,
    required this.name,
    required this.dateOfBirth,
    required this.phoneNumber,
  });
  final String id;
  final String name;
  final String dateOfBirth;
  final String phoneNumber;

  factory NeraUser.fromJson(Map<String, dynamic> json) => NeraUser(
    id: json['id'] as String,
    name: json['name'] as String,
    dateOfBirth: json['dateOfBirth'] as String,
    phoneNumber: json['phoneNumber'] as String,
  );
}

class OtpChallenge {
  const OtpChallenge({required this.id, this.developmentOtp});
  final String id;
  final String? developmentOtp;
}

class WardrobeItem {
  const WardrobeItem({
    required this.id,
    required this.name,
    required this.category,
    required this.imageUrl,
    required this.imagePath,
    this.productUrl,
    this.sourceType = 'upload',
    this.tags = const [],
    this.createdAt,
  });
  final String id;
  final String name;
  final String category;
  final String imageUrl;
  final String imagePath;
  final String? productUrl;
  final String sourceType;
  final List<String> tags;
  final DateTime? createdAt;

  factory WardrobeItem.fromJson(Map<String, dynamic> json) => WardrobeItem(
    id: json['id'] as String,
    name: json['name'] as String? ?? 'Wardrobe item',
    category: json['category'] as String? ?? 'Accessory',
    imageUrl: json['imageUrl'] as String? ?? '',
    imagePath: '',
    productUrl: json['productUrl'] as String?,
    sourceType: json['sourceType'] as String? ?? 'upload',
    tags: List<String>.from(json['tags'] as List? ?? const []),
    createdAt: DateTime.tryParse(json['createdAt'] as String? ?? ''),
  );
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
    this.skinUndertone,
    this.hairColor,
    this.facialStructure,
    this.styleAttributes = const [],
    this.stylingNotes,
    this.preferredStyles = const [],
    this.updatedAt,
  });
  final String? bodyType;
  final String? skinTone;
  final String? skinUndertone;
  final String? hairColor;
  final String? facialStructure;
  final List<String> styleAttributes;
  final String? stylingNotes;
  final List<String> preferredStyles;
  final DateTime? updatedAt;

  bool get isAnalyzed =>
      bodyType?.trim().isNotEmpty == true &&
      skinTone?.trim().isNotEmpty == true;

  factory StyleProfile.fromJson(Map<String, dynamic>? json) {
    json ??= const {};
    return StyleProfile(
      bodyType: json['bodyType'] as String?,
      skinTone: json['skinTone'] as String?,
      skinUndertone: json['skinUndertone'] as String?,
      hairColor: json['hairColor'] as String?,
      facialStructure: json['facialStructure'] as String?,
      styleAttributes: List<String>.from(
        json['styleAttributes'] as List? ?? const [],
      ),
      stylingNotes: json['stylingNotes'] as String?,
      preferredStyles: List<String>.from(
        json['preferredStyles'] as List? ?? const [],
      ),
      updatedAt: DateTime.tryParse(json['updatedAt'] as String? ?? ''),
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
