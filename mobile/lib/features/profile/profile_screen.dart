import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/errors/friendly_error.dart';
import '../../core/theme/theme.dart';
import '../../core/widgets/widgets.dart';
import '../../models/nera_models.dart';
import '../../services/image_service.dart';
import '../../services/nera_backend.dart';
import 'full_body_photo_flow.dart';
import 'saved_looks_screen.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({
    super.key,
    required this.backend,
    required this.imageService,
    required this.user,
    required this.profile,
    required this.wardrobe,
    required this.loading,
    required this.onRetry,
    this.error,
  });

  final NeraBackend backend;
  final NeraImageService imageService;
  final NeraUser? user;
  final StyleProfile profile;
  final List<WardrobeItem> wardrobe;
  final bool loading;
  final String? error;
  final VoidCallback onRetry;

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen>
    with WidgetsBindingObserver {
  bool _analyzing = false;
  GmailConnectionStatus _gmailStatus = GmailConnectionStatus.disconnected;
  bool _gmailStatusLoading = true;
  String? _gmailError;
  bool _gmailNeedsReconnect = false;
  bool _gmailBusy = false;
  bool _signingOut = false;
  bool _deletingAccount = false;
  // Set before opening Google consent and cleared after status is checked on
  // return. A normal app switch therefore does not trigger another request.
  bool _awaitingGmailReturn = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_loadGmailStatus());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _awaitingGmailReturn) {
      _awaitingGmailReturn = false;
      unawaited(_handleGmailReturn());
    }
  }

  Future<void> _handleGmailReturn() async {
    final wasConnected = _gmailStatus.connected;
    await _loadGmailStatus();
    if (mounted && !wasConnected && _gmailStatus.connected) {
      await _syncGmail();
    }
  }

  Future<void> _loadGmailStatus() async {
    if (!mounted) return;
    setState(() {
      _gmailStatusLoading = true;
      _gmailError = null;
      _gmailNeedsReconnect = false;
    });
    try {
      final status = await widget.backend.getGmailStatus();
      if (mounted) setState(() {
        _gmailStatus = status;
        _gmailNeedsReconnect = !status.connected && (status.syncError?.isNotEmpty ?? false);
        if (status.syncStatus == 'error' || status.syncStatus == 'failed' || (status.syncError?.isNotEmpty ?? false)) {
          _gmailError = friendlyError(status.syncError, feature: ErrorFeature.purchases);
        }
      });
    } catch (error) {
      if (mounted) setState(() => _gmailError = friendlyError(error, feature: ErrorFeature.purchases));
    } finally {
      if (mounted) setState(() => _gmailStatusLoading = false);
    }
  }

  Future<void> _connectGmail() async {
    if (!mounted || _gmailBusy) return;
    setState(() => _gmailBusy = true);
    try {
      final authUrl = await widget.backend.beginGmailConnect();
      final launched = await launchUrl(
        Uri.parse(authUrl),
        mode: LaunchMode.externalApplication,
      );
      if (!launched) {
        throw const NeraException('Could not open the Google sign-in page.');
      }
      _awaitingGmailReturn = true;
      if (mounted) {
        showNeraSnackBar(context, 'Sign in with Google, then return to Nera.');
      }
    } catch (error) {
      if (mounted) {
        showNeraSnackBar(
          context,
          _actionError(error, "We couldn't connect Gmail. Please try again."),
          error: true,
        );
      }
    } finally {
      if (mounted) setState(() => _gmailBusy = false);
    }
  }

  Future<void> _syncGmail() async {
    if (!mounted || _gmailBusy) return;
    setState(() => _gmailBusy = true);
    try {
      // A sync reports whether more work remains. Keep the existing capped
      // sequence so the initial scan progresses without blocking the UI.
      var hasMore = false;
      for (var round = 0; round < 5; round++) {
        final summary = await widget.backend.syncGmail();
        hasMore = summary.hasMore;
        if (!hasMore) break;
      }
      final status = await widget.backend.getGmailStatus();
      if (status.syncStatus == 'error' || status.syncStatus == 'failed' || (status.syncError?.isNotEmpty ?? false)) {
        throw NeraException(status.syncError ?? 'Gmail sync failed');
      }
      if (mounted) {
        setState(() {
          _gmailStatus = status;
          _gmailError = null;
          _gmailNeedsReconnect = false;
        });
        showNeraSnackBar(
          context,
          hasMore
              ? 'Your inbox scan is still in progress. Sync again to continue.'
              : 'Gmail sync complete.',
        );
      }
    } catch (error) {
      if (mounted) {
        showNeraSnackBar(
          context,
          _actionError(error, "We couldn't sync Gmail. Please try again."),
          error: true,
        );
        if (error is NeraException && error.code == 'GMAIL_RECONNECT_REQUIRED') {
          setState(() {
            _gmailNeedsReconnect = true;
            _gmailError = friendlyError(error, feature: ErrorFeature.purchases);
          });
        }
      }
    } finally {
      if (mounted) setState(() => _gmailBusy = false);
    }
  }

  Future<void> _disconnectGmail() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Disconnect Gmail?'),
        content: const Text(
          'Nera will stop scanning your inbox for new orders. Purchases '
          'already detected will stay in your Purchases list.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Disconnect'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() => _gmailBusy = true);
    try {
      await widget.backend.disconnectGmail();
      if (mounted) {
        setState(() => _gmailStatus = GmailConnectionStatus.disconnected);
      }
    } catch (error) {
      if (mounted) {
        showNeraSnackBar(
          context,
          _actionError(
            error,
            "We couldn't disconnect Gmail. Please try again.",
          ),
          error: true,
        );
      }
    } finally {
      if (mounted) setState(() => _gmailBusy = false);
    }
  }

  Future<void> _signOut() async {
    setState(() => _signingOut = true);
    try {
      await widget.backend.logout();
    } catch (error) {
      if (mounted) {
        showNeraSnackBar(
          context,
          _actionError(error, "We couldn't sign you out. Please try again."),
          error: true,
        );
      }
    } finally {
      if (mounted) setState(() => _signingOut = false);
    }
  }

  Future<void> _deleteAccount() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete your account?'),
        content: const Text(
          'This permanently deletes your NERA account, style profile, '
          'wardrobe, and saved looks. This cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(context).colorScheme.error,
              foregroundColor: Theme.of(context).colorScheme.onError,
            ),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete account'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _deletingAccount = true);
    try {
      await widget.backend.deleteAccount();
    } catch (error) {
      if (mounted) {
        showNeraSnackBar(
          context,
          _actionError(
            error,
            "We couldn't delete your account. Please try again.",
          ),
          error: true,
        );
      }
    } finally {
      if (mounted) setState(() => _deletingAccount = false);
    }
  }

  Future<void> _analyze() async {
    try {
      final profile = await FullBodyPhotoFlow.start(
        context: context,
        backend: widget.backend,
        imageService: widget.imageService,
        onProcessingChanged: (processing) {
          if (mounted) setState(() => _analyzing = processing);
        },
      );
      if (profile != null && mounted) {
        showNeraSnackBar(context, 'Your Style Profile has been refreshed.');
      }
    } catch (error) {
      if (mounted) {
        showNeraSnackBar(
          context,
          _actionError(
            error,
            "We couldn't refresh your Style Profile. Please try again.",
          ),
          error: true,
        );
      }
    }
  }

  void _openSavedLooks() {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => SavedLooksScreen(
          backend: widget.backend,
          wardrobe: widget.wardrobe,
        ),
      ),
    );
  }

  String _actionError(Object error, String fallback) => friendlyError(error, fallback: fallback);

  Widget _buildGmailConnection(BuildContext context) {
    if (_gmailStatusLoading) {
      return const _AccountRow(
        label: 'Gmail',
        trailing: SizedBox(
          width: 72,
          child: NeraSkeleton(height: 14, radius: NeraRadius.sm),
        ),
      );
    }
    if (_gmailError != null) {
      return NeraErrorState(
        message: _gmailError!,
        retrying: _gmailBusy,
        retryLabel: _gmailNeedsReconnect ? 'Reconnect Gmail' : 'Try again',
        onRetry: _gmailBusy ? null : _gmailNeedsReconnect ? _connectGmail : _gmailStatus.connected ? _syncGmail : _loadGmailStatus,
      );
    }
    if (!_gmailStatus.connected) {
      return _AccountRow(
        label: 'Gmail',
        supportingText: 'Import delivered fashion purchases',
        trailing: TextButton(
          onPressed: _gmailBusy ? null : _connectGmail,
          child: _gmailBusy
              ? const SizedBox.square(
                  dimension: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Connect'),
        ),
      );
    }

    final syncDetail = _gmailStatus.syncStatus == 'syncing'
        ? 'Syncing purchases…'
        : _gmailStatus.lastSyncedAt != null
        ? 'Connected · Synced ${_formatSyncTime(_gmailStatus.lastSyncedAt!)}'
        : 'Connected';
    final email = _cleanText(_gmailStatus.email);
    return _AccountRow(
      label: 'Gmail',
      supportingText: email == null ? syncDetail : '$email\n$syncDetail',
      trailing: _gmailBusy
          ? const SizedBox.square(
              dimension: 18,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : PopupMenuButton<String>(
              tooltip: 'Gmail options',
              icon: const Icon(Icons.more_horiz_rounded),
              onSelected: (value) =>
                  value == 'sync' ? _syncGmail() : _disconnectGmail(),
              itemBuilder: (context) => const [
                PopupMenuItem(value: 'sync', child: Text('Sync now')),
                PopupMenuItem(value: 'disconnect', child: Text('Disconnect')),
              ],
            ),
    );
  }

  String _formatSyncTime(DateTime time) {
    final minutes = DateTime.now().difference(time).inMinutes;
    if (minutes < 1) return 'just now';
    if (minutes < 60) return '${minutes}m ago';
    final hours = minutes ~/ 60;
    if (hours < 24) return '${hours}h ago';
    return '${hours ~/ 24}d ago';
  }

  String? _cleanText(String? value) {
    final text = value?.trim();
    if (text == null || text.isEmpty) return null;
    final normalized = text.toLowerCase();
    if (normalized == 'unknown' ||
        normalized == 'n/a' ||
        normalized == 'null' ||
        normalized == 'not analyzed') {
      return null;
    }
    return text;
  }

  List<String> _cleanList(List<String> values) => values
      .map(_cleanText)
      .whereType<String>()
      .toSet()
      .toList(growable: false);

  @override
  Widget build(BuildContext context) {
    final bodyType = _cleanText(widget.profile.bodyType);
    final skinTone = _cleanText(widget.profile.skinTone);
    final skinUndertone = _cleanText(widget.profile.skinUndertone);
    final hairColor = _cleanText(widget.profile.hairColor);
    final facialStructure = _cleanText(widget.profile.facialStructure);
    final details = <_StyleDetail>[
      if (bodyType != null) _StyleDetail('Body profile', bodyType),
      if (skinTone != null) _StyleDetail('Skin tone', skinTone),
      if (skinUndertone != null) _StyleDetail('Undertone', skinUndertone),
      if (hairColor != null) _StyleDetail('Hair color', hairColor),
      if (facialStructure != null) _StyleDetail('Face shape', facialStructure),
    ];
    final styleAttributes = _cleanList(widget.profile.styleAttributes);
    final preferredStyles = _cleanList(widget.profile.preferredStyles);
    final stylingNotes = _cleanText(widget.profile.stylingNotes);
    final hasStyleInformation =
        styleAttributes.isNotEmpty ||
        preferredStyles.isNotEmpty ||
        stylingNotes != null;
    final needsMoreStyleData = details.length < 2 && !hasStyleInformation;
    final name = _cleanText(widget.user?.name) ?? 'Your NERA profile';
    final phone = _cleanText(widget.user?.phoneNumber);

    return ListView(
      physics: const BouncingScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 120),
      children: [
        _ProfileHeader(
          name: name,
          imageUrl: _cleanText(widget.profile.profileImageUrl) ?? '',
        ),
        const SizedBox(height: NeraSpacing.xxxl),
        if (widget.error != null)
          NeraErrorState(
            title: 'Your Style DNA is unavailable',
            message: "We couldn't load your styling profile. Please try again.",
            retryLabel: 'Reload profile',
            onRetry: widget.onRetry,
          )
        else if (widget.loading)
          const _ProfileLoadingState()
        else ...[
          if (details.isNotEmpty) ...[
            const _EditorialSectionHeader(
              title: 'Style profile',
              subtitle: 'The details NERA uses to personalize your looks',
            ),
            const SizedBox(height: NeraSpacing.md),
            NeraCard(
              padding: const EdgeInsets.symmetric(
                horizontal: NeraSpacing.lg,
                vertical: NeraSpacing.xs,
              ),
              child: Column(
                children: [
                  for (var index = 0; index < details.length; index++) ...[
                    if (index > 0) const Divider(),
                    _ProfileValue(
                      label: details[index].label,
                      value: details[index].value,
                    ),
                  ],
                ],
              ),
            ),
          ],
          if (hasStyleInformation) ...[
            SizedBox(height: details.isEmpty ? 0 : NeraSpacing.xxxl),
            const _EditorialSectionHeader(
              title: 'Your style',
              subtitle: 'Characteristics that shape your recommendations',
            ),
            const SizedBox(height: NeraSpacing.lg),
            if (preferredStyles.isNotEmpty)
              _StyleTags(label: 'Preferred styles', values: preferredStyles),
            if (preferredStyles.isNotEmpty && styleAttributes.isNotEmpty)
              const SizedBox(height: NeraSpacing.xl),
            if (styleAttributes.isNotEmpty)
              _StyleTags(label: 'Style attributes', values: styleAttributes),
            if ((preferredStyles.isNotEmpty || styleAttributes.isNotEmpty) &&
                stylingNotes != null)
              const SizedBox(height: NeraSpacing.xl),
            if (stylingNotes != null) _StyleNotes(notes: stylingNotes),
          ],
          SizedBox(
            height: details.isEmpty && !hasStyleInformation
                ? 0
                : NeraSpacing.xxxl,
          ),
          const Divider(),
          const SizedBox(height: NeraSpacing.xxl),
          Text(
            needsMoreStyleData
                ? 'Update your Style Profile to improve NERA\'s recommendations.'
                : 'Keep your Style DNA current as your look evolves.',
            style: Theme.of(context).textTheme.bodyLarge,
          ),
          const SizedBox(height: NeraSpacing.lg),
          NeraButton(
            label: 'Update Style Profile',
            icon: Icons.camera_alt_outlined,
            loading: _analyzing,
            onPressed: _analyze,
          ),
          if (_analyzing) ...[
            const SizedBox(height: NeraSpacing.sm),
            const Text(
              'Refreshing your personal styling profile…',
              textAlign: TextAlign.center,
              style: TextStyle(color: NeraColors.muted),
            ),
          ],
          const SizedBox(height: NeraSpacing.xxxl),
          const _EditorialSectionHeader(title: 'Account'),
          const SizedBox(height: NeraSpacing.sm),
          DecoratedBox(
            decoration: const BoxDecoration(
              border: Border(
                top: BorderSide(color: NeraColors.divider),
                bottom: BorderSide(color: NeraColors.divider),
              ),
            ),
            child: Column(
              children: [
                _buildGmailConnection(context),
                if (phone != null)
                  _AccountRow(label: 'Mobile', supportingText: phone),
                _AccountRow(
                  label: 'Saved looks',
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: _openSavedLooks,
                ),
                _AccountRow(
                  label: 'Sign out',
                  loading: _signingOut,
                  onTap: _signingOut ? null : _signOut,
                ),
                _AccountRow(
                  label: 'Delete account',
                  labelColor: NeraColors.error,
                  loading: _deletingAccount,
                  showDivider: false,
                  onTap: _deletingAccount ? null : _deleteAccount,
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _StyleDetail {
  const _StyleDetail(this.label, this.value);

  final String label;
  final String value;
}

class _ProfileHeader extends StatelessWidget {
  const _ProfileHeader({required this.name, required this.imageUrl});

  final String name;
  final String imageUrl;

  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.center,
    children: [
      Semantics(
        image: true,
        label: '$name profile photo',
        child: SizedBox.square(
          dimension: 96,
          child: NeraNetworkImage(
            url: imageUrl,
            radius: NeraRadius.pill,
            placeholderIcon: Icons.person_rounded,
          ),
        ),
      ),
      const SizedBox(width: NeraSpacing.xl),
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'MY STYLE DNA',
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: NeraColors.textSecondary,
                fontWeight: FontWeight.w700,
                letterSpacing: 1.6,
              ),
            ),
            const SizedBox(height: NeraSpacing.sm),
            Text(name, style: NeraTheme.display(30)),
            const SizedBox(height: NeraSpacing.xs),
            Text(
              'Your personal styling profile',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ],
        ),
      ),
    ],
  );
}

class _EditorialSectionHeader extends StatelessWidget {
  const _EditorialSectionHeader({required this.title, this.subtitle});

  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(title, style: NeraTheme.heading(20)),
      if (subtitle != null) ...[
        const SizedBox(height: NeraSpacing.xs),
        Text(subtitle!, style: Theme.of(context).textTheme.bodyMedium),
      ],
    ],
  );
}

class _ProfileValue extends StatelessWidget {
  const _ProfileValue({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: NeraSpacing.lg),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Text(label, style: const TextStyle(color: NeraColors.muted)),
        ),
        const SizedBox(width: NeraSpacing.lg),
        Flexible(
          flex: 2,
          child: Text(
            value,
            textAlign: TextAlign.right,
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(height: 1.35),
          ),
        ),
      ],
    ),
  );
}

