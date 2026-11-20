import { randomInt, randomUUID } from "node:crypto";
import { Operator, Query } from "node-appwrite";
import {
  getAppwriteDatabaseId,
  getAppwriteTablesDB,
} from "../../_core/appwrite";
import {
  DEPARTMENT_SETTINGS_TABLE,
  TELEGRAM_ACTIONS_TABLE,
  TELEGRAM_ATTACHMENTS_TABLE,
  TELEGRAM_ROUTES_TABLE,
  TELEGRAMS_TABLE,
  TELEGRAM_VERSIONS_TABLE,
} from "../../../shared/appwriteSchema";
import {
  buildTelegramSerialCode,
  canTransitionTelegram,
  computeTelegramStats,
  isTelegramStatus,
  requiresTransitionReason,
  telegramMatchesSearch,
  type DepartmentSettings,
  type TelegramActionRecord,
  type TelegramAttachmentRecord,
  type TelegramCategory,
  type TelegramClassification,
  type TelegramDirection,
  type TelegramListFilters,
  type TelegramListResult,
  type TelegramPriority,
  type TelegramRecord,
  type TelegramRouteApprovalStatus,
  type TelegramRouteRecord,
  type TelegramRouteStatus,
  type TelegramStatus,
  type TelegramVersionRecord,
} from "../../../shared/telegrams";
import { DEPARTMENT_SETTINGS_DEFAULTS } from "../../../shared/telegrams";

const COUNTERS_TABLE = "counters";
const MAX_SCAN_ROWS = 2000;
const PAGE_SIZE_DEFAULT = 25;

export class TelegramNotFoundError extends Error {
  constructor(message = "البرقية غير موجودة") {
    super(message);
    this.name = "TelegramNotFoundError";
  }
}

export class TelegramConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelegramConflictError";
  }
}

export class TelegramValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelegramValidationError";
  }
}

type AppwriteRow = Record<string, unknown> & {
  $id: string;
  $createdAt?: string;
  $updatedAt?: string;
};

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function errorCode(error: unknown): number {
  return error && typeof error === "object" && "code" in error
    ? Number((error as { code?: unknown }).code)
    : 0;
}

function asStatus(value: unknown): TelegramStatus {
  return isTelegramStatus(value) ? value : "draft";
}

export function mapTelegramRow(row: AppwriteRow): TelegramRecord {
  return {
    id: String(asNumber(row.id)),
    serialNumber: asNumber(row.serialNumber),
    serialCode: asString(row.serialCode),
    organizationSerialNumber: asNullableNumber(row.organizationSerialNumber),
    organizationSerialCode: asNullableString(row.organizationSerialCode),
    originalSerial: asNullableString(row.originalSerial),
    verificationToken: asString(row.verificationToken),
    telegramDate: isoOrNull(row.telegramDate),
    createdByUserId: asNumber(row.createdByUserId),
    organizationId: asString(row.organizationId),
    currentOrganizationId: asString(row.currentOrganizationId),
    subject: asString(row.subject),
    recipient: asString(row.recipient),
    body: asString(row.body),
    classification: (asString(row.classification, "normal") === "secret"
      ? "secret"
      : "normal") as TelegramClassification,
    priority: (["slow", "normal", "urgent"].includes(asString(row.priority))
      ? asString(row.priority)
      : "normal") as TelegramPriority,
    category: asString(row.category, "administrative") as TelegramCategory,
    status: asStatus(row.status),
    workflowReason: asNullableString(row.workflowReason),
    importNotes: asNullableString(row.importNotes),
    importDirection:
      (asNullableString(row.importDirection) as TelegramDirection | null) ??
      null,
    attachmentManifest: asNullableString(row.attachmentManifest),
    gpsLatitude: asNullableString(row.gpsLatitude),
    gpsLongitude: asNullableString(row.gpsLongitude),
    creatorName: asString(row.creatorName, "مستخدم"),
    creatorEmail: asNullableString(row.creatorEmail),
    creatorBadgeId: asNullableString(row.creatorBadgeId),
    creatorIp: asNullableString(row.creatorIp),
    creatorFingerprint: asNullableString(row.creatorFingerprint),
    revision: asNumber(row.revision, 1),
    archivedAt: isoOrNull(row.archivedAt),
    closedAt: isoOrNull(row.closedAt),
    createdAt: isoOrNull(row.createdAt) ?? new Date(0).toISOString(),
    updatedAt: isoOrNull(row.updatedAt) ?? new Date(0).toISOString(),
  };
}

async function findRowByColumn(
  tableId: string,
  column: string,
  value: string | number,
  transactionId?: string
): Promise<AppwriteRow | null> {
  const result = await getAppwriteTablesDB().listRows({
    databaseId: getAppwriteDatabaseId(),
    tableId,
    queries: [Query.equal(column, value), Query.limit(2)],
    total: false,
    ...(transactionId ? { transactionId } : {}),
  });
  const rows = result.rows as AppwriteRow[];
  if (rows.length > 1) {
    throw new Error(
      `Appwrite returned duplicate rows for ${tableId}.${column}`
    );
  }
  return rows[0] ?? null;
}

