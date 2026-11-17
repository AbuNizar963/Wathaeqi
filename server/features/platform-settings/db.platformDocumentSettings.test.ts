import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PLATFORM_DOCUMENT_SETTINGS } from "../../../shared/features/platform-settings/platformDocumentSettings";

const mocks = vi.hoisted(() => ({
  listRows: vi.fn(),
  createRow: vi.fn(),
  updateRow: vi.fn(),
}));

vi.mock("../../_core/appwrite", () => ({
  getAppwriteDatabaseId: () => "wathaeqi-db",
  getAppwriteTablesDB: () => mocks,
}));

import {
  getPlatformDocumentSettings,
  updatePlatformDocumentSettings,
} from "./platformDocumentSettingsRepository";

const ownerSettings = {
  id: 1,
  showMinistryWatermarkText: false,
  watermarkOpacityPercent: 0,
  headerDividerColor: "#ABCDEF",
  showVerificationQr: false,
  updatedByUserId: 1,
  updatedAt: "2026-10-23T00:00:00.000Z",
};

const existingRow = { $id: "platform-settings", ...ownerSettings };

describe("platform document settings Appwrite persistence", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.listRows.mockResolvedValue({ rows: [existingRow] });
    mocks.createRow.mockImplementation(async ({ rowId, data }) => ({
      $id: rowId,
      ...data,
    }));
    mocks.updateRow.mockImplementation(async ({ rowId, data }) => ({
      $id: rowId,
      ...data,
    }));
  });

  it("reads the singleton without modifying owner settings", async () => {
    await expect(getPlatformDocumentSettings()).resolves.toEqual({
      showMinistryWatermarkText: false,
      watermarkOpacityPercent: 0,
      headerDividerColor: "#ABCDEF",
      showVerificationQr: false,
      updatedAt: ownerSettings.updatedAt,
    });
    expect(mocks.listRows).toHaveBeenCalledOnce();
    expect(mocks.createRow).not.toHaveBeenCalled();
    expect(mocks.updateRow).not.toHaveBeenCalled();
  });

  it(
    "returns defaults without writing when the singleton is absent",
    async () => {
      mocks.listRows.mockResolvedValue({ rows: [] });
      await expect(getPlatformDocumentSettings()).resolves.toEqual({
        ...DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
        updatedAt: null,
      });
      expect(mocks.createRow).not.toHaveBeenCalled();
      expect(mocks.updateRow).not.toHaveBeenCalled();
    }
  );

  it("updates the existing Appwrite singleton", async () => {
    const values = {
      showMinistryWatermarkText: false,
      watermarkOpacityPercent: 0,
      headerDividerColor: "#ABCDEF",
      showVerificationQr: false,
    };
    await expect(
      updatePlatformDocumentSettings(values, 7)
    ).resolves.toMatchObject({
      ...values,
      updatedAt: expect.any(String),
    });
    expect(mocks.updateRow).toHaveBeenCalledWith(
      expect.objectContaining({
        databaseId: "wathaeqi-db",
        tableId: "platform_document_settings",
        rowId: "platform-settings",
        data: expect.objectContaining({ id: 1, ...values, updatedByUserId: 7 }),
      })
    );
    expect(mocks.createRow).not.toHaveBeenCalled();
  });

  it("creates the singleton on the first owner save", async () => {
    mocks.listRows.mockResolvedValue({ rows: [] });
    await updatePlatformDocumentSettings(
      DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
      1
    );
    expect(mocks.createRow).toHaveBeenCalledWith(
      expect.objectContaining({
        databaseId: "wathaeqi-db",
        tableId: "platform_document_settings",
        rowId: "1",
        data: expect.objectContaining({
          id: 1,
          updatedByUserId: 1,
        }),
      })
    );
    expect(mocks.updateRow).not.toHaveBeenCalled();
  });

  it(
    "surfaces Appwrite read errors rather than pretending defaults were loaded",
    async () => {
      mocks.listRows.mockRejectedValue(new Error("permission denied"));
      await expect(getPlatformDocumentSettings()).rejects.toThrow(
        "permission denied"
      );
    }
  );

  it(
    "retries a concurrent first save against the row that won the unique index",
    async () => {
      mocks.listRows
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [existingRow] });
      mocks.createRow.mockRejectedValueOnce({ code: 409, message: "Conflict" });

      await updatePlatformDocumentSettings(
        DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
        3
      );

      expect(mocks.createRow).toHaveBeenCalledOnce();
      expect(mocks.updateRow).toHaveBeenCalledWith(
        expect.objectContaining({
          rowId: "platform-settings",
          data: expect.objectContaining({ id: 1, updatedByUserId: 3 }),
        })
      );
    }
  );
});
