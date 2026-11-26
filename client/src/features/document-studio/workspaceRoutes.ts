export const DOCUMENT_WORKSPACE_PATH = "/documents";
export const workspaceTabs = [
  "documents",
  "templates",
  "archive",
  "files",
] as const;
export type WorkspaceTab = (typeof workspaceTabs)[number];

export function workspaceTabFromSearch(search: string): WorkspaceTab {
  const params = new URLSearchParams(search);
  if (params.has("document") || params.get("create") === "1")
    return "documents";
  const tab = params.get("tab");
  return workspaceTabs.find(value => value === tab) ?? "documents";
}

export function legacyWorkspaceTarget(search: string): string {
  return `${DOCUMENT_WORKSPACE_PATH}${search}`;
}

export function documentUploadTarget(): string {
  return `${DOCUMENT_WORKSPACE_PATH}?upload=1`;
}

export function templateImportTarget(): string {
  return `${DOCUMENT_WORKSPACE_PATH}?tab=templates&importTemplate=1`;
}
