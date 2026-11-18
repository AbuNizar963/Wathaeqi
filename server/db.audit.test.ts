import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listRows: vi.fn(),
  createRow: vi.fn(),
  updateRow: vi.fn(),
  createTransaction: vi.fn(),
  updateTransaction: vi.fn(),
  getMembership: vi.fn(),
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("./_core/appwrite", () => ({
  getAppwriteDatabaseId: () => "test-database",
  getAppwriteTablesDB: () => mocks,
}));

vi.mock("./_core/supabase", () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}));

vi.mock("./features/organizations/organization", () => ({
  addOrganizationMembership: vi.fn(),
  getPrimaryOrganization: vi.fn(),
  getUserOrganizationMembership: mocks.getMembership,
}));

vi.mock("./features/organizations/organizationLetterhead", () => ({
  resolveOrganizationLetterhead: vi.fn(),
}));

vi.mock("./features/storage/storage", () => ({
  storageKeyFromStoredUrl: vi.fn(),
  storageStableUrl: vi.fn(),
}));

vi.mock("./urgentTelegramAlert", () => ({
  countUrgentTelegramsAwaitingReceipt: vi.fn(),
}));

import { writeAuditLog } from "./db";

const GENESIS_HASH = "0".repeat(64);
const COMPETING_HASH = "f".repeat(64);

describe("writeAuditLog Appwrite hash chain", () => {
  let headExists: boolean;
  let headHash: string;
  let stagedHash: string;
  let pendingAuditRow: Record<string, unknown> | null;
  const committedAuditRows: Record<string, unknown>[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    headExists = false;
    headHash = GENESIS_HASH;
    stagedHash = "";
    pendingAuditRow = null;
    committedAuditRows.length = 0;

    mocks.listRows.mockImplementation(async ({ tableId }) => {
      if (tableId === "users") {
        return {
          rows: [
            {
              id: 17,
              rank: "رقيب",
              role: "user",
              organizationId: "org-1",
            },
          ],
        };
      }

      if (tableId === "app_records") {
        return {
          rows: headExists
            ? [
                {
                  $id: "audit-chain-head",
                  payload: JSON.stringify({ entryHash: headHash }),
                },
              ]
            : [],
        };
      }

      return { rows: [] };
    });

    mocks.createRow.mockImplementation(async ({ tableId, rowId, data }) => {
      if (tableId === "app_records") {
        headExists = true;
        headHash = JSON.parse(data.payload).entryHash;
        return { $id: rowId, ...data };
      }

      if (tableId === "audit_logs") {
        pendingAuditRow = data;
        return { $id: rowId, ...data };
      }

      throw new Error(`Unexpected Appwrite table: ${tableId}`);
    });

    mocks.updateRow.mockImplementation(async ({ tableId, data }) => {
      if (tableId !== "app_records") {
        throw new Error(`Unexpected Appwrite update table: ${tableId}`);
      }
      stagedHash = JSON.parse(data.payload).entryHash;
      return { $id: "audit-chain-head", ...data };
    });

    mocks.createTransaction.mockResolvedValue({ $id: "tx-1" });
    mocks.updateTransaction.mockImplementation(async ({ commit }) => {
      if (commit) {
        headHash = stagedHash;
        if (pendingAuditRow) committedAuditRows.push(pendingAuditRow);
        pendingAuditRow = null;
        return { status: "committed" };
      }
      pendingAuditRow = null;
      return { status: "rolled_back" };
    });
    mocks.getMembership.mockResolvedValue({
      organizationId: "org-1",
      role: "manager",
    });
    mocks.getSupabaseAdmin.mockImplementation(() => {
      throw new Error("Supabase must not be used for audit logging");
    });
  });

  it("writes the audit row and advances the head in one Appwrite transaction", async () => {
    await writeAuditLog({
      actorUserId: 17,
      actorName: "Test actor",
      action: "telegram.create",
      entityType: "telegram",
      entityId: "telegram-7",
      metadata: { source: "test" },
    });

    expect(committedAuditRows).toHaveLength(1);
    expect(committedAuditRows[0]).toMatchObject({
      actorUserId: 17,
      actorName: "Test actor",
      action: "telegram.create",
      entityType: "telegram",
      entityId: "telegram-7",
      actorRank: "رقيب",
      actorRole: "manager",
      organizationId: "org-1",
      previousHash: GENESIS_HASH,
    });
    expect(committedAuditRows[0].entryHash).toMatch(/^[a-f0-9]{64}$/);
    expect(committedAuditRows[0].metadata).toBe(
      JSON.stringify({ source: "test" })
    );
    expect(mocks.updateTransaction).toHaveBeenCalledWith({
      transactionId: "tx-1",
      commit: true,
    });
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("retries after a concurrent audit-head update instead of creating a fork", async () => {
    let commitAttempts = 0;
    mocks.updateTransaction.mockImplementation(async ({ commit }) => {
      if (!commit) {
        pendingAuditRow = null;
        return { status: "rolled_back" };
      }

      commitAttempts += 1;
      if (commitAttempts === 1) {
        headHash = COMPETING_HASH;
        pendingAuditRow = null;
        throw { code: 409, message: "Transaction conflict" };
      }

      headHash = stagedHash;
      if (pendingAuditRow) committedAuditRows.push(pendingAuditRow);
      pendingAuditRow = null;
      return { status: "committed" };
    });

    await writeAuditLog({
      actorUserId: 17,
      actorName: "Test actor",
      action: "telegram.update",
      entityType: "telegram",
      entityId: "telegram-8",
    });

    expect(commitAttempts).toBe(2);
    expect(committedAuditRows).toHaveLength(1);
    expect(committedAuditRows[0].previousHash).toBe(COMPETING_HASH);
  });
});
