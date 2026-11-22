import 'dart:convert';
import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:xml/xml.dart';

import 'document_studio_models.dart';

class DocumentStudioDocxImportResult {
  const DocumentStudioDocxImportResult({
    required this.content,
    required this.fields,
  });

  final Map<String, dynamic> content;
  final List<DocumentTemplateField> fields;
}

class DocumentStudioDocxImporter {
  DocumentStudioDocxImporter._();

  static const _maxArchiveBytes = 50 * 1024 * 1024;
  static const _maxImageBytes = 384 * 1024;

  static DocumentStudioDocxImportResult importBytes(Uint8List bytes) {
    if (bytes.isEmpty || bytes.length > 25 * 1024 * 1024) {
      throw const FormatException(
        'حجم ملف Word غير صالح أو يتجاوز الحد المسموح',
      );
    }

    final archive = ZipDecoder().decodeBytes(bytes, verify: true);
    if (archive.files.length > 1000) {
      throw const FormatException(
        'يحتوي ملف Word على عدد غير مسموح من الملفات',
      );
    }
    final uncompressedBytes = archive.files.fold<int>(
      0,
      (total, file) => total + file.size,
    );
    if (uncompressedBytes > _maxArchiveBytes) {
      throw const FormatException(
        'حجم محتوى ملف Word بعد فك الضغط كبير جدًا',
      );
    }

    final documentBytes = _readArchiveFile(archive, 'word/document.xml');
    if (documentBytes == null) {
      throw const FormatException('لم يتم العثور على محتوى مستند Word');
    }

    final relationships = _readRelationships(archive);
    final document = XmlDocument.parse(utf8.decode(documentBytes));
    final body = _firstDescendant(document.rootElement, 'body');
    if (body == null) {
      throw const FormatException('بنية مستند Word غير مكتملة');
    }

    final blocks = <Map<String, dynamic>>[];
    for (final child in _childElements(body)) {
      if (child.name.local == 'p') {
        blocks.add(_parseParagraph(child, archive, relationships));
      } else if (child.name.local == 'tbl') {
        blocks.add(_parseTable(child, archive, relationships));
      }
    }

    if (blocks.isEmpty) {
      throw const FormatException(
        'لا يحتوي ملف Word على نصوص أو جداول قابلة للاستيراد',
      );
    }

    final content = <String, dynamic>{
      'type': 'doc',
      'content': blocks,
    };
    return DocumentStudioDocxImportResult(
      content: content,
      fields: _extractTemplateFields(content),
    );
  }

  static Map<String, String> _readRelationships(Archive archive) {
    final bytes = _readArchiveFile(
      archive,
      'word/_rels/document.xml.rels',
    );
    if (bytes == null) return const {};

    final document = XmlDocument.parse(utf8.decode(bytes));
    final relationships = <String, String>{};
    for (final element in _childElements(document.rootElement)) {
      if (element.name.local != 'Relationship') continue;
      if (_attribute(element, 'TargetMode') == 'External') continue;
      final id = _attribute(element, 'Id');
      final target = _attribute(element, 'Target');
      if (id != null && target != null) relationships[id] = target;
    }
    return relationships;
  }

  static Map<String, dynamic> _parseParagraph(
    XmlElement paragraph,
    Archive archive,
    Map<String, String> relationships,
  ) {
    final inlineNodes = <Map<String, dynamic>>[];
    for (final child in _childElements(paragraph)) {
      if (child.name.local == 'r') {
        inlineNodes.addAll(_parseRun(child, archive, relationships));
      } else if (child.name.local == 'hyperlink' ||
          child.name.local == 'smartTag' ||
          child.name.local == 'sdt') {
        for (final run in child.descendants.whereType<XmlElement>()) {
          if (run.name.local == 'r') {
            inlineNodes.addAll(_parseRun(run, archive, relationships));
          }
        }
      }
    }

    final properties = _firstChild(paragraph, 'pPr');
    final styleId = _attribute(_firstChild(properties, 'pStyle'), 'val');
    final headingLevel = _headingLevel(styleId);
    final alignment = _paragraphAlignment(
      _attribute(_firstChild(properties, 'jc'), 'val'),
    );
    final content = _normalizeTemplateTokens(
      _mergeSplitTemplateTokens(inlineNodes),
    );

    final attrs = <String, dynamic>{};
    if (headingLevel != null) attrs['level'] = headingLevel;
    if (alignment != null) attrs['textAlign'] = alignment;

    return {
      'type': headingLevel == null ? 'paragraph' : 'heading',
      if (attrs.isNotEmpty) 'attrs': attrs,
      if (content.isNotEmpty) 'content': content,
    };
  }

