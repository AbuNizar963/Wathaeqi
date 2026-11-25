export type DocumentTextRow = { right: string; left: string };

export const DEFAULT_PLATFORM_DOCUMENT_SETTINGS = {
  showMinistryWatermarkText: true,
  watermarkText: "وزارة الداخلية",
  watermarkOpacityPercent: 12,
  watermarkScalePercent: 100,
  headerDividerColor: "#b49a55",
  headerDividerStyle: "double" as const,
  headerDividerWidthPt: 2.25,
  headerTitle: "المقدم",
  headerSubtitle: "غسان صالح كنو",
  headerChiefRank: "رئيس قسم شرطة",
  headerChiefName: "الشهباء",
  headerShowLogo: true,
  headerLogoSize: 200,
  headerTopPaddingMm: 0,
  headerHorizontalPaddingMm: 0,
  headerBottomPaddingMm: 6,
  headerAlignment: "spread" as const,
  pageHeaderRows: [] as DocumentTextRow[],
  pageFooterRows: [] as DocumentTextRow[],
  pageMarginTopMm: 10,
  pageMarginRightMm: 10,
  pageMarginBottomMm: 10,
  pageMarginLeftMm: 10,
  frameStyle: "single" as const,
  frameColor: "#b49a55",
  frameWidthPt: 1,
  showVerificationQr: true,
} as const;

export type DocumentHeaderAlignment = "spread" | "center" | "right";
export type DocumentDividerStyle =
  "solid" | "double" | "dashed" | "dotted" | "tricolor-stars";
export type DocumentFrameStyle = "none" | "single" | "double" | "ornate";

export type PlatformDocumentSettings = {
  showMinistryWatermarkText: boolean;
  watermarkText: string;
  /** Opacity percentage for the watermark text and organization-logo layers. */
  watermarkOpacityPercent: number;
  watermarkScalePercent: number;
  headerDividerColor: string;
  headerDividerStyle: DocumentDividerStyle;
  headerDividerWidthPt: number;
  headerTitle: string;
  headerSubtitle: string;
  headerChiefRank: string;
  headerChiefName: string;
  headerShowLogo: boolean;
  headerLogoSize: number;
  headerTopPaddingMm: number;
  headerHorizontalPaddingMm: number;
  headerBottomPaddingMm: number;
  headerAlignment: DocumentHeaderAlignment;
  pageHeaderRows: DocumentTextRow[];
  pageFooterRows: DocumentTextRow[];
  pageMarginTopMm: number;
  pageMarginRightMm: number;
  pageMarginBottomMm: number;
  pageMarginLeftMm: number;
  frameStyle: DocumentFrameStyle;
  frameColor: string;
  frameWidthPt: number;
  showVerificationQr: boolean;
  updatedAt?: string | Date | null;
};

export const MAX_WATERMARK_OPACITY_PERCENT = 60;
export const MIN_WATERMARK_SCALE_PERCENT = 40;
export const MAX_WATERMARK_SCALE_PERCENT = 180;
export const MAX_HEADER_LOGO_SIZE = 220;
export const MIN_HEADER_LOGO_SIZE = 90;
export const MAX_HEADER_PADDING_MM = 30;
export const MAX_PAGE_MARGIN_MM = 35;
export const MIN_DIVIDER_WIDTH_PT = 0.5;
export const MAX_DIVIDER_WIDTH_PT = 6;
export const MIN_FRAME_WIDTH_PT = 0.5;
export const MAX_FRAME_WIDTH_PT = 4;
export const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
