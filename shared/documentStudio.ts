/**
 * Document Studio domain contract.
 *
 * Templates are reusable definitions; issued documents are immutable snapshots
 * of a template revision plus the values supplied when the document was made.
 * Ownership is resolved from the authenticated Appwrite session and enforced
 * by the server; clients never choose another owner's identity.
 */

export type DocumentTemplateFieldType =
  "text" | "multiline" | "date" | "number" | "select";

export interface DocumentTemplateFieldOption {
  value: string;
  label: string;
}

export interface DocumentTemplateField {
  /** Stable key used by template content placeholders, e.g. employee_name. */
  key: string;
  label: string;
  type: DocumentTemplateFieldType;
  required: boolean;
  maxLength?: number;
  options?: DocumentTemplateFieldOption[];
  defaultValue?: string;
}

export interface DocumentTemplate {
  id: string;
  ownerId: string;
  title: string;
  description: string | null;
  category: string;
  /** TipTap JSON document, not HTML supplied by an untrusted client. */
  content: Record<string, unknown>;
  fields: DocumentTemplateField[];
  revision: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OfficialDocument {
  id: string;
  ownerId: string;
  templateId: string | null;
  templateRevision: number | null;
  title: string;
  subject: string;
  /** Canonical editor document snapshot. */
  content: Record<string, unknown>;
  fieldValues: Record<string, string>;
  serialNumber: number;
  serialCode: string;
  documentDate: string;
  status: "draft" | "issued" | "archived";
  createdAt: string;
  updatedAt: string;
  issuedAt: string | null;
  archivedAt: string | null;
}

const TEMPLATE_CONTENT_FORMAT = "wathaeqi-template-v1";
const DOCUMENT_CONTENT_FORMAT = "wathaeqi-document-v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseStoredContent(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function emptyEditorDocument(): Record<string, unknown> {
  return {
    type: "doc",
    content: [{ type: "paragraph" }],
  };
}

function preserveLegacyContent(raw: string): Record<string, unknown> {
  return raw.trimStart().startsWith("<")
    ? { type: "legacy-html", html: raw }
    : { type: "legacy-text", text: raw };
}

export interface DecodedTemplateContent {
  content: Record<string, unknown>;
  description: string | null;
  fields: DocumentTemplateField[];
  revision: number;
  isActive: boolean;
}

/**
 * The Appwrite templates table has a single longtext content column. Keep the
 * editor JSON and template metadata together there rather than mutating the
 * live table schema. Legacy HTML is returned losslessly for client conversion.
 */
export function encodeTemplateStorageContent(
  template: Pick<
    DocumentTemplate,
    "content" | "description" | "fields" | "revision" | "isActive"
  >
): string {
  return JSON.stringify({
    format: TEMPLATE_CONTENT_FORMAT,
    editor: template.content,
    description: template.description,
    fields: template.fields,
    revision: template.revision,
    isActive: template.isActive,
  });
}

export function decodeTemplateStorageContent(
  raw: unknown
): DecodedTemplateContent {
  const parsed = parseStoredContent(raw);
  if (
    isRecord(parsed) &&
    parsed.format === TEMPLATE_CONTENT_FORMAT &&
    isRecord(parsed.editor)
  ) {
    return {
      content: parsed.editor,
      description:
        typeof parsed.description === "string" ? parsed.description : null,
      fields: Array.isArray(parsed.fields)
        ? (parsed.fields as DocumentTemplateField[])
        : [],
      revision:
        typeof parsed.revision === "number" && Number.isSafeInteger(parsed.revision)
          ? parsed.revision
          : 1,
      isActive: parsed.isActive !== false,
    };
  }

  if (isRecord(parsed)) {
    return {
      content: parsed,
      description: null,
      fields: [],
      revision: 1,
      isActive: true,
    };
  }

  if (typeof parsed === "string" && parsed.length > 0) {
    return {
      content: preserveLegacyContent(parsed),
      description: null,
      fields: [],
      revision: 1,
      isActive: true,
    };
  }

  return {
    content: emptyEditorDocument(),
    description: null,
    fields: [],
    revision: 1,
    isActive: true,
  };
}

export interface DecodedOfficialDocumentContent {
  content: Record<string, unknown>;
  subject: string;
  fieldValues: Record<string, string>;
  serialNumber: number;
  serialCode: string;
  documentDate: string;
  status: OfficialDocument["status"];
  templateId: string | null;
  templateRevision: number | null;
  issuedAt: string | null;
  archivedAt: string | null;
}

