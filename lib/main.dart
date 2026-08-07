import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:url_launcher/url_launcher.dart';

import 'models/nera_models.dart';
import 'services/image_service.dart';
import 'services/nera_backend.dart';
import 'services/remote_nera_backend.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const NeraApp());
}

class NeraApp extends StatelessWidget {
  const NeraApp({super.key, this.backend, this.imageService});

  final NeraBackend? backend;
  final NeraImageService? imageService;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'NERA — Personal Stylist AI',
      theme: NeraTheme.dark,
      home: _NeraBootstrap(backend: backend, imageService: imageService),
    );
  }
}

class MyApp extends NeraApp {
  const MyApp({super.key});
}

class NeraColors {
  static const background = Color(0xFF050505);
  static const surface = Color(0xFF191919);
  static const surfaceBorder = Color(0xFF2B2B2B);
  static const tile = Color(0xFF1D2938);
  static const button = Color(0xFF3D485C);
  static const gold = Color(0xFFFFC107);
  static const blue = Color(0xFF9BBFE8);
  static const muted = Color(0xFF7484A1);
  static const textPrimary = Color(0xFFF7F7F7);
}

abstract final class NeraTheme {
  static final ThemeData dark = ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    scaffoldBackgroundColor: NeraColors.background,
    colorScheme: const ColorScheme.dark(
      primary: NeraColors.gold,
      surface: NeraColors.surface,
      error: Color(0xFFFF6B6B),
    ),
    textTheme: ThemeData.dark().textTheme.apply(
      bodyColor: NeraColors.textPrimary,
      displayColor: NeraColors.textPrimary,
    ),
    snackBarTheme: const SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: NeraColors.button,
    ),
  );
}

class _NeraBootstrap extends StatefulWidget {
  const _NeraBootstrap({this.backend, this.imageService});

  final NeraBackend? backend;
  final NeraImageService? imageService;

  @override
  State<_NeraBootstrap> createState() => _NeraBootstrapState();
}

class _NeraBootstrapState extends State<_NeraBootstrap> {
  late final NeraBackend _backend;
  late Future<void> _initialization;

  @override
  void initState() {
    super.initState();
    _backend = widget.backend ?? RemoteNeraBackend();
    _initialization = _backend.initialize();
  }

  @override
  void dispose() {
    _backend.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<void>(
      future: _initialization,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const _LaunchScreen();
        }
        if (snapshot.hasError) {
          return _StartupError(
            message: _friendlyError(snapshot.error),
            onRetry: () => setState(() {
              _initialization = _backend.initialize();
            }),
          );
        }
        return ValueListenableBuilder<bool>(
          valueListenable: _backend.isAuthenticated,
          builder: (context, authenticated, child) {
            final hasPreviousUser = _backend.currentUser.value != null;
            return authenticated
                ? ProfileCreation(
                    backend: _backend,
                    imageService: widget.imageService ?? NeraImageService(),
                  )
                : _PhoneRegistrationScreen(
                    backend: _backend,
                    returningUser: hasPreviousUser,
                  );
          },
        );
      },
    );
  }
}

class _LaunchScreen extends StatelessWidget {
  const _LaunchScreen();

  @override
  Widget build(BuildContext context) => const Scaffold(
    body: Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'NERA',
            style: TextStyle(
              color: NeraColors.gold,
              fontFamily: 'serif',
              fontSize: 48,
              fontWeight: FontWeight.w700,
            ),
          ),
          SizedBox(height: 20),
          SizedBox.square(
            dimension: 22,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ],
      ),
    ),
  );
}

class _StartupError extends StatelessWidget {
  const _StartupError({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.cloud_off_rounded,
                size: 52,
                color: NeraColors.muted,
              ),
              const SizedBox(height: 18),
              const Text(
                'NERA could not connect',
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 10),
              Text(message, textAlign: TextAlign.center),
              const SizedBox(height: 22),
              FilledButton(onPressed: onRetry, child: const Text('Try again')),
            ],
          ),
        ),
      ),
    ),
  );
}

class _PhoneRegistrationScreen extends StatefulWidget {
  _PhoneRegistrationScreen({required this.backend, required this.returningUser});

  final NeraBackend backend;
  final bool returningUser;

  @override
  State<_PhoneRegistrationScreen> createState() =>
      _PhoneRegistrationScreenState();
}

enum _AuthMode { choice, register, login }

