import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const from = vi.fn();
  const select = vi.fn();
  const eq = vi.fn();
  const order = vi.fn();
  const limit = vi.fn();
  const maybeSingle = vi.fn();
  const ilike = vi.fn();
  const neq = vi.fn();
  const insert = vi.fn();
  const upsert = vi.fn();
  const update = vi.fn();
  const single = vi.fn();
  const rpc = vi.fn();
  const hashPassword = vi.fn();
  const appwriteListRows = vi.fn();
  const appwriteUpdateRow = vi.fn();
  const appwriteCreateRow = vi.fn();
  const appwriteDeleteRow = vi.fn();
  const getAppwriteProfileById = vi.fn();

  from.mockReturnValue({ select, insert, upsert, update });
  select.mockReturnValue({ eq, single, order, ilike });
  eq.mockReturnValue({ eq, order, limit, maybeSingle, select });
  ilike.mockReturnValue({ neq, maybeSingle });
  neq.mockReturnValue({ maybeSingle });
  order.mockReturnValue({ order, limit, maybeSingle });
  limit.mockReturnValue({ maybeSingle });
  insert.mockReturnValue({ select });
  upsert.mockReturnValue({ select });
  update.mockReturnValue({ eq });

  return {
    from,
    select,
    eq,
    order,
    limit,
    maybeSingle,
    ilike,
    neq,
    insert,
    upsert,
    update,
    single,
    rpc,
    hashPassword,
    appwriteListRows,
    appwriteUpdateRow,
    appwriteCreateRow,
    appwriteDeleteRow,
    getAppwriteProfileById,
  };
});

vi.mock("../../_core/auth", () => ({
  hashPassword: mocks.hashPassword,
}));

vi.mock("../../_core/supabase", () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: mocks.from,
    rpc: mocks.rpc,
  })),
}));

vi.mock("../../_core/appwrite", () => ({
  getAppwriteDatabaseId: () => "wathaeqi-db",
  getAppwriteTablesDB: () => ({
    listRows: mocks.appwriteListRows,
    updateRow: mocks.appwriteUpdateRow,
    createRow: mocks.appwriteCreateRow,
    deleteRow: mocks.appwriteDeleteRow,
  }),
}));

vi.mock("../../_core/appwriteAuth", () => ({
  getAppwriteProfileById: mocks.getAppwriteProfileById,
}));

import {
  addOrganizationMembership,
  archiveOrganizationSafely,
  getUserOrganizationMembership,
  selectPlatformOwnerWorkplace,
  updateOrganization,
  updateOrganizationAccount,
} from "./organization";
import {
  canOrganizationHaveParent,
  getAllowedOrganizationChildTypes,
} from "../../../shared/features/organizations/organizationHierarchy";
import { ENV } from "../../_core/env";

