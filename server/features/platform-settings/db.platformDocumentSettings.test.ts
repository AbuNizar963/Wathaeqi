import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PLATFORM_DOCUMENT_SETTINGS } from "../../../shared/features/platform-settings/platformDocumentSettings";

const mocks = vi.hoisted(() => ({
  listRows: vi.fn(),
  createRow: vi.fn(),
  updateRow: vi.fn(),
  getAppwriteTablesDB: vi.fn(),
  getAppwriteDatabaseId: vi.fn(() => "database-1"),
}));

vi.mock("node-appwrite", () => ({
  Query: {
    equal: vi.fn((field: string, value: unknown) => ({
      method: "equal",
      field,
      value,
    })),
    limit: vi.fn((value: number) => ({ method: "limit", value })),
  },
}));

vi.mock("../../_core/appwrite", () => ({
  getAppwriteTablesDB: mocks.getAppwriteTablesDB,
  getAppwriteDatabaseId: mocks.getAppwriteDatabaseId,
}));

vi.mock("../../_core/supabase", () => ({
  getSupabaseAdmin: vi.fn(),
}));

import {
  getPlatformDocumentSettings,
  updatePlatformDocumentSettings,
} from "../../db";

const ownerSettings = {
  ...DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
  showMinistryWatermarkText: false,
  watermarkOpacityPercent: 0,
  headerDividerColor: "#ABCDEF",
  showVerificationQr: false,
};

const row = (data: Record<string, unknown> = ownerSettings) => ({
  $id: "1",
  data: {
    ...data,
    updatedAt: "2026-10-23T00:00:00.000Z",
  },
});

describe("platform document settings Appwrite persistence", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getAppwriteDatabaseId.mockReturnValue("database-1");
    mocks.getAppwriteTablesDB.mockReturnValue({
      listRows: mocks.listRows,
      createRow: mocks.createRow,
      updateRow: mocks.updateRow,
    });
    mocks.listRows.mockResolvedValue({ rows: [row()] });
    mocks.createRow.mockResolvedValue(row());
    mocks.updateRow.mockResolvedValue(row());
  });

  it("reads the singleton without modifying owner settings", async () => {
    await expect(getPlatformDocumentSettings()).resolves.toMatchObject({
      ...ownerSettings,
      updatedAt: "2026-10-23T00:00:00.000Z",
    });
    expect(mocks.listRows).toHaveBeenCalledWith({
      databaseId: "database-1",
      tableId: "platform_document_settings",
      queries: [
        { method: "equal", field: "id", value: 1 },
        { method: "limit", value: 2 },
      ],
      total: false,
    });
    expect(mocks.createRow).not.toHaveBeenCalled();
    expect(mocks.updateRow).not.toHaveBeenCalled();
  });

  it("returns defaults without a write when the singleton is absent", async () => {
    mocks.listRows.mockResolvedValue({ rows: [] });
    await expect(getPlatformDocumentSettings()).resolves.toEqual({
      ...DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
      updatedAt: null,
    });
    expect(mocks.createRow).not.toHaveBeenCalled();
    expect(mocks.updateRow).not.toHaveBeenCalled();
  });

  it("updates the existing singleton row", async () => {
    await updatePlatformDocumentSettings(ownerSettings, 1);
    expect(mocks.updateRow).toHaveBeenCalledOnce();
    expect(mocks.updateRow).toHaveBeenCalledWith(
      expect.objectContaining({
        databaseId: "database-1",
        tableId: "platform_document_settings",
        rowId: "1",
        data: expect.objectContaining({
          id: 1,
          ...ownerSettings,
          updatedByUserId: 1,
        }),
      })
    );
    expect(mocks.createRow).not.toHaveBeenCalled();
  });

  it("creates the singleton when it does not exist", async () => {
    mocks.listRows.mockResolvedValue({ rows: [] });
    await updatePlatformDocumentSettings(ownerSettings, 1);
    expect(mocks.createRow).toHaveBeenCalledWith(
      expect.objectContaining({
        databaseId: "database-1",
        tableId: "platform_document_settings",
        rowId: "1",
        data: expect.objectContaining({
          id: 1,
          ...ownerSettings,
          updatedByUserId: 1,
        }),
      })
    );
    expect(mocks.updateRow).not.toHaveBeenCalled();
  });

  it("retries the update when concurrent first-time creation wins", async () => {
    mocks.listRows
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [row()] });
    mocks.createRow.mockRejectedValueOnce({ code: 409 });
    await updatePlatformDocumentSettings(ownerSettings, 1);
    expect(mocks.createRow).toHaveBeenCalledOnce();
    expect(mocks.updateRow).toHaveBeenCalledOnce();
  });

  it("surfaces database read errors", async () => {
    mocks.listRows.mockRejectedValue(new Error("relation does not exist"));
    await expect(getPlatformDocumentSettings()).rejects.toThrow(
      "relation does not exist"
    );
    expect(mocks.createRow).not.toHaveBeenCalled();
  });

  it("surfaces failed saves", async () => {
    mocks.listRows.mockResolvedValue({ rows: [] });
    mocks.createRow.mockRejectedValue({
      code: 403,
      message: "permission denied",
    });
    await expect(
      updatePlatformDocumentSettings(ownerSettings, 1)
    ).rejects.toThrow(
      "Failed to save platform document settings: permission denied"
    );
  });
});
