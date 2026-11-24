import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveOrganizationScope: vi.fn(),
  renameOrganization: vi.fn(),
  writeAuditLog: vi.fn(),
}));

vi.mock("./organizationAccess", () => ({
  resolveOrganizationScope: mocks.resolveOrganizationScope,
}));

vi.mock("./organizationService", async importOriginal => {
  const actual = await importOriginal<typeof import("./organizationService")>();
  return { ...actual, renameOrganization: mocks.renameOrganization };
});

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

  it("returns no routing destinations or descendants", async () => {
    await expect(caller().routingTargets()).resolves.toEqual([]);
    await expect(caller().descendants()).resolves.toEqual([]);
    await expect(caller().routingDirectory()).resolves.toEqual([]);
  });
});
