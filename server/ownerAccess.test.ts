import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAppwriteProfileById: vi.fn(),
}));

vi.mock("./_core/appwriteAuth", () => ({
  getAppwriteProfileById: mocks.getAppwriteProfileById,
}));

import { isPlatformOwner, isPlatformOwnerUserId } from "./ownerAccess";

describe("isPlatformOwner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("recognizes only an explicitly flagged platform owner with admin role", () => {
    expect(
      isPlatformOwner({
        username: "AbuNizar",
        role: "admin",
        isPlatformOwner: true,
      })
    ).toBe(true);
  });

  it("does not grant owner access based on username or admin role alone", () => {
    expect(
      isPlatformOwner({
        username: "AbuNizar",
        role: "admin",
        isPlatformOwner: false,
      })
    ).toBe(false);
    expect(
      isPlatformOwner({
        username: "another-admin",
        role: "admin",
        isPlatformOwner: true,
      })
    ).toBe(true);
    expect(
      isPlatformOwner({
        username: "AbuNizar",
        role: "user",
        isPlatformOwner: true,
      })
    ).toBe(false);
    expect(isPlatformOwner(null)).toBe(false);
  });

  it("loads owner identity from the Appwrite user profile", async () => {
    mocks.getAppwriteProfileById.mockResolvedValueOnce({
      user: {
        id: 1,
        username: "AbuNizar",
        role: "admin",
        isPlatformOwner: true,
      },
    });

    await expect(isPlatformOwnerUserId(1)).resolves.toBe(true);
    expect(mocks.getAppwriteProfileById).toHaveBeenCalledWith(1);
  });

  it("returns false when the target profile is missing", async () => {
    mocks.getAppwriteProfileById.mockResolvedValueOnce(null);

    await expect(isPlatformOwnerUserId(404)).resolves.toBe(false);
  });

  it("propagates lookup errors instead of allowing an uncertain assignment", async () => {
    mocks.getAppwriteProfileById.mockRejectedValueOnce(
      new Error("lookup failed")
    );

    await expect(isPlatformOwnerUserId(1)).rejects.toThrow("lookup failed");
  });
});
