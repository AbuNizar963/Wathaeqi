import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
  type PlatformDocumentSettings,
} from "../../../shared/features/platform-settings/platformDocumentSettings";

const mocks = vi.hoisted(() => ({
  listRows: vi.fn(),
  createRow: vi.fn(),
  updateRow: vi.fn(),
  equal: vi.fn((field: string, value: unknown) => ({
    type: "equal",
    field,
    value,
  })),
  limit: vi.fn((value: number) => ({ type: "limit", value })),
}));

vi.mock("node-appwrite", () => ({
  Query: {
    equal: mocks.equal,
    limit: mocks.limit,
  },
}));

vi.mock("../../_core/appwrite", () => ({
  getAppwriteDatabaseId: () => "wathaeqi-db",
  getAppwriteTablesDB: () => ({
    listRows: mocks.listRows,
    createRow: mocks.createRow,
    updateRow: mocks.updateRow,
  }),
}));

import {
  getPlatformDocumentSettings,
  updatePlatformDocumentSettings,
} from "./platformDocumentSettingsRepository";

const input: Omit<PlatformDocumentSettings, "updatedAt"> = {
  ...DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
  showMinistryWatermarkText: false,
  watermarkOpacityPercent: 0,
  headerDividerColor: "#ABCDEF",
  showVerificationQr: false,
};

const saved: PlatformDocumentSettings = {
  ...input,
  updatedAt: "2026-10-23T00:00:00.000Z",
};

describe("platform document settings Appwrite persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listRows.mockResolvedValue({ rows: [] });
    mocks.createRow.mockResolvedValue({ $id: "1", data: saved });
    mocks.updateRow.mockResolvedValue({ $id: "1", data: saved });
  });

  it("reads defaults without creating a row when the singleton is absent", async () => {
    await expect(getPlatformDocumentSettings()).resolves.toEqual({
      ...DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
      updatedAt: null,
    });
    expect(mocks.listRows).toHaveBeenCalledWith({
      databaseId: "wathaeqi-db",
      tableId: "platform_document_settings",
      queries: [
        { type: "equal", field: "id", value: 1 },
        { type: "limit", value: 2 },
      ],
      total: false,
    });
    expect(mocks.createRow).not.toHaveBeenCalled();
    expect(mocks.updateRow).not.toHaveBeenCalled();
  });

  it("maps the existing singleton and preserves explicit false and zero values", async () => {
    mocks.listRows.mockResolvedValueOnce({
      rows: [{ $id: "1", data: saved }],
    });

    await expect(getPlatformDocumentSettings()).resolves.toEqual(saved);
  });

  it("updates the existing singleton row", async () => {
    mocks.listRows.mockResolvedValueOnce({
      rows: [{ $id: "1", data: saved }],
    });

    await expect(updatePlatformDocumentSettings(input, 42)).resolves.toEqual(
      saved
    );
    expect(mocks.updateRow).toHaveBeenCalledWith(
      expect.objectContaining({
        databaseId: "wathaeqi-db",
        tableId: "platform_document_settings",
        rowId: "1",
        data: expect.objectContaining({
          id: 1,
          ...input,
          updatedByUserId: 42,
        }),
      })
    );
    expect(mocks.createRow).not.toHaveBeenCalled();
  });

  it("creates the singleton when it does not exist", async () => {
    await expect(updatePlatformDocumentSettings(input, 42)).resolves.toEqual(
      saved
    );
    expect(mocks.createRow).toHaveBeenCalledWith(
      expect.objectContaining({
        databaseId: "wathaeqi-db",
        tableId: "platform_document_settings",
        rowId: "1",
        data: expect.objectContaining({
          id: 1,
          ...input,
          updatedByUserId: 42,
        }),
      })
    );
  });

  it("retries a first-save conflict by updating the winning singleton row", async () => {
    mocks.listRows
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ $id: "1", data: saved }] });
    mocks.createRow.mockRejectedValueOnce({ code: 409 });

    await expect(updatePlatformDocumentSettings(input, 42)).resolves.toEqual(
      saved
    );
    expect(mocks.createRow).toHaveBeenCalledOnce();
    expect(mocks.updateRow).toHaveBeenCalledOnce();
  });

  it("rejects duplicate singleton rows instead of selecting an arbitrary row", async () => {
    mocks.listRows.mockResolvedValueOnce({
      rows: [
        { $id: "1", data: saved },
        { $id: "2", data: saved },
      ],
    });

    await expect(getPlatformDocumentSettings()).rejects.toThrow(
      "Platform document settings contains duplicate singleton rows"
    );
  });

  it("surfaces failed first-time saves", async () => {
    mocks.createRow.mockRejectedValueOnce(new Error("permission denied"));

    await expect(updatePlatformDocumentSettings(input, 42)).rejects.toThrow(
      "Failed to save platform document settings: permission denied"
    );
  });
});
