import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
  type PlatformDocumentSettings,
} from "@shared/features/platform-settings/platformDocumentSettings";
import { normalizePlatformDocumentSettings } from "./normalizePlatformDocumentSettings";
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

  it("accepts the smallest logo and a catalogued professional frame", async () => {
    await expect(
      loadDocumentSettingsForExport(async () => ({
        ...ownerSettings,
        headerLogoSize: 60,
        frameStyle: "f01g",
      }))
    ).resolves.toMatchObject({ headerLogoSize: 60, frameStyle: "f01g" });
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
    { watermarkScalePercent: 181 },
    { watermarkOpacityPercent: 1.5 },
    { headerDividerColor: "red; background:url(javascript:alert(1))" },
    { watermarkText: "   " },
    { frameStyle: "unlisted-style" as never },
    { headerLogoSize: 59 },
    { headerLogoSize: 241 },
    { documentDateFormat: "yyyy/MM/dd HH:mm" as never },
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
  it("uses defaults for malformed fields and preserves valid false and zero", () => {
    const normalized = normalizePlatformDocumentSettings({
      ...DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
      showMinistryWatermarkText: false,
      watermarkOpacityPercent: 0,
      watermarkScalePercent: Number.NaN,
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
    expect(normalized.watermarkScalePercent).toBe(
      DEFAULT_PLATFORM_DOCUMENT_SETTINGS.watermarkScalePercent
    );
    expect(normalized.watermarkText).toBe(
      DEFAULT_PLATFORM_DOCUMENT_SETTINGS.watermarkText
    );
    expect(normalized.pageHeaderRows).toEqual([]);
    expect(normalized.pageFooterRows).toEqual([{ right: "", left: "" }]);
    expect(normalized.headerLogoSize).toBe(
      DEFAULT_PLATFORM_DOCUMENT_SETTINGS.headerLogoSize
    );
  });

  it("falls back to safe defaults for invalid HEX colors", () => {
    const normalized = normalizePlatformDocumentSettings({
      headerDividerColor: "red; background:url(javascript:alert(1))",
      frameColor: "#12345",
    });

    expect(normalized.headerDividerColor).toBe(
      DEFAULT_PLATFORM_DOCUMENT_SETTINGS.headerDividerColor
    );
    expect(normalized.frameColor).toBe(
      DEFAULT_PLATFORM_DOCUMENT_SETTINGS.frameColor
    );
  });

  it("migrates the previous two-line defaults into the four editable values", () => {
    const normalized = normalizePlatformDocumentSettings({
      ...DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
      headerTitle: "المقدم غسان صالح كنو",
      headerSubtitle: "رئيس قسم الشهباء",
      headerChiefRank: "",
      headerChiefName: "",
    });

    expect(normalized.headerTitle).toBe("المقدم");
    expect(normalized.headerSubtitle).toBe("غسان صالح كنو");
    expect(normalized.headerChiefRank).toBe("رئيس قسم شرطة");
    expect(normalized.headerChiefName).toBe("الشهباء");
  });

  it("migrates reversed signer and role fields into the reference order", () => {
    const normalized = normalizePlatformDocumentSettings({
      ...DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
      headerTitle: "رئيس قسم شرطة",
      headerSubtitle: "الشهباء",
      headerChiefRank: "المقدم",
      headerChiefName: "غسان صالح كنو",
    });

    expect(normalized.headerTitle).toBe("المقدم");
    expect(normalized.headerSubtitle).toBe("غسان صالح كنو");
    expect(normalized.headerChiefRank).toBe("رئيس قسم شرطة");
    expect(normalized.headerChiefName).toBe("الشهباء");
  });

  it("keeps the logo in the enlarged supported range", () => {
    const normalized = normalizePlatformDocumentSettings({
      ...DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
      headerLogoSize: 176,
    });

    expect(normalized.headerLogoSize).toBe(176);
  });

  it("migrates older saved records when the added signatory fields are absent", () => {
    const normalized = normalizePlatformDocumentSettings({
      headerTitle: "المقدم غسان صالح كنو",
      headerSubtitle: "رئيس قسم الشهباء",
    });

    expect(normalized.headerTitle).toBe("المقدم");
    expect(normalized.headerSubtitle).toBe("غسان صالح كنو");
    expect(normalized.headerChiefRank).toBe("رئيس قسم شرطة");
    expect(normalized.headerChiefName).toBe("الشهباء");
  });

  it("migrates old signer lines when the server supplied default added fields", () => {
    const normalized = normalizePlatformDocumentSettings({
      ...DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
      headerTitle: "المقدم غسان صالح كنو",
      headerSubtitle: "رئيس قسم الشهباء",
    });

    expect(normalized.headerTitle).toBe("المقدم");
    expect(normalized.headerSubtitle).toBe("غسان صالح كنو");
    expect(normalized.headerChiefRank).toBe("رئيس قسم شرطة");
    expect(normalized.headerChiefName).toBe("الشهباء");
  });

  it("clamps logo sizes to the supported adjustable range", () => {
    expect(
      normalizePlatformDocumentSettings({ headerLogoSize: 32 }).headerLogoSize
    ).toBe(60);
    expect(
      normalizePlatformDocumentSettings({ headerLogoSize: 119 }).headerLogoSize
    ).toBe(119);
    expect(
      normalizePlatformDocumentSettings({ headerLogoSize: 60 }).headerLogoSize
    ).toBe(60);
    expect(
      normalizePlatformDocumentSettings({ headerLogoSize: 220 }).headerLogoSize
    ).toBe(220);
    expect(
      normalizePlatformDocumentSettings({ headerLogoSize: 999 }).headerLogoSize
    ).toBe(240);
  });

  it("normalizes document and recipient typography with safe bounds and allowlists", () => {
    const normalized = normalizePlatformDocumentSettings({
      documentFontFamily: "not-a-font" as never,
      documentFontSizePt: 40,
      documentFontWeight: 950 as never,
      documentFontColor: "red" as never,
      recipientFontFamily: "Arial",
      recipientFontSizePt: 8,
      recipientFontWeight: 700,
      recipientFontColor: "#123456",
    });

    expect(normalized.documentFontFamily).toBe("Amiri");
    expect(normalized.documentFontSizePt).toBe(24);
    expect(normalized.documentFontWeight).toBe(400);
    expect(normalized.documentFontColor).toBe("#0f172a");
    expect(normalized.recipientFontFamily).toBe("Arial");
    expect(normalized.recipientFontSizePt).toBe(9);
    expect(normalized.recipientFontWeight).toBe(700);
    expect(normalized.recipientFontColor).toBe("#123456");
  });

  it("uses the default date format when a saved value is unsupported", () => {
    expect(
      normalizePlatformDocumentSettings({
        documentDateFormat: "yyyy/MM/dd HH:mm" as never,
      }).documentDateFormat
    ).toBe(DEFAULT_PLATFORM_DOCUMENT_SETTINGS.documentDateFormat);
  });

  it("preserves a supported combined Gregorian and Hijri date format", () => {
    expect(
      normalizePlatformDocumentSettings({
        documentDateFormat: "both:yyyy/MM/dd",
      }).documentDateFormat
    ).toBe("both:yyyy/MM/dd");
  });

  it("preserves the additional professional frame styles", () => {
    expect(
      normalizePlatformDocumentSettings({ frameStyle: "classic" }).frameStyle
    ).toBe("classic");
    expect(
      normalizePlatformDocumentSettings({ frameStyle: "triple" }).frameStyle
    ).toBe("triple");
    expect(
      normalizePlatformDocumentSettings({ frameStyle: "f10s" }).frameStyle
    ).toBe("f10s");
  });

  it("returns complete defaults for missing settings", () => {
    expect(normalizePlatformDocumentSettings(null)).toMatchObject(
      DEFAULT_PLATFORM_DOCUMENT_SETTINGS
    );
    expect(normalizePlatformDocumentSettings(undefined)).toMatchObject(
      DEFAULT_PLATFORM_DOCUMENT_SETTINGS
    );
  });

  it("limits text rows and sanitizes row values", () => {
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
