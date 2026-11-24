export type SavedDocumentView = {
  id: string;
  name: string;
  search: string;
  category: string;
  status: "all" | "draft" | "issued" | "archived";
  sort: "updated-desc" | "updated-asc" | "title-asc";
};

type SavedDocumentViewInput = {
  id: string;
  name: string;
  search: string;
  category: string;
  status?: unknown;
  sort?: unknown;
};

export function savedDocumentViewsKey(userId: string | number): string {
  return `wathaeqi:saved-document-views:${String(userId)}`;
}

function isSavedDocumentViewInput(value: unknown): value is SavedDocumentViewInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.search === "string" &&
    typeof item.category === "string"
  );
}

export function parseSavedDocumentViews(
  value: string | null
): SavedDocumentView[] {
  if (!value) return [];

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(isSavedDocumentViewInput)
      .map(item => ({
        id: item.id,
        name: item.name,
        search: item.search,
        category: item.category,
        status:
          item.status === "draft" ||
          item.status === "issued" ||
          item.status === "archived"
            ? item.status
            : "all",
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
