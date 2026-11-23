import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { EncryptJWT, jwtDecrypt } from "jose";

const mocks = vi.hoisted(() => ({
  listRows: vi.fn(),
  updateRow: vi.fn(),
  createEmailPasswordSession: vi.fn(),
  get: vi.fn(),
  deleteSession: vi.fn(),
  updatePassword: vi.fn(),
  getAppwriteSessionClient: vi.fn((secret?: string) => ({ secret })),
  getAppwriteAdminClient: vi.fn(() => ({ admin: true })),
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
  getAppwriteAdminClient: mocks.getAppwriteAdminClient,
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
  changeAppwritePassword,
  createAppwriteSessionToken,
  deleteCurrentAppwriteSession,
  getAppwriteAuthenticatedUserFromRequest,
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

const createBearerToken = async (sessionVersion: string) => {
  const token = await new EncryptJWT({
    appwriteSessionSecret: "appwrite-session-secret",
    sessionVersion,
  })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM", typ: "JWT" })
    .setIssuer("wathaeqi-api")
    .setAudience("wathaeqi-client")
    .setSubject("1")
    .setIssuedAt()
    .setExpirationTime("1h")
    .encrypt(
      createHash("sha256")
        .update("wathaeqi-appwrite-session-token-v1\0")
        .update("test-only-session-secret-with-more-than-32-chars")
        .digest()
    );
  return `Bearer ${token}`;
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
        authorization: await createBearerToken("session-version-1"),
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
        authorization: await createBearerToken("stale-session-version"),
      },
    } as never;

    await expect(
      getAppwriteAuthenticatedUserFromRequest(request)
    ).resolves.toBeNull();
  });

  it("issues a short-lived encrypted session token without a cookie", async () => {
    const token = await createAppwriteSessionToken(session as never, {
      id: 1,
      authUserId: "appwrite-user-id",
      sessionVersion: "session-version-1",
    });
    const { payload } = await jwtDecrypt(
      token,
      createHash("sha256")
        .update("wathaeqi-appwrite-session-token-v1\0")
        .update("test-only-session-secret-with-more-than-32-chars")
        .digest(),
      {
        keyManagementAlgorithms: ["dir"],
        contentEncryptionAlgorithms: ["A256GCM"],
        issuer: "wathaeqi-api",
        audience: "wathaeqi-client",
      }
    );
    expect(token).not.toContain("appwrite-session-secret");
    expect(payload.appwriteSessionSecret).toBe("appwrite-session-secret");
    expect(payload.sessionVersion).toBe("session-version-1");
    expect(Number(payload.exp) - Number(payload.iat)).toBeLessThanOrEqual(
      12 * 60 * 60
    );
  });

  it("changes the Appwrite password and rotates the application session", async () => {
    const request = {
      headers: {
        authorization: await createBearerToken("session-version-1"),
      },
    } as never;
    const newSession = {
      secret: "new-appwrite-session-secret",
      expire: "2099-01-01T00:00:00.000Z",
    };
    mocks.createEmailPasswordSession.mockResolvedValueOnce(newSession);

    const updated = await changeAppwritePassword(
      request,
      "old-password",
      "new-strong-password-123"
    );

    expect(updated.user.mustChangePassword).toBe(false);
    expect(updated.user.sessionVersion).not.toBe("session-version-1");
    expect(updated.sessionToken).toEqual(expect.any(String));
    expect(mocks.updatePassword).toHaveBeenCalledWith({
      password: "new-strong-password-123",
      oldPassword: "old-password",
    });
    expect(mocks.createEmailPasswordSession).toHaveBeenCalledWith({
      email: "owner@example.com",
      password: "new-strong-password-123",
    });
    expect(mocks.updateRow).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: "users",
        rowId: "1",
        data: expect.objectContaining({
          mustChangePassword: false,
        }),
      })
    );
    expect(mocks.deleteSession).toHaveBeenCalledWith({
      sessionId: "current",
    });
    mocks.listRows.mockResolvedValue({
      rows: [{ ...profileRow, sessionVersion: updated.user.sessionVersion }],
      total: 1,
    });

    await expect(
      getAppwriteAuthenticatedUserFromRequest({
        headers: { authorization: `Bearer ${updated.sessionToken}` },
      } as never)
    ).resolves.toMatchObject({
      id: 1,
      sessionVersion: updated.user.sessionVersion,
    });
    expect(mocks.getAppwriteSessionClient).toHaveBeenCalledWith(
      "new-appwrite-session-secret"
    );
    await expect(
      getAppwriteAuthenticatedUserFromRequest(request)
    ).resolves.toBeNull();
  });

  it("does not rotate a session when the current password is incorrect", async () => {
    const request = {
      headers: {
        authorization: await createBearerToken("session-version-1"),
      },
    } as never;
    mocks.updatePassword.mockRejectedValueOnce({ code: 401 });

    await expect(
      changeAppwritePassword(request, "wrong", "new-password-123")
    ).rejects.toMatchObject({ name: "AppwriteInvalidCurrentPasswordError" });
    expect(mocks.updateRow).not.toHaveBeenCalled();
    expect(mocks.createEmailPasswordSession).not.toHaveBeenCalled();
  });

  it("does not authenticate from a cookie", async () => {
    const bearerToken = await createBearerToken("session-version-1");
    await expect(
      getAppwriteAuthenticatedUserFromRequest({
        headers: {
          cookie: `police_telegrams_session=${bearerToken.slice("Bearer ".length)}`,
        },
      } as never)
    ).resolves.toBeNull();
  });

  it("revokes the Appwrite session during logout", async () => {
    await deleteCurrentAppwriteSession({
      headers: {
        authorization: await createBearerToken("session-version-1"),
      },
    } as never);

    expect(mocks.deleteSession).toHaveBeenCalledWith({ sessionId: "current" });
  });
});
