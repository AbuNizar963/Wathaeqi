import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveTelegramScope: vi.fn(),
  listManagedUsers: vi.fn(),
}));

vi.mock("../telegrams/telegramAccess", () => ({
  resolveTelegramScope: mocks.resolveTelegramScope,
}));
vi.mock("../users/userService", () => ({
  listManagedUsers: mocks.listManagedUsers,
  createManagedUser: vi.fn(),
}));

import { notificationRouter } from "../notifications/notificationRouter";
import { organizationRouter } from "../organizations/organizationRouter";

const user = {
  id: 7,
  authUserId: "auth-7",
  username: "member-7",
  email: "member@example.test",
  name: "Member",
  role: "user" as const,
  organizationId: "org-allowed",
  isPlatformOwner: false,
};

const context = (currentUser: typeof user | null = user) => ({
  user: currentUser,
  req: {} as never,
  res: {} as never,
});

describe("legacy compatibility aliases", () => {
  it("requires authentication for notification config", async () => {
    const caller = notificationRouter.createCaller(context(null));
    await expect(caller.config()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("rejects account reads outside the authenticated organization scope", async () => {
    mocks.resolveTelegramScope.mockResolvedValueOnce({
      userId: user.id,
      organizationId: "org-allowed",
      role: "member",
      isOwner: false,
      organizationIds: ["org-allowed"],
      canManage: false,
      canAdministrate: false,
    });
    const caller = organizationRouter.createCaller(context());
    await expect(
      caller.accounts({ organizationId: "org-other" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.listManagedUsers).not.toHaveBeenCalled();
  });
});
