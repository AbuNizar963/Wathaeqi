import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../../_core/context";

const mocks = vi.hoisted(() => ({
  listRows: vi.fn(),
  createRow: vi.fn(),
  updateRow: vi.fn(),
  deleteRow: vi.fn(),
  createAuthUser: vi.fn(),
  updatePassword: vi.fn(),
  updateStatus: vi.fn(),
  updateEmail: vi.fn(),
  updateName: vi.fn(),
  deleteAuthUser: vi.fn(),
  getProfileById: vi.fn(),
  verifyPassword: vi.fn(),
  getOrganizationById: vi.fn(),
  listAllOrganizations: vi.fn(),
  addOrganizationMembership: vi.fn(),
  assertCanManageOrganization: vi.fn(),
  getManagedOrganizationIds: vi.fn(),
  assertScopedUserManagementAccess: vi.fn(),
  getMembership: vi.fn(),
  writeAuditLog: vi.fn(),
}));

vi.mock("../../_core/appwrite", () => ({
  getAppwriteDatabaseId: () => "test-database",
  getAppwriteTablesDB: () => ({
    listRows: mocks.listRows,
    createRow: mocks.createRow,
    updateRow: mocks.updateRow,
    deleteRow: mocks.deleteRow,
  }),
  getAppwriteUsers: () => ({
    create: mocks.createAuthUser,
    updatePassword: mocks.updatePassword,
    updateStatus: mocks.updateStatus,
    updateEmail: mocks.updateEmail,
    updateName: mocks.updateName,
    delete: mocks.deleteAuthUser,
  }),
}));

vi.mock("../../_core/appwriteAuth", () => ({
  getAppwriteProfileById: mocks.getProfileById,
  verifyAppwriteUserPassword: mocks.verifyPassword,
}));

vi.mock("../../_core/supabase", () => ({
  getSupabaseAdmin: vi.fn(() => {
    throw new Error("Legacy Supabase access is not expected in these tests");
  }),
}));

vi.mock("../../db", () => ({
  writeAuditLog: mocks.writeAuditLog,
}));

vi.mock("../organizations/organization", () => ({
  addOrganizationMembership: mocks.addOrganizationMembership,
  getOrganizationById: mocks.getOrganizationById,
  listAllOrganizations: mocks.listAllOrganizations,
  getUserOrganizationMembership: mocks.getMembership,
}));

vi.mock("../organizations/organizationScope", () => ({
  assertCanManageOrganization: mocks.assertCanManageOrganization,
  getManagedOrganizationIds: mocks.getManagedOrganizationIds,
  assertScopedUserManagementAccess: mocks.assertScopedUserManagementAccess,
  canManageAllOrganizations: (user: { role?: string | null }) => user.role === "admin",
}));

import { userManagementRouter } from "./userManagementRouter";

const organizationId = "00000000-0000-4000-8000-000000000025";
const ownerId = "00000000-0000-4000-8000-000000000001";
const targetAuthId = "00000000-0000-4000-8000-000000000025";

function profile(overrides: Record<string, unknown> = {}): {
  rowId: string;
  user: Record<string, unknown>;
} {
  return {
    rowId: "profile-row",
    user: {
      id: 25,
      authUserId: targetAuthId,
      organizationId,
      username: "officer25",
      name: "الشرطي التجريبي",
      email: "officer25@accounts.wathaeqi.invalid",
      badgeNumber: null,
      phone: null,
      rank: null,
      unit: null,
      role: "user",
      loginMethod: "password",
      isActive: true,
      mustChangePassword: false,
      sessionVersion: "session-v1",
      updatedAt: new Date("2026-10-12T12:00:00.000Z"),
      ...overrides,
    },
  };
}

