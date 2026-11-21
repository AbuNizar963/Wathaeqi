import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/document_studio_pdf.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    'builds a valid multi-page-ready A4 PDF from native document content',
    () async {
    final paragraphs = List<Map<String, dynamic>>.generate(
      90,
      (index) => {
        'type': 'paragraph',
        'content': [
          {
            'type': 'text',
            'text':
                'فقرة اختبار رقم ${index + 1}: هذا نص عربي تجريبي لاختبار تدفق المحتوى عبر صفحات A4 مع المحافظة على اتجاه الكتابة والتنسيق.',
          },
        ],
      },
    );

    final bytes = await DocumentStudioPdf.build(
      content: {'type': 'doc', 'content': paragraphs},
      title: 'وثيقة اختبار',
      subject: 'التحقق من إخراج PDF متعدد الصفحات',
      serialCode: 'DOC-TEST-001',
      documentDate: DateTime.utc(2026, 11, 21),
      letterhead: {
        'departmentName': 'الجهة التجريبية',
        'unitName': 'الشؤون الإدارية',
        'unitChiefRank': 'مدير',
        'unitChiefName': 'اسم تجريبي',
      },
      dividerColor: 0xFFB49A55,
      showWatermarkText: true,
      watermarkOpacity: 0.12,
    );

    expect(bytes.length, greaterThan(1000));
    expect(String.fromCharCodes(bytes.take(5)), '%PDF-');
    final pdfText = latin1.decode(bytes);
    final renderedPages =
        RegExp(r'/Type /Page\b').allMatches(pdfText).length;
      expect(renderedPages, greaterThan(1));
    },
  );
}
