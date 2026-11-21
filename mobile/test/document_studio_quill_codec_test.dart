import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/document_studio_quill_codec.dart';

void main() {
  test(
    'legacy plain text survives editor load and conversion to server format',
    () {
      const text = 'السطر الأول\n\nالسطر الثالث';
      final original = <String, dynamic>{'type': 'legacy-text', 'text': text};

      final editor = DocumentStudioQuillCodec.toQuillDocument(original);
      final saved = DocumentStudioQuillCodec.toTipTapJson(editor);

      expect(editor.toPlainText(), '$text\n');
      expect(saved, {
        'type': 'doc',
        'content': [
          {
            'type': 'paragraph',
            'content': [
              {'type': 'text', 'text': 'السطر الأول'},
            ],
          },
          {'type': 'paragraph'},
          {
            'type': 'paragraph',
            'content': [
              {'type': 'text', 'text': 'السطر الثالث'},
            ],
          },
        ],
      });
      expect(original, {'type': 'legacy-text', 'text': text});
    },
  );

  test('legacy text preserves blank and trailing lines when edited', () {
    for (final text in ['', '\n', 'بداية\n', '\nنهاية']) {
      final editor = DocumentStudioQuillCodec.toQuillDocument({
        'type': 'legacy-text',
        'text': text,
      });
      expect(editor.toPlainText(), '$text\n');
    }
    final editor = DocumentStudioQuillCodec.toQuillDocument({
      'type': 'legacy-text',
      'text': 'نص قديم',
    });
    editor.insert('نص قديم'.length, ' محدث');
    final result = DocumentStudioQuillCodec.toTipTapJson(editor);
    expect(result.toString(), contains('نص قديم محدث'));
    expect(result['type'], 'doc');
  });

  test('normalization does not rewrite unrelated or malformed content', () {
    final html = <String, dynamic>{'type': 'legacy-html', 'html': '<p>x</p>'};
    final malformed = <String, dynamic>{'type': 'legacy-text', 'text': 7};
    expect(
      identical(DocumentStudioQuillCodec.normalizeLegacyText(html), html),
      isTrue,
    );
    expect(
      identical(
        DocumentStudioQuillCodec.normalizeLegacyText(malformed),
        malformed,
      ),
      isTrue,
    );
  });

  test('supported document text and formatting remain editable', () {
    final editor = DocumentStudioQuillCodec.toQuillDocument({
      'type': 'doc',
      'content': [
        {
          'type': 'paragraph',
          'content': [
            {
              'type': 'text',
              'text': 'نص واضح',
              'marks': [
                {'type': 'bold'},
              ],
            },
          ],
        },
      ],
    });

    expect(editor.toPlainText(), 'نص واضح\n');
    expect(DocumentStudioQuillCodec.toTipTapJson(editor), {
      'type': 'doc',
      'content': [
        {
          'type': 'paragraph',
          'content': [
            {
              'type': 'text',
              'text': 'نص واضح',
              'marks': [
                {'type': 'bold'},
              ],
            },
          ],
        },
      ],
    });
  });
}
