class TryOnResult {
  const TryOnResult({
    required this.id,
    required this.wardrobeItemIds,
    required this.imageUrl,
    required this.status,
    required this.isSaved,
    required this.developmentFallback,
    this.outfitId,
    this.createdAt,
  });

  final String id;
  final List<String> wardrobeItemIds;
  final String imageUrl;
  final String status;
  final bool isSaved;
  final bool developmentFallback;
  final String? outfitId;
  final DateTime? createdAt;

  TryOnResult copyWith({bool? isSaved}) => TryOnResult(
    id: id,
    wardrobeItemIds: wardrobeItemIds,
    imageUrl: imageUrl,
    status: status,
    isSaved: isSaved ?? this.isSaved,
    developmentFallback: developmentFallback,
    outfitId: outfitId,
    createdAt: createdAt,
  );

  factory TryOnResult.fromJson(Map<String, dynamic> json) => TryOnResult(
    id: json['id'] as String,
    wardrobeItemIds: List<String>.from(
      json['wardrobeItemIds'] as List? ?? const [],
    ),
    imageUrl: json['imageUrl'] as String? ?? '',
    status: json['status'] as String? ?? 'completed',
    isSaved: json['isSaved'] as bool? ?? false,
    developmentFallback: json['developmentFallback'] as bool? ?? false,
    outfitId: json['outfitId'] as String?,
    createdAt: DateTime.tryParse(json['createdAt'] as String? ?? ''),
  );
}
