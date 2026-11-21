import { editablePlainText, plainTextDocument } from "./documentEditorContent";

type ContentNode = Record<string, unknown>;

const SUPPORTED_NODES = new Set([
  "doc",
  "paragraph",
  "heading",
  "blockquote",
  "bulletList",
  "orderedList",
  "listItem",
  "codeBlock",
  "table",
  "tableRow",
  "tableHeader",
  "tableCell",
  "text",
  "hardBreak",
  "horizontalRule",
  "image",
]);

const SUPPORTED_MARKS = new Set([
  "bold",
  "italic",
  "strike",
  "underline",
  "code",
]);

function isRecord(value: unknown): value is ContentNode {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSafeImageSource(value: unknown): boolean {
  return (
    typeof value === "string" &&
    (/^https:\/\//iu.test(value) ||
      /^data:image\/(?:png|jpeg|webp);base64,/iu.test(value))
  );
}

function isSupportedNode(value: unknown): boolean {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  if (!SUPPORTED_NODES.has(value.type)) return false;

  if (value.type === "text" && typeof value.text !== "string") return false;
  if (
    value.type === "heading" &&
    isRecord(value.attrs) &&
    value.attrs.level !== 1 &&
    value.attrs.level !== 2
  ) {
    return false;
  }
  if (value.type === "image") {
    const attrs = isRecord(value.attrs) ? value.attrs : {};
    if (!isSafeImageSource(attrs.src)) return false;
  }

  if (value.marks !== undefined) {
    if (!Array.isArray(value.marks)) return false;
    if (
      !value.marks.every(
        mark => isRecord(mark) && typeof mark.type === "string" && SUPPORTED_MARKS.has(mark.type)
      )
    ) {
      return false;
    }
  }

  if (value.content !== undefined) {
    if (!Array.isArray(value.content) || !value.content.every(isSupportedNode)) {
      return false;
    }
  }
  return true;
}

/**
 * Only enable editing when every node and mark can round-trip through the
 * configured Tiptap extensions. Unknown legacy data remains read-only.
 */
export function supportsRichDocumentEditing(content: ContentNode): boolean {
  if (editablePlainText(content) !== null) return true;
  return (
    content.type === "doc" &&
    Array.isArray(content.content) &&
    content.content.every(isSupportedNode)
  );
}

export function richEditorContent(content: ContentNode): ContentNode {
  const plainText = editablePlainText(content);
  if (plainText !== null) return plainTextDocument(plainText);
  if (supportsRichDocumentEditing(content)) return content;
  return { type: "doc", content: [{ type: "paragraph" }] };
}

export function extractDocumentText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(extractDocumentText).join("");
  if (!isRecord(value)) return "";

  if (value.type === "legacy-text" && typeof value.text === "string") {
    return value.text;
  }
  if (value.type === "legacy-html" && typeof value.html === "string") {
    return value.html
      .replace(/<\/(p|div|h[1-6]|li|tr)>/giu, "\n")
      .replace(/<br\s*\/?\s*>/giu, "\n")
      .replace(/<[^>]*>/gu, "")
      .replace(/&nbsp;/gu, " ")
      .replace(/&amp;/gu, "&")
      .replace(/&lt;/gu, "<")
      .replace(/&gt;/gu, ">")
      .replace(/&quot;/gu, '"')
      .replace(/&#39;/gu, "'")
      .trim();
  }
  if (value.type === "text" && typeof value.text === "string") {
    return value.text;
  }

  const children = Array.isArray(value.content) ? value.content : [];
  return children
    .map(child => {
      const text = extractDocumentText(child);
      const childType = isRecord(child) ? child.type : undefined;
      return ["paragraph", "heading", "listItem"].includes(String(childType))
        ? text + "\n"
        : text;
    })
    .join("")
    .replace(/\n{3,}/gu, "\n\n")
    .replace(/\n+$/gu, "");
}
