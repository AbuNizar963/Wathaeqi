import JSZip from "jszip";
import type { DocumentTemplateField } from "../../../../shared/documentStudio";

type EditorNode = Record<string, unknown>;

export type ImportedDocxTemplate = {
  content: EditorNode;
  fields: DocumentTemplateField[];
  sourceFileName: string;
};

const MAX_DOCX_SIZE = 25 * 1024 * 1024;
const MAX_DOCX_IMAGE_BYTES = 384 * 1024;
const MAX_DOCX_IMAGES = 24;
const WORD_DOCUMENT_XML = "word/document.xml";
const WORD_RELATIONSHIPS_XML = "word/_rels/document.xml.rels";
const CONTENT_TYPES_XML = "[Content_Types].xml";
const WORD_NAMESPACE =
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const RELATIONSHIP_NAMESPACE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const VARIABLE_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/gu;

const IMAGE_MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

function localElements(parent: Document | Element, name: string): Element[] {
  return Array.from(parent.getElementsByTagNameNS("*", name));
}

function directChildren(parent: Element): Element[] {
  return Array.from(parent.children);
}

function directChild(parent: Element, name: string): Element | undefined {
  return directChildren(parent).find(child => child.localName === name);
}

function wordAttribute(element: Element | undefined, name: string): string {
  if (!element) return "";
  return (
    element.getAttributeNS(WORD_NAMESPACE, name) ||
    element.getAttribute("w:" + name) ||
    ""
  );
}

function relationshipAttribute(element: Element, name: string): string {
  return (
    element.getAttributeNS(RELATIONSHIP_NAMESPACE, name) ||
    element.getAttribute("r:" + name) ||
    ""
  );
}

function isEnabledWordProperty(element: Element | undefined): boolean {
  if (!element) return false;
  const value = wordAttribute(element, "val").toLowerCase();
  return value !== "0" && value !== "false" && value !== "none";
}

function normalizeVariableKey(value: string): string {
  return value
    .trim()
    .replace(/[\s-]+/gu, "_")
    .replace(/[^\p{L}\p{N}_]/gu, "")
    .replace(/^_+|_+$/gu, "")
    .slice(0, 64);
}

function variableFields(text: string): DocumentTemplateField[] {
  const fields = new Map<string, DocumentTemplateField>();
  for (const match of text.matchAll(VARIABLE_PATTERN)) {
    const raw = match[1] ?? "";
    const key = normalizeVariableKey(raw);
    if (!key || fields.has(key)) continue;
    const isDate = /(^|_)(date|التاريخ)(_|$)/iu.test(key);
    fields.set(key, {
      key,
      label: key.replace(/_/gu, " "),
      type: isDate ? "date" : "text",
      required: false,
    });
  }
  return [...fields.values()];
}

function normalizeRelationshipTarget(target: string): string | null {
  if (!target || target.includes("\\")) return null;
  const source = target.startsWith("/word/") ? target.slice(1) : target;
  if (source.startsWith("/")) return null;
  const segments = source.startsWith("word/") ? [] : ["word"];
  for (const segment of source.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (segments.length <= 1) return null;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/");
}

async function readImageRelationships(
  zip: JSZip
): Promise<Map<string, string>> {
  const relationshipsFile = zip.file(WORD_RELATIONSHIPS_XML);
  if (!relationshipsFile) return new Map();

  const xml = await relationshipsFile.async("text");
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) {
    throw new Error("تعذر قراءة روابط الصور داخل ملف Word.");
  }

  const relationships = new Map<string, string>();
  for (const relation of localElements(document, "Relationship")) {
    const id = relation.getAttribute("Id") ?? "";
    const type = relation.getAttribute("Type") ?? "";
    const target = relation.getAttribute("Target") ?? "";
    const targetMode = relation.getAttribute("TargetMode") ?? "";
    if (!id || !type.endsWith("/image") || targetMode === "External") continue;

    const normalizedTarget = normalizeRelationshipTarget(target);
    if (normalizedTarget) relationships.set(id, normalizedTarget);
  }
  return relationships;
}

function estimateBase64Bytes(value: string): number {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((value.length * 3) / 4) - padding);
}

type ImageResolver = (drawing: Element) => Promise<EditorNode | null>;

