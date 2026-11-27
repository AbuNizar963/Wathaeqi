import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PLATFORM_DOCUMENT_SETTINGS } from "../../../shared/features/platform-settings/platformDocumentSettings";

const mocks = vi.hoisted(() => ({
  listRows: vi.fn(),
  updateRow: vi.fn(),
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
    mocks.getAppwriteTablesDB.mockReturnValue({
      listRows: mocks.listRows,
      updateRow: mocks.updateRow,
    });
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
      documentFontFamily: "Amiri",
      documentFontSizePt: 12,
      documentFontWeight: 400,
      documentFontColor: "#0f172a",
      recipientFontFamily: "Amiri",
      recipientFontSizePt: 12,
      recipientFontWeight: 600,
      recipientFontColor: "#0f172a",
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

  it("reads a combined Gregorian and Hijri date format from Appwrite", async () => {
    mocks.listRows.mockResolvedValue({
      rows: [
        {
          $id: "1",
          data: {
            ...DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
            documentDateFormat: "both:yyyy/MM/dd",
            updatedAt: null,
          },
        },
      ],
    });

    await expect(getPlatformDocumentSettings()).resolves.toMatchObject({
      documentDateFormat: "both:yyyy/MM/dd",
    });
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

  it("does not retry or discard settings when Appwrite rejects a schema attribute", async () => {
    mocks.listRows.mockResolvedValue({
      rows: [{ $id: "1", data: { ...DEFAULT_PLATFORM_DOCUMENT_SETTINGS } }],
    });
    const schemaError = new Error(
      'Invalid document structure: Unknown attribute: "documentDateFormat"'
    );
    mocks.updateRow.mockRejectedValueOnce(schemaError);

    const { updatePlatformDocumentSettings } =
      await import("./platformDocumentSettingsRepository");

    await expect(
      updatePlatformDocumentSettings(DEFAULT_PLATFORM_DOCUMENT_SETTINGS, 7)
    ).rejects.toThrow(
      'Invalid document structure: Unknown attribute: "documentDateFormat"'
    );

    expect(mocks.updateRow).toHaveBeenCalledTimes(1);
    expect(mocks.updateRow.mock.calls[0][0].data).toHaveProperty(
      "documentDateFormat",
      DEFAULT_PLATFORM_DOCUMENT_SETTINGS.documentDateFormat
    );
    expect(mocks.updateRow.mock.calls[0][0].data).toHaveProperty(
      "watermarkText",
      DEFAULT_PLATFORM_DOCUMENT_SETTINGS.watermarkText
    );
  });

  it("filters a locally newer attribute from an older persisted row", async () => {
    const { updatePlatformDocumentSettings } =
      await import("./platformDocumentSettingsRepository");
    const stored = { ...DEFAULT_PLATFORM_DOCUMENT_SETTINGS } as Record<
      string,
      unknown
    >;
    stored.id = 1;
    stored.updatedAt = new Date().toISOString();
    delete stored.documentDateFormat;
    mocks.listRows.mockResolvedValue({ rows: [{ $id: "1", data: stored }] });
    mocks.updateRow.mockResolvedValue({
      $id: "1",
      data: { ...stored, updatedAt: new Date().toISOString() },
    });

    await updatePlatformDocumentSettings(DEFAULT_PLATFORM_DOCUMENT_SETTINGS, 7);

    const payload = mocks.updateRow.mock.calls[0][0].data;
    expect(payload).not.toHaveProperty("documentDateFormat");
    expect(payload).toHaveProperty("watermarkText");
  });
});
