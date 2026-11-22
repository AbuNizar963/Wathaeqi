/// Resolves dynamic system placeholders in supported document editor nodes.
///
/// Unknown variables and unsupported editor nodes are preserved. Values are
/// inserted once and are not recursively interpreted as placeholders.
Map<String, dynamic> applyDocumentTemplateVariables(
  Map<String, dynamic> content,
  Map<String, String> values,
) {
  const containers = {
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
  final placeholderPattern = RegExp(r'\{\{\s*([^{}]+?)\s*\}\}');

  dynamic visit(dynamic node) {
    if (node is List) {
      return node.map(visit).toList(growable: false);
    }
    if (node is! Map) return node;

    final type = node['type'];
    if (type == 'legacy-text' &&
        (node.keys.any((key) => key != 'type' && key != 'text') ||
            node['text'] is! String)) {
      return node;
    }

    if ((type == 'text' || type == 'legacy-text') && node['text'] is String) {
      final original = node['text'] as String;
      final replaced = original.replaceAllMapped(placeholderPattern, (match) {
        final key = match.group(1)!.trim();
        return values.containsKey(key) ? values[key]! : match.group(0)!;
      });
      if (replaced == original) return node;
      return {...Map<String, dynamic>.from(node), 'text': replaced};
    }

    if (type is! String ||
        !containers.contains(type) ||
        node['content'] is! List) {
      return node;
    }

    final originalChildren = node['content'] as List;
    final nextChildren = originalChildren.map(visit).toList(growable: false);
    var changed = false;
    for (var index = 0; index < originalChildren.length; index += 1) {
      if (!identical(originalChildren[index], nextChildren[index])) {
        changed = true;
        break;
      }
    }
    if (!changed) return node;
    return {...Map<String, dynamic>.from(node), 'content': nextChildren};
  }

  final result = visit(content);
  return identical(result, content)
      ? content
      : Map<String, dynamic>.from(result as Map);
}
