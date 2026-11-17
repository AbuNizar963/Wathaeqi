import { Query } from "node-appwrite";
import {
  DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
  HEX_COLOR_PATTERN,
  MAX_WATERMARK_OPACITY_PERCENT,
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
    showVerificationQr:
      typeof row.showVerificationQr === "boolean"
        ? row.showVerificationQr
        : DEFAULT_PLATFORM_DOCUMENT_SETTINGS.showVerificationQr,
    updatedAt: row.updatedAt
      ? new Date(String(row.updatedAt)).toISOString()
      : null,
  };
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
        `Failed to save platform document settings: ${
          error instanceof Error ? error.message : String(error)
        }`
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
