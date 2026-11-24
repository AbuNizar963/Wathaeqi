import type { OfficialDocument } from "../../../../shared/documentStudio";

export type DocumentStatusFilter = "all" | OfficialDocument["status"];
export type DocumentSortOrder = "updated-desc" | "updated-asc" | "title-asc";

export function filterAndSortDocuments(
  documents: readonly OfficialDocument[],
  options: {
    search?: string;
    category?: string;
    status?: DocumentStatusFilter;
    sort?: DocumentSortOrder;
  } = {}
): OfficialDocument[] {
  const needle = (options.search ?? "").trim().toLocaleLowerCase();
  const filtered = documents.filter(document => {
    if (options.category && document.category !== options.category) return false;
    if (options.status && options.status !== "all" && document.status !== options.status) return false;
    if (!needle) return true;
    return [
      document.title,
      document.subject,
      document.file?.fileName ?? "",
      document.serialCode,
    ].some(value => value.toLocaleLowerCase().includes(needle));
  });

  const sort = options.sort ?? "updated-desc";
  return filtered.sort((left, right) => {
    if (sort === "title-asc") {
      return left.title.localeCompare(right.title, "ar") || left.id.localeCompare(right.id);
    }
    const leftTime = Date.parse(left.updatedAt);
    const rightTime = Date.parse(right.updatedAt);
    const difference = (Number.isFinite(leftTime) ? leftTime : 0) -
      (Number.isFinite(rightTime) ? rightTime : 0);
    return (sort === "updated-asc" ? difference : -difference) ||
      left.id.localeCompare(right.id);
  });
}
