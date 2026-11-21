export const DEFAULT_PLATFORM_DOCUMENT_SETTINGS = {
  showMinistryWatermarkText: true,
  watermarkText: "وزارة الداخلية",
  watermarkOpacityPercent: 12,
  headerDividerColor: "#b49a55",
  headerTitle: "",
  headerSubtitle: "",
  headerChiefRank: "",
  headerChiefName: "",
  headerShowLogo: true,
  headerLogoSize: 120,
  headerTopPaddingMm: 0,
  headerHorizontalPaddingMm: 0,
  headerBottomPaddingMm: 6,
  headerAlignment: "spread" as const,
  showVerificationQr: true,
} as const;

export type DocumentHeaderAlignment = "spread" | "center" | "right";

export type PlatformDocumentSettings = {
  showMinistryWatermarkText: boolean;
  watermarkText: string;
  /** Opacity percentage for the watermark text and organization-logo layers. */
  watermarkOpacityPercent: number;
  headerDividerColor: string;
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
  showVerificationQr: boolean;
  updatedAt?: string | Date | null;
};

export const MAX_WATERMARK_OPACITY_PERCENT = 60;
export const MAX_HEADER_LOGO_SIZE = 128;
export const MIN_HEADER_LOGO_SIZE = 32;
export const MAX_HEADER_PADDING_MM = 30;
export const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
