import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAppwriteProfileById: vi.fn(),
}));

vi.mock("./_core/appwriteAuth", () => ({
  getAppwriteProfileById: mocks.getAppwriteProfileById,
}));

import { ENV } from "./_core/env";
import { isPlatformOwner, isPlatformOwnerUserId } from "./ownerAccess";

describe("isPlatformOwner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("recognizes the configured owner account with an admin role", () => {
    expect(
      isPlatformOwner({ username: ENV.ownerUsername, role: "admin" })
    ).toBe(true);
    expect(
      isPlatformOwner({
        username: ` ${ENV.ownerUsername.toUpperCase()} `,
        role: "admin",
      })
    ).toBe(true);
  });

  it("does not grant owner access to another administrator or a non-admin", () => {
    expect(isPlatformOwner({ username: "another-admin", role: "admin" })).toBe(
      false
    );
    expect(isPlatformOwner({ username: ENV.ownerUsername, role: "user" })).toBe(
      false
    );
    expect(isPlatformOwner(null)).toBe(false);
  });

  it("recognizes the persisted Appwrite owner flag if the configured name changes", () => {
    expect(
      isPlatformOwner({
        username: "the-persisted-owner",
        role: "admin",
        isPlatformOwner: true,
      })
    ).toBe(true);
  });

  it("loads the platform-owner identity from Appwrite", async () => {
    mocks.getAppwriteProfileById.mockResolvedValueOnce({
      user: {
        id: 1,
        username: ENV.ownerUsername,
        role: "admin",
        isPlatformOwner: true,
      },
    });

    await expect(isPlatformOwnerUserId(1)).resolves.toBe(true);
    expect(mocks.getAppwriteProfileById).toHaveBeenCalledWith(1);
  });

  it("returns false when the Appwrite profile is missing", async () => {
    mocks.getAppwriteProfileById.mockResolvedValueOnce(null);

    await expect(isPlatformOwnerUserId(404)).resolves.toBe(false);
  });

  it("propagates lookup errors instead of allowing uncertain owner access", async () => {
    mocks.getAppwriteProfileById.mockRejectedValueOnce(
      new Error("lookup failed")
    );

    await expect(isPlatformOwnerUserId(1)).rejects.toThrow("lookup failed");
  });
});
