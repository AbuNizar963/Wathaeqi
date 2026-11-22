import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/document_studio_template_variables.dart';

void main() {
  group('applyDocumentTemplateVariables', () {
    test('resolves Arabic and English system variables with whitespace', () {
      final content = {
        'type': 'doc',
        'content': [
          {
            'type': 'paragraph',
            'content': [
              {
                'type': 'text',
                'text':
                    'إلى {{ organization }} بتاريخ {{date}} رقم {{number}} الموضوع {{subject}}',
              },
            ],
          },
        ],
      };

      expect(
        applyDocumentTemplateVariables(content, {
          'organization': 'مديرية الوثائق',
          'date': '2026/11/22',
          'number': 'DOC-00125',
          'subject': 'اعتماد النموذج',
        }),
        {
          'type': 'doc',
          'content': [
            {
              'type': 'paragraph',
              'content': [
                {
                  'type': 'text',
                  'text':
                      'إلى مديرية الوثائق بتاريخ 2026/11/22 رقم DOC-00125 الموضوع اعتماد النموذج',
                },
              ],
            },
          ],
        },
      );
    });

    test('keeps unresolved variables when a value is not available', () {
      final content = {
        'type': 'doc',
        'content': [
          {
            'type': 'paragraph',
            'content': [
              {'type': 'text', 'text': '{{number}}'},
            ],
          },
        ],
      };

      expect(applyDocumentTemplateVariables(content, {}), content);
    });

    test('does not reinterpret placeholders inside replacement values', () {
      final content = {
        'type': 'doc',
        'content': [
          {
            'type': 'paragraph',
            'content': [
              {'type': 'text', 'text': '{{subject}}'},
            ],
          },
        ],
      };

      expect(
        applyDocumentTemplateVariables(content, {
          'subject': '{{number}}',
          'number': 'DOC-9',
        })['content'],
        [
          {
            'type': 'paragraph',
            'content': [
              {'type': 'text', 'text': '{{number}}'},
            ],
          },
        ],
      );
    });

    test('preserves marks, attributes, unknown nodes, and original content', () {
      final content = {
        'type': 'doc',
        'attrs': {'note': '{{subject}}'},
        'content': [
          {
            'type': 'paragraph',
            'attrs': {'alignment': 'right'},
            'content': [
              {
                'type': 'text',
                'text': '{{subject}}',
                'marks': [
                  {'type': 'bold'},
                ],
              },
            ],
          },
          {
            'type': 'customWidget',
            'content': [
              {'type': 'text', 'text': '{{subject}}'},
            ],
          },
        ],
      };
      final snapshot = jsonDecode(jsonEncode(content)) as Map<String, dynamic>;

      final result = applyDocumentTemplateVariables(content, {
        'subject': 'قرار إداري',
      });

      expect(
        (result['content'] as List).first,
        {
          'type': 'paragraph',
          'attrs': {'alignment': 'right'},
          'content': [
            {
              'type': 'text',
              'text': 'قرار إداري',
              'marks': [
                {'type': 'bold'},
              ],
            },
          ],
        },
      );
      final originalChildren = content['content'] as List;
      expect(identical((result['content'] as List)[1], originalChildren[1]), isTrue);
      expect(result['attrs'], {'note': '{{subject}}'});
      expect(content, snapshot);
    });

    test('does not traverse legacy HTML', () {
      final content = {'type': 'legacy-html', 'html': '<p>{{subject}}</p>'};
      expect(
        identical(
          applyDocumentTemplateVariables(content, {'subject': 'قيمة'}),
          content,
        ),
        isTrue,
      );
    });
  });
}
