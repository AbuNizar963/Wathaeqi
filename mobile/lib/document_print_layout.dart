import 'dart:typed_data';

import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

/// Builds a print-ready A4 PDF with one, two, or four source pages per sheet.
///
/// Source pages are rasterized and placed in reading order without cropping.
/// Raster images are processed one sheet at a time to bound transient memory.
class DocumentPrintLayout {
  DocumentPrintLayout._();

  /// The maximum number of source PDF pages accepted for one layout operation.
  static const int maxSourcePages = 500;

  /// Raster resolution used by default for print output.
  static const double defaultDpi = 300;

  /// Groups zero-based source page indices into ordered output sheets.
  ///
  /// [pageCount] must be from 1 through [maxSourcePages], and [pagesPerSheet]
  /// must be 1, 2, or 4.
  static List<List<int>> pageGroups({
    required int pageCount,
    required int pagesPerSheet,
  }) {
    if (pageCount < 1 || pageCount > maxSourcePages) {
      throw ArgumentError.value(
        pageCount,
        'pageCount',
        'must be between 1 and $maxSourcePages',
      );
    }
    if (pagesPerSheet != 1 && pagesPerSheet != 2 && pagesPerSheet != 4) {
      throw ArgumentError.value(
        pagesPerSheet,
        'pagesPerSheet',
        'must be 1, 2, or 4',
      );
    }

    return List<List<int>>.generate(
      (pageCount + pagesPerSheet - 1) ~/ pagesPerSheet,
      (sheetIndex) {
        final firstPage = sheetIndex * pagesPerSheet;
        final endPage = (firstPage + pagesPerSheet).clamp(0, pageCount).toInt();
        return List<int>.generate(
          endPage - firstPage,
          (offset) => firstPage + offset,
        );
      },
      growable: false,
    );
  }

  /// Converts [sourcePdf] into A4 sheets with [pagesPerSheet] pages per sheet.
  ///
  /// [dpi] must be finite and between 72 and 600. The returned bytes are the
  /// complete multi-page PDF; this method does not open a print dialog or store
  /// files. At most one sheet of rasterized source pages is retained at a time.
  static Future<Uint8List> createA4Pdf({
    required Uint8List sourcePdf,
    required int pagesPerSheet,
    double dpi = defaultDpi,
  }) async {
    if (sourcePdf.isEmpty) {
      throw ArgumentError.value(sourcePdf, 'sourcePdf', 'must not be empty');
    }
    if (!dpi.isFinite || dpi < 72 || dpi > 600) {
      throw ArgumentError.value(
        dpi,
        'dpi',
        'must be finite and from 72 to 600',
      );
    }
    if (pagesPerSheet != 1 && pagesPerSheet != 2 && pagesPerSheet != 4) {
      throw ArgumentError.value(
        pagesPerSheet,
        'pagesPerSheet',
        'must be 1, 2, or 4',
      );
    }

    final output = pw.Document();
    var sourcePageCount = 0;
    var sheetImages = <Uint8List>[];

    Future<void> addSheet() async {
      final indices = List<int>.generate(sheetImages.length, (index) => index);
      output.addPage(
        pw.Page(
          pageFormat: PdfPageFormat.a4,
          margin: const pw.EdgeInsets.all(18),
          build: (_) => _buildSheet(indices, sheetImages, pagesPerSheet),
        ),
      );
      sheetImages = <Uint8List>[];
    }

    await for (final page in Printing.raster(sourcePdf, dpi: dpi)) {
      if (sourcePageCount == maxSourcePages) {
        throw ArgumentError.value(
          maxSourcePages + 1,
          'sourcePdf page count',
          'must not exceed $maxSourcePages',
        );
      }
      sheetImages.add(await page.toPng());
      sourcePageCount++;
      if (sheetImages.length == pagesPerSheet) await addSheet();
    }
    if (sourcePageCount == 0) {
      throw StateError('The source PDF contains no pages.');
    }
    if (sheetImages.isNotEmpty) await addSheet();
    return output.save();
  }

  static pw.Widget _buildSheet(
    List<int> pageIndices,
    List<Uint8List> pageImages,
    int pagesPerSheet,
  ) {
    final columnCount = pagesPerSheet == 4 ? 2 : 1;
    final rowCount = pagesPerSheet == 1 ? 1 : 2;
    final rows = <pw.Widget>[];

    for (var rowIndex = 0; rowIndex < rowCount; rowIndex++) {
      final cells = <pw.Widget>[];
      for (var columnIndex = 0; columnIndex < columnCount; columnIndex++) {
        final slot = rowIndex * columnCount + columnIndex;
        final hasPage = slot < pageIndices.length;
        cells.add(
          pw.Expanded(
            child: hasPage
                ? _buildCell(pageImages[pageIndices[slot]])
                : pw.SizedBox(),
          ),
        );
        if (columnIndex < columnCount - 1) {
          cells.add(pw.SizedBox(width: 8));
        }
      }
      rows.add(
        pw.Expanded(
          child: pw.Row(
            crossAxisAlignment: pw.CrossAxisAlignment.stretch,
            children: cells,
          ),
        ),
      );
      if (rowIndex < rowCount - 1) rows.add(pw.SizedBox(height: 8));
    }

    return pw.Column(
      crossAxisAlignment: pw.CrossAxisAlignment.stretch,
      children: rows,
    );
  }

  static pw.Widget _buildCell(Uint8List imageBytes) => pw.Container(
    decoration: pw.BoxDecoration(
      border: pw.Border.all(color: PdfColors.grey600, width: 0.5),
    ),
    padding: const pw.EdgeInsets.all(5),
    child: pw.Image(pw.MemoryImage(imageBytes), fit: pw.BoxFit.contain),
  );
}