class _PhoneRegistrationScreenState extends State<_PhoneRegistrationScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _birthDate = TextEditingController();
  final _phone = TextEditingController(text: '+91 ');
  final _otp = TextEditingController();
  OtpChallenge? _challenge;
  bool _busy = false;
  String? _error;
  _AuthMode _mode = _AuthMode.choice;

  @override
  void dispose() {
    _name.dispose();
    _birthDate.dispose();
    _phone.dispose();
    _otp.dispose();
    super.dispose();
  }

  void _startRegister() {
    setState(() {
      _mode = _AuthMode.register;
      _challenge = null;
      _error = null;
      _otp.clear();
    });
  }

  void _startLogin() {
    setState(() {
      _mode = _AuthMode.login;
      _challenge = null;
      _error = null;
      _otp.clear();
    });
  }

  Future<void> _submit() async {
    if (_challenge == null && _mode == _AuthMode.choice) {
      setState(() => _error = 'Choose login or register to continue.');
      return;
    }
    if (_challenge == null && !_formKey.currentState!.validate()) return;
    if (_challenge != null && _otp.text.trim().length != 6) {
      setState(() => _error = 'Enter the 6-digit OTP.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (_challenge == null) {
        final challenge = await widget.backend.requestOtp(
          name: _mode == _AuthMode.register ? _name.text.trim() : null,
          dateOfBirth: _mode == _AuthMode.register ? _birthDate.text.trim() : null,
          phoneNumber: _phone.text.trim(),
        );
        if (mounted) {
          if (_mode == _AuthMode.register && challenge.purpose == 'login') {
            setState(() {
              _challenge = null;
              _error =
                  'This phone number is already registered. Please enter a different number or log in with your existing number.';
            });
            return;
          }
          if (_mode == _AuthMode.login && challenge.purpose == 'registration') {
            setState(() {
              _challenge = null;
              _error = 'This phone number is not registered yet. Please register first.';
            });
            return;
          }
          setState(() {
            _challenge = challenge;
            if (challenge.developmentOtp != null) {
              _otp.text = challenge.developmentOtp!;
            }
          });
        }
      } else {
        await widget.backend.verifyOtp(
          challengeId: _challenge!.id,
          otp: _otp.text.trim(),
        );
      }
    } catch (error) {
      if (mounted) setState(() => _error = _friendlyError(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(28),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'NERA',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: NeraColors.gold,
                      fontFamily: 'serif',
                      fontSize: 48,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    _challenge == null
                        ? (_mode == _AuthMode.choice
                              ? 'Welcome to NERA'
                              : (_mode == _AuthMode.register
                                    ? 'Create your styling profile'
                                    : 'Log in to NERA'))
                        : 'Verify your phone',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    _challenge == null
                        ? (_mode == _AuthMode.choice
                              ? 'Choose how you want to continue with your styling profile.'
                              : (_mode == _AuthMode.register
                                    ? 'Your profile and wardrobe will be secured with phone OTP authentication.'
                                    : 'Use your phone number to sign in and continue where you left off.'))
                        : 'Enter the code sent to ${_phone.text}.',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: NeraColors.muted,
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 28),
                  if (_challenge == null) ...[
                    if (_mode == _AuthMode.choice) ...[
                      FilledButton(
                        onPressed: _busy ? null : _startRegister,
                        child: const Padding(
                          padding: EdgeInsets.symmetric(vertical: 13),
                          child: Text('Register'),
                        ),
                      ),
                      const SizedBox(height: 12),
                      OutlinedButton(
                        onPressed: _busy ? null : _startLogin,
                        child: const Padding(
                          padding: EdgeInsets.symmetric(vertical: 13),
                          child: Text('Login'),
                        ),
                      ),
                    ] else ...[
                      if (_mode == _AuthMode.register) ...[
                        TextFormField(
                          controller: _name,
                          textCapitalization: TextCapitalization.words,
                          decoration: const InputDecoration(
                            labelText: 'Full name',
                            border: OutlineInputBorder(),
                          ),
                          validator: (value) => (value?.trim().length ?? 0) < 2
                              ? 'Enter your full name.'
                              : null,
                        ),
                        const SizedBox(height: 14),
                        TextFormField(
                          controller: _birthDate,
                          keyboardType: TextInputType.datetime,
                          decoration: const InputDecoration(
                            labelText: 'Date of birth',
                            hintText: 'YYYY-MM-DD',
                            border: OutlineInputBorder(),
                          ),
                          onChanged: (value) {
                            // Auto-insert hyphens for date format YYYY-MM-DD
                            if (value != null && value.length == 4 && !_birthDate.text.contains('-')) {
                              _birthDate.text = value + '-';
                              _birthDate.selection = TextSelection.collapsed(offset: _birthDate.text.length);
                            } else if (value != null && value.length == 7 && _birthDate.text.contains('-')) {
                              _birthDate.text = value + '-';
                              _birthDate.selection = TextSelection.collapsed(offset: _birthDate.text.length);
                            }
                          },
                          validator: (value) =>
                              RegExp(
                                r'^\d{4}-\d{2}-\d{2}$',
                              ).hasMatch(value?.trim() ?? '')
                              ? null
                              : 'Use YYYY-MM-DD.',
                        ),
                        const SizedBox(height: 14),
                      ],
                      TextFormField(
                        controller: _phone,
                        keyboardType: TextInputType.phone,
                        decoration: const InputDecoration(
                          labelText: 'Phone number',
                          hintText: '9876543210',
                          border: OutlineInputBorder(),
                          helperText: 'Example: 9836****',
                        ),
                        onChanged: (value) {
                          // Auto-format phone number: ensure +91 with space or hyphen
                          if (value != null && !value.startsWith('+91')) {
                            _phone.text = '+91 ' + value.replaceAll('+91', '').trim();
                            _phone.selection = TextSelection.collapsed(offset: _phone.text.length);
                          }
                        },
                        validator: (value) =>
                            RegExp(r'^\+[1-9]\d{7,14}$').hasMatch(
                              value?.replaceAll(RegExp(r'[\s()-]'), '') ?? '',
                            )
                            ? null
                            : 'Include country code, for example +91.',
                      ),
                    ],
                  ] else
                    TextField(
                      controller: _otp,
                      keyboardType: TextInputType.number,
                      maxLength: 6,
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 28, letterSpacing: 10),
                      decoration: const InputDecoration(
                        labelText: 'One-time password',
                        border: OutlineInputBorder(),
                      ),
                    ),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    Text(
                      _error!,
                      style: const TextStyle(color: Color(0xFFFF6B6B)),
                    ),
                    if (_mode == _AuthMode.register && _error!.contains('already registered')) ...[
                      const SizedBox(height: 10),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: TextButton(
                          onPressed: _busy ? null : _startLogin,
                          child: const Text('Login with your existing number'),
                        ),
                      ),
                    ],
                    if (_mode == _AuthMode.login && _error!.contains('not registered')) ...[
                      const SizedBox(height: 10),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: TextButton(
                          onPressed: _busy ? null : _startRegister,
                          child: const Text('Register a new account'),
                        ),
                      ),
                    ],
                  ],
                  const SizedBox(height: 20),
                  if (_challenge == null && _mode != _AuthMode.choice) ...[
                    FilledButton(
                      onPressed: _busy ? null : _submit,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 13),
                        child: _busy
                            ? const SizedBox.square(
                                dimension: 20,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : Text(
                                _mode == _AuthMode.register
                                    ? 'Send OTP'
                                    : 'Send OTP',
                              ),
                      ),
                    ),
                  ] else if (_challenge != null) ...[
                    FilledButton(
                      onPressed: _busy ? null : _submit,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 13),
                        child: _busy
                            ? const SizedBox.square(
                                dimension: 20,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Text('Verify & continue'),
                      ),
                    ),
                  ],
                  if (_challenge != null)
                    TextButton(
                      onPressed: _busy
                          ? null
                          : () => setState(() {
                              _challenge = null;
                              _otp.clear();
                            }),
                      child: const Text('Change details'),
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

enum StylingEvent {
  wedding('Wedding', Icons.favorite_rounded, Color(0xFFFF477E)),
  brunch('Brunch', Icons.local_bar_rounded, Color(0xFFC9F2DE)),
  workMeeting('Work Meeting', Icons.business_center_rounded, Color(0xFF9A5663)),
  daily('Daily', Icons.wb_sunny_rounded, Color(0xFFFFD166));

  const StylingEvent(this.label, this.icon, this.iconColor);
  final String label;
  final IconData icon;
  final Color iconColor;
}

class NeraHomeScreen extends StatefulWidget {
  const NeraHomeScreen({
    super.key,
    required this.backend,
    required this.imageService,
  });

  final NeraBackend backend;
  final NeraImageService imageService;

  @override
  State<NeraHomeScreen> createState() => _NeraHomeScreenState();
}

class _NeraHomeScreenState extends State<NeraHomeScreen> {
  late final Stream<List<WardrobeItem>> _wardrobeStream;
  late final Stream<StyleProfile> _profileStream;
  List<WardrobeItem> _wardrobe = const [];
  StyleProfile _profile = const StyleProfile();
  StylingEvent? _selectedEvent;
  OutfitPlan? _outfit;
  bool _wardrobeLoading = true;
  bool _profileLoading = true;
  bool _processingImage = false;
  bool _analyzingProfile = false;
  bool _generatingOutfit = false;

  String? get _eventReadinessMessage {
    if (_wardrobeLoading || _profileLoading) {
      return 'Loading your wardrobe and style profile…';
    }
    if (_wardrobe.length < 2) {
      final remaining = 2 - _wardrobe.length;
      return 'Add $remaining more wardrobe ${remaining == 1 ? 'item' : 'items'} to unlock event styling.';
    }
    if (!_profile.isAnalyzed) {
      return 'Analyze your style profile to unlock event styling.';
    }
    return null;
  }

  @override
  void initState() {
    super.initState();
    _wardrobeStream = widget.backend.watchWardrobe();
    _profileStream = widget.backend.watchProfile();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: StreamBuilder<List<WardrobeItem>>(
              stream: _wardrobeStream,
              builder: (context, wardrobeSnapshot) {
                if (wardrobeSnapshot.hasData) {
                  _wardrobe = wardrobeSnapshot.data!;
                  _wardrobeLoading = false;
                }
                return StreamBuilder<StyleProfile>(
                  stream: _profileStream,
                  builder: (context, profileSnapshot) {
                    if (profileSnapshot.hasData) {
                      _profile = profileSnapshot.data!;
                      _profileLoading = false;
                    }
                    return _buildContent();
                  },
                );
              },
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildContent() => ListView(
    physics: const BouncingScrollPhysics(),
    padding: const EdgeInsets.fromLTRB(20, 18, 20, 36),
    children: [
      _NeraHeader(backend: widget.backend, onAccountTap: _showAccountSheet),
      const SizedBox(height: 28),
      _UploadWardrobeCard(
        busy: _processingImage,
        onTap: _processingImage ? null : _showWardrobeSources,
      ),
      const SizedBox(height: 22),
      _StylingSuggestionsCard(
        selectedEvent: _selectedEvent,
        generating: _generatingOutfit,
        outfit: _outfit,
        wardrobe: _wardrobe,
      ),
      const SizedBox(height: 22),
      _EventStylingCard(
        selected: _selectedEvent,
        enabled: !_generatingOutfit && _eventReadinessMessage == null,
        readinessMessage: _eventReadinessMessage,
        onSelected: _generateOutfit,
      ),
      const SizedBox(height: 22),
      _ShopTheLookCard(
        suggestion: _outfit?.suggestedPurchaseItem,
        hasOutfit: _outfit != null,
      ),
      const SizedBox(height: 22),
      _WardrobeCard(
        loading: _wardrobeLoading,
        items: _wardrobe,
        onAdd: _showWardrobeSources,
        onDelete: _deleteWardrobeItem,
      ),
      const SizedBox(height: 22),
      _StyleProfileCard(
        loading: _profileLoading,
        analyzing: _analyzingProfile,
        profile: _profile,
        onAnalyze: _showProfileSources,
      ),
    ],
  );

  Future<ImageSource?> _chooseImageSource(
    String title, {
    bool allowProductLink = false,
  }) {
    return showModalBottomSheet<ImageSource>(
      context: context,
      backgroundColor: NeraColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) => SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 14, 24, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.white24,
                    borderRadius: BorderRadius.circular(99),
                  ),
                ),
              ),
              const SizedBox(height: 22),
              Text(
                title,
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 10),
              _UploadOption(
                icon: Icons.camera_alt_rounded,
                label: 'Take a photo',
                onTap: () => Navigator.pop(sheetContext, ImageSource.camera),
              ),
              _UploadOption(
                icon: Icons.photo_library_rounded,
                label: 'Choose from gallery',
                onTap: () => Navigator.pop(sheetContext, ImageSource.gallery),
              ),
              if (allowProductLink)
                _UploadOption(
                  icon: Icons.link_rounded,
                  label: 'Add a product link',
                  onTap: () {
                    Navigator.pop(sheetContext);
                    Future<void>.microtask(_showProductLinkDialog);
                  },
                ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _showWardrobeSources() async {
    final source = await _chooseImageSource(
      'Add to your wardrobe',
      allowProductLink: true,
    );
    if (source == null || !mounted) return;
    setState(() => _processingImage = true);
    WardrobeDraft? draft;
    try {
      final picked = await widget.imageService.pick(source);
      if (picked == null) return;
      draft = await widget.backend.analyzeWardrobeImage(
        Uint8List.fromList(picked.bytes),
        picked.fileName,
      );
      if (!mounted) return;
      final reviewed = await _reviewWardrobeDraft(draft);
      if (reviewed == null) {
        await widget.backend.discardWardrobeDraft(draft);
      } else {
        await widget.backend.saveWardrobeDraft(reviewed);
        if (mounted) {
          _showMessage('${reviewed.name} was added to your wardrobe.');
        }
      }
    } catch (error) {
      if (draft != null) await widget.backend.discardWardrobeDraft(draft);
      if (mounted) _showMessage(_friendlyError(error), error: true);
    } finally {
      if (mounted) setState(() => _processingImage = false);
    }
  }

  Future<void> _showProductLinkDialog() async {
    if (!mounted) return;
    final name = TextEditingController();
    final url = TextEditingController();
    var category = 'Accessory';
    final shouldSave = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Add product link'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: name,
                decoration: const InputDecoration(
                  labelText: 'Item name',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: category,
                decoration: const InputDecoration(
                  labelText: 'Category',
                  border: OutlineInputBorder(),
                ),
                items: [
                  for (final value in wardrobeCategories)
                    DropdownMenuItem(value: value, child: Text(value)),
                ],
                onChanged: (value) {
                  if (value != null) setDialogState(() => category = value);
                },
              ),
              const SizedBox(height: 12),
              TextField(
                controller: url,
                keyboardType: TextInputType.url,
                decoration: const InputDecoration(
                  labelText: 'Product URL',
                  hintText: 'https://…',
                  border: OutlineInputBorder(),
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(dialogContext, true),
              child: const Text('Add item'),
            ),
          ],
        ),
      ),
    );
    try {
      if (shouldSave == true) {
        final productUri = Uri.tryParse(url.text.trim());
        if (name.text.trim().isEmpty ||
            productUri == null ||
            !productUri.hasScheme ||
            !productUri.hasAuthority) {
          throw const NeraException(
            'Enter an item name and a complete product URL.',
          );
        }
        await widget.backend.addWardrobeLink(
          name: name.text.trim(),
          category: category,
          productUrl: url.text.trim(),
        );
        if (mounted) {
          _showMessage('${name.text.trim()} was added to your wardrobe.');
        }
      }
    } catch (error) {
      if (mounted) _showMessage(_friendlyError(error), error: true);
    } finally {
      name.dispose();
      url.dispose();
    }
  }

  Future<WardrobeDraft?> _reviewWardrobeDraft(WardrobeDraft draft) async {
    final nameController = TextEditingController(text: draft.name);
    var category = draft.category;
    final result = await showDialog<WardrobeDraft>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Review AI details'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'NERA identified this item. Correct anything before saving.',
                style: TextStyle(color: NeraColors.muted),
              ),
              const SizedBox(height: 18),
              TextField(
                controller: nameController,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(
                  labelText: 'Item name',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 14),
              DropdownButtonFormField<String>(
                initialValue: category,
                decoration: const InputDecoration(
                  labelText: 'Category',
                  border: OutlineInputBorder(),
                ),
                items: [
                  for (final value in wardrobeCategories)
                    DropdownMenuItem(value: value, child: Text(value)),
                ],
                onChanged: (value) {
                  if (value != null) setDialogState(() => category = value);
                },
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Discard'),
            ),
            FilledButton(
              onPressed: () {
                final name = nameController.text.trim();
                if (name.isEmpty) return;
                Navigator.pop(
                  dialogContext,
                  draft.copyWith(name: name, category: category),
                );
              },
              child: const Text('Save item'),
            ),
          ],
        ),
      ),
    );
    nameController.dispose();
    return result;
  }

  Future<void> _showProfileSources() async {
    final source = await _chooseImageSource('Analyze your style profile');
    if (source == null || !mounted) return;
    setState(() => _analyzingProfile = true);
    try {
      final picked = await widget.imageService.pick(source);
      if (picked == null) return;
      await widget.backend.analyzeProfileImage(
        Uint8List.fromList(picked.bytes),
        picked.fileName,
      );
      if (mounted) _showMessage('Your style profile is ready.');
    } catch (error) {
      if (mounted) _showMessage(_friendlyError(error), error: true);
    } finally {
      if (mounted) setState(() => _analyzingProfile = false);
    }
  }

  Future<void> _generateOutfit(StylingEvent event) async {
    setState(() {
      _selectedEvent = event;
      _generatingOutfit = true;
      _outfit = null;
    });
    try {
      final result = await widget.backend.generateOutfit(
        event.label,
        _wardrobe,
        _profile,
      );
      if (mounted) setState(() => _outfit = result);
    } catch (error) {
      if (mounted) _showMessage(_friendlyError(error), error: true);
    } finally {
      if (mounted) setState(() => _generatingOutfit = false);
    }
  }

  Future<void> _deleteWardrobeItem(WardrobeItem item) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Remove item?'),
        content: Text('${item.name} will be removed from your wardrobe.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await widget.backend.deleteWardrobeItem(item);
      if (mounted) _showMessage('${item.name} was removed.');
    } catch (error) {
      if (mounted) _showMessage(_friendlyError(error), error: true);
    }
  }

  void _showAccountSheet() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: NeraColors.surface,
      showDragHandle: true,
      builder: (context) => SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
          child: ValueListenableBuilder<NeraUser?>(
            valueListenable: widget.backend.currentUser,
            builder: (context, user, child) => Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  user?.name ?? 'Your NERA account',
                  style: const TextStyle(
                    fontSize: 21,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  user == null
                      ? 'Your secure account details are unavailable.'
                      : '${user.phoneNumber}\nBorn ${user.dateOfBirth}',
                  style: const TextStyle(color: NeraColors.muted),
                ),
                const SizedBox(height: 20),
                OutlinedButton.icon(
                  onPressed: () async {
                    Navigator.pop(context);
                    await widget.backend.logout();
                  },
                  icon: const Icon(Icons.logout_rounded),
                  label: const Text('Sign out'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _showMessage(String message, {bool error = false}) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message),
          backgroundColor: error ? const Color(0xFF7C2930) : NeraColors.button,
        ),
      );
  }
}

