export type SavedDocumentView = {
  id: string;
  name: string;
  search: string;
  category: string;
  status: string;
  sort: string;
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
        ): item is Omit<SavedDocumentView, "status"> & {
          status?: unknown;
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
        sort: typeof item.sort === "string" ? item.sort : "updated-desc",
      }))
      .slice(0, 30);
  } catch {
    return [];
  }
}
