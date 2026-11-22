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

  it.each([
    ["pageMarginTopMm", DEFAULT_PLATFORM_DOCUMENT_SETTINGS.pageMarginTopMm],
    ["pageMarginRightMm", DEFAULT_PLATFORM_DOCUMENT_SETTINGS.pageMarginRightMm],
    ["pageMarginBottomMm", DEFAULT_PLATFORM_DOCUMENT_SETTINGS.pageMarginBottomMm],
    ["pageMarginLeftMm", DEFAULT_PLATFORM_DOCUMENT_SETTINGS.pageMarginLeftMm],
    ["headerBottomPaddingMm", DEFAULT_PLATFORM_DOCUMENT_SETTINGS.headerBottomPaddingMm],
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
});