String _friendlyError(Object? error) {
  if (error is NeraException) return error.message;
  if (error is NeraImageException) return error.message;
  final text = error.toString();
  if (text.contains('network') || text.contains('could not be reached')) {
    return 'No network connection. Please reconnect and try again.';
  }
  return text.replaceFirst(RegExp(r'^Exception:\s*'), '');
}

class _NeraHeader extends StatelessWidget {
  const _NeraHeader({required this.backend, required this.onAccountTap});
  final NeraBackend backend;
  final VoidCallback onAccountTap;

  @override
  Widget build(BuildContext context) => Column(
    children: [
      const Text(
        'NERA',
        style: TextStyle(
          color: NeraColors.gold,
          fontFamily: 'serif',
          fontSize: 44,
          height: 1,
          letterSpacing: -1.5,
          fontWeight: FontWeight.w700,
        ),
      ),
      const SizedBox(height: 5),
      const Text(
        'PERSONAL STYLIST AI',
        style: TextStyle(color: NeraColors.blue, fontSize: 15),
      ),
      const SizedBox(height: 8),
      ValueListenableBuilder<String?>(
        valueListenable: backend.userId,
        builder: (context, uid, child) => TextButton.icon(
          onPressed: onAccountTap,
          icon: const Icon(Icons.person_outline_rounded, size: 15),
          label: Text('UserID: ${_shortId(uid)}'),
          style: TextButton.styleFrom(
            foregroundColor: const Color(0xFF60779D),
            textStyle: const TextStyle(fontSize: 11),
            minimumSize: Size.zero,
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          ),
        ),
      ),
    ],
  );
}