async function getTelegramRowById(
  telegramId: number,
  transactionId?: string
): Promise<AppwriteRow | null> {
  return findRowByColumn(TELEGRAMS_TABLE, "id", telegramId, transactionId);
}

/** Allocates the next value of a named counter atomically. */
export async function allocateCounter(key: string): Promise<number> {
  const tables = getAppwriteTablesDB();
  const databaseId = getAppwriteDatabaseId();
  const rowId = `counter-${key.replace(/[^A-Za-z0-9_-]/g, "-")}`;
  const now = new Date().toISOString();

  const increment = async () => {
    const updated = await tables.updateRow({
      databaseId,
      tableId: COUNTERS_TABLE,
      rowId,
      data: { value: Operator.increment(1), updatedAt: now },
    });
    const value = asNumber(updated.value);
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`Counter ${key} returned an invalid value`);
    }
    return value;
  };

  try {
    return await increment();
  } catch (error) {
    if (errorCode(error) !== 404) throw error;
    try {
      await tables.createRow({
        databaseId,
        tableId: COUNTERS_TABLE,
        rowId,
        data: { key, value: 0, updatedAt: now },
      });
    } catch (createError) {
      if (errorCode(createError) !== 409) throw createError;
    }
    return increment();
  }
}

async function allocateOrganizationSerial(
  organizationId: string,
  direction: "outgoing" | "incoming"
): Promise<number> {
  const settings = await ensureDepartmentSettings(organizationId);
  const column =
    direction === "outgoing" ? "nextOutgoingSerial" : "nextIncomingSerial";
  const updated = await getAppwriteTablesDB().updateRow({
    databaseId: getAppwriteDatabaseId(),
    tableId: DEPARTMENT_SETTINGS_TABLE,
    rowId: `settings-${organizationId}`,
    data: {
      [column]: Operator.increment(1),
      updatedAt: new Date().toISOString(),
    },
  });
  const next = asNumber(updated[column]);
  if (!Number.isSafeInteger(next) || next < 2) {
    throw new Error("Organization serial counter returned an invalid value");
  }
  // The column stores the *next* serial to hand out. Incrementing it returns
  // that next value, so the serial reserved by this call is `next - 1`.
  void settings;
  return next - 1;
}

export function mapDepartmentSettingsRow(row: AppwriteRow): DepartmentSettings {
  const timeFormat = asString(row.timeFormat, "24") === "12" ? "12" : "24";
  return {
    organizationId: asString(row.organizationId),
    departmentName: asString(
      row.departmentName,
      DEPARTMENT_SETTINGS_DEFAULTS.departmentName
    ),
    unitName: asString(row.unitName, DEPARTMENT_SETTINGS_DEFAULTS.unitName),
    unitChiefRank: asString(
      row.unitChiefRank,
      DEPARTMENT_SETTINGS_DEFAULTS.unitChiefRank
    ),
    unitChiefName: asString(
      row.unitChiefName,
      DEPARTMENT_SETTINGS_DEFAULTS.unitChiefName
    ),
    serialPrefix: asString(
      row.serialPrefix,
      DEPARTMENT_SETTINGS_DEFAULTS.serialPrefix
    ),
    incomingSerialPrefix: asString(
      row.incomingSerialPrefix,
      DEPARTMENT_SETTINGS_DEFAULTS.incomingSerialPrefix
    ),
    serialStart: asNumber(
      row.serialStart,
      DEPARTMENT_SETTINGS_DEFAULTS.serialStart
    ),
    incomingSerialStart: asNumber(
      row.incomingSerialStart,
      DEPARTMENT_SETTINGS_DEFAULTS.incomingSerialStart
    ),
    nextOutgoingSerial: asNumber(
      row.nextOutgoingSerial,
      DEPARTMENT_SETTINGS_DEFAULTS.nextOutgoingSerial
    ),
    nextIncomingSerial: asNumber(
      row.nextIncomingSerial,
      DEPARTMENT_SETTINGS_DEFAULTS.nextIncomingSerial
    ),
    timezone: asString(row.timezone, DEPARTMENT_SETTINGS_DEFAULTS.timezone),
    dateFormat: asString(
      row.dateFormat,
      DEPARTMENT_SETTINGS_DEFAULTS.dateFormat
    ),
    timeFormat,
    numberSystem:
      asString(row.numberSystem, "latin") === "arabic" ? "arabic" : "latin",
    showVerificationQr: asBoolean(row.showVerificationQr, true),
    logoUrl: asNullableString(row.logoUrl),
    updatedByUserId: asNullableNumber(row.updatedByUserId),
    createdAt: isoOrNull(row.createdAt) ?? new Date(0).toISOString(),
    updatedAt: isoOrNull(row.updatedAt) ?? new Date(0).toISOString(),
  };
}

export async function getDepartmentSettings(
  organizationId: string
): Promise<DepartmentSettings | null> {
  const row = await findRowByColumn(
    DEPARTMENT_SETTINGS_TABLE,
    "organizationId",
    organizationId
  );
  return row ? mapDepartmentSettingsRow(row) : null;
}

