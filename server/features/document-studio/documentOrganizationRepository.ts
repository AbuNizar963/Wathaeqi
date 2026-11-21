import { Query } from "node-appwrite";
import {
  getAppwriteDatabaseId,
  getAppwriteTablesDB,
} from "../../_core/appwrite";
import { getOrganizationLogoDataUrl } from "../organizations/organizationService";

const TABLE_ID = "department_settings";

type AppwriteRow = Record<string, unknown> & {
  $id: string;
  data?: Record<string, unknown>;
};

export type DocumentOrganizationSettings = {
  organizationId: string;
  departmentName: string;
  unitName: string;
  unitChiefRank: string;
  unitChiefName: string;
  logoUrl: string | null;
  serialPrefix: string;
  numberSystem: string;
  dateFormat: string;
  timezone: string;
};

function rowData(row: AppwriteRow): Record<string, unknown> {
  return row.data ?? row;
}

function requiredString(
  value: unknown,
  fallback: string,
  maxLength: number
): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return value.trim().slice(0, maxLength);
}

async function findSettingsRow(
  organizationId: string,
  transactionId?: string
): Promise<AppwriteRow | null> {
  const result = await getAppwriteTablesDB().listRows({
    databaseId: getAppwriteDatabaseId(),
    tableId: TABLE_ID,
    queries: [Query.equal("organizationId", organizationId), Query.limit(2)],
    total: false,
    ...(transactionId ? { transactionId } : {}),
  });

  const rows = result.rows as AppwriteRow[];
  if (rows.length > 1) {
    throw new Error(
      "Appwrite returned duplicate document settings for one organization"
    );
  }
  return rows[0] ?? null;
}

/**
 * Reads document letterhead and numbering configuration from Appwrite only.
 * An absent settings row is intentionally reported as null; reads never
 * create defaults or silently initialize an organization's numbering.
 */
export async function getDocumentOrganizationSettings(
  organizationId: string
): Promise<DocumentOrganizationSettings | null> {
  const row = await findSettingsRow(organizationId);
  if (!row) return null;

  const data = rowData(row);
  return {
    organizationId,
    departmentName: requiredString(data.departmentName, "إدارة الوثائق", 255),
    unitName: requiredString(data.unitName, "الوحدة الإدارية", 255),
    unitChiefRank: requiredString(data.unitChiefRank, "", 120),
    unitChiefName: requiredString(data.unitChiefName, "", 255),
    // Resolve the current logo from the organization's private storage key.
    // Do not persist or reuse short-lived signed URLs in department settings.
    logoUrl: await getOrganizationLogoDataUrl(organizationId),
    serialPrefix: requiredString(data.serialPrefix, "DOC", 24),
    numberSystem: requiredString(data.numberSystem, "latin", 16),
    dateFormat: requiredString(data.dateFormat, "dd/MM/yyyy", 32),
    timezone: requiredString(data.timezone, "UTC", 64),
  };
}

/**
 * Atomically reserves an outgoing document number in Appwrite. The counter
 * is advanced in the same transaction as its read, preventing two concurrent
 * requests from receiving the same serial number.
 */
export async function allocateDocumentOrganizationSerialNumber(
  organizationId: string
): Promise<number> {
  const tables = getAppwriteTablesDB();
  const databaseId = getAppwriteDatabaseId();
  const transaction = await tables.createTransaction({ ttl: 60 });

  try {
    const row = await findSettingsRow(organizationId, transaction.$id);
    if (!row) {
      throw new Error(
        "Document numbering is not configured for this organization"
      );
    }

    const data = rowData(row);
    const current = Number(
      data.nextOutgoingSerial ?? data.nextSerial ?? data.serialStart ?? 1
    );
    if (!Number.isSafeInteger(current) || current < 1) {
      throw new Error("The Appwrite document serial counter is invalid");
    }
    if (current >= Number.MAX_SAFE_INTEGER) {
      throw new Error("The Appwrite document serial counter is exhausted");
    }

    await tables.updateRow({
      databaseId,
      tableId: TABLE_ID,
      rowId: row.$id,
      transactionId: transaction.$id,
      data: {
        nextOutgoingSerial: current + 1,
        updatedAt: new Date().toISOString(),
      },
    });

    await tables.updateTransaction({
      transactionId: transaction.$id,
      commit: true,
    });
    return current;
  } catch (error) {
    try {
      await tables.updateTransaction({
        transactionId: transaction.$id,
        rollback: true,
      });
    } catch {
      // Preserve the original error if the transaction already expired.
    }
    throw error;
  }
}
