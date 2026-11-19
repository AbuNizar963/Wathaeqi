import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown> & { $id: string };
type QueryDescriptor = {
  method: string;
  attribute?: string;
  values?: unknown[];
};

const store = new Map<string, Map<string, Row>>();
let rowSequence = 0;

function table(tableId: string): Map<string, Row> {
  const existing = store.get(tableId);
  if (existing) return existing;
  const created = new Map<string, Row>();
  store.set(tableId, created);
  return created;
}

function applyQuery(rows: Row[], query: QueryDescriptor): Row[] {
  switch (query.method) {
    case "equal": {
      const values = query.values ?? [];
      return rows.filter(row =>
        values.some(value => row[query.attribute ?? ""] === value)
      );
    }
    case "greaterThanEqual":
      return rows.filter(
        row =>
          String(row[query.attribute ?? ""] ?? "") >=
          String(query.values?.[0] ?? "")
      );
    case "lessThanEqual":
      return rows.filter(
        row =>
          String(row[query.attribute ?? ""] ?? "") <=
          String(query.values?.[0] ?? "")
      );
    case "orderDesc":
      return [...rows].sort((left, right) =>
        String(right[query.attribute ?? ""] ?? "").localeCompare(
          String(left[query.attribute ?? ""] ?? "")
        )
      );
    case "orderAsc":
      return [...rows].sort((left, right) =>
        String(left[query.attribute ?? ""] ?? "").localeCompare(
          String(right[query.attribute ?? ""] ?? "")
        )
      );
    default:
      return rows;
  }
}

const fakeTables = {
  createRow: vi.fn(
    async ({
      tableId,
      rowId,
      data,
    }: {
      tableId: string;
      rowId: string;
      data: Record<string, unknown>;
    }) => {
      const rows = table(tableId);
      if (rows.has(rowId)) {
        throw Object.assign(new Error("Row already exists"), { code: 409 });
      }
      const row = { ...data, $id: rowId } as Row;
      rows.set(rowId, row);
      return row;
    }
  ),
  updateRow: vi.fn(
    async ({
      tableId,
      rowId,
      data,
    }: {
      tableId: string;
      rowId: string;
      data: Record<string, unknown>;
    }) => {
      const rows = table(tableId);
      const current = rows.get(rowId);
      if (!current) {
        throw Object.assign(new Error("Row not found"), { code: 404 });
      }
      for (const [key, value] of Object.entries(data)) {
        if (
          value &&
          typeof value === "object" &&
          "__op" in (value as Record<string, unknown>)
        ) {
          const operation = value as { __op: string; amount: number };
          if (operation.__op === "increment") {
            current[key] = Number(current[key] ?? 0) + operation.amount;
          }
          continue;
        }
        current[key] = value;
      }
      return current;
    }
  ),
  getRow: vi.fn(
    async ({ tableId, rowId }: { tableId: string; rowId: string }) => {
      const row = table(tableId).get(rowId);
      if (!row) {
        throw Object.assign(new Error("Row not found"), { code: 404 });
      }
      return row;
    }
  ),
  deleteRow: vi.fn(
    async ({ tableId, rowId }: { tableId: string; rowId: string }) => {
      table(tableId).delete(rowId);
      return {};
    }
  ),
  listRows: vi.fn(
    async ({
      tableId,
      queries = [],
    }: {
      tableId: string;
      queries?: QueryDescriptor[];
    }) => {
      let rows = [...table(tableId).values()];
      for (const query of queries) {
        rows = applyQuery(rows, query);
      }
      const limitQuery = queries.find(query => query.method === "limit");
      const offsetQuery = queries.find(query => query.method === "offset");
      const total = rows.length;
      const offset = Number(offsetQuery?.values?.[0] ?? 0);
      const limit = Number(limitQuery?.values?.[0] ?? total);
      return { rows: rows.slice(offset, offset + limit), total };
    }
  ),
  createTransaction: vi.fn(async () => ({ $id: `tx-${++rowSequence}` })),
  updateTransaction: vi.fn(async () => ({})),
};

