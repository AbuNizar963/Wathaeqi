import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isPlatformOwner: vi.fn(),
  getUserOrganizationMembership: vi.fn(),
  getOrganizationByCode: vi.fn(),
}));

vi.mock("../../ownerAccess", () => ({
  isPlatformOwner: mocks.isPlatformOwner,
}));

vi.mock("./appwriteOwnerOrganizationRepository", () => ({
  getUserOrganizationMembership: mocks.getUserOrganizationMembership,
}));

vi.mock("./organizationService", () => ({
  getOrganizationByCode: mocks.getOrganizationByCode,
}));

import { resolveOrganizationScope } from "./organizationAccess";

const user = {
  id: 7,
  organizationId: "legacy-profile-organization",
} as never;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.isPlatformOwner.mockReturnValue(false);
  mocks.getOrganizationByCode.mockResolvedValue({
    id: "wathaeqi-test-central",
    code: "ALSHAHBAA",
    name: "قسم شرطة الشهباء",
    isActive: true,
    deletedAt: null,
  });
  mocks.getUserOrganizationMembership.mockResolvedValue({
    organizationId: "wathaeqi-test-central",
    role: "organization_admin",
    isActive: true,
  });
});

describe("resolveOrganizationScope in single-organization mode", () => {
  it("uses the global fixed organization instead of the profile organization", async () => {
    const scope = await resolveOrganizationScope(user);

    expect(scope.organizationId).toBe("wathaeqi-test-central");
    expect(scope.organizationIds).toEqual(["wathaeqi-test-central"]);
    expect(mocks.getOrganizationByCode).toHaveBeenCalledWith("ALSHAHBAA");
  });

  it("keeps platform owners scoped to the fixed organization", async () => {
    mocks.isPlatformOwner.mockReturnValue(true);

    const scope = await resolveOrganizationScope(user);

    expect(scope.organizationIds).toEqual(["wathaeqi-test-central"]);
  });

  it("rejects users whose active membership belongs to another organization", async () => {
    mocks.getUserOrganizationMembership.mockResolvedValue({
      organizationId: "legacy-other-organization",
      role: "organization_admin",
      isActive: true,
    });

    await expect(resolveOrganizationScope(user)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("fails closed if the configured organization is missing", async () => {
    mocks.getOrganizationByCode.mockResolvedValue(null);

    await expect(resolveOrganizationScope(user)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
  });
});
