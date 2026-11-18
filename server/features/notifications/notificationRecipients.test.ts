import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listRows: vi.fn(),
  createRow: vi.fn(),
  updateRow: vi.fn(),
  deleteRow: vi.fn(),
}));

vi.mock("../../_core/appwrite", () => ({
  getAppwriteDatabaseId: () => "test-database",
  getAppwriteTablesDB: () => ({
    listRows: mocks.listRows,
    createRow: mocks.createRow,
    updateRow: mocks.updateRow,
    deleteRow: mocks.deleteRow,
  }),
}));

vi.mock("../../_core/supabase", () => ({
  getSupabaseAdmin: vi.fn(() => {
    throw new Error("Notification persistence must not use Supabase");
  }),
}));

import {
  listActiveOrganizationMemberIds,
  listUserNotifications,
  markNotificationRead,
  notifyOrganizationUsers,
  resolveRouteNotifications,
} from "../../db";

const organizationId = "00000000-0000-4000-8000-000000000025";

function row(id: string, data: Record<string, unknown>) {
  return { $id: id, data };
}

describe("Appwrite organization notifications", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.listRows.mockImplementation(
      async ({ tableId }: { tableId: string }) => {
        if (tableId === "organization_memberships") {
          return {
            rows: [
              row("membership-1", { userId: 7, isActive: true }),
              row("membership-2", { userId: 7, isActive: true }),
              row("membership-3", { userId: "12", isActive: true }),
              row("membership-4", { userId: 0, isActive: true }),
              row("membership-5", { userId: "invalid", isActive: true }),
            ],
          };
        }
        if (tableId === "organizations") {
          return {
            rows: [
              row("organization-row", { id: organizationId, isActive: true }),
            ],
          };
        }
        return { rows: [] };
      }
    );
    mocks.createRow.mockResolvedValue({});
    mocks.updateRow.mockResolvedValue({});
    mocks.deleteRow.mockResolvedValue({});
  });

  it("selects unique positive user IDs only from an active organization", async () => {
    await expect(
      listActiveOrganizationMemberIds(organizationId)
    ).resolves.toEqual([7, 12]);

    expect(mocks.listRows).toHaveBeenCalledWith(
      expect.objectContaining({
        databaseId: "test-database",
        tableId: "organization_memberships",
      })
    );
    expect(mocks.listRows).toHaveBeenCalledWith(
      expect.objectContaining({
        databaseId: "test-database",
        tableId: "organizations",
      })
    );
  });

  it("does not create notifications when the organization is inactive", async () => {
    mocks.listRows.mockImplementation(
      async ({ tableId }: { tableId: string }) =>
        tableId === "organization_memberships"
          ? { rows: [row("membership-1", { userId: 7, isActive: true })] }
          : { rows: [] }
    );

    await notifyOrganizationUsers({
      organizationId,
      type: "telegram.route.created",
      title: "إحالة جديدة",
      body: "لديك إحالة جديدة",
    });

    expect(mocks.createRow).not.toHaveBeenCalled();
  });

  it("writes one Appwrite notification for each active member", async () => {
    await notifyOrganizationUsers({
      organizationId,
      type: "telegram.route.created",
      title: "إحالة جديدة",
      body: "لديك إحالة جديدة",
      telegramId: 91,
      routeId: 12,
    });

    expect(mocks.createRow).toHaveBeenCalledTimes(2);
    expect(mocks.createRow).toHaveBeenCalledWith(
      expect.objectContaining({
        databaseId: "test-database",
        tableId: "notifications",
        data: expect.objectContaining({
          userId: 7,
          organizationId,
          type: "telegram.route.created",
          telegramId: 91,
          routeId: 12,
          readAt: null,
        }),
      })
    );
    expect(mocks.createRow).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: "notifications",
        data: expect.objectContaining({ userId: 12 }),
      })
    );
  });

  it("lists unread notifications and returns the total unread count", async () => {
    mocks.listRows.mockResolvedValue({
      rows: [
        row("notification-1", {
          id: 1,
          userId: 7,
          organizationId,
          type: "route.approved",
          title: "تمت الموافقة",
          body: "تمت الموافقة على الإحالة",
          telegramId: 91,
          routeId: 12,
          readAt: null,
          createdAt: "2026-11-18T08:00:00.000Z",
        }),
        row("notification-2", {
          id: 2,
          userId: 7,
          organizationId,
          type: "route.requested",
          title: "إحالة جديدة",
          body: "لديك إحالة جديدة",
          telegramId: 92,
          routeId: 13,
          readAt: null,
          createdAt: "2026-11-18T09:00:00.000Z",
        }),
        row("notification-3", {
          id: 3,
          userId: 7,
          organizationId,
          type: "route.rejected",
          title: "مرفوضة",
          body: "تم رفض الإحالة",
          telegramId: 93,
          routeId: 14,
          readAt: "2026-11-18T09:30:00.000Z",
          createdAt: "2026-11-18T07:00:00.000Z",
        }),
      ],
    });

    await expect(
      listUserNotifications(7, organizationId, 1)
    ).resolves.toMatchObject({
      unreadCount: 2,
      items: [{ id: 2, title: "إحالة جديدة" }],
    });
  });

  it("marks only the selected user's notification as read", async () => {
    mocks.listRows.mockResolvedValue({
      rows: [
        row("notification-1", {
          id: 1,
          userId: 7,
          readAt: null,
        }),
      ],
    });

    await markNotificationRead(7, 1);

    expect(mocks.updateRow).toHaveBeenCalledWith(
      expect.objectContaining({
        databaseId: "test-database",
        tableId: "notifications",
        rowId: "notification-1",
        data: { readAt: expect.any(String) },
      })
    );
  });

  it("resolves only unread approval and request notifications for a route", async () => {
    mocks.listRows.mockResolvedValue({
      rows: [
        row("approved", { readAt: null }),
        row("requested", { readAt: null }),
        row("already-read", { readAt: "2026-11-18T09:00:00.000Z" }),
      ],
    });

    await resolveRouteNotifications(12);

    expect(mocks.updateRow).toHaveBeenCalledTimes(2);
    expect(mocks.updateRow).toHaveBeenCalledWith(
      expect.objectContaining({ rowId: "approved" })
    );
    expect(mocks.updateRow).toHaveBeenCalledWith(
      expect.objectContaining({ rowId: "requested" })
    );
  });
});