vi.mock("node-appwrite", () => ({
  Query: {
    equal: (attribute: string, values: unknown) =>
      ({
        method: "equal",
        attribute,
        values: Array.isArray(values) ? values : [values],
      }) satisfies QueryDescriptor,
    limit: (value: number) =>
      ({ method: "limit", values: [value] }) satisfies QueryDescriptor,
    offset: (value: number) =>
      ({ method: "offset", values: [value] }) satisfies QueryDescriptor,
    orderDesc: (attribute: string) =>
      ({ method: "orderDesc", attribute }) satisfies QueryDescriptor,
    orderAsc: (attribute: string) =>
      ({ method: "orderAsc", attribute }) satisfies QueryDescriptor,
    greaterThanEqual: (attribute: string, value: unknown) =>
      ({
        method: "greaterThanEqual",
        attribute,
        values: [value],
      }) satisfies QueryDescriptor,
    lessThanEqual: (attribute: string, value: unknown) =>
      ({
        method: "lessThanEqual",
        attribute,
        values: [value],
      }) satisfies QueryDescriptor,
  },
  Operator: {
    increment: (amount: number) => ({ __op: "increment", amount }),
  },
}));

vi.mock("../../_core/appwrite", () => ({
  getAppwriteTablesDB: () => fakeTables,
  getAppwriteDatabaseId: () => "test-db",
}));

import {
  TelegramConflictError,
  TelegramValidationError,
  createTelegram,
  createTelegramAttachment,
  createTelegramRoute,
  deleteTelegramPermanently,
  getTelegramById,
  getTelegramByIdempotencyKey,
  listTelegrams,
  recordTelegramAction,
  recordTelegramVersion,
  transitionTelegram,
  updateTelegram,
} from "./telegramRepository";

const organizationId = "11111111-1111-4111-8111-111111111111";

function createInput(overrides: Record<string, unknown> = {}) {
  return {
    subject: "تعميم أمني",
    recipient: "مديرية الشرطة",
    body: "يرجى تنفيذ التعليمات الواردة",
    classification: "normal" as const,
    priority: "normal" as const,
    category: "administrative" as const,
    organizationId,
    createdByUserId: 7,
    creatorName: "ضابط أول",
    creatorEmail: "officer@example.test",
    creatorBadgeId: "B-1",
    creatorIp: null,
    creatorFingerprint: "auth-1",
    ...overrides,
  };
}

beforeEach(() => {
  store.clear();
  rowSequence = 0;
  vi.clearAllMocks();
});

