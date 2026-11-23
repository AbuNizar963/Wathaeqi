import type { OfficialDocument } from "../../../../shared/documentStudio";

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

export function parseDocumentDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return null;
  const iso = date.toISOString();
  return iso.slice(0, 10) === value ? iso : null;
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
