import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createRow: vi.fn(),
  getAppwriteTablesDB: vi.fn(),
  getAppwriteDatabaseId: vi.fn(() => "database-1"),
}));

vi.mock("../../_core/appwrite", () => ({
  getAppwriteTablesDB: mocks.getAppwriteTablesDB,
  getAppwriteDatabaseId: mocks.getAppwriteDatabaseId,
}));

import { writeAuditLog } from "./appwriteAuditRepository";

describe("Appwrite audit event persistence", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getAppwriteDatabaseId.mockReturnValue("database-1");
    mocks.getAppwriteTablesDB.mockReturnValue({
      createRow: mocks.createRow,
    });
    mocks.createRow.mockResolvedValue({ $id: "audit-row-1" });
  });

  it("stores an immutable, server-managed audit event in app_records", async () => {
    await writeAuditLog({
      actorUserId: 42,
      actorName: "  مسؤول النظام  ",
      actorRole: "admin",
      action: "document.created",
      entityType: "document",
      entityId: "document-1",
      organizationId: "organization-1",
      metadata: JSON.stringify({ title: "كتاب رسمي" }),
      beforeState: null,
      afterState: { status: "draft" },
      ipAddress: "192.0.2.10",
      userAgent: "Wathaeqi Mobile",
      deviceType: "mobile",
    });

    expect(mocks.createRow).toHaveBeenCalledOnce();
    const [request] = mocks.createRow.mock.calls[0] as [
      {
        databaseId: string;
        tableId: string;
        rowId: string;
        data: Record<string, unknown>;
      },
    ];
    expect(request.databaseId).toBe("database-1");
    expect(request.tableId).toBe("app_records");
    expect(request.rowId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(request.data).toMatchObject({
      recordType: "audit_event",
      ownerId: "42",
      organizationId: "organization-1",
    });

    const payload = JSON.parse(String(request.data.payload)) as Record<
      string,
      unknown
    >;
    expect(payload).toMatchObject({
      actorUserId: 42,
      actorName: "مسؤول النظام",
      actorRole: "admin",
      action: "document.created",
      entityType: "document",
      entityId: "document-1",
      metadata: { title: "كتاب رسمي" },
      afterState: { status: "draft" },
      ipAddress: "192.0.2.10",
      userAgent: "Wathaeqi Mobile",
      deviceType: "mobile",
    });
    expect(payload.occurredAt).toEqual(expect.any(String));
    expect(request.data.createdAt).toEqual(expect.any(String));
    expect(request.data.updatedAt).toEqual(request.data.createdAt);
  });

  it("rejects oversized payloads instead of silently dropping audit events", async () => {
    await expect(
      writeAuditLog({
        actorUserId: 42,
        actorName: "مسؤول النظام",
        action: "document.updated",
        entityType: "document",
        metadata: { detail: "x".repeat(61_000) },
      })
    ).rejects.toThrow("Audit event exceeds the maximum supported payload size");

    expect(mocks.createRow).not.toHaveBeenCalled();
  });
});
