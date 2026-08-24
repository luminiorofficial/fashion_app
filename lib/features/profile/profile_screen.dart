import 'package:flutter/material.dart';

import '../../core/errors/friendly_error.dart';
import '../../core/theme/theme.dart';
import '../../core/widgets/widgets.dart';
import '../../models/nera_models.dart';
import '../../services/image_service.dart';
import '../../services/nera_backend.dart';
import 'full_body_photo_flow.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({
    super.key,
    required this.backend,
    required this.imageService,
    required this.user,
    required this.profile,
    required this.loading,
    required this.onRetry,
    this.error,
  });

  final NeraBackend backend;
  final NeraImageService imageService;
  final NeraUser? user;
  final StyleProfile profile;
  final bool loading;
  final String? error;
  final VoidCallback onRetry;

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  bool _analyzing = false;

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

  @override
  Widget build(BuildContext context) => ListView(
    physics: const BouncingScrollPhysics(),
    padding: const EdgeInsets.fromLTRB(20, 20, 20, 120),
    children: [
      Text('Profile', style: NeraTheme.display(38)),
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
