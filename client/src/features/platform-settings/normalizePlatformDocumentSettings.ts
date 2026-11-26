import {
  DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
  DOCUMENT_DATE_FORMATS,
  DOCUMENT_FONT_FAMILIES,
  DOCUMENT_FONT_WEIGHTS,
  HEX_COLOR_PATTERN,
  MIN_DOCUMENT_FONT_SIZE_PT,
  MAX_DOCUMENT_FONT_SIZE_PT,
  MIN_RECIPIENT_FONT_SIZE_PT,
  MAX_RECIPIENT_FONT_SIZE_PT,
  MAX_HEADER_LOGO_SIZE,
  MIN_HEADER_LOGO_SIZE,
  isDocumentFrameStyle,
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

function safeFontFamily(value: unknown, fallback: string): string {
  return typeof value === "string" &&
    DOCUMENT_FONT_FAMILIES.includes(value as (typeof DOCUMENT_FONT_FAMILIES)[number])
    ? value
    : fallback;
}

function safeFontWeight(value: unknown, fallback: number): number {
  return DOCUMENT_FONT_WEIGHTS.includes(value as (typeof DOCUMENT_FONT_WEIGHTS)[number])
    ? value as number
    : fallback;
}

function boundedFontSize(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const number = safeNumber(value, fallback);
  return Math.max(minimum, Math.min(maximum, number));
}

function safeHexColor(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX_COLOR_PATTERN.test(value.trim())
    ? value.trim()
    : fallback;
}

function isUnitRoleLine(value: string): boolean {
  return /^(?:رئيس|مدير|قائد)(?:\s|$)/u.test(value.trim());
}

function isRankLine(value: string): boolean {
  return /^(?:المقدم|مقدّم|مقدم|العقيد|عقيد|العميد|عميد|الرائد|رائد|النقيب|نقيب|الملازم|ملازم|اللواء|لواء|مساعد)(?:\s|$)/u.test(
    value.trim()
  );
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
  const storedTitle = safeText(source.headerTitle, defaults.headerTitle, 255);
  const storedSubtitle = safeText(
    source.headerSubtitle,
    defaults.headerSubtitle,
    255
  );
  const storedChiefRank = safeText(
    source.headerChiefRank,
    defaults.headerChiefRank,
    120
  );
  const storedChiefName = safeText(
    source.headerChiefName,
    defaults.headerChiefName,
    255
  );
  const rawChiefRank = safeText(source.headerChiefRank, "", 120);
  const rawChiefName = safeText(source.headerChiefName, "", 255);
  const isPreviousTwoLineDefault =
    storedTitle === "المقدم غسان صالح كنو" &&
    storedSubtitle === "رئيس قسم الشهباء" &&
    (!rawChiefRank || rawChiefRank === defaults.headerChiefRank) &&
    (!rawChiefName || rawChiefName === defaults.headerChiefName);
  const storedSignerLine = [storedTitle, storedSubtitle]
    .filter(Boolean)
    .join(" ");
  const storedRoleLine = [storedChiefRank, storedChiefName]
    .filter(Boolean)
    .join(" ");
  const isReversedSignaturePair =
    isUnitRoleLine(storedSignerLine) && isRankLine(storedRoleLine);

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
    watermarkScalePercent: safeNumber(
      source.watermarkScalePercent,
      defaults.watermarkScalePercent
    ),
    headerDividerColor: safeHexColor(
      source.headerDividerColor,
      defaults.headerDividerColor
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
    headerTitle: isPreviousTwoLineDefault
      ? defaults.headerTitle
      : isReversedSignaturePair
        ? storedChiefRank
        : storedTitle || defaults.headerTitle,
    headerSubtitle: isPreviousTwoLineDefault
      ? defaults.headerSubtitle
      : isReversedSignaturePair
        ? storedChiefName
        : storedSubtitle || defaults.headerSubtitle,
    headerChiefRank: isPreviousTwoLineDefault
      ? defaults.headerChiefRank
      : isReversedSignaturePair
        ? storedTitle
        : storedChiefRank,
    headerChiefName: isPreviousTwoLineDefault
      ? defaults.headerChiefName
      : isReversedSignaturePair
        ? storedSubtitle
        : storedChiefName,
    headerShowLogo: safeBoolean(source.headerShowLogo, defaults.headerShowLogo),
    headerLogoSize: Math.max(
      MIN_HEADER_LOGO_SIZE,
      Math.min(
        MAX_HEADER_LOGO_SIZE,
        Math.round(safeNumber(source.headerLogoSize, defaults.headerLogoSize))
      )
    ),
    documentDateFormat: DOCUMENT_DATE_FORMATS.includes(
      source.documentDateFormat as (typeof DOCUMENT_DATE_FORMATS)[number]
    )
      ? (source.documentDateFormat as (typeof DOCUMENT_DATE_FORMATS)[number])
      : defaults.documentDateFormat,
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
    frameStyle: isDocumentFrameStyle(source.frameStyle)
      ? source.frameStyle
      : defaults.frameStyle,
    frameColor: safeHexColor(source.frameColor, defaults.frameColor),
    frameWidthPt: safeNumber(source.frameWidthPt, defaults.frameWidthPt),
    documentFontFamily: safeFontFamily(source.documentFontFamily, defaults.documentFontFamily) as PlatformDocumentSettings["documentFontFamily"],
    documentFontSizePt: boundedFontSize(source.documentFontSizePt, defaults.documentFontSizePt, MIN_DOCUMENT_FONT_SIZE_PT, MAX_DOCUMENT_FONT_SIZE_PT),
    documentFontWeight: safeFontWeight(source.documentFontWeight, defaults.documentFontWeight) as PlatformDocumentSettings["documentFontWeight"],
    documentFontColor: safeHexColor(source.documentFontColor, defaults.documentFontColor),
    recipientFontFamily: safeFontFamily(source.recipientFontFamily, defaults.recipientFontFamily) as PlatformDocumentSettings["recipientFontFamily"],
    recipientFontSizePt: boundedFontSize(source.recipientFontSizePt, defaults.recipientFontSizePt, MIN_RECIPIENT_FONT_SIZE_PT, MAX_RECIPIENT_FONT_SIZE_PT),
    recipientFontWeight: safeFontWeight(source.recipientFontWeight, defaults.recipientFontWeight) as PlatformDocumentSettings["recipientFontWeight"],
    recipientFontColor: safeHexColor(source.recipientFontColor, defaults.recipientFontColor),
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
