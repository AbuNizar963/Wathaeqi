import 'dart:typed_data';

import 'package:flutter/foundation.dart' show compute;
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

import 'document_output_security.dart';

String safeDocumentFileName(String name, {String fallback = 'document.pdf'}) {
  final normalized = name
      .split(RegExp(r'[/\\]'))
      .last
      .replaceAll(RegExp(r'[\x00-\x1f\x7f<>:"|?*]'), '_')
      .trim();
  if (normalized.isEmpty || normalized == '.' || normalized == '..') {
    return fallback;
  }
  // A bounded basename only; never accept an output path from document data.
  return normalized.length > 180
      ? normalized.substring(normalized.length - 180)
      : normalized;
}

/// Local platform print dialog only: no browser, external URL or signed link.
/// The already-composed A4 PDF remains unchanged when printer settings change.
Future<bool> printDocumentBytes(Uint8List bytes, {required String name}) {
  if (!hasPdfSignature(bytes)) throw const FormatException('ملف PDF غير صالح');
  return Printing.layoutPdf(
    name: safeDocumentFileName(name),
    format: PdfPageFormat.a4,
    dynamicLayout: false,
    onLayout: (_) async => bytes,
  );
}

/// Image wrapping runs away from the UI isolate and never changes the original.
Future<Uint8List> imageDocumentPdf(Uint8List imageBytes) =>
    compute(_imageDocumentPdf, imageBytes);

Future<Uint8List> _imageDocumentPdf(Uint8List imageBytes) async {
  final document = pw.Document();
  final image = pw.MemoryImage(imageBytes);
  document.addPage(
    pw.Page(
      pageFormat: PdfPageFormat.a4,
      margin: pw.EdgeInsets.zero,
      build: (_) => pw.Center(child: pw.Image(image, fit: pw.BoxFit.contain)),
    ),
  );
  return document.save();
}
