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

    test(
      'official documents round-trip editor snapshots and issue metadata',
      () {
        final document = OfficialDocument(
          id: 'document-1',
          ownerId: '550e8400-e29b-41d4-a716-446655440000',
          templateId: 'template-1',
          templateRevision: 3,
          title: 'كتاب تكليف',
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
        );

        final restored = OfficialDocument.fromJson(document.toJson());

        expect(restored.id, document.id);
        expect(restored.ownerId, document.ownerId);
        expect(restored.templateRevision, 3);
        expect(restored.fieldValues['employee_name'], 'أحمد');
        expect(restored.content['type'], 'doc');
        expect(restored.serialCode, 'DOC-0012');
        expect(restored.documentDate, document.documentDate);
      },
    );
  });
}
