import 'package:flutter/material.dart';

import '../theme/nera_colors.dart';
import '../theme/nera_theme.dart';

/// The "NERA" brand wordmark, reused on the launch screen, auth screen, and
/// the Home header so the identity is instantly consistent everywhere.
class NeraWordmark extends StatelessWidget {
  const NeraWordmark({super.key, this.size = 40, this.showTagline = false});

  final double size;
  final bool showTagline;

  @override
  Widget build(BuildContext context) => Column(
    mainAxisSize: MainAxisSize.min,
    children: [
      ShaderMask(
        shaderCallback: (bounds) => NeraColors.goldGradient.createShader(bounds),
        child: Text('NERA', style: NeraTheme.display(size, color: Colors.white, letterSpacing: -1.5)),
      ),
      if (showTagline) ...[
        const SizedBox(height: 6),
        Text(
          'PERSONAL STYLIST AI',
          style: TextStyle(color: NeraColors.blue, fontSize: size * 0.32, letterSpacing: 3),
        ),
      ],
    ],
  );
}
