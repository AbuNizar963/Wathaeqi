export type SavedDocumentView = {
  id: string;
  name: string;
  search: string;
  category: string;
  status: string;
  sort: "updated-desc" | "updated-asc" | "title-asc";
};

export function savedDocumentViewsKey(userId: string | number): string {
  return `wathaeqi:saved-document-views:${String(userId)}`;
}

export function parseSavedDocumentViews(
  value: string | null
): SavedDocumentView[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (
          item
        ): item is Omit<SavedDocumentView, "status" | "sort"> & {
          status?: unknown;
          sort?: unknown;
        } =>
          Boolean(item) &&
          typeof item === "object" &&
          typeof item.id === "string" &&
          typeof item.name === "string" &&
          typeof item.search === "string" &&
          typeof item.category === "string"
      )
      .map(item => ({
        ...item,
        status: typeof item.status === "string" ? item.status : "",
        sort:
          item.sort === "updated-asc" || item.sort === "title-asc"
            ? item.sort
            : "updated-desc",
      }))
      .slice(0, 30);
  } catch {
    return [];
  }
}
