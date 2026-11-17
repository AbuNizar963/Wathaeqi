import { describe, expect, it, vi } from "vitest";
import * as appwriteAuth from "../../_core/appwriteAuth";
import type { TrpcContext } from "../../_core/context";
import { appRouter } from "../../routers";

vi.mock("../../_core/appwriteAuth", async importOriginal => {
  const actual =
    await importOriginal<typeof import("../../_core/appwriteAuth")>();
  return {
    ...actual,
    changeAppwritePassword: vi.fn(),
    dismissAppwritePasswordChange: vi.fn(),
    updateAppwriteUserProfile: vi.fn(),
  };
});

function contextFor(
  overrides: Partial<NonNullable<TrpcContext["user"]>> = {}
): TrpcContext {
  const now = new Date();
  return {
    user: {
      id: 9,
      authUserId: "00000000-0000-4000-8000-000000000009",
      name: "Test Officer",
      badgeNumber: null,
      email: "officer@example.com",
      loginMethod: "appwrite",
      role: "user",
      mustChangePassword: false,
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
      ...overrides,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("profile router", () => {
  const caller = () => appRouter.createCaller(contextFor());

  it("returns the authenticated user's profile", async () => {
    const context = contextFor();
    await expect(
      appRouter.createCaller(context).profile.get()
    ).resolves.toEqual(context.user);
  });

  it("allows temporary-password users to access the password-change profile", async () => {
    const context = contextFor({ mustChangePassword: true });
    await expect(
      appRouter.createCaller(context).profile.get()
    ).resolves.toEqual(context.user);
  });

  it("rejects managed-account passwords shorter than twelve characters", async () => {
    await expect(
      appRouter
        .createCaller(contextFor({ role: "admin" }))
        .userManagement.create({
          name: "Test Officer",
          username: "test-officer",
          password: "short",
        })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects names shorter than two characters", async () => {
    await expect(
      caller().profile.update({
        name: "أ",
        badgeNumber: null,
        phone: null,
        rank: null,
        unit: null,
        bio: null,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects profile fields that exceed their validation limits", async () => {
    await expect(
      caller().profile.update({
        name: "ضابط تجريبي",
        badgeNumber: "B".repeat(81),
        phone: null,
        rank: null,
        unit: null,
        bio: null,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("requires a non-empty current password", async () => {
    await expect(
      caller().profile.changePassword({
        currentPassword: "",
        newPassword: "A-secure-password-123",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("requires a new password of at least twelve characters", async () => {
    await expect(
      caller().profile.changePassword({
        currentPassword: "current-password",
        newPassword: "short",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("changes the password through Appwrite and refreshes this device", async () => {
    vi.mocked(appwriteAuth.changeAppwritePassword).mockResolvedValue({
      ...contextFor().user!,
      sessionVersion: "00000000-0000-4000-8000-000000000099",
      mustChangePassword: false,
    } as never);

    const context = contextFor();
    await appRouter.createCaller(context).profile.changePassword({
      currentPassword: "old-pass",
      newPassword: "new-password-123",
    });

    expect(appwriteAuth.changeAppwritePassword).toHaveBeenCalledWith(
      context.req,
      context.res,
      "old-pass",
      "new-password-123"
    );
  });
});
