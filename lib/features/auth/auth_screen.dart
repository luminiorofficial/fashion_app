import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/errors/friendly_error.dart';
import '../../core/theme/theme.dart';
import '../../core/widgets/widgets.dart';
import '../../models/nera_models.dart';
import '../../services/nera_backend.dart';

enum _AuthMode { choice, register, login }

class AuthScreen extends StatefulWidget {
  const AuthScreen({
    super.key,
    required this.backend,
    required this.returningUser,
  });
  final NeraBackend backend;
  final bool returningUser;

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _birthDate = TextEditingController();
  final _phone = TextEditingController();
  final _otp = TextEditingController();
  OtpChallenge? _challenge;
  _AuthMode _mode = _AuthMode.choice;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _birthDate.dispose();
    _phone.dispose();
    _otp.dispose();
    super.dispose();
  }

  void _selectMode(_AuthMode mode) => setState(() {
    _mode = mode;
    _challenge = null;
    _error = null;
    _otp.clear();
  });

  Future<void> _submit() async {
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
          dateOfBirth: _mode == _AuthMode.register
              ? _birthDate.text.trim()
              : null,
          phoneNumber: '+91${_phone.text.trim()}',
        );
        if (!mounted) return;
        if (_mode == _AuthMode.register && challenge.purpose == 'login') {
          setState(
            () => _error =
                'This phone number is already registered. Please log in instead.',
          );
          return;
        }
        if (_mode == _AuthMode.login && challenge.purpose == 'registration') {
          setState(
            () => _error =
                'This phone number is not registered yet. Please register first.',
          );
          return;
        }
        setState(() {
          _challenge = challenge;
          if (challenge.developmentOtp != null) {
            _otp.text = challenge.developmentOtp!;
          }
        });
      } else {
        await widget.backend.verifyOtp(
          challengeId: _challenge!.id,
          otp: _otp.text.trim(),
        );
      }
    } catch (error) {
      if (mounted) setState(() => _error = friendlyError(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(NeraSpacing.xxl),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const NeraWordmark(size: 52, showTagline: true),
                  const SizedBox(height: NeraSpacing.xxxl),
                  Text(
                    _challenge != null
                        ? 'Verify your phone'
                        : _mode == _AuthMode.choice
                        ? 'Your wardrobe, styled around you.'
                        : _mode == _AuthMode.register
                        ? 'Create your profile'
                        : 'Welcome back',
                    textAlign: TextAlign.center,
                    style: NeraTheme.display(30),
                  ),
                  const SizedBox(height: NeraSpacing.sm),
                  Text(
                    _challenge != null
                        ? 'Enter the code sent to +91 ${_phone.text}.'
                        : 'Private, personal styling secured with phone verification.',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodyLarge,
                  ),
                  const SizedBox(height: NeraSpacing.xxl),
                  if (_mode == _AuthMode.choice) ...[
                    NeraButton(
                      label: 'Register',
                      onPressed: () => _selectMode(_AuthMode.register),
                    ),
                    const SizedBox(height: NeraSpacing.md),
                    NeraButton(
                      label: 'Login',
                      style: NeraButtonStyleType.secondary,
                      onPressed: () => _selectMode(_AuthMode.login),
                    ),
                  ] else if (_challenge == null) ...[
                    if (_mode == _AuthMode.register) ...[
                      TextFormField(
                        controller: _name,
                        textCapitalization: TextCapitalization.words,
                        decoration: const InputDecoration(
                          labelText: 'Full name',
                        ),
                        validator: (value) => (value?.trim().length ?? 0) < 2
                            ? 'Enter your full name.'
                            : null,
                      ),
                      const SizedBox(height: NeraSpacing.md),
                      TextFormField(
                        controller: _birthDate,
                        keyboardType: TextInputType.datetime,
                        decoration: const InputDecoration(
                          labelText: 'Date of birth',
                          hintText: 'YYYY-MM-DD',
                        ),
                        validator: (value) =>
                            RegExp(
                              r'^\d{4}-\d{2}-\d{2}$',
                            ).hasMatch(value?.trim() ?? '')
                            ? null
                            : 'Use YYYY-MM-DD.',
                      ),
                      const SizedBox(height: NeraSpacing.md),
                    ],
                    TextFormField(
                      controller: _phone,
                      keyboardType: TextInputType.number,
                      maxLength: 10,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                      decoration: const InputDecoration(
                        labelText: 'Phone number',
                        hintText: '9876543210',
                        prefixText: '+91  ',
                        counterText: '',
                      ),
                      validator: (value) =>
                          RegExp(r'^\d{10}$').hasMatch(value?.trim() ?? '')
                          ? null
                          : 'Enter a 10-digit mobile number.',
                    ),
                    const SizedBox(height: NeraSpacing.lg),
                    NeraButton(
                      label: 'Send OTP',
                      loading: _busy,
                      onPressed: _submit,
                    ),
                    NeraButton(
                      label: 'Back',
                      style: NeraButtonStyleType.text,
                      onPressed: _busy
                          ? null
                          : () => _selectMode(_AuthMode.choice),
                    ),
                  ] else ...[
                    TextField(
                      controller: _otp,
                      keyboardType: TextInputType.number,
                      maxLength: 6,
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 28, letterSpacing: 10),
                      decoration: const InputDecoration(
                        labelText: 'One-time password',
                      ),
                    ),
                    const SizedBox(height: NeraSpacing.md),
                    NeraButton(
                      label: 'Verify & continue',
                      loading: _busy,
                      onPressed: _submit,
                    ),
                    NeraButton(
                      label: 'Change details',
                      style: NeraButtonStyleType.text,
                      onPressed: _busy
                          ? null
                          : () => setState(() => _challenge = null),
                    ),
                  ],
                  if (_error != null) ...[
                    const SizedBox(height: NeraSpacing.md),
                    Text(
                      _error!,
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: NeraColors.error),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
