import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/document_file_support.dart';

void main() {
  test('maps supported extensions to stable MIME types', () {
    expect(
      DocumentFileSupport.extensionForFileName(r'C:\docs\Report.DOCX'),
      'docx',
    );
    expect(
      DocumentFileSupport.mimeForFileName('report.docx'),
      DocumentFileSupport.docxMime,
    );
    expect(
      DocumentFileSupport.mimeForFileName('report.pdf'),
      DocumentFileSupport.pdfMime,
    );
    expect(DocumentFileSupport.mimeForFileName('report.unknown'), isNull);
  });

  test('validates original PDF and DOCX signatures instead of MIME alone', () {
    final pdf = Uint8List.fromList('%PDF-1.7\noriginal'.codeUnits);
    final docx = Uint8List.fromList([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
    expect(
      DocumentFileSupport.matchesMime(DocumentFileSupport.pdfMime, pdf),
      isTrue,
    );
    expect(
      DocumentFileSupport.matchesMime(DocumentFileSupport.docxMime, docx),
      isTrue,
    );
    expect(
      DocumentFileSupport.matchesMime(DocumentFileSupport.pdfMime, docx),
      isFalse,
    );
    expect(
      DocumentFileSupport.matchesMime(DocumentFileSupport.docxMime, pdf),
      isFalse,
    );
  });
}
