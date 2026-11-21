import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:http/http.dart' as http;
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

/// Builds a print-ready, multi-page A4 PDF from the saved TipTap document
/// payload. It is generated locally and never writes back to the document.
class DocumentStudioPdf {
  DocumentStudioPdf._();

  static Future<Uint8List> build({
    required Map<String, dynamic> content,
    required String title,
    required String subject,
    required String serialCode,
    required DateTime documentDate,
    required Map<String, dynamic> letterhead,
    required int dividerColor,
    required bool showWatermarkText,
    required String watermarkText,
    required double watermarkOpacity,
  }) async {
    final regular = pw.Font.ttf(
      await rootBundle.load('assets/fonts/cairo-400.ttf'),
    );
    final bold = pw.Font.ttf(
      await rootBundle.load('assets/fonts/cairo-700.ttf'),
    );
    final watermarkFont = pw.Font.ttf(
      await rootBundle.load('assets/fonts/aref-ruqaa-regular.ttf'),
    );
    pw.MemoryImage? logoImage;
    final logoUrl = _clean(letterhead['logoUrl']);
    final logoUri = logoUrl == null ? null : Uri.tryParse(logoUrl);
    if (logoUri != null && logoUri.scheme == 'https') {
      try {
        final response = await http
            .get(logoUri)
            .timeout(const Duration(seconds: 8));
        if (response.statusCode == 200 &&
            response.bodyBytes.isNotEmpty &&
            response.bodyBytes.length <= 5 * 1024 * 1024) {
          logoImage = pw.MemoryImage(response.bodyBytes);
        }
      } catch (_) {
        // A missing remote logo must not prevent a document from being printed.
      }
    }
    final theme = pw.ThemeData.withFont(
      base: regular,
      bold: bold,
      italic: regular,
      boldItalic: bold,
    );
    final pdf = pw.Document();
    final safeOpacity = watermarkOpacity.isFinite
        ? watermarkOpacity.clamp(0.0, 0.6)
        : 0.12;
    final watermarkColor = PdfColor(0.42, 0.44, 0.47, safeOpacity);
    final borderColor = PdfColor.fromInt(dividerColor);
    final dateText = DateFormat('yyyy/MM/dd').format(documentDate.toLocal());
    final department = _clean(letterhead['departmentName']) ?? 'وثائقي';
    final unit = _clean(letterhead['unitName']);
    final chiefRank = _clean(letterhead['unitChiefRank']);
    final chiefName = _clean(letterhead['unitChiefName']);
    final headerShowLogo = letterhead['headerShowLogo'] != false;
    final rawHeaderLogoSize = letterhead['headerLogoSize'];
    final headerLogoSize = (rawHeaderLogoSize is num
            ? rawHeaderLogoSize.toDouble()
            : 120.0)
        .clamp(32.0, 128.0)
        .toDouble();
    final headerLogoSizePoints = headerLogoSize * 0.75;
    final headerTopPadding = _headerPadding(letterhead, 'headerTopPaddingMm', 0);
    final headerHorizontalPadding = _headerPadding(
      letterhead,
      'headerHorizontalPaddingMm',
      0,
    );
    final headerBottomPadding = _headerPadding(
      letterhead,
      'headerBottomPaddingMm',
      6,
    );
    final headerAlignment = _clean(letterhead['headerAlignment']) ?? 'spread';

    pdf.addPage(
      pw.MultiPage(
        maxPages: 500,
        pageTheme: pw.PageTheme(
          pageFormat: PdfPageFormat.a4,
          margin: const pw.EdgeInsets.all(10 * PdfPageFormat.mm),
          theme: theme,
          textDirection: pw.TextDirection.rtl,
          buildBackground: (context) => pw.FullPage(
            ignoreMargins: true,
            child: pw.Stack(
              children: [
                if (showWatermarkText)
                  pw.Positioned.fill(
                    child: pw.Padding(
                      padding: const pw.EdgeInsets.fromLTRB(
                        3.2 * PdfPageFormat.mm,
                        2.4 * PdfPageFormat.mm,
                        3.2 * PdfPageFormat.mm,
                        3 * PdfPageFormat.mm,
                      ),
                      child: pw.Column(
                        mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                        children: [
                          for (var row = 0; row < 33; row++)
                            pw.ClipRect(
                              child: pw.Transform.translate(
                                offset: PdfPoint(
                                  row.isOdd ? -10.3 * PdfPageFormat.mm : 0,
                                  0,
                                ),
                                child: pw.Row(
                                  mainAxisAlignment: pw.MainAxisAlignment.start,
                                  children: [
                                    for (var column = 0; column < 13; column++)
                                      pw.Padding(
                                        padding: const pw.EdgeInsets.only(
                                          right: 6.16 * PdfPageFormat.mm,
                                        ),
                                        child: pw.Text(
                                          watermarkText,
                                          textDirection: pw.TextDirection.rtl,
                                          style: pw.TextStyle(
                                            font: watermarkFont,
                                            fontSize: 11,
                                            color: watermarkColor,
                                          ),
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                if (logoImage != null)
                  pw.Center(
                    child: pw.Opacity(
                      opacity: safeOpacity,
                      child: pw.Image(
                        logoImage,
                        width: PdfPageFormat.a4.width * 0.9375,
                        height: PdfPageFormat.a4.height * 0.9375,
                        fit: pw.BoxFit.contain,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
        header: (context) {
          if (context.pageNumber > 1) return pw.SizedBox(height: 8);
          final titleAlignment = headerAlignment == 'center'
              ? pw.TextAlign.center
              : pw.TextAlign.right;
          final metadataAlignment = headerAlignment == 'center'
              ? pw.TextAlign.center
              : headerAlignment == 'right'
                  ? pw.TextAlign.right
                  : pw.TextAlign.left;
          return pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.stretch,
            children: [
              pw.Container(
                padding: pw.EdgeInsets.fromLTRB(
                  headerHorizontalPadding,
                  headerTopPadding,
                  headerHorizontalPadding,
                  headerBottomPadding,
                ),
                decoration: pw.BoxDecoration(
                  border: pw.Border(
                    bottom: pw.BorderSide(color: borderColor, width: 3),
                  ),
                ),
                child: pw.Row(
                  crossAxisAlignment: pw.CrossAxisAlignment.start,
                  children: [
                    pw.Expanded(
                      child: pw.Column(
                        crossAxisAlignment: pw.CrossAxisAlignment.stretch,
                        children: [
                          pw.Text(
                            department,
                            textDirection: pw.TextDirection.rtl,
                            textAlign: titleAlignment,
                            maxLines: 1,
                            style: pw.TextStyle(font: bold, fontSize: 15),
                          ),
                          if (unit != null)
                            pw.Text(
                              unit,
                              textDirection: pw.TextDirection.rtl,
                              textAlign: titleAlignment,
                              maxLines: 1,
                              style: pw.TextStyle(font: bold, fontSize: 15),
                            ),
                        ],
                      ),
                    ),
                    pw.SizedBox(
                      width: headerLogoSizePoints,
                      child: headerShowLogo && logoImage != null
                          ? pw.Image(
                              logoImage,
                              width: headerLogoSizePoints,
                              height: headerLogoSizePoints,
                              fit: pw.BoxFit.contain,
                            )
                          : pw.SizedBox(
                              width: headerLogoSizePoints,
                              height: headerLogoSizePoints,
                            ),
                    ),
                    pw.Expanded(
                      child: pw.Column(
                        crossAxisAlignment: pw.CrossAxisAlignment.stretch,
                        children: [
                          pw.Text(
                            'الرقم: ${serialCode.isEmpty ? 'يخصص عند الإصدار' : serialCode}',
                            textDirection: pw.TextDirection.rtl,
                            textAlign: metadataAlignment,
                            maxLines: 1,
                            style: pw.TextStyle(font: bold, fontSize: 15),
                          ),
                          pw.Text(
                            'التاريخ: $dateText',
                            textDirection: pw.TextDirection.rtl,
                            textAlign: metadataAlignment,
                            maxLines: 1,
                            style: pw.TextStyle(font: bold, fontSize: 15),
                          ),
                          if (chiefRank != null)
                            pw.Text(
                              chiefRank,
                              textDirection: pw.TextDirection.rtl,
                              textAlign: metadataAlignment,
                              maxLines: 1,
                              style: const pw.TextStyle(fontSize: 12),
                            ),
                          if (chiefName != null)
                            pw.Text(
                              chiefName,
                              textDirection: pw.TextDirection.rtl,
                              textAlign: metadataAlignment,
                              maxLines: 1,
                              style: pw.TextStyle(font: bold, fontSize: 12),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              pw.SizedBox(height: 12),
              if (subject.trim().isNotEmpty) ...[
                pw.Text(
                  'الموضوع: ${subject.trim()}',
                  textDirection: pw.TextDirection.rtl,
                  style: pw.TextStyle(font: bold, fontSize: 11),
                ),
                pw.SizedBox(height: 12),
              ],
              pw.Text(
                title,
                textDirection: pw.TextDirection.rtl,
                textAlign: pw.TextAlign.center,
                style: pw.TextStyle(font: bold, fontSize: 12),
              ),
              pw.SizedBox(height: 12),
            ],
          );
        },
        footer: (context) => pw.Row(
          mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
          children: [
            pw.Text(
              'وثائقي',
              textDirection: pw.TextDirection.rtl,
              style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey600),
            ),
            pw.Text(
              '${context.pageNumber} / ${context.pagesCount}',
              style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey600),
            ),
          ],
        ),
        build: (context) => _buildBlocks(
          _asMapList(content['content']),
          regular: regular,
          bold: bold,
        ),
      ),
    );

    return pdf.save();
  }

  static double _headerPadding(
    Map<String, dynamic> settings,
    String key,
    double fallback,
  ) {
    final value = settings[key];
    final parsed = value is num ? value.toDouble() : double.tryParse('$value');
    return (parsed ?? fallback).clamp(0, 30).toDouble() *
        PdfPageFormat.mm;
  }

  static String? _clean(dynamic value) {
    if (value is! String || value.trim().isEmpty) return null;
    return value.trim();
  }

  static List<Map<String, dynamic>> _asMapList(dynamic value) {
    if (value is! List) return const [];
    return value
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList(growable: false);
  }

  static List<pw.Widget> _buildBlocks(
    List<Map<String, dynamic>> nodes, {
    required pw.Font regular,
    required pw.Font bold,
  }) {
    final result = <pw.Widget>[];
    for (final node in nodes) {
      final type = node['type']?.toString() ?? '';
      final children = _asMapList(node['content']);
      if (type == 'paragraph' || type == 'heading') {
        final spans = _inlineSpans(children, regular: regular, bold: bold);
        final level = (node['attrs'] as Map?)?['level'];
        final heading = type == 'heading';
        result.add(
          pw.Padding(
            padding: const pw.EdgeInsets.only(bottom: 7),
            child: pw.RichText(
              textDirection: pw.TextDirection.rtl,
              textAlign: pw.TextAlign.right,
              text: pw.TextSpan(
                children: spans.isEmpty
                    ? [
                        pw.TextSpan(
                          text: ' ',
                          style: pw.TextStyle(font: regular),
                        ),
                      ]
                    : spans,
                style: pw.TextStyle(
                  font: heading ? bold : regular,
                  fontSize: heading
                      ? (level == 1
                            ? 18
                            : level == 2
                            ? 15
                            : 13)
                      : 11,
                  lineSpacing: 3,
                ),
              ),
            ),
          ),
        );
      } else if (type == 'bulletList' || type == 'orderedList') {
        var index = 0;
        for (final item in children) {
          index++;
          result.add(
            pw.Padding(
              padding: const pw.EdgeInsets.only(right: 12, bottom: 4),
              child: pw.Row(
                crossAxisAlignment: pw.CrossAxisAlignment.start,
                children: [
                  pw.SizedBox(
                    width: 18,
                    child: pw.Text(
                      type == 'orderedList' ? '$index.' : '•',
                      style: pw.TextStyle(font: bold, fontSize: 11),
                    ),
                  ),
                  pw.Expanded(
                    child: pw.Text(
                      _plainText(item),
                      textDirection: pw.TextDirection.rtl,
                      textAlign: pw.TextAlign.right,
                      style: pw.TextStyle(font: regular, fontSize: 11),
                    ),
                  ),
                ],
              ),
            ),
          );
        }
        result.add(pw.SizedBox(height: 4));
      } else if (type == 'blockquote') {
        result.add(
          pw.Container(
            margin: const pw.EdgeInsets.only(bottom: 8),
            padding: const pw.EdgeInsets.all(8),
            decoration: const pw.BoxDecoration(
              border: pw.Border(
                right: pw.BorderSide(color: PdfColors.grey500, width: 2),
              ),
              color: PdfColors.grey100,
            ),
            child: pw.Text(
              _plainText(node),
              textDirection: pw.TextDirection.rtl,
              textAlign: pw.TextAlign.right,
              style: pw.TextStyle(font: regular, fontSize: 10),
            ),
          ),
        );
      } else if (type == 'horizontalRule') {
        result.add(
          pw.Padding(
            padding: const pw.EdgeInsets.symmetric(vertical: 8),
            child: pw.Divider(color: PdfColors.grey400),
          ),
        );
      } else if (type == 'table') {
        for (final row in children) {
          final cells = _asMapList(row['content'])
              .map(_plainText)
              .where((value) => value.isNotEmpty)
              .toList();
          if (cells.isNotEmpty) {
            result.add(
              pw.Padding(
                padding: const pw.EdgeInsets.only(bottom: 4),
                child: pw.Text(
                  cells.join('   |   '),
                  textDirection: pw.TextDirection.rtl,
                  textAlign: pw.TextAlign.right,
                  style: pw.TextStyle(font: regular, fontSize: 10),
                ),
              ),
            );
          }
        }
        result.add(pw.SizedBox(height: 6));
      } else if (children.isNotEmpty) {
        result.addAll(_buildBlocks(children, regular: regular, bold: bold));
      }
    }
    return result;
  }

  static List<pw.InlineSpan> _inlineSpans(
    List<Map<String, dynamic>> nodes, {
    required pw.Font regular,
    required pw.Font bold,
  }) {
    final spans = <pw.InlineSpan>[];
    for (final node in nodes) {
      final type = node['type']?.toString() ?? '';
      if (type == 'hardBreak') {
        spans.add(pw.TextSpan(text: '\n'));
        continue;
      }
      if (type != 'text') {
        spans.addAll(
          _inlineSpans(
            _asMapList(node['content']),
            regular: regular,
            bold: bold,
          ),
        );
        continue;
      }
      final marks = _asMapList(node['marks']);
      final isBold = marks.any((mark) => mark['type'] == 'bold');
      final isItalic = marks.any((mark) => mark['type'] == 'italic');
      final isUnderline = marks.any((mark) => mark['type'] == 'underline');
      spans.add(
        pw.TextSpan(
          text: node['text']?.toString() ?? '',
          style: pw.TextStyle(
            font: isBold ? bold : regular,
            fontStyle: isItalic ? pw.FontStyle.italic : pw.FontStyle.normal,
            decoration: isUnderline ? pw.TextDecoration.underline : null,
            fontSize: 11,
          ),
        ),
      );
    }
    return spans;
  }

  static String _plainText(Map<String, dynamic> node) {
    final type = node['type']?.toString() ?? '';
    if (type == 'text') return node['text']?.toString() ?? '';
    if (type == 'hardBreak') return '\n';
    return _asMapList(node['content']).map(_plainText).join();
  }
}
