import 'dart:math' as math;

import 'package:flutter/material.dart';

/// A responsive A4 editor sheet with a 10 mm content inset and a full-page
/// security watermark repeated on every physical A4 sheet.
class DocumentPaper extends StatelessWidget {
  const DocumentPaper({
    super.key,
    required this.child,
    required this.showWatermarkText,
    required this.watermarkOpacity,
    this.watermarkText = 'وزارة الداخلية',
    this.watermarkScalePercent = 100,
    this.logoUrl,
    this.fixedWidth,
  });

  static const double a4Width = 210;
  static const double a4Height = 297;
  static const int watermarkRows = 33;
  static const int watermarkColumns = 13;

  final Widget child;
  final bool showWatermarkText;
  final double watermarkOpacity;
  final String watermarkText;
  final double watermarkScalePercent;
  final String? logoUrl;
  final double? fixedWidth;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final pageWidth =
            fixedWidth ??
            (constraints.hasBoundedWidth ? constraints.maxWidth : a4Width);
        final pageHeight = pageWidth * a4Height / a4Width;
        final logo = logoUrl?.trim();
        final watermarkScale = (watermarkScalePercent / 100)
            .clamp(0.4, 1.8)
            .toDouble();
        return Container(
          key: const ValueKey('document-a4-paper'),
          width: pageWidth,
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
              Positioned.fill(
                child: LayoutBuilder(
                  builder: (context, watermarkConstraints) {
                    final pageCount = watermarkConstraints.maxHeight.isFinite
                        ? (watermarkConstraints.maxHeight / pageHeight).ceil()
                        : 1;
                    return Stack(
                      fit: StackFit.expand,
                      children: [
                        CustomPaint(
                          key: const ValueKey('document-a4-page-breaks'),
                          painter: _DocumentPageBreakPainter(pageHeight),
                        ),
                        for (
                          var pageIndex = 0;
                          pageIndex < pageCount;
                          pageIndex++
                        )
                          Positioned(
                            key: ValueKey('document-watermark-page-$pageIndex'),
                            top: pageIndex * pageHeight,
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
                                      CustomPaint(
                                        key: const ValueKey(
                                          'document-watermark-pattern',
                                        ),
                                        painter: _DocumentWatermarkPainter(
                                          watermarkText,
                                          watermarkScale,
                                        ),
                                      ),
                                    if (logo != null && logo.isNotEmpty)
                                      Center(
                                        child: FractionallySizedBox(
                                          widthFactor: 0.9375 * watermarkScale,
                                          heightFactor: 0.9375 * watermarkScale,
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
                      ],
                    );
                  },
                ),
              ),
              ConstrainedBox(
                constraints: BoxConstraints(minHeight: pageHeight),
                child: Padding(
                  padding: EdgeInsets.all(pageWidth * 10 / a4Width),
                  child: child,
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _DocumentPageBreakPainter extends CustomPainter {
  const _DocumentPageBreakPainter(this.pageHeight);

  final double pageHeight;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = const Color(0xFFE2E8F0);
    const gapHeight = 10.0;
    for (var page = 1; page * pageHeight < size.height; page++) {
      canvas.drawRect(
        Rect.fromLTWH(
          0,
          page * pageHeight - gapHeight / 2,
          size.width,
          gapHeight,
        ),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _DocumentPageBreakPainter oldDelegate) =>
      oldDelegate.pageHeight != pageHeight;
}

/// Reference mosaic: 33 horizontal staggered rows and 13 columns, Aref Ruqaa
/// 11 pt at A4 scale, 6.16 mm horizontal gap and ~3 mm page inset.
class _DocumentWatermarkPainter extends CustomPainter {
  const _DocumentWatermarkPainter(this.watermarkText, this.scale);

  final String watermarkText;
  final double scale;

  @override
  void paint(Canvas canvas, Size size) {
    final mm = size.width / DocumentPaper.a4Width;
    final label = TextPainter(
      text: TextSpan(
        text: watermarkText,
        style: TextStyle(
          color: const Color(0xFF73777D),
          fontFamily: 'Aref Ruqaa',
          fontSize: 11 * scale * 25.4 / 72 * mm,
          height: 1,
          fontWeight: FontWeight.w400,
        ),
      ),
      textDirection: TextDirection.rtl,
      textScaler: TextScaler.noScaling,
    )..layout();
    final gap = 6.16 * mm * scale;
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
      final offset = row.isOdd ? -10.3 * mm * scale : 0.0;
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
  bool shouldRepaint(covariant _DocumentWatermarkPainter oldDelegate) =>
      oldDelegate.watermarkText != watermarkText || oldDelegate.scale != scale;
}
