import {
  DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
  type DocumentTextRow,
  type PlatformDocumentSettings,
} from "@shared/features/platform-settings/platformDocumentSettings";

type SettingsInput = Partial<PlatformDocumentSettings> | null | undefined;

function safeText(value: unknown, fallback: string, limit: number): string {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, limit);
}

function safeNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function safeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function safeRows(
  value: unknown,
  fallback: readonly DocumentTextRow[]
): DocumentTextRow[] {
  if (!Array.isArray(value)) return fallback.map(row => ({ ...row }));

  return value.slice(0, 12).map(item => {
    const row =
      item !== null && typeof item === "object"
        ? (item as Record<string, unknown>)
        : {};
    return {
      right: safeText(row.right, "", 255),
      left: safeText(row.left, "", 255),
    };
  });
}

export function normalizePlatformDocumentSettings(
  input: SettingsInput
): PlatformDocumentSettings {
  const source = input !== null && typeof input === "object" ? input : {};
  const defaults = DEFAULT_PLATFORM_DOCUMENT_SETTINGS;

  return {
    ...defaults,
    showMinistryWatermarkText: safeBoolean(
      source.showMinistryWatermarkText,
      defaults.showMinistryWatermarkText
    ),
    watermarkText: safeText(source.watermarkText, defaults.watermarkText, 255),
    watermarkOpacityPercent: safeNumber(
      source.watermarkOpacityPercent,
      defaults.watermarkOpacityPercent
    ),
    headerDividerColor: safeText(
      source.headerDividerColor,
      defaults.headerDividerColor,
      7
    ),
    headerDividerStyle: [
      "solid",
      "double",
      "dashed",
      "dotted",
      "tricolor-stars",
    ].includes(source.headerDividerStyle ?? "")
      ? source.headerDividerStyle!
      : defaults.headerDividerStyle,
    headerDividerWidthPt: safeNumber(
      source.headerDividerWidthPt,
      defaults.headerDividerWidthPt
    ),
    headerTitle: safeText(source.headerTitle, defaults.headerTitle, 255),
    headerSubtitle: safeText(
      source.headerSubtitle,
      defaults.headerSubtitle,
      255
    ),
    headerChiefRank: safeText(
      source.headerChiefRank,
      defaults.headerChiefRank,
      120
    ),
    headerChiefName: safeText(
      source.headerChiefName,
      defaults.headerChiefName,
      255
    ),
    headerShowLogo: safeBoolean(source.headerShowLogo, defaults.headerShowLogo),
    headerLogoSize: safeNumber(source.headerLogoSize, defaults.headerLogoSize),
    headerTopPaddingMm: safeNumber(
      source.headerTopPaddingMm,
      defaults.headerTopPaddingMm
    ),
    headerHorizontalPaddingMm: safeNumber(
      source.headerHorizontalPaddingMm,
      defaults.headerHorizontalPaddingMm
    ),
    headerBottomPaddingMm: safeNumber(
      source.headerBottomPaddingMm,
      defaults.headerBottomPaddingMm
    ),
    headerAlignment: ["spread", "center", "right"].includes(
      source.headerAlignment ?? ""
    )
      ? source.headerAlignment!
      : defaults.headerAlignment,
    pageHeaderRows: safeRows(source.pageHeaderRows, defaults.pageHeaderRows),
    pageFooterRows: safeRows(source.pageFooterRows, defaults.pageFooterRows),
    pageMarginTopMm: safeNumber(
      source.pageMarginTopMm,
      defaults.pageMarginTopMm
    ),
    pageMarginRightMm: safeNumber(
      source.pageMarginRightMm,
      defaults.pageMarginRightMm
    ),
    pageMarginBottomMm: safeNumber(
      source.pageMarginBottomMm,
      defaults.pageMarginBottomMm
    ),
    pageMarginLeftMm: safeNumber(
      source.pageMarginLeftMm,
      defaults.pageMarginLeftMm
    ),
    frameStyle: ["none", "single", "double", "ornate"].includes(
      source.frameStyle ?? ""
    )
      ? source.frameStyle!
      : defaults.frameStyle,
    frameColor: safeText(source.frameColor, defaults.frameColor, 7),
    frameWidthPt: safeNumber(source.frameWidthPt, defaults.frameWidthPt),
    showVerificationQr: safeBoolean(
      source.showVerificationQr,
      defaults.showVerificationQr
    ),
    updatedAt:
      typeof source.updatedAt === "string" || source.updatedAt instanceof Date
        ? source.updatedAt
        : null,
  };
}
