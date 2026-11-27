import 'package:flutter/material.dart';

/// Vector brand mark used by the Flutter shell so the in-app identity remains
/// crisp at every device density without relying on a raster logo.
class WathaeqiBrandMark extends StatelessWidget {
  const WathaeqiBrandMark({
    super.key,
    required this.size,
    this.borderRadius = const BorderRadius.all(Radius.circular(14)),
    this.semanticLabel = 'شعار وثائقي',
  });

  final double size;
  final BorderRadius borderRadius;
  final String semanticLabel;

  @override
  Widget build(BuildContext context) => Semantics(
    image: true,
    label: semanticLabel,
    child: SizedBox.square(
      dimension: size,
      child: ClipRRect(
        borderRadius: borderRadius,
        child: const CustomPaint(painter: _WathaeqiBrandPainter()),
      ),
    ),
  );
}

class _WathaeqiBrandPainter extends CustomPainter {
  const _WathaeqiBrandPainter();

  static const _ink = Color(0xFF10262D);
  static const _teal = Color(0xFF0F766E);
  static const _gold = Color(0xFFC49A5B);
  static const _paper = Color(0xFFF5F4ED);
  static const _fold = Color(0xFFD9E8E2);
  static const _line = Color(0xFF9AACA6);

  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.scale(size.width / 512, size.height / 512);

    canvas.drawRect(
      const Rect.fromLTWH(0, 0, 512, 512),
      Paint()..color = _ink,
    );

    final shield = Path()
      ..moveTo(256, 42)
      ..lineTo(421, 99)
      ..lineTo(421, 224)
      ..cubicTo(421, 345, 355, 438, 256, 500)
      ..cubicTo(157, 438, 91, 345, 91, 224)
      ..lineTo(91, 99)
      ..close();
    canvas.drawPath(
      shield,
      Paint()
        ..color = _gold
        ..style = PaintingStyle.stroke
        ..strokeWidth = 15
        ..strokeJoin = StrokeJoin.round,
    );

    final document = Path()
      ..moveTo(201, 116)
      ..lineTo(292, 116)
      ..lineTo(358, 182)
      ..lineTo(358, 372)
      ..quadraticBezierTo(358, 399, 331, 399)
      ..lineTo(201, 399)
      ..quadraticBezierTo(174, 399, 174, 372)
      ..lineTo(174, 143)
      ..quadraticBezierTo(174, 116, 201, 116)
      ..close();
    canvas.drawPath(document, Paint()..color = _paper);

    final fold = Path()
      ..moveTo(292, 116)
      ..lineTo(292, 183)
      ..lineTo(358, 183)
      ..close();
    canvas.drawPath(fold, Paint()..color = _fold);
    canvas.drawPath(
      fold,
      Paint()
        ..color = _gold
        ..style = PaintingStyle.stroke
        ..strokeWidth = 12
        ..strokeJoin = StrokeJoin.round,
    );

    final linePaint = Paint()
      ..color = _line
      ..strokeWidth = 16
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(const Offset(211, 231), const Offset(302, 231), linePaint);
    canvas.drawLine(const Offset(211, 270), const Offset(302, 270), linePaint);

    final check = Path()
      ..moveTo(216, 333)
      ..lineTo(251, 368)
      ..lineTo(327, 282);
    canvas.drawPath(
      check,
      Paint()
        ..color = _teal
        ..style = PaintingStyle.stroke
        ..strokeWidth = 25
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );

    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _WathaeqiBrandPainter oldDelegate) => false;
}
