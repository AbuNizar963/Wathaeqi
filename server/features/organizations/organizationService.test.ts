import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listRows: vi.fn(),
  updateRow: vi.fn(),
}));

vi.mock("../../_core/appwrite", () => ({
  getAppwriteDatabaseId: () => "test-db",
  getAppwriteTablesDB: () => mocks,
}));

import { renameOrganization } from "./organizationService";

type TestRow = Record<string, unknown> & { $id: string; id: string };

const timestamp = "2026-01-01T00:00:00.000Z";
const row: TestRow = {
  $id: "organization-row",
  id: "org-current",
  name: "الاسم السابق",
  code: "ORG",
  type: "department",
  parentOrganizationId: null,
  telegramDestinationOrganizationId: null,
  logoKey: "organizations/org-current/logo.png",
  isActive: true,
  deletedAt: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.listRows.mockResolvedValue({ rows: [{ ...row }] });
  mocks.updateRow.mockImplementation(async request => ({
    ...row,
    ...request.data,
  }));
});

describe("renameOrganization", () => {
  it("updates only the current name and preserves the logo and other organization data", async () => {
    const renamed = await renameOrganization("org-current", "  الاسم الجديد  ");

    expect(mocks.listRows).toHaveBeenCalledOnce();
    expect(mocks.listRows.mock.calls[0][0]).toMatchObject({
      databaseId: "test-db",
      tableId: "organizations",
      total: false,
    });
    expect(mocks.updateRow).toHaveBeenCalledOnce();
    const request = mocks.updateRow.mock.calls[0][0];
    expect(request).toMatchObject({
      databaseId: "test-db",
      tableId: "organizations",
      rowId: "organization-row",
      data: { name: "الاسم الجديد" },
    });
    expect(Object.keys(request.data).sort()).toEqual(["name", "updatedAt"]);
    expect(renamed).toMatchObject({
      id: "org-current",
      name: "الاسم الجديد",
      logoKey: "organizations/org-current/logo.png",
      code: "ORG",
    });
  });

  it("does not update when the requested organization does not exist", async () => {
    mocks.listRows.mockResolvedValue({ rows: [] });

    await expect(renameOrganization("missing-org", "اسم جديد")).rejects.toThrow(
      "الجهة غير موجودة"
    );
    expect(mocks.updateRow).not.toHaveBeenCalled();
  });
});
