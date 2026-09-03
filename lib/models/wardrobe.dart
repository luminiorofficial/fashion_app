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
    this.containsPerson = false,
    this.garmentVisibility = 'full',
    this.virtualTryOnEligible = true,
    this.sourceMarketplace,
    this.isNew = false,
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

  /// True when the photo shows a person/model wearing the item rather than a
  /// clean product-only shot. The item is still saved and usable for outfit
  /// recommendations either way.
  final bool containsPerson;

  /// How cleanly the garment itself is visible in the photo: 'full',
  /// 'partial', or 'occluded'.
  final String garmentVisibility;

  /// Whether the AI judged this exact stored photo safe to send directly to
  /// Virtual Try-On (always false when [containsPerson] is true, since
  /// there's no garment-isolation step to crop a person out of the shot).
  final bool virtualTryOnEligible;

  /// Which marketplace this item was imported from via a detected Gmail
  /// purchase (e.g. 'amazon'), or null for a manually photographed/linked
  /// item.
  final String? sourceMarketplace;

  /// True until the item's detail view has been opened once — drives the
  /// "NEW" badge. Always false when [sourceMarketplace] is null.
  final bool isNew;
  final DateTime? createdAt;

  bool get hasPhoto => imageUrl.isNotEmpty || imagePath.isNotEmpty;

  /// Production try-on can only fetch assets that the database identifies as
  /// Cloudinary objects, and only for photos the AI judged safe to use
  /// directly (see [virtualTryOnEligible]). A syntactically valid URL is not
  /// proof that a legacy local/R2 object still exists in the active store.
  bool get canUseVirtualTryOn {
    if (sourceType != 'upload' ||
        imageStorageProvider != 'cloudinary' ||
        !virtualTryOnEligible) {
      return false;
    }
    final uri = Uri.tryParse(imageUrl.trim());
    return uri != null &&
        (uri.scheme == 'http' || uri.scheme == 'https') &&
        uri.host.isNotEmpty;
  }

  /// Friendly explanation for why this item can't be used for Virtual
  /// Try-On, or null if it can. Distinguishes a model-worn photo (fixable by
  /// adding a product-only photo) from a missing/unavailable image
  /// (fixable by re-uploading).
  String? get tryOnBlockedReason {
    if (canUseVirtualTryOn) return null;
    if (containsPerson) {
      return 'This item can be used for styling. Add a product-only photo '
          'to use it for Virtual Try-On.';
    }
    return 'Re-upload photo for $name to use Virtual Try-On.';
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
    containsPerson: json['containsPerson'] as bool? ?? false,
    garmentVisibility: json['garmentVisibility'] as String? ?? 'full',
    virtualTryOnEligible: json['virtualTryOnEligible'] as bool? ?? true,
    sourceMarketplace: json['sourceMarketplace'] as String?,
    isNew: json['isNew'] as bool? ?? false,
    createdAt: DateTime.tryParse(json['createdAt'] as String? ?? ''),
  );

  WardrobeItem copyWith({bool? isNew}) => WardrobeItem(
    id: id,
    name: name,
    category: category,
    imageUrl: imageUrl,
    imagePath: imagePath,
    productUrl: productUrl,
    sourceType: sourceType,
    imageStorageProvider: imageStorageProvider,
    tags: tags,
    containsPerson: containsPerson,
    garmentVisibility: garmentVisibility,
    virtualTryOnEligible: virtualTryOnEligible,
    sourceMarketplace: sourceMarketplace,
    isNew: isNew ?? this.isNew,
    createdAt: createdAt,
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
    this.containsPerson = false,
    this.garmentVisibility = 'full',
    this.virtualTryOnEligible = true,
    this.analysisJobId,
  });
  final String id;
  final String name;
  final String category;
  final String imageUrl;
  final String imagePath;
  final List<String> tags;

  /// See WardrobeItem.containsPerson.
  final bool containsPerson;

  /// See WardrobeItem.garmentVisibility.
  final String garmentVisibility;

  /// See WardrobeItem.virtualTryOnEligible.
  final bool virtualTryOnEligible;
  final String? analysisJobId;

  /// See WardrobeItem.tryOnBlockedReason.
  String? get tryOnBlockedReason {
    if (!containsPerson) return null;
    return 'This item can be used for styling. Add a product-only photo '
        'to use it for Virtual Try-On.';
  }

  WardrobeDraft copyWith({String? name, String? category}) => WardrobeDraft(
    id: id,
    name: name ?? this.name,
    category: category ?? this.category,
    imageUrl: imageUrl,
    imagePath: imagePath,
    tags: tags,
    containsPerson: containsPerson,
    garmentVisibility: garmentVisibility,
    virtualTryOnEligible: virtualTryOnEligible,
    analysisJobId: analysisJobId,
  );
}
