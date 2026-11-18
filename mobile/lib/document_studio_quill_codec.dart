import 'package:flutter_quill/flutter_quill.dart' show Document;

class DocumentStudioQuillCodec {
  const DocumentStudioQuillCodec._();

  static Document toQuillDocument(Map<String, dynamic> tiptapContent) {
    final operations = <Map<String, dynamic>>[];
    final nodes = _asList(tiptapContent['content']);
    for (final node in nodes) {
      _appendBlock(node, operations);
    }
    if (operations.isEmpty ||
        !(operations.last['insert'] as String? ?? '').endsWith('\n')) {
      operations.add({'insert': '\n'});
    }
    return Document.fromJson(operations);
  }

  static Map<String, dynamic> toTipTapJson(Document document) {
    final blocks = <Map<String, dynamic>>[];
    final pendingListItems = <Map<String, dynamic>>[];
    String? pendingListType;
    var inlineContent = <Map<String, dynamic>>[];

    void flushList() {
      if (pendingListItems.isEmpty || pendingListType == null) return;
      blocks.add({
        'type': pendingListType == 'ordered' ? 'orderedList' : 'bulletList',
        'content': List<Map<String, dynamic>>.from(pendingListItems),
      });
      pendingListItems.clear();
      pendingListType = null;
    }

    void flushBlock(Map<String, dynamic> attributes) {
      final listType = attributes['list']?.toString();
      if (listType != null) {
        if (pendingListType != listType) flushList();
        pendingListType = listType;
        pendingListItems.add({
          'type': 'listItem',
          'content': [
            {
              'type': 'paragraph',
              if (inlineContent.isNotEmpty)
                'content': List<Map<String, dynamic>>.from(inlineContent),
            },
          ],
        });
      } else {
        flushList();
        final alignment = attributes['align']?.toString();
        final blockAttributes = <String, dynamic>{
          if (alignment != null) 'textAlign': alignment,
        };
        if (attributes['header'] is num) {
          blocks.add({
            'type': 'heading',
            'attrs': {
              'level': (attributes['header'] as num).toInt(),
              ...blockAttributes,
            },
            if (inlineContent.isNotEmpty)
              'content': List<Map<String, dynamic>>.from(inlineContent),
          });
        } else if (attributes['blockquote'] == true) {
          blocks.add({
            'type': 'blockquote',
            'content': [
              {
                'type': 'paragraph',
                if (inlineContent.isNotEmpty)
                  'content': List<Map<String, dynamic>>.from(inlineContent),
              },
            ],
          });
        } else if (attributes['code-block'] == true) {
          blocks.add({
            'type': 'codeBlock',
            if (inlineContent.isNotEmpty)
              'content': List<Map<String, dynamic>>.from(inlineContent),
          });
        } else {
          blocks.add({
            'type': 'paragraph',
            if (blockAttributes.isNotEmpty) 'attrs': blockAttributes,
            if (inlineContent.isNotEmpty)
              'content': List<Map<String, dynamic>>.from(inlineContent),
          });
        }
      }
      inlineContent = <Map<String, dynamic>>[];
    }

    for (final operation in document.toDelta().toJson()) {
      if (operation is! Map) continue;
      final insert = operation['insert'];
      final attributes = operation['attributes'] is Map
          ? Map<String, dynamic>.from(operation['attributes'] as Map)
          : <String, dynamic>{};

      if (insert is String) {
        final segments = insert.split('\n');
        for (var index = 0; index < segments.length; index++) {
          final text = segments[index];
          if (text.isNotEmpty) {
            inlineContent.add(_textNode(text, attributes));
          }
          if (index < segments.length - 1) {
            flushBlock(attributes);
          }
        }
      } else if (insert is Map && insert['image'] is String) {
        inlineContent.add({
          'type': 'image',
          'attrs': {'src': insert['image']},
        });
      }
    }

    if (inlineContent.isNotEmpty) {
      flushBlock(const {});
    }
    flushList();
    if (blocks.isEmpty) blocks.add({'type': 'paragraph'});
    return {'type': 'doc', 'content': blocks};
  }

