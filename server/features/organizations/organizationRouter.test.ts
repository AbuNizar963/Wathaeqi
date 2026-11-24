import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveOrganizationScope: vi.fn(),
  renameOrganization: vi.fn(),
  writeAuditLog: vi.fn(),
  createManagedUser: vi.fn(),
  setOrganizationActive: vi.fn(),
  getOrganization: vi.fn(),
  ensureDepartmentSettings: vi.fn(),
  updateDepartmentSettings: vi.fn(),
}));

vi.mock("./organizationAccess", () => ({
  resolveOrganizationScope: mocks.resolveOrganizationScope,
}));

vi.mock("./organizationService", async importOriginal => {
  const actual = await importOriginal<typeof import("./organizationService")>();
  return {
    ...actual,
    renameOrganization: mocks.renameOrganization,
    getOrganization: mocks.getOrganization,
    setOrganizationActive: mocks.setOrganizationActive,
  };
});

vi.mock("../audit/appwriteAuditRepository", () => ({
  writeAuditLog: mocks.writeAuditLog,
}));

vi.mock("../users/userService", () => ({
  createManagedUser: mocks.createManagedUser,
  listManagedUsers: vi.fn(),
}));

vi.mock("../settings/departmentSettingsRepository", () => ({
  ensureDepartmentSettings: mocks.ensureDepartmentSettings,
  updateDepartmentSettings: mocks.updateDepartmentSettings,
}));

import { organizationRouter } from "./organizationRouter";

const adminScope = {
  userId: 7,
  organizationId: "org-current",
  role: "organization_admin",
  isOwner: false,
  organizationIds: ["org-current"],
  canManage: true,
  canAdministrate: true,
};

function caller() {
  return organizationRouter.createCaller({
    user: { id: 7, name: "Admin", organizationId: "org-current" },
  } as never);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.resolveOrganizationScope.mockResolvedValue(adminScope);
  mocks.renameOrganization.mockResolvedValue({
    id: "org-current",
    name: "الاسم الجديد",
  });
});

describe("platform-owner-only organization procedures", () => {
  it("rejects ordinary authenticated users before any privileged side effect", async () => {
    const api = caller();

    await expect(
      api.provisionAccount({
        organizationId: "org-target",
        name: "مستخدم جديد",
        username: "new.user",
        email: "new.user@example.com",
        password: "SecurePassword123",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      api.delete({ id: "org-target" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      api.purgeArchived({
        organizationId: "org-target",
        confirmation: "org-target",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      api.settings.get({ organizationId: "org-target" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      api.settings.update({
        organizationId: "org-target",
        departmentName: "الإدارة",
        unitName: "الوحدة",
        unitChiefRank: "رتبة",
        unitChiefName: "المسؤول",
        serialPrefix: "OUT",
        incomingSerialPrefix: "IN",
        serialStart: 1,
        incomingSerialStart: 1,
        timezone: "Europe/Paris",
        dateFormat: "yyyy-MM-dd",
        timeFormat: "24",
        numberSystem: "latin",
        logoUrl: null,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(mocks.createManagedUser).not.toHaveBeenCalled();
    expect(mocks.setOrganizationActive).not.toHaveBeenCalled();
    expect(mocks.getOrganization).not.toHaveBeenCalled();
    expect(mocks.ensureDepartmentSettings).not.toHaveBeenCalled();
    expect(mocks.updateDepartmentSettings).not.toHaveBeenCalled();
  });
});

describe("organizations.renameCurrent", () => {
  it("renames only the organization in the authenticated user's active scope and writes no audit entry", async () => {
    await expect(
      caller().renameCurrent({ name: " الاسم الجديد " })
    ).resolves.toEqual({
      organizationId: "org-current",
      organizationName: "الاسم الجديد",
    });

    expect(mocks.renameOrganization).toHaveBeenCalledWith(
      "org-current",
      "الاسم الجديد"
    );
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it("rejects a client-supplied organization ID rather than accepting it", async () => {
    await expect(
      caller().renameCurrent({
        name: "اسم جديد",
        organizationId: "org-other",
      } as never)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mocks.renameOrganization).not.toHaveBeenCalled();
  });

  it("denies users without organization administration permission", async () => {
    mocks.resolveOrganizationScope.mockResolvedValue({
      ...adminScope,
      canAdministrate: false,
    });

    await expect(
      caller().renameCurrent({ name: "اسم جديد" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.renameOrganization).not.toHaveBeenCalled();
  });
});
