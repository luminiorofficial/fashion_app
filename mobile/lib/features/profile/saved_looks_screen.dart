import 'package:flutter/material.dart';

import '../../core/errors/friendly_error.dart';
import '../../core/theme/theme.dart';
import '../../core/widgets/widgets.dart';
import '../../models/nera_models.dart';
import '../../services/nera_backend.dart';
import '../try_on/try_on_result_screen.dart';

class SavedLooksScreen extends StatefulWidget {
  const SavedLooksScreen({
    super.key,
    required this.backend,
    required this.wardrobe,
  });

  final NeraBackend backend;
  final List<WardrobeItem> wardrobe;

  @override
  State<SavedLooksScreen> createState() => _SavedLooksScreenState();
}

class _SavedLooksScreenState extends State<SavedLooksScreen> {
  bool _loading = true;
  String? _error;
  List<TryOnResult> _looks = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final looks = await widget.backend.listSavedLooks();
      if (mounted) setState(() => _looks = looks);
    } catch (error) {
      if (mounted) setState(() => _error = friendlyError(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _open(TryOnResult look) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => TryOnResultScreen(
          backend: widget.backend,
          initialResult: look,
          wardrobe: widget.wardrobe,
        ),
      ),
    );
    // The look may have been unsaved from inside the detail screen.
    if (mounted) await _load();
  }

  Future<void> _unsave(TryOnResult look) async {
    final previous = _looks;
    setState(() => _looks = _looks.where((item) => item.id != look.id).toList());
    try {
      await widget.backend.unsaveTryOnLook(look.id);
      if (mounted) showNeraSnackBar(context, 'Look removed.');
    } catch (error) {
      if (mounted) {
        setState(() => _looks = previous);
        showNeraSnackBar(context, friendlyError(error), error: true);
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Saved Looks')),
    body: SafeArea(
      child: _error != null
          ? NeraErrorState(message: _error!, onRetry: _load)
          : _loading
          ? GridView.count(
              padding: const EdgeInsets.all(20),
              crossAxisCount: 2,
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              children: [
                for (var i = 0; i < 4; i++)
                  const NeraSkeleton(height: 220, radius: NeraRadius.md),
              ],
            )
          : _looks.isEmpty
          ? const NeraEmptyState(
              icon: Icons.bookmark_border_rounded,
              title: 'No saved looks yet',
              message:
                  'Save a virtual try-on result to see it here. Unsaved '
                  'results are cleared automatically after 24 hours.',
            )
          : GridView.builder(
              padding: const EdgeInsets.all(20),
              itemCount: _looks.length,
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: .72,
              ),
              itemBuilder: (context, index) {
                final look = _looks[index];
                return GestureDetector(
                  onTap: () => _open(look),
                  child: NeraCard(
                    padding: const EdgeInsets.all(6),
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        NeraNetworkImage(
                          url: look.imageUrl,
                          radius: NeraRadius.sm,
                          placeholderIcon: Icons.person_rounded,
                        ),
                        Positioned(
                          top: 4,
                          right: 4,
                          child: IconButton.filledTonal(
                            tooltip: 'Remove from Saved Looks',
                            onPressed: () => _unsave(look),
                            icon: const Icon(
                              Icons.bookmark_remove_rounded,
                              size: 18,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
    ),
  );
}
