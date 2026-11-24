import { beforeEach, describe, expect, it, vi } from "vitest";
import { Query } from "node-appwrite";
import { encodeTemplateStorageContent } from "../../../shared/documentStudio";

const tablesMock = vi.hoisted(() => ({
  listRows: vi.fn(),
}));

vi.mock("../../_core/appwrite", () => ({
  getAppwriteDatabaseId: () => "test-database",
  getAppwriteTablesDB: () => tablesMock,
}));

import { listDocumentTemplates } from "./documentStudioRepository";

const ownerId = "550e8400-e29b-41d4-a716-446655440000";

function templateRow(index: number) {
  const timestamp = new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString();
  return {
    $id: `template-${index}`,
    $createdAt: timestamp,
    $updatedAt: timestamp,
    data: {
      ownerId,
      title: `Template ${index}`,
      category: "general",
      content: encodeTemplateStorageContent({
        content: { type: "doc", content: [] },
        description: null,
        fields: [],
        revision: 1,
        isActive: true,
      }),
    },
  };
}

describe("document studio repository pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("continues listing templates after the first 100 rows", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) =>
      templateRow(index + 1)
    );
    const secondPage = [templateRow(101), templateRow(102)];
    tablesMock.listRows
      .mockResolvedValueOnce({ rows: firstPage })
      .mockResolvedValueOnce({ rows: secondPage });

    const templates = await listDocumentTemplates(ownerId);

    expect(templates).toHaveLength(102);
    expect(templates[0]?.id).toBe("template-1");
    expect(templates[101]?.id).toBe("template-102");
    expect(tablesMock.listRows).toHaveBeenCalledTimes(2);
    const secondPageQueries = tablesMock.listRows.mock.calls[1]?.[0].queries;
    expect(secondPageQueries).toContain(Query.cursorAfter("template-100"));
  });

  it("stops after a short page", async () => {
    tablesMock.listRows.mockResolvedValueOnce({
      rows: [templateRow(1), templateRow(2)],
    });

    const templates = await listDocumentTemplates(ownerId);

    expect(templates).toHaveLength(2);
    expect(tablesMock.listRows).toHaveBeenCalledTimes(1);
  });
});
