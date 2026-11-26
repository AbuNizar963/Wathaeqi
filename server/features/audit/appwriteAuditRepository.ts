import { randomUUID } from "node:crypto";
import {
  getAppwriteDatabaseId,
  getAppwriteTablesDB,
} from "../../_core/appwrite";

const AUDIT_RECORD_TYPE = "audit_event";

export type WriteAuditLogInput = {
  actorUserId: number;
  actorName: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  deviceType?: string | null;
  actorRank?: string | null;
  actorRole?: string | null;
  organizationId?: string | null;
  reason?: string | null;
  beforeState?: unknown;
  afterState?: unknown;
};

function normalizeAuditValue(value: unknown): unknown {
  if (typeof value !== "string") return value ?? null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

/**
 * Audit events are stored as immutable, server-managed application records.
 * The Appwrite API key is only used server-side; clients never receive write
 * access to the application-records table.
 */
export async function writeAuditLog(input: WriteAuditLogInput): Promise<void> {
  const now = new Date().toISOString();
  const recordKey = randomUUID();
  const payload = {
    actorUserId: input.actorUserId,
    actorName: input.actorName.trim().slice(0, 255),
    actorRank: input.actorRank?.slice(0, 120) ?? null,
    actorRole: input.actorRole?.slice(0, 80) ?? null,
    action: input.action.trim().slice(0, 100),
    entityType: input.entityType.trim().slice(0, 80),
    entityId: input.entityId?.slice(0, 128) ?? null,
    organizationId: input.organizationId?.slice(0, 36) ?? null,
    metadata: normalizeAuditValue(input.metadata),
    beforeState: normalizeAuditValue(input.beforeState),
    afterState: normalizeAuditValue(input.afterState),
    reason: input.reason?.slice(0, 1000) ?? null,
    ipAddress: input.ipAddress?.slice(0, 80) ?? null,
    userAgent: input.userAgent?.slice(0, 512) ?? null,
    deviceType: input.deviceType?.slice(0, 16) ?? "unknown",
    occurredAt: now,
  };

  const serializedPayload = JSON.stringify(payload);
  if (serializedPayload.length > 60_000) {
    throw new Error("Audit event exceeds the maximum supported payload size");
  }

  await getAppwriteTablesDB().createRow({
    databaseId: getAppwriteDatabaseId(),
    tableId: "app_records",
    rowId: randomUUID(),
    data: {
      recordType: AUDIT_RECORD_TYPE,
      recordKey,
      ownerId: String(input.actorUserId),
      organizationId: payload.organizationId,
      createdAt: now,
      updatedAt: now,
      payload: serializedPayload,
    },
  });
}
