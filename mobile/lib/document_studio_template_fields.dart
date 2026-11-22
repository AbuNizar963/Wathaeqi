/// Safe placeholder substitution for TipTap-compatible document content.
class DocumentStudioTemplateFields {
  const DocumentStudioTemplateFields._();

  static const _containerTypes = <String>{
    'doc',
    'paragraph',
    'heading',
    'blockquote',
    'bulletList',
    'orderedList',
    'listItem',
    'table',
    'tableRow',
    'tableHeader',
    'tableCell',
  };

  /// Replaces placeholders in supported text nodes only.
  ///
  /// Unknown nodes, attributes, marks, HTML payloads and unrelated metadata
  /// are preserved unchanged. The source content is never mutated.
  static Map<String, dynamic> applyFieldValues(
    Map<String, dynamic> content,
    Map<String, String> values,
  ) {
    bool isSupportedLegacyText(Map<String, dynamic> node) =>
        node['type'] == 'legacy-text' &&
        node.keys.every((key) => key == 'type' || key == 'text') &&
        node['text'] is String &&
        !(node['text'] as String).contains('\r');

    String replacePlaceholders(String source) {
      return source.replaceAllMapped(RegExp(r'\{\{\s*([^{}]{1,64}?)\s*\}\}'), (
        match,
      ) {
        final key = match.group(1)?.trim() ?? '';
        return values.containsKey(key) ? values[key]! : match.group(0)!;
      });
    }

    dynamic visit(dynamic value) {
      if (value is List) {
        return value.map(visit).toList(growable: false);
      }
      if (value is! Map) return value;

      final node = Map<String, dynamic>.from(value);
      final type = node['type'];

      if (type == 'legacy-text') {
        if (!isSupportedLegacyText(node)) return value;
        final text = replacePlaceholders(node['text'] as String);
        return text == node['text'] ? value : {...node, 'text': text};
      }

      if (type == 'text' && node['text'] is String) {
        final text = replacePlaceholders(node['text'] as String);
        return text == node['text'] ? value : {...node, 'text': text};
      }

      if (type is! String ||
          !_containerTypes.contains(type) ||
          node['content'] is! List) {
        return value;
      }

      return {
        ...node,
        'content': (node['content'] as List).map(visit).toList(growable: false),
      };
    }

    return Map<String, dynamic>.from(visit(content) as Map);
  }
}
