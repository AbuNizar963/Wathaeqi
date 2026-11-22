import { Query } from "node-appwrite";
import {
  DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
  HEX_COLOR_PATTERN,
  MAX_WATERMARK_OPACITY_PERCENT,
  MAX_HEADER_LOGO_SIZE,
  MIN_HEADER_LOGO_SIZE,
  MAX_HEADER_PADDING_MM,
  MAX_PAGE_MARGIN_MM,
  MIN_DIVIDER_WIDTH_PT,
  MAX_DIVIDER_WIDTH_PT,
  MIN_FRAME_WIDTH_PT,
  MAX_FRAME_WIDTH_PT,
  type PlatformDocumentSettings,
} from "../../../shared/features/platform-settings/platformDocumentSettings";
import {
  getAppwriteDatabaseId,
  getAppwriteTablesDB,
} from "../../_core/appwrite";

const TABLE_ID = "platform_document_settings";
const ROW_ID = "1";

type AppwriteRow = Record<string, unknown> & {
  $id: string;
  data?: Record<string, unknown>;
};

function rowData(row: AppwriteRow): Record<string, unknown> {
  return row.data ?? row;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return String(error);
}

async function findSettingsRow(): Promise<AppwriteRow | null> {
  const result = await getAppwriteTablesDB().listRows({
    databaseId: getAppwriteDatabaseId(),
    tableId: TABLE_ID,
    queries: [Query.equal("id", 1), Query.limit(2)],
    total: false,
  });
  const rows = result.rows as AppwriteRow[];
  if (rows.length > 1) {
    throw new Error(
      "Platform document settings contains duplicate singleton rows"
    );
  }
  return rows[0] ?? null;
}

function mapPlatformDocumentSettings(
  row: Record<string, unknown>
): PlatformDocumentSettings {
  const storedOpacity = Number(row.watermarkOpacityPercent);
  const storedColor = row.headerDividerColor;
  return {
    showMinistryWatermarkText:
      typeof row.showMinistryWatermarkText === "boolean"
        ? row.showMinistryWatermarkText
        : DEFAULT_PLATFORM_DOCUMENT_SETTINGS.showMinistryWatermarkText,
    watermarkOpacityPercent:
      Number.isInteger(storedOpacity) &&
      storedOpacity >= 0 &&
      storedOpacity <= MAX_WATERMARK_OPACITY_PERCENT
        ? storedOpacity
        : DEFAULT_PLATFORM_DOCUMENT_SETTINGS.watermarkOpacityPercent,
    headerDividerColor:
      typeof storedColor === "string" && HEX_COLOR_PATTERN.test(storedColor)
        ? storedColor
        : DEFAULT_PLATFORM_DOCUMENT_SETTINGS.headerDividerColor,
    headerDividerStyle:
      row.headerDividerStyle === "solid" ||
      row.headerDividerStyle === "double" ||
      row.headerDividerStyle === "dashed" ||
      row.headerDividerStyle === "dotted" ||
      row.headerDividerStyle === "tricolor-stars"
        ? row.headerDividerStyle
        : DEFAULT_PLATFORM_DOCUMENT_SETTINGS.headerDividerStyle,
    headerDividerWidthPt: boundedNumber(
      row.headerDividerWidthPt,
      MIN_DIVIDER_WIDTH_PT,
      MAX_DIVIDER_WIDTH_PT,
      DEFAULT_PLATFORM_DOCUMENT_SETTINGS.headerDividerWidthPt
    ),
    watermarkText:
      typeof row.watermarkText === "string" && row.watermarkText.trim()
        ? row.watermarkText.trim().slice(0, 255)
        : DEFAULT_PLATFORM_DOCUMENT_SETTINGS.watermarkText,
    headerTitle:
      typeof row.headerTitle === "string"
        ? row.headerTitle.trim().slice(0, 255)
        : DEFAULT_PLATFORM_DOCUMENT_SETTINGS.headerTitle,
    headerSubtitle:
      typeof row.headerSubtitle === "string"
        ? row.headerSubtitle.trim().slice(0, 255)
        : DEFAULT_PLATFORM_DOCUMENT_SETTINGS.headerSubtitle,
    headerChiefRank:
      typeof row.headerChiefRank === "string"
        ? row.headerChiefRank.trim().slice(0, 120)
        : DEFAULT_PLATFORM_DOCUMENT_SETTINGS.headerChiefRank,
    headerChiefName:
      typeof row.headerChiefName === "string"
        ? row.headerChiefName.trim().slice(0, 255)
        : DEFAULT_PLATFORM_DOCUMENT_SETTINGS.headerChiefName,
    headerShowLogo:
      typeof row.headerShowLogo === "boolean"
        ? row.headerShowLogo
        : DEFAULT_PLATFORM_DOCUMENT_SETTINGS.headerShowLogo,
    headerLogoSize:
      Number.isInteger(Number(row.headerLogoSize)) &&
      Number(row.headerLogoSize) >= MIN_HEADER_LOGO_SIZE &&
      Number(row.headerLogoSize) <= MAX_HEADER_LOGO_SIZE
        ? Number(row.headerLogoSize)
        : DEFAULT_PLATFORM_DOCUMENT_SETTINGS.headerLogoSize,
    headerTopPaddingMm:
      Number.isInteger(Number(row.headerTopPaddingMm)) &&
      Number(row.headerTopPaddingMm) >= 0 &&
      Number(row.headerTopPaddingMm) <= MAX_HEADER_PADDING_MM
        ? Number(row.headerTopPaddingMm)
        : DEFAULT_PLATFORM_DOCUMENT_SETTINGS.headerTopPaddingMm,
    headerHorizontalPaddingMm:
      Number.isInteger(Number(row.headerHorizontalPaddingMm)) &&
      Number(row.headerHorizontalPaddingMm) >= 0 &&
      Number(row.headerHorizontalPaddingMm) <= MAX_HEADER_PADDING_MM
        ? Number(row.headerHorizontalPaddingMm)
        : DEFAULT_PLATFORM_DOCUMENT_SETTINGS.headerHorizontalPaddingMm,
    headerBottomPaddingMm:
      Number.isInteger(Number(row.headerBottomPaddingMm)) &&
      Number(row.headerBottomPaddingMm) >= 0 &&
      Number(row.headerBottomPaddingMm) <= MAX_HEADER_PADDING_MM
        ? Number(row.headerBottomPaddingMm)
        : DEFAULT_PLATFORM_DOCUMENT_SETTINGS.headerBottomPaddingMm,
    headerAlignment:
      row.headerAlignment === "center" || row.headerAlignment === "right"
        ? row.headerAlignment
        : DEFAULT_PLATFORM_DOCUMENT_SETTINGS.headerAlignment,
    pageMarginTopMm: boundedInteger(
      row.pageMarginTopMm,
      MAX_PAGE_MARGIN_MM,
      DEFAULT_PLATFORM_DOCUMENT_SETTINGS.pageMarginTopMm
    ),
    pageMarginRightMm: boundedInteger(
      row.pageMarginRightMm,
      MAX_PAGE_MARGIN_MM,
      DEFAULT_PLATFORM_DOCUMENT_SETTINGS.pageMarginRightMm
    ),
    pageMarginBottomMm: boundedInteger(
      row.pageMarginBottomMm,
      MAX_PAGE_MARGIN_MM,
      DEFAULT_PLATFORM_DOCUMENT_SETTINGS.pageMarginBottomMm
    ),
    pageMarginLeftMm: boundedInteger(
      row.pageMarginLeftMm,
      MAX_PAGE_MARGIN_MM,
      DEFAULT_PLATFORM_DOCUMENT_SETTINGS.pageMarginLeftMm
    ),
    frameStyle:
      row.frameStyle === "none" ||
      row.frameStyle === "single" ||
      row.frameStyle === "double" ||
      row.frameStyle === "ornate"
        ? row.frameStyle
        : DEFAULT_PLATFORM_DOCUMENT_SETTINGS.frameStyle,
    frameColor:
      typeof row.frameColor === "string" &&
      HEX_COLOR_PATTERN.test(row.frameColor)
        ? row.frameColor
        : DEFAULT_PLATFORM_DOCUMENT_SETTINGS.frameColor,
    frameWidthPt: boundedNumber(
      row.frameWidthPt,
      MIN_FRAME_WIDTH_PT,
      MAX_FRAME_WIDTH_PT,
      DEFAULT_PLATFORM_DOCUMENT_SETTINGS.frameWidthPt
    ),
    showVerificationQr:
      typeof row.showVerificationQr === "boolean"
        ? row.showVerificationQr
        : DEFAULT_PLATFORM_DOCUMENT_SETTINGS.showVerificationQr,
    updatedAt: row.updatedAt
      ? new Date(String(row.updatedAt)).toISOString()
      : null,
  };
}

