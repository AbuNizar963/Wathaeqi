import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PLATFORM_DOCUMENT_SETTINGS } from "../../../shared/features/platform-settings/platformDocumentSettings";

const mocks = vi.hoisted(() => ({
  listRows: vi.fn(),
  getAppwriteTablesDB: vi.fn(),
  getAppwriteDatabaseId: vi.fn(() => "database-1"),
}));

vi.mock("node-appwrite", () => ({
  Query: {
    equal: vi.fn((field: string, value: unknown) => ({ field, value })),
    limit: vi.fn((value: number) => ({ value })),
  },
}));

vi.mock("../../_core/appwrite", () => ({
  getAppwriteTablesDB: mocks.getAppwriteTablesDB,
  getAppwriteDatabaseId: mocks.getAppwriteDatabaseId,
}));

import { getPlatformDocumentSettings } from "./platformDocumentSettingsRepository";

describe("platform document settings nullable Appwrite columns", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getAppwriteDatabaseId.mockReturnValue("database-1");
    mocks.getAppwriteTablesDB.mockReturnValue({ listRows: mocks.listRows });
  });


  it("reads persisted typography and defaults missing legacy columns", async () => {
    mocks.listRows.mockResolvedValue({
      rows: [
        {
          $id: "1",
          data: {
            ...DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
            documentFontFamily: "Arial",
            documentFontSizePt: 18,
            documentFontWeight: 700,
            documentFontColor: "#123456",
            recipientFontFamily: "Tahoma",
            recipientFontSizePt: 16,
            recipientFontWeight: 800,
            recipientFontColor: "#654321",
            updatedAt: null,
          },
        },
      ],
    });

    await expect(getPlatformDocumentSettings()).resolves.toMatchObject({
      documentFontFamily: "Arial",
      documentFontSizePt: 18,
      documentFontWeight: 700,
      documentFontColor: "#123456",
      recipientFontFamily: "Tahoma",
      recipientFontSizePt: 16,
      recipientFontWeight: 800,
      recipientFontColor: "#654321",
    });

    mocks.listRows.mockResolvedValue({
      rows: [
        {
          $id: "1",
          data: {
            id: 1,
            updatedAt: null,
          },
        },
      ],
    });

    await expect(getPlatformDocumentSettings()).resolves.toMatchObject({
      documentFontFamily: "Cairo",
      documentFontSizePt: 12,
      documentFontWeight: 400,
      documentFontColor: "#1f2937",
      recipientFontFamily: "Cairo",
      recipientFontSizePt: 14,
      recipientFontWeight: 600,
      recipientFontColor: "#111827",
    });
  });

  it.each([
    ["pageMarginTopMm", DEFAULT_PLATFORM_DOCUMENT_SETTINGS.pageMarginTopMm],
    [
      "watermarkScalePercent",
      DEFAULT_PLATFORM_DOCUMENT_SETTINGS.watermarkScalePercent,
    ],
    ["pageMarginRightMm", DEFAULT_PLATFORM_DOCUMENT_SETTINGS.pageMarginRightMm],
    [
      "pageMarginBottomMm",
      DEFAULT_PLATFORM_DOCUMENT_SETTINGS.pageMarginBottomMm,
    ],
    ["pageMarginLeftMm", DEFAULT_PLATFORM_DOCUMENT_SETTINGS.pageMarginLeftMm],
    [
      "headerBottomPaddingMm",
      DEFAULT_PLATFORM_DOCUMENT_SETTINGS.headerBottomPaddingMm,
    ],
    [
      "documentDateFormat",
      DEFAULT_PLATFORM_DOCUMENT_SETTINGS.documentDateFormat,
    ],
  ])("uses the configured default when %s is null", async (field, fallback) => {
    mocks.listRows.mockResolvedValue({
      rows: [
        {
          $id: "1",
          data: {
            ...DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
            [field]: null,
            updatedAt: null,
          },
        },
      ],
    });

    const settings = await getPlatformDocumentSettings();

    expect(settings[field as keyof typeof settings]).toBe(fallback);
  });

  it("reads a catalogued frame preset and a 60px logo without clamping them", async () => {
    mocks.listRows.mockResolvedValue({
      rows: [
        {
          $id: "1",
          data: {
            ...DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
            frameStyle: "f10s",
            headerLogoSize: 60,
            updatedAt: null,
          },
        },
      ],
    });

    await expect(getPlatformDocumentSettings()).resolves.toMatchObject({
      frameStyle: "f10s",
      headerLogoSize: 60,
    });
  });
});