String _shortId(String? value) {
  if (value == null || value.isEmpty) return 'Connecting…';
  return value.length <= 9 ? value : '${value.substring(0, 9)}…';
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.child, this.onTap});
  final Widget child;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Material(
    color: NeraColors.surface,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(20),
      side: const BorderSide(color: NeraColors.surfaceBorder),
    ),
    clipBehavior: Clip.antiAlias,
    child: InkWell(
      onTap: onTap,
      child: Padding(padding: const EdgeInsets.all(19), child: child),
    ),
  );
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Text(
    text,
    style: const TextStyle(
      fontSize: 18,
      height: 1.15,
      fontWeight: FontWeight.w700,
    ),
  );
}

class _UploadWardrobeCard extends StatelessWidget {
  const _UploadWardrobeCard({required this.busy, required this.onTap});
  final bool busy;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => _SectionCard(
    onTap: onTap,
    child: Row(
      children: [
        Container(
          width: 53,
          height: 53,
          decoration: const BoxDecoration(
            color: NeraColors.tile,
            shape: BoxShape.circle,
          ),
          child: busy
              ? const Padding(
                  padding: EdgeInsets.all(16),
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(
                  Icons.add_a_photo_outlined,
                  color: NeraColors.gold,
                  size: 28,
                ),
        ),
        const SizedBox(width: 15),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _SectionTitle(busy ? 'Analyzing Item…' : 'Upload Wardrobe'),
              const SizedBox(height: 3),
              Text(
                busy
                    ? 'NERA is identifying your piece'
                    : 'Camera or photo library',
                style: const TextStyle(color: NeraColors.blue, fontSize: 14),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

class _StylingSuggestionsCard extends StatelessWidget {
  const _StylingSuggestionsCard({
    required this.selectedEvent,
    required this.generating,
    required this.outfit,
    required this.wardrobe,
  });
  final StylingEvent? selectedEvent;
  final bool generating;
  final OutfitPlan? outfit;
  final List<WardrobeItem> wardrobe;

  @override
  Widget build(BuildContext context) {
    final selectedItems = outfit == null
        ? const <WardrobeItem>[]
        : wardrobe
              .where((item) => outfit!.wardrobeItemIds.contains(item.id))
              .toList();
    return _SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionTitle('AI Styling Suggestions'),
          const SizedBox(height: 18),
          if (generating)
            const SizedBox(
              height: 88,
              child: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CircularProgressIndicator(strokeWidth: 2),
                    SizedBox(height: 12),
                    Text(
                      'Building your look…',
                      style: TextStyle(color: NeraColors.blue),
                    ),
                  ],
                ),
              ),
            )
          else if (outfit == null)
            const SizedBox(
              height: 72,
              child: Center(
                child: Text(
                  'Choose an event below to create a look.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: NeraColors.muted, fontSize: 15),
                ),
              ),
            )
          else ...[
            Text(
              '${selectedEvent?.label ?? outfit!.eventType} edit',
              style: const TextStyle(
                color: NeraColors.gold,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 12),
            if (selectedItems.isNotEmpty)
              SizedBox(
                height: 92,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: selectedItems.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 10),
                  itemBuilder: (context, index) =>
                      _OutfitItem(item: selectedItems[index]),
                ),
              ),
            const SizedBox(height: 13),
            Text(
              outfit!.rationale,
              style: const TextStyle(color: NeraColors.blue, height: 1.4),
            ),
          ],
        ],
      ),
    );
  }
}

