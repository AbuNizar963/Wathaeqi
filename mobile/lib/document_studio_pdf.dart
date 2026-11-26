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
    String recipientLabel = 'إلى',
    String recipient = '',
    required String serialCode,
    required DateTime documentDate,
    required Map<String, dynamic> letterhead,
    required int dividerColor,
    required bool showWatermarkText,
    required String watermarkText,
    required double watermarkOpacity,
    double watermarkScalePercent = 100,
  }) async {
    final regular = pw.Font.ttf(
      await rootBundle.load('assets/fonts/amiri-regular.ttf'),
    );
    final bold = pw.Font.ttf(
      await rootBundle.load('assets/fonts/amiri-bold.ttf'),
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
    final watermarkScale = watermarkScalePercent.isFinite
        ? (watermarkScalePercent / 100).clamp(0.4, 1.8).toDouble()
        : 1.0;
    final borderColor = PdfColor.fromInt(dividerColor);
    double pageMargin(String key, double fallback) {
      final value = letterhead[key];
      return (value is num ? value.toDouble() : fallback)
              .clamp(0.0, 35.0)
              .toDouble() *
          PdfPageFormat.mm;
    }

    final frameStyle = _clean(letterhead['frameStyle']) ?? 'single';
    final frameColor =
        _parseHexColor(_clean(letterhead['frameColor'])) ?? borderColor;
    final frameWidth =
        ((letterhead['frameWidthPt'] is num
                    ? (letterhead['frameWidthPt'] as num).toDouble()
                    : 1.0)
                .clamp(0.5, 4.0))
            .toDouble();
    final dividerWidth =
        ((letterhead['headerDividerWidthPt'] is num
                    ? (letterhead['headerDividerWidthPt'] as num).toDouble()
                    : 2.25)
                .clamp(0.5, 6.0))
            .toDouble();
    final isTricolorStars =
        _clean(letterhead['headerDividerStyle']) == 'tricolor-stars';
    final dateText = DateFormat('yyyy/MM/dd').format(documentDate.toLocal());
    final department = _clean(letterhead['departmentName']) ?? 'وثائقي';
    final unit = _clean(letterhead['unitName']);
    final headerShowLogo = letterhead['headerShowLogo'] != false;
    final rawHeaderLogoSize = letterhead['headerLogoSize'];
    final headerLogoSize =
        ((rawHeaderLogoSize is num ? rawHeaderLogoSize.toDouble() : 160.0) *
                1.35)
            .clamp(120.0, 220.0)
            .toDouble();
    final headerLogoSizePoints = headerLogoSize * 0.75;
    final headerTopPadding = _headerPadding(
      letterhead,
      'headerTopPaddingMm',
      0,
    );
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
    pdf.addPage(
      pw.MultiPage(
        maxPages: 500,
        pageTheme: pw.PageTheme(
          pageFormat: PdfPageFormat.a4,
          margin: pw.EdgeInsets.fromLTRB(
            pageMargin('pageMarginLeftMm', 10),
            pageMargin('pageMarginTopMm', 10),
            pageMargin('pageMarginRightMm', 10),
            pageMargin('pageMarginBottomMm', 10),
          ),
          theme: theme,
          textDirection: pw.TextDirection.rtl,
          buildBackground: (context) => pw.FullPage(
            ignoreMargins: true,
            child: pw.Stack(
              children: [
                if (frameStyle != 'none')
                  pw.Positioned.fill(
                    child: pw.Container(
                      margin: pw.EdgeInsets.fromLTRB(
                        pageMargin('pageMarginLeftMm', 10),
                        pageMargin('pageMarginTopMm', 10),
                        pageMargin('pageMarginRightMm', 10),
                        pageMargin('pageMarginBottomMm', 10),
                      ),
                      decoration: pw.BoxDecoration(
                        border: pw.Border.all(
                          color: frameColor,
                          width: frameWidth,
                        ),
                      ),
                      child: frameStyle == 'ornate' || frameStyle == 'double'
                          ? pw.Container(
                              margin: const pw.EdgeInsets.all(3),
                              decoration: pw.BoxDecoration(
                                border: pw.Border.all(
                                  color: frameColor,
                                  width: frameWidth,
                                ),
                              ),
                            )
                          : null,
                    ),
                  ),
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
                                        padding: pw.EdgeInsets.only(
                                          right:
                                              6.16 *
                                              watermarkScale *
                                              PdfPageFormat.mm,
                                        ),
                                        child: pw.Text(
                                          watermarkText,
                                          textDirection: pw.TextDirection.rtl,
                                          style: pw.TextStyle(
                                            font: watermarkFont,
                                            fontSize: 11 * watermarkScale,
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
                        width: PdfPageFormat.a4.width * 0.9375 * watermarkScale,
                        height:
                            PdfPageFormat.a4.height * 0.9375 * watermarkScale,
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
          return pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.stretch,
            children: [
              if (headerShowLogo && logoImage != null)
                pw.Padding(
                  padding: pw.EdgeInsets.only(top: headerTopPadding),
                  child: pw.Center(
                    child: pw.Image(
                      logoImage,
                      width: headerLogoSizePoints,
                      height: headerLogoSizePoints,
                      fit: pw.BoxFit.contain,
                    ),
                  ),
                ),
              pw.Container(
                padding: pw.EdgeInsets.fromLTRB(
                  headerHorizontalPadding,
                  headerTopPadding,
                  headerHorizontalPadding,
                  headerBottomPadding,
                ),
                decoration: isTricolorStars
                    ? null
                    : pw.BoxDecoration(
                        border: pw.Border(
                          bottom: pw.BorderSide(
                            color: borderColor,
                            width: dividerWidth,
                          ),
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
                            'الرقم: ${serialCode.isEmpty ? 'يخصص عند الإصدار' : serialCode}',
                            textDirection: pw.TextDirection.rtl,
                            textAlign: pw.TextAlign.right,
                            maxLines: 1,
                            style: pw.TextStyle(font: bold, fontSize: 15),
                          ),
                          pw.Text(
                            'التاريخ: $dateText',
                            textDirection: pw.TextDirection.rtl,
                            textAlign: pw.TextAlign.right,
                            maxLines: 1,
                            style: pw.TextStyle(font: bold, fontSize: 15),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              if (isTricolorStars)
                pw.Padding(
                  padding: const pw.EdgeInsets.only(top: 2),
                  child: pw.SvgImage(
                    width: double.infinity,
                    height: 9,
                    svg: '<svg viewBox="0 0 1056 18" xmlns="http://www.w3.org/2000/svg"><path fill="#000000" d="M0 8.8 470 5.5v7L0 9.2Z"/><g fill="#c91111"><path d="M490 1.2 491.9 6l5.8.4-4.4 3.7 1.4 5.6-4.7-3-4.7 3 1.4-5.6-4.4-3.7 5.8-.4L490 1.2Z"/><path d="M528 1.2 529.9 6l5.8.4-4.4 3.7 1.4 5.6-4.7-3-4.7 3 1.4-5.6-4.4-3.7 5.8-.4L528 1.2Z"/><path d="M566 1.2 567.9 6l5.8.4-4.4 3.7 1.4 5.6-4.7-3-4.7 3 1.4-5.6-4.4-3.7 5.8-.4L566 1.2Z"/></g><path fill="#04993d" d="M586 5.5 1056 8.8v.4L586 12.5Z"/></svg>',
                  ),
                ),
              pw.SizedBox(height: 12),
              pw.Center(
                child: pw.RichText(
                  textDirection: pw.TextDirection.rtl,
                  textAlign: pw.TextAlign.center,
                  text: pw.TextSpan(
                    children: [
                      pw.TextSpan(
                        text: '${_clean(recipientLabel) ?? 'إلى'}: ',
                        style: pw.TextStyle(font: bold, fontSize: 18),
                      ),
                      if (_clean(recipient) case final recipientText?)
                        pw.TextSpan(
                          text: recipientText,
                          style: pw.TextStyle(font: regular, fontSize: 16),
                        ),
                    ],
                  ),
                ),
              ),
              if (subject.trim().isNotEmpty) ...[
                pw.Text(
                  'الموضوع: ${subject.trim()}',
                  textDirection: pw.TextDirection.rtl,
                  style: pw.TextStyle(font: bold, fontSize: 16),
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
        footer: (context) => pw.Align(
          alignment: pw.Alignment.centerRight,
          child: pw.Text(
            '${context.pageNumber} / ${context.pagesCount}',
            style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey600),
          ),
        ),
        build: (context) => [
          ..._buildBlocks(
            _asMapList(content['content']),
            regular: regular,
            bold: bold,
          ),
          pw.SizedBox(height: 16),
          pw.Center(
            child: pw.Column(
              mainAxisSize: pw.MainAxisSize.min,
              children: [
                pw.Text(
                  department,
                  textDirection: pw.TextDirection.rtl,
                  textAlign: pw.TextAlign.center,
                  maxLines: 1,
                  style: pw.TextStyle(font: bold, fontSize: 13),
                ),
                if (unit != null)
                  pw.Text(
                    unit.startsWith('رئيس') ? unit : 'رئيس $unit',
                    textDirection: pw.TextDirection.rtl,
                    textAlign: pw.TextAlign.center,
                    maxLines: 1,
                    style: pw.TextStyle(font: bold, fontSize: 12),
                  ),
              ],
            ),
          ),
        ],
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
    return (parsed ?? fallback).clamp(0, 30).toDouble() * PdfPageFormat.mm;
  }

  static PdfColor? _parseHexColor(String? value) {
    if (value == null || !RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(value)) {
      return null;
    }
    return PdfColor.fromInt(
      int.parse(value.substring(1), radix: 16) | 0xFF000000,
    );
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
                      : 16,
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
                      style: pw.TextStyle(font: bold, fontSize: 16),
                    ),
                  ),
                  pw.Expanded(
                    child: pw.Text(
                      _plainText(item),
                      textDirection: pw.TextDirection.rtl,
                      textAlign: pw.TextAlign.right,
                      style: pw.TextStyle(font: regular, fontSize: 16),
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
              style: pw.TextStyle(font: regular, fontSize: 16),
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
                  style: pw.TextStyle(font: regular, fontSize: 16),
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
            fontSize: 16,
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
