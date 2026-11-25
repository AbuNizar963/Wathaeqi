import { describe, expect, it } from "vitest";
import {
  legacyWorkspaceTarget,
  workspaceTabFromSearch,
  workspaceTabs,
} from "./workspaceRoutes";

describe("unified document workspace routes", () => {
  it("keeps exactly one ordered set of workspace sections", () => {
    expect(workspaceTabs).toEqual([
      "documents",
      "templates",
      "archive",
      "files",
    ]);
  });
  it("preserves legacy document IDs and one-shot creation commands", () => {
    expect(legacyWorkspaceTarget("?document=doc-123")).toBe(
      "/documents?document=doc-123"
    );
    expect(legacyWorkspaceTarget("?create=1")).toBe("/documents?create=1");
    expect(legacyWorkspaceTarget("")).toBe("/documents");
  });
  it("opens each section from a deep link and defaults safely", () => {
    expect(workspaceTabFromSearch("?tab=templates")).toBe("templates");
    expect(workspaceTabFromSearch("?tab=files")).toBe("files");
    expect(workspaceTabFromSearch("?tab=archive")).toBe("archive");
    expect(workspaceTabFromSearch("?tab=unknown")).toBe("documents");
  });
  it("opens document commands in the editor regardless of section", () => {
    expect(workspaceTabFromSearch("?tab=files&document=abc")).toBe("documents");
    expect(workspaceTabFromSearch("?tab=templates&create=1")).toBe("documents");
  });
});
