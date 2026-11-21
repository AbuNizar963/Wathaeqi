import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/document_studio_models.dart';

void main() {
  group('Document Studio models', () {
    test('template fields round-trip their supported field metadata', () {
      const field = DocumentTemplateField(
        key: 'employee_name',
        label: 'اسم الموظف',
        type: DocumentTemplateFieldType.text,
        required: true,
        maxLength: 80,
        options: [],
        defaultValue: '',
      );

      final restored = DocumentTemplateField.fromJson(field.toJson());

      expect(restored.key, 'employee_name');
      expect(restored.label, 'اسم الموظف');
      expect(restored.type, DocumentTemplateFieldType.text);
      expect(restored.required, isTrue);
      expect(restored.maxLength, 80);
    });

    test('template JSON preserves structured editor content', () {
      final template = DocumentTemplate(
        id: 'template-1',
        ownerId: '550e8400-e29b-41d4-a716-446655440000',
        title: 'كتاب تكليف',
        category: 'personnel',
        content: {
          'type': 'doc',
          'content': [
            {'type': 'paragraph'},
          ],
        },
        fields: const [],
        revision: 2,
        isActive: true,
        createdAt: DateTime.utc(2026, 1, 1),
        updatedAt: DateTime.utc(2026, 1, 2),
      );

      final restored = DocumentTemplate.fromJson(template.toJson());

      expect(restored.id, 'template-1');
      expect(restored.revision, 2);
      expect(restored.content['type'], 'doc');
      expect(restored.content['content'], isA<List<dynamic>>());
    });

    test('legacy starter drafts are excluded from user document lists', () {
      const starterHtml = '<h2>بسم الله الرحمن الرحيم</h2><p>العدد: ....................</p><p>التاريخ: .... / .... / ........</p><p><strong>إلى /</strong> ................................................</p><p><strong>الموضوع /</strong> ............................................</p><p>تحية طيبة...</p><p>يرجى التفضل بالاطلاع واتخاذ ما يلزم بشأن الموضوع أعلاه، مع التقدير.</p><p>وتفضلوا بقبول فائق الاحترام.</p><p><strong>التوقيع:</strong> ............................</p>';
      final starter = OfficialDocument.fromJson({
        'id': 'legacy-starter-1',
        'ownerId': 'owner-1',
        'title': 'كتاب رسمي جديد',
        'category': 'مسودة',
        'content': {'type': 'legacy-html', 'html': starterHtml},
        'serialNumber': 0,
        'serialCode': '',
        'status': 'draft',
        'documentDate': '2026-11-16T21:41:41.000Z',
        'createdAt': '2026-11-16T21:41:41.000Z',
        'updatedAt': '2026-11-16T21:41:41.000Z',
      });
      final userDocument = OfficialDocument.fromJson({
        'id': 'user-document-1',
        'ownerId': 'owner-1',
        'title': 'كتاب رسمي جديد',
        'category': 'general',
        'content': {'type': 'legacy-html', 'html': starterHtml},
        'serialNumber': 0,
        'serialCode': '',
        'status': 'draft',
        'documentDate': '2026-11-16T21:41:41.000Z',
        'createdAt': '2026-11-16T21:41:41.000Z',
        'updatedAt': '2026-11-16T21:41:41.000Z',
      });

      expect(starter.isLegacyStarterDraft, isTrue);
      expect(userDocument.isLegacyStarterDraft, isFalse);
    });

    test(
      'official documents round-trip editor snapshots and issue metadata',
      () {
        final document = OfficialDocument(
          id: 'document-1',
          ownerId: '550e8400-e29b-41d4-a716-446655440000',
          organizationId: 'org-1',
          templateId: 'template-1',
          templateRevision: 3,
          templateFieldsSnapshot: const [
            DocumentTemplateField(
              key: 'employee_name',
              label: 'اسم الموظف',
              type: DocumentTemplateFieldType.text,
              required: true,
            ),
          ],
          title: 'كتاب تكليف',
          category: 'personnel',
          subject: 'تكليف موظف',
          content: {
            'type': 'doc',
            'content': [
              {'type': 'paragraph', 'content': []},
            ],
          },
          fieldValues: const {'employee_name': 'أحمد'},
          serialNumber: 12,
          serialCode: 'DOC-0012',
          documentDate: DateTime.utc(2026, 11, 18),
          status: 'draft',
          createdAt: DateTime.utc(2026, 11, 18, 10),
          updatedAt: DateTime.utc(2026, 11, 18, 11),
          file: const UploadedDocumentFile(
            fileName: 'report.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 1024,
            pageCount: 0,
          ),
        );

        final restored = OfficialDocument.fromJson(document.toJson());

        expect(restored.id, document.id);
        expect(restored.ownerId, document.ownerId);
        expect(restored.category, 'personnel');
        expect(restored.organizationId, 'org-1');
        expect(restored.templateRevision, 3);
        expect(restored.templateFieldsSnapshot, hasLength(1));
        expect(restored.fieldValues['employee_name'], 'أحمد');
        expect(restored.content['type'], 'doc');
        expect(restored.serialCode, 'DOC-0012');
        expect(restored.documentDate, document.documentDate);
        expect(restored.expectedUpdatedAt, '2026-11-18T11:00:00.000Z');
        expect(restored.file?.fileName, 'report.pdf');
        expect(restored.file?.pageCount, 0);
        expect(document.toJson().toString(), isNot(contains('storageKey')));
        expect(document.toJson().toString(), isNot(contains('signedUrl')));
      },
    );
  });
}
