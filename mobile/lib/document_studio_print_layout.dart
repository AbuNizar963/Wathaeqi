import 'dart:typed_data';

import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

/// Re-arranges an existing PDF into A4 sheets containing multiple source pages.
///
/// The source PDF is rasterized at print-friendly resolution before being
/// composed. The original document bytes are never modified or uploaded.
class DocumentStudioPrintLayout {
  DocumentStudioPrintLayout._();

  static ({int columns, int rows}) gridFor(int pagesPerSheet) {
    return switch (pagesPerSheet) {
      1 => (columns: 1, rows: 1),
      2 => (columns: 1, rows: 2),
      4 => (columns: 2, rows: 2),
      6 => (columns: 2, rows: 3),
      8 => (columns: 2, rows: 4),
      _ => throw ArgumentError.value(
        pagesPerSheet,
        'pagesPerSheet',
        'Supported values are 1, 2, 4, 6, and 8',
      ),
    };
  }

  static Future<Uint8List> compose(
    Uint8List sourcePdf, {
    required int pagesPerSheet,
  }) async {
    final layout = gridFor(pagesPerSheet);
    final images = <pw.MemoryImage>[];
    await for (final raster in Printing.raster(sourcePdf, dpi: 300)) {
      images.add(pw.MemoryImage(await raster.toPng()));
    }
    if (images.isEmpty) {
      throw StateError('لم يتم العثور على صفحات في ملف PDF');
    }

    final output = pw.Document();
    for (
      var startIndex = 0;
      startIndex < images.length;
      startIndex += pagesPerSheet
    ) {
      output.addPage(
        pw.Page(
          pageFormat: PdfPageFormat.a4,
          margin: pw.EdgeInsets.zero,
          build: (context) => pw.Column(
            children: [
              for (var row = 0; row < layout.rows; row++)
                pw.Expanded(
                  child: pw.Row(
                    children: [
                      for (var column = 0; column < layout.columns; column++)
                        _buildCell(
                          images,
                          startIndex + row * layout.columns + column,
                        ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      );
    }

    return output.save();
  }

  static pw.Widget _buildCell(List<pw.MemoryImage> images, int index) {
    if (index >= images.length) return pw.Expanded(child: pw.SizedBox());
    return pw.Expanded(
      child: pw.Padding(
        padding: const pw.EdgeInsets.all(2),
        child: pw.Container(
          alignment: pw.Alignment.center,
          decoration: pw.BoxDecoration(
            border: pw.Border.all(color: PdfColors.grey300, width: 0.35),
          ),
          child: pw.Image(images[index], fit: pw.BoxFit.contain),
        ),
      ),
    );
  }
}
