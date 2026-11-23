import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tables: {
    listRows: vi.fn(),
    deleteRow: vi.fn(),
  },
  users: {
    delete: vi.fn(),
  },
}));

vi.mock("node-appwrite", () => ({
  Query: {
    equal: (attribute: string, value: string | number) =>
      JSON.stringify({ method: "equal", attribute, values: [value] }),
    limit: (value: number) =>
      JSON.stringify({ method: "limit", values: [value] }),
  },
}));

vi.mock("../../_core/appwrite", () => ({
  getAppwriteDatabaseId: () => "test-db",
  getAppwriteTablesDB: () => mocks.tables,
  getAppwriteUsers: () => mocks.users,
}));

import {
  deleteManagedUser,
  ManagedUserHasLinkedRecordsError,
} from "./userService";

type ListRowsInput = {
  tableId: string;
  queries: string[];
};

const userRow = {
  $id: "profile-row",
  id: 7,
  authUserId: "auth-user-7",
  isPlatformOwner: false,
};
const actingUser = { id: 99, authUserId: "auth-owner" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.tables.listRows.mockImplementation(
    async ({ tableId }: ListRowsInput) => {
      if (tableId === "users") return { rows: [userRow] };
      if (tableId === "organization_memberships") {
        return { rows: [{ $id: "membership-row" }] };
      }
      return { rows: [] };
    }
  );
  mocks.tables.deleteRow.mockResolvedValue({});
  mocks.users.delete.mockResolvedValue({});
});

describe("managed user deletion safety", () => {
  it.each([
    "documents",
    "templates",
    "contacts",
    "attachments",
    "notifications",
    "push_subscriptions",
    "mobile_push_tokens",
    "telegrams",
    "telegram_versions",
    "telegram_attachments",
    "telegram_actions",
    "telegram_routes",
  ])(
    "blocks deletion when linked %s exist before removing memberships or profile",
    async linkedTable => {
      mocks.tables.listRows.mockImplementation(
        async ({ tableId }: ListRowsInput) => {
          if (tableId === "users") return { rows: [userRow] };
          if (tableId === linkedTable) {
            return { rows: [{ $id: `${linkedTable}-row` }] };
          }
          return { rows: [] };
        }
      );

      await expect(deleteManagedUser(7, actingUser)).rejects.toBeInstanceOf(
        ManagedUserHasLinkedRecordsError
      );
      expect(mocks.tables.deleteRow).not.toHaveBeenCalled();
      expect(mocks.users.delete).not.toHaveBeenCalled();
    }
  );

  it("checks all persistent user-owned and telegram-history references before deleting", async () => {
    await deleteManagedUser(7, actingUser);

    const checkedTables = mocks.tables.listRows.mock.calls
      .map(([input]) => (input as ListRowsInput).tableId)
      .filter(
        tableId => tableId !== "users" && tableId !== "organization_memberships"
      );
    expect(checkedTables).toEqual(
      expect.arrayContaining([
        "documents",
        "templates",
        "contacts",
        "attachments",
        "notifications",
        "push_subscriptions",
        "mobile_push_tokens",
        "telegrams",
        "telegram_versions",
        "telegram_attachments",
        "telegram_actions",
        "telegram_routes",
      ])
    );
    const queriedRows = mocks.tables.listRows.mock.calls.map(
      ([input]) => input as ListRowsInput
    );
    const expectedReferences = [
      ["documents", "ownerId", "auth-user-7"],
      ["templates", "ownerId", "auth-user-7"],
      ["contacts", "ownerId", "auth-user-7"],
      ["attachments", "ownerId", "auth-user-7"],
      ["notifications", "userId", 7],
      ["push_subscriptions", "userId", 7],
      ["mobile_push_tokens", "userId", 7],
      ["telegrams", "createdByUserId", 7],
      ["telegram_versions", "changedByUserId", 7],
      ["telegram_attachments", "uploadedByUserId", 7],
      ["telegram_actions", "actorUserId", 7],
      ["telegram_routes", "forwardedByUserId", 7],
      ["telegram_routes", "approvedByUserId", 7],
      ["telegram_routes", "receiverDecisionByUserId", 7],
    ] as const;
    for (const [tableId, attribute, value] of expectedReferences) {
      expect(
        queriedRows.some(
          input =>
            input.tableId === tableId &&
            input.queries.includes(
              JSON.stringify({ method: "equal", attribute, values: [value] })
            )
        )
      ).toBe(true);
    }
    expect(mocks.tables.deleteRow).toHaveBeenCalledWith({
      databaseId: "test-db",
      tableId: "organization_memberships",
      rowId: "membership-row",
    });
    expect(mocks.tables.deleteRow).toHaveBeenCalledWith({
      databaseId: "test-db",
      tableId: "users",
      rowId: "profile-row",
    });
    expect(mocks.users.delete).toHaveBeenCalledWith({ userId: "auth-user-7" });
  });

  it("fails closed when a linked-record lookup fails", async () => {
    const unavailable = new Error("Appwrite unavailable");
    mocks.tables.listRows.mockImplementation(
      async ({ tableId }: ListRowsInput) => {
        if (tableId === "users") return { rows: [userRow] };
        if (tableId === "telegram_actions") throw unavailable;
        return { rows: [] };
      }
    );

    await expect(deleteManagedUser(7, actingUser)).rejects.toBe(unavailable);
    expect(mocks.tables.deleteRow).not.toHaveBeenCalled();
    expect(mocks.users.delete).not.toHaveBeenCalled();
  });
});
