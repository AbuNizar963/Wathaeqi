import { createHash, randomUUID } from "node:crypto";
import { Account, Query } from "node-appwrite";
import { EncryptJWT, jwtDecrypt } from "jose";
import type { Request } from "express";
import type { User } from "./user";
import {
  getAppwriteAdminClient,
  getAppwriteDatabaseId,
  getAppwriteSessionClient,
  getAppwriteTablesDB,
} from "./appwrite";
import { ENV } from "./env";

const USERS_TABLE_ID = "users";
const SESSION_TOKEN_TTL_SECONDS = 12 * 60 * 60;

type AppwriteSession = Awaited<
  ReturnType<Account["createEmailPasswordSession"]>
>;

// This is surfaced as a safe, actionable login error without exposing Appwrite internals.
export class AppwritePasswordResetRequiredError extends Error {
  constructor() {
    super("Appwrite requires the user to reset their password");
    this.name = "AppwritePasswordResetRequiredError";
  }
}

type AppwriteRow = Record<string, unknown> & {
  $id: string;
  data?: Record<string, unknown>;
};

type ProfileLookup = {
  rowId: string;
  user: User;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asDate(value: unknown, field: string): Date {
  const date = value instanceof Date ? value : new Date(String(value ?? ""));
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`Invalid Appwrite user profile field: ${field}`);
  }
  return date;
}

function mapProfileRow(row: AppwriteRow): ProfileLookup | null {
  const data = asRecord(row.data) ?? row;
  const id = Number(data.id);
  const authUserId = asNullableString(data.authUserId);
  const organizationId = asNullableString(data.organizationId);
  const username = asNullableString(data.username);

  if (
    !Number.isSafeInteger(id) ||
    id < 1 ||
    !authUserId ||
    !organizationId ||
    !username
  ) {
    return null;
  }

  const role = data.role === "admin" ? "admin" : "user";
  const user: User = {
    id,
    authUserId,
    sessionVersion: asNullableString(data.sessionVersion) ?? authUserId,
    organizationId,
    name: asNullableString(data.name),
    username,
    passwordHash: null,
    badgeNumber: asNullableString(data.badgeNumber),
    bio: asNullableString(data.bio),
    phone: asNullableString(data.phone),
    rank: asNullableString(data.rank),
    unit: asNullableString(data.unit),
    avatarKey: asNullableString(data.avatarKey),
    email: asNullableString(data.email),
    loginMethod: asNullableString(data.loginMethod) ?? "appwrite",
    isActive: data.isActive === true,
    isPlatformOwner: data.isPlatformOwner === true,
    mustChangePassword: data.mustChangePassword === true,
    role,
    createdAt: asDate(data.createdAt, "createdAt"),
    updatedAt: asDate(data.updatedAt, "updatedAt"),
    lastSignedIn: asDate(data.lastSignedIn, "lastSignedIn"),
  };

  return { rowId: row.$id, user };
}

async function listProfiles(query: string): Promise<ProfileLookup[]> {
  const result = await getAppwriteTablesDB().listRows({
    databaseId: getAppwriteDatabaseId(),
    tableId: USERS_TABLE_ID,
    queries: [query, Query.limit(2)],
    total: true,
  });

  return (result.rows as AppwriteRow[])
    .map(mapProfileRow)
    .filter((profile): profile is ProfileLookup => profile !== null);
}

export async function getAppwriteProfileByUsername(
  username: string
): Promise<ProfileLookup | null> {
  const normalized = username.trim();
  if (!normalized) return null;

  const profiles = await listProfiles(Query.equal("username", normalized));
  return profiles.length === 1 ? profiles[0] : null;
}

export async function getAppwriteProfileByAuthUserId(
  authUserId: string
): Promise<ProfileLookup | null> {
  if (!authUserId) return null;

  const profiles = await listProfiles(Query.equal("authUserId", authUserId));
  return profiles.length === 1 ? profiles[0] : null;
}

export async function getAppwriteProfileById(
  userId: number
): Promise<ProfileLookup | null> {
  if (!Number.isSafeInteger(userId) || userId < 1) return null;

  const profiles = await listProfiles(Query.equal("id", userId));
  return profiles.length === 1 ? profiles[0] : null;
}

async function updateLastSignedIn(profile: ProfileLookup): Promise<User> {
  const now = new Date();
  await getAppwriteTablesDB().updateRow({
    databaseId: getAppwriteDatabaseId(),
    tableId: USERS_TABLE_ID,
    rowId: profile.rowId,
    data: {
      lastSignedIn: now.toISOString(),
      updatedAt: now.toISOString(),
    },
  });

  return { ...profile.user, lastSignedIn: now, updatedAt: now };
}