class _OutfitItem extends StatelessWidget {
  const _OutfitItem({required this.item});
  final WardrobeItem item;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 76,
    child: Column(
      children: [
        _WardrobeImage(item: item, size: 62),
        const SizedBox(height: 5),
        Text(
          item.name,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 11),
        ),
      ],
    ),
  );
}

class _EventStylingCard extends StatelessWidget {
  const _EventStylingCard({
    required this.selected,
    required this.enabled,
    required this.readinessMessage,
    required this.onSelected,
  });
  final StylingEvent? selected;
  final bool enabled;
  final String? readinessMessage;
  final ValueChanged<StylingEvent> onSelected;

  @override
  Widget build(BuildContext context) => _SectionCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _SectionTitle('Event Styling'),
        if (readinessMessage != null) ...[
          const SizedBox(height: 7),
          Text(
            readinessMessage!,
            style: const TextStyle(color: NeraColors.muted, height: 1.35),
          ),
        ],
        const SizedBox(height: 18),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 12,
          crossAxisSpacing: 12,
          childAspectRatio: 2.15,
          children: [
            for (final event in StylingEvent.values)
              _EventTile(
                event: event,
                selected: selected == event,
                onTap: enabled ? () => onSelected(event) : null,
              ),
          ],
        ),
      ],
    ),
  );
}