  static Map<String, dynamic> _parseTable(
    XmlElement table,
    Archive archive,
    Map<String, String> relationships,
  ) {
    final rows = <Map<String, dynamic>>[];
    for (final row in _childElements(table).where(
      (element) => element.name.local == 'tr',
    )) {
      final cells = <Map<String, dynamic>>[];
      for (final cell in _childElements(row).where(
        (element) => element.name.local == 'tc',
      )) {
        final blocks = <Map<String, dynamic>>[];
        for (final child in _childElements(cell)) {
          if (child.name.local == 'p') {
            blocks.add(_parseParagraph(child, archive, relationships));
          } else if (child.name.local == 'tbl') {
            blocks.add(_parseTable(child, archive, relationships));
          }
        }
        cells.add({
          'type': 'tableCell',
          'content': blocks.isEmpty
              ? [
                  {'type': 'paragraph'},
                ]
              : blocks,
        });
      }
      if (cells.isNotEmpty) {
        rows.add({'type': 'tableRow', 'content': cells});
      }
    }
    return {'type': 'table', 'content': rows};
  }

  static List<Map<String, dynamic>> _parseRun(
    XmlElement run,
    Archive archive,
    Map<String, String> relationships,
  ) {
    final properties = _firstChild(run, 'rPr');
    final marks = <Map<String, dynamic>>[];
    if (_firstChild(properties, 'b') != null ||
        _firstChild(properties, 'bCs') != null) {
      marks.add({'type': 'bold'});
    }
    if (_firstChild(properties, 'i') != null ||
        _firstChild(properties, 'iCs') != null) {
      marks.add({'type': 'italic'});
    }
    final underline = _firstChild(properties, 'u');
    if (underline != null && _attribute(underline, 'val') != 'none') {
      marks.add({'type': 'underline'});
    }
    if (_firstChild(properties, 'strike') != null ||
        _firstChild(properties, 'dstrike') != null) {
      marks.add({'type': 'strike'});
    }

    final nodes = <Map<String, dynamic>>[];
    for (final child in _childElements(run)) {
      switch (child.name.local) {
        case 't':
          final text = child.innerText;
          if (text.isNotEmpty) {
            nodes.add({
              'type': 'text',
              'text': text,
              if (marks.isNotEmpty)
                'marks': List<Map<String, dynamic>>.from(marks),
            });
          }
        case 'tab':
          nodes.add({
            'type': 'text',
            'text': '\t',
            if (marks.isNotEmpty)
              'marks': List<Map<String, dynamic>>.from(marks),
          });
        case 'br':
          nodes.add({'type': 'hardBreak'});
        case 'drawing':
        case 'pict':
          final image = _parseImage(child, archive, relationships);
          if (image != null) nodes.add(image);
      }
    }
    return nodes;
  }

  static Map<String, dynamic>? _parseImage(
    XmlElement drawing,
    Archive archive,
    Map<String, String> relationships,
  ) {
    final imageReference =
        _firstDescendant(drawing, 'blip') ??
        _firstDescendant(drawing, 'imagedata');
    final relationshipId = imageReference == null
        ? null
        : _attribute(imageReference, 'embed') ??
            _attribute(imageReference, 'id');
    if (relationshipId == null) return null;

    final target = relationships[relationshipId];
    if (target == null) return null;
    final archivePath = _resolveWordTarget(target);
    if (archivePath == null) return null;
    final imageFile = archive.findFile(archivePath);
    if (imageFile == null || imageFile.size <= 0) return null;
    if (imageFile.size > _maxImageBytes) {
      throw const FormatException(
        'توجد صورة في ملف Word تتجاوز الحجم المسموح',
      );
    }

    final extension = archivePath.split('.').last.toLowerCase();
    final mimeType = switch (extension) {
      'png' => 'image/png',
      'jpg' || 'jpeg' => 'image/jpeg',
      'gif' => 'image/gif',
      'webp' => 'image/webp',
      _ => null,
    };
    if (mimeType == null) return null;

    final bytes = List<int>.from(imageFile.content as List<int>);
    final docProperties = _firstDescendant(drawing, 'docPr');
    final extent = _firstDescendant(drawing, 'extent');
    final widthEmu = int.tryParse(_attribute(extent, 'cx') ?? '');
    final heightEmu = int.tryParse(_attribute(extent, 'cy') ?? '');

    return {
      'type': 'image',
      'attrs': {
        'src': 'data:$mimeType;base64,${base64Encode(bytes)}',
        'alt': _attribute(docProperties, 'descr') ?? 'صورة من مستند Word',
        if (widthEmu != null) 'width': widthEmu / 9525,
        if (heightEmu != null) 'height': heightEmu / 9525,
      },
    };
  }

  static String? _resolveWordTarget(String target) {
    final normalized = target.replaceAll('\\', '/').replaceFirst(
      RegExp(r'^/'),
      '',
    );
    final parts = normalized.split('/');
    if (parts.isNotEmpty && parts.first == 'word') parts.removeAt(0);
    final segments = <String>['word'];
    for (final segment in parts) {
      if (segment.isEmpty || segment == '.') continue;
      if (segment == '..') {
        if (segments.length <= 1) return null;
        segments.removeLast();
      } else {
        segments.add(segment);
      }
    }
    final path = segments.join('/');
    return path.startsWith('word/') ? path : null;
  }

