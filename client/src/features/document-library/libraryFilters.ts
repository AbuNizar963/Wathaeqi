import type { OfficialDocument } from "../../../../shared/documentStudio";

export type DocumentStatusFilter = "all" | OfficialDocument["status"];
export type DocumentSortOrder = "updated-desc" | "updated-asc" | "title-asc";

type FilterableDocument = Pick<
  OfficialDocument,
  | "id"
  | "title"
  | "category"
  | "subject"
  | "serialCode"
  | "status"
  | "updatedAt"
> & {
  file: Pick<NonNullable<OfficialDocument["file"]>, "fileName"> | null;
};

export function normalizeDocumentSearch(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\\u064B-\\u065F\\u0670\\u0640]/g, "")
    .replace(/[\\u0622\\u0623\\u0625\\u0671]/g, "ا")
    .replace(/\\u0649/g, "ي")
    .replace(/\\u0629/g, "ه")
    .trim();
}

export function filterAndSortDocuments<T extends FilterableDocument>(
  documents: readonly T[],
  options: {
    search?: string;
    category?: string;
    status?: DocumentStatusFilter;
    sort?: DocumentSortOrder;
  } = {}
): T[] {
  const needle = normalizeDocumentSearch(options.search ?? "");
  const filtered = documents.filter(document => {
    if (options.category && document.category !== options.category) {
      return false;
    }
    if (
      options.status &&
      options.status !== "all" &&
      document.status !== options.status
    ) {
      return false;
    }
    if (!needle) return true;
    return [
      document.title,
      document.subject,
      document.file?.fileName ?? "",
      document.serialCode,
    ].some(value => normalizeDocumentSearch(value).includes(needle));
  });

  const sort = options.sort ?? "updated-desc";
  return filtered.sort((left, right) => {
    if (sort === "title-asc") {
      return (
        left.title.localeCompare(right.title, "ar") ||
        left.id.localeCompare(right.id)
      );
    }

    const leftTime = Date.parse(left.updatedAt);
    const rightTime = Date.parse(right.updatedAt);
    const difference =
      (Number.isFinite(leftTime) ? leftTime : 0) -
      (Number.isFinite(rightTime) ? rightTime : 0);

    return (
      (sort === "updated-asc" ? difference : -difference) ||
      left.id.localeCompare(right.id)
    );
  });
}
