import '../models/nera_models.dart';

/// The visual source for the Complete Look hero. A future implementation can
/// return a generated image URL here without coupling image generation to the
/// outfit screen or to Virtual Try-On.
abstract interface class CompleteLookProvider {
  const CompleteLookProvider();

  Future<CompleteLookVisual> createVisual({
    required OutfitPlan outfit,
    required List<WardrobeItem> wardrobeItems,
  });
}

class CompleteLookVisual {
  const CompleteLookVisual.placeholder() : imageUrl = null;

  const CompleteLookVisual.generated(this.imageUrl);

  final String? imageUrl;
  bool get isPlaceholder => imageUrl == null || imageUrl!.trim().isEmpty;
}

/// UI-only implementation used until NERA has a dedicated Complete Look
/// image provider. It deliberately performs no network or AI call.
class PlaceholderCompleteLookProvider implements CompleteLookProvider {
  const PlaceholderCompleteLookProvider();

  @override
  Future<CompleteLookVisual> createVisual({
    required OutfitPlan outfit,
    required List<WardrobeItem> wardrobeItems,
  }) async => const CompleteLookVisual.placeholder();
}
