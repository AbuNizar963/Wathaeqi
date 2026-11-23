type EditorContent = Record<string, unknown>;

export type ParagraphFormatting = {
  textAlign?: "right" | "center" | "left" | "justify";
  blockType?: "paragraph" | "heading";
  lineHeight?: "normal" | "relaxed" | "loose";
};

function isRecord(value: unknown): value is EditorContent {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: EditorContent, keys: string[]): boolean {
  return Object.keys(value).every(key => keys.includes(key));
}

function hasParagraphAttributes(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["textAlign", "blockType", "lineHeight"])
  ) {
    return false;
  }
  return (
    (value.textAlign === undefined ||
      ["right", "center", "left", "justify"].includes(
        String(value.textAlign)
      )) &&
    (value.blockType === undefined ||
      ["paragraph", "heading"].includes(String(value.blockType))) &&
    (value.lineHeight === undefined ||
      ["normal", "relaxed", "loose"].includes(String(value.lineHeight)))
  );
}

/** Return null unless a textarea can represent every part of the input. */
export function editablePlainText(content: EditorContent): string | null {
  if (
    content.type === "legacy-text" &&
    hasOnlyKeys(content, ["type", "text"]) &&
    typeof content.text === "string" &&
    !content.text.includes("\r")
  ) {
    return content.text;
  }
  if (
    content.type !== "doc" ||
    !hasOnlyKeys(content, ["type", "content"]) ||
    !Array.isArray(content.content)
  ) {
    return null;
  }

  const lines: string[] = [];
  for (const paragraph of content.content) {
    if (
      !isRecord(paragraph) ||
      paragraph.type !== "paragraph" ||
      !hasOnlyKeys(paragraph, ["type", "content", "attrs"]) ||
      (paragraph.attrs !== undefined &&
        !hasParagraphAttributes(paragraph.attrs)) ||
      (paragraph.content !== undefined && !Array.isArray(paragraph.content))
    ) {
      return null;
    }
    let line = "";
    for (const child of paragraph.content ?? []) {
      if (
        !isRecord(child) ||
        child.type !== "text" ||
        !hasOnlyKeys(child, ["type", "text"]) ||
        typeof child.text !== "string" ||
        child.text.includes("\r")
      ) {
        return null;
      }
      line += child.text;
    }
    lines.push(line);
  }
  return lines.join("\n");
}

/** Each newline is a paragraph boundary, including empty and trailing lines. */
export function plainTextDocument(text: string): EditorContent {
  return {
    type: "doc",
    content: text
      .split("\n")
      .map(line =>
        line
          ? { type: "paragraph", content: [{ type: "text", text: line }] }
          : { type: "paragraph" }
      ),
  };
}

export function updatePlainTextDocument(
  previous: EditorContent,
  text: string
): EditorContent {
  const next = plainTextDocument(text);
  const previousParagraphs = Array.isArray(previous.content)
    ? previous.content
    : [];
  return {
    ...next,
    content: (next.content as unknown[]).map((node, index) => {
      const oldNode = previousParagraphs[index];
      if (!isRecord(node) || !isRecord(oldNode) || !isRecord(oldNode.attrs)) {
        return node;
      }
      return { ...node, attrs: oldNode.attrs };
    }),
  };
}

/** Apply lightweight paragraph formatting without introducing a heavy editor. */
export function formatPlainTextParagraph(
  content: EditorContent,
  text: string,
  cursorPosition: number,
  formatting: ParagraphFormatting
): EditorContent {
  const editable = editablePlainText(content);
  const base = editable === null ? plainTextDocument(text) : content;
  if (base.type !== "doc" || !Array.isArray(base.content)) return base;

  const beforeCursor = text.slice(0, Math.max(0, cursorPosition));
  const paragraphIndex = Math.min(
    base.content.length - 1,
    Math.max(0, beforeCursor.split("\n").length - 1)
  );
  return {
    ...base,
    content: base.content.map((node, index) => {
      if (
        !isRecord(node) ||
        node.type !== "paragraph" ||
        index !== paragraphIndex
      ) {
        return node;
      }
      const previous = isRecord(node.attrs) ? node.attrs : {};
      const attrs = { ...previous, ...formatting } as Record<string, unknown>;
      Object.keys(attrs).forEach(key => {
        if (attrs[key] === undefined) delete attrs[key];
      });
      return Object.keys(attrs).length
        ? { ...node, attrs }
        : { ...node, attrs: undefined };
    }),
  };
}

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

/** Substitute text nodes only, without traversing or rewriting unknown data. */
export function applyFieldValues(
  content: EditorContent,
  values: Readonly<Record<string, string>>
): EditorContent {
  const visit = (node: unknown): unknown => {
    if (!isRecord(node)) return node;
    if (node.type === "legacy-text" && editablePlainText(node) === null) {
      return node;
    }
    if (
      (node.type === "text" || node.type === "legacy-text") &&
      typeof node.text === "string"
    ) {
      const text = node.text.replace(
        /\{\{\s*([\p{L}][\p{L}\p{N}_]{0,63})\s*\}\}/gu,
        (placeholder, key: string) =>
          Object.hasOwn(values, key) ? values[key]! : placeholder
      );
      return text === node.text ? node : { ...node, text };
    }
    if (
      typeof node.type !== "string" ||
      !TEMPLATE_CONTAINERS.has(node.type) ||
      !Array.isArray(node.content)
    ) {
      return node;
    }
    return { ...node, content: node.content.map(visit) };
  };

  return visit(content) as EditorContent;
}

/** Saved snapshots and manually applied text must not be substituted again. */
export function contentForSave(
  content: EditorContent,
  values: Readonly<Record<string, string>>,
  applyValues: boolean
): EditorContent {
  return applyValues ? applyFieldValues(content, values) : content;
}