describe("telegram repository", () => {
  it("allocates sequential identifiers and organization serials", async () => {
    const first = await createTelegram(createInput());
    const second = await createTelegram(
      createInput({ subject: "برقية ثانية", idempotencyKey: "key-2" })
    );

    expect(first.id).toBe("1");
    expect(first.serialNumber).toBe(1);
    expect(first.organizationSerialNumber).toBe(1);
    expect(first.serialCode).toMatch(/^POL-\d{4}-\d{2}-\d{2}-00001$/);
    expect(second.id).toBe("2");
    expect(second.organizationSerialNumber).toBe(2);
    expect(second.serialCode).toMatch(/-00002$/);
  });

  it("finds a telegram by its idempotency key", async () => {
    const first = await createTelegram(createInput({ idempotencyKey: "same" }));
    const found = await getTelegramByIdempotencyKey("same");
    expect(found?.id).toBe(first.id);
    expect(await getTelegramByIdempotencyKey("missing")).toBeNull();
  });

  it("enforces the workflow matrix and records actions and versions", async () => {
    const created = await createTelegram(createInput());
    const submitted = await transitionTelegram({
      telegramId: Number(created.id),
      actorUserId: 7,
      toStatus: "submitted",
      reason: null,
      expectedRevision: 1,
      actorName: "ضابط أول",
    });
    expect(submitted.status).toBe("submitted");
    expect(submitted.revision).toBe(2);

    await expect(
      transitionTelegram({
        telegramId: Number(created.id),
        actorUserId: 7,
        toStatus: "approved",
        reason: null,
        expectedRevision: 2,
        actorName: "ضابط أول",
      })
    ).rejects.toBeInstanceOf(TelegramValidationError);

    await transitionTelegram({
      telegramId: Number(created.id),
      actorUserId: 7,
      toStatus: "in_review",
      reason: null,
      expectedRevision: 2,
      actorName: "ضابط أول",
    });

    await expect(
      transitionTelegram({
        telegramId: Number(created.id),
        actorUserId: 7,
        toStatus: "returned",
        reason: null,
        expectedRevision: 3,
        actorName: "ضابط أول",
      })
    ).rejects.toBeInstanceOf(TelegramValidationError);

    const returned = await transitionTelegram({
      telegramId: Number(created.id),
      actorUserId: 7,
      toStatus: "returned",
      reason: "نقص في البيانات",
      expectedRevision: 3,
      actorName: "ضابط أول",
    });
    expect(returned.workflowReason).toBe("نقص في البيانات");
    expect(table("telegram_actions").size).toBe(3);
    expect(table("telegram_versions").size).toBe(3);
  });

  it("rejects stale revisions and non-editable statuses", async () => {
    const created = await createTelegram(createInput());
    await expect(
      updateTelegram(Number(created.id), 99, {
        subject: "تعديل",
        recipient: "جهة",
        body: "نص جديد",
        classification: "normal",
        priority: "normal",
        category: "administrative",
      })
    ).rejects.toBeInstanceOf(TelegramConflictError);

    const updated = await updateTelegram(Number(created.id), 1, {
      subject: "تعديل",
      recipient: "جهة",
      body: "نص جديد",
      classification: "secret",
      priority: "urgent",
      category: "security",
    });
    expect(updated.revision).toBe(2);
    expect(updated.classification).toBe("secret");
  });

  it("filters, searches and paginates telegrams", async () => {
    await createTelegram(createInput({ subject: "تعميم أمني" }));
    await createTelegram(
      createInput({ subject: "برقية مرورية", priority: "urgent" })
    );
    await createTelegram(createInput({ subject: "برقية إدارية" }));

    const all = await listTelegrams([organizationId], {
      page: 1,
      pageSize: 2,
    });
    expect(all.total).toBe(3);
    expect(all.items).toHaveLength(2);
    expect(all.hasNext).toBe(true);

    const urgent = await listTelegrams([organizationId], {
      priority: "urgent",
      page: 1,
      pageSize: 10,
    });
    expect(urgent.total).toBe(1);

    const searched = await listTelegrams([organizationId], {
      search: "مرورية",
      page: 1,
      pageSize: 10,
    });
    expect(searched.total).toBe(1);
    expect(searched.items[0]?.subject).toContain("مرورية");
  });

  it("removes every dependent row when purging a telegram", async () => {
    const created = await createTelegram(createInput());
    const telegramId = Number(created.id);
    await recordTelegramAction({
      telegramId,
      actorUserId: 7,
      action: "telegram.create",
    });
    await recordTelegramVersion({
      telegramId,
      versionNumber: 1,
      changedByUserId: 7,
      changeReason: "إنشاء",
      snapshot: {},
    });
    await createTelegramAttachment({
      telegramId,
      storageKey: `telegrams/${telegramId}/file.pdf`,
      storageOrganizationId: organizationId,
      originalName: "file.pdf",
      mimeType: "application/pdf",
      sizeBytes: 10,
      sha256: "a".repeat(64),
      uploadedByUserId: 7,
    });
    await createTelegramRoute({
      telegramId,
      fromOrganizationId: organizationId,
      toOrganizationId: "22222222-2222-4222-8222-222222222222",
      forwardedByUserId: 7,
      approvalStatus: "not_required",
      routeSerialNumber: 1,
      routeSerialCode: "POL-2026-01-05-00001",
      note: null,
    });

    const result = await deleteTelegramPermanently(telegramId);
    expect(result.storageKeys).toEqual([`telegrams/${telegramId}/file.pdf`]);
    expect(await getTelegramById(telegramId)).toBeNull();
    expect(table("telegram_actions").size).toBe(0);
    expect(table("telegram_versions").size).toBe(0);
    expect(table("telegram_attachments").size).toBe(0);
    expect(table("telegram_routes").size).toBe(0);
  });
});