  static void _appendBlock(
    dynamic rawNode,
    List<Map<String, dynamic>> operations,
  ) {
    if (rawNode is! Map) return;
    final node = Map<String, dynamic>.from(rawNode);
    final type = node['type']?.toString() ?? '';
    final attrs = node['attrs'] is Map
        ? Map<String, dynamic>.from(node['attrs'] as Map)
        : <String, dynamic>{};
    final children = _asList(node['content']);

    if (type == 'bulletList' || type == 'orderedList') {
      for (final item in children) {
        if (item is! Map) continue;
        for (final block in _asList(item['content'])) {
          if (block is Map) _appendInline(block, operations);
        }
        operations.add({
          'insert': '\n',
          'attributes': {'list': type == 'orderedList' ? 'ordered' : 'bullet'},
        });
      }
      return;
    }

    if (type == 'blockquote') {
      for (final child in children) {
        if (child is Map) _appendInline(child, operations);
      }
      operations.add({
        'insert': '\n',
        'attributes': {'blockquote': true},
      });
      return;
    }

    if (type == 'table') {
      for (final row in children) {
        if (row is! Map) continue;
        final cells = _asList(row['content']);
        for (var index = 0; index < cells.length; index++) {
          final cell = cells[index];
          if (cell is Map) {
            for (final block in _asList(cell['content'])) {
              if (block is Map) _appendInline(block, operations);
            }
          }
          if (index < cells.length - 1) operations.add({'insert': '\t'});
        }
        operations.add({'insert': '\n'});
      }
      return;
    }

    if (type == 'horizontalRule') {
      operations.add({'insert': '\n'});
      return;
    }

    _appendInline(node, operations);
    final lineAttributes = <String, dynamic>{};
    if (type == 'heading') {
      lineAttributes['header'] = attrs['level'] ?? 1;
    }
    if (type == 'codeBlock') lineAttributes['code-block'] = true;
    final alignment = attrs['textAlign'];
    if (alignment is String) lineAttributes['align'] = alignment;
    operations.add({
      'insert': '\n',
      if (lineAttributes.isNotEmpty) 'attributes': lineAttributes,
    });
  }

  static void _appendInline(
    Map<dynamic, dynamic> node,
    List<Map<String, dynamic>> operations,
  ) {
    final type = node['type']?.toString() ?? '';
    if (type == 'text' && node['text'] is String) {
      final marks = node['marks'] is List ? node['marks'] as List : const [];
      final attributes = <String, dynamic>{};
      for (final rawMark in marks) {
        if (rawMark is! Map) continue;
        final mark = Map<String, dynamic>.from(rawMark);
        final markType = mark['type']?.toString();
        if (markType == 'bold') attributes['bold'] = true;
        if (markType == 'italic') attributes['italic'] = true;
        if (markType == 'underline') attributes['underline'] = true;
        if (markType == 'strike') attributes['strike'] = true;
        if (markType == 'code') attributes['code'] = true;
        if (markType == 'link' && mark['attrs'] is Map) {
          final href = (mark['attrs'] as Map)['href'];
          if (href is String) attributes['link'] = href;
        }
      }
      operations.add({
        'insert': node['text'],
        if (attributes.isNotEmpty) 'attributes': attributes,
      });
      return;
    }

    if (type == 'image' && node['attrs'] is Map) {
      final src = (node['attrs'] as Map)['src'];
      if (src is String)
        operations.add({
          'insert': {'image': src},
        });
      return;
    }

    if (type == 'hardBreak') {
      operations.add({'insert': '\n'});
      return;
    }

    for (final child in _asList(node['content'])) {
      if (child is Map) _appendInline(child, operations);
    }
  }

  static Map<String, dynamic> _textNode(
    String text,
    Map<String, dynamic> attributes,
  ) {
    final marks = <Map<String, dynamic>>[];
    for (final name in ['bold', 'italic', 'underline', 'strike', 'code']) {
      if (attributes[name] == true) marks.add({'type': name});
    }
    if (attributes['link'] is String) {
      marks.add({
        'type': 'link',
        'attrs': {'href': attributes['link']},
      });
    }
    return {'type': 'text', 'text': text, if (marks.isNotEmpty) 'marks': marks};
  }

  static List<dynamic> _asList(dynamic value) =>
      value is List ? value : const [];
}
