import JSZip from "jszip";
import type { DocumentTemplateField } from "../../../../shared/documentStudio";

type EditorContent = Record<string, unknown>;

export type ImportedDocxTemplate = {
  content: EditorContent;
  fields: DocumentTemplateField[];
  sourceFileName: string;
};

const MAX_DOCX_SIZE = 25 * 1024 * 1024;
const WORD_DOCUMENT_XML = "word/document.xml";
const CONTENT_TYPES_XML = "[Content_Types].xml";
const VARIABLE_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/gu;

function localElements(parent: Document | Element, name: string): Element[] {
  return Array.from(parent.getElementsByTagNameNS("*", name));
}

function directText(element: Element): string {
  return localElements(element, "t")
    .map(node => node.textContent ?? "")
    .join("");
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

function paragraphText(paragraph: Element): string {
  return directText(paragraph)
    .replace(/\u00a0/gu, " ")
    .trim();
}

function tableRows(table: Element): string[] {
  return localElements(table, "tr").map(row =>
    localElements(row, "tc")
      .map(cell =>
        directText(cell)
          .replace(/\u00a0/gu, " ")
          .trim()
      )
      .join("\t")
      .trim()
  );
}

function toEditorDocument(lines: string[]): EditorContent {
  const cleaned = lines.filter((line, index) => line.length > 0 || index === 0);
  return {
    type: "doc",
    content: (cleaned.length ? cleaned : [""]).map(line =>
      line
        ? { type: "paragraph", content: [{ type: "text", text: line }] }
        : { type: "paragraph" }
    ),
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

  const lines: string[] = [];
  for (const child of Array.from(
    document.documentElement.getElementsByTagNameNS("*", "body")[0]?.children ??
      []
  )) {
    if (child.localName === "p") {
      lines.push(paragraphText(child));
    } else if (child.localName === "tbl") {
      lines.push(...tableRows(child));
    }
  }
  const content = toEditorDocument(lines);
  const text = lines.join("\n");
  return {
    content,
    fields: variableFields(text),
    sourceFileName: file.name,
  };
}

export const DOCX_TEMPLATE_MAX_SIZE = MAX_DOCX_SIZE;
