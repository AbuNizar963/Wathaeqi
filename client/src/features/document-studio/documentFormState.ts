import type {
  DocumentTemplateField,
  OfficialDocument,
} from "../../../../shared/documentStudio";

type DocumentForm = Pick<
  OfficialDocument,
  | "title"
  | "category"
  | "subject"
  | "content"
  | "fieldValues"
  | "templateId"
  | "templateRevision"
> & { documentDate: string };

type SavedDocument = Pick<OfficialDocument, keyof DocumentForm>;

/**
 * A whitespace-only document number is an intentional handwritten placeholder.
 * Keep normal values trimmed as before, while preserving the explicit marker.
 */
export function makeDocumentNumber(value: string): string {
  if (value.length > 0 && !value.trim()) return " ";
  return value.trim();
}

export function parseDocumentDate(value: string): string | null {
  const normalized = value
    .trim()
    .replace(/[٠-٩]/gu, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/gu, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
  if (!normalized) return null;

  // Accept common date separators, including spaces typed on mobile keyboards.
  const parts = normalized.split(/[\/\s-]+/u);
  let isoValue = normalized;
  if (parts.length === 3 && parts.every(part => /^\d+$/.test(part))) {
    const [first, second, third] = parts;
    isoValue =
      first.length === 4
        ? `${first}-${second.padStart(2, "0")}-${third.padStart(2, "0")}`
        : `${third.padStart(4, "0")}-${second.padStart(2, "0")}-${first.padStart(2, "0")}`;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoValue)) return null;
  const date = new Date(`${isoValue}T12:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return null;
  const iso = date.toISOString();
  return iso.slice(0, 10) === isoValue ? iso : null;
}

export function isDocumentFormDirty(
  saved: SavedDocument,
  form: DocumentForm
): boolean {
  const date = new Date(saved.documentDate);
  const savedDate = Number.isFinite(date.getTime())
    ? date.toISOString().slice(0, 10)
    : "";
  return (
    saved.title !== form.title ||
    saved.category !== form.category ||
    saved.subject !== form.subject ||
    savedDate !== form.documentDate ||
    saved.templateId !== form.templateId ||
    saved.templateRevision !== form.templateRevision ||
    JSON.stringify(saved.content) !== JSON.stringify(form.content) ||
    JSON.stringify(saved.fieldValues) !== JSON.stringify(form.fieldValues)
  );
}

export function missingRequiredTemplateFields(
  fields: readonly DocumentTemplateField[],
  values: Readonly<Record<string, string>>
): DocumentTemplateField[] {
  return fields.filter(
    field => field.required && !(values[field.key] ?? "").trim()
  );
}

export function normalizeTemplateFieldValues(
  fields: readonly DocumentTemplateField[],
  values: Readonly<Record<string, string>>
): Record<string, string> {
  const normalized = { ...values };
  for (const field of fields) {
    const value = normalized[field.key] ?? field.defaultValue ?? "";
    if (field.type !== "select") continue;
    normalized[field.key] =
      field.options?.find(option => option.value === value)?.label ?? value;
  }
  return normalized;
}
