import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isPlatformOwner: vi.fn(),
  getUserOrganizationMembership: vi.fn(),
}));

vi.mock("../../ownerAccess", () => ({
  isPlatformOwner: mocks.isPlatformOwner,
}));

vi.mock("./appwriteOwnerOrganizationRepository", () => ({
  getUserOrganizationMembership: mocks.getUserOrganizationMembership,
}));

import { resolveOrganizationScope } from "./organizationAccess";

const user = {
  id: 7,
  organizationId: "org-current",
} as never;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.isPlatformOwner.mockReturnValue(false);
  mocks.getUserOrganizationMembership.mockResolvedValue({
    organizationId: "org-current",
    role: "organization_admin",
    isActive: true,
  });
});

describe("resolveOrganizationScope in single-organization mode", () => {
  it("does not expand an administrator's scope to child organizations", async () => {
    const scope = await resolveOrganizationScope(user);

    expect(scope.organizationId).toBe("org-current");
    expect(scope.organizationIds).toEqual(["org-current"]);
  });

  it("keeps platform owners scoped to their fixed organization", async () => {
    mocks.isPlatformOwner.mockReturnValue(true);

    const scope = await resolveOrganizationScope(user);

    expect(scope.organizationIds).toEqual(["org-current"]);
  });
});