export async function authenticateAppwriteUser(
  username: string,
  password: string
): Promise<{ user: User; session: AppwriteSession } | null> {
  getSessionTokenEncryptionKey();
  const profile = await getAppwriteProfileByUsername(username);
  if (
    !profile ||
    !profile.user.isActive ||
    profile.user.loginMethod === "disabled" ||
    !profile.user.email
  ) {
    return null;
  }

  // Server-side session creation must use the API-key client so Appwrite returns session.secret.
  const account = new Account(getAppwriteAdminClient());
  let session: AppwriteSession;
  try {
    session = await account.createEmailPasswordSession({
      email: profile.user.email,
      password,
    });
  } catch (error) {
    const appwriteError = asRecord(error);
    if (appwriteError?.type === "user_password_reset_required") {
      throw new AppwritePasswordResetRequiredError();
    }
    if (
      appwriteError?.code === 401 ||
      appwriteError?.type === "user_invalid_credentials"
    ) {
      return null;
    }
    throw error;
  }

  try {
    const authenticatedAccount = await new Account(
      getAppwriteSessionClient(session.secret)
    ).get();

    if (authenticatedAccount.$id !== profile.user.authUserId) {
      await new Account(getAppwriteSessionClient(session.secret))
        .deleteSession({ sessionId: "current" })
        .catch(() => undefined);
      return null;
    }

    let user = profile.user;
    try {
      user = await updateLastSignedIn(profile);
    } catch {
      // Sign-in must not fail only because a non-critical activity timestamp
      // could not be updated; authorization still comes from Appwrite Auth.
    }
    return { user, session };
  } catch (error) {
    await new Account(getAppwriteSessionClient(session.secret))
      .deleteSession({ sessionId: "current" })
      .catch(() => undefined);
    throw error;
  }
}

function getSessionTokenEncryptionKey(): Uint8Array {
  if (ENV.authSessionSecret.length < 32) {
    throw new Error("AUTH_SESSION_SECRET must contain at least 32 characters");
  }
  return createHash("sha256")
    .update("wathaeqi-appwrite-session-token-v1\0")
    .update(ENV.authSessionSecret)
    .digest();
}

type SessionClaims = {
  appwriteSessionSecret: string;
  sessionVersion: string;
  userId: number;
};

async function readSessionClaims(req: Request): Promise<SessionClaims | null> {
  const authorization = req.headers.authorization;
  const match =
    typeof authorization === "string"
      ? /^Bearer\s+([A-Za-z0-9._~-]{1,16384})$/i.exec(authorization.trim())
      : null;
  const token = match?.[1];
  if (!token) return null;

  try {
    const { payload } = await jwtDecrypt(
      token,
      getSessionTokenEncryptionKey(),
      {
        keyManagementAlgorithms: ["dir"],
        contentEncryptionAlgorithms: ["A256GCM"],
        issuer: "wathaeqi-api",
        audience: "wathaeqi-client",
      }
    );
    const appwriteSessionSecret = payload.appwriteSessionSecret;
    const sessionVersion = payload.sessionVersion;
    const userId = Number(payload.sub);

    if (
      typeof appwriteSessionSecret !== "string" ||
      !appwriteSessionSecret ||
      typeof sessionVersion !== "string" ||
      !Number.isSafeInteger(userId) ||
      userId < 1
    ) {
      return null;
    }

    return { appwriteSessionSecret, sessionVersion, userId };
  } catch {
    return null;
  }
}

export async function getAppwriteAuthenticatedUserFromRequest(
  req: Request
): Promise<User | null> {
  const claims = await readSessionClaims(req);
  if (!claims) return null;

  try {
    const account = new Account(
      getAppwriteSessionClient(claims.appwriteSessionSecret)
    );
    const authUser = await account.get();
    const profile = await getAppwriteProfileByAuthUserId(authUser.$id);

    if (
      !profile ||
      authUser.status === false ||
      profile.user.id !== claims.userId ||
      profile.user.sessionVersion !== claims.sessionVersion ||
      !profile.user.isActive ||
      profile.user.loginMethod === "disabled"
    ) {
      return null;
    }

    return profile.user;
  } catch {
    return null;
  }
}

export async function deleteCurrentAppwriteSession(
  req: Request
): Promise<void> {
  const claims = await readSessionClaims(req);
  if (!claims) return;

  const account = new Account(
    getAppwriteSessionClient(claims.appwriteSessionSecret)
  );
  await account.deleteSession({ sessionId: "current" });
}

export async function createAppwriteSessionToken(
  session: AppwriteSession,
  user: Pick<User, "id" | "authUserId" | "sessionVersion">
): Promise<string> {
  const expiresAt = new Date(session.expire).getTime();
  const now = Math.floor(Date.now() / 1000);
  const tokenExpiresAt = Math.min(
    Math.floor(expiresAt / 1000),
    now + SESSION_TOKEN_TTL_SECONDS
  );
  if (!session.secret || !Number.isFinite(expiresAt) || tokenExpiresAt <= now) {
    throw new Error("Appwrite returned an invalid authentication session");
  }

  let token: string;
  try {
    token = await new EncryptJWT({
      appwriteSessionSecret: session.secret,
      sessionVersion: user.sessionVersion ?? user.authUserId,
    })
      .setProtectedHeader({ alg: "dir", enc: "A256GCM", typ: "JWT" })
      .setIssuer("wathaeqi-api")
      .setAudience("wathaeqi-client")
      .setSubject(String(user.id))
      .setIssuedAt()
      .setExpirationTime(tokenExpiresAt)
      .encrypt(getSessionTokenEncryptionKey());
  } catch (error) {
    await new Account(getAppwriteSessionClient(session.secret))
      .deleteSession({ sessionId: "current" })
      .catch(() => undefined);
    throw error;
  }

  return token;
}

