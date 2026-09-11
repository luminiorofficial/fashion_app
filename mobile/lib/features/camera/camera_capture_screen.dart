import 'dart:async';

import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../../core/theme/theme.dart';
import '../../core/errors/friendly_error.dart';

enum _CameraState { loading, ready, permissionDenied, unavailable, failed }

/// Owns camera initialization, lifecycle, preview, and capture for NERA's
/// "Take a photo" actions. Gallery selection continues to use image_picker.
class CameraCaptureScreen extends StatefulWidget {
  const CameraCaptureScreen({super.key});

  static Future<XFile?> open(BuildContext context) =>
      Navigator.of(context).push<XFile>(
        MaterialPageRoute<XFile>(builder: (_) => const CameraCaptureScreen()),
      );

  @override
  State<CameraCaptureScreen> createState() => _CameraCaptureScreenState();
}

class _CameraCaptureScreenState extends State<CameraCaptureScreen>
    with WidgetsBindingObserver {
  CameraController? _controller;
  List<CameraDescription> _cameras = const [];
  _CameraState _state = _CameraState.loading;
  String? _message;
  bool _capturing = false;
  int _initializationToken = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_initialize());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.inactive ||
        state == AppLifecycleState.paused ||
        state == AppLifecycleState.detached) {
      _releaseCamera();
    } else if (state == AppLifecycleState.resumed &&
        _controller == null &&
        mounted) {
      unawaited(_initialize());
    }
  }

  Future<void> _initialize({CameraDescription? selected}) async {
    final token = ++_initializationToken;
    await _disposeController();
    if (!mounted || token != _initializationToken) return;
    setState(() {
      _state = _CameraState.loading;
      _message = null;
    });

    try {
      final cameras = _cameras.isEmpty ? await availableCameras() : _cameras;
      if (!mounted || token != _initializationToken) return;
      _cameras = cameras;
      if (cameras.isEmpty) {
        setState(() {
          _state = _CameraState.unavailable;
          _message = 'No camera is available on this device.';
        });
        return;
      }

      final description = selected ?? _preferredCamera(cameras);
      final controller = CameraController(
        description,
        ResolutionPreset.high,
        enableAudio: false,
      );
      _controller = controller;
      await controller.initialize();
      if (!mounted ||
          token != _initializationToken ||
          _controller != controller) {
        await controller.dispose();
        return;
      }
      setState(() => _state = _CameraState.ready);
    } on CameraException catch (error) {
      if (!mounted || token != _initializationToken) return;
      await _disposeController();
      final denied = _isPermissionError(error.code);
      setState(() {
        _state = denied ? _CameraState.permissionDenied : _CameraState.failed;
        _message = denied
            ? 'Camera access is off. Allow it in your device Settings, then try again.'
            : 'The camera could not start. Check that another app is not using it, then try again.';
      });
    } on Object {
      if (!mounted || token != _initializationToken) return;
      await _disposeController();
      setState(() {
        _state = _CameraState.unavailable;
        _message = kIsWeb
            ? 'Camera access is unavailable in this browser. Choose a photo from your device instead.'
            : 'Camera is unavailable on this device. Choose a photo from your gallery instead.';
      });
    }
  }

  CameraDescription _preferredCamera(List<CameraDescription> cameras) =>
      cameras.firstWhere(
        (camera) => camera.lensDirection == CameraLensDirection.back,
        orElse: () => cameras.first,
      );

  bool _isPermissionError(String code) {
    final normalized = code.toLowerCase();
    return normalized.contains('accessdenied') ||
        normalized.contains('permission') ||
        normalized.contains('restricted');
  }

  Future<void> _switchCamera() async {
    final current = _controller?.description;
    if (current == null || _cameras.length < 2 || _capturing) return;
    final index = _cameras.indexOf(current);
    await _initialize(selected: _cameras[(index + 1) % _cameras.length]);
  }

  Future<void> _capture() async {
    final controller = _controller;
    if (controller == null ||
        !controller.value.isInitialized ||
        controller.value.isTakingPicture ||
        _capturing) {
      return;
    }
    setState(() => _capturing = true);
    try {
      final image = await controller.takePicture();
      if (mounted) Navigator.pop(context, image);
    } catch (error, stackTrace) {
      logDeveloperError(error, stackTrace);
      if (mounted) {
        setState(() {
          _capturing = false;
          _message =
              'The photo could not be captured. Hold steady and try again.';
        });
      }
    } finally {
      if (mounted) setState(() => _capturing = false);
    }
  }

  void _releaseCamera() {
    _initializationToken += 1;
    unawaited(_disposeController());
    if (mounted) {
      setState(() {
        _state = _CameraState.loading;
        _message = null;
      });
    }
  }

  Future<void> _disposeController() async {
    final controller = _controller;
    _controller = null;
    try {
      if (controller != null) await controller.dispose();
    } catch (error, stackTrace) {
      logDeveloperError(error, stackTrace);
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _initializationToken += 1;
    unawaited(_disposeController());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: NeraColors.surface,
    appBar: AppBar(
      title: const Text('Take a photo'),
      backgroundColor: NeraColors.surface,
    ),
    body: SafeArea(child: _buildBody(context)),
  );

  Widget _buildBody(BuildContext context) {
    final controller = _controller;
    if (_state == _CameraState.ready &&
        controller != null &&
        controller.value.isInitialized) {
      return Column(
        children: [
          Expanded(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(NeraRadius.lg),
                child: ColoredBox(
                  color: NeraColors.surfaceElevated,
                  child: LayoutBuilder(
                    builder: (context, constraints) => _CameraPreviewCover(
                      controller: controller,
                      size: constraints.biggest,
                    ),
                  ),
                ),
              ),
            ),
          ),
          if (_message != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                _message!,
                style: Theme.of(
                  context,
                ).textTheme.bodyMedium?.copyWith(color: NeraColors.error),
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 0, 24, 20),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                SizedBox.square(
                  dimension: 48,
                  child: _cameras.length > 1
                      ? IconButton.outlined(
                          tooltip: 'Switch camera',
                          onPressed: _switchCamera,
                          icon: const Icon(Icons.cameraswitch_outlined),
                        )
                      : null,
                ),
                const SizedBox(width: 28),
                Semantics(
                  button: true,
                  label: 'Capture photo',
                  child: SizedBox.square(
                    dimension: 72,
                    child: FilledButton(
                      onPressed: _capturing ? null : _capture,
                      style: FilledButton.styleFrom(
                        shape: const CircleBorder(),
                        padding: EdgeInsets.zero,
                      ),
                      child: _capturing
                          ? const SizedBox.square(
                              dimension: 24,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: NeraColors.onInk,
                              ),
                            )
                          : const Icon(Icons.camera_alt_rounded, size: 30),
                    ),
                  ),
                ),
                const SizedBox(width: 76),
              ],
            ),
          ),
        ],
      );
    }

    if (_state == _CameraState.loading) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(),
            SizedBox(height: 16),
            Text('Starting camera…'),
          ],
        ),
      );
    }

    final permissionDenied = _state == _CameraState.permissionDenied;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              permissionDenied
                  ? Icons.no_photography_outlined
                  : Icons.camera_alt_outlined,
              size: 48,
              color: NeraColors.muted,
            ),
            const SizedBox(height: 16),
            Text(
              permissionDenied
                  ? 'Camera permission needed'
                  : 'Camera unavailable',
              style: Theme.of(context).textTheme.titleLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              _message ?? 'The camera could not be opened.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            const SizedBox(height: 20),
            OutlinedButton.icon(
              onPressed: _initialize,
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('Try again'),
            ),
          ],
        ),
      ),
    );
  }
}

class _CameraPreviewCover extends StatelessWidget {
  const _CameraPreviewCover({required this.controller, required this.size});

  final CameraController controller;
  final Size size;

  @override
  Widget build(BuildContext context) {
    final previewSize = controller.value.previewSize;
    if (previewSize == null || size.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    final portrait = size.height >= size.width;
    final width = portrait ? previewSize.height : previewSize.width;
    final height = portrait ? previewSize.width : previewSize.height;
    return ClipRect(
      child: SizedBox.expand(
        child: FittedBox(
          fit: BoxFit.cover,
          child: SizedBox(
            width: width,
            height: height,
            child: CameraPreview(controller),
          ),
        ),
      ),
    );
  }
}