function createImageResolver(
  zip: JSZip,
  relationships: Map<string, string>
): ImageResolver {
  const cache = new Map<string, EditorNode>();
  let imageCount = 0;
  let totalImageBytes = 0;

  return async drawing => {
    const blip = localElements(drawing, "blip")[0];
    if (!blip) return null;

    const relationshipId = relationshipAttribute(blip, "embed");
    if (!relationshipId) {
      throw new Error("يحتوي ملف Word على صورة مرتبطة بمصدر خارجي غير مدعوم.");
    }

    const cached = cache.get(relationshipId);
    if (cached) return cached;

    const imagePath = relationships.get(relationshipId);
    if (!imagePath) {
      throw new Error("تعذر العثور على ملف صورة مرتبط داخل مستند Word.");
    }

    const extension = imagePath.split(".").pop()?.toLowerCase() ?? "";
    const mimeType = IMAGE_MIME_TYPES[extension];
    if (!mimeType) {
      throw new Error(
        "صيغة إحدى صور Word غير مدعومة. استخدم PNG أو JPEG أو GIF أو WebP."
      );
    }

    const imageFile = zip.file(imagePath);
    if (!imageFile) {
      throw new Error("ملف صورة مضمّن مفقود من مستند Word.");
    }

    const base64 = await imageFile.async("base64");
    const byteLength = estimateBase64Bytes(base64);
    imageCount += 1;
    totalImageBytes += byteLength;
    if (
      imageCount > MAX_DOCX_IMAGES ||
      totalImageBytes > MAX_DOCX_IMAGE_BYTES
    ) {
      throw new Error(
        "إجمالي الصور في قالب Word أكبر من الحد الآمن للاستيراد. قلّل حجم الصور ثم أعد المحاولة."
      );
    }

    const properties = localElements(drawing, "docPr")[0];
    const alt =
      properties?.getAttribute("descr") ||
      properties?.getAttribute("title") ||
      "صورة من مستند Word";
    const extent = localElements(drawing, "extent")[0];
    const widthEmu = Number(extent?.getAttribute("cx"));
    const heightEmu = Number(extent?.getAttribute("cy"));
    const attrs: Record<string, unknown> = {
      src: "data:" + mimeType + ";base64," + base64,
      alt: alt.slice(0, 255),
      title: alt.slice(0, 255),
    };
    if (Number.isFinite(widthEmu) && widthEmu > 0) {
      attrs.width = Math.min(1600, Math.max(1, Math.round(widthEmu / 9525)));
    }
    if (Number.isFinite(heightEmu) && heightEmu > 0) {
      attrs.height = Math.min(1600, Math.max(1, Math.round(heightEmu / 9525)));
    }
    const imageNode: EditorNode = { type: "image", attrs };
    cache.set(relationshipId, imageNode);
    return imageNode;
  };
}

function runMarks(run: Element): EditorNode[] {
  const properties = directChild(run, "rPr");
  if (!properties) return [];

  const marks: EditorNode[] = [];
  if (isEnabledWordProperty(directChild(properties, "b"))) {
    marks.push({ type: "bold" });
  }
  if (isEnabledWordProperty(directChild(properties, "i"))) {
    marks.push({ type: "italic" });
  }
  if (isEnabledWordProperty(directChild(properties, "u"))) {
    marks.push({ type: "underline" });
  }
  if (
    isEnabledWordProperty(directChild(properties, "strike")) ||
    isEnabledWordProperty(directChild(properties, "dstrike"))
  ) {
    marks.push({ type: "strike" });
  }
  return marks;
}

function textNode(text: string, marks: EditorNode[]): EditorNode {
  return {
    type: "text",
    text,
    ...(marks.length > 0 ? { marks } : {}),
  };
}

async function parseRun(
  run: Element,
  resolveImage: ImageResolver
): Promise<EditorNode[]> {
  const marks = runMarks(run);
  const nodes: EditorNode[] = [];
  for (const child of directChildren(run)) {
    if (child.localName === "t" || child.localName === "delText") {
      const text = child.textContent ?? "";
      if (text) nodes.push(textNode(text, marks));
    } else if (child.localName === "tab") {
      nodes.push(textNode("\t", marks));
    } else if (child.localName === "br" || child.localName === "cr") {
      nodes.push({ type: "hardBreak" });
    } else if (child.localName === "drawing") {
      const image = await resolveImage(child);
      if (image) nodes.push(image);
    }
  }
  return nodes;
}

function mergeAdjacentTextNodes(nodes: EditorNode[]): EditorNode[] {
  const merged: EditorNode[] = [];
  for (const node of nodes) {
    const previous = merged[merged.length - 1];
    if (node.type !== "text" || previous?.type !== "text") {
      merged.push(node);
      continue;
    }

    const previousMarks = JSON.stringify(previous.marks ?? []);
    const currentMarks = JSON.stringify(node.marks ?? []);
    const previousText = String(previous.text ?? "");
    const currentText = String(node.text ?? "");
    const hasOpenVariable =
      previousText.lastIndexOf("{{") > previousText.lastIndexOf("}}");
    if (previousMarks === currentMarks || hasOpenVariable) {
      previous.text = previousText + currentText;
    } else {
      merged.push(node);
    }
  }
  return merged;
}

function paragraphAlignment(paragraph: Element): string | null {
  const properties = directChild(paragraph, "pPr");
  const alignment = wordAttribute(
    directChild(properties ?? paragraph, "jc"),
    "val"
  );
  switch (alignment) {
    case "right":
      return "right";
    case "center":
      return "center";
    case "left":
      return "left";
    case "both":
    case "distribute":
      return "justify";
    default:
      return null;
  }
}

function paragraphHeadingLevel(paragraph: Element): number | null {
  const properties = directChild(paragraph, "pPr");
  const style = wordAttribute(
    directChild(properties ?? paragraph, "pStyle"),
    "val"
  );
  const match = style.match(/^heading([12])$/iu);
  if (match) return Number(match[1]);
  if (style.toLowerCase() === "title") return 1;
  if (style.toLowerCase() === "subtitle") return 2;
  return null;
}

