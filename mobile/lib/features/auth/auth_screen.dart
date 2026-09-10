import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

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
    } catch (error, stackTrace) {
      if (kDebugMode) {
        debugPrint('Authentication request failed: $error');
        debugPrintStack(stackTrace: stackTrace);
      }
      if (mounted) {
        setState(
          () =>
              _error = _authErrorMessage(error, verifying: _challenge != null),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final verifying = _challenge != null;
    return Scaffold(
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) => SingleChildScrollView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.fromLTRB(
              NeraSpacing.xl,
              NeraSpacing.xxl,
              NeraSpacing.xl,
              NeraSpacing.xxl,
            ),
            child: Align(
              alignment: Alignment.topCenter,
              child: ConstrainedBox(
                constraints: BoxConstraints(
                  maxWidth: 420,
                  minHeight: (constraints.maxHeight - 56).clamp(
                    0,
                    double.infinity,
                  ),
                ),
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const NeraWordmark(size: 48),
                      const SizedBox(height: NeraSpacing.sm),
                      Text(
                        'Your personal stylist',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.labelMedium
                            ?.copyWith(
                              color: NeraColors.muted,
                              letterSpacing: 0.4,
                            ),
                      ),
                      const SizedBox(height: NeraSpacing.xxxl),
                      Text(
                        verifying
                            ? 'Enter verification code'
                            : 'Welcome to NERA',
                        textAlign: TextAlign.center,
                        style: NeraTheme.heading(28, letterSpacing: -0.5),
                      ),
                      const SizedBox(height: NeraSpacing.sm),
                      Text(
                        verifying
                            ? 'We sent a 6-digit code to ${_maskedPhone(_phone.text)}.'
                            : 'Style your wardrobe around you.',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodyLarge,
                      ),
                      const SizedBox(height: NeraSpacing.xxxl),
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
                      ] else if (!verifying) ...[
                        if (_mode == _AuthMode.register) ...[
                          TextFormField(
                            controller: _name,
                            textCapitalization: TextCapitalization.words,
                            textInputAction: TextInputAction.next,
                            decoration: const InputDecoration(
                              labelText: 'Full name',
                            ),
                            validator: (value) =>
                                (value?.trim().length ?? 0) < 2
                                ? 'Enter your full name.'
                                : null,
                          ),
                          const SizedBox(height: NeraSpacing.md),
                          TextFormField(
                            controller: _birthDate,
                            keyboardType: TextInputType.number,
                            textInputAction: TextInputAction.next,
                            maxLength: 10,
                            inputFormatters: [_BirthDateInputFormatter()],
                            decoration: const InputDecoration(
                              labelText: 'Date of birth',
                              hintText: 'YYYY-MM-DD',
                              counterText: '',
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
                          keyboardType: TextInputType.phone,
                          textInputAction: TextInputAction.done,
                          maxLength: 10,
                          inputFormatters: [
                            FilteringTextInputFormatter.digitsOnly,
                          ],
                          decoration: const InputDecoration(
                            labelText: 'Mobile number',
                            hintText: '9876543210',
                            prefixText: '+91  ',
                            counterText: '',
                          ),
                          validator: (value) =>
                              RegExp(r'^\d{10}$').hasMatch(value?.trim() ?? '')
                              ? null
                              : 'Enter a 10-digit mobile number.',
                          onFieldSubmitted: (_) => _submit(),
                        ),
                        const SizedBox(height: NeraSpacing.xl),
                        _AuthSubmitButton(
                          label: 'Continue',
                          loadingLabel: 'Sending code…',
                          loading: _busy,
                          onPressed: _submit,
                        ),
                        const SizedBox(height: NeraSpacing.sm),
                        NeraButton(
                          label: 'Back',
                          style: NeraButtonStyleType.text,
                          onPressed: _busy
                              ? null
                              : () => _selectMode(_AuthMode.choice),
                        ),
                      ] else ...[
                        _OtpField(
                          controller: _otp,
                          enabled: !_busy,
                          onSubmitted: _submit,
                        ),
                        const SizedBox(height: NeraSpacing.xl),
                        _AuthSubmitButton(
                          label: 'Verify',
                          loadingLabel: 'Verifying…',
                          loading: _busy,
                          onPressed: _submit,
                        ),
                        const SizedBox(height: NeraSpacing.sm),
                        NeraButton(
                          label: 'Change phone number',
                          style: NeraButtonStyleType.text,
                          onPressed: _busy
                              ? null
                              : () => setState(() => _challenge = null),
                        ),
                      ],
                      if (_error != null) ...[
                        const SizedBox(height: NeraSpacing.lg),
                        _AuthError(message: _error!),
                      ],
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _OtpField extends StatefulWidget {
  const _OtpField({
    required this.controller,
    required this.enabled,
    required this.onSubmitted,
  });

  final TextEditingController controller;
  final bool enabled;
  final VoidCallback onSubmitted;

  @override
  State<_OtpField> createState() => _OtpFieldState();
}

class _OtpFieldState extends State<_OtpField> {
  final _focusNode = FocusNode();

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_refresh);
    _focusNode.addListener(_refresh);
  }

  @override
  void didUpdateWidget(covariant _OtpField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      oldWidget.controller.removeListener(_refresh);
      widget.controller.addListener(_refresh);
    }
  }

  @override
  void dispose() {
    widget.controller.removeListener(_refresh);
    _focusNode
      ..removeListener(_refresh)
      ..dispose();
    super.dispose();
  }

  void _refresh() {
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final digits = widget.controller.text;
    final activeIndex = digits.length < 6 ? digits.length : 5;
    return Semantics(
      label: 'Verification code',
      value: '${digits.length} of 6 digits entered',
      textField: true,
      child: SizedBox(
        height: 54,
        child: Stack(
          children: [
            Row(
              children: [
                for (var index = 0; index < 6; index++) ...[
                  Expanded(
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 140),
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: NeraColors.surface,
                        borderRadius: BorderRadius.circular(NeraRadius.sm),
                        border: Border.all(
                          color: _focusNode.hasFocus && index == activeIndex
                              ? NeraColors.ink
                              : NeraColors.surfaceBorder,
                          width: _focusNode.hasFocus && index == activeIndex
                              ? 1.5
                              : 1,
                        ),
                      ),
                      child: Text(
                        index < digits.length ? digits[index] : '',
                        style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                  if (index < 5) const SizedBox(width: NeraSpacing.sm),
                ],
              ],
            ),
            Positioned.fill(
              child: TextField(
                controller: widget.controller,
                focusNode: _focusNode,
                autofocus: true,
                enabled: widget.enabled,
                keyboardType: TextInputType.number,
                textInputAction: TextInputAction.done,
                enableSuggestions: false,
                autocorrect: false,
                maxLength: 6,
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(6),
                ],
                style: const TextStyle(color: Colors.transparent, fontSize: 1),
                cursorColor: Colors.transparent,
                decoration: const InputDecoration(
                  hintText: 'Verification code',
                  hintStyle: TextStyle(color: Colors.transparent),
                  counterText: '',
                  filled: false,
                  contentPadding: EdgeInsets.zero,
                  border: InputBorder.none,
                  enabledBorder: InputBorder.none,
                  focusedBorder: InputBorder.none,
                  disabledBorder: InputBorder.none,
                ),
                onSubmitted: (_) => widget.onSubmitted(),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AuthSubmitButton extends StatelessWidget {
  const _AuthSubmitButton({
    required this.label,
    required this.loadingLabel,
    required this.loading,
    required this.onPressed,
  });

  final String label;
  final String loadingLabel;
  final bool loading;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: double.infinity,
    child: FilledButton(
      onPressed: loading ? null : onPressed,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (loading) ...[
            const SizedBox.square(
              dimension: 17,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
            const SizedBox(width: NeraSpacing.sm),
          ],
          Flexible(child: Text(loading ? loadingLabel : label)),
        ],
      ),
    ),
  );
}

class _AuthError extends StatelessWidget {
  const _AuthError({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const Icon(
        Icons.error_outline_rounded,
        color: NeraColors.error,
        size: 18,
      ),
      const SizedBox(width: NeraSpacing.sm),
      Expanded(
        child: Text(
          message,
          style: Theme.of(
            context,
          ).textTheme.bodyMedium?.copyWith(color: NeraColors.error),
        ),
      ),
    ],
  );
}

String _maskedPhone(String phone) {
  final digits = phone.replaceAll(RegExp(r'\D'), '');
  if (digits.length < 4) return '+91';
  return '+91 ••••••${digits.substring(digits.length - 4)}';
}

String _authErrorMessage(Object error, {required bool verifying}) {
  if (error is NeraException) {
    final code = (error.code ?? '').toUpperCase();
    final message = error.message.toLowerCase();
    if (verifying &&
        (code.contains('INVALID_OTP') ||
            code.contains('OTP_INVALID') ||
            message.contains('incorrect') ||
            message.contains('invalid code') ||
            message.contains('invalid otp'))) {
      return 'Invalid code. Please try again.';
    }
  }
  return verifying
      ? 'Something went wrong. Please try again.'
      : "We couldn't send the code. Try again.";
}

class _BirthDateInputFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    var digits = newValue.text.replaceAll(RegExp(r'\D'), '');
    if (digits.length > 8) digits = digits.substring(0, 8);

    final formatted = StringBuffer();
    for (var index = 0; index < digits.length; index++) {
      if (index == 4 || index == 6) formatted.write('-');
      formatted.write(digits[index]);
    }

    final text = formatted.toString();
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }
}