  static List<Map<String, dynamic>> _mergeSplitTemplateTokens(
    List<Map<String, dynamic>> nodes,
  ) {
    final result = <Map<String, dynamic>>[];
    final pending = <Map<String, dynamic>>[];

    void flush() {
      if (pending.isNotEmpty) {
        result.addAll(pending);
        pending.clear();
      }
    }

    for (final node in nodes) {
      if (node['type'] != 'text') {
        flush();
        result.add(node);
        continue;
      }
      final text = node['text']?.toString() ?? '';
      if (pending.isEmpty && (!text.contains('{{') || text.contains('}}'))) {
        result.add(node);
        continue;
      }
      pending.add(node);
      if (text.contains('}}')) {
        result.add({
          'type': 'text',
          'text': pending.map((item) => item['text']?.toString() ?? '').join(),
        });
        pending.clear();
      }
    }
    flush();
    return result;
  }

  static List<Map<String, dynamic>> _normalizeTemplateTokens(
    List<Map<String, dynamic>> nodes,
  ) {
    final pattern = RegExp(r'\{\{\s*([^{}]+?)\s*\}\}');
    return nodes.map((node) {
      if (node['type'] != 'text') return node;
      final text = node['text']?.toString() ?? '';
      return {
        ...node,
        'text': text.replaceAllMapped(pattern, (match) {
          final key = _normalizeFieldKey(match.group(1) ?? '');
          return key.isEmpty ? match.group(0)! : '{{$key}}';
        }),
      };
    }).toList(growable: false);
  }

  static List<DocumentTemplateField> _extractTemplateFields(
    Map<String, dynamic> content,
  ) {
    final text = StringBuffer();
    void visit(dynamic node) {
      if (node is Map) {
        if (node['type'] == 'text') {
          text.write(node['text']?.toString() ?? '');
        }
        final children = node['content'];
        if (children is List) {
          for (final child in children) {
            visit(child);
          }
        }
      } else if (node is List) {
        for (final child in node) {
          visit(child);
        }
      }
    }

    visit(content);
    final fields = <String, DocumentTemplateField>{};
    final pattern = RegExp(r'\{\{\s*([^{}]+?)\s*\}\}');
    for (final match in pattern.allMatches(text.toString())) {
      final label = (match.group(1) ?? '').trim();
      final key = _normalizeFieldKey(label);
      if (key.isEmpty || fields.containsKey(key)) continue;
      final normalized = key.toLowerCase();
      final type = normalized.contains('date') || label.contains('تاريخ')
          ? DocumentTemplateFieldType.date
          : normalized.contains('number') ||
                  normalized.contains('serial') ||
                  label.contains('رقم')
              ? DocumentTemplateFieldType.number
              : normalized.contains('subject') ||
                      normalized.contains('body') ||
                      label.contains('موضوع') ||
                      label.contains('نص')
                  ? DocumentTemplateFieldType.multiline
                  : DocumentTemplateFieldType.text;
      fields[key] = DocumentTemplateField(
        key: key,
        label: label,
        type: type,
        required: true,
        maxLength: type == DocumentTemplateFieldType.multiline ? 2000 : 255,
      );
    }
    return fields.values.toList(growable: false);
  }

  static String _normalizeFieldKey(String value) => value
      .trim()
      .replaceAll(RegExp(r'\s+'), '_')
      .replaceAll(RegExp(r'[^\p{L}\p{N}_-]', unicode: true), '');

  static List<int>? _readArchiveFile(Archive archive, String path) {
    final file = archive.findFile(path);
    if (file == null) return null;
    return List<int>.from(file.content as List<int>);
  }

  static List<XmlElement> _childElements(XmlElement? element) =>
      element?.children.whereType<XmlElement>().toList(growable: false) ??
      const [];

  static XmlElement? _firstChild(XmlElement? element, String localName) {
    for (final child in _childElements(element)) {
      if (child.name.local == localName) return child;
    }
    return null;
  }

  static XmlElement? _firstDescendant(XmlElement element, String localName) {
    for (final child in element.descendants.whereType<XmlElement>()) {
      if (child.name.local == localName) return child;
    }
    return null;
  }

  static String? _attribute(XmlElement? element, String localName) {
    if (element == null) return null;
    for (final attribute in element.attributes) {
      if (attribute.name.local == localName) return attribute.value;
    }
    return null;
  }

  static int? _headingLevel(String? styleId) {
    if (styleId == null) return null;
    final match = RegExp(
      r'heading\s*([1-6])',
      caseSensitive: false,
    ).firstMatch(styleId);
    return match == null ? null : int.tryParse(match.group(1) ?? '');
  }

  static String? _paragraphAlignment(String? value) => switch (value) {
    'center' => 'center',
    'right' => 'right',
    'left' => 'left',
    'both' => 'justify',
    _ => null,
  };
}
