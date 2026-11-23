import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listRows: vi.fn(),
  createRow: vi.fn(),
  updateRow: vi.fn(),
  getTable: vi.fn(),
}));

vi.mock("../../_core/appwrite", () => ({
  getAppwriteDatabaseId: () => "test-db",
  getAppwriteTablesDB: () => mocks,
}));

import {
  DEPARTMENT_SETTINGS_DEFAULTS,
  ensureDepartmentSettings,
  getDepartmentSettings,
  updateDepartmentSettings,
} from "./departmentSettingsRepository";

type TestRow = Record<string, unknown> & {
  $id: string;
  organizationId: string;
};

type CreateRequest = {
  databaseId: string;
  tableId: string;
  rowId: string;
  data: Record<string, unknown> & { organizationId: string };
};

type UpdateRequest = {
  databaseId: string;
  tableId: string;
  rowId: string;
  data: Record<string, unknown>;
};

const rows = new Map<string, TestRow>();
const appwriteId = /^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/;
const orgA = "12345678901234567890123456789012345a";
const orgB = "12345678901234567890123456789012345b";
const timestamp = "2026-01-01T00:00:00.000Z";

function testRow(organizationId: string, id: string): TestRow {
  return {
    $id: id,
    organizationId,
    ...DEPARTMENT_SETTINGS_DEFAULTS,
    updatedByUserId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function conflict(): Error & { code: number } {
  return Object.assign(new Error("synthetic conflict"), { code: 409 });
}

beforeEach(() => {
  vi.resetAllMocks();
  rows.clear();

  mocks.getTable.mockResolvedValue({ columns: [] });

  mocks.listRows.mockImplementation(
    async ({ databaseId, tableId, queries, total }) => {
      expect(databaseId).toBe("test-db");
      expect(tableId).toBe("department_settings");
      expect(total).toBe(false);
      const parsed = queries.map((query: string) => JSON.parse(query));
      expect(parsed).toContainEqual({
        method: "limit",
        values: [2],
      });
      const equal = parsed.find(
        (query: { method: string; attribute?: string }) =>
          query.method === "equal" && query.attribute === "organizationId"
      );
      expect(equal).toBeDefined();
      return {
        rows: [...rows.values()]
          .filter(row => row.organizationId === equal.values[0])
          .slice(0, 2),
      };
    }
  );

  mocks.createRow.mockImplementation(
    async ({ databaseId, tableId, rowId, data }: CreateRequest) => {
      expect(databaseId).toBe("test-db");
      expect(tableId).toBe("department_settings");
      if (!appwriteId.test(rowId)) throw new Error("invalid Appwrite row ID");
      if (
        rows.has(rowId) ||
        [...rows.values()].some(
          row => row.organizationId === data.organizationId
        )
      ) {
        throw conflict();
      }
      const created = { $id: rowId, ...data };
      rows.set(rowId, created);
      return created;
    }
  );

  mocks.updateRow.mockImplementation(
    async ({ databaseId, tableId, rowId, data }: UpdateRequest) => {
      expect(databaseId).toBe("test-db");
      expect(tableId).toBe("department_settings");
      const existing = rows.get(rowId);
      if (!existing)
        throw Object.assign(new Error("row not found"), { code: 404 });
      const updated = { ...existing, ...data };
      rows.set(rowId, updated);
      return updated;
    }
  );
});

describe("department settings Appwrite repository", () => {
  it("fills the legacy required integer id when the live table still declares it", async () => {
    mocks.getTable.mockResolvedValue({
      columns: [{ key: "id", type: "integer", required: true }],
    });

    const first = await ensureDepartmentSettings(orgA);
    const firstPayload = (mocks.createRow.mock.calls[0][0] as CreateRequest)
      .data;
    expect(firstPayload.id).toEqual(expect.any(Number));
    expect(Number.isInteger(firstPayload.id)).toBe(true);
    expect(firstPayload.id).toBeGreaterThan(0);
    expect(first).toMatchObject({ organizationId: orgA });

    await ensureDepartmentSettings(orgB);
    const secondPayload = (mocks.createRow.mock.calls[1][0] as CreateRequest)
      .data;
    expect(secondPayload.id).not.toBe(firstPayload.id);

    // Recreating the same organization keeps the deterministic legacy id.
    rows.clear();
    await ensureDepartmentSettings(orgA);
    const repeatedPayload = (mocks.createRow.mock.calls[2][0] as CreateRequest)
      .data;
    expect(repeatedPayload.id).toBe(firstPayload.id);
  });

  it("retries with a legacy id when the table metadata is unavailable", async () => {
    mocks.getTable.mockRejectedValue(new Error("schema unavailable"));
    const missingId = Object.assign(
      new Error('Invalid document structure: Missing required attribute "id"'),
      { code: 400 }
    );
    mocks.createRow.mockRejectedValueOnce(missingId);

    const settings = await ensureDepartmentSettings(orgA);
    expect(settings.organizationId).toBe(orgA);
    expect(mocks.createRow).toHaveBeenCalledTimes(2);
    const retried = (mocks.createRow.mock.calls[1][0] as CreateRequest).data;
    expect(retried.id).toEqual(expect.any(Number));
  });

  it("does not send a legacy id when the table no longer declares one", async () => {
    await ensureDepartmentSettings(orgA);
    const payload = (mocks.createRow.mock.calls[0][0] as CreateRequest).data;
    expect(payload).not.toHaveProperty("id");
  });

  it("creates a valid at-most-36-character stable row ID for a maximum-length organization ID", async () => {
    expect(orgA).toHaveLength(36);
    const first = await ensureDepartmentSettings(orgA);
    const firstId = (mocks.createRow.mock.calls[0][0] as CreateRequest).rowId;
    expect(firstId).toMatch(appwriteId);
    expect(firstId.length).toBeLessThanOrEqual(36);
    expect(first).toMatchObject({
      organizationId: orgA,
      ...DEPARTMENT_SETTINGS_DEFAULTS,
    });

    // Model an empty table again to check determinism, not just reuse of a row.
    rows.clear();
    await ensureDepartmentSettings(orgA);
    const secondId = (mocks.createRow.mock.calls[1][0] as CreateRequest).rowId;
    expect(secondId).toBe(firstId);
  });

  it("uses different IDs for different organizations and never creates duplicates on repeated reads", async () => {
    expect(orgB).toHaveLength(36);
    await ensureDepartmentSettings(orgA);
    await ensureDepartmentSettings(orgB);
    await ensureDepartmentSettings(orgA);
    const requests = mocks.createRow.mock.calls.map(
      call => call[0] as CreateRequest
    );
    expect(requests).toHaveLength(2);
    expect(requests[0].rowId).not.toBe(requests[1].rowId);
    expect(requests.every(request => appwriteId.test(request.rowId))).toBe(
      true
    );
    expect(rows.size).toBe(2);
    expect([...rows.values()].map(row => row.organizationId)).toEqual([
      orgA,
      orgB,
    ]);
  });

  it("updates the actual ID of a legacy row without writing to another organization's row", async () => {
    const legacyOrg = "org-a";
    const legacy = testRow(legacyOrg, "legacy-random-id");
    const other = testRow("org-b", `settings-${legacyOrg}`);
    rows.set(legacy.$id, legacy);
    rows.set(other.$id, other);

    const updated = await updateDepartmentSettings(
      legacyOrg,
      { ...DEPARTMENT_SETTINGS_DEFAULTS, departmentName: "Synthetic A" },
      17
    );

    expect(mocks.createRow).not.toHaveBeenCalled();
    expect(mocks.updateRow).toHaveBeenCalledOnce();
    expect(mocks.updateRow).toHaveBeenCalledWith(
      expect.objectContaining({
        rowId: legacy.$id,
        data: expect.objectContaining({
          departmentName: "Synthetic A",
          updatedByUserId: 17,
        }),
      })
    );
    expect(updated).toMatchObject({
      organizationId: legacyOrg,
      departmentName: "Synthetic A",
    });
    expect(rows.get(other.$id)).toEqual(other);
    expect(rows.size).toBe(2);
  });

  it("keeps the original composite ID of an existing settings row", async () => {
    const organizationId = "org-legacy";
    const oldRow = {
      ...testRow(organizationId, `settings-${organizationId}`),
      departmentName: "Original synthetic settings",
    };
    rows.set(oldRow.$id, oldRow);

    expect(await ensureDepartmentSettings(organizationId)).toMatchObject({
      organizationId,
      departmentName: oldRow.departmentName,
    });
    await updateDepartmentSettings(
      organizationId,
      { ...DEPARTMENT_SETTINGS_DEFAULTS, departmentName: "Updated legacy" },
      22
    );

    expect(mocks.createRow).not.toHaveBeenCalled();
    expect(mocks.updateRow.mock.calls[0][0].rowId).toBe(oldRow.$id);
    expect(rows.size).toBe(1);
    expect(rows.get(oldRow.$id)?.departmentName).toBe("Updated legacy");
  });

  it("updates the row returned by create when none existed", async () => {
    const result = await updateDepartmentSettings(
      orgA,
      { ...DEPARTMENT_SETTINGS_DEFAULTS, departmentName: "Synthetic new" },
      18
    );
    const createdId = (mocks.createRow.mock.calls[0][0] as CreateRequest).rowId;
    expect(mocks.updateRow.mock.calls[0][0].rowId).toBe(createdId);
    expect(result).toMatchObject({
      organizationId: orgA,
      departmentName: "Synthetic new",
    });
    expect(rows.size).toBe(1);
  });

  it("recovers from a concurrent insert with a different ID and updates that row", async () => {
    const raced = testRow(orgA, "concurrent-row-id");
    mocks.createRow.mockImplementationOnce(async () => {
      rows.set(raced.$id, raced);
      throw conflict();
    });

    const result = await updateDepartmentSettings(
      orgA,
      { ...DEPARTMENT_SETTINGS_DEFAULTS, departmentName: "Synthetic race" },
      19
    );
    expect(mocks.createRow).toHaveBeenCalledOnce();
    expect(mocks.listRows).toHaveBeenCalledTimes(2);
    expect(mocks.updateRow.mock.calls[0][0].rowId).toBe(raced.$id);
    expect(result).toMatchObject({
      organizationId: orgA,
      departmentName: "Synthetic race",
    });
    expect(rows.size).toBe(1);
  });

  it("allows simultaneous ensures for one organization to converge on one row", async () => {
    const [first, second] = await Promise.all([
      ensureDepartmentSettings(orgA),
      ensureDepartmentSettings(orgA),
    ]);
    expect(first).toEqual(second);
    expect(mocks.createRow).toHaveBeenCalledTimes(2);
    expect(rows.size).toBe(1);
    expect([...rows.values()][0].organizationId).toBe(orgA);
  });

  it("does not update another organization when its row occupies the generated ID", async () => {
    await ensureDepartmentSettings(orgA);
    const generatedId = (mocks.createRow.mock.calls[0][0] as CreateRequest)
      .rowId;
    rows.clear();
    const other = testRow(orgB, generatedId);
    rows.set(other.$id, other);
    mocks.listRows.mockClear();

    await expect(
      updateDepartmentSettings(orgA, DEPARTMENT_SETTINGS_DEFAULTS, 20)
    ).rejects.toMatchObject({ code: 409 });
    expect(mocks.listRows).toHaveBeenCalledTimes(2);
    expect(mocks.updateRow).not.toHaveBeenCalled();
    expect(rows.get(generatedId)).toEqual(other);
    expect(rows.size).toBe(1);
  });

  it("rethrows an unexplained 409 rather than returning or modifying another organization's row", async () => {
    const other = testRow(orgB, "other-org-row");
    rows.set(other.$id, other);
    const error = conflict();
    mocks.createRow.mockRejectedValueOnce(error);
    await expect(
      updateDepartmentSettings(orgA, DEPARTMENT_SETTINGS_DEFAULTS, 20)
    ).rejects.toBe(error);
    expect(mocks.listRows).toHaveBeenCalledTimes(2);
    expect(mocks.updateRow).not.toHaveBeenCalled();
    expect(rows.get(other.$id)).toEqual(other);
  });

  it("propagates non-conflict errors and rejects duplicate rows before writing", async () => {
    const failure = Object.assign(new Error("synthetic unavailable"), {
      code: 503,
    });
    mocks.createRow.mockRejectedValueOnce(failure);
    await expect(ensureDepartmentSettings(orgA)).rejects.toBe(failure);
    expect(mocks.listRows).toHaveBeenCalledTimes(1);

    rows.set("legacy-1", testRow(orgA, "legacy-1"));
    rows.set("legacy-2", testRow(orgA, "legacy-2"));
    await expect(getDepartmentSettings(orgA)).rejects.toThrow("duplicate rows");
    await expect(
      updateDepartmentSettings(orgA, DEPARTMENT_SETTINGS_DEFAULTS, 21)
    ).rejects.toThrow("duplicate rows");
    expect(mocks.updateRow).not.toHaveBeenCalled();
    expect(mocks.createRow).toHaveBeenCalledTimes(1);
  });
});
