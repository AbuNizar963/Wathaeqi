import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";

const mocks = vi.hoisted(() => ({
  listRows: vi.fn(),
  updateRow: vi.fn(),
  createEmailPasswordSession: vi.fn(),
  get: vi.fn(),
  deleteSession: vi.fn(),
  updatePassword: vi.fn(),
  getAppwriteSessionClient: vi.fn((secret?: string) => ({ secret })),
}));

vi.mock("node-appwrite", () => ({
  Account: class MockAccount {
    createEmailPasswordSession(...args: unknown[]) {
      return mocks.createEmailPasswordSession(...args);
    }

    get() {
      return mocks.get();
    }

    deleteSession(...args: unknown[]) {
      return mocks.deleteSession(...args);
    }

    updatePassword(...args: unknown[]) {
      return mocks.updatePassword(...args);
    }
  },
  Query: {
    equal: (attribute: string, value: unknown) =>
      JSON.stringify({ method: "equal", attribute, values: [value] }),
    limit: (value: number) =>
      JSON.stringify({ method: "limit", values: [value] }),
  },
}));

vi.mock("./appwrite", () => ({
  getAppwriteDatabaseId: () => "wathaeqi-db",
  getAppwriteSessionClient: mocks.getAppwriteSessionClient,
  getAppwriteTablesDB: () => ({
    listRows: mocks.listRows,
    updateRow: mocks.updateRow,
  }),
}));

vi.mock("./env", () => ({
  ENV: {
    isProduction: true,
    authSessionSecret: "test-only-session-secret-with-more-than-32-chars",
  },
}));

import {
  authenticateAppwriteUser,
  clearAppwriteSessionCookie,
  getAppwriteAuthenticatedUserFromRequest,
  setAppwriteSessionCookie,
} from "./appwriteAuth";

const profileRow = {
  $id: "1",
  id: 1,
  authUserId: "appwrite-user-id",
  sessionVersion: "session-version-1",
  organizationId: "wathaeqi-test-central",
  name: "AbuNizar",
  username: "AbuNizar",
  email: "owner@example.com",
  loginMethod: "appwrite",
  isActive: true,
  isPlatformOwner: true,
  mustChangePassword: true,
  role: "admin",
  createdAt: "2026-11-17T21:42:00.000Z",
  updatedAt: "2026-11-17T21:42:00.000Z",
  lastSignedIn: "2026-11-17T21:42:00.000Z",
};

const session = {
  secret: "appwrite-session-secret",
  expire: "2099-01-01T00:00:00.000Z",
};

const createSessionCookie = async (sessionVersion: string) => {
  const token = await new SignJWT({
    appwriteSessionSecret: "appwrite-session-secret",
    sessionVersion,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("1")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(
      new TextEncoder().encode(
        "test-only-session-secret-with-more-than-32-chars"
      )
    );
  return `police_telegrams_session=${token}`;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listRows.mockResolvedValue({ rows: [profileRow], total: 1 });
  mocks.createEmailPasswordSession.mockResolvedValue(session);
  mocks.get.mockResolvedValue({ $id: "appwrite-user-id" });
  mocks.deleteSession.mockResolvedValue({});
  mocks.updatePassword.mockResolvedValue({});
  mocks.updateRow.mockResolvedValue({});
});

describe("Appwrite authentication adapter", () => {
  it("authenticates an Appwrite user", async () => {
    const result = await authenticateAppwriteUser(
      "AbuNizar",
      "strong-test-secret"
    );

    expect(result?.user.isPlatformOwner).toBe(true);
    expect(result?.user.role).toBe("admin");
    expect(result?.user.passwordHash).toBeNull();
    expect(mocks.createEmailPasswordSession).toHaveBeenCalledWith({
      email: "owner@example.com",
      password: "strong-test-secret",
    });
    expect(mocks.updateRow).toHaveBeenCalledWith(
      expect.objectContaining({
        databaseId: "wathaeqi-db",
        tableId: "users",
        rowId: "1",
      })
    );
  });

  it("rejects a mismatched Appwrite identity", async () => {
    mocks.get.mockResolvedValueOnce({ $id: "different-user-id" });

    const result = await authenticateAppwriteUser(
      "AbuNizar",
      "strong-test-secret"
    );

    expect(result).toBeNull();
    expect(mocks.deleteSession).toHaveBeenCalledWith({
      sessionId: "current",
    });
    expect(mocks.updateRow).not.toHaveBeenCalled();
  });

  it("validates the signed Appwrite session", async () => {
    const request = {
      headers: {
        cookie: await createSessionCookie("session-version-1"),
      },
    } as never;

    const user = await getAppwriteAuthenticatedUserFromRequest(request);

    expect(user?.authUserId).toBe("appwrite-user-id");
    expect(mocks.getAppwriteSessionClient).toHaveBeenCalledWith(
      "appwrite-session-secret"
    );
  });

  it("rejects stale session versions", async () => {
    const request = {
      headers: {
        cookie: await createSessionCookie("stale-session-version"),
      },
    } as never;

    await expect(
      getAppwriteAuthenticatedUserFromRequest(request)
    ).resolves.toBeNull();
  });

  it("sets secure session cookies", async () => {
    const response = { setHeader: vi.fn() } as never;

    await setAppwriteSessionCookie(response, session as never, {
      id: 1,
      authUserId: "appwrite-user-id",
      sessionVersion: "session-version-1",
    });

    expect(response.setHeader).toHaveBeenCalledWith(
      "Set-Cookie",
      expect.stringContaining("HttpOnly")
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      "Set-Cookie",
      expect.stringContaining("Secure")
    );
  });

  it("clears the session cookie", () => {
    const response = { setHeader: vi.fn() } as never;

    clearAppwriteSessionCookie(response);

    expect(response.setHeader).toHaveBeenCalledWith(
      "Set-Cookie",
      expect.stringContaining("Max-Age=0")
    );
  });
});