/** Reads the settings row, creating it with defaults when it does not exist. */
export async function ensureDepartmentSettings(
  organizationId: string
): Promise<DepartmentSettings> {
  const existing = await getDepartmentSettings(organizationId);
  if (existing) return existing;

  const now = new Date().toISOString();
  const data = {
    organizationId,
    ...DEPARTMENT_SETTINGS_DEFAULTS,
    updatedByUserId: null,
    createdAt: now,
    updatedAt: now,
  };
  try {
    const created = await getAppwriteTablesDB().createRow({
      databaseId: getAppwriteDatabaseId(),
      tableId: DEPARTMENT_SETTINGS_TABLE,
      rowId: `settings-${organizationId}`,
      data,
    });
    return mapDepartmentSettingsRow(created as AppwriteRow);
  } catch (error) {
    if (errorCode(error) !== 409) throw error;
    const raced = await getDepartmentSettings(organizationId);
    if (!raced) throw error;
    return raced;
  }
}

export async function updateDepartmentSettings(
  organizationId: string,
  input: Omit<
    DepartmentSettings,
    "organizationId" | "createdAt" | "updatedAt" | "updatedByUserId"
  >,
  updatedByUserId: number
): Promise<DepartmentSettings> {
  await ensureDepartmentSettings(organizationId);
  const updated = await getAppwriteTablesDB().updateRow({
    databaseId: getAppwriteDatabaseId(),
    tableId: DEPARTMENT_SETTINGS_TABLE,
    rowId: `settings-${organizationId}`,
    data: {
      ...input,
      updatedByUserId,
      updatedAt: new Date().toISOString(),
    },
  });
  return mapDepartmentSettingsRow(updated as AppwriteRow);
}

export type CreateTelegramInput = {
  subject: string;
  recipient: string;
  body: string;
  classification: TelegramClassification;
  priority: TelegramPriority;
  category: TelegramCategory;
  idempotencyKey?: string | null;
  attachmentManifest?: string | null;
  gpsLatitude?: string | null;
  gpsLongitude?: string | null;
  originalSerial?: string | null;
  telegramDate?: string | null;
  importNotes?: string | null;
  importDirection?: TelegramDirection | null;
  requestedOrganizationSerialNumber?: number | null;
  organizationId: string;
  createdByUserId: number;
  creatorName: string;
  creatorEmail: string | null;
  creatorBadgeId: string | null;
  creatorIp: string | null;
  creatorFingerprint: string | null;
  status?: TelegramStatus;
};

function telegramRowData(record: {
  id: number;
  serialNumber: number;
  serialCode: string;
  organizationSerialNumber: number | null;
  organizationSerialCode: string | null;
  originalSerial: string | null;
  verificationToken: string;
  telegramDate: string | null;
  createdByUserId: number;
  organizationId: string;
  currentOrganizationId: string;
  subject: string;
  recipient: string;
  body: string;
  classification: TelegramClassification;
  priority: TelegramPriority;
  category: TelegramCategory;
  status: TelegramStatus;
  workflowReason: string | null;
  importNotes: string | null;
  importDirection: TelegramDirection | null;
  attachmentManifest: string | null;
  gpsLatitude: string | null;
  gpsLongitude: string | null;
  creatorName: string;
  creatorEmail: string | null;
  creatorBadgeId: string | null;
  creatorIp: string | null;
  creatorFingerprint: string | null;
  idempotencyKey: string | null;
  revision: number;
  archivedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}): Record<string, unknown> {
  return { ...record };
}

export async function getTelegramByIdempotencyKey(
  key: string
): Promise<TelegramRecord | null> {
  const row = await findRowByColumn(TELEGRAMS_TABLE, "idempotencyKey", key);
  return row ? mapTelegramRow(row) : null;
}

export async function getTelegramById(
  telegramId: number
): Promise<TelegramRecord | null> {
  const row = await getTelegramRowById(telegramId);
  return row ? mapTelegramRow(row) : null;
}