describe("organization repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hashPassword.mockResolvedValue("hashed-organization-password");
    mocks.appwriteUpdateRow.mockResolvedValue({});
    mocks.appwriteCreateRow.mockResolvedValue({});
    mocks.appwriteDeleteRow.mockResolvedValue({});
    mocks.getAppwriteProfileById.mockResolvedValue({
      rowId: "user-row-7",
      user: {
        id: 7,
        authUserId: "appwrite-user-7",
        organizationId: "00000000-0000-0000-0000-000000000001",
        isActive: true,
        sessionVersion: "session-7",
      },
    });
    mocks.appwriteListRows.mockImplementation(
      ({ tableId }: { tableId: string }) => {
        if (tableId === "organization_memberships") {
          return Promise.resolve({
            rows: [
              {
                $id: "membership-7",
                data: {
                  id: 1,
                  organizationId: "00000000-0000-0000-0000-000000000001",
                  userId: 7,
                  role: "dispatcher",
                  isActive: true,
                  createdAt: "2026-10-01T00:00:00.000Z",
                  updatedAt: "2026-10-01T00:00:00.000Z",
                },
              },
            ],
          });
        }
        return Promise.resolve({
          rows: [
            {
              $id: "00000000-0000-0000-0000-000000000001",
              data: {
                id: "00000000-0000-0000-0000-000000000001",
                code: "TEST-ORG",
                name: "جهة اختبار",
                type: "central",
                isActive: true,
                createdAt: "2026-10-01T00:00:00.000Z",
                updatedAt: "2026-10-01T00:00:00.000Z",
              },
            },
          ],
        });
      }
    );
    mocks.maybeSingle.mockResolvedValue({
      data: {
        id: 1,
        organizationId: "00000000-0000-0000-0000-000000000001",
        userId: 7,
        role: "dispatcher",
        isActive: true,
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
      },
      error: null,
    });
  });

  it("loads the active organization membership for a user", async () => {
    await expect(getUserOrganizationMembership(7)).resolves.toMatchObject({
      userId: 7,
      organizationId: "00000000-0000-0000-0000-000000000001",
      role: "dispatcher",
    });
  });

  it("excludes active memberships whose Appwrite organization is disabled", async () => {
    mocks.appwriteListRows.mockImplementation(
      ({ tableId }: { tableId: string }) =>
        Promise.resolve({
          rows:
            tableId === "organization_memberships"
              ? [
                  {
                    $id: "membership-7",
                    data: {
                      id: 1,
                      organizationId: "00000000-0000-0000-0000-000000000001",
                      userId: 7,
                      role: "dispatcher",
                      isActive: true,
                      createdAt: "2026-10-01T00:00:00.000Z",
                      updatedAt: "2026-10-01T00:00:00.000Z",
                    },
                  },
                ]
              : [],
        })
    );

    await expect(getUserOrganizationMembership(7)).resolves.toBeNull();
  });

  it("supports the ministry, governorate, rural or city branch, station, and unit hierarchy", () => {
    expect(canOrganizationHaveParent("governorate", "central")).toBe(true);
    expect(canOrganizationHaveParent("police_department", "governorate")).toBe(
      true
    );
    expect(canOrganizationHaveParent("department", "governorate")).toBe(true);
    expect(canOrganizationHaveParent("station", "police_department")).toBe(
      true
    );
    expect(canOrganizationHaveParent("station", "department")).toBe(true);
    expect(canOrganizationHaveParent("unit", "station")).toBe(true);
    expect(canOrganizationHaveParent("police_department", "central")).toBe(
      false
    );
    expect(canOrganizationHaveParent("region", "governorate")).toBe(false);
    expect(canOrganizationHaveParent("station", "region")).toBe(false);
    expect(canOrganizationHaveParent("unit", "department")).toBe(false);
    expect(getAllowedOrganizationChildTypes("central")).toEqual([
      "governorate",
    ]);
    expect(getAllowedOrganizationChildTypes("governorate")).toEqual([
      "police_department",
      "department",
    ]);
    expect(getAllowedOrganizationChildTypes("police_department")).toEqual([
      "station",
    ]);
    expect(getAllowedOrganizationChildTypes("department")).toEqual(["station"]);
    expect(getAllowedOrganizationChildTypes("station")).toEqual(["unit"]);
    expect(getAllowedOrganizationChildTypes("region")).toEqual([]);
  });

  it("updates an existing Appwrite membership with the requested role", async () => {
    mocks.appwriteUpdateRow.mockResolvedValueOnce({
      $id: "membership-7",
      data: {
        id: 1,
        organizationId: "00000000-0000-0000-0000-000000000001",
        userId: 7,
        role: "reviewer",
        isActive: true,
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-02T00:00:00.000Z",
      },
    });

    await expect(
      addOrganizationMembership({
        organizationId: "00000000-0000-0000-0000-000000000001",
        userId: 7,
        role: "reviewer",
      })
    ).resolves.toMatchObject({ role: "reviewer", userId: 7 });

    expect(mocks.appwriteUpdateRow).toHaveBeenCalledWith(
      expect.objectContaining({
        databaseId: "wathaeqi-db",
        tableId: "organization_memberships",
        rowId: "membership-7",
        data: expect.objectContaining({
          role: "reviewer",
          isActive: true,
        }),
      })
    );
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("rotates the application session version when resetting the organization account password", async () => {
    mocks.maybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { id: 17 }, error: null });

    await expect(
      updateOrganizationAccount({
        organizationId: "00000000-0000-0000-0000-000000000001",
        username: "organization-account",
        password: "A-secure-password-123",
      })
    ).resolves.toEqual({
      username: "organization-account",
      passwordChanged: true,
    });

    const updatedValues = mocks.update.mock.calls[0]?.[0];
    expect(updatedValues).toEqual(
      expect.objectContaining({
        password_hash: "hashed-organization-password",
        mustChangePassword: true,
        sessionVersion: expect.any(String),
      })
    );
    expect(updatedValues).not.toHaveProperty("authUserId");
  });

  it("changes the owner's active organization through Appwrite", async () => {
    const organizationId = "00000000-0000-0000-0000-000000000009";
    mocks.getAppwriteProfileById.mockResolvedValueOnce({
      rowId: "owner-row",
      user: {
        id: 1,
        authUserId: "owner-auth-id",
        organizationId: "00000000-0000-0000-0000-000000000001",
        isActive: true,
        sessionVersion: "owner-session",
      },
    });
    mocks.appwriteListRows.mockImplementation(
      ({ tableId }: { tableId: string }) =>
        Promise.resolve({
          rows:
            tableId === "organizations"
              ? [
                  {
                    $id: organizationId,
                    data: {
                      id: organizationId,
                      code: "GOV-ALEPPO",
                      name: "قيادة الأمن الداخلي في حلب",
                      type: "governorate",
                      isActive: true,
                      createdAt: "2026-10-01T00:00:00.000Z",
                      updatedAt: "2026-10-01T00:00:00.000Z",
                    },
                  },
                ]
              : [
                  {
                    $id: "owner-membership",
                    data: {
                      id: 1,
                      organizationId: "00000000-0000-0000-0000-000000000001",
                      userId: 1,
                      role: "system_admin",
                      isActive: true,
                      createdAt: "2026-10-01T00:00:00.000Z",
                      updatedAt: "2026-10-01T00:00:00.000Z",
                    },
                  },
                ],
        })
    );

    await expect(
      selectPlatformOwnerWorkplace({
        user: { id: 1, username: ENV.ownerUsername, role: "admin" },
        organizationId,
      })
    ).resolves.toMatchObject({
      id: organizationId,
      name: "قيادة الأمن الداخلي في حلب",
    });

    expect(mocks.appwriteUpdateRow).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: "organization_memberships",
        rowId: "owner-membership",
        data: expect.objectContaining({
          organizationId,
          role: "system_admin",
        }),
      })
    );
    expect(mocks.appwriteUpdateRow).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: "users",
        rowId: "owner-row",
        data: expect.objectContaining({ organizationId }),
      })
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("updates the root central organization in Appwrite without a parent", async () => {
    const organizationId = "00000000-0000-4000-8000-000000000010";
    const existing = {
      id: organizationId,
      code: "CENTRAL",
      name: "القيادة المركزية",
      type: "central",
      parentOrganizationId: null,
      telegramDestinationOrganizationId: null,
      isActive: true,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    };
    const updated = {
      ...existing,
      name: "القيادة المركزية المحدثة",
      updatedAt: "2026-10-09T00:00:00.000Z",
    };
    mocks.appwriteListRows.mockResolvedValue({
      rows: [{ $id: organizationId, data: existing }],
    });
    mocks.appwriteUpdateRow.mockResolvedValueOnce({
      $id: organizationId,
      data: updated,
    });

    await expect(
      updateOrganization({
        id: organizationId,
        code: "CENTRAL",
        name: "القيادة المركزية المحدثة",
        type: "central",
        parentOrganizationId: null,
        telegramDestinationOrganizationId: null,
        isActive: true,
      })
    ).resolves.toMatchObject({
      id: organizationId,
      name: "القيادة المركزية المحدثة",
      type: "central",
      parentOrganizationId: null,
    });

    expect(mocks.appwriteUpdateRow).toHaveBeenCalledWith(
      expect.objectContaining({
        databaseId: "wathaeqi-db",
        tableId: "organizations",
        rowId: organizationId,
        data: expect.objectContaining({
          parentOrganizationId: null,
          name: "القيادة المركزية المحدثة",
        }),
      })
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects workplace selection for a non-owner before touching the database", async () => {
    await expect(
      selectPlatformOwnerWorkplace({
        user: { id: 8, username: "department-admin", role: "admin" },
        organizationId: "00000000-0000-0000-0000-000000000009",
      })
    ).rejects.toThrow("لا تملك صلاحية تغيير جهة العمل");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("does not select a missing or inactive organization", async () => {
    mocks.appwriteListRows.mockResolvedValueOnce({ rows: [] });

    await expect(
      selectPlatformOwnerWorkplace({
        user: { id: 1, username: ENV.ownerUsername, role: "admin" },
        organizationId: "00000000-0000-0000-0000-000000000009",
      })
    ).rejects.toThrow("الجهة غير موجودة أو غير مفعّلة");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("archives an organization through the atomic audited database procedure", async () => {
    const organizationId = "00000000-0000-4000-8000-000000000009";
    mocks.rpc.mockResolvedValueOnce({
      data: {
        organizationId,
        accountsDisabled: 1,
        deleted: true,
        auditHistoryRetained: true,
      },
      error: null,
    });

    await expect(
      archiveOrganizationSafely({
        organizationId,
        actorUserId: 1,
        actorName: "مالك النظام",
        actorRole: "admin",
        reason: "طلب مالك النظام",
      })
    ).resolves.toEqual({ organizationId, accountsDisabled: 1 });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "archive_organization_safely",
      expect.objectContaining({
        p_organization_id: organizationId,
        p_actor_user_id: 1,
        p_reason: "طلب مالك النظام",
      })
    );
  });
});
