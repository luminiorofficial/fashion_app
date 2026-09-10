import 'package:flutter/material.dart';

import '../../core/errors/friendly_error.dart';
import '../../core/theme/theme.dart';
import '../../core/widgets/widgets.dart';
import '../../models/nera_models.dart';
import '../../services/image_service.dart';
import '../../services/nera_backend.dart';
import '../profile/full_body_photo_flow.dart';

class ProfileCreationScreen extends StatefulWidget {
  const ProfileCreationScreen({
    super.key,
    required this.backend,
    required this.imageService,
  });

  final NeraBackend backend;
  final NeraImageService imageService;

  @override
  State<ProfileCreationScreen> createState() => _ProfileCreationScreenState();
}

class _ProfileCreationScreenState extends State<ProfileCreationScreen> {
  bool _processing = false;
  String? _error;

  Future<void> _upload() async {
    try {
      final profile = await FullBodyPhotoFlow.start(
        context: context,
        backend: widget.backend,
        imageService: widget.imageService,
        onProcessingChanged: (processing) {
          if (!mounted) return;
          setState(() {
            _processing = processing;
            if (processing) _error = null;
          });
        },
      );
      if (profile != null && mounted) {
        await _showProfileReady(profile);
      }
    } catch (error) {
      if (mounted) setState(() => _error = _photoError(error));
    }
  }

  String _photoError(Object error) {
    final message = friendlyError(error).toLowerCase();
    if (message.contains('network') || message.contains('connection')) {
      return 'Upload didn\'t finish. Please check your connection and try again.';
    }
    if (message.contains('photo') || message.contains('image')) {
      return 'We couldn\'t use this photo. Try a clearer full-length image.';
    }
    return 'We couldn\'t finish your Style Profile. Please try again.';
  }

  Future<void> _showProfileReady(StyleProfile profile) async {
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (context) {
        final highlights = <({String label, String value})>[
          if (_hasText(profile.bodyType))
            (label: 'Body profile', value: profile.bodyType!.trim()),
          if (_hasText(profile.skinTone))
            (label: 'Skin tone', value: profile.skinTone!.trim()),
          if (_hasText(profile.skinUndertone))
            (label: 'Undertone', value: profile.skinUndertone!.trim()),
        ];
        return AlertDialog(
          title: Text(
            'Your Style Profile is ready.',
            style: NeraTheme.display(28),
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Here is the foundation for your personalized recommendations.',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
              if (highlights.isNotEmpty) ...[
                const SizedBox(height: NeraSpacing.lg),
                const Divider(),
                const SizedBox(height: NeraSpacing.sm),
                for (final highlight in highlights) ...[
                  _ProfileHighlight(
                    label: highlight.label,
                    value: highlight.value,
                  ),
                  const SizedBox(height: NeraSpacing.sm),
                ],
              ],
            ],
          ),
          actions: [
            FilledButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Continue to NERA'),
            ),
          ],
        );
      },
    );
  }

  bool _hasText(String? value) => value?.trim().isNotEmpty == true;

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 520),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: NeraSpacing.xl),
            child: _processing
                ? const _CreatingProfileState()
                : SingleChildScrollView(
                    padding: const EdgeInsets.symmetric(
                      vertical: NeraSpacing.xxxl,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Create your Style Profile',
                          style: Theme.of(context).textTheme.labelSmall,
                        ),
                        const SizedBox(height: NeraSpacing.lg),
                        Text(
                          'Let NERA understand your style',
                          style: NeraTheme.display(38),
                        ),
                        const SizedBox(height: NeraSpacing.md),
                        Text(
                          'A few details help us personalize outfits, colors '
                          'and fit around you.',
                          style: Theme.of(context).textTheme.bodyLarge,
                        ),
                        const SizedBox(height: NeraSpacing.xxxl),
                        const Divider(),
                        const SizedBox(height: NeraSpacing.xxl),
                        Text(
                          'Add a full-length photo',
                          style: Theme.of(context).textTheme.headlineSmall,
                        ),
                        const SizedBox(height: NeraSpacing.sm),
                        Text(
                          'Use a clear photo with your full body visible and '
                          'natural lighting.',
                          style: Theme.of(context).textTheme.bodyLarge,
                        ),
                        const SizedBox(height: NeraSpacing.xl),
                        const _PhotoGuidance(),
                        if (_error != null) ...[
                          const SizedBox(height: NeraSpacing.xxl),
                          _PhotoError(message: _error!, onRetry: _upload),
                        ],
                        const SizedBox(height: NeraSpacing.xxxl),
                        NeraButton(
                          label: 'Add a photo',
                          icon: Icons.add_a_photo_outlined,
                          onPressed: _upload,
                        ),
                      ],
                    ),
                  ),
          ),
        ),
      ),
    ),
  );
}

class _PhotoGuidance extends StatelessWidget {
  const _PhotoGuidance();

  @override
  Widget build(BuildContext context) => const Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      _GuidanceLine('Full body visible'),
      SizedBox(height: NeraSpacing.sm),
      _GuidanceLine('Natural, even lighting'),
      SizedBox(height: NeraSpacing.sm),
      _GuidanceLine('Minimal obstruction'),
    ],
  );
}

class _ProfileHighlight extends StatelessWidget {
  const _ProfileHighlight({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => RichText(
    text: TextSpan(
      style: Theme.of(context).textTheme.bodyMedium,
      children: [
        TextSpan(
          text: '$label  ',
          style: Theme.of(context).textTheme.labelMedium?.copyWith(
            color: NeraColors.textPrimary,
          ),
        ),
        TextSpan(text: value),
      ],
    ),
  );
}

class _GuidanceLine extends StatelessWidget {
  const _GuidanceLine(this.label);

  final String label;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Container(width: 5, height: 5, color: NeraColors.ink),
      const SizedBox(width: NeraSpacing.md),
      Text(label, style: Theme.of(context).textTheme.bodyMedium),
    ],
  );
}

class _PhotoError extends StatelessWidget {
  const _PhotoError({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const Divider(),
      const SizedBox(height: NeraSpacing.md),
      Text('Try another photo', style: Theme.of(context).textTheme.titleMedium),
      const SizedBox(height: NeraSpacing.xs),
      Text(message, style: Theme.of(context).textTheme.bodyMedium),
      const SizedBox(height: NeraSpacing.sm),
      TextButton(onPressed: onRetry, child: const Text('Choose a photo')),
    ],
  );
}

class _CreatingProfileState extends StatelessWidget {
  const _CreatingProfileState();

  @override
  Widget build(BuildContext context) => Column(
    mainAxisSize: MainAxisSize.min,
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const SizedBox.square(
        dimension: 24,
        child: CircularProgressIndicator(strokeWidth: 2),
      ),
      const SizedBox(height: NeraSpacing.xxl),
      Text('Creating your Style Profile...', style: NeraTheme.display(34)),
      const SizedBox(height: NeraSpacing.md),
      Text(
        'Personalizing your recommendations',
        style: Theme.of(context).textTheme.bodyLarge,
      ),
      const SizedBox(height: NeraSpacing.xxl),
      const Divider(),
      const SizedBox(height: NeraSpacing.lg),
      Text(
        'Understanding your proportions\nFinding your color profile',
        style: Theme.of(context).textTheme.bodyMedium,
      ),
    ],
  );
}