function adminContext(): TrpcContext {
  const now = new Date();
  return {
    user: {
      id: 1,
      authUserId: ownerId,
      name: "مالك النظام",
      badgeNumber: null,
      email: "owner@example.com",
      username: "owner",
      loginMethod: "password",
      role: "admin",
      mustChangePassword: false,
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("Appwrite user management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listRows.mockResolvedValue({ rows: [] });
    mocks.createRow.mockImplementation(async ({ data }) => ({
      $id: "profile-row",
      data: { ...data, id: 25 },
    }));
    mocks.updateRow.mockImplementation(async ({ data }) => ({
      $id: "profile-row",
      data: { id: 25, ...data },
    }));
    mocks.deleteRow.mockResolvedValue({});
    mocks.createAuthUser.mockResolvedValue({ $id: targetAuthId });
    mocks.updatePassword.mockResolvedValue({});
    mocks.updateStatus.mockResolvedValue({});
    mocks.updateEmail.mockResolvedValue({});
    mocks.updateName.mockResolvedValue({});
    mocks.deleteAuthUser.mockResolvedValue({});
    mocks.getProfileById.mockImplementation(async (id: number) =>
      id === 1
        ? {
            rowId: "owner-row",
            user: {
              id: 1,
              authUserId: ownerId,
              username: "owner",
              email: "owner@example.com",
              role: "admin",
            },
          }
        : profile()
    );
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.getOrganizationById.mockResolvedValue({
      id: organizationId,
      name: "قسم الاختبار",
      isActive: true,
      deletedAt: null,
    });
    mocks.listAllOrganizations.mockResolvedValue([
      { id: organizationId, name: "قسم الاختبار", isActive: true },
    ]);
    mocks.addOrganizationMembership.mockResolvedValue({});
    mocks.assertCanManageOrganization.mockResolvedValue(undefined);
    mocks.getManagedOrganizationIds.mockResolvedValue([organizationId]);
    mocks.assertScopedUserManagementAccess.mockResolvedValue(undefined);
    mocks.getMembership.mockResolvedValue(null);
    mocks.writeAuditLog.mockResolvedValue(undefined);
  });

  it("creates an Appwrite account, profile, and organization membership", async () => {
    const caller = userManagementRouter.createCaller(adminContext());

    await expect(
      caller.create({
        organizationId,
        name: "الشرطي التجريبي",
        username: "officer25",
        password: "A-secure-password-123",
      })
    ).resolves.toMatchObject({
      id: 25,
      organizationId,
      username: "officer25",
    });

    expect(mocks.createAuthUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: expect.any(String),
        email: expect.stringMatching(/@accounts\.wathaeqi\.invalid$/),
        password: "A-secure-password-123",
      })
    );
    expect(mocks.createRow).toHaveBeenCalledWith(
      expect.objectContaining({
        databaseId: "test-database",
        tableId: "users",
        data: expect.objectContaining({
          organizationId,
          username: "officer25",
          mustChangePassword: true,
          isActive: true,
        }),
      })
    );
    expect(mocks.addOrganizationMembership).toHaveBeenCalledWith({
      organizationId,
      userId: 25,
      role: "dispatcher",
    });
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user.create" })
    );
  });

  it("rejects a duplicate username before creating an Appwrite account", async () => {
    mocks.listRows.mockResolvedValue({
      rows: [
        {
          $id: "existing-profile",
          data: { id: 40, username: "officer25" },
        },
      ],
    });
    const caller = userManagementRouter.createCaller(adminContext());

    await expect(
      caller.create({
        organizationId,
        name: "الشرطي التجريبي",
        username: "officer25",
        password: "A-secure-password-123",
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(mocks.createAuthUser).not.toHaveBeenCalled();
    expect(mocks.createRow).not.toHaveBeenCalled();
  });

  it("disables an account in Appwrite and rotates its application session", async () => {
    const caller = userManagementRouter.createCaller(adminContext());

    await expect(
      caller.disable({ id: 25, confirmPassword: "owner-password" })
    ).resolves.toMatchObject({ success: true });

    expect(mocks.updateStatus).toHaveBeenCalledWith({
      userId: targetAuthId,
      status: false,
    });
    expect(mocks.updateRow).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: "users",
        rowId: "profile-row",
        data: expect.objectContaining({
          loginMethod: "disabled",
          isActive: false,
          sessionVersion: expect.any(String),
        }),
      })
    );
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user.disable" })
    );
  });

  it("reactivates a disabled Appwrite account and requires a new password", async () => {
    mocks.getProfileById.mockImplementation(async (id: number) =>
      id === 1
        ? {
            rowId: "owner-row",
            user: {
              id: 1,
              authUserId: ownerId,
              username: "owner",
              email: "owner@example.com",
              role: "admin",
            },
          }
        : profile({ loginMethod: "disabled", isActive: false })
    );
    const caller = userManagementRouter.createCaller(adminContext());

    await expect(
      caller.enable({
        id: 25,
        password: "A-new-secure-password-123",
        confirmPassword: "owner-password",
      })
    ).resolves.toMatchObject({ success: true });

    expect(mocks.updatePassword).toHaveBeenCalledWith({
      userId: targetAuthId,
      password: "A-new-secure-password-123",
    });
    expect(mocks.updateStatus).toHaveBeenCalledWith({
      userId: targetAuthId,
      status: true,
    });
    expect(mocks.updateRow).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: "users",
        rowId: "profile-row",
        data: expect.objectContaining({
          loginMethod: "password",
          isActive: true,
          mustChangePassword: true,
          sessionVersion: expect.any(String),
        }),
      })
    );
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user.enable" })
    );
  });
});
