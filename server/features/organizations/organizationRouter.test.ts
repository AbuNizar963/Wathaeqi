import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveOrganizationScope: vi.fn(),
  renameOrganization: vi.fn(),
  getOrganization: vi.fn(),
  ensureDepartmentSettings: vi.fn(),
  updateDepartmentSettings: vi.fn(),
  writeAuditLog: vi.fn(),
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
  };
});

vi.mock("../settings/departmentSettingsRepository", () => ({
  ensureDepartmentSettings: mocks.ensureDepartmentSettings,
  updateDepartmentSettings: mocks.updateDepartmentSettings,
}));

vi.mock("../audit/appwriteAuditRepository", () => ({
  writeAuditLog: mocks.writeAuditLog,
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
  mocks.getOrganization.mockResolvedValue({
    id: "org-current",
    name: "قسم شرطة الشهباء",
  });
  mocks.ensureDepartmentSettings.mockResolvedValue({
    departmentName: "قسم شرطة الشهباء",
    unitName: "وحدة العمليات",
    unitChiefRank: "العقيد",
    unitChiefName: "رئيس الوحدة",
    serialPrefix: "POL",
    incomingSerialPrefix: "POL",
    serialStart: 1,
    incomingSerialStart: 1,
    timezone: "Asia/Riyadh",
    dateFormat: "yyyy/MM/dd HH:mm:ss",
    timeFormat: "24",
    numberSystem: "latin",
    logoUrl: null,
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

describe("organizations.settings", () => {
  const settingsInput = {
    organizationId: "org-current",
    departmentName: "قسم شرطة الشهباء",
    unitName: "وحدة العمليات",
    unitChiefRank: "العقيد",
    unitChiefName: "رئيس الوحدة",
    serialPrefix: "POL",
    incomingSerialPrefix: "POL",
    serialStart: 1,
    incomingSerialStart: 1,
    timezone: "Asia/Riyadh",
    dateFormat: "yyyy/MM/dd HH:mm:ss",
    timeFormat: "24" as const,
    numberSystem: "latin" as const,
    logoUrl: null,
  };

  it("allows an authorized organization administrator to read fixed-organization settings", async () => {
    await expect(
      caller().settings.get({ organizationId: "org-current" })
    ).resolves.toMatchObject({
      organizationId: "org-current",
      organizationName: "قسم شرطة الشهباء",
    });

    expect(mocks.ensureDepartmentSettings).toHaveBeenCalledWith("org-current");
  });

  it("allows an authorized organization administrator to update fixed-organization settings", async () => {
    await expect(
      caller().settings.update(settingsInput)
    ).resolves.toMatchObject({
      organizationId: "org-current",
      organizationName: "قسم شرطة الشهباء",
    });

    expect(mocks.updateDepartmentSettings).toHaveBeenCalledWith(
      "org-current",
      expect.objectContaining({
        departmentName: "قسم شرطة الشهباء",
        serialPrefix: "POL",
        incomingSerialPrefix: "POL",
      }),
      7
    );
  });

  it("denies settings access when the active role cannot administrate", async () => {
    mocks.resolveOrganizationScope.mockResolvedValue({
      ...adminScope,
      canAdministrate: false,
    });

    await expect(
      caller().settings.get({ organizationId: "org-current" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.ensureDepartmentSettings).not.toHaveBeenCalled();
  });

  it("rejects settings requests for an organization outside the fixed scope", async () => {
    await expect(
      caller().settings.get({ organizationId: "org-other" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.ensureDepartmentSettings).not.toHaveBeenCalled();
  });
});

describe("single-organization mode", () => {
  it("blocks creating additional organizations", async () => {
    await expect(
      caller().create({
        name: "جهة إضافية",
        code: "EXTRA",
        type: "department",
        parentOrganizationId: null,
      })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("does not let platform owners read organizations outside their fixed scope", async () => {
    mocks.resolveOrganizationScope.mockResolvedValue({
      ...adminScope,
      isOwner: true,
    });

    await expect(caller().get({ id: "org-other" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("returns no routing destinations or descendants", async () => {
    await expect(caller().routingTargets()).resolves.toEqual([]);
    await expect(caller().descendants()).resolves.toEqual([]);
    await expect(caller().routingDirectory()).resolves.toEqual([]);
  });
});
