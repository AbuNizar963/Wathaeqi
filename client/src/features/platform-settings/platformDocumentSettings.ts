import {
  HEX_COLOR_PATTERN,
  MAX_WATERMARK_OPACITY_PERCENT,
  MIN_WATERMARK_SCALE_PERCENT,
  MAX_WATERMARK_SCALE_PERCENT,
  MAX_HEADER_LOGO_SIZE,
  MIN_HEADER_LOGO_SIZE,
  MAX_HEADER_PADDING_MM,
  MAX_PAGE_MARGIN_MM,
  MIN_DIVIDER_WIDTH_PT,
  MAX_DIVIDER_WIDTH_PT,
  MIN_FRAME_WIDTH_PT,
  MAX_FRAME_WIDTH_PT,
  type PlatformDocumentSettings,
} from "@shared/features/platform-settings/platformDocumentSettings";
import { isDocumentDateFormat } from "@/features/document-studio/formatDocumentDate";

export const DOCUMENT_SETTINGS_LOAD_ERROR =
  "تعذر تحميل إعدادات وثائق النظام. أعد المحاولة قبل الطباعة أو التصدير.";

/** Never fall back to a visible QR when the effective owner settings are unknown. */
export async function loadDocumentSettingsForExport(
  fetchSettings: () => Promise<PlatformDocumentSettings>
): Promise<PlatformDocumentSettings> {
  try {
    const settings = await fetchSettings();
    if (
      !settings ||
      typeof settings.showMinistryWatermarkText !== "boolean" ||
      typeof settings.showVerificationQr !== "boolean" ||
      !Number.isInteger(settings.watermarkOpacityPercent) ||
      settings.watermarkOpacityPercent < 0 ||
      settings.watermarkOpacityPercent > MAX_WATERMARK_OPACITY_PERCENT ||
      !Number.isInteger(settings.watermarkScalePercent) ||
      settings.watermarkScalePercent < MIN_WATERMARK_SCALE_PERCENT ||
      settings.watermarkScalePercent > MAX_WATERMARK_SCALE_PERCENT ||
      typeof settings.headerDividerColor !== "string" ||
      !HEX_COLOR_PATTERN.test(settings.headerDividerColor) ||
      !["solid", "double", "dashed", "dotted", "tricolor-stars"].includes(
        settings.headerDividerStyle
      ) ||
      settings.headerDividerWidthPt < MIN_DIVIDER_WIDTH_PT ||
      settings.headerDividerWidthPt > MAX_DIVIDER_WIDTH_PT ||
      !HEX_COLOR_PATTERN.test(settings.frameColor) ||
      !["none", "single", "double", "ornate", "classic", "triple"].includes(
        settings.frameStyle
      ) ||
      settings.frameWidthPt < MIN_FRAME_WIDTH_PT ||
      settings.frameWidthPt > MAX_FRAME_WIDTH_PT ||
      ![
        settings.pageMarginTopMm,
        settings.pageMarginRightMm,
        settings.pageMarginBottomMm,
        settings.pageMarginLeftMm,
      ].every(
        value =>
          Number.isInteger(value) && value >= 0 && value <= MAX_PAGE_MARGIN_MM
      ) ||
      typeof settings.watermarkText !== "string" ||
      settings.watermarkText.trim().length === 0 ||
      typeof settings.headerTitle !== "string" ||
      typeof settings.headerSubtitle !== "string" ||
      typeof settings.headerChiefRank !== "string" ||
      typeof settings.headerChiefName !== "string" ||
      typeof settings.headerShowLogo !== "boolean" ||
      !Number.isInteger(settings.headerLogoSize) ||
      settings.headerLogoSize < MIN_HEADER_LOGO_SIZE ||
      settings.headerLogoSize > MAX_HEADER_LOGO_SIZE ||
      !isDocumentDateFormat(settings.documentDateFormat) ||
      !Number.isInteger(settings.headerTopPaddingMm) ||
      settings.headerTopPaddingMm < 0 ||
      settings.headerTopPaddingMm > MAX_HEADER_PADDING_MM ||
      !Number.isInteger(settings.headerHorizontalPaddingMm) ||
      settings.headerHorizontalPaddingMm < 0 ||
      settings.headerHorizontalPaddingMm > MAX_HEADER_PADDING_MM ||
      !Number.isInteger(settings.headerBottomPaddingMm) ||
      settings.headerBottomPaddingMm < 0 ||
      settings.headerBottomPaddingMm > MAX_HEADER_PADDING_MM ||
      !["spread", "center", "right"].includes(settings.headerAlignment)
    ) {
      throw new Error(DOCUMENT_SETTINGS_LOAD_ERROR);
    }
    return settings;
  } catch {
    throw new Error(DOCUMENT_SETTINGS_LOAD_ERROR);
  }
}
