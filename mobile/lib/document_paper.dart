import 'dart:math' as math;

import 'package:flutter/material.dart';

/// A responsive A4 editor sheet. Content can grow beyond one page without
/// being clipped; the decorative watermark represents the first A4 sheet.
class DocumentPaper extends StatelessWidget {
  const DocumentPaper({
    super.key,
    required this.child,
    required this.showWatermarkText,
    required this.watermarkOpacity,
    this.logoUrl,
  });

  static const double a4Width = 210;
  static const double a4Height = 297;
  static const int watermarkRows = 33;
  static const int watermarkColumns = 13;

  final Widget child;
  final bool showWatermarkText;
  final double watermarkOpacity;
  final String? logoUrl;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final pageHeight = constraints.maxWidth * a4Height / a4Width;
        final logo = logoUrl?.trim();
        return Container(
          key: const ValueKey('document-a4-paper'),
          width: double.infinity,
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            color: Colors.white,
            border: Border.all(color: const Color(0xFFD7DCE3)),
            borderRadius: BorderRadius.circular(3),
            boxShadow: const [
              BoxShadow(
                color: Color(0x180F172A),
                blurRadius: 14,
                offset: Offset(0, 5),
              ),
            ],
          ),
          child: Stack(
            children: [
              Positioned(
                top: 0,
                left: 0,
                right: 0,
                height: pageHeight,
                child: IgnorePointer(
                  child: Opacity(
                    opacity: watermarkOpacity.clamp(0.0, 0.6),
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        if (showWatermarkText)
                          const CustomPaint(
                            key: ValueKey('document-watermark-pattern'),
                            painter: _DocumentWatermarkPainter(),
                          ),
                        if (logo != null && logo.isNotEmpty)
                          Center(
                            child: FractionallySizedBox(
                              widthFactor: 0.9375,
                              heightFactor: 0.9375,
                              child: Image.network(
                                logo,
                                fit: BoxFit.contain,
                                errorBuilder: (_, _, _) =>
                                    const SizedBox.shrink(),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
              ConstrainedBox(
                constraints: BoxConstraints(minHeight: pageHeight),
                child: child,
              ),
            ],
          ),
        );
      },
    );
  }
}

/// Reference mosaic: 33 horizontal staggered rows and 13 columns, Aref Ruqaa
/// 11 pt at A4 scale, 6.16 mm horizontal gap and ~3 mm page inset.
class _DocumentWatermarkPainter extends CustomPainter {
  const _DocumentWatermarkPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final mm = size.width / DocumentPaper.a4Width;
    final label = TextPainter(
      text: TextSpan(
        text: 'وثائقي',
        style: TextStyle(
          color: const Color(0xFF73777D),
          fontFamily: 'Aref Ruqaa',
          fontSize: 11 * 25.4 / 72 * mm,
          height: 1,
          fontWeight: FontWeight.w400,
        ),
      ),
      textDirection: TextDirection.rtl,
      textScaler: TextScaler.noScaling,
    )..layout();
    final gap = 6.16 * mm;
    final rowWidth =
        DocumentPaper.watermarkColumns * label.width +
        (DocumentPaper.watermarkColumns - 1) * gap;
    final left = (size.width - rowWidth) / 2;
    final top = 2.4 * mm;
    final bottom = 3 * mm;
    final rowStep = math.max(
      0.0,
      (size.height - top - bottom - label.height) /
          (DocumentPaper.watermarkRows - 1),
    );
    canvas.save();
    canvas.clipRect(
      Rect.fromLTWH(
        3.2 * mm,
        top,
        size.width - 6.4 * mm,
        size.height - top - bottom,
      ),
    );
    for (var row = 0; row < DocumentPaper.watermarkRows; row++) {
      final offset = row.isOdd ? -10.3 * mm : 0.0;
      for (var column = 0; column < DocumentPaper.watermarkColumns; column++) {
        label.paint(
          canvas,
          Offset(
            left + offset + column * (label.width + gap),
            top + row * rowStep,
          ),
        );
      }
    }
    canvas.restore();
    label.dispose();
  }

  @override
  bool shouldRepaint(covariant _DocumentWatermarkPainter oldDelegate) => false;
}