class _EventTile extends StatelessWidget {
  const _EventTile({
    required this.event,
    required this.selected,
    required this.onTap,
  });
  final StylingEvent event;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => AnimatedContainer(
    duration: const Duration(milliseconds: 180),
    decoration: BoxDecoration(
      color: NeraColors.tile,
      borderRadius: BorderRadius.circular(10),
      border: Border.all(
        color: selected ? NeraColors.gold : Colors.transparent,
        width: 1.4,
      ),
    ),
    child: Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(event.icon, color: event.iconColor, size: 21),
            const SizedBox(width: 8),
            Flexible(child: Text(event.label, textAlign: TextAlign.center)),
          ],
        ),
      ),
    ),
  );
}

class _ShopTheLookCard extends StatelessWidget {
  const _ShopTheLookCard({required this.suggestion, required this.hasOutfit});
  final SuggestedPurchase? suggestion;
  final bool hasOutfit;

  @override
  Widget build(BuildContext context) => _SectionCard(
    onTap: suggestion == null
        ? null
        : () async {
            final uri = suggestion!.buyUrl == null
                ? Uri.https('www.google.com', '/search', {
                    'tbm': 'shop',
                    'q': suggestion!.name,
                  })
                : Uri.parse(suggestion!.buyUrl!);
            if (!await launchUrl(uri, mode: LaunchMode.externalApplication) &&
                context.mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Could not open the shopping link.'),
                ),
              );
            }
          },
    child: Row(
      children: [
        const Icon(
          Icons.shopping_bag_outlined,
          color: NeraColors.gold,
          size: 30,
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const _SectionTitle('Shop the Look'),
              const SizedBox(height: 4),
              Text(
                suggestion == null
                    ? hasOutfit
                          ? 'Your generated look does not need an extra piece'
                          : 'Generate an outfit to unlock a shopping suggestion'
                    : '${suggestion!.name} · ${suggestion!.type}',
                style: const TextStyle(color: NeraColors.blue, fontSize: 14),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

class _WardrobeCard extends StatelessWidget {
  const _WardrobeCard({
    required this.loading,
    required this.items,
    required this.onAdd,
    required this.onDelete,
  });
  final bool loading;
  final List<WardrobeItem> items;
  final VoidCallback onAdd;
  final ValueChanged<WardrobeItem> onDelete;

  @override
  Widget build(BuildContext context) => _SectionCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Expanded(child: _SectionTitle('My Wardrobe')),
            TextButton.icon(
              onPressed: onAdd,
              icon: const Icon(Icons.add, size: 18),
              label: const Text('Add'),
            ),
          ],
        ),
        const SizedBox(height: 12),
        if (!loading && items.length < 2) ...[
          Text(
            '${items.length}/2 items added · Add ${2 - items.length} more to unlock Event Styling',
            style: const TextStyle(color: NeraColors.gold, fontSize: 12),
          ),
          const SizedBox(height: 10),
        ],
        if (loading)
          const Center(
            child: Padding(
              padding: EdgeInsets.all(24),
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          )
        else if (items.isEmpty)
          const SizedBox(
            height: 82,
            child: Center(
              child: Text(
                'Your closet is empty!',
                style: TextStyle(color: NeraColors.muted),
              ),
            ),
          )
        else
          SizedBox(
            height: 150,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: items.length,
              separatorBuilder: (_, _) => const SizedBox(width: 12),
              itemBuilder: (context, index) {
                final item = items[index];
                return SizedBox(
                  width: 104,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Stack(
                        children: [
                          _WardrobeImage(item: item, size: 104),
                          Positioned(
                            right: 2,
                            top: 2,
                            child: IconButton.filledTonal(
                              tooltip: 'Remove ${item.name}',
                              visualDensity: VisualDensity.compact,
                              iconSize: 16,
                              onPressed: () => onDelete(item),
                              icon: const Icon(Icons.close),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(
                        item.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      Text(
                        item.category,
                        style: const TextStyle(
                          fontSize: 11,
                          color: NeraColors.muted,
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
      ],
    ),
  );
}

class _WardrobeImage extends StatefulWidget {
  const _WardrobeImage({required this.item, required this.size});
  final WardrobeItem item;
  final double size;

  @override
  State<_WardrobeImage> createState() => _WardrobeImageState();
}

class _WardrobeImageState extends State<_WardrobeImage> {
  Future<Uint8List>? _localBytes;

  @override
  void initState() {
    super.initState();
    _loadLocalImage();
  }

  @override
  void didUpdateWidget(covariant _WardrobeImage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.item.imagePath != widget.item.imagePath) _loadLocalImage();
  }

  void _loadLocalImage() {
    _localBytes = widget.item.imagePath.isEmpty
        ? null
        : XFile(widget.item.imagePath).readAsBytes();
  }

  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: BorderRadius.circular(10),
    child: Container(
      width: widget.size,
      height: widget.size,
      color: NeraColors.tile,
      child: _localBytes != null
          ? FutureBuilder<Uint8List>(
              future: _localBytes,
              builder: (context, snapshot) {
                if (snapshot.hasData) {
                  return Image.memory(snapshot.data!, fit: BoxFit.cover);
                }
                if (snapshot.hasError) return const _BrokenWardrobeImage();
                return const Center(
                  child: CircularProgressIndicator(strokeWidth: 2),
                );
              },
            )
          : widget.item.imageUrl.isNotEmpty
          ? Image.network(
              widget.item.imageUrl,
              fit: BoxFit.cover,
              errorBuilder: (_, _, _) => const _BrokenWardrobeImage(),
            )
          : const Icon(Icons.checkroom_rounded, color: NeraColors.blue),
    ),
  );
}

class _BrokenWardrobeImage extends StatelessWidget {
  const _BrokenWardrobeImage();

  @override
  Widget build(BuildContext context) =>
      const Icon(Icons.broken_image_outlined, color: NeraColors.muted);
}

class _StyleProfileCard extends StatelessWidget {
  const _StyleProfileCard({
    required this.loading,
    required this.analyzing,
    required this.profile,
    required this.onAnalyze,
  });
  final bool loading;
  final bool analyzing;
  final StyleProfile profile;
  final VoidCallback onAnalyze;

  @override
  Widget build(BuildContext context) => _SectionCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _SectionTitle('My Style Profile'),
        const SizedBox(height: 18),
        if (loading)
          const Center(child: CircularProgressIndicator(strokeWidth: 2))
        else ...[
          _ProfileRow(
            label: 'Body Type',
            value: profile.bodyType ?? 'Not Analyzed',
          ),
          const SizedBox(height: 14),
          _ProfileRow(
            label: 'Skin Tone',
            value: profile.skinTone ?? 'Not Analyzed',
          ),
          const SizedBox(height: 18),
          FilledButton.icon(
            onPressed: analyzing ? null : onAnalyze,
            icon: analyzing
                ? const SizedBox.square(
                    dimension: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.face_retouching_natural_rounded, size: 19),
            label: Text(
              analyzing
                  ? 'Analyzing…'
                  : profile.isAnalyzed
                  ? 'Analyze Again'
                  : 'Analyze My Photo',
            ),
            style: FilledButton.styleFrom(
              backgroundColor: NeraColors.button,
              foregroundColor: Colors.white,
            ),
          ),
        ],
      ],
    ),
  );
}

class _ProfileRow extends StatelessWidget {
  const _ProfileRow({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Expanded(
        child: Text(
          label,
          style: const TextStyle(color: NeraColors.blue, fontSize: 15),
        ),
      ),
      const SizedBox(width: 20),
      Flexible(
        child: Text(
          value,
          textAlign: TextAlign.right,
          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
        ),
      ),
    ],
  );
}

class _UploadOption extends StatelessWidget {
  const _UploadOption({
    required this.icon,
    required this.label,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => ListTile(
    contentPadding: EdgeInsets.zero,
    leading: Icon(icon, color: NeraColors.gold),
    title: Text(label),
    trailing: const Icon(Icons.chevron_right_rounded, color: Colors.white38),
    onTap: onTap,
  );
}

// Profile Creation Screen
class ProfileCreation extends StatefulWidget {
  const ProfileCreation({
    super.key,
    required this.backend,
    required this.imageService,
  });

  final NeraBackend backend;
  final NeraImageService imageService;

  @override
  State<ProfileCreation> createState() => _ProfileCreationState();
}

class _ProfileCreationState extends State<ProfileCreation> {
  late bool _processingImage;
  late StyleProfile? _analysisResult;
  String? _validationErrorMessage;

  @override
  void initState() {
    super.initState();
    _processingImage = false;
    _analysisResult = null;
    _validationErrorMessage = null;
  }

  Future<ImageSource?> _pickImageSource() async {
    return await showModalBottomSheet<ImageSource>(
      context: context,
      backgroundColor: NeraColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) => SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 14, 24, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Upload Full-Length Image',
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 10),
              Text(
                'We will analyze your body shape, skin tone, hair color, and more',
                style: TextStyle(color: NeraColors.muted, height: 1.4),
              ),
              const SizedBox(height: 16),
              _UploadOption(
                icon: Icons.camera_alt_rounded,
                label: 'Take a photo',
                onTap: () => Navigator.pop(sheetContext, ImageSource.camera),
              ),
              _UploadOption(
                icon: Icons.photo_library_rounded,
                label: 'Choose from gallery',
                onTap: () => Navigator.pop(sheetContext, ImageSource.gallery),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _handleImageUpload() async {
    try {
      setState(() {
        _processingImage = true;
        _validationErrorMessage = null;
      });
      final source = await _pickImageSource();
      if (source == null) return;

      final result = await _analyzeImage(source);
      if (mounted) {
        setState(() {
          _processingImage = false;
          _analysisResult = result;
          _validationErrorMessage = null;
        });
        _showMessage('✓ Analysis Complete', error: false);
      }
    } catch (error) {
      if (mounted) {
        final message = _friendlyError(error);
        setState(() {
          _validationErrorMessage = message;
        });
        _showMessage(message, error: true);
      }
    } finally {
      if (mounted) setState(() => _processingImage = false);
    }
  }

  Future<StyleProfile> _analyzeImage(ImageSource source) async {
    final pickedImage = await widget.imageService!.pick(source);
    if (pickedImage == null) {
      throw const NeraException('No image was selected.');
    }

    final Uint8List imageBytes = Uint8List.fromList(pickedImage.bytes);
    final String fileName = pickedImage.fileName;

    return await widget.backend.analyzeProfileImage(imageBytes, fileName);
  }

  void _showMessage(String message, {bool error = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: error ? const Color(0xFF7C2930) : NeraColors.button,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Create Profile')),
      body: Column(
        children: [
          const Text(
            'Upload full-length image',
            style: TextStyle(fontSize: 16),
          ),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: _processingImage ? null : _handleImageUpload,
            child: _processingImage
                ? const SizedBox.square(
                    dimension: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Upload Image'),
          ),
          const SizedBox(height: 24),
          if (_validationErrorMessage != null) ...[
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              margin: const EdgeInsets.only(bottom: 20),
              decoration: BoxDecoration(
                color: const Color(0xFF3A1D1F),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Full-length photo required',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    _validationErrorMessage!,
                    style: const TextStyle(
                      fontSize: 14,
                      color: Colors.white70,
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 14),
                  FilledButton(
                    onPressed: _processingImage ? null : _handleImageUpload,
                    child: const Text('Upload Another Photo'),
                  ),
                ],
              ),
            ),
          ],
          const Text(
            'Analysis will be done using Gemini AI',
            style: TextStyle(
              fontSize: 14,
              color: NeraColors.muted,
              height: 1.5,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'We will analyze your body shape, skin tone, hair color, and more',
            style: const TextStyle(
              fontSize: 12,
              color: NeraColors.muted,
              height: 1.4,
            ),
          ),
        ],
      ),
    );
  }
}