export async function createTelegram(
  input: CreateTelegramInput
): Promise<TelegramRecord> {
  const settings = await ensureDepartmentSettings(input.organizationId);
  const now = new Date();
  const nowIso = now.toISOString();

  const organizationSerialNumber =
    input.requestedOrganizationSerialNumber ??
    (await allocateOrganizationSerial(input.organizationId, "outgoing"));
  if (
    input.requestedOrganizationSerialNumber &&
    input.requestedOrganizationSerialNumber > 0
  ) {
    // A requested serial is reserved by moving the counter past it so a later
    // automatic allocation cannot reuse the same number.
    const settingsRow = await ensureDepartmentSettings(input.organizationId);
    if (
      input.requestedOrganizationSerialNumber >= settingsRow.nextOutgoingSerial
    ) {
      await getAppwriteTablesDB().updateRow({
        databaseId: getAppwriteDatabaseId(),
        tableId: DEPARTMENT_SETTINGS_TABLE,
        rowId: `settings-${input.organizationId}`,
        data: {
          nextOutgoingSerial: input.requestedOrganizationSerialNumber + 1,
          updatedAt: nowIso,
        },
      });
    }
    const duplicate = await findRowByColumn(
      TELEGRAMS_TABLE,
      "organizationSerialNumber",
      input.requestedOrganizationSerialNumber
    );
    if (
      duplicate &&
      asString(duplicate.organizationId) === input.organizationId
    ) {
      throw new TelegramConflictError(
        "رقم البرقية المحدد مستخدم بالفعل لهذه الجهة. اختر رقمًا آخر."
      );
    }
  }

  const serialNumber = await allocateCounter("telegram:serial");
  const id = await allocateCounter("telegram:id");
  const serialCode = buildTelegramSerialCode({
    serialPrefix: settings.serialPrefix,
    date: now,
    serialNumber,
    timeZone: settings.timezone,
  });
  const organizationSerialCode = buildTelegramSerialCode({
    serialPrefix: settings.serialPrefix,
    date: now,
    serialNumber: organizationSerialNumber,
    timeZone: settings.timezone,
  });

  const data = telegramRowData({
    id,
    serialNumber,
    serialCode,
    organizationSerialNumber,
    organizationSerialCode,
    originalSerial: input.originalSerial?.trim() || null,
    verificationToken: randomUUID(),
    telegramDate: input.telegramDate ?? null,
    createdByUserId: input.createdByUserId,
    organizationId: input.organizationId,
    currentOrganizationId: input.organizationId,
    subject: input.subject,
    recipient: input.recipient,
    body: input.body,
    classification: input.classification,
    priority: input.priority,
    category: input.category,
    status: input.status ?? "draft",
    workflowReason: null,
    importNotes: input.importNotes ?? null,
    importDirection: input.importDirection ?? null,
    attachmentManifest: input.attachmentManifest ?? null,
    gpsLatitude: input.gpsLatitude ?? null,
    gpsLongitude: input.gpsLongitude ?? null,
    creatorName: input.creatorName,
    creatorEmail: input.creatorEmail,
    creatorBadgeId: input.creatorBadgeId,
    creatorIp: input.creatorIp,
    creatorFingerprint: input.creatorFingerprint,
    idempotencyKey: input.idempotencyKey ?? null,
    revision: 1,
    archivedAt: null,
    closedAt: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  const created = await getAppwriteTablesDB().createRow({
    databaseId: getAppwriteDatabaseId(),
    tableId: TELEGRAMS_TABLE,
    rowId: randomUUID(),
    data,
  });
  return mapTelegramRow(created as AppwriteRow);
}

export async function listTelegramRows(
  organizationIds: readonly string[] | null,
  filters: TelegramListFilters
): Promise<TelegramRecord[]> {
  const queries: string[] = [];
  if (organizationIds) {
    if (organizationIds.length === 0) return [];
    queries.push(Query.equal("currentOrganizationId", [...organizationIds]));
  }
  if (filters.status) queries.push(Query.equal("status", filters.status));
  if (filters.classification) {
    queries.push(Query.equal("classification", filters.classification));
  }
  if (filters.priority) queries.push(Query.equal("priority", filters.priority));
  if (filters.category) queries.push(Query.equal("category", filters.category));
  if (filters.from)
    queries.push(Query.greaterThanEqual("createdAt", filters.from));
  if (filters.to) queries.push(Query.lessThanEqual("createdAt", filters.to));
  queries.push(Query.orderDesc("createdAt"));
  queries.push(Query.limit(MAX_SCAN_ROWS));

  const result = await getAppwriteTablesDB().listRows({
    databaseId: getAppwriteDatabaseId(),
    tableId: TELEGRAMS_TABLE,
    queries,
    total: true,
  });
  return (result.rows as AppwriteRow[]).map(mapTelegramRow);
}

function matchesDirection(
  record: TelegramRecord,
  direction: TelegramDirection | undefined
): boolean {
  if (!direction) return true;
  if (direction === "outgoing")
    return record.organizationId === record.currentOrganizationId;
  return record.organizationId !== record.currentOrganizationId;
}

export async function listTelegrams(
  organizationIds: readonly string[] | null,
  filters: TelegramListFilters
): Promise<TelegramListResult> {
  const rows = await listTelegramRows(organizationIds, filters);
  const filtered = rows.filter(
    row =>
      matchesDirection(row, filters.direction) &&
      (!filters.search || telegramMatchesSearch(row, filters.search))
  );
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(
    100,
    Math.max(1, filters.pageSize ?? PAGE_SIZE_DEFAULT)
  );
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);
  return {
    items,
    total: filtered.length,
    page,
    pageSize,
    hasNext: start + pageSize < filtered.length,
    stats: computeTelegramStats(filtered),
  };
}

export async function countTelegramsByOrganization(
  organizationId: string
): Promise<number> {
  const result = await getAppwriteTablesDB().listRows({
    databaseId: getAppwriteDatabaseId(),
    tableId: TELEGRAMS_TABLE,
    queries: [
      Query.equal("currentOrganizationId", organizationId),
      Query.limit(1),
    ],
    total: true,
  });
  return result.total;
}

export type UpdateTelegramInput = {
  originalSerial?: string | null;
  subject: string;
  recipient: string;
  body: string;
  classification: TelegramClassification;
  priority: TelegramPriority;
  category: TelegramCategory;
  status?: TelegramStatus;
  attachmentManifest?: string | null;
  gpsLatitude?: string | null;
  gpsLongitude?: string | null;
  telegramDate?: string | null;
};

export async function updateTelegram(
  telegramId: number,
  expectedRevision: number,
  input: UpdateTelegramInput
): Promise<TelegramRecord> {
  const tables = getAppwriteTablesDB();
  const databaseId = getAppwriteDatabaseId();
  const existing = await getTelegramRowById(telegramId);
  if (!existing) throw new TelegramNotFoundError();
  const current = mapTelegramRow(existing);
  if (current.revision !== expectedRevision) {
    throw new TelegramConflictError(
      `تعارض مزامنة: الإصدار الحالي هو ${current.revision}. أعد تحميل البرقية ثم أعد المحاولة.`
    );
  }
  if (!["draft", "returned"].includes(current.status)) {
    throw new TelegramConflictError(
      "لا يمكن تعديل برقية بعد إرسالها للمراجعة. أعدها للتعديل أولاً."
    );
  }

  const updated = await tables.updateRow({
    databaseId,
    tableId: TELEGRAMS_TABLE,
    rowId: existing.$id,
    data: {
      originalSerial: input.originalSerial?.trim() || null,
      subject: input.subject,
      recipient: input.recipient,
      body: input.body,
      classification: input.classification,
      priority: input.priority,
      category: input.category,
      attachmentManifest: input.attachmentManifest ?? null,
      gpsLatitude: input.gpsLatitude ?? null,
      gpsLongitude: input.gpsLongitude ?? null,
      telegramDate: input.telegramDate ?? null,
      revision: current.revision + 1,
      updatedAt: new Date().toISOString(),
    },
  });
  return mapTelegramRow(updated as AppwriteRow);
}

export async function setTelegramStatusAfterRoute(
  telegramId: number,
  status: TelegramStatus,
  currentOrganizationId: string
): Promise<void> {
  const row = await getTelegramRowById(telegramId);
  if (!row) throw new TelegramNotFoundError();
  const current = mapTelegramRow(row);
  await getAppwriteTablesDB().updateRow({
    databaseId: getAppwriteDatabaseId(),
    tableId: TELEGRAMS_TABLE,
    rowId: row.$id,
    data: {
      status,
      currentOrganizationId,
      revision: current.revision + 1,
      updatedAt: new Date().toISOString(),
    },
  });
}

export async function transitionTelegram(input: {
  telegramId: number;
  actorUserId: number;
  toStatus: TelegramStatus;
  reason: string | null;
  expectedRevision?: number;
  actorName: string;
}): Promise<TelegramRecord> {
  const tables = getAppwriteTablesDB();
  const databaseId = getAppwriteDatabaseId();
  const transaction = await tables.createTransaction({ ttl: 60 });
  try {
    const row = await getTelegramRowById(input.telegramId, transaction.$id);
    if (!row) throw new TelegramNotFoundError();
    const current = mapTelegramRow(row);
    if (
      input.expectedRevision !== undefined &&
      current.revision !== input.expectedRevision
    ) {
      throw new TelegramConflictError(
        `تعارض مزامنة: الإصدار الحالي هو ${current.revision}. أعد تحميل البرقية ثم أعد المحاولة.`
      );
    }
    if (!canTransitionTelegram(current.status, input.toStatus)) {
      throw new TelegramValidationError(
        `الانتقال من «${current.status}» إلى «${input.toStatus}» غير مسموح.`
      );
    }
    const reason = input.reason?.trim() || null;
    if (requiresTransitionReason(input.toStatus) && !reason) {
      throw new TelegramValidationError("يجب إدخال سبب عند الإعادة أو الرفض.");
    }

    const now = new Date().toISOString();
    const closedAt = ["completed", "archived", "rejected"].includes(
      input.toStatus
    )
      ? now
      : null;
    const archivedAt = input.toStatus === "archived" ? now : current.archivedAt;

    const updated = await tables.updateRow({
      databaseId,
      tableId: TELEGRAMS_TABLE,
      rowId: row.$id,
      transactionId: transaction.$id,
      data: {
        status: input.toStatus,
        workflowReason: reason,
        closedAt,
        archivedAt,
        revision: current.revision + 1,
        updatedAt: now,
      },
    });

    await tables.createRow({
      databaseId,
      tableId: TELEGRAM_ACTIONS_TABLE,
      rowId: randomUUID(),
      transactionId: transaction.$id,
      data: {
        id: randomInt(1, 2_147_483_647),
        telegramId: input.telegramId,
        actorUserId: input.actorUserId,
        action: "status.transition",
        fromStatus: current.status,
        toStatus: input.toStatus,
        reason,
        metadata: JSON.stringify({
          serialCode: current.serialCode,
          actorName: input.actorName,
        }),
        createdAt: now,
      },
    });

    await tables.createRow({
      databaseId,
      tableId: TELEGRAM_VERSIONS_TABLE,
      rowId: randomUUID(),
      transactionId: transaction.$id,
      data: {
        id: randomInt(1, 2_147_483_647),
        telegramId: input.telegramId,
        versionNumber: current.revision + 1,
        changedByUserId: input.actorUserId,
        changeReason: `تغيير الحالة إلى ${input.toStatus}`,
        snapshot: JSON.stringify({
          ...current,
          status: input.toStatus,
          workflowReason: reason,
          revision: current.revision + 1,
        }),
        createdAt: now,
      },
    });

    await tables.updateTransaction({
      transactionId: transaction.$id,
      commit: true,
    });
    return mapTelegramRow(updated as AppwriteRow);
  } catch (error) {
    try {
      await tables.updateTransaction({
        transactionId: transaction.$id,
        rollback: true,
      });
    } catch {
      // Preserve the original error when the transaction already expired.
    }
    if (errorCode(error) === 409 && !(error instanceof TelegramConflictError)) {
      throw new TelegramConflictError(
        "تعارض مزامنة: تغيّرت البرقية على الخادم. أعد تحميلها ثم أعد تنفيذ الإجراء."
      );
    }
    throw error;
  }
}

export async function deleteTelegramPermanently(
  telegramId: number
): Promise<{ storageKeys: string[] }> {
  const tables = getAppwriteTablesDB();
  const databaseId = getAppwriteDatabaseId();
  const row = await getTelegramRowById(telegramId);
  if (!row) throw new TelegramNotFoundError();

  const attachments = await tables.listRows({
    databaseId,
    tableId: TELEGRAM_ATTACHMENTS_TABLE,
    queries: [Query.equal("telegramId", telegramId), Query.limit(100)],
    total: false,
  });
  const storageKeys = (attachments.rows as AppwriteRow[])
    .map(item => asString(item.storageKey))
    .filter(Boolean);

  const dependentTables = [
    TELEGRAM_ACTIONS_TABLE,
    TELEGRAM_VERSIONS_TABLE,
    TELEGRAM_ATTACHMENTS_TABLE,
    TELEGRAM_ROUTES_TABLE,
  ];
  for (const tableId of dependentTables) {
    const rows = await tables.listRows({
      databaseId,
      tableId,
      queries: [Query.equal("telegramId", telegramId), Query.limit(500)],
      total: false,
    });
    for (const dependent of rows.rows as AppwriteRow[]) {
      await tables.deleteRow({
        databaseId,
        tableId,
        rowId: dependent.$id,
      });
    }
  }
  await tables.deleteRow({
    databaseId,
    tableId: TELEGRAMS_TABLE,
    rowId: row.$id,
  });
  return { storageKeys };
}

/** Updates only the optimistic-concurrency revision of a telegram. */
export async function setTelegramRevision(
  telegramId: number,
  revision: number
): Promise<void> {
  const row = await getTelegramRowById(telegramId);
  if (!row) throw new TelegramNotFoundError();
  await getAppwriteTablesDB().updateRow({
    databaseId: getAppwriteDatabaseId(),
    tableId: TELEGRAMS_TABLE,
    rowId: row.$id,
    data: { revision, updatedAt: new Date().toISOString() },
  });
}

export async function listTelegramVersions(
  telegramId: number
): Promise<TelegramVersionRecord[]> {
  const result = await getAppwriteTablesDB().listRows({
    databaseId: getAppwriteDatabaseId(),
    tableId: TELEGRAM_VERSIONS_TABLE,
    queries: [
      Query.equal("telegramId", telegramId),
      Query.orderDesc("versionNumber"),
      Query.limit(100),
    ],
    total: false,
  });
  return (result.rows as AppwriteRow[]).map(row => ({
    id: row.$id,
    telegramId: String(asNumber(row.telegramId)),
    versionNumber: asNumber(row.versionNumber),
    changedByUserId: asNumber(row.changedByUserId),
    changedByName: null,
    changeReason: asString(row.changeReason),
    snapshot: parseJsonObject(row.snapshot) ?? {},
    createdAt: isoOrNull(row.createdAt) ?? new Date(0).toISOString(),
  }));
}

export async function listTelegramActions(
  telegramId: number
): Promise<TelegramActionRecord[]> {
  const result = await getAppwriteTablesDB().listRows({
    databaseId: getAppwriteDatabaseId(),
    tableId: TELEGRAM_ACTIONS_TABLE,
    queries: [
      Query.equal("telegramId", telegramId),
      Query.orderDesc("createdAt"),
      Query.limit(200),
    ],
    total: false,
  });
  return (result.rows as AppwriteRow[]).map(row => ({
    id: row.$id,
    telegramId: String(asNumber(row.telegramId)),
    actorUserId: asNumber(row.actorUserId),
    actorName: null,
    action: asString(row.action),
    fromStatus: isTelegramStatus(row.fromStatus) ? row.fromStatus : null,
    toStatus: isTelegramStatus(row.toStatus) ? row.toStatus : null,
    reason: asNullableString(row.reason),
    metadata: parseJsonObject(row.metadata),
    createdAt: isoOrNull(row.createdAt) ?? new Date(0).toISOString(),
  }));
}

export async function recordTelegramVersion(input: {
  telegramId: number;
  versionNumber: number;
  changedByUserId: number;
  changeReason: string;
  snapshot: unknown;
}): Promise<void> {
  await getAppwriteTablesDB().createRow({
    databaseId: getAppwriteDatabaseId(),
    tableId: TELEGRAM_VERSIONS_TABLE,
    rowId: randomUUID(),
    data: {
      id: randomInt(1, 2_147_483_647),
      telegramId: input.telegramId,
      versionNumber: input.versionNumber,
      changedByUserId: input.changedByUserId,
      changeReason: input.changeReason,
      snapshot: JSON.stringify(input.snapshot),
      createdAt: new Date().toISOString(),
    },
  });
}

export async function recordTelegramAction(input: {
  telegramId: number;
  actorUserId: number;
  action: string;
  fromStatus?: TelegramStatus | null;
  toStatus?: TelegramStatus | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  await getAppwriteTablesDB().createRow({
    databaseId: getAppwriteDatabaseId(),
    tableId: TELEGRAM_ACTIONS_TABLE,
    rowId: randomUUID(),
    data: {
      id: randomInt(1, 2_147_483_647),
      telegramId: input.telegramId,
      actorUserId: input.actorUserId,
      action: input.action,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      reason: input.reason ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      createdAt: new Date().toISOString(),
    },
  });
}

export function mapAttachmentRow(row: AppwriteRow): TelegramAttachmentRecord {
  return {
    id: row.$id,
    telegramId: String(asNumber(row.telegramId)),
    originalName: asString(row.originalName),
    mimeType: asString(row.mimeType, "application/octet-stream"),
    sizeBytes: asNumber(row.sizeBytes),
    sha256: asString(row.sha256),
    storageKey: asString(row.storageKey),
    uploadedByUserId: asNumber(row.uploadedByUserId),
    scanStatus: asString(row.scanStatus, "pending"),
    createdAt: isoOrNull(row.createdAt) ?? new Date(0).toISOString(),
  };
}

export async function listTelegramAttachments(
  telegramId: number
): Promise<TelegramAttachmentRecord[]> {
  const result = await getAppwriteTablesDB().listRows({
    databaseId: getAppwriteDatabaseId(),
    tableId: TELEGRAM_ATTACHMENTS_TABLE,
    queries: [
      Query.equal("telegramId", telegramId),
      Query.orderDesc("createdAt"),
      Query.limit(100),
    ],
    total: false,
  });
  return (result.rows as AppwriteRow[]).map(mapAttachmentRow);
}

export async function getTelegramAttachment(
  attachmentId: string
): Promise<TelegramAttachmentRecord | null> {
  try {
    const row = await getAppwriteTablesDB().getRow({
      databaseId: getAppwriteDatabaseId(),
      tableId: TELEGRAM_ATTACHMENTS_TABLE,
      rowId: attachmentId,
    });
    return mapAttachmentRow(row as AppwriteRow);
  } catch (error) {
    if (errorCode(error) === 404) return null;
    throw error;
  }
}

export async function createTelegramAttachment(input: {
  telegramId: number;
  storageKey: string;
  storageOrganizationId: string | null;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  uploadedByUserId: number;
  scanStatus?: string;
}): Promise<TelegramAttachmentRecord> {
  const created = await getAppwriteTablesDB().createRow({
    databaseId: getAppwriteDatabaseId(),
    tableId: TELEGRAM_ATTACHMENTS_TABLE,
    rowId: randomUUID(),
    data: {
      id: randomInt(1, 2_147_483_647),
      telegramId: input.telegramId,
      storageKey: input.storageKey,
      storageOrganizationId: input.storageOrganizationId,
      originalName: input.originalName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      sha256: input.sha256,
      uploadedByUserId: input.uploadedByUserId,
      scanStatus: input.scanStatus ?? "pending",
      createdAt: new Date().toISOString(),
    },
  });
  return mapAttachmentRow(created as AppwriteRow);
}

export function mapRouteRow(row: AppwriteRow): TelegramRouteRecord {
  return {
    id: row.$id,
    telegramId: String(asNumber(row.telegramId)),
    fromOrganizationId: asString(row.fromOrganizationId),
    fromOrganizationName: null,
    toOrganizationId: asString(row.toOrganizationId),
    toOrganizationName: null,
    forwardedByUserId: asNumber(row.forwardedByUserId),
    status: (asString(row.status, "sent") as TelegramRouteStatus) || "sent",
    approvalStatus:
      (asString(
        row.approvalStatus,
        "not_required"
      ) as TelegramRouteApprovalStatus) || "not_required",
    approvedByUserId: asNullableNumber(row.approvedByUserId),
    approvedAt: isoOrNull(row.approvedAt),
    approvalReason: asNullableString(row.approvalReason),
    receiverDecisionStatus:
      (asString(
        row.receiverDecisionStatus,
        "pending"
      ) as TelegramRouteRecord["receiverDecisionStatus"]) || "pending",
    receiverDecisionByUserId: asNullableNumber(row.receiverDecisionByUserId),
    receiverDecisionAt: isoOrNull(row.receiverDecisionAt),
    receiverDecisionReason: asNullableString(row.receiverDecisionReason),
    routeSerialNumber: asNullableNumber(row.routeSerialNumber),
    routeSerialCode: asNullableString(row.routeSerialCode),
    incomingSerialNumber: asNullableNumber(row.incomingSerialNumber),
    incomingSerialCode: asNullableString(row.incomingSerialCode),
    note: asNullableString(row.note),
    createdAt: isoOrNull(row.createdAt) ?? new Date(0).toISOString(),
    receivedAt: isoOrNull(row.receivedAt),
    completedAt: isoOrNull(row.completedAt),
  };
}

export async function listTelegramRoutes(
  telegramId: number
): Promise<TelegramRouteRecord[]> {
  const result = await getAppwriteTablesDB().listRows({
    databaseId: getAppwriteDatabaseId(),
    tableId: TELEGRAM_ROUTES_TABLE,
    queries: [
      Query.equal("telegramId", telegramId),
      Query.orderDesc("createdAt"),
      Query.limit(100),
    ],
    total: false,
  });
  return (result.rows as AppwriteRow[]).map(mapRouteRow);
}

export async function listIncomingRoutes(
  organizationId: string
): Promise<TelegramRouteRecord[]> {
  const result = await getAppwriteTablesDB().listRows({
    databaseId: getAppwriteDatabaseId(),
    tableId: TELEGRAM_ROUTES_TABLE,
    queries: [
      Query.equal("toOrganizationId", organizationId),
      Query.orderDesc("createdAt"),
      Query.limit(200),
    ],
    total: false,
  });
  return (result.rows as AppwriteRow[]).map(mapRouteRow);
}

export async function createTelegramRoute(input: {
  telegramId: number;
  fromOrganizationId: string;
  toOrganizationId: string;
  forwardedByUserId: number;
  approvalStatus: TelegramRouteApprovalStatus;
  status?: TelegramRouteStatus;
  routeSerialNumber: number | null;
  routeSerialCode: string | null;
  note: string | null;
}): Promise<TelegramRouteRecord> {
  const created = await getAppwriteTablesDB().createRow({
    databaseId: getAppwriteDatabaseId(),
    tableId: TELEGRAM_ROUTES_TABLE,
    rowId: randomUUID(),
    data: {
      id: randomInt(1, 2_147_483_647),
      telegramId: input.telegramId,
      fromOrganizationId: input.fromOrganizationId,
      toOrganizationId: input.toOrganizationId,
      forwardedByUserId: input.forwardedByUserId,
      status: input.status ?? "sent",
      approvalStatus: input.approvalStatus,
      approvedByUserId: null,
      approvedAt: null,
      approvalReason: null,
      receiverDecisionStatus: "pending",
      receiverDecisionByUserId: null,
      receiverDecisionAt: null,
      receiverDecisionReason: null,
      routeSerialNumber: input.routeSerialNumber,
      routeSerialCode: input.routeSerialCode,
      incomingSerialNumber: null,
      incomingSerialCode: null,
      note: input.note,
      createdAt: new Date().toISOString(),
      receivedAt: null,
      completedAt: null,
    },
  });
  return mapRouteRow(created as AppwriteRow);
}

export async function updateTelegramRoute(
  routeId: string,
  data: Record<string, unknown>
): Promise<TelegramRouteRecord> {
  const updated = await getAppwriteTablesDB().updateRow({
    databaseId: getAppwriteDatabaseId(),
    tableId: TELEGRAM_ROUTES_TABLE,
    rowId: routeId,
    data,
  });
  return mapRouteRow(updated as AppwriteRow);
}

export async function getTelegramRoute(
  routeId: string
): Promise<TelegramRouteRecord | null> {
  try {
    const row = await getAppwriteTablesDB().getRow({
      databaseId: getAppwriteDatabaseId(),
      tableId: TELEGRAM_ROUTES_TABLE,
      rowId: routeId,
    });
    return mapRouteRow(row as AppwriteRow);
  } catch (error) {
    if (errorCode(error) === 404) return null;
    throw error;
  }
}

export async function findTelegramByOfficialSerial(input: {
  organizationId: string;
  serial: string;
  direction: TelegramDirection;
}): Promise<TelegramRecord | null> {
  const rows = await getAppwriteTablesDB().listRows({
    databaseId: getAppwriteDatabaseId(),
    tableId: TELEGRAMS_TABLE,
    queries: [
      Query.equal("organizationId", input.organizationId),
      Query.orderDesc("createdAt"),
      Query.limit(MAX_SCAN_ROWS),
    ],
    total: false,
  });
  const target = input.serial.trim();
  const match = (rows.rows as AppwriteRow[]).map(mapTelegramRow).find(row => {
    const serial =
      row.originalSerial?.trim() ||
      row.organizationSerialCode?.split("-").at(-1) ||
      String(row.organizationSerialNumber ?? "");
    const direction: TelegramDirection =
      row.organizationId === row.currentOrganizationId
        ? "outgoing"
        : "incoming";
    return serial === target && direction === input.direction;
  });
  return match ?? null;
}

export async function allocateIncomingSerial(
  organizationId: string
): Promise<{ serialNumber: number; serialCode: string }> {
  const settings = await ensureDepartmentSettings(organizationId);
  const serialNumber = await allocateOrganizationSerial(
    organizationId,
    "incoming"
  );
  return {
    serialNumber,
    serialCode: buildTelegramSerialCode({
      serialPrefix: settings.incomingSerialPrefix,
      date: new Date(),
      serialNumber,
      timeZone: settings.timezone,
    }),
  };
}

export function assertTelegramStatus(value: unknown): TelegramStatus {
  if (!isTelegramStatus(value)) {
    throw new TelegramValidationError("حالة البرقية غير صالحة");
  }
  return value;
}
