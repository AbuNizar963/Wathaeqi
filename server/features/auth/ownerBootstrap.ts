import { randomUUID } from "node:crypto";
import { ID, Query, Users } from "node-appwrite";
import type { User } from "../../../drizzle/schema";
import {
  getAppwriteAdminClient,
  getAppwriteDatabaseId,
  getAppwriteTablesDB,
} from "../../_core/appwrite";
import { ENV } from "../../_core/env";
import { getPrimaryOrganization } from "../organizations/organization";

const USERS_TABLE_ID = "users";
const MEMBERSHIPS_TABLE_ID = "organization_memberships";
const OWNER_PROFILE_ROW_ID = "platform-owner";
const OWNER_MEMBERSHIP_ROW_ID = "platform-owner-membership";

async function getNextNumericId(tableId: string): Promise<number> {
  const result = await getAppwriteTablesDB().listRows({
    databaseId: getAppwriteDatabaseId(),
    tableId,
    queries: [Query.orderDesc("id"), Query.limit(1)],
    total: false,
  });
  const first = result.rows[0] as AppwriteRow | undefined;
  const data = first?.data ?? first ?? {};
  const currentId = Number(data.id ?? 0);
  if (
    !Number.isSafeInteger(currentId) ||
    currentId < 0 ||
    currentId >= 2_147_483_647
  ) {
    throw new Error("تعذر تخصيص رقم مستخدم آمن في قاعدة Appwrite");
  }
  return currentId + 1;
}

type AppwriteRow = {
  $id: string;
  data?: Record<string, unknown>;
} & Record<string, unknown>;

export async function hasPlatformOwner(): Promise<boolean> {
  const result = await getAppwriteTablesDB().listRows({
    databaseId: getAppwriteDatabaseId(),
    tableId: USERS_TABLE_ID,
    queries: [Query.equal("isPlatformOwner", true), Query.limit(1)],
    total: true,
  });
  return result.total > 0 || result.rows.length > 0;
}

export async function isInitialOwnerSetupAvailable(): Promise<boolean> {
  if (ENV.ownerSetupSecret.length < 32) return false;
  return !(await hasPlatformOwner());
}

export async function createInitialOwnerProfile(input: {
  name: string;
  username: string;
  email: string;
  password: string;
}): Promise<User> {
  if (ENV.ownerSetupSecret.length < 32) {
    throw new Error("إعداد إنشاء المالك الأول غير مكتمل على الخادم");
  }
  if (await hasPlatformOwner()) {
    throw new Error("تم إنشاء مالك النظام مسبقاً");
  }

  const organization = await getPrimaryOrganization();
  const now = new Date().toISOString();
  const tables = getAppwriteTablesDB();
  const databaseId = getAppwriteDatabaseId();
  const userId = await getNextNumericId(USERS_TABLE_ID);
  const membershipId = await getNextNumericId(MEMBERSHIPS_TABLE_ID);
  const sessionVersion = randomUUID();
  const users = new Users(getAppwriteAdminClient());
  const authUser = await users.create({
    userId: ID.unique(),
    email: input.email.trim().toLowerCase(),
    password: input.password,
    name: input.name.trim(),
  });

  let profileCreated = false;
  let membershipCreated = false;
  const profileRowId = OWNER_PROFILE_ROW_ID;

  try {
    await tables.createRow({
      databaseId,
      tableId: USERS_TABLE_ID,
      rowId: profileRowId,
      data: {
        id: userId,
        authUserId: authUser.$id,
        sessionVersion,
        organizationId: organization.id,
        organization: organization.id,
        name: input.name.trim(),
        username: input.username.trim(),
        email: input.email.trim().toLowerCase(),
        loginMethod: "appwrite",
        isActive: true,
        isPlatformOwner: true,
        mustChangePassword: false,
        role: "admin",
        createdAt: now,
        updatedAt: now,
        lastSignedIn: now,
      },
    });
    profileCreated = true;

    await tables.createRow({
      databaseId,
      tableId: MEMBERSHIPS_TABLE_ID,
      rowId: OWNER_MEMBERSHIP_ROW_ID,
      data: {
        id: membershipId,
        organizationId: organization.id,
        organization: organization.id,
        userId,
        user: profileRowId,
        role: "system_admin",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    });
    membershipCreated = true;
  } catch (error) {
    if (membershipCreated) {
      await tables
        .deleteRow({
          databaseId,
          tableId: MEMBERSHIPS_TABLE_ID,
          rowId: OWNER_MEMBERSHIP_ROW_ID,
        })
        .catch(() => undefined);
    }
    if (profileCreated) {
      await tables
        .deleteRow({
          databaseId,
          tableId: USERS_TABLE_ID,
          rowId: profileRowId,
        })
        .catch(() => undefined);
    }
    await users.delete({ userId: authUser.$id }).catch(() => undefined);
    throw error;
  }

  return {
    id: userId,
    authUserId: authUser.$id,
    sessionVersion,
    organizationId: organization.id,
    name: input.name.trim(),
    username: input.username.trim(),
    passwordHash: null,
    badgeNumber: null,
    bio: null,
    phone: null,
    rank: null,
    unit: null,
    avatarKey: null,
    email: input.email.trim().toLowerCase(),
    loginMethod: "appwrite",
    isActive: true,
    isPlatformOwner: true,
    mustChangePassword: false,
    role: "admin",
    createdAt: new Date(now),
    updatedAt: new Date(now),
    lastSignedIn: new Date(now),
  };
}
