import { randomInt, randomUUID } from "node:crypto";
import { Query } from "node-appwrite";
import {
  getAppwriteDatabaseId,
  getAppwriteTablesDB,
  getAppwriteUsers,
} from "../../_core/appwrite";

const USERS_TABLE = "users";
const MEMBERSHIPS_TABLE = "organization_memberships";

export type ManagedUser = {
  id: number;
  authUserId: string;
  name: string | null;
  username: string | null;
  email: string | null;
  organizationId: string;
  organizationName: string | null;
  role: "user" | "admin";
  membershipRole: string | null;
  rank: string | null;
  badgeNumber: string | null;
  phone: string | null;
  unit: string | null;
  bio: string | null;
  isActive: boolean;
  isPlatformOwner: boolean;
  mustChangePassword: boolean;
  lastSignedIn: string | null;
  createdAt: string | null;
};

type AppwriteRow = Record<string, unknown> & { $id: string };

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asIso(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function errorCode(error: unknown): number {
  return error && typeof error === "object" && "code" in error
    ? Number((error as { code?: unknown }).code)
    : 0;
}

function mapUserRow(
  row: AppwriteRow,
  membershipRole: string | null,
  organizationName: string | null
): ManagedUser {
  return {
    id: Number(row.id),
    authUserId: asString(row.authUserId),
    name: asNullableString(row.name),
    username: asNullableString(row.username),
    email: asNullableString(row.email),
    organizationId: asString(row.organizationId),
    organizationName,
    role: row.role === "admin" ? "admin" : "user",
    membershipRole,
    rank: asNullableString(row.rank),
    badgeNumber: asNullableString(row.badgeNumber),
    phone: asNullableString(row.phone),
    unit: asNullableString(row.unit),
    bio: asNullableString(row.bio),
    isActive: row.isActive === true,
    isPlatformOwner: row.isPlatformOwner === true,
    mustChangePassword: row.mustChangePassword === true,
    lastSignedIn: asIso(row.lastSignedIn),
    createdAt: asIso(row.createdAt),
  };
}

async function loadOrganizationNames(): Promise<Map<string, string>> {
  const result = await getAppwriteTablesDB().listRows({
    databaseId: getAppwriteDatabaseId(),
    tableId: "organizations",
    queries: [Query.limit(500)],
    total: false,
  });
  return new Map(
    (result.rows as AppwriteRow[]).map(row => [
      asString(row.id),
      asString(row.name, "جهة بدون اسم"),
    ])
  );
}

async function loadMembershipRoles(): Promise<Map<number, string>> {
  const result = await getAppwriteTablesDB().listRows({
    databaseId: getAppwriteDatabaseId(),
    tableId: MEMBERSHIPS_TABLE,
    queries: [Query.equal("isActive", true), Query.limit(1000)],
    total: false,
  });
  const roles = new Map<number, string>();
  for (const row of result.rows as AppwriteRow[]) {
    const userId = Number(row.userId);
    if (Number.isFinite(userId)) roles.set(userId, asString(row.role));
  }
  return roles;
}

export async function listManagedUsers(): Promise<ManagedUser[]> {
  const [result, organizationNames, membershipRoles] = await Promise.all([
    getAppwriteTablesDB().listRows({
      databaseId: getAppwriteDatabaseId(),
      tableId: USERS_TABLE,
      queries: [Query.orderAsc("name"), Query.limit(500)],
      total: false,
    }),
    loadOrganizationNames(),
    loadMembershipRoles(),
  ]);
  return (result.rows as AppwriteRow[])
    .map(row =>
      mapUserRow(
        row,
        membershipRoles.get(Number(row.id)) ?? null,
        organizationNames.get(asString(row.organizationId)) ?? null
      )
    )
    .sort((left, right) => left.id - right.id);
}

export async function getManagedUser(id: number): Promise<ManagedUser | null> {
  const result = await getAppwriteTablesDB().listRows({
    databaseId: getAppwriteDatabaseId(),
    tableId: USERS_TABLE,
    queries: [Query.equal("id", id), Query.limit(2)],
    total: false,
  });
  const rows = result.rows as AppwriteRow[];
  if (rows.length > 1) throw new Error("Appwrite returned duplicate user IDs");
  if (!rows[0]) return null;
  const [organizationNames, membershipRoles] = await Promise.all([
    loadOrganizationNames(),
    loadMembershipRoles(),
  ]);
  return mapUserRow(
    rows[0],
    membershipRoles.get(id) ?? null,
    organizationNames.get(asString(rows[0].organizationId)) ?? null
  );
}

async function findUserRow(id: number): Promise<AppwriteRow | null> {
  const result = await getAppwriteTablesDB().listRows({
    databaseId: getAppwriteDatabaseId(),
    tableId: USERS_TABLE,
    queries: [Query.equal("id", id), Query.limit(2)],
    total: false,
  });
  const rows = result.rows as AppwriteRow[];
  if (rows.length > 1) throw new Error("Appwrite returned duplicate user IDs");
  return rows[0] ?? null;
}

export async function createManagedUser(input: {
  name: string;
  username: string;
  email: string;
  password: string;
  organizationId: string;
  role: "user" | "admin";
  membershipRole: string;
  rank: string | null;
  badgeNumber: string | null;
  phone: string | null;
  unit: string | null;
  mustChangePassword: boolean;
}): Promise<ManagedUser> {
  const tables = getAppwriteTablesDB();
  const databaseId = getAppwriteDatabaseId();

  const organization = await tables.listRows({
    databaseId,
    tableId: "organizations",
    queries: [
      Query.equal("id", input.organizationId),
      Query.equal("isActive", true),
      Query.limit(1),
    ],
    total: false,
  });
  if (!organization.rows.length) {
    throw new Error("اختر جهة نشطة وصالحة");
  }
  const duplicate = await tables.listRows({
    databaseId,
    tableId: USERS_TABLE,
    queries: [Query.equal("username", input.username), Query.limit(1)],
    total: false,
  });
  if (duplicate.rows.length) {
    throw new Error("اسم المستخدم مستخدم مسبقاً");
  }

  const authUsers = getAppwriteUsers();
  const authUserId = randomUUID();
  await authUsers.create({
    userId: authUserId,
    email: input.email,
    password: input.password,
    name: input.name,
  });

  const profileId = randomInt(1, 2_147_483_647);
  const now = new Date().toISOString();
  let profileRowId: string | null = null;
  try {
    const profile = await tables.createRow({
      databaseId,
      tableId: USERS_TABLE,
      rowId: randomUUID(),
      data: {
        id: profileId,
        authUserId,
        sessionVersion: randomUUID(),
        organizationId: input.organizationId,
        name: input.name,
        username: input.username,
        badgeNumber: input.badgeNumber,
        bio: null,
        phone: input.phone,
        rank: input.rank,
        unit: input.unit,
        avatarKey: null,
        email: input.email,
        loginMethod: "appwrite",
        isActive: true,
        isPlatformOwner: false,
        mustChangePassword: input.mustChangePassword,
        role: input.role,
        createdAt: now,
        updatedAt: now,
        lastSignedIn: now,
      },
    });
    profileRowId = (profile as AppwriteRow).$id;
    await tables.createRow({
      databaseId,
      tableId: MEMBERSHIPS_TABLE,
      rowId: randomUUID(),
      data: {
        id: randomInt(1, 2_147_483_647),
        organizationId: input.organizationId,
        userId: profileId,
        role: input.membershipRole,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    });
  } catch (error) {
    if (profileRowId) {
      await tables
        .deleteRow({ databaseId, tableId: USERS_TABLE, rowId: profileRowId })
        .catch(() => undefined);
    }
    await authUsers.delete({ userId: authUserId }).catch(() => undefined);
    throw error;
  }

  const created = await getManagedUser(profileId);
  if (!created) throw new Error("تعذر تحميل الحساب بعد إنشائه");
  return created;
}

export async function updateManagedUser(
  id: number,
  input: {
    name: string;
    username: string;
    email: string;
    organizationId: string;
    role: "user" | "admin";
    membershipRole: string;
    rank: string | null;
    badgeNumber: string | null;
    phone: string | null;
    unit: string | null;
    bio: string | null;
  }
): Promise<ManagedUser> {
  const tables = getAppwriteTablesDB();
  const databaseId = getAppwriteDatabaseId();
  const row = await findUserRow(id);
  if (!row) throw new Error("حساب المستخدم غير موجود");

  const duplicate = await tables.listRows({
    databaseId,
    tableId: USERS_TABLE,
    queries: [Query.equal("username", input.username), Query.limit(2)],
    total: false,
  });
  if ((duplicate.rows as AppwriteRow[]).some(item => item.$id !== row.$id)) {
    throw new Error("اسم المستخدم مستخدم مسبقاً");
  }

  const currentEmail = asNullableString(row.email);
  if (currentEmail !== input.email) {
    const authUserId = asString(row.authUserId);
    if (!authUserId) throw new Error("حساب Appwrite المرتبط غير موجود");
    await getAppwriteUsers().updateEmail({
      userId: authUserId,
      email: input.email,
    });
  }

  const now = new Date().toISOString();
  await tables.updateRow({
    databaseId,
    tableId: USERS_TABLE,
    rowId: row.$id,
    data: {
      name: input.name,
      username: input.username,
      email: input.email,
      organizationId: input.organizationId,
      role: input.role,
      rank: input.rank,
      badgeNumber: input.badgeNumber,
      phone: input.phone,
      unit: input.unit,
      bio: input.bio,
      updatedAt: now,
    },
  });

  const memberships = await tables.listRows({
    databaseId,
    tableId: MEMBERSHIPS_TABLE,
    queries: [Query.equal("userId", id), Query.limit(50)],
    total: false,
  });
  const membershipRows = memberships.rows as AppwriteRow[];
  const homeMembership = membershipRows.find(
    item => asString(item.organizationId) === input.organizationId
  );
  if (homeMembership) {
    await tables.updateRow({
      databaseId,
      tableId: MEMBERSHIPS_TABLE,
      rowId: homeMembership.$id,
      data: { role: input.membershipRole, isActive: true, updatedAt: now },
    });
  } else {
    await tables.createRow({
      databaseId,
      tableId: MEMBERSHIPS_TABLE,
      rowId: randomUUID(),
      data: {
        id: randomInt(1, 2_147_483_647),
        organizationId: input.organizationId,
        userId: id,
        role: input.membershipRole,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  const updated = await getManagedUser(id);
  if (!updated) throw new Error("تعذر تحميل الحساب بعد تحديثه");
  return updated;
}

export async function setManagedUserActive(
  id: number,
  isActive: boolean,
  actingUser: { id: number; authUserId: string }
): Promise<void> {
  const row = await findUserRow(id);
  if (!row) throw new Error("حساب المستخدم غير موجود");
  if (
    row.isPlatformOwner === true ||
    asString(row.authUserId) === actingUser.authUserId
  ) {
    throw new Error("لا يمكن إيقاف حساب مالك المنصة");
  }
  const authUserId = asString(row.authUserId);
  if (!authUserId) throw new Error("حساب Appwrite المرتبط غير موجود");

  await getAppwriteUsers().updateStatus({
    userId: authUserId,
    status: isActive,
  });
  const now = new Date().toISOString();
  await getAppwriteTablesDB().updateRow({
    databaseId: getAppwriteDatabaseId(),
    tableId: USERS_TABLE,
    rowId: row.$id,
    data: { isActive, updatedAt: now },
  });
  const memberships = await getAppwriteTablesDB().listRows({
    databaseId: getAppwriteDatabaseId(),
    tableId: MEMBERSHIPS_TABLE,
    queries: [Query.equal("userId", id), Query.limit(100)],
    total: false,
  });
  await Promise.all(
    (memberships.rows as AppwriteRow[]).map(item =>
      getAppwriteTablesDB().updateRow({
        databaseId: getAppwriteDatabaseId(),
        tableId: MEMBERSHIPS_TABLE,
        rowId: item.$id,
        data: { isActive, updatedAt: now },
      })
    )
  );
}

export async function deleteManagedUser(
  id: number,
  actingUser: { id: number; authUserId: string }
): Promise<void> {
  const row = await findUserRow(id);
  if (!row) throw new Error("حساب المستخدم غير موجود");
  if (
    row.isPlatformOwner === true ||
    asString(row.authUserId) === actingUser.authUserId ||
    id === actingUser.id
  ) {
    throw new Error("لا يمكن حذف حساب مالك المنصة أو حسابك الحالي");
  }
  const authUserId = asString(row.authUserId);
  const tables = getAppwriteTablesDB();
  const databaseId = getAppwriteDatabaseId();

  const memberships = await tables.listRows({
    databaseId,
    tableId: MEMBERSHIPS_TABLE,
    queries: [Query.equal("userId", id), Query.limit(100)],
    total: false,
  });
  for (const membership of memberships.rows as AppwriteRow[]) {
    await tables.deleteRow({
      databaseId,
      tableId: MEMBERSHIPS_TABLE,
      rowId: membership.$id,
    });
  }
  await tables.deleteRow({ databaseId, tableId: USERS_TABLE, rowId: row.$id });
  if (authUserId) {
    try {
      await getAppwriteUsers().delete({ userId: authUserId });
    } catch (error) {
      if (errorCode(error) !== 404) throw error;
    }
  }
}