class _StyleTags extends StatelessWidget {
  const _StyleTags({required this.label, required this.values});

  final String label;
  final List<String> values;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        label.toUpperCase(),
        style: Theme.of(
          context,
        ).textTheme.labelSmall?.copyWith(letterSpacing: 1.2),
      ),
      const SizedBox(height: NeraSpacing.md),
      Wrap(
        spacing: NeraSpacing.sm,
        runSpacing: NeraSpacing.sm,
        children: [for (final value in values) _StyleTag(value: value)],
      ),
    ],
  );
}

class _StyleTag extends StatelessWidget {
  const _StyleTag({required this.value});

  final String value;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
    decoration: BoxDecoration(
      color: NeraColors.surface,
      border: Border.all(color: NeraColors.surfaceBorder),
      borderRadius: BorderRadius.circular(NeraRadius.pill),
    ),
    child: Text(value, style: Theme.of(context).textTheme.bodyMedium),
  );
}

class _StyleNotes extends StatelessWidget {
  const _StyleNotes({required this.notes});

  final String notes;

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.only(left: NeraSpacing.lg),
    decoration: const BoxDecoration(
      border: Border(left: BorderSide(color: NeraColors.ink, width: 2)),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'STYLING NOTES',
          style: Theme.of(
            context,
          ).textTheme.labelSmall?.copyWith(letterSpacing: 1.2),
        ),
        const SizedBox(height: NeraSpacing.sm),
        Text(notes, style: Theme.of(context).textTheme.bodyLarge),
      ],
    ),
  );
}

