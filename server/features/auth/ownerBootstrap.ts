import { randomUUID } from "node:crypto";
import { Account, Query, Users } from "node-appwrite";
import type { User } from "../../../drizzle/schema";
import {
  getAppwriteAdminClient,
  getAppwriteDatabaseId,
  getAppwriteTablesDB,
} from "../../_core/appwrite";
import { ENV } from "../../_core/env";

const USERS_TABLE_ID = "users";

type AppwriteRow = {
  $id: string;
  data?: Record<string, unknown>;
} & Record<string, unknown>;

type ExistingOwner = {
  rowId: string;
  authUserId: string;
  username: string;
  email: string;
  data: Record<string, unknown>;
};

function rowData(row: AppwriteRow): Record<string, unknown> {
  return row.data ?? row;
}

async function getExistingOwner(): Promise<ExistingOwner | null> {
  const result = await getAppwriteTablesDB().listRows({
    databaseId: getAppwriteDatabaseId(),
    tableId: USERS_TABLE_ID,
    queries: [Query.equal("isPlatformOwner", true), Query.limit(2)],
    total: true,
  });

  if (result.rows.length !== 1) return null;
  const row = result.rows[0] as AppwriteRow;
  const data = rowData(row);
  const authUserId = data.authUserId;
  const username = data.username;
  const email = data.email;

  if (
    data.isActive !== true ||
    data.role !== "admin" ||
    typeof authUserId !== "string" ||
    !authUserId ||
    typeof username !== "string" ||
    !username.trim() ||
    typeof email !== "string" ||
    !email.trim()
  ) {
    return null;
  }

  return { rowId: row.$id, authUserId, username, email, data };
}

export async function isInitialOwnerSetupAvailable(): Promise<boolean> {
  if (ENV.ownerSetupSecret.length < 32) return false;
  return (await getExistingOwner()) !== null;
}

export async function createInitialOwnerProfile(input: {
  username: string;
  password: string;
}): Promise<{
  user: User;
  session: Awaited<ReturnType<Account["createEmailPasswordSession"]>>;
}> {
  if (ENV.ownerSetupSecret.length < 32) {
    throw new Error("إعداد إعادة تعيين كلمة مرور المالك غير مكتمل");
  }

  const owner = await getExistingOwner();
  if (!owner || owner.username.trim() !== input.username.trim()) {
    throw new Error("حساب المالك غير متاح لإعادة تعيين كلمة المرور");
  }

  const users = new Users(getAppwriteAdminClient());
  const authUser = await users.get({ userId: owner.authUserId });
  if (
    authUser.email.trim().toLowerCase() !== owner.email.trim().toLowerCase()
  ) {
    throw new Error("بيانات حساب المالك لا تتطابق مع حساب المصادقة المرتبط");
  }

  await users.updatePassword({
    userId: owner.authUserId,
    password: input.password,
  });

  const session = await new Account(
    getAppwriteAdminClient()
  ).createEmailPasswordSession({
    email: owner.email,
    password: input.password,
  });

  const now = new Date().toISOString();
  const sessionVersion = randomUUID();
  await getAppwriteTablesDB().updateRow({
    databaseId: getAppwriteDatabaseId(),
    tableId: USERS_TABLE_ID,
    rowId: owner.rowId,
    data: {
      mustChangePassword: false,
      sessionVersion,
      updatedAt: now,
    },
  });

  const data = owner.data;
  const asDate = (value: unknown) => {
    const date = new Date(String(value ?? now));
    return Number.isFinite(date.getTime()) ? date : new Date(now);
  };

  const user: User = {
    id: Number(data.id),
    authUserId: owner.authUserId,
    sessionVersion,
    organizationId: String(data.organizationId),
    name: typeof data.name === "string" ? data.name : null,
    username: owner.username,
    passwordHash: null,
    badgeNumber:
      typeof data.badgeNumber === "string" ? data.badgeNumber : null,
    bio: typeof data.bio === "string" ? data.bio : null,
    phone: typeof data.phone === "string" ? data.phone : null,
    rank: typeof data.rank === "string" ? data.rank : null,
    unit: typeof data.unit === "string" ? data.unit : null,
    avatarKey: typeof data.avatarKey === "string" ? data.avatarKey : null,
    email: owner.email,
    loginMethod:
      typeof data.loginMethod === "string" ? data.loginMethod : "appwrite",
    isActive: true,
    isPlatformOwner: true,
    mustChangePassword: false,
    role: "admin",
    createdAt: asDate(data.createdAt),
    updatedAt: new Date(now),
    lastSignedIn: new Date(now),
  };
  return { user, session };
}
