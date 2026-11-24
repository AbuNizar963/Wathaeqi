import {
  DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
  type DocumentTextRow,
  type PlatformDocumentSettings,
} from "@shared/features/platform-settings/platformDocumentSettings";

type SettingsInput = Partial<PlatformDocumentSettings> | null | undefined;

function textValue(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeRows(value: unknown, fallback: readonly DocumentTextRow[]): DocumentTextRow[] {
  if (!Array.isArray(value)) return fallback.map(row => ({ ...row }));
  return value.slice(0, 12).map((item): DocumentTextRow => {
    const row = item && typeof item === "object"
      ? (item as Record<string, unknown>)
      : {};
    return {
      right: textValue(row.right, "", 255),
      left: textValue(row.left, "", 255),
    };
  });
}

/**
 * Treat API data as untrusted at the UI boundary. A malformed legacy row must
 * never crash the settings screen or prevent the owner from correcting it.
 */
export function normalizePlatformDocumentSettings(
  input: SettingsInput
): PlatformDocumentSettings {
  const source =
    input && typeof input === "object"
      ? (input as Partial<PlatformDocumentSettings>)
      : {};
  const defaults = DEFAULT_PLATFORM_DOCUMENT_SETTINGS;

  const headerDividerStyle =
    source.headerDividerStyle === "solid" ||
    source.headerDividerStyle === "double" ||
    source.headerDividerStyle === "dashed" ||
    source.headerDividerStyle === "dotted" ||
    source.headerDividerStyle === "tricolor-stars"
      ? source.headerDividerStyle
      : defaults.headerDividerStyle;
  const headerAlignment =
    source.headerAlignment === "spread" ||
    source.headerAlignment === "center" ||
    source.headerAlignment === "right"
      ? source.headerAlignment
      : defaults.headerAlignment;
  const frameStyle =
    source.frameStyle === "none" ||
    source.frameStyle === "single" ||
    source.frameStyle === "double" ||
    source.frameStyle === "ornate"
      ? source.frameStyle
      : defaults.frameStyle;

  return {
    showMinistryWatermarkText: booleanValue(
      source.showMinistryWatermarkText,
      defaults.showMinistryWatermarkText
    ),
    watermarkText: textValue(source.watermarkText, defaults.watermarkText, 255),
    watermarkOpacityPercent: numberValue(
      source.watermarkOpacityPercent,
      defaults.watermarkOpacityPercent
    ),
    headerDividerColor: textValue(
      source.headerDividerColor,
      defaults.headerDividerColor,
      7
    ),
    headerDividerStyle,
    headerDividerWidthPt: numberValue(
      source.headerDividerWidthPt,
      defaults.headerDividerWidthPt
    ),
    headerTitle: textValue(source.headerTitle, defaults.headerTitle, 255),
    headerSubtitle: textValue(source.headerSubtitle, defaults.headerSubtitle, 255),
    headerChiefRank: textValue(source.headerChiefRank, defaults.headerChiefRank, 120),
    headerChiefName: textValue(source.headerChiefName, defaults.headerChiefName, 255),
    headerShowLogo: booleanValue(source.headerShowLogo, defaults.headerShowLogo),
    headerLogoSize: numberValue(source.headerLogoSize, defaults.headerLogoSize),
    headerTopPaddingMm: numberValue(
      source.headerTopPaddingMm,
      defaults.headerTopPaddingMm
    ),
    headerHorizontalPaddingMm: numberValue(
      source.headerHorizontalPaddingMm,
      defaults.headerHorizontalPaddingMm
    ),
    headerBottomPaddingMm: numberValue(
      source.headerBottomPaddingMm,
      defaults.headerBottomPaddingMm
    ),
    headerAlignment,
    pageHeaderRows: normalizeRows(source.pageHeaderRows, defaults.pageHeaderRows),
    pageFooterRows: normalizeRows(source.pageFooterRows, defaults.pageFooterRows),
    pageMarginTopMm: numberValue(source.pageMarginTopMm, defaults.pageMarginTopMm),
    pageMarginRightMm: numberValue(source.pageMarginRightMm, defaults.pageMarginRightMm),
    pageMarginBottomMm: numberValue(source.pageMarginBottomMm, defaults.pageMarginBottomMm),
    pageMarginLeftMm: numberValue(source.pageMarginLeftMm, defaults.pageMarginLeftMm),
    frameStyle,
    frameColor: textValue(source.frameColor, defaults.frameColor, 7),
    frameWidthPt: numberValue(source.frameWidthPt, defaults.frameWidthPt),
    showVerificationQr: booleanValue(
      source.showVerificationQr,
      defaults.showVerificationQr
    ),
    updatedAt:
      typeof source.updatedAt === "string" || source.updatedAt instanceof Date
        ? source.updatedAt
        : null,
  };
}