class _AccountRow extends StatelessWidget {
  const _AccountRow({
    required this.label,
    this.supportingText,
    this.trailing,
    this.onTap,
    this.labelColor,
    this.loading = false,
    this.showDivider = true,
  });

  final String label;
  final String? supportingText;
  final Widget? trailing;
  final VoidCallback? onTap;
  final Color? labelColor;
  final bool loading;
  final bool showDivider;

  @override
  Widget build(BuildContext context) => InkWell(
    onTap: onTap,
    child: Container(
      constraints: const BoxConstraints(minHeight: 64),
      padding: const EdgeInsets.symmetric(vertical: 14),
      decoration: BoxDecoration(
        border: showDivider
            ? const Border(bottom: BorderSide(color: NeraColors.divider))
            : null,
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: Theme.of(
                    context,
                  ).textTheme.titleMedium?.copyWith(color: labelColor),
                ),
                if (supportingText != null) ...[
                  const SizedBox(height: NeraSpacing.xs),
                  Text(
                    supportingText!,
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ],
              ],
            ),
          ),
          if (loading)
            const Padding(
              padding: EdgeInsets.only(left: NeraSpacing.lg),
              child: SizedBox.square(
                dimension: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            )
          else if (trailing != null)
            Padding(
              padding: const EdgeInsets.only(left: NeraSpacing.md),
              child: trailing!,
            ),
        ],
      ),
    ),
  );
}

class _ProfileLoadingState extends StatelessWidget {
  const _ProfileLoadingState();

  @override
  Widget build(BuildContext context) => const Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      NeraSkeleton(width: 140, height: 24, radius: NeraRadius.sm),
      SizedBox(height: NeraSpacing.md),
      NeraSkeleton(width: double.infinity, height: 210, radius: NeraRadius.md),
      SizedBox(height: NeraSpacing.xxxl),
      NeraSkeleton(width: 112, height: 22, radius: NeraRadius.sm),
      SizedBox(height: NeraSpacing.lg),
      NeraSkeleton(width: double.infinity, height: 54, radius: NeraRadius.sm),
    ],
  );
}