function boundedInteger(value: unknown, max: number, fallback: number): number {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= max
    ? number
    : fallback;
}
function boundedNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max
    ? number
    : fallback;
}

export async function getPlatformDocumentSettings(): Promise<PlatformDocumentSettings> {
  const row = await findSettingsRow();
  if (!row) {
    // A read must not create defaults or overwrite an owner's concurrent save.
    return { ...DEFAULT_PLATFORM_DOCUMENT_SETTINGS, updatedAt: null };
  }
  return mapPlatformDocumentSettings(rowData(row));
}

export async function updatePlatformDocumentSettings(
  values: Omit<PlatformDocumentSettings, "updatedAt">,
  updatedByUserId: number
): Promise<PlatformDocumentSettings> {
  const now = new Date().toISOString();
  const data = {
    id: 1,
    ...values,
    updatedByUserId,
    updatedAt: now,
  };
  const tables = getAppwriteTablesDB();
  const existing = await findSettingsRow();

  if (existing) {
    const updated = await tables.updateRow({
      databaseId: getAppwriteDatabaseId(),
      tableId: TABLE_ID,
      rowId: existing.$id,
      data,
    });
    return mapPlatformDocumentSettings(rowData(updated as AppwriteRow));
  }

  try {
    const created = await tables.createRow({
      databaseId: getAppwriteDatabaseId(),
      tableId: TABLE_ID,
      rowId: ROW_ID,
      data,
    });
    return mapPlatformDocumentSettings(rowData(created as AppwriteRow));
  } catch (error) {
    // If two first-time saves race, the unique id index lets one win. Reload
    // the winning row and apply this owner's requested values to that row.
    const code =
      error && typeof error === "object" && "code" in error
        ? Number((error as { code?: unknown }).code)
        : 0;
    if (code !== 409) {
      throw new Error(
        `Failed to save platform document settings: ${errorMessage(error)}`
      );
    }
    const raced = await findSettingsRow();
    if (!raced) throw error;
    const updated = await tables.updateRow({
      databaseId: getAppwriteDatabaseId(),
      tableId: TABLE_ID,
      rowId: raced.$id,
      data,
    });
    return mapPlatformDocumentSettings(rowData(updated as AppwriteRow));
  }
}
