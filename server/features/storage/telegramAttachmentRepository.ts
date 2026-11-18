import { randomInt, randomUUID } from "node:crypto";
import { Query } from "node-appwrite";
import {
  getAppwriteDatabaseId,
  getAppwriteTablesDB,
} from "../../_core/appwrite";

const TABLE_ID = "telegram_attachments";

type AttachmentRow = Record<string, unknown> & {
  $id: string;
  data?: Record<string, unknown>;
};

export type TelegramAttachmentRecord = {
  id: number;
  telegramId: number;
  storageOrganizationId: string | null;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  uploadedByUserId: number;
  scanStatus: string;
  createdAt: string;
};

function rowData(row: AttachmentRow): Record<string, unknown> {
  return row.data ?? row;
}

function mapAttachment(row: AttachmentRow): TelegramAttachmentRecord {
  const data = rowData(row);
  const id = Number(data.id);
  const telegramId = Number(data.telegramId);
  const sizeBytes = Number(data.sizeBytes);
  const uploadedByUserId = Number(data.uploadedByUserId);

  if (
    !Number.isSafeInteger(id) ||
    !Number.isSafeInteger(telegramId) ||
    !Number.isSafeInteger(sizeBytes) ||
    !Number.isSafeInteger(uploadedByUserId) ||
    typeof data.storageKey !== "string" ||
    typeof data.originalName !== "string" ||
    typeof data.mimeType !== "string" ||
    typeof data.sha256 !== "string" ||
    typeof data.createdAt !== "string"
  ) {
    throw new Error("Appwrite returned invalid telegram attachment metadata");
  }

  return {
    id,
    telegramId,
    storageOrganizationId:
      typeof data.storageOrganizationId === "string"
        ? data.storageOrganizationId
        : null,
    storageKey: data.storageKey,
    originalName: data.originalName,
    mimeType: data.mimeType,
    sizeBytes,
    sha256: data.sha256,
    uploadedByUserId,
    scanStatus:
      typeof data.scanStatus === "string" ? data.scanStatus : "unavailable",
    createdAt: data.createdAt,
  };
}

async function listAttachmentRows(
  queries: string[]
): Promise<AttachmentRow[]> {
  const result = await getAppwriteTablesDB().listRows({
    databaseId: getAppwriteDatabaseId(),
    tableId: TABLE_ID,
    queries: [...queries, Query.limit(2)],
    total: false,
  });
  return result.rows as AttachmentRow[];
}

async function listAllAttachmentRows(
  queries: string[]
): Promise<AttachmentRow[]> {
  const rows: AttachmentRow[] = [];
  let cursor: string | null = null;

  while (true) {
    const page = await getAppwriteTablesDB().listRows({
      databaseId: getAppwriteDatabaseId(),
      tableId: TABLE_ID,
      queries: [
        ...queries,
        Query.limit(100),
        ...(cursor ? [Query.cursorAfter(cursor)] : []),
      ],
      total: false,
    });
    const pageRows = page.rows as AttachmentRow[];
    rows.push(...pageRows);

    if (pageRows.length < 100) return rows;
    const nextCursor = pageRows[pageRows.length - 1]?.$id;
    if (!nextCursor || nextCursor === cursor) {
      throw new Error(
        "Appwrite telegram attachment pagination did not advance"
      );
    }
    cursor = nextCursor;
  }
}

export async function createTelegramAttachment(input: {
  telegramId: number;
  storageOrganizationId: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  uploadedByUserId: number;
}): Promise<void> {
  const now = new Date().toISOString();
  const id = randomInt(1, 281_474_976_710_655);

  await getAppwriteTablesDB().createRow({
    databaseId: getAppwriteDatabaseId(),
    tableId: TABLE_ID,
    rowId: randomUUID(),
    data: {
      id,
      telegramId: input.telegramId,
      storageOrganizationId: input.storageOrganizationId,
      storageKey: input.storageKey,
      originalName: input.originalName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      sha256: input.sha256,
      uploadedByUserId: input.uploadedByUserId,
      scanStatus: "unavailable",
      createdAt: now,
    },
  });
}

export async function getTelegramAttachmentById(
  id: number
): Promise<TelegramAttachmentRecord | null> {
  const rows = await listAttachmentRows([Query.equal("id", id)]);
  if (rows.length > 1) {
    throw new Error("Duplicate telegram attachment identifiers in Appwrite");
  }
  return rows[0] ? mapAttachment(rows[0]) : null;
}

export async function getTelegramAttachmentByStorageKey(
  storageKey: string
): Promise<TelegramAttachmentRecord | null> {
  const rows = await listAttachmentRows([
    Query.equal("storageKey", storageKey),
  ]);
  if (rows.length > 1) {
    throw new Error("Duplicate telegram attachment storage keys in Appwrite");
  }
  return rows[0] ? mapAttachment(rows[0]) : null;
}

export async function listTelegramAttachments(
  telegramId: number
): Promise<TelegramAttachmentRecord[]> {
  const rows = await listAllAttachmentRows([
    Query.equal("telegramId", telegramId),
    Query.orderDesc("createdAt"),
  ]);
  return rows.map(mapAttachment);
}