async function parseParagraph(
  paragraph: Element,
  resolveImage: ImageResolver
): Promise<EditorNode> {
  const nodes: EditorNode[] = [];
  for (const child of directChildren(paragraph)) {
    if (child.localName === "r") {
      nodes.push(...(await parseRun(child, resolveImage)));
    } else if (child.localName === "hyperlink") {
      for (const run of directChildren(child).filter(
        item => item.localName === "r"
      )) {
        nodes.push(...(await parseRun(run, resolveImage)));
      }
    } else if (child.localName === "sdt") {
      for (const run of localElements(child, "r")) {
        nodes.push(...(await parseRun(run, resolveImage)));
      }
    }
  }

  const content = mergeAdjacentTextNodes(nodes);
  const alignment = paragraphAlignment(paragraph);
  const headingLevel = paragraphHeadingLevel(paragraph);
  const attrs: Record<string, unknown> = {};
  if (alignment) attrs.textAlign = alignment;
  if (headingLevel) attrs.level = headingLevel;

  return {
    type: headingLevel ? "heading" : "paragraph",
    ...(Object.keys(attrs).length > 0 ? { attrs } : {}),
    ...(content.length > 0 ? { content } : {}),
  };
}

async function parseTable(
  table: Element,
  resolveImage: ImageResolver
): Promise<EditorNode> {
  const rows: EditorNode[] = [];
  for (const row of directChildren(table).filter(
    item => item.localName === "tr"
  )) {
    const rowProperties = directChild(row, "trPr");
    const isHeader = Boolean(directChild(rowProperties ?? row, "tblHeader"));
    const cells: EditorNode[] = [];

    for (const cell of directChildren(row).filter(
      item => item.localName === "tc"
    )) {
      const cellContent: EditorNode[] = [];
      for (const child of directChildren(cell)) {
        if (child.localName === "p") {
          cellContent.push(await parseParagraph(child, resolveImage));
        } else if (child.localName === "tbl") {
          cellContent.push(await parseTable(child, resolveImage));
        }
      }
      if (cellContent.length === 0) {
        cellContent.push({ type: "paragraph" });
      }
      cells.push({
        type: isHeader ? "tableHeader" : "tableCell",
        content: cellContent,
      });
    }
    if (cells.length > 0) rows.push({ type: "tableRow", content: cells });
  }

  return rows.length > 0
    ? { type: "table", content: rows }
    : { type: "paragraph" };
}

function collectEditorText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(collectEditorText).join("");
  if (!value || typeof value !== "object") return "";

  const node = value as EditorNode;
  if (node.type === "text" && typeof node.text === "string") return node.text;
  if (node.type === "hardBreak") return "\n";
  const children = Array.isArray(node.content) ? node.content : [];
  const text = children.map(collectEditorText).join("");
  if (node.type === "tableCell" || node.type === "tableHeader") {
    return text + "\t";
  }
  if (
    node.type === "tableRow" ||
    node.type === "paragraph" ||
    node.type === "heading"
  ) {
    return text + "\n";
  }
  return text;
}

async function parseDocumentContent(
  document: Document,
  resolveImage: ImageResolver
): Promise<EditorNode> {
  const body = localElements(document, "body")[0];
  if (!body) throw new Error("لم يُعثر على محتوى مستند Word.");

  const content: EditorNode[] = [];
  for (const child of directChildren(body)) {
    if (child.localName === "p") {
      content.push(await parseParagraph(child, resolveImage));
    } else if (child.localName === "tbl") {
      content.push(await parseTable(child, resolveImage));
    }
  }

  return {
    type: "doc",
    content: content.length > 0 ? content : [{ type: "paragraph" }],
  };
}

export async function importDocxTemplate(
  file: File
): Promise<ImportedDocxTemplate> {
  if (file.size < 1 || file.size > MAX_DOCX_SIZE) {
    throw new Error("يجب أن يكون حجم ملف Word بين 1 بايت و25 ميغابايت.");
  }
  const isDocx =
    file.name.toLowerCase().endsWith(".docx") ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (!isDocx) throw new Error("اختر ملف Word بصيغة DOCX فقط.");

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    throw new Error("ملف Word غير صالح أو تالف.");
  }
  if (!zip.file(CONTENT_TYPES_XML) || !zip.file(WORD_DOCUMENT_XML)) {
    throw new Error("لم تُعثر على بنية DOCX القياسية داخل الملف.");
  }

  const xml = await zip.file(WORD_DOCUMENT_XML)!.async("text");
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) {
    throw new Error("تعذر قراءة محتوى ملف Word.");
  }

  const relationships = await readImageRelationships(zip);
  const resolveImage = createImageResolver(zip, relationships);
  const content = await parseDocumentContent(document, resolveImage);
  const text = collectEditorText(content);
  return {
    content,
    fields: variableFields(text),
    sourceFileName: file.name,
  };
}

export const DOCX_TEMPLATE_MAX_SIZE = MAX_DOCX_SIZE;
