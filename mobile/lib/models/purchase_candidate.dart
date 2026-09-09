/// A fashion product detected as delivered from a connected Gmail account,
/// awaiting the user's decision to add it to their wardrobe or ignore it.
/// See server/src/types/commerce.types.ts's PublicPurchaseCandidate.
class PurchaseCandidate {
  const PurchaseCandidate({
    required this.id,
    required this.marketplace,
    required this.productName,
    this.brand,
    this.imageUrl,
    this.sizeLabel,
    this.colorLabel,
    this.deliveredAt,
  });

  final String id;
  final String marketplace;
  final String productName;
  final String? brand;
  final String? imageUrl;
  final String? sizeLabel;
  final String? colorLabel;
  final DateTime? deliveredAt;

  factory PurchaseCandidate.fromJson(Map<String, dynamic> json) =>
      PurchaseCandidate(
        id: json['id'] as String,
        marketplace: json['marketplace'] as String? ?? 'unknown',
        productName: json['productName'] as String? ?? 'Purchase',
        brand: json['brand'] as String?,
        imageUrl: json['imageUrl'] as String?,
        sizeLabel: json['sizeLabel'] as String?,
        colorLabel: json['colorLabel'] as String?,
        deliveredAt: DateTime.tryParse(json['deliveredAt'] as String? ?? ''),
      );
}

/// Status of the current user's connected Gmail account, if any. Never
/// carries a Google token — the backend keeps those, see requirement in
/// server/src/commerce/gmail/gmail-oauth.service.ts.
class GmailConnectionStatus {
  const GmailConnectionStatus({
    required this.connected,
    this.email,
    this.lastSyncedAt,
    this.syncStatus,
    this.syncError,
  });

  final bool connected;
  final String? email;
  final DateTime? lastSyncedAt;
  final String? syncStatus;
  final String? syncError;

  static const disconnected = GmailConnectionStatus(connected: false);

  factory GmailConnectionStatus.fromJson(Map<String, dynamic> json) =>
      GmailConnectionStatus(
        connected: json['connected'] as bool? ?? false,
        email: json['email'] as String?,
        lastSyncedAt: DateTime.tryParse(json['lastSyncedAt'] as String? ?? ''),
        syncStatus: json['syncStatus'] as String?,
        syncError: json['syncError'] as String?,
      );
}

/// Result of one POST /commerce/gmail/sync call. `hasMore` is true when the
/// server's time/message budget for this call ran out before the whole
/// backlog was processed — the caller re-triggers sync until it's false.
class GmailSyncSummary {
  const GmailSyncSummary({required this.processed, required this.hasMore});

  final int processed;
  final bool hasMore;

  factory GmailSyncSummary.fromJson(Map<String, dynamic> json) =>
      GmailSyncSummary(
        processed: json['processed'] as int? ?? 0,
        hasMore: json['hasMore'] as bool? ?? false,
      );
}
