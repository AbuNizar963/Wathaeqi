type EditorContent = Record<string, unknown>;

const TEMPLATE_CONTAINERS = new Set([
  "doc",
  "paragraph",
  "heading",
  "blockquote",
  "bulletList",
  "orderedList",
  "listItem",
  "table",
  "tableRow",
  "tableHeader",
  "tableCell",
]);

const PLACEHOLDER_PATTERN =
  /\{\{\s*([\p{L}][\p{L}\p{N}_]{0,63})\s*\}\}/gu;

function isRecord(value: unknown): value is EditorContent {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Resolves supplied values in supported document text nodes only.
 * Unknown keys and unsupported editor nodes are preserved without mutation.
 * Replacement values are inserted once and are never interpreted as templates.
 */
export function applyDocumentTemplateVariables(
  content: EditorContent,
  values: Readonly<Record<string, string>>
): EditorContent {
  const visit = (node: unknown): unknown => {
    if (!isRecord(node)) return node;

    if (
      node.type === "legacy-text" &&
      (Object.keys(node).some(key => key !== "type" && key !== "text") ||
        typeof node.text !== "string")
    ) {
      return node;
    }

    if (
      (node.type === "text" || node.type === "legacy-text") &&
      typeof node.text === "string"
    ) {
      const nextText = node.text.replace(
        PLACEHOLDER_PATTERN,
        (placeholder, key: string) =>
          Object.hasOwn(values, key) ? values[key]! : placeholder
      );
      return nextText === node.text ? node : { ...node, text: nextText };
    }

    if (
      typeof node.type !== "string" ||
      !TEMPLATE_CONTAINERS.has(node.type) ||
      !Array.isArray(node.content)
    ) {
      return node;
    }

    const nextContent = node.content.map(visit);
    return nextContent.some((child, index) => child !== node.content[index])
      ? { ...node, content: nextContent }
      : node;
  };

  return visit(content) as EditorContent;
}
