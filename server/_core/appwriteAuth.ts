import { Account, Query } from "node-appwrite";
import { parse } from "cookie";
import type { Request, Response } from "express";
import type { User } from "../../drizzle/schema";
import {
  getAppwriteDatabaseId,
  getAppwriteSessionClient,
  getAppwriteTablesDB,
} from "./appwrite";
import { ENV } from "./env";

export const APPWRITE_SESSION_COOKIE = "police_telegrams_session";
const USERS_TABLE_ID = "users";

type AppwriteSession = Awaited<
  ReturnType<Account["createEmailPasswordSession"]>
>;

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
    sessionVersion:
      asNullableString(data.sessionVersion) ?? authUserId,
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

  const profiles = await listProfiles(
    Query.equal("authUserId", authUserId)
  );
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
  const profile = await getAppwriteProfileByUsername(username);
  if (
    !profile ||
    !profile.user.isActive ||
    profile.user.loginMethod === "disabled" ||
    !profile.user.email
  ) {
    return null;
  }

  const account = new Account(getAppwriteSessionClient());
  let session: AppwriteSession;
  try {
    session = await account.createEmailPasswordSession({
      email: profile.user.email,
      password,
    });
  } catch (error) {
    const appwriteError = asRecord(error);
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

    const user = await updateLastSignedIn(profile);
    return { user, session };
  } catch (error) {
    await new Account(getAppwriteSessionClient(session.secret))
      .deleteSession({ sessionId: "current" })
      .catch(() => undefined);
    throw error;
  }
}

export async function getAppwriteAuthenticatedUserFromRequest(
  req: Request
): Promise<User | null> {
  const sessionSecret = parse(req.headers.cookie ?? "")[
    APPWRITE_SESSION_COOKIE
  ];
  if (!sessionSecret) return null;

  try {
    const account = new Account(getAppwriteSessionClient(sessionSecret));
    const authUser = await account.get();
    const profile = await getAppwriteProfileByAuthUserId(authUser.$id);

    if (
      !profile ||
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
  const sessionSecret = parse(req.headers.cookie ?? "")[
    APPWRITE_SESSION_COOKIE
  ];
  if (!sessionSecret) return;

  const account = new Account(getAppwriteSessionClient(sessionSecret));
  await account.deleteSession({ sessionId: "current" });
}

function serializeCookie(value: string, maxAge: number): string {
  const parts = [
    `${APPWRITE_SESSION_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (ENV.isProduction) parts.push("Secure");
  return parts.join("; ");
}

export function setAppwriteSessionCookie(
  res: Response,
  session: AppwriteSession
): void {
  const expiresAt = new Date(session.expire).getTime();
  const maxAge = Math.max(
    0,
    Math.floor((expiresAt - Date.now()) / 1000)
  );
  if (!session.secret || !Number.isFinite(expiresAt) || maxAge === 0) {
    throw new Error("Appwrite returned an invalid authentication session");
  }
  res.setHeader(
    "Set-Cookie",
    serializeCookie(session.secret, maxAge)
  );
}

export function clearAppwriteSessionCookie(res: Response): void {
  res.setHeader(
    "Set-Cookie",
    `${serializeCookie("", 0)}; Expires=${new Date(0).toUTCString()}`
  );
}

export async function verifyAppwriteUserPassword(
  username: string,
  password: string
): Promise<boolean> {
  const authenticated = await authenticateAppwriteUser(username, password);
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
