import { randomUUID } from "node:crypto";
import { Account, Query, Users } from "node-appwrite";
import {
  getAppwriteAdminClient,
  getAppwriteDatabaseId,
  getAppwriteSessionClient,
  getAppwriteTablesDB,
} from "../../_core/appwrite";
import { ENV } from "../../_core/env";

type User = {
  id: number;
  authUserId: string;
  sessionVersion: string;
  organizationId: string;
  name: string | null;
  username: string;
  passwordHash: null;
  badgeNumber: string | null;
  bio: string | null;
  phone: string | null;
  rank: string | null;
  unit: string | null;
  avatarKey: string | null;
  email: string;
  loginMethod: string;
  isActive: boolean;
  isPlatformOwner: boolean;
  mustChangePassword: boolean;
  role: string;
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
};

const USERS_TABLE_ID = "users";
const OWNER_SETUP_TABLE_ID = "app_records";
const OWNER_SETUP_ROW_ID = "owner-setup-consumed";
const OWNER_SETUP_RECORD_TYPE = "owner_password_setup";
const OWNER_SETUP_RECORD_KEY = "initial_owner";

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

async function isOwnerSetupAlreadyConsumed(): Promise<boolean> {
  const result = await getAppwriteTablesDB().listRows({
    databaseId: getAppwriteDatabaseId(),
    tableId: OWNER_SETUP_TABLE_ID,
    queries: [
      Query.equal("recordType", OWNER_SETUP_RECORD_TYPE),
      Query.equal("recordKey", OWNER_SETUP_RECORD_KEY),
      Query.limit(1),
    ],
    total: false,
  });
  return result.rows.length > 0;
}

async function consumeOwnerSetupOnce(owner: ExistingOwner): Promise<void> {
  const now = new Date().toISOString();
  try {
    // A fixed row ID makes the claim single-use across concurrent server instances.
    await getAppwriteTablesDB().createRow({
      databaseId: getAppwriteDatabaseId(),
      tableId: OWNER_SETUP_TABLE_ID,
      rowId: OWNER_SETUP_ROW_ID,
      data: {
        recordType: OWNER_SETUP_RECORD_TYPE,
        recordKey: OWNER_SETUP_RECORD_KEY,
        ownerId: owner.authUserId,
        organizationId:
          typeof owner.data.organizationId === "string"
            ? owner.data.organizationId
            : null,
        createdAt: now,
        updatedAt: now,
        payload: JSON.stringify({ status: "consumed" }),
      },
    });
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? Number((error as { code?: unknown }).code)
        : 0;
    if (code === 409) {
      throw new Error("تم استخدام رمز إعداد المالك مسبقًا");
    }
    throw error;
  }
}

export async function isInitialOwnerSetupAvailable(): Promise<boolean> {
  if (ENV.ownerSetupSecret.length < 32) return false;
  if (await isOwnerSetupAlreadyConsumed()) return false;
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
  const authEmail = authUser.email.trim().toLowerCase();
  const ownerEmail = owner.email.trim().toLowerCase();
  if (authEmail !== ownerEmail) {
    throw new Error("بيانات حساب المالك لا تتطابق مع حساب المصادقة المرتبط");
  }

  // Consume the recovery capability before changing credentials. A fixed Appwrite
  // row ID prevents replay and concurrent reuse across multiple function instances.
  await consumeOwnerSetupOnce(owner);

  try {
    await users.updatePassword({
      userId: owner.authUserId,
      password: input.password,
    });
  } catch (error) {
    // A rejected password must not permanently consume the one-time setup path.
    await getAppwriteTablesDB()
      .deleteRow({
        databaseId: getAppwriteDatabaseId(),
        tableId: OWNER_SETUP_TABLE_ID,
        rowId: OWNER_SETUP_ROW_ID,
      })
      .catch(() => undefined);
    throw error;
  }

  // Use the server API-key client so Appwrite includes the session secret for the secure cookie.
  const sessionAccount = new Account(getAppwriteAdminClient());
  const session = await sessionAccount.createEmailPasswordSession({
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
    badgeNumber: typeof data.badgeNumber === "string" ? data.badgeNumber : null,
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
