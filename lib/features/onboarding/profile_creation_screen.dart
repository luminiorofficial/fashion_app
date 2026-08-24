import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/errors/friendly_error.dart';
import '../../core/theme/theme.dart';
import '../../core/widgets/widgets.dart';
import '../../services/image_service.dart';
import '../../services/nera_backend.dart';

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
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(
                  Icons.camera_alt_rounded,
                  color: NeraColors.gold,
                ),
                title: const Text('Take a photo'),
                onTap: () => Navigator.pop(context, ImageSource.camera),
              ),
              ListTile(
                leading: const Icon(
                  Icons.photo_library_rounded,
                  color: NeraColors.gold,
                ),
                title: const Text('Choose from gallery'),
                onTap: () => Navigator.pop(context, ImageSource.gallery),
              ),
            ],
          ),
        ),
      ),
    );
    if (source == null || !mounted) return;
    setState(() {
      _processing = true;
      _error = null;
    });
    try {
      final image = await widget.imageService.pick(source);
      if (image == null) return;
      await widget.backend.analyzeProfileImage(
        Uint8List.fromList(image.bytes),
        image.fileName,
      );
      if (mounted) {
        showNeraSnackBar(context, 'Analysis complete. Your profile is ready.');
      }
    } catch (error) {
      if (mounted) setState(() => _error = friendlyError(error));
    } finally {
      if (mounted) {
        setState(() => _processing = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Create Profile')),
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(NeraSpacing.xxl),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: Column(
              children: [
                Container(
                  width: 112,
                  height: 112,
                  decoration: const BoxDecoration(
                    gradient: NeraColors.goldGradient,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.person_search_rounded,
                    size: 48,
                    color: Color(0xFF241A0B),
                  ),
                ),
                const SizedBox(height: NeraSpacing.xxl),
                Text(
                  'Let NERA learn your proportions',
                  textAlign: TextAlign.center,
                  style: NeraTheme.display(30),
                ),
                const SizedBox(height: NeraSpacing.md),
                Text(
                  'Upload one clear, full-length photo. It is analyzed securely to personalize fit, color, and silhouette suggestions.',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyLarge,
                ),
                const SizedBox(height: NeraSpacing.xxl),
                if (_error != null) ...[
                  NeraErrorState(
                    title: 'Full-length photo required',
                    message: _error!,
                    onRetry: _processing ? null : _upload,
                  ),
                  const SizedBox(height: NeraSpacing.lg),
                ],
                NeraButton(
                  label: 'Upload Image',
                  icon: Icons.add_a_photo_rounded,
                  loading: _processing,
                  onPressed: _upload,
                ),
                const SizedBox(height: NeraSpacing.md),
                const Text(
                  'Analysis is powered by Gemini AI',
                  style: TextStyle(color: NeraColors.muted),
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}
