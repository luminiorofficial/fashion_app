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
    this.profileImageUrl,
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
  final String? profileImageUrl;
  final DateTime? updatedAt;

  bool get isAnalyzed =>
      bodyType?.trim().isNotEmpty == true &&
      skinTone?.trim().isNotEmpty == true;

  bool get hasPhoto => profileImageUrl?.isNotEmpty == true;

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
      profileImageUrl: json['profileImageUrl'] as String?,
      updatedAt: DateTime.tryParse(json['updatedAt'] as String? ?? ''),
    );
  }
}
