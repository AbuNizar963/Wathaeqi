import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tables: {
    listRows: vi.fn(),
    createTransaction: vi.fn(),
    updateRow: vi.fn(),
    updateTransaction: vi.fn(),
  },
  getAppwriteTablesDB: vi.fn(),
  getAppwriteDatabaseId: vi.fn(),
}));

vi.mock("node-appwrite", () => ({
  Query: {
    equal: (attribute: string, value: string) =>
      JSON.stringify({ method: "equal", attribute, values: [value] }),
    limit: (value: number) =>
      JSON.stringify({ method: "limit", values: [value] }),
  },
}));

vi.mock("../../_core/appwrite", () => ({
  getAppwriteTablesDB: mocks.getAppwriteTablesDB,
  getAppwriteDatabaseId: mocks.getAppwriteDatabaseId,
}));

import {
  allocateDocumentOrganizationSerialNumber,
  getDocumentOrganizationSettings,
} from "./documentOrganizationRepository";

const settingsRow = {
  $id: "settings-1",
  data: {
    organizationId: "org-1",
    departmentName: "إدارة الوثائق",
    unitName: "الوحدة المركزية",
    unitChiefRank: "العقيد",
    unitChiefName: "رئيس الوحدة",
    logoUrl: "https://example.test/logo.png",
    serialPrefix: "DOC",
    numberSystem: "latin",
    dateFormat: "dd/MM/yyyy",
    timezone: "UTC",
    nextOutgoingSerial: 21,
  },
};

describe("Appwrite document organization repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAppwriteTablesDB.mockReturnValue(mocks.tables);
    mocks.getAppwriteDatabaseId.mockReturnValue("wathaeqi-db");
    mocks.tables.listRows.mockResolvedValue({ rows: [settingsRow] });
    mocks.tables.createTransaction.mockResolvedValue({ $id: "tx-1" });
    mocks.tables.updateRow.mockResolvedValue({});
    mocks.tables.updateTransaction.mockResolvedValue({});
  });

  it("reads letterhead settings from the Appwrite organization row", async () => {
    const result = await getDocumentOrganizationSettings("org-1");

    expect(mocks.tables.listRows).toHaveBeenCalledWith(
      expect.objectContaining({
        databaseId: "wathaeqi-db",
        tableId: "department_settings",
        total: false,
      })
    );
    expect(result).toEqual({
      organizationId: "org-1",
      departmentName: "إدارة الوثائق",
      unitName: "الوحدة المركزية",
      unitChiefRank: "العقيد",
      unitChiefName: "رئيس الوحدة",
      logoUrl: "https://example.test/logo.png",
      serialPrefix: "DOC",
      numberSystem: "latin",
      dateFormat: "dd/MM/yyyy",
      timezone: "UTC",
    });
  });

  it("does not invent organization settings when no Appwrite row exists", async () => {
    mocks.tables.listRows.mockResolvedValueOnce({ rows: [] });

    await expect(getDocumentOrganizationSettings("org-1")).resolves.toBeNull();
  });

  it("allocates an outgoing serial atomically through an Appwrite transaction", async () => {
    const serial = await allocateDocumentOrganizationSerialNumber("org-1");

    expect(serial).toBe(21);
    expect(mocks.tables.createTransaction).toHaveBeenCalledWith({ ttl: 60 });
    expect(mocks.tables.updateRow).toHaveBeenCalledWith(
      expect.objectContaining({
        databaseId: "wathaeqi-db",
        tableId: "department_settings",
        rowId: "settings-1",
        transactionId: "tx-1",
        data: expect.objectContaining({ nextOutgoingSerial: 22 }),
      })
    );
    expect(mocks.tables.updateTransaction).toHaveBeenCalledWith({
      transactionId: "tx-1",
      commit: true,
    });
  });

  it("rolls back the serial transaction when settings are missing", async () => {
    mocks.tables.listRows.mockResolvedValueOnce({ rows: [] });

    await expect(
      allocateDocumentOrganizationSerialNumber("org-1")
    ).rejects.toThrow("Document numbering is not configured");

    expect(mocks.tables.updateRow).not.toHaveBeenCalled();
    expect(mocks.tables.updateTransaction).toHaveBeenCalledWith({
      transactionId: "tx-1",
      rollback: true,
    });
  });
});
