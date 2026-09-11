import 'package:flutter/foundation.dart';
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
  final _phone = TextEditingController();
  final _otp = TextEditingController();
  OtpChallenge? _challenge;
  _AuthMode _mode = _AuthMode.choice;
  bool _busy = false;
  String? _error;
  DateTime? _selectedDob;

  @override
  void initState() {
    super.initState();
    // Any previous OTP/API error is stale the moment the user changes the
    // input that produced it, so it must not linger on a form the user is
    // actively editing again.
    _phone.addListener(_clearErrorOnEdit);
    _otp.addListener(_clearErrorOnEdit);
  }

  @override
  void dispose() {
    _phone.removeListener(_clearErrorOnEdit);
    _otp.removeListener(_clearErrorOnEdit);
    _name.dispose();
    _phone.dispose();
    _otp.dispose();
    super.dispose();
  }

  void _clearErrorOnEdit() {
    if (_error != null) setState(() => _error = null);
  }

  void _selectMode(_AuthMode mode) => setState(() {
    _mode = mode;
    _challenge = null;
    _error = null;
    _otp.clear();
  });

  void _changePhoneNumber() => setState(() {
    _challenge = null;
    _error = null;
    _otp.clear();
  });

  Future<void> _pickBirthDate() async {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDob ?? DateTime(now.year - 18, now.month, now.day),
      firstDate: DateTime(1900),
      lastDate: today,
      helpText: 'Select date of birth',
    );
    if (picked == null || !mounted) return;
    setState(() => _selectedDob = DateTime(picked.year, picked.month, picked.day));
    _formKey.currentState?.validate();
  }

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
          name: _mode == _AuthMode.register ? cleanFullName(_name.text) : null,
          dateOfBirth: _mode == _AuthMode.register && _selectedDob != null
              ? isoDate(_selectedDob!)
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
                            validator: validateFullName,
                          ),
                          const SizedBox(height: NeraSpacing.md),
                          FormField<DateTime>(
                            validator: (_) => validateBirthDate(_selectedDob),
                            builder: (field) => InkWell(
                              key: const Key('dateOfBirthField'),
                              borderRadius: BorderRadius.circular(
                                NeraRadius.sm,
                              ),
                              onTap: _busy ? null : _pickBirthDate,
                              child: InputDecorator(
                                decoration: InputDecoration(
                                  labelText: 'Date of birth',
                                  hintText: 'Select date of birth',
                                  errorText: field.errorText,
                                  suffixIcon: const Icon(
                                    Icons.calendar_today_outlined,
                                    size: 20,
                                  ),
                                ),
                                child: Text(
                                  _selectedDob == null
                                      ? ''
                                      : displayDate(_selectedDob!),
                                  style: Theme.of(context).textTheme.bodyLarge,
                                ),
                              ),
                            ),
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
                          validator: validatePhoneNumber,
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
                          onPressed: _busy ? null : _changePhoneNumber,
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

String _authErrorMessage(Object error, {required bool verifying}) => friendlyError(
  error,
  fallback: verifying ? 'Something went wrong. Please try again.' : "We couldn't send the code. Try again.",
);

/// Exactly 10 digits, with the first digit restricted to 6-9 as required for
/// Indian mobile numbers (the fixed +91 prefix is not editable, so this is
/// the entire number). Rejects incomplete numbers, letters/special
/// characters (already filtered by the field's input formatter, but kept
/// here so the validator is correct standalone), and placeholder values
/// like 0000000000.
final RegExp _indianMobileNumber = RegExp(r'^[6-9]\d{9}$');

String? validatePhoneNumber(String? value) =>
    _indianMobileNumber.hasMatch(value?.trim() ?? '')
    ? null
    : 'Please enter a valid 10-digit mobile number.';

/// Trims leading/trailing whitespace and collapses runs of internal
/// whitespace (including newlines/tabs) to a single space, so "  Riya
/// Sharma " becomes "Riya Sharma".
String cleanFullName(String value) =>
    value.trim().replaceAll(RegExp(r'\s+'), ' ');

/// Allows genuine multi-word names (e.g. "Riya Sharma") with common name
/// punctuation (apostrophes, hyphens, periods for initials), while rejecting
/// empty input, numbers-only input, and special-character-only input.
/// Deliberately permissive otherwise — this should never overvalidate a
/// real name.
String? validateFullName(String? value) {
  final clean = cleanFullName(value ?? '');
  if (clean.length < 2) return 'Please enter your full name.';
  if (!RegExp(r'^[A-Za-z][A-Za-z' "'" r'.-]*(?: [A-Za-z][A-Za-z' "'" r'.-]*)*$')
      .hasMatch(clean)) {
    return 'Please enter a valid name.';
  }
  return null;
}

/// null means "no date picked yet" — required-field validation, since the
/// date picker (not free text) is the only way to set a value. A picked date
/// is always a real calendar date and never in the future (enforced by the
/// picker's firstDate/lastDate bounds), so this only guards the empty case.
String? validateBirthDate(DateTime? value) =>
    value == null ? 'Please select your date of birth.' : null;

/// ISO 8601 calendar date (YYYY-MM-DD), the format saved to the backend.
String isoDate(DateTime value) =>
    '${value.year.toString().padLeft(4, '0')}-'
    '${value.month.toString().padLeft(2, '0')}-'
    '${value.day.toString().padLeft(2, '0')}';

const _monthNames = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/// Friendly display form for the date picker field, e.g. "05 May 1995".
String displayDate(DateTime value) =>
    '${value.day.toString().padLeft(2, '0')} '
    '${_monthNames[value.month - 1]} ${value.year}';
