import { randomInt, randomUUID } from "node:crypto";
import { Query } from "node-appwrite";
import {
  getAppwriteDatabaseId,
  getAppwriteTablesDB,
} from "../../_core/appwrite";
import {
  MOBILE_PUSH_TOKENS_TABLE,
  NOTIFICATIONS_TABLE,
} from "../../../shared/appwriteSchema";

export type NotificationRecord = {
  id: string;
  userId: number;
  organizationId: string;
  type: string;
  title: string;
  body: string;
  telegramId: number | null;
  routeId: number | null;
  readAt: string | null;
  createdAt: string;
};

type AppwriteRow = Record<string, unknown> & { $id: string };

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asIso(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function errorCode(error: unknown): number {
  return error && typeof error === "object" && "code" in error
    ? Number((error as { code?: unknown }).code)
    : 0;
}

function mapNotification(row: AppwriteRow): NotificationRecord {
  return {
    id: row.$id,
    userId: Number(row.userId),
    organizationId: asString(row.organizationId),
    type: asString(row.type, "general"),
    title: asString(row.title),
    body: asString(row.body),
    telegramId: asNullableNumber(row.telegramId),
    routeId: asNullableNumber(row.routeId),
    readAt: asIso(row.readAt),
    createdAt: asIso(row.createdAt) ?? new Date(0).toISOString(),
  };
}

export async function listNotifications(
  userId: number,
  options: { limit?: number; unreadOnly?: boolean } = {}
): Promise<NotificationRecord[]> {
  const queries = [
    Query.equal("userId", userId),
    Query.orderDesc("createdAt"),
    Query.limit(Math.min(200, Math.max(1, options.limit ?? 50))),
  ];
  if (options.unreadOnly) queries.splice(1, 0, Query.isNull("readAt"));
  const result = await getAppwriteTablesDB().listRows({
    databaseId: getAppwriteDatabaseId(),
    tableId: NOTIFICATIONS_TABLE,
    queries,
    total: false,
  });
  return (result.rows as AppwriteRow[]).map(mapNotification);
}

export async function countUnreadNotifications(
  userId: number
): Promise<number> {
  const result = await getAppwriteTablesDB().listRows({
    databaseId: getAppwriteDatabaseId(),
    tableId: NOTIFICATIONS_TABLE,
    queries: [
      Query.equal("userId", userId),
      Query.isNull("readAt"),
      Query.limit(1),
    ],
    total: true,
  });
  return result.total;
}

export async function markNotificationRead(
  userId: number,
  notificationId: string
): Promise<boolean> {
  const tables = getAppwriteTablesDB();
  const databaseId = getAppwriteDatabaseId();
  try {
    const row = await tables.getRow({
      databaseId,
      tableId: NOTIFICATIONS_TABLE,
      rowId: notificationId,
    });
    if (Number((row as AppwriteRow).userId) !== userId) return false;
    if (!asIso((row as AppwriteRow).readAt)) {
      await tables.updateRow({
        databaseId,
        tableId: NOTIFICATIONS_TABLE,
        rowId: notificationId,
        data: { readAt: new Date().toISOString() },
      });
    }
    return true;
  } catch (error) {
    if (errorCode(error) === 404) return false;
    throw error;
  }
}

export async function markAllNotificationsRead(
  userId: number
): Promise<number> {
  const tables = getAppwriteTablesDB();
  const databaseId = getAppwriteDatabaseId();
  const unread = await tables.listRows({
    databaseId,
    tableId: NOTIFICATIONS_TABLE,
    queries: [
      Query.equal("userId", userId),
      Query.isNull("readAt"),
      Query.limit(200),
    ],
    total: false,
  });
  const now = new Date().toISOString();
  let updated = 0;
  for (const row of unread.rows as AppwriteRow[]) {
    await tables.updateRow({
      databaseId,
      tableId: NOTIFICATIONS_TABLE,
      rowId: row.$id,
      data: { readAt: now },
    });
    updated += 1;
  }
  return updated;
}

async function listOrganizationUserIds(
  organizationId: string
): Promise<number[]> {
  const result = await getAppwriteTablesDB().listRows({
    databaseId: getAppwriteDatabaseId(),
    tableId: "users",
    queries: [
      Query.equal("organizationId", organizationId),
      Query.equal("isActive", true),
      Query.limit(200),
    ],
    total: false,
  });
  return (result.rows as AppwriteRow[])
    .map(row => Number(row.id))
    .filter(Number.isSafeInteger);
}

export async function notifyOrganization(input: {
  organizationId: string;
  type: string;
  title: string;
  body: string;
  telegramId?: number | null;
  routeId?: number | null;
  excludeUserId?: number;
}): Promise<number> {
  const userIds = await listOrganizationUserIds(input.organizationId);
  const tables = getAppwriteTablesDB();
  const databaseId = getAppwriteDatabaseId();
  const now = new Date().toISOString();
  let created = 0;
  for (const userId of userIds) {
    if (userId === input.excludeUserId) continue;
    await tables.createRow({
      databaseId,
      tableId: NOTIFICATIONS_TABLE,
      rowId: randomUUID(),
      data: {
        id: randomInt(1, 2_147_483_647),
        userId,
        organizationId: input.organizationId,
        type: input.type,
        title: input.title.slice(0, 255),
        body: input.body,
        telegramId: input.telegramId ?? null,
        routeId: input.routeId ?? null,
        readAt: null,
        createdAt: now,
      },
    });
    created += 1;
  }
  return created;
}

export async function registerMobilePushToken(input: {
  userId: number;
  organizationId: string;
  token: string;
  platform: string;
}): Promise<void> {
  const tables = getAppwriteTablesDB();
  const databaseId = getAppwriteDatabaseId();
  const now = new Date().toISOString();
  const existing = await tables.listRows({
    databaseId,
    tableId: MOBILE_PUSH_TOKENS_TABLE,
    queries: [Query.equal("token", input.token), Query.limit(2)],
    total: false,
  });
  const rows = existing.rows as AppwriteRow[];
  if (rows.length > 1) {
    throw new Error("Appwrite returned duplicate push tokens");
  }
  if (rows[0]) {
    await tables.updateRow({
      databaseId,
      tableId: MOBILE_PUSH_TOKENS_TABLE,
      rowId: rows[0].$id,
      data: {
        userId: input.userId,
        organizationId: input.organizationId,
        platform: input.platform,
        lastUsedAt: now,
        updatedAt: now,
      },
    });
    return;
  }
  await tables.createRow({
    databaseId,
    tableId: MOBILE_PUSH_TOKENS_TABLE,
    rowId: randomUUID(),
    data: {
      id: randomInt(1, 2_147_483_647),
      userId: input.userId,
      organizationId: input.organizationId,
      token: input.token,
      platform: input.platform,
      lastUsedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  });
}

export async function unregisterMobilePushToken(
  userId: number,
  token: string
): Promise<boolean> {
  const tables = getAppwriteTablesDB();
  const databaseId = getAppwriteDatabaseId();
  const existing = await tables.listRows({
    databaseId,
    tableId: MOBILE_PUSH_TOKENS_TABLE,
    queries: [Query.equal("token", token), Query.limit(2)],
    total: false,
  });
  const row = (existing.rows as AppwriteRow[])[0];
  if (!row || Number(row.userId) !== userId) return false;
  await tables.deleteRow({
    databaseId,
    tableId: MOBILE_PUSH_TOKENS_TABLE,
    rowId: row.$id,
  });
  return true;
}
