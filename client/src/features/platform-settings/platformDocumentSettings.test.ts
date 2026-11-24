import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
  type PlatformDocumentSettings,
} from "@shared/features/platform-settings/platformDocumentSettings";
import {
  DOCUMENT_SETTINGS_LOAD_ERROR,
  loadDocumentSettingsForExport,
} from "./platformDocumentSettings";

const ownerSettings: PlatformDocumentSettings = {
  ...DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
  showMinistryWatermarkText: false,
  watermarkOpacityPercent: 0,
  headerDividerColor: "#2457a6",
  showVerificationQr: false,
};

describe("document settings for export", () => {
  it("uses the freshly loaded owner settings, preserving false and zero values", async () => {
    const fetchSettings = vi.fn().mockResolvedValue(ownerSettings);
    await expect(loadDocumentSettingsForExport(fetchSettings)).resolves.toEqual(
      ownerSettings
    );
    expect(fetchSettings).toHaveBeenCalledOnce();
  });

  it("defaults the watermark opacity to 12 percent", () => {
    expect(DEFAULT_PLATFORM_DOCUMENT_SETTINGS.watermarkOpacityPercent).toBe(12);
  });
  it("accepts defaults explicitly returned by the server", async () => {
    await expect(
      loadDocumentSettingsForExport(async () => ({
        ...DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
        updatedAt: null,
      }))
    ).resolves.toMatchObject(DEFAULT_PLATFORM_DOCUMENT_SETTINGS);
  });

  it("blocks export when loading fails instead of falling back to QR=true", async () => {
    await expect(
      loadDocumentSettingsForExport(async () => {
        throw new Error("network or unapplied migration");
      })
    ).rejects.toThrow(DOCUMENT_SETTINGS_LOAD_ERROR);
  });

  it.each([
    { showVerificationQr: undefined },
    { showMinistryWatermarkText: "false" },
    { watermarkOpacityPercent: Number.NaN },
    { watermarkOpacityPercent: -1 },
    { watermarkOpacityPercent: 61 },
    { watermarkOpacityPercent: 1.5 },
    { headerDividerColor: "red; background:url(javascript:alert(1))" },
    { watermarkText: "   " },
    { headerLogoSize: 200 },
    { headerTopPaddingMm: -1 },
    { headerAlignment: "invalid" },
  ])("blocks export with invalid effective settings: %o", async invalid => {
    await expect(
      loadDocumentSettingsForExport(
        async () =>
          ({
            ...ownerSettings,
            ...invalid,
          }) as PlatformDocumentSettings
      )
    ).rejects.toThrow(DOCUMENT_SETTINGS_LOAD_ERROR);
  });
});

describe("platform document settings UI normalization", () => {
  it("uses defaults for malformed API fields without losing valid false and zero values", async () => {
    const { normalizePlatformDocumentSettings } = await import(
      "./normalizePlatformDocumentSettings"
    );
    const normalized = normalizePlatformDocumentSettings({
      ...DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
      showMinistryWatermarkText: false,
      watermarkOpacityPercent: 0,
      watermarkText: null as unknown as string,
      pageHeaderRows:
        null as unknown as PlatformDocumentSettings["pageHeaderRows"],
      pageFooterRows: [
        { right: 12, left: null },
      ] as unknown as PlatformDocumentSettings["pageFooterRows"],
      headerLogoSize: Number.NaN,
    });

    expect(normalized.showMinistryWatermarkText).toBe(false);
    expect(normalized.watermarkOpacityPercent).toBe(0);
    expect(normalized.watermarkText).toBe(
      DEFAULT_PLATFORM_DOCUMENT_SETTINGS.watermarkText
    );
    expect(normalized.pageHeaderRows).toEqual([]);
    expect(normalized.pageFooterRows).toEqual([{ right: "", left: "" }]);
    expect(normalized.headerLogoSize).toBe(
      DEFAULT_PLATFORM_DOCUMENT_SETTINGS.headerLogoSize
    );
  });

  it("accepts a missing or non-object settings response and returns complete defaults", async () => {
    const { normalizePlatformDocumentSettings } = await import(
      "./normalizePlatformDocumentSettings"
    );

    expect(normalizePlatformDocumentSettings(null)).toMatchObject(
      DEFAULT_PLATFORM_DOCUMENT_SETTINGS
    );
    expect(normalizePlatformDocumentSettings(undefined)).toMatchObject(
      DEFAULT_PLATFORM_DOCUMENT_SETTINGS
    );
    expect(
      normalizePlatformDocumentSettings(
        "invalid" as unknown as PlatformDocumentSettings
      )
    ).toMatchObject(DEFAULT_PLATFORM_DOCUMENT_SETTINGS);
  });

  it("limits text rows and sanitizes row values", async () => {
    const { normalizePlatformDocumentSettings } = await import(
      "./normalizePlatformDocumentSettings"
    );
    const normalized = normalizePlatformDocumentSettings({
      ...DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
      pageHeaderRows: Array.from({ length: 15 }, (_, index) => ({
        right: index === 0 ? (42 as unknown as string) : `يمين ${index}`,
        left: `left ${index}`,
      })),
    });

    expect(normalized.pageHeaderRows).toHaveLength(12);
    expect(normalized.pageHeaderRows[0]).toEqual({
      right: "",
      left: "left 0",
    });
  });
});
