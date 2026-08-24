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
    this.productUrl,
    this.sourceType = 'upload',
    this.imageStorageProvider,
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
  final String? imageStorageProvider;
  final List<String> tags;
  final DateTime? createdAt;

  bool get hasPhoto => imageUrl.isNotEmpty || imagePath.isNotEmpty;

  /// Production try-on can only fetch assets that the database identifies as
  /// Cloudinary objects. A syntactically valid URL is not proof that a legacy
  /// local/R2 object still exists in the active store.
  bool get canUseVirtualTryOn {
    if (sourceType != 'upload' || imageStorageProvider != 'cloudinary') {
      return false;
    }
    final uri = Uri.tryParse(imageUrl.trim());
    return uri != null &&
        (uri.scheme == 'http' || uri.scheme == 'https') &&
        uri.host.isNotEmpty;
  }

  factory WardrobeItem.fromJson(Map<String, dynamic> json) => WardrobeItem(
    id: json['id'] as String,
    name: json['name'] as String? ?? 'Wardrobe item',
    category: json['category'] as String? ?? 'Accessory',
    imageUrl: json['imageUrl'] as String? ?? '',
    imagePath: '',
    productUrl: json['productUrl'] as String?,
    sourceType: json['sourceType'] as String? ?? 'upload',
    imageStorageProvider: json['imageStorageProvider'] as String?,
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
    this.analysisJobId,
  });
  final String id;
  final String name;
  final String category;
  final String imageUrl;
  final String imagePath;
  final List<String> tags;
  final String? analysisJobId;

  WardrobeDraft copyWith({String? name, String? category}) => WardrobeDraft(
    id: id,
    name: name ?? this.name,
    category: category ?? this.category,
    imageUrl: imageUrl,
    imagePath: imagePath,
    tags: tags,
    analysisJobId: analysisJobId,
  );
}
