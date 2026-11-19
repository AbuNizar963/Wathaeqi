import { createHash, randomInt, randomUUID } from "node:crypto";
import { Query } from "node-appwrite";
import {
  getAppwriteDatabaseId,
  getAppwriteTablesDB,
} from "../../_core/appwrite";
import { getUserOrganizationMembership } from "../organizations/appwriteOwnerOrganizationRepository";

type WriteAuditLogInput = {
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

type AppwriteAuditHeadRow = {
  $id: string;
  payload: string;
};

const AUDIT_HEAD_TABLE = "app_records";
const AUDIT_LOG_TABLE = "audit_logs";
const AUDIT_HEAD_RECORD_TYPE = "audit_chain_head";
const AUDIT_HEAD_RECORD_KEY = "head";
const AUDIT_GENESIS_HASH = "0".repeat(64);

function getAuditHeadHash(row: AppwriteAuditHeadRow): string {
  let payload: unknown;
  try {
    payload = JSON.parse(row.payload);
  } catch {
    throw new Error("Appwrite audit chain head contains invalid JSON");
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    !("entryHash" in payload) ||
    typeof payload.entryHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(payload.entryHash)
  ) {
    throw new Error("Appwrite audit chain head contains an invalid hash");
  }

  return payload.entryHash;
}

async function ensureAuditHead(): Promise<AppwriteAuditHeadRow> {
  const tables = getAppwriteTablesDB();
  const databaseId = getAppwriteDatabaseId();
  const findHead = async () => {
    const result = await tables.listRows({
      databaseId,
      tableId: AUDIT_HEAD_TABLE,
      queries: [
        Query.equal("recordType", AUDIT_HEAD_RECORD_TYPE),
        Query.equal("recordKey", AUDIT_HEAD_RECORD_KEY),
        Query.limit(2),
      ],
      total: false,
    });
    const rows = result.rows as unknown as AppwriteAuditHeadRow[];
    if (rows.length > 1) {
      throw new Error("Appwrite audit chain has duplicate head rows");
    }
    return rows[0] ?? null;
  };

  const existing = await findHead();
  if (existing) {
    getAuditHeadHash(existing);
    return existing;
  }

  const now = new Date().toISOString();
  try {
    const created = await tables.createRow({
      databaseId,
      tableId: AUDIT_HEAD_TABLE,
      rowId: "audit-chain-head",
      data: {
        recordType: AUDIT_HEAD_RECORD_TYPE,
        recordKey: AUDIT_HEAD_RECORD_KEY,
        ownerId: null,
        organizationId: null,
        createdAt: now,
        updatedAt: now,
        payload: JSON.stringify({ entryHash: AUDIT_GENESIS_HASH }),
      },
    });
    return created as unknown as AppwriteAuditHeadRow;
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? Number((error as { code?: unknown }).code)
        : 0;
    if (code !== 409) throw error;

    const raced = await findHead();
    if (!raced) throw error;
    getAuditHeadHash(raced);
    return raced;
  }
}

function auditJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

export async function writeAuditLog(input: WriteAuditLogInput): Promise<void> {
  const tables = getAppwriteTablesDB();
  const databaseId = getAppwriteDatabaseId();
  const actorResult = await tables.listRows({
    databaseId,
    tableId: "users",
    queries: [Query.equal("id", input.actorUserId), Query.limit(2)],
    total: false,
  });
  const actorRows = actorResult.rows as Array<Record<string, unknown>>;
  if (actorRows.length !== 1) {
    throw new Error(
      actorRows.length > 1
        ? "Appwrite returned duplicate audit actor profiles"
        : "Failed to snapshot audit actor: user not found"
    );
  }
  const actor = actorRows[0];

  // A membership role is more precise than the broad account role. If the
  // membership is unavailable, retain the account role rather than inventing
  // a permission snapshot.
  const membership = await getUserOrganizationMembership(input.actorUserId);
  const createdAt = new Date().toISOString();
  const auditFields = {
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    metadata: auditJson(input.metadata),
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    deviceType: input.deviceType ?? "unknown",
    actorRank: input.actorRank ?? actor.rank ?? null,
    actorRole: input.actorRole ?? membership?.role ?? actor.role ?? null,
    organizationId:
      input.organizationId ??
      membership?.organizationId ??
      (typeof actor.organizationId === "string" ? actor.organizationId : null),
    reason: input.reason ?? null,
    beforeState: auditJson(input.beforeState),
    afterState: auditJson(input.afterState),
    createdAt,
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const head = await ensureAuditHead();
    const previousHash = getAuditHeadHash(head);
    const hashPayload = {
      previousHash,
      ...auditFields,
    };
    const entryHash = createHash("sha256")
      .update(JSON.stringify(hashPayload))
      .digest("hex");
    const transaction = await tables.createTransaction();

    try {
      await tables.createRow({
        databaseId,
        tableId: AUDIT_LOG_TABLE,
        rowId: randomUUID(),
        data: {
          id: randomInt(1, 2_147_483_647),
          ...auditFields,
          previousHash,
          entryHash,
        },
        transactionId: transaction.$id,
      });
      await tables.updateRow({
        databaseId,
        tableId: AUDIT_HEAD_TABLE,
        rowId: head.$id,
        data: {
          payload: JSON.stringify({ entryHash }),
          updatedAt: createdAt,
        },
        transactionId: transaction.$id,
      });
      await tables.updateTransaction({
        transactionId: transaction.$id,
        commit: true,
      });
      return;
    } catch (error) {
      try {
        await tables.updateTransaction({
          transactionId: transaction.$id,
          rollback: true,
        });
      } catch {
        // A failed or expired transaction may already be rolled back.
      }

      const code =
        error && typeof error === "object" && "code" in error
          ? Number((error as { code?: unknown }).code)
          : 0;
      if (code === 409 && attempt < 2) continue;
      throw new Error(
        "Failed to write Appwrite audit log: " +
          (error instanceof Error ? error.message : String(error))
      );
    }
  }

  throw new Error(
    "Failed to write Appwrite audit log after concurrent retries"
  );
}
