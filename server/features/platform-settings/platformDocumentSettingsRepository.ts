import { Query } from "node-appwrite";
import {
  DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
  DOCUMENT_DATE_FORMATS,
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
  DOCUMENT_FONT_FAMILIES,
  DOCUMENT_FONT_WEIGHTS,
  MIN_DOCUMENT_FONT_SIZE_PT,
  MAX_DOCUMENT_FONT_SIZE_PT,
  MIN_RECIPIENT_FONT_SIZE_PT,
  MAX_RECIPIENT_FONT_SIZE_PT,
  isDocumentFrameStyle,
  type PlatformDocumentSettings,
  type DocumentTextRow,
} from "../../../shared/features/platform-settings/platformDocumentSettings";
import {
  getAppwriteDatabaseId,
  getAppwriteTablesDB,
} from "../../_core/appwrite";

const TABLE_ID = "platform_document_settings";
const ROW_ID = "1";

function isDocumentFontFamily(
  value: unknown
): value is PlatformDocumentSettings["documentFontFamily"] {
  return DOCUMENT_FONT_FAMILIES.includes(
    value as (typeof DOCUMENT_FONT_FAMILIES)[number]
  );
}

function safeDocumentFontWeight(
  value: unknown,
  fallback: PlatformDocumentSettings["documentFontWeight"]
): PlatformDocumentSettings["documentFontWeight"] {
  const weight = Number(value);
  return DOCUMENT_FONT_WEIGHTS.includes(
    weight as (typeof DOCUMENT_FONT_WEIGHTS)[number]
  )
    ? (weight as PlatformDocumentSettings["documentFontWeight"])
    : fallback;
}

type AppwriteRow = Record<string, unknown> & {
  $id: string;
  data?: Record<string, unknown>;
};

const SETTINGS_DATA_KEYS = [
  "id",
  "showMinistryWatermarkText",
  "watermarkOpacityPercent",
  "watermarkScalePercent",
  "headerDividerColor",
  "headerDividerStyle",
  "headerDividerWidthPt",
  "showVerificationQr",
  "updatedByUserId",
  "updatedAt",
  "watermarkText",
  "headerTitle",
  "headerSubtitle",
  "headerChiefRank",
  "headerChiefName",
  "headerShowLogo",
  "headerLogoSize",
  "documentDateFormat",
  "headerTopPaddingMm",
  "headerHorizontalPaddingMm",
  "headerBottomPaddingMm",
  "pageMarginTopMm",
  "pageMarginRightMm",
  "pageMarginBottomMm",
  "pageMarginLeftMm",
  "frameStyle",
  "frameColor",
  "frameWidthPt",
  "headerAlignment",
  "pageHeaderRows",
  "pageFooterRows",
  "documentFontFamily",
  "documentFontSizePt",
  "documentFontWeight",
  "documentFontColor",
  "recipientFontFamily",
  "recipientFontSizePt",
  "recipientFontWeight",
  "recipientFontColor",
] as const;

function rowData(row: AppwriteRow): Record<string, unknown> {
  return row.data ?? row;
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
    watermarkScalePercent:
      Number.isInteger(Number(row.watermarkScalePercent)) &&
      Number(row.watermarkScalePercent) >= MIN_WATERMARK_SCALE_PERCENT &&
      Number(row.watermarkScalePercent) <= MAX_WATERMARK_SCALE_PERCENT
        ? Number(row.watermarkScalePercent)
        : DEFAULT_PLATFORM_DOCUMENT_SETTINGS.watermarkScalePercent,
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
    documentDateFormat: DOCUMENT_DATE_FORMATS.includes(
      row.documentDateFormat as (typeof DOCUMENT_DATE_FORMATS)[number]
    )
      ? (row.documentDateFormat as (typeof DOCUMENT_DATE_FORMATS)[number])
      : DEFAULT_PLATFORM_DOCUMENT_SETTINGS.documentDateFormat,
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
    headerBottomPaddingMm: boundedInteger(
      row.headerBottomPaddingMm,
      MAX_HEADER_PADDING_MM,
      DEFAULT_PLATFORM_DOCUMENT_SETTINGS.headerBottomPaddingMm
    ),
    headerAlignment:
      row.headerAlignment === "center" || row.headerAlignment === "right"
        ? row.headerAlignment
        : DEFAULT_PLATFORM_DOCUMENT_SETTINGS.headerAlignment,
    pageHeaderRows: readTextRows(row.pageHeaderRows),
    pageFooterRows: readTextRows(row.pageFooterRows),
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
    frameStyle: isDocumentFrameStyle(row.frameStyle)
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
    documentFontFamily: isDocumentFontFamily(row.documentFontFamily)
      ? row.documentFontFamily
      : DEFAULT_PLATFORM_DOCUMENT_SETTINGS.documentFontFamily,
    documentFontSizePt: boundedNumber(
      row.documentFontSizePt,
      MIN_DOCUMENT_FONT_SIZE_PT,
      MAX_DOCUMENT_FONT_SIZE_PT,
      DEFAULT_PLATFORM_DOCUMENT_SETTINGS.documentFontSizePt
    ),
    documentFontWeight: safeDocumentFontWeight(
      row.documentFontWeight,
      DEFAULT_PLATFORM_DOCUMENT_SETTINGS.documentFontWeight
    ),
    documentFontColor:
      typeof row.documentFontColor === "string" &&
      HEX_COLOR_PATTERN.test(row.documentFontColor)
        ? row.documentFontColor
        : DEFAULT_PLATFORM_DOCUMENT_SETTINGS.documentFontColor,
    recipientFontFamily: isDocumentFontFamily(row.recipientFontFamily)
      ? row.recipientFontFamily
      : DEFAULT_PLATFORM_DOCUMENT_SETTINGS.recipientFontFamily,
    recipientFontSizePt: boundedNumber(
      row.recipientFontSizePt,
      MIN_RECIPIENT_FONT_SIZE_PT,
      MAX_RECIPIENT_FONT_SIZE_PT,
      DEFAULT_PLATFORM_DOCUMENT_SETTINGS.recipientFontSizePt
    ),
    recipientFontWeight: safeDocumentFontWeight(
      row.recipientFontWeight,
      DEFAULT_PLATFORM_DOCUMENT_SETTINGS.recipientFontWeight
    ),
    recipientFontColor:
      typeof row.recipientFontColor === "string" &&
      HEX_COLOR_PATTERN.test(row.recipientFontColor)
        ? row.recipientFontColor
        : DEFAULT_PLATFORM_DOCUMENT_SETTINGS.recipientFontColor,
    showVerificationQr:
      typeof row.showVerificationQr === "boolean"
        ? row.showVerificationQr
        : DEFAULT_PLATFORM_DOCUMENT_SETTINGS.showVerificationQr,
    updatedAt: row.updatedAt
      ? new Date(String(row.updatedAt)).toISOString()
      : null,
  };
}