/**
 * The existing Appwrite documents table stores legacy HTML in its content
 * column. New records use a versioned envelope in that same column; reads
 * preserve legacy HTML without rewriting or migrating existing rows.
 */
export function encodeOfficialDocumentStorageContent(
  document: Pick<
    OfficialDocument,
    | "content"
    | "subject"
    | "fieldValues"
    | "serialNumber"
    | "serialCode"
    | "documentDate"
    | "status"
    | "templateId"
    | "templateRevision"
    | "issuedAt"
    | "archivedAt"
  >
): string {
  return JSON.stringify({
    format: DOCUMENT_CONTENT_FORMAT,
    editor: document.content,
    subject: document.subject,
    fieldValues: document.fieldValues,
    serialNumber: document.serialNumber,
    serialCode: document.serialCode,
    documentDate: document.documentDate,
    status: document.status,
    templateId: document.templateId,
    templateRevision: document.templateRevision,
    issuedAt: document.issuedAt,
    archivedAt: document.archivedAt,
  });
}

export function decodeOfficialDocumentStorageContent(
  raw: unknown,
  fallbackDocumentDate: string
): DecodedOfficialDocumentContent {
  const parsed = parseStoredContent(raw);
  if (
    isRecord(parsed) &&
    parsed.format === DOCUMENT_CONTENT_FORMAT &&
    isRecord(parsed.editor)
  ) {
    const status =
      parsed.status === "issued" || parsed.status === "archived"
        ? parsed.status
        : "draft";
    return {
      content: parsed.editor,
      subject: typeof parsed.subject === "string" ? parsed.subject : "",
      fieldValues: isRecord(parsed.fieldValues)
        ? Object.fromEntries(
            Object.entries(parsed.fieldValues).map(([key, value]) => [
              key,
              typeof value === "string" ? value : String(value ?? ""),
            ])
          )
        : {},
      serialNumber:
        typeof parsed.serialNumber === "number" &&
        Number.isSafeInteger(parsed.serialNumber)
          ? parsed.serialNumber
          : 0,
      serialCode: typeof parsed.serialCode === "string" ? parsed.serialCode : "",
      documentDate:
        typeof parsed.documentDate === "string"
          ? parsed.documentDate
          : fallbackDocumentDate,
      status,
      templateId: typeof parsed.templateId === "string" ? parsed.templateId : null,
      templateRevision:
        typeof parsed.templateRevision === "number" &&
        Number.isSafeInteger(parsed.templateRevision)
          ? parsed.templateRevision
          : null,
      issuedAt: typeof parsed.issuedAt === "string" ? parsed.issuedAt : null,
      archivedAt:
        typeof parsed.archivedAt === "string" ? parsed.archivedAt : null,
    };
  }

  return {
    content:
      isRecord(parsed)
        ? parsed
        : typeof parsed === "string" && parsed.length > 0
          ? preserveLegacyContent(parsed)
          : emptyEditorDocument(),
    subject: "",
    fieldValues: {},
    serialNumber: 0,
    serialCode: "",
    documentDate: fallbackDocumentDate,
    status: "draft",
    templateId: null,
    templateRevision: null,
    issuedAt: null,
    archivedAt: null,
  };
}

export interface DocumentTemplateValidationIssue {
  fieldKey: string;
  message: string;
}

/**
 * Client-side convenience validation only. The server must repeat all checks
 * and enforce owner access before persisting template/document data.
 */
export function validateTemplateFieldValues(
  fields: readonly DocumentTemplateField[],
  values: Readonly<Record<string, string>>
): DocumentTemplateValidationIssue[] {
  const issues: DocumentTemplateValidationIssue[] = [];

  for (const field of fields) {
    const value = values[field.key] ?? "";
    if (field.required && value.trim().length === 0) {
      issues.push({
        fieldKey: field.key,
        message: `الحقل «${field.label}» مطلوب.`,
      });
    }
    if (field.maxLength !== undefined && value.length > field.maxLength) {
      issues.push({
        fieldKey: field.key,
        message: `يجب ألا يتجاوز «${field.label}» ${field.maxLength} حرفاً.`,
      });
    }
    if (field.type === "select" && value.length > 0) {
      const options = field.options ?? [];
      const isAllowed = options.some(option => option.value === value);
      if (!isAllowed) {
        issues.push({
          fieldKey: field.key,
          message: `القيمة المحددة للحقل «${field.label}» غير صالحة.`,
        });
      }
    }
  }

  return issues;
}
