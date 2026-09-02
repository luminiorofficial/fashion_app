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
  bool _gmailBusy = false;
  // Set right before opening the external browser for Google consent, and
  // cleared once we've re-checked status after the app resumes — so a
  // plain app switch (not a connect attempt) never fires an extra request.
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
      unawaited(_loadGmailStatus());
    }
  }

  Future<void> _loadGmailStatus() async {
    try {
      final status = await widget.backend.getGmailStatus();
      if (mounted) setState(() => _gmailStatus = status);
    } catch (_) {
      // Gmail integration may simply not be configured on this server;
      // treat it the same as "not connected" rather than showing an error.
    } finally {
      if (mounted) setState(() => _gmailStatusLoading = false);
    }
  }

  Future<void> _connectGmail() async {
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
        showNeraSnackBar(
          context,
          'Sign in with Google, then return to Nera.',
        );
      }
    } catch (error) {
      if (mounted) showNeraSnackBar(context, friendlyError(error), error: true);
    } finally {
      if (mounted) setState(() => _gmailBusy = false);
    }
  }

  Future<void> _syncGmail() async {
    setState(() => _gmailBusy = true);
    try {
      // The initial 90-day scan can exceed the backend's per-request time
      // budget, so a sync call reports whether work remains; keep calling
      // until it's done or this cap is hit, so the UI stays responsive.
      for (var round = 0; round < 5; round++) {
        final summary = await widget.backend.syncGmail();
        if (!summary.hasMore) break;
      }
      final status = await widget.backend.getGmailStatus();
      if (mounted) {
        setState(() => _gmailStatus = status);
        showNeraSnackBar(context, 'Gmail sync complete.');
      }
    } catch (error) {
      if (mounted) showNeraSnackBar(context, friendlyError(error), error: true);
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
      if (mounted) showNeraSnackBar(context, friendlyError(error), error: true);
    } finally {
      if (mounted) setState(() => _gmailBusy = false);
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
        showNeraSnackBar(
          context,
          'Full-body photo updated. Your style profile is refreshed.',
        );
      }
    } catch (error) {
      if (mounted) showNeraSnackBar(context, friendlyError(error), error: true);
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

  Widget _buildGmailCard(BuildContext context) {
    if (_gmailStatusLoading) {
      return const NeraSkeleton(
        width: double.infinity,
        height: 88,
        radius: NeraRadius.md,
      );
    }
    return NeraCard(
      child: _gmailStatus.connected
          ? Row(
              children: [
                const Icon(Icons.mark_email_read_rounded, color: NeraColors.gold),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _gmailStatus.email ?? 'Gmail connected',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      Text(
                        _gmailStatus.syncStatus == 'syncing'
                            ? 'Scanning your inbox…'
                            : _gmailStatus.lastSyncedAt != null
                            ? 'Last synced ${_formatSyncTime(_gmailStatus.lastSyncedAt!)}'
                            : 'Not synced yet',
                        style: const TextStyle(color: NeraColors.muted),
                      ),
                    ],
                  ),
                ),
                if (_gmailBusy)
                  const SizedBox.square(
                    dimension: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                else
                  PopupMenuButton<String>(
                    icon: const Icon(Icons.more_vert_rounded),
                    onSelected: (value) => value == 'sync'
                        ? _syncGmail()
                        : _disconnectGmail(),
                    itemBuilder: (context) => const [
                      PopupMenuItem(value: 'sync', child: Text('Sync now')),
                      PopupMenuItem(
                        value: 'disconnect',
                        child: Text('Disconnect'),
                      ),
                    ],
                  ),
              ],
            )
          : Row(
              children: [
                const Icon(Icons.mail_outline_rounded, color: NeraColors.muted),
                const SizedBox(width: 12),
                const Expanded(
                  child: Text(
                    'Connect Gmail to detect delivered fashion purchases '
                    'automatically.',
                  ),
                ),
                NeraButton(
                  label: 'Connect',
                  expand: false,
                  loading: _gmailBusy,
                  style: NeraButtonStyleType.secondary,
                  onPressed: _connectGmail,
                ),
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

  @override
  Widget build(BuildContext context) => ListView(
    physics: const BouncingScrollPhysics(),
    padding: const EdgeInsets.fromLTRB(20, 20, 20, 120),
    children: [
      Text('Profile', style: NeraTheme.heading(32)),
      const SizedBox(height: NeraSpacing.xl),
      if (widget.error != null)
        NeraErrorState(message: widget.error!, onRetry: widget.onRetry)
      else if (widget.loading)
        const NeraSkeleton(
          width: double.infinity,
          height: 520,
          radius: NeraRadius.md,
        )
      else ...[
        NeraCard(
          gradient: true,
          child: Column(
            children: [
              SizedBox(
                width: 104,
                height: 104,
                child: NeraNetworkImage(
                  url: widget.profile.profileImageUrl ?? '',
                  radius: NeraRadius.pill,
                  placeholderIcon: Icons.person_rounded,
                ),
              ),
              const SizedBox(height: NeraSpacing.md),
              Text(
                widget.user?.name ?? 'Your NERA profile',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              if (widget.user != null) Text(widget.user!.phoneNumber),
              const SizedBox(height: NeraSpacing.lg),
              NeraButton(
                label: 'Update Full-Body Photo',
                icon: Icons.face_retouching_natural_rounded,
                loading: _analyzing,
                style: NeraButtonStyleType.secondary,
                onPressed: _analyze,
              ),
              if (_analyzing) ...[
                const SizedBox(height: NeraSpacing.sm),
                const Text(
                  'Uploading photo and running AI analysis…',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: NeraColors.muted),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: NeraSpacing.xxl),
        const NeraSectionHeader(
          'My Style Profile',
          subtitle: 'Insights used to personalize every look',
        ),
        const SizedBox(height: NeraSpacing.md),
        NeraCard(
          child: Column(
            children: [
              _ProfileValue(
                label: 'Body Type',
                value: widget.profile.bodyType ?? 'Not analyzed',
              ),
              const Divider(height: 28),
              _ProfileValue(
                label: 'Skin Tone',
                value: widget.profile.skinTone ?? 'Not analyzed',
              ),
              if (widget.profile.skinUndertone != null) ...[
                const Divider(height: 28),
                _ProfileValue(
                  label: 'Undertone',
                  value: widget.profile.skinUndertone!,
                ),
              ],
              if (widget.profile.hairColor != null) ...[
                const Divider(height: 28),
                _ProfileValue(
                  label: 'Hair Color',
                  value: widget.profile.hairColor!,
                ),
              ],
              if (widget.profile.facialStructure != null) ...[
                const Divider(height: 28),
                _ProfileValue(
                  label: 'Face Shape',
                  value: widget.profile.facialStructure!,
                ),
              ],
            ],
          ),
        ),
        if (widget.profile.styleAttributes.isNotEmpty) ...[
          const SizedBox(height: NeraSpacing.xxl),
          const NeraSectionHeader('Style attributes'),
          const SizedBox(height: NeraSpacing.md),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final style in widget.profile.styleAttributes)
                Chip(label: Text(style)),
            ],
          ),
        ],
        const SizedBox(height: NeraSpacing.xxl),
        const NeraSectionHeader(
          'Connected Accounts',
          subtitle: 'Detect fashion purchases from your inbox',
        ),
        const SizedBox(height: NeraSpacing.md),
        _buildGmailCard(context),
        const SizedBox(height: NeraSpacing.xxl),
        NeraButton(
          label: 'Saved Looks',
          icon: Icons.bookmark_rounded,
          style: NeraButtonStyleType.secondary,
          onPressed: _openSavedLooks,
        ),
        const SizedBox(height: NeraSpacing.md),
        NeraButton(
          label: 'Sign out',
          icon: Icons.logout_rounded,
          style: NeraButtonStyleType.secondary,
          onPressed: widget.backend.logout,
        ),
      ],
    ],
  );
}

class _ProfileValue extends StatelessWidget {
  const _ProfileValue({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Expanded(
        child: Text(label, style: const TextStyle(color: NeraColors.muted)),
      ),
      const SizedBox(width: 16),
      Flexible(
        child: Text(
          value,
          textAlign: TextAlign.right,
          style: Theme.of(context).textTheme.titleMedium,
        ),
      ),
    ],
  );
}
