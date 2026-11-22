import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/document_studio_template_fields.dart';

void main() {
  group('DocumentStudioTemplateFields.applyFieldValues', () {
    test('substitutes Arabic Word-style placeholders in text nodes', () {
      final content = <String, dynamic>{
        'type': 'doc',
        'content': [
          {
            'type': 'paragraph',
            'content': [
              {
                'type': 'text',
                'text': 'إلى {{الجهة_المرسل_إليها}} بتاريخ {{التاريخ}}',
              },
            ],
          },
        ],
      };

      expect(
        DocumentStudioTemplateFields.applyFieldValues(content, {
          'الجهة_المرسل_إليها': 'مديرية الشرطة',
          'التاريخ': '2026-11-22',
        }),
        {
          'type': 'doc',
          'content': [
            {
              'type': 'paragraph',
              'content': [
                {'type': 'text', 'text': 'إلى مديرية الشرطة بتاريخ 2026-11-22'},
              ],
            },
          ],
        },
      );
    });

    test('does not cascade placeholder-like field values', () {
      final content = <String, dynamic>{
        'type': 'doc',
        'content': [
          {
            'type': 'paragraph',
            'content': [
              {'type': 'text', 'text': '{{name}} {{missing}}'},
            ],
          },
        ],
      };

      expect(
        DocumentStudioTemplateFields.applyFieldValues(content, {
          'name': '{{title}}',
          'title': 'مدير',
        })['content'],
        [
          {
            'type': 'paragraph',
            'content': [
              {'type': 'text', 'text': '{{title}} {{missing}}'},
            ],
          },
        ],
      );
    });

    test(
      'preserves marks, attributes, unknown nodes and source immutability',
      () {
        final content = <String, dynamic>{
          'type': 'doc',
          'attrs': {'metadata': '{{name}}'},
          'content': [
            {
              'type': 'paragraph',
              'attrs': {'id': 'p1'},
              'content': [
                {
                  'type': 'text',
                  'text': 'مرحبا {{name}}',
                  'marks': [
                    {'type': 'bold'},
                  ],
                },
              ],
            },
            {
              'type': 'unknownWidget',
              'content': [
                {'type': 'text', 'text': '{{name}}'},
              ],
              'data': 'keep',
            },
          ],
        };
        final original = Map<String, dynamic>.from(content);

        final result = DocumentStudioTemplateFields.applyFieldValues(content, {
          'name': 'أحمد',
        });

        expect(result['attrs'], {'metadata': '{{name}}'});
        expect((result['content'] as List)[0], {
          'type': 'paragraph',
          'attrs': {'id': 'p1'},
          'content': [
            {
              'type': 'text',
              'text': 'مرحبا أحمد',
              'marks': [
                {'type': 'bold'},
              ],
            },
          ],
        });
        expect((result['content'] as List)[1], (content['content'] as List)[1]);
        expect(content, original);
      },
    );

    test(
      'does not modify unsupported legacy HTML or malformed legacy text',
      () {
        final html = <String, dynamic>{
          'type': 'legacy-html',
          'html': '<p>{{name}}</p>',
        };
        final malformed = <String, dynamic>{'type': 'legacy-text', 'text': 7};
        expect(
          DocumentStudioTemplateFields.applyFieldValues(html, {'name': 'أحمد'}),
          html,
        );
        expect(
          DocumentStudioTemplateFields.applyFieldValues(malformed, {
            'name': 'أحمد',
          }),
          malformed,
        );
      },
    );

    test('substitutes only valid legacy plain-text records', () {
      expect(
        DocumentStudioTemplateFields.applyFieldValues(
          {'type': 'legacy-text', 'text': 'مرحباً {{name}}'},
          {'name': 'أحمد'},
        ),
        {'type': 'legacy-text', 'text': 'مرحباً أحمد'},
      );
      final withMetadata = {
        'type': 'legacy-text',
        'text': '{{name}}',
        'metadata': {'keep': true},
      };
      expect(
        DocumentStudioTemplateFields.applyFieldValues(withMetadata, {
          'name': 'أحمد',
        }),
        withMetadata,
      );
    });
  });
}
