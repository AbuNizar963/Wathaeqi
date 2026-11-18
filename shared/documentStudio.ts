/**
 * Document Studio domain contract.
 *
 * Templates are reusable definitions; issued documents are immutable snapshots
 * of a template revision plus the values supplied when the document was made.
 * Organization scope is always resolved and enforced by the server.
 */

export type DocumentTemplateFieldType =
  | "text"
  | "multiline"
  | "date"
  | "number"
  | "select";

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
  organizationId: string;
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
  organizationId: string;
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
  createdByUserId: number;
  createdAt: string;
  updatedAt: string;
  issuedAt: string | null;
  archivedAt: string | null;
}

export interface DocumentTemplateValidationIssue {
  fieldKey: string;
  message: string;
}

/**
 * Client-side convenience validation only. The server must repeat all checks
 * and enforce organization access before persisting template/document data.
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
    if (
      field.maxLength !== undefined &&
      value.length > field.maxLength
    ) {
      issues.push({
        fieldKey: field.key,
        message: `يجب ألا يتجاوز «${field.label}» ${field.maxLength} حرفاً.`,
      });
    }
    if (
      field.type === "select" &&
      value.length > 0 &&
      !(field.options ?? []).some(option => option.value === value)
    ) {
      issues.push({
        fieldKey: field.key,
        message: `القيمة المحددة للحقل «${field.label}» غير صالحة.`,
      });
    }
  }

  return issues;
}