function readTextRows(value: unknown): DocumentTextRow[] {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.slice(0, 12).map(item => {
    const row =
      item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    return {
      right:
        typeof row.right === "string" ? row.right.trim().slice(0, 255) : "",
      left: typeof row.left === "string" ? row.left.trim().slice(0, 255) : "",
    };
  });
}

function boundedInteger(value: unknown, max: number, fallback: number): number {
  if (value === null || value === undefined || value === "") return fallback;
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

async function writeSettingsRow(
  write: (data: Record<string, unknown>) => Promise<AppwriteRow>,
  data: Record<string, unknown>
): Promise<AppwriteRow> {
  // Never silently omit a rejected setting. A partial write would make the UI
  // report success while losing the owner's selected document configuration.
  // Surface schema drift so it can be fixed through the reviewed Appwrite
  // schema migration instead of weakening the payload.
  return write(data);
}

function dataForExistingRow(
  row: AppwriteRow,
  data: Record<string, unknown>
): Record<string, unknown> {
  const storedKeys = new Set(Object.keys(rowData(row)));
  if (storedKeys.size === 0) {
    throw new Error(
      "Cannot safely update platform document settings: Appwrite returned an empty row"
    );
  }
  // Older SDK responses and isolated repository tests may expose only the
  // user data. In that case there is no reliable schema signal to filter by;
  // retain the existing fail-loud write behavior.
  if (!storedKeys.has("id") && !storedKeys.has("updatedAt")) return data;
  const filtered = Object.fromEntries(
    SETTINGS_DATA_KEYS.filter(key => storedKeys.has(key) && key in data).map(
      key => [key, data[key]]
    )
  );
  if (!("id" in filtered) || !("updatedAt" in filtered)) {
    throw new Error(
      "Cannot safely update platform document settings: required Appwrite fields are missing"
    );
  }
  return filtered;
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
  const { pageHeaderRows, pageFooterRows, ...scalarValues } = values;
  const data = {
    id: 1,
    ...scalarValues,
    pageHeaderRows: JSON.stringify(readTextRows(pageHeaderRows)),
    pageFooterRows: JSON.stringify(readTextRows(pageFooterRows)),
    updatedByUserId,
    updatedAt: now,
  };
  const tables = getAppwriteTablesDB();
  const existing = await findSettingsRow();

  if (existing) {
    const existingData = dataForExistingRow(existing, data);
    const updated = await writeSettingsRow(
      nextData =>
        tables.updateRow({
          databaseId: getAppwriteDatabaseId(),
          tableId: TABLE_ID,
          rowId: existing.$id,
          data: nextData,
        }) as Promise<AppwriteRow>,
      existingData
    );
    return mapPlatformDocumentSettings(rowData(updated as AppwriteRow));
  }

  try {
    const created = await writeSettingsRow(
      nextData =>
        tables.createRow({
          databaseId: getAppwriteDatabaseId(),
          tableId: TABLE_ID,
          rowId: ROW_ID,
          data: nextData,
        }) as Promise<AppwriteRow>,
      data
    );
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
        `Failed to save platform document settings: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
    const raced = await findSettingsRow();
    if (!raced) throw error;
    const racedData = dataForExistingRow(raced, data);
    const updated = await writeSettingsRow(
      nextData =>
        tables.updateRow({
          databaseId: getAppwriteDatabaseId(),
          tableId: TABLE_ID,
          rowId: raced.$id,
          data: nextData,
        }) as Promise<AppwriteRow>,
      racedData
    );
    return mapPlatformDocumentSettings(rowData(updated as AppwriteRow));
  }
}