export async function verifyAppwriteUserPassword(
  username: string,
  password: string
): Promise<boolean> {
  let authenticated: Awaited<ReturnType<typeof authenticateAppwriteUser>>;
  try {
    authenticated = await authenticateAppwriteUser(username, password);
  } catch (error) {
    if (error instanceof AppwritePasswordResetRequiredError) return false;
    throw error;
  }
  if (!authenticated) return false;

  try {
    await new Account(
      getAppwriteSessionClient(authenticated.session.secret)
    ).deleteSession({ sessionId: "current" });
  } catch {
    return false;
  }

  return true;
}

export class AppwriteInvalidCurrentPasswordError extends Error {
  constructor() {
    super("The current Appwrite password is invalid");
    this.name = "AppwriteInvalidCurrentPasswordError";
  }
}

export async function changeAppwritePassword(
  req: Request,
  currentPassword: string,
  newPassword: string
): Promise<{ user: User; sessionToken: string }> {
  const claims = await readSessionClaims(req);
  if (!claims) {
    throw new Error("An active Appwrite session is required");
  }

  const profile = await getAppwriteProfileById(claims.userId);
  if (
    !profile ||
    profile.user.id !== claims.userId ||
    profile.user.sessionVersion !== claims.sessionVersion ||
    !profile.user.authUserId ||
    !profile.user.email ||
    profile.user.isActive !== true
  ) {
    throw new Error("The Appwrite user profile is unavailable");
  }

  const currentAccount = new Account(
    getAppwriteSessionClient(claims.appwriteSessionSecret)
  );
  try {
    await currentAccount.updatePassword({
      password: newPassword,
      oldPassword: currentPassword,
    });
  } catch (error) {
    const appwriteError = asRecord(error);
    if (
      appwriteError?.code === 401 ||
      appwriteError?.type === "user_invalid_credentials"
    ) {
      throw new AppwriteInvalidCurrentPasswordError();
    }
    throw error;
  }

  const newSession = await new Account(
    getAppwriteAdminClient()
  ).createEmailPasswordSession({
    email: profile.user.email,
    password: newPassword,
  });

  const now = new Date();
  const sessionVersion = randomUUID();
  const updatedUser: User = {
    ...profile.user,
    sessionVersion,
    mustChangePassword: false,
    lastSignedIn: now,
    updatedAt: now,
  };

  const sessionToken = await createAppwriteSessionToken(
    newSession,
    updatedUser
  );
  try {
    await getAppwriteTablesDB().updateRow({
      databaseId: getAppwriteDatabaseId(),
      tableId: USERS_TABLE_ID,
      rowId: profile.rowId,
      data: {
        sessionVersion,
        mustChangePassword: false,
        lastSignedIn: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    });
  } catch (error) {
    await new Account(getAppwriteSessionClient(newSession.secret))
      .deleteSession({ sessionId: "current" })
      .catch(() => undefined);
    throw error;
  }

  await currentAccount
    .deleteSession({ sessionId: "current" })
    .catch(() => undefined);

  return { user: updatedUser, sessionToken };
}

export async function dismissAppwritePasswordChange(
  userId: number
): Promise<void> {
  const profile = await getAppwriteProfileById(userId);
  if (!profile) {
    throw new Error("The Appwrite user profile is unavailable");
  }

  const now = new Date().toISOString();
  await getAppwriteTablesDB().updateRow({
    databaseId: getAppwriteDatabaseId(),
    tableId: USERS_TABLE_ID,
    rowId: profile.rowId,
    data: {
      mustChangePassword: false,
      updatedAt: now,
    },
  });
}

export async function updateAppwriteUserProfile(
  userId: number,
  input: {
    name: string;
    badgeNumber: string | null;
    phone: string | null;
    rank: string | null;
    unit: string | null;
    bio: string | null;
  }
): Promise<User> {
  const profile = await getAppwriteProfileById(userId);
  if (!profile || !profile.user.isActive) {
    throw new Error("The Appwrite user profile is unavailable");
  }

  const now = new Date();
  await getAppwriteTablesDB().updateRow({
    databaseId: getAppwriteDatabaseId(),
    tableId: USERS_TABLE_ID,
    rowId: profile.rowId,
    data: {
      ...input,
      updatedAt: now.toISOString(),
    },
  });

  return {
    ...profile.user,
    ...input,
    updatedAt: now,
  };
}
